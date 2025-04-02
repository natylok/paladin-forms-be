import { Injectable, Logger } from '@nestjs/common';
import { Feedback } from '../feedback.schema';
import { spawn } from 'child_process';
import { SurveyComponentType } from '@natylok/paladin-forms-common';
import { RedisClientType } from 'redis';
import { Inject } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class FeedbackQuestionService {
    private readonly logger = new Logger(FeedbackQuestionService.name);
    private pythonProcess: any;
    private isInitialized: boolean = false;
    private readonly CACHE_TTL = 3600; // 1 hour cache for question results
    private initializationAttempts: number = 0;
    private readonly MAX_INITIALIZATION_ATTEMPTS = 3;
    private readonly MODEL_INITIALIZATION_TIMEOUT = 30000; // 30 seconds

    constructor(
        @Inject('REDIS_CLIENT') private readonly redis: RedisClientType
    ) {
        // Don't initialize immediately - wait for first request
        // This prevents the service from crashing on startup if the model fails to load
    }

    private async initializeModel() {
        try {
            if (this.isInitialized) {
                return;
            }

            this.initializationAttempts++;
            this.logger.log(`Starting BART model initialization (attempt ${this.initializationAttempts})...`);
            
            // Check if model_loader.py exists
            const modelLoaderPath = path.resolve(process.cwd(), 'model_loader.py');
            if (!fs.existsSync(modelLoaderPath)) {
                this.logger.error(`Model loader script not found at ${modelLoaderPath}`);
                throw new Error('Model loader script not found');
            }
            
            // Start the Python process
            this.pythonProcess = spawn('python3', ['model_loader.py'], {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            // Handle Python process errors and output
            this.pythonProcess.stderr.on('data', (data) => {
                this.logger.log(`Python Model Output: ${data.toString().trim()}`);
            });

            this.pythonProcess.stdout.on('data', (data) => {
                this.logger.debug(`Python stdout: ${data.toString().trim()}`);
            });

            this.pythonProcess.on('error', (error) => {
                this.logger.error('Failed to start Python process', error);
                this.isInitialized = false;
                throw error;
            });

            this.pythonProcess.on('exit', (code, signal) => {
                if (code !== 0) {
                    this.logger.error(`Python process exited with code ${code}, signal ${signal}`);
                    this.isInitialized = false;
                }
            });

            // Wait for model to be ready
            await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => {
                    this.pythonProcess.stdout.removeListener('data', handleOutput);
                    reject(new Error('Model initialization timeout'));
                }, this.MODEL_INITIALIZATION_TIMEOUT);

                const handleOutput = (data: Buffer) => {
                    const output = data.toString().trim();
                    this.logger.debug(`Checking output: ${output}`);
                    
                    // Check for any of these success indicators
                    if (output.includes('Model loaded successfully') || 
                        output.includes('Model is ready') || 
                        output.includes('BART model initialized')) {
                        clearTimeout(timeout);
                        this.pythonProcess.stdout.removeListener('data', handleOutput);
                        resolve();
                    }
                };

                this.pythonProcess.stdout.on('data', handleOutput);
            });

            this.isInitialized = true;
            this.logger.log('BART model service initialized');
            
        } catch (error) {
            this.logger.error('Failed to initialize BART model', {
                error: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined
            });
            
            // If we haven't exceeded max attempts, we'll try again on the next request
            if (this.initializationAttempts < this.MAX_INITIALIZATION_ATTEMPTS) {
                this.logger.log(`Will retry initialization on next request (attempt ${this.initializationAttempts}/${this.MAX_INITIALIZATION_ATTEMPTS})`);
                this.isInitialized = false;
            } else {
                this.logger.error(`Failed to initialize model after ${this.MAX_INITIALIZATION_ATTEMPTS} attempts`);
                throw new Error(`Failed to initialize model after ${this.MAX_INITIALIZATION_ATTEMPTS} attempts`);
            }
        }
    }

    async getQuestionFeedbacks(feedbacks: Feedback[], prompt: string): Promise<any[]> {
        try {
            // Try to initialize the model if not already initialized
            if (!this.isInitialized || !this.pythonProcess) {
                await this.initializeModel();
            }

            // If still not initialized after attempts, return a fallback response
            if (!this.isInitialized || !this.pythonProcess) {
                this.logger.warn('Model not initialized, returning fallback response');
                return [{
                    question: prompt,
                    answer: "I'm sorry, but the AI model is currently unavailable. Please try again later."
                }];
            }

            // Check cache first
            const cacheKey = `question:${this.generateCacheKey(feedbacks, prompt)}`;
            const cachedResult = await this.redis.get(cacheKey);
            
            if (cachedResult) {
                this.logger.debug('Using cached question result');
                return JSON.parse(cachedResult);
            }

            // Prepare the context from feedbacks - limit to most recent 20 feedbacks for performance
            const recentFeedbacks = feedbacks.slice(-20);
            const context = this.prepareContext(recentFeedbacks);
            
            return new Promise((resolve, reject) => {
                let responseData = '';
                let timeoutId: NodeJS.Timeout;

                const cleanup = () => {
                    if (timeoutId) clearTimeout(timeoutId);
                    this.pythonProcess.stdout.removeListener('data', handleOutput);
                };

                const handleOutput = (data: Buffer) => {
                    responseData += data.toString();
                    try {
                        const result = JSON.parse(responseData);
                        cleanup();
                        
                        // Cache the result
                        this.redis.setEx(cacheKey, this.CACHE_TTL, JSON.stringify(result))
                            .catch(err => this.logger.error('Failed to cache question result', err));
                        
                        resolve(result);
                    } catch (e) {
                        // Incomplete JSON, continue collecting data
                    }
                };

                this.pythonProcess.stdout.on('data', handleOutput);

                timeoutId = setTimeout(() => {
                    cleanup();
                    reject(new Error('Question answering timeout'));
                }, 10000); // 10 seconds timeout

                // Send the request to the Python process
                const request = {
                    context,
                    question: prompt
                };

                this.pythonProcess.stdin.write(JSON.stringify(request) + '\n');
            });
        } catch (error) {
            this.logger.error('Failed to get question feedbacks', {
                error: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined
            });
            
            // Return a fallback response instead of throwing an error
            return [{
                question: prompt,
                answer: "I'm sorry, but I couldn't process your question at this time. Please try again later."
            }];
        }
    }

    private generateCacheKey(feedbacks: Feedback[], prompt: string): string {
        // Create a hash of the feedback IDs and prompt for caching
        const feedbackIds = feedbacks.map(f => f._id.toString()).join(',');
        return `${feedbackIds}:${prompt}`;
    }

    private prepareContext(feedbacks: Feedback[]): string {
        const contextParts: string[] = [];

        feedbacks.forEach((feedback, index) => {
            const feedbackResponses: string[] = [];

            if (feedback.responses) {
                if (feedback.responses instanceof Map) {
                    Array.from(feedback.responses.entries()).forEach(([_, response]) => {
                        if (response && response.value) {
                            const questionText = response.title || 'Question';
                            const answerText = response.value.toString();
                            feedbackResponses.push(`${questionText}: ${answerText}`);
                        }
                    });
                } else {
                    Object.entries(feedback.responses).forEach(([_, response]) => {
                        if (response && response.value) {
                            const questionText = response.title || 'Question';
                            const answerText = response.value.toString();
                            feedbackResponses.push(`${questionText}: ${answerText}`);
                        }
                    });
                }
            }

            if (feedbackResponses.length > 0) {
                contextParts.push(`Feedback ${index + 1}:\n${feedbackResponses.join('\n')}`);
            }
        });

        return contextParts.join('\n\n');
    }
}
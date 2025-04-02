import { Injectable, Logger } from '@nestjs/common';
import { Feedback } from '../feedback.schema';
import { spawn } from 'child_process';
import { SurveyComponentType } from '@natylok/paladin-forms-common';

@Injectable()
export class FeedbackQuestionService {
    private readonly logger = new Logger(FeedbackQuestionService.name);
    private pythonProcess: any;
    private isInitialized: boolean = false;

    constructor() {
        this.initializeModel();
    }

    private async initializeModel() {
        try {
            if (this.isInitialized) {
                return;
            }

            this.logger.log('Starting BART model initialization...');
            
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

            this.isInitialized = true;
            this.logger.log('BART model service initialized');
            
        } catch (error) {
            this.logger.error('Failed to initialize BART model', {
                error: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined
            });
            throw error;
        }
    }

    async getQuestionFeedbacks(feedbacks: Feedback[], prompt: string): Promise<any[]> {
        try {
            if (!this.isInitialized || !this.pythonProcess) {
                await this.initializeModel();
            }

            // Prepare the context from feedbacks
            const context = this.prepareContext(feedbacks);
            
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
                        resolve(result);
                    } catch (e) {
                        // Incomplete JSON, continue collecting data
                    }
                };

                this.pythonProcess.stdout.on('data', handleOutput);

                timeoutId = setTimeout(() => {
                    cleanup();
                    reject(new Error('Question answering timeout'));
                }, 30000); // 30 seconds timeout

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
            throw error;
        }
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
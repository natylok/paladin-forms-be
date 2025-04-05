import { Injectable, Logger } from '@nestjs/common';
import { Feedback, FeedbackResponse } from '../feedback.schema';
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

    async getQuestionFeedbacks(feedbacks: FeedbackResponse[], prompt: string): Promise<any[]> {
        try {
            // If still not initialized after attempts, return a fallback response
            if (!this.isInitialized || !this.pythonProcess) {
                this.logger.warn('Model not initialized, returning fallback response');
                return [{
                    question: prompt,
                    answer: "I'm sorry, but the AI model is currently unavailable. Please try again later."
                }];
            }


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
                }, 25000); // 10 seconds timeout

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

    private prepareContext(feedbacks: FeedbackResponse[]): string {
        const contextParts: string[] = [];

        feedbacks.forEach(response => {
            const questionText = response.title || 'Question';
            const answerText = response.value.toString();
            contextParts.push(`${questionText}: ${answerText}`);
        });

        return contextParts.join('\n\n');
    }
}
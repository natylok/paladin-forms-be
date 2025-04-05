import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import { SentimentResult } from '../types/feedback.types';
import { pipeline } from '@xenova/transformers';

@Injectable()
export class SentimentService {
    private readonly logger = new Logger(SentimentService.name);
    private pythonProcess: any;
    private isInitialized: boolean = false;
    private classifier: any;
    private readonly MODEL_NAME = 'Xenova/distilbert-base-uncased-finetuned-sst-2-english';

    constructor() {
        this.initializeModel();
    }

    private async initializeModel() {
        try {

            this.classifier = await pipeline('sentiment-analysis', this.MODEL_NAME);
            
            this.isInitialized = true;
            // Start the Python process
            this.pythonProcess = spawn('python3', ['model_loader.py'], {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            // Handle process errors
            this.pythonProcess.on('error', (error) => {
                this.logger.error('Python process error', {
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
                this.isInitialized = false;
            });

            // Handle process exit
            this.pythonProcess.on('exit', (code) => {
                this.logger.error('Python process exited', { code });
                this.isInitialized = false;
            });

            // Wait for the model to be ready
            await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Model initialization timeout'));
                }, 70000); // 30 seconds timeout

                const handleStderr = (data) => {
                    const message = data.toString();
                    if (message.includes('Model loaded and ready for processing')) {
                        clearTimeout(timeout);
                        this.pythonProcess.stderr.removeListener('data', handleStderr);
                        this.isInitialized = true;
                        resolve();
                    }
                };

                this.pythonProcess.stderr.on('data', handleStderr);
            });

            this.logger.log('Sentiment analysis model loaded successfully', {
                modelName: this.MODEL_NAME
            });
        } catch (error) {
            this.logger.error('Failed to load sentiment analysis model', {
                error: error instanceof Error ? error.message : 'Unknown error',
                modelName: this.MODEL_NAME
            });
            throw error;
        }
    }

    private async sendRequest(request: any): Promise<any> {
        if (!this.isInitialized) {
            await this.initializeModel();
        }

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Request timeout'));
            }, 30000); // 30 seconds timeout

            const handleData = (data) => {
                try {
                    const response = JSON.parse(data.toString());
                    clearTimeout(timeout);
                    this.pythonProcess.stdout.removeListener('data', handleData);
                    resolve(response);
                } catch (error) {
                    clearTimeout(timeout);
                    this.pythonProcess.stdout.removeListener('data', handleData);
                    reject(error);
                }
            };

            this.pythonProcess.stdout.on('data', handleData);
            this.pythonProcess.stdin.write(JSON.stringify(request) + '\n');
        });
    }

    async analyzeSentiment(text: string): Promise<SentimentResult> {
        try {
             // Wait for model to be initialized
             if (!this.isInitialized) {
                await this.initializeModel();
            }

            const result = await this.classifier(text);
            
            // Convert label to our format (positive, negative, neutral)
            let normalizedLabel: string;
            // This model uses POSITIVE/NEGATIVE labels
            if (result[0].label === 'POSITIVE') {
                normalizedLabel = 'positive';
            } else {
                normalizedLabel = 'negative';
            }

            return { 
                label: normalizedLabel, 
                score: result[0].score
            }
        } catch (error) {
            this.logger.error('Error in sentiment analysis', {
                error: error instanceof Error ? error.message : 'Unknown error',
                text
            });
            throw error;
        }
    }

    async extractTrendingSentences(feedbacks: Record<string, string>): Promise<string[]> {
        try {
            this.logger.log('Extracting trending sentences', { feedbacks });
            const result = await this.sendRequest({
                feedbacks,
                action: 'extract_trending_sentences'
            });

            return result.sentences || [];
        } catch (error) {
            this.logger.error('Error extracting trending sentences', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    }

    onModuleDestroy() {
        if (this.pythonProcess) {
            this.pythonProcess.kill();
        }
    }
} 
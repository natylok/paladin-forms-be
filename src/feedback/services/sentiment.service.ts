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

    private async sendRequest(request: any): Promise<any> {
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

    onModuleDestroy() {
        if (this.pythonProcess) {
            this.pythonProcess.kill();
        }
    }

    private cleanup() {
        if (this.pythonProcess) {
            this.pythonProcess.kill();
            this.pythonProcess = null;
            this.isInitialized = false;
        }
    }
} 
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

    private async initializeModel(): Promise<void> {
        if (this.pythonProcess) {
            return;
        }

        this.pythonProcess = spawn('python3', ['model_loader.py'], {
            stdio: ['pipe', 'pipe', 'pipe']
        });

        // Handle stderr output
        this.pythonProcess.stderr.on('data', (data) => {
            console.log(`Python Model Output: ${data}`);
        });

        // Handle stdout output
        this.pythonProcess.stdout.on('data', (data) => {
            const output = data.toString();
            try {
                const result = JSON.parse(output);
                if (result.status === 'ready') {
                    this.isInitialized = true;
                    console.log('BART model initialized successfully');
                }
            } catch (e) {
                // Not JSON output, ignore
            }
        });

        // Handle process errors
        this.pythonProcess.on('error', (err) => {
            console.error('Failed to start Python process:', err);
            this.cleanup();
        });

        this.pythonProcess.on('exit', (code) => {
            console.error(`Python process exited with code ${code}`);
            this.cleanup();
        });

        // Wait for initialization with increased timeout
        await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
                if (!this.isInitialized) {
                    this.cleanup();
                    reject(new Error('Model initialization timeout'));
                }
            }, 30000); // Increased timeout to 30 seconds

            const checkInitialization = () => {
                if (this.isInitialized) {
                    clearTimeout(timeout);
                    resolve();
                } else {
                    setTimeout(checkInitialization, 100);
                }
            };

            checkInitialization();
        });
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

    async extractTrendingSentences(feedbacks: Record<string, {question: string, answer: string}>): Promise<string[]> {
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

    private cleanup() {
        if (this.pythonProcess) {
            this.pythonProcess.kill();
            this.pythonProcess = null;
            this.isInitialized = false;
        }
    }
} 
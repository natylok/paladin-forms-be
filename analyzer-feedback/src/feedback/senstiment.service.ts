import { Injectable, Logger } from '@nestjs/common';
import { pipeline } from '@xenova/transformers';

interface SentimentResult {
    label: string;
    score: number;
}

@Injectable()
export class SentimentService {
    private readonly logger = new Logger(SentimentService.name);
    private classifier: any;
    private isInitialized: boolean = false;
    private readonly MODEL_NAME = 'Xenova/distilbert-base-uncased-finetuned-sst-2-english';
    private initializationPromise: Promise<void> | null = null;

    constructor() {
        this.initializeModel();
    }

    private async initializeModel() {
        if (this.initializationPromise) {
            return this.initializationPromise;
        }

        this.initializationPromise = (async () => {
            try {
                this.logger.log('Starting sentiment analysis model initialization...');
                
                // Configure pipeline with specific options
                this.classifier = await pipeline('sentiment-analysis', this.MODEL_NAME, {
                    cache_dir: '/tmp/xenova_cache',
                    quantized: true,
                    progress_callback: (progress) => {
                        this.logger.debug(`Model loading progress: ${progress.status} - ${progress.file} (${progress.progress}%)`);
                    }
                });
                
                this.isInitialized = true;
                this.logger.log('Sentiment analysis model loaded successfully', {
                    modelName: this.MODEL_NAME
                });
            } catch (error) {
                this.logger.error('Failed to load sentiment analysis model', {
                    error: error instanceof Error ? error.message : 'Unknown error',
                    modelName: this.MODEL_NAME,
                    stack: error instanceof Error ? error.stack : undefined
                });
                throw error;
            }
        })();

        return this.initializationPromise;
    }

    async analyzeSentiment(text: string): Promise<SentimentResult> {
        try {
            // Ensure model is initialized
            if (!this.isInitialized) {
                await this.initializeModel();
            }

            if (!this.classifier) {
                throw new Error('Sentiment classifier not initialized');
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
            };
        } catch (error) {
            this.logger.error('Error in sentiment analysis', {
                error: error instanceof Error ? error.message : 'Unknown error',
                text: text.substring(0, 100), // Log first 100 chars of text
                modelName: this.MODEL_NAME,
                stack: error instanceof Error ? error.stack : undefined
            });
            throw error;
        }
    }
} 
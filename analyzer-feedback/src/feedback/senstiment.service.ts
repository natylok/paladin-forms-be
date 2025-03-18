import { Injectable, Logger } from '@nestjs/common';

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
    private transformersPipeline: any;

    constructor() {
        this.initializeModel();
    }

    private async initializeModel() {
        try {
            if (this.isInitialized) {
                return;
            }

            this.logger.log('Starting sentiment analysis model initialization...');
            
            // Import the transformers module dynamically
            const transformers = await import('@xenova/transformers');
            this.transformersPipeline = transformers.pipeline;
            
            // Initialize the classifier
            this.classifier = await this.transformersPipeline('sentiment-analysis', this.MODEL_NAME, {
                cache_dir: '/tmp/xenova_cache',
                quantized: true
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
    }

    async analyzeSentiment(text: string): Promise<SentimentResult> {
        try {
            if (!this.isInitialized) {
                await this.initializeModel();
            }

            if (!this.classifier) {
                throw new Error('Sentiment classifier not initialized');
            }

            const result = await this.classifier(text);
            
            // Convert label to our format (positive, negative, neutral)
            let normalizedLabel: string;
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
                text: text.substring(0, 100),
                modelName: this.MODEL_NAME,
                stack: error instanceof Error ? error.stack : undefined
            });
            throw error;
        }
    }
} 
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

    async analyzeSentiment(text: any): Promise<SentimentResult> {
        try {
            // Convert input to string if it's not already
            const textString = this.ensureString(text);
            if (!textString) {
                return { label: 'neutral', score: 0.5 };
            }

            if (!this.isInitialized) {
                await this.initializeModel();
            }

            if (!this.classifier) {
                throw new Error('Sentiment classifier not initialized');
            }

            const result = await this.classifier(textString);
            
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
                text: typeof text === 'string' ? text.substring(0, 100) : String(text).substring(0, 100),
                modelName: this.MODEL_NAME,
                stack: error instanceof Error ? error.stack : undefined
            });
            // Return neutral sentiment for any errors
            return { label: 'neutral', score: 0.5 };
        }
    }

    private ensureString(text: any): string | null {
        if (text === null || text === undefined) {
            return null;
        }
        if (typeof text === 'string') {
            return text.trim();
        }
        if (typeof text === 'number') {
            return null; // Don't analyze numbers
        }
        try {
            return String(text).trim();
        } catch {
            return null;
        }
    }
} 
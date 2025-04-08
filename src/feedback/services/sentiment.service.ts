import { Injectable, Logger } from '@nestjs/common';
import { pipeline } from '@xenova/transformers';

@Injectable()
export class SentimentService {
    private readonly logger = new Logger(SentimentService.name);
    private readonly MODEL_NAME = 'Xenova/distilbert-base-multilingual-cased-sentiment';
    private classifier: any;
    private isInitialized = false;

    constructor() {
        this.initializeModel();
    }

    private async initializeModel() {
        try {
            this.classifier = await pipeline('sentiment-analysis', this.MODEL_NAME);
            this.isInitialized = true;
            this.logger.log('Sentiment analysis model initialized successfully');
        } catch (error) {
            this.logger.error('Failed to initialize sentiment analysis model', error);
        }
    }

    async analyzeSentiment(text: string): Promise<{ label: string; score: number }> {
        if (!this.isInitialized) {
            this.logger.warn('Sentiment model not initialized, attempting to initialize...');
            await this.initializeModel();
        }

        try {
            if (!this.classifier) {
                throw new Error('Sentiment classifier not available');
            }

            const result = await this.classifier(text);
            return {
                label: result[0].label,
                score: result[0].score
            };
        } catch (error) {
            this.logger.error('Error in sentiment analysis', {
                error: error instanceof Error ? error.message : 'Unknown error',
                text
            });
            // Return neutral sentiment as fallback
            return {
                label: 'NEUTRAL',
                score: 0.5
            };
        }
    }
} 
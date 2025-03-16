import { Injectable, Logger } from '@nestjs/common';
import { SentimentResult } from '../types/feedback.types';
import { pipeline } from '@xenova/transformers';

@Injectable()
export class SentimentService {
    private readonly logger = new Logger(SentimentService.name);
    private classifier: any;
    private isInitialized: boolean = false;
    private readonly MODEL_NAME = 'Xenova/distilbert-base-uncased-finetuned-sst-2-english';

    constructor() {
        this.initializeModel();
    }

    private async initializeModel() {
        try {
            // Initialize the pipeline with Xenova's model
            this.classifier = await pipeline('sentiment-analysis', this.MODEL_NAME);
            
            this.isInitialized = true;
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
            };
        } catch (error) {
            this.logger.error('Error in sentiment analysis', {
                error: error instanceof Error ? error.message : 'Unknown error',
                text,
                modelName: this.MODEL_NAME
            });
            throw error;
        }
    }
} 
import { Injectable, Logger } from '@nestjs/common';
import { SentimentResult } from '../types/feedback.types';
import { pipeline } from '@huggingface/transformers';
import * as path from 'path';

@Injectable()
export class SentimentService {
    private readonly logger = new Logger(SentimentService.name);
    private classifier: any;
    private isInitialized: boolean = false;
    private readonly MODEL_PATH = path.join(process.cwd(), 'models', 'sentiment-roberta-large-english');

    constructor() {
        this.initializeModel();
    }

    private async initializeModel() {
        try {
            // Initialize the pipeline with local model
            this.classifier = await pipeline('sentiment-analysis', this.MODEL_PATH);
            this.isInitialized = true;
            this.logger.log('Sentiment analysis model loaded successfully from local path', {
                modelPath: this.MODEL_PATH
            });
        } catch (error) {
            this.logger.error('Failed to load sentiment analysis model', {
                error: error instanceof Error ? error.message : 'Unknown error',
                modelPath: this.MODEL_PATH
            });
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
            if (result[0].label.includes('POSITIVE')) {
                normalizedLabel = 'positive';
            } else if (result[0].label.includes('NEGATIVE')) {
                normalizedLabel = 'negative';
            } else {
                normalizedLabel = 'neutral';
            }

            return { 
                label: normalizedLabel, 
                score: result[0].score 
            };
        } catch (error) {
            this.logger.error('Error in sentiment analysis', {
                error: error instanceof Error ? error.message : 'Unknown error',
                text,
                modelPath: this.MODEL_PATH
            });
            return { label: 'neutral', score: 0.5 };
        }
    }
} 
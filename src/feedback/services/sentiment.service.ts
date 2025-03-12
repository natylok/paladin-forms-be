import { Injectable, Logger } from '@nestjs/common';
import { HfInference } from '@huggingface/inference';
import { SentimentResult } from '../types/feedback.types';

@Injectable()
export class SentimentService {
    private readonly logger = new Logger(SentimentService.name);
    private readonly hf: HfInference;

    constructor() {
        this.hf = new HfInference(process.env.HUGGING_FACE_API_KEY);
    }

    async analyzeSentiment(text: string): Promise<SentimentResult> {
        try {
            const result = await this.hf.textClassification({
                model: 'siebert/sentiment-roberta-large-english',
                inputs: text
            });
            
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
                text
            });
            return { label: 'neutral', score: 0.5 };
        }
    }
} 
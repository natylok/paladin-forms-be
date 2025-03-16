import { Injectable, Logger } from '@nestjs/common';
import { SentimentResult } from '../types/feedback.types';
import * as transformers from '@huggingface/transformers';

@Injectable()
export class SentimentService {
    private readonly logger = new Logger(SentimentService.name);
    private model: any;
    private tokenizer: any;
    private isInitialized: boolean = false;

    constructor() {
        this.initializeModel();
    }

    private async initializeModel() {
        try {
            // Initialize the tokenizer and model
            this.tokenizer = await transformers.AutoTokenizer.from_pretrained('siebert/sentiment-roberta-large-english');
            this.model = await transformers.AutoModelForSequenceClassification.from_pretrained('siebert/sentiment-roberta-large-english');
            this.isInitialized = true;
            this.logger.log('Sentiment analysis model loaded successfully');
        } catch (error) {
            this.logger.error('Failed to load sentiment analysis model', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    async analyzeSentiment(text: string): Promise<SentimentResult> {
        try {
            // Wait for model to be initialized
            if (!this.isInitialized) {
                await this.initializeModel();
            }

            // Tokenize and get predictions
            const inputs = await this.tokenizer(text, { return_tensors: 'pt' });
            const outputs = await this.model(inputs);
            const scores = outputs.logits[0].softmax();
            
            // Get the predicted class and its probability
            const prediction = await scores.argmax().item();
            const score = await scores[prediction].item();

            // Convert prediction to label (0 = negative, 1 = neutral, 2 = positive)
            let label: string;
            switch (prediction) {
                case 2:
                    label = 'positive';
                    break;
                case 0:
                    label = 'negative';
                    break;
                default:
                    label = 'neutral';
            }

            return { 
                label, 
                score 
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
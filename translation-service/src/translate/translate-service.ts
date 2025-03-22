import { Injectable, Logger } from '@nestjs/common';

interface SentimentResult {
    label: string;
    score: number;
}

@Injectable()
export class TranslatorService {
    private readonly logger = new Logger(TranslatorService.name);
    private classifier: any;
    private isInitialized: boolean = false;
    private readonly MODEL_NAME = 'Helsinki-NLP/opus-mt-en-fr';
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
            this.classifier = await this.transformersPipeline('translation', this.MODEL_NAME, {
                cache_dir: '/tmp/xenova_cache',
                quantized: true
            });
            
            this.isInitialized = true;
            this.logger.log('Translation analysis model loaded successfully', {
                modelName: this.MODEL_NAME
            });
        } catch (error) {
            this.logger.error('Failed to load translation analysis model', {
                error: error instanceof Error ? error.message : 'Unknown error',
                modelName: this.MODEL_NAME,
                stack: error instanceof Error ? error.stack : undefined
            });
            throw error;
        }
    }

} 
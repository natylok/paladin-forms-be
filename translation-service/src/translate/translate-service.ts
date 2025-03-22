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
    private readonly MODEL_NAME = 'Xenova/nllb-200-distilled-600M';  // This model is available locally

    constructor() {
        this.initializeModel();
    }

    private async initializeModel() {
        try {
            if (this.isInitialized) {
                return;
            }

            this.logger.log('Starting translation model initialization...');
            
            // Import the transformers module dynamically
            const { pipeline } = await import('@xenova/transformers');
            
            // Initialize the classifier
            this.classifier = await pipeline('translation', this.MODEL_NAME, {
                cache_dir: '/tmp/xenova_cache',
                quantized: true
            });
            
            this.isInitialized = true;
            this.logger.log('Translation model loaded successfully', {
                modelName: this.MODEL_NAME
            });
        } catch (error) {
            this.logger.error('Failed to load translation model', {
                error: error instanceof Error ? error.message : 'Unknown error',
                modelName: this.MODEL_NAME,
                stack: error instanceof Error ? error.stack : undefined
            });
            throw error;
        }
    }

    async translate(text: string, sourceLang: string = 'eng_Latn', targetLang: string = 'fra_Latn') {
        try {
            if (!this.isInitialized || !this.classifier) {
                await this.initializeModel();
            }

            const result = await this.classifier(text, {
                src_lang: sourceLang,
                tgt_lang: targetLang
            });

            return result[0].translation_text;
        } catch (error) {
            this.logger.error('Translation failed', {
                error: error instanceof Error ? error.message : 'Unknown error',
                text,
                sourceLang,
                targetLang
            });
            throw error;
        }
    }
} 
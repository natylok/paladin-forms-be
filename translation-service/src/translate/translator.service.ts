import { Injectable, Logger } from '@nestjs/common';
import * as ort from 'onnxruntime-node';

@Injectable()
export class TranslatorService {
    private readonly logger = new Logger(TranslatorService.name);
    private classifier: any;
    private isInitialized: boolean = false;
    private readonly MODEL_NAME = 'Xenova/opus-mt-en-fr';

    constructor() {
        this.initializeModel();
    }

    private async initializeModel() {
        try {
            if (this.isInitialized) {
                return;
            }

            this.logger.log('Starting translation model initialization...');
            
            // Set the execution provider to CPU for Node.js
            ort.env.wasm.numThreads = 4;
            ort.env.wasm.simd = true;
            
            // Import the transformers module dynamically
            const { pipeline } = await import('@xenova/transformers');
            
            // Initialize the classifier with specific model configuration
            this.classifier = await pipeline('translation', this.MODEL_NAME, {
                cache_dir: '/tmp/xenova_cache',
                quantized: false,  // This model might work better without quantization
                revision: 'main'
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

    async translate(text: string, sourceLang: string = 'en', targetLang: string = 'fr') {
        try {
            if (!this.isInitialized || !this.classifier) {
                await this.initializeModel();
            }

            // For Helsinki model, we don't need to specify source/target languages
            const result = await this.classifier(text);

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
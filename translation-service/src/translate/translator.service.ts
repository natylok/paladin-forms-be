import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import { RedisService } from '../redis/redis.service';
import { TranslationLanguages } from '../consts';

interface TranslationStatus {
    status: 'in_progress' | 'completed' | 'failed';
    updatedAt: string;
    error?: string;
}

@Injectable()
export class TranslatorService {
    private readonly logger = new Logger(TranslatorService.name);
    private pythonProcess: any;
    private isInitialized: boolean = false;
    private readonly TRANSLATION_TIMEOUT = 60000; // 60 seconds timeout

    constructor(private readonly redisService: RedisService) {
        this.initializeModel();
    }

    private async initializeModel() {
        try {
            if (this.isInitialized) {
                return;
            }

            this.logger.log('Starting translation model initialization...');
            
            // Start the Python process
            this.pythonProcess = spawn('python3', ['model_loader.py'], {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            // Handle Python process errors and output
            this.pythonProcess.stderr.on('data', (data) => {
                this.logger.log(`Python Model Output: ${data.toString().trim()}`);
            });

            this.pythonProcess.stdout.on('data', (data) => {
                this.logger.debug(`Python stdout: ${data.toString().trim()}`);
            });

            this.pythonProcess.on('error', (error) => {
                this.logger.error('Failed to start Python process', error);
                this.isInitialized = false;
                throw error;
            });

            this.pythonProcess.on('exit', (code, signal) => {
                if (code !== 0) {
                    this.logger.error(`Python process exited with code ${code}, signal ${signal}`);
                    this.isInitialized = false;
                }
            });

            this.isInitialized = true;
            this.logger.log('Translation model service initialized');
            
        } catch (error) {
            this.logger.error('Failed to initialize translation model', {
                error: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined
            });
            throw error;
        }
    }

    async translate(text: string, sourceLang: string = 'en', targetLang: string = 'fr', surveyId?: string): Promise<string> {
        try {
            if (!this.isInitialized || !this.pythonProcess) {
                await this.initializeModel();
            }

            return new Promise((resolve, reject) => {
                let responseData = '';
                let timeoutId: NodeJS.Timeout;

                // Create a request object with language parameters
                const request = {
                    text,
                    source_lang: sourceLang,
                    target_lang: targetLang
                };

                const cleanup = () => {
                    if (timeoutId) clearTimeout(timeoutId);
                    this.pythonProcess.stdout.removeListener('data', handleOutput);
                };

                // Handle the response
                const handleOutput = (data: Buffer) => {
                    try {
                        responseData += data.toString();
                        
                        // Try to parse the accumulated data
                        try {
                            const response = JSON.parse(responseData);
                            // Clear the accumulated data
                            responseData = '';
                            
                            if (response.error) {
                                cleanup();
                                this.logger.error('Translation error from Python:', response.error);
                                reject(new Error(response.error));
                            } else {
                                cleanup();
                                resolve(response.translation);
                            }
                        } catch (e) {
                            // If we can't parse the JSON yet, wait for more data
                            if (!(e instanceof SyntaxError)) {
                                cleanup();
                                throw e;
                            }
                        }
                    } catch (error) {
                        cleanup();
                        this.logger.error('Error parsing Python response:', error);
                        reject(error);
                    }
                };

                // Set a timeout for the translation request
                timeoutId = setTimeout(() => {
                    cleanup();
                    this.logger.error(`Translation timed out for text: "${text.substring(0, 50)}..."`);
                    reject(new Error(`Translation timed out after ${this.TRANSLATION_TIMEOUT/1000} seconds`));
                }, this.TRANSLATION_TIMEOUT);

                // Listen for response
                this.pythonProcess.stdout.on('data', handleOutput);

                // Send the request to Python process
                try {
                    this.pythonProcess.stdin.write(JSON.stringify(request) + '\n');
                } catch (error) {
                    cleanup();
                    this.logger.error('Failed to write to Python process:', error);
                    reject(new Error('Failed to send translation request to Python process'));
                }
            });

        } catch (error) {
            this.logger.error('Translation failed', {
                error: error instanceof Error ? error.message : 'Unknown error',
                text: text.substring(0, 50) + '...',
                sourceLang,
                targetLang
            });
            throw error;
        }
    }
} 
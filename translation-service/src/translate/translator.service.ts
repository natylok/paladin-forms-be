import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import { RedisService } from '../redis/redis.service';

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

    constructor(private readonly redisService: RedisService) {
        this.initializeModel();
    }

    private getTranslationKey(surveyId: string, targetLang: string): string {
        return `translation:${surveyId}:${targetLang}`;
    }

    async setTranslationStatus(surveyId: string, targetLang: string, status: 'in_progress' | 'completed' | 'failed', error?: string) {
        const key = this.getTranslationKey(surveyId, targetLang);
        await this.redisService.set(key, {
            status,
            updatedAt: new Date().toISOString(),
            error
        }, 60 * 60 * 24); // 24 hours TTL
    }

    async getTranslationStatus(surveyId: string, targetLang: string): Promise<TranslationStatus | null> {
        const key = this.getTranslationKey(surveyId, targetLang);
        return await this.redisService.get<TranslationStatus>(key);
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

                // Create a request object with language parameters
                const request = {
                    text,
                    source_lang: sourceLang,
                    target_lang: targetLang
                };

                // Send the request to Python process
                this.pythonProcess.stdin.write(JSON.stringify(request) + '\n');

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
                                this.logger.error('Translation error from Python:', response.error);
                                reject(new Error(response.error));
                            } else {
                                resolve(response.translation);
                            }
                            
                            // Remove the listener after successful parsing
                            this.pythonProcess.stdout.removeListener('data', handleOutput);
                        } catch (e) {
                            // If we can't parse the JSON yet, wait for more data
                            if (!(e instanceof SyntaxError)) {
                                throw e;
                            }
                        }
                    } catch (error) {
                        this.logger.error('Error parsing Python response:', error);
                        reject(error);
                        // Remove the listener on error
                        this.pythonProcess.stdout.removeListener('data', handleOutput);
                    }
                };

                // Set a timeout for the translation request
                const timeout = setTimeout(() => {
                    this.pythonProcess.stdout.removeListener('data', handleOutput);
                    reject(new Error('Translation request timed out'));
                }, 30000); // 30 seconds timeout

                // Listen for response
                this.pythonProcess.stdout.on('data', handleOutput);

                // Clean up the timeout on success or failure
                Promise.race([
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Translation timed out')), 30000))
                ]).catch(error => {
                    clearTimeout(timeout);
                    this.pythonProcess.stdout.removeListener('data', handleOutput);
                    throw error;
                });
            });

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
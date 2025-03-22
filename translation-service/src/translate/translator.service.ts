import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { spawn } from 'child_process';

@Injectable()
export class TranslatorService implements OnModuleInit {
    private readonly logger = new Logger(TranslatorService.name);
    private pythonProcess: any;
    private isInitialized: boolean = false;

    constructor() {
        this.initializeModel();
    }

    async onModuleInit() {
        // Cleanup on application shutdown
        process.on('beforeExit', () => {
            if (this.pythonProcess) {
                this.pythonProcess.kill();
            }
        });
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

            // Handle Python process errors
            this.pythonProcess.stderr.on('data', (data) => {
                this.logger.log(`Python Model Output: ${data.toString()}`);
            });

            this.pythonProcess.on('error', (error) => {
                this.logger.error('Failed to start Python process', error);
                throw error;
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

    async translate(text: string): Promise<string> {
        try {
            if (!this.isInitialized || !this.pythonProcess) {
                await this.initializeModel();
            }

            return new Promise((resolve, reject) => {
                // Create a request object
                const request = {
                    text: text
                };

                // Send the request to Python process
                this.pythonProcess.stdin.write(JSON.stringify(request) + '\n');

                // Handle the response
                const handleOutput = (data: Buffer) => {
                    try {
                        const response = JSON.parse(data.toString());
                        if (response.error) {
                            reject(new Error(response.error));
                        } else {
                            resolve(response.translation);
                        }
                    } catch (error) {
                        reject(error);
                    }
                };

                // Listen for one response
                this.pythonProcess.stdout.once('data', handleOutput);
            });

        } catch (error) {
            this.logger.error('Translation failed', {
                error: error instanceof Error ? error.message : 'Unknown error',
                text
            });
            throw error;
        }
    }
} 
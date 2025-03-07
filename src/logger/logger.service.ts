import { Injectable } from '@nestjs/common';
import * as winston from 'winston';
import * as path from 'path';

@Injectable()
export class LoggerService {
    private logger: winston.Logger;

    constructor() {
        const logDir = 'logs';
        const logFile = path.join(logDir, 'app.log');

        this.logger = winston.createLogger({
            level: 'info',
            format: winston.format.combine(
                winston.format.timestamp({
                    format: 'YYYY-MM-DD HH:mm:ss'
                }),
                winston.format.errors({ stack: true }),
                winston.format.splat(),
                winston.format.json()
            ),
            defaultMeta: { service: 'paladin-forms' },
            transports: [
                new winston.transports.File({
                    filename: path.join(logDir, 'error.log'),
                    level: 'error'
                }),
                new winston.transports.File({
                    filename: logFile
                }),
                new winston.transports.Console({
                    format: winston.format.combine(
                        winston.format.colorize(),
                        winston.format.simple()
                    )
                })
            ]
        });
    }

    log(message: string, context?: any) {
        this.logger.info(message, { context });
    }

    error(message: string, trace?: string, context?: any) {
        this.logger.error(message, { trace, context });
    }

    warn(message: string, context?: any) {
        this.logger.warn(message, { context });
    }

    debug(message: string, context?: any) {
        this.logger.debug(message, { context });
    }

    verbose(message: string, context?: any) {
        this.logger.verbose(message, { context });
    }
} 
import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { createClient, RedisClientType } from 'redis';

@Injectable()
export class RedisService implements OnModuleDestroy {
    private readonly logger = new Logger(RedisService.name);
    private readonly client: RedisClientType;

    constructor() {
        this.client = createClient({
            url: 'redis://localhost:6379'
        });

        this.client.connect().catch(err => {
            this.logger.error('Failed to connect to Redis', err);
        });

        this.client.on('error', (err) => {
            this.logger.error('Redis client error', err);
        });

        this.client.on('connect', () => {
            this.logger.log('Connected to Redis');
        });
    }

    getClient(): RedisClientType {
        return this.client;
    }

    async onModuleDestroy() {
        await this.client.quit();
    }
} 
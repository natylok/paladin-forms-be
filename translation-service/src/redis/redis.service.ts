import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { createClient } from 'redis';
import type { RedisClientType } from 'redis';

@Injectable()
export class RedisService implements OnModuleDestroy {
    private readonly logger = new Logger(RedisService.name);
    private readonly client: RedisClientType;

    constructor() {
        this.client = createClient({
            url: `redis://${process.env.REDIS_HOST || 'redis'}:${process.env.REDIS_PORT || 6379}`
        });

        this.client.on('error', (error) => {
            this.logger.error('Redis Client Error:', error);
        });

        this.client.on('connect', () => {
            this.logger.log('Successfully connected to Redis');
        });

        this.client.connect().catch((err) => {
            this.logger.error('Failed to connect to Redis:', err);
        });
    }

    async onModuleDestroy() {
        await this.client.quit();
    }

    async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
        try {
            const serializedValue = JSON.stringify(value);
            if (ttlSeconds) {
                await this.client.setEx(key, ttlSeconds, serializedValue);
            } else {
                await this.client.set(key, serializedValue);
            }
        } catch (error) {
            this.logger.error(`Error setting Redis key ${key}:`, error);
            throw error;
        }
    }

    async get<T>(key: string): Promise<T | null> {
        try {
            const value = await this.client.get(key);
            if (!value) return null;
            return JSON.parse(value) as T;
        } catch (error) {
            this.logger.error(`Error getting Redis key ${key}:`, error);
            throw error;
        }
    }

    async delete(key: string): Promise<void> {
        try {
            await this.client.del(key);
        } catch (error) {
            this.logger.error(`Error deleting Redis key ${key}:`, error);
            throw error;
        }
    }

    async exists(key: string): Promise<boolean> {
        try {
            const result = await this.client.exists(key);
            return result === 1;
        } catch (error) {
            this.logger.error(`Error checking Redis key ${key}:`, error);
            throw error;
        }
    }
} 
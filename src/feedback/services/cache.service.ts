import { Injectable, Logger, Inject } from '@nestjs/common';
import { RedisClientType } from 'redis';
import { User } from '@prisma/client';
import { CACHE_TTL } from '../constants/feedback.constants';

@Injectable()
export class FeedbackCacheService {
    private readonly logger = new Logger(FeedbackCacheService.name);

    constructor(
        @Inject('REDIS_CLIENT') private readonly redis: RedisClientType
    ) {}

    generateCacheKey(user: User): string {
        return `paladin:feedback:summary:${user.email}`;
    }

    async getCachedSummary(cacheKey: string): Promise<any | null> {
        try {
            const cachedData = await this.redis.get(cacheKey);

            this.logger.debug('Cache get attempt', {
                cacheKey,
                hasData: !!cachedData,
                dataType: typeof cachedData
            });

            if (!cachedData) {
                return null;
            }

            try {
                return JSON.parse(cachedData);
            } catch (e) {
                return null;
            }
        } catch (error) {
            this.logger.error('Cache get error', {
                error: error instanceof Error ? error.message : 'Unknown error',
                cacheKey
            });
            return null;
        }
    }

    async setCachedSummary(cacheKey: string, data: any): Promise<boolean> {
        try {
            const serializedData = JSON.stringify(data);

            this.logger.debug('Cache set attempt', {
                cacheKey,
                dataSize: serializedData.length,
                ttl: CACHE_TTL
            });

            await this.redis.setEx(cacheKey, CACHE_TTL, serializedData);
            const exists = await this.redis.exists(cacheKey);

            const success = exists === 1;
            this.logger.debug('Cache set result', {
                cacheKey,
                success,
                exists
            });

            return success;
        } catch (error) {
            this.logger.error('Cache set error', {
                error: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined,
                cacheKey
            });
            return false;
        }
    }

    async invalidateCache(user: User): Promise<void> {
        const cacheKey = this.generateCacheKey(user);
        await this.redis.del(cacheKey);
        this.logger.debug('Feedback summary cache invalidated', { user: user.email });
    }
} 
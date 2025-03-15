// src/redis/redis.service.ts
import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from 'redis';

@Injectable()
export class RedisService implements OnModuleInit {
  private readonly logger = new Logger(RedisService.name);
  private client;
  private retryAttempts = 5;
  private retryDelay = 5000; // 5 seconds

  constructor(private configService: ConfigService) {
    this.client = createClient({
      url: `redis://${this.configService.get('REDIS_HOST')}:${this.configService.get('REDIS_PORT')}`,
    });

    this.client.on('error', (err) => this.logger.error('Redis Client Error', err));
    this.client.on('connect', () => this.logger.log('Successfully connected to Redis'));
  }

  async onModuleInit() {
    let currentAttempt = 0;
    while (currentAttempt < this.retryAttempts) {
      try {
        await this.client.connect();
        this.logger.log('Redis connection established');
        break;
      } catch (error) {
        currentAttempt++;
        this.logger.error(
          `Failed to connect to Redis. Attempt ${currentAttempt} of ${this.retryAttempts}`,
          error
        );
        if (currentAttempt === this.retryAttempts) {
          throw error;
        }
        await new Promise(resolve => setTimeout(resolve, this.retryDelay));
      }
    }
  }
}
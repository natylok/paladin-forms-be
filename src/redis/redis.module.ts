import { Module, Global } from '@nestjs/common';
import { RedisService } from './redis.service';

@Global()
@Module({
    providers: [
        RedisService,
        {
            provide: 'REDIS_CLIENT',
            useFactory: (redisService: RedisService) => redisService.getClient(),
            inject: [RedisService]
        }
    ],
    exports: ['REDIS_CLIENT', RedisService]
})
export class RedisModule {} 
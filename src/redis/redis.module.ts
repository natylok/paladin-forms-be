import { Module, Global, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RedisService } from './redis.service';

@Global()
@Module({
    imports: [ConfigModule],
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
export class RedisModule implements NestModule {
    constructor(private readonly redisService: RedisService) {}

    configure(consumer: MiddlewareConsumer) {
        consumer
            .apply((req, res, next) => {
                req.app.set('RedisService', this.redisService);
                next();
            })
            .forRoutes('*');
    }
} 
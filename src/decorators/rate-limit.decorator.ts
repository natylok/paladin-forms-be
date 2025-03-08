import { SetMetadata, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

export function RateLimit(cooldownSeconds: number) {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        const originalMethod = descriptor.value;

        descriptor.value = async function(...args: any[]) {
            // Find the request object in the arguments
            const req = args.find(arg => arg.user || (arg.req && arg.req.user))?.req || args.find(arg => arg.user);
            if (!req || !req.user) {
                throw new HttpException('User not authenticated', HttpStatus.UNAUTHORIZED);
            }

            const redisService = req.app.get('RedisService') as RedisService;
            const redis = redisService.getClient();

            const key = `rate_limit:survey_generation:${req.user.email}`;
            
            const lastUsage = await redis.get(key);
            if (lastUsage) {
                const timeElapsed = Date.now() - parseInt(lastUsage);
                const remainingTime = cooldownSeconds * 1000 - timeElapsed;
                
                if (remainingTime > 0) {
                    throw new HttpException({
                        message: 'Rate limit exceeded',
                        remainingSeconds: Math.ceil(remainingTime / 1000)
                    }, HttpStatus.TOO_MANY_REQUESTS);
                }
            }

            await redis.set(key, Date.now().toString());
            
            return originalMethod.apply(this, args);
        };

        return descriptor;
    };
} 
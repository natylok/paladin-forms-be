import Redis from 'ioredis';

const redisConfig = {
  host: process.env.REDIS_HOST || 'redis',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  maxRetriesPerRequest: null,
  retryStrategy: (times: number) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  reconnectOnError: (err: Error) => {
    const targetError = 'READONLY';
    if (err.message.includes(targetError)) {
      return true;
    }
    return false;
  }
};

export const redis = new Redis(redisConfig);

redis.on('error', (error: Error) => {
  console.error('Redis connection error:', error);
});

redis.on('connect', () => {
  console.log('Successfully connected to Redis');
});

redis.on('ready', () => {
  console.log('Redis client is ready');
}); 
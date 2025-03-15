import { NestFactory } from '@nestjs/core';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const logger = new Logger('Main');
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  const user = configService.get('RABBITMQ_DEFAULT_USER', 'guest');
  const password = configService.get('RABBITMQ_DEFAULT_PASS', 'guest');
  const host = configService.get('RABBITMQ_HOST', 'localhost');

  const microservice = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
    transport: Transport.RMQ,
    options: {
      urls: [`amqp://${user}:${password}@${host}:5672`],
      queue: 'publication_queue',
      queueOptions: {
        durable: true,
        prefetchCount: 1
      },
      socketOptions: {
        heartbeatIntervalInSeconds: 60,
        reconnectTimeInSeconds: 5
      },
      noAck: false
    }
  });

  // Start both the HTTP and microservice servers
  await Promise.all([
    app.listen(3000),
    microservice.listen()
  ]).catch(error => {
    logger.error('Failed to start servers', error);
    process.exit(1);
  });

  logger.log('Queue service is running');
}

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

bootstrap();
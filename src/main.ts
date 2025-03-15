// src/main.ts
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Transport } from '@nestjs/microservices';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  app.enableCors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
  });
  // RabbitMQ Configuration
  const rabbitMQConfig = {
    transport: Transport.RMQ,
    options: {
      urls: [`amqp://${configService.get('RABBITMQ_DEFAULT_USER')}:${configService.get('RABBITMQ_DEFAULT_PASS')}@rabbitmq:5672`],
      queue: 'main_queue',
      queueOptions: {
        durable: true
      },
    },
  };

  try {
    app.connectMicroservice(rabbitMQConfig);
    await app.startAllMicroservices();
    logger.log('RabbitMQ microservice started successfully');
  } catch (error) {
    logger.error('Failed to connect to RabbitMQ', error);
  }

  await app.listen(3333);
}
bootstrap();
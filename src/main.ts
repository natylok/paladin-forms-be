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

  // RabbitMQ Configuration for survey queue
  const rabbitMQConfig = {
    transport: Transport.RMQ,
    options: {
      urls: [`amqp://${configService.get('RABBITMQ_DEFAULT_USER')}:${configService.get('RABBITMQ_DEFAULT_PASS')}@rabbitmq:5672`],
      queue: 'survey_queue_v2',
      queueOptions: {
        durable: true,
        noAck: false,
        autoDelete: false
      },
      persistent: true,
      prefetchCount: 1,
      isGlobalPrefetchCount: false
    },
  };

  try {
    // Connect microservice
    app.connectMicroservice(rabbitMQConfig);
    
    // Start all microservices
    await app.startAllMicroservices();
    logger.log('RabbitMQ microservice started successfully');
    
    // Start HTTP server
    await app.listen(3333);
    logger.log('HTTP server started on port 3333');
  } catch (error) {
    logger.error('Failed to start services', error);
    throw error;
  }
}

bootstrap();
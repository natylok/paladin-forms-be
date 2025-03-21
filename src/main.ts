// src/main.ts
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Transport } from '@nestjs/microservices';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import * as cookieParser from 'cookie-parser';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // Use cookie parser
  app.use(cookieParser());

  app.enableCors({
    origin: true, // Allow all origins for now
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
    credentials: true,
  });

  // Enable validation with detailed errors
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
    transformOptions: {
      enableImplicitConversion: true,
    },
    forbidNonWhitelisted: true,
    disableErrorMessages: false,
  }));

  // RabbitMQ Configuration for survey queue
  const rabbitMQConfig = {
    transport: Transport.RMQ,
    options: {
      urls: [`amqp://${configService.get('RABBITMQ_DEFAULT_USER')}:${configService.get('RABBITMQ_DEFAULT_PASS')}@rabbitmq:5672`],
      queue: 'survey_queue_v2',
      queueOptions: {
        durable: true,
        noAck: false,
      },
      noAck: false,
      persistent: true,
      prefetchCount: 1,
      socketOptions: {
        heartbeatIntervalInSeconds: 60,
        reconnectTimeInSeconds: 5
      }
    },
  };

  try {
    // Connect microservice
    const microservice = app.connectMicroservice(rabbitMQConfig, { inheritAppConfig: true });
    
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
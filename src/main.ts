import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  
  // Enable CORS with credentials
  app.enableCors({
    origin: 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
    }),
  );

  // Configure RabbitMQ connections for different queues
  const rabbitMQConfig = {
    urls: [`amqp://${configService.get('RABBITMQ_DEFAULT_USER')}:${configService.get('RABBITMQ_DEFAULT_PASS')}@localhost:5672`],
    queueOptions: {
      durable: true
    },
    prefetchCount: 1,
    noAck: false,
    socketOptions: {
      heartbeat: 60
    }
  };

  // Connect main queue microservice
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      ...rabbitMQConfig,
      queue: 'main_queue',
    },
  });

  // Connect survey queue microservice
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      ...rabbitMQConfig,
      queue: 'survey_queue',
    },
  });

  await app.startAllMicroservices();
  app.use(cookieParser());
  await app.listen(3333);
}
bootstrap();

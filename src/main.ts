import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';

async function bootstrap() {
  // Create HTTPS options

  // Create the app with HTTPS options in production
  const app = await NestFactory.create(AppModule);
  
  const configService = app.get(ConfigService);
  
  // Enable CORS with fully permissive settings
  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: '*',
    exposedHeaders: '*',
    credentials: true,
    maxAge: 86400, // 24 hours
    preflightContinue: false,
    optionsSuccessStatus: 204
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
  
  // Listen on both HTTP and HTTPS in production
  if (process.env.NODE_ENV === 'production') {
    await app.listen(443); // HTTPS
    // Also listen on HTTP port 80 to redirect to HTTPS
    const httpApp = await NestFactory.create(AppModule);
    httpApp.use((req, res, next) => {
      if (req.secure) {
        next();
      } else {
        res.redirect(`https://${req.headers.host}${req.url}`);
      }
    });
    await httpApp.listen(80);
  } else {
    await app.listen(3333); // Development port
  }
}
bootstrap();

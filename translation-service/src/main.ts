import { NestFactory } from '@nestjs/core';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const logger = new Logger('Main');
  
  // First create the app
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  const user = configService.get('RABBITMQ_DEFAULT_USER', 'guest');
  const password = configService.get('RABBITMQ_DEFAULT_PASS', 'guest');
  const host = configService.get('RABBITMQ_HOST', 'rabbitmq');

  // Create the microservice for consuming publication events
  const microservice = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    {
      transport: Transport.RMQ,
      options: {
        urls: [`amqp://${user}:${password}@${host}:5672`],
        queue: 'survey_queue_v2',
        queueOptions: {
          durable: true
        },
        noAck: false,
        prefetchCount: 1,
        socketOptions: {
          heartbeatIntervalInSeconds: 60,
          reconnectTimeInSeconds: 5
        },
        persistent: true
      },
    },
  );

  // Start both HTTP and microservice
  try {
    await Promise.all([
      app.listen(3009),
      microservice.listen()
    ]);
    
    logger.log(`Translation service is running on port 3009`);
    logger.log(`Listening for messages on survey_queue_v2`);
  } catch (error) {
    logger.error('Failed to start services', error);
    process.exit(1);
  }
}

// Add global error handlers
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

bootstrap();
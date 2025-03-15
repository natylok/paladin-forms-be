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
  const host = configService.get('RABBITMQ_HOST', 'localhost');

  // Create the microservice for consuming publication events
  const microservice = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    {
      transport: Transport.RMQ,
      options: {
        urls: [`amqp://${user}:${password}@${host}:5672`],
        queue: 'publication_queue',
        queueOptions: {
          durable: true
        },
        prefetchCount: 1,
        isGlobalPrefetchCount: false,
        socketOptions: {
          heartbeatIntervalInSeconds: 60,
          reconnectTimeInSeconds: 5
        },
        noAck: false,
        persistent: true
      },
    },
  );

  // Start both HTTP and microservice
  try {
    await Promise.all([
      app.listen(3000),
      microservice.listen()
    ]);
    
    logger.log(`Queue service is running on port 3000`);
    logger.log(`Listening for messages on publication_queue`);
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
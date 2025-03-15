import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const logger = new Logger('Main');

  const rabbitmqHost = process.env.RABBITMQ_HOST || 'rabbitmq';

  const app = await NestFactory.create(AppModule);
  try {
    app.connectMicroservice<MicroserviceOptions>({
      transport: Transport.RMQ,
      options: {
        urls: [`amqp://${process.env.RABBITMQ_DEFAULT_USER}:${process.env.RABBITMQ_DEFAULT_PASS}@rabbitmq:5672`],
        queue: 'publication_queue',
        queueOptions: {
          durable: true
        },
        prefetchCount: 1
      },
    });

    logger.log(`Connecting to RabbitMQ at ${rabbitmqHost}:5672`);
    
    // Enable graceful shutdown
    app.enableShutdownHooks();
    
    // Start listening
    await app.listen(3335);
    logger.log('Queue Service Microservice is listening for publication events');
    logger.log('Handling patterns:', [
      'publication.created',
      'publication.updated',
      'publication.deleted',
      'scheduled.task'
    ]);
  } catch (error) {
    logger.error('Failed to start microservice', error instanceof Error ? error.stack : undefined);
    process.exit(1);
  }
}

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

bootstrap();
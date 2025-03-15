import { NestFactory } from '@nestjs/core';
import { Transport } from '@nestjs/microservices';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const logger = new Logger('Main');
  
  const rabbitmqUser = process.env.RABBITMQ_DEFAULT_USER || 'guest';
  const rabbitmqPass = process.env.RABBITMQ_DEFAULT_PASS || 'guest';
  const rabbitmqHost = process.env.RABBITMQ_HOST || 'rabbitmq';
  const rabbitmqUrl = `amqp://${rabbitmqUser}:${rabbitmqPass}@${rabbitmqHost}:5672`;
  
  try {
    // Create a single microservice instance that handles both queues
    const app = await NestFactory.createMicroservice(AppModule, {
      transport: Transport.RMQ,
      options: {
        urls: [rabbitmqUrl],
        queue: 'publication_queue',
        queueOptions: {
          durable: true,
          deadLetterExchange: 'dlx.exchange',
          deadLetterRoutingKey: 'dlx.queue'
        },
        noAck: false,
        prefetchCount: 1,
        persistent: true,
        socketOptions: {
          heartbeatIntervalInSeconds: 60,
          reconnectTimeInSeconds: 5
        },
        retryAttempts: 5,
        retryDelay: 5000,
        exchanges: [
          {
            name: 'dlx.exchange',
            type: 'direct'
          }
        ],
        // Explicitly define the patterns we want to subscribe to
        subscribe: {
          'publication.created': true,
          'publication.updated': true,
          'publication.deleted': true,
          'scheduled.task': true
        }
      },
    });

    logger.log(`Connecting to RabbitMQ at ${rabbitmqHost}:5672`);
    
    app.enableShutdownHooks();
    
    await app.listen();
    logger.log('Queue Service Microservice is listening for publication events');
    logger.log('Subscribed patterns:', [
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
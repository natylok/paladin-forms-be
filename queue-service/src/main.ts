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
    // First, create the DLX exchange and queue
    const app = await NestFactory.createMicroservice(AppModule, {
      transport: Transport.RMQ,
      options: {
        urls: [rabbitmqUrl],
        queue: 'dlx.queue',
        queueOptions: {
          durable: true
        },
        exchanges: [
          {
            name: 'dlx.exchange',
            type: 'direct'
          }
        ],
        prefetchCount: 1,
        socketOptions: {
          heartbeatIntervalInSeconds: 60,
          reconnectTimeInSeconds: 5
        },
        retryAttempts: 5,
        retryDelay: 5000
      },
    });

    await app.listen();
    logger.log('DLX exchange and queue created');

    // Then create the main queue with DLX configuration
    const mainApp = await NestFactory.createMicroservice(AppModule, {
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
        socketOptions: {
          heartbeatIntervalInSeconds: 60,
          reconnectTimeInSeconds: 5
        },
        retryAttempts: 5,
        retryDelay: 5000
      },
    });

    logger.log(`Connecting to RabbitMQ at ${rabbitmqHost}:5672`);
    
    mainApp.enableShutdownHooks();
    
    await mainApp.listen();
    logger.log('Queue Service Microservice is listening for publication events');
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
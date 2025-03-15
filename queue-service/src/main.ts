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
  
  const app = await NestFactory.createMicroservice(AppModule, {
    transport: Transport.RMQ,
    options: {
      urls: [rabbitmqUrl],
      queue: 'publication_queue',
      queueOptions: {
        durable: true
      },
      noAck: false,
      prefetchCount: 1,
      socketOptions: {
        heartbeatIntervalInSeconds: 60,
        reconnectTimeInSeconds: 5
      }
    },
  });

  logger.log(`Connecting to RabbitMQ at ${rabbitmqHost}:5672`);
  await app.listen();
  logger.log('Queue Service Microservice is listening');
}

bootstrap();
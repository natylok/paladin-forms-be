import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { HttpModule } from '@nestjs/axios';
import { QueueController } from './queue.controller';
import { QueueService } from './queue.service';

@Module({
  imports: [
    ConfigModule,
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 5,
    }),
    ClientsModule.registerAsync([
      {
        name: 'EMAIL_SERVICE',
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [`amqp://${configService.get('RABBITMQ_DEFAULT_USER')}:${configService.get('RABBITMQ_DEFAULT_PASS')}@${configService.get('RABBITMQ_HOST')}:5672`],
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
            retryDelay: 5000
          },
        }),
        inject: [ConfigService],
      },
      {
        name: 'SCHEDULER_SERVICE',
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [`amqp://${configService.get('RABBITMQ_DEFAULT_USER')}:${configService.get('RABBITMQ_DEFAULT_PASS')}@${configService.get('RABBITMQ_HOST')}:5672`],
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
            retryDelay: 5000
          },
        }),
        inject: [ConfigService],
      },
      {
        name: 'DLX_SERVICE',
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [`amqp://${configService.get('RABBITMQ_DEFAULT_USER')}:${configService.get('RABBITMQ_DEFAULT_PASS')}@${configService.get('RABBITMQ_HOST')}:5672`],
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
        }),
        inject: [ConfigService],
      }
    ]),
  ],
  controllers: [QueueController],
  providers: [QueueService],
  exports: [QueueService]
})
export class QueueModule {} 
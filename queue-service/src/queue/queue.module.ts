import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { HttpModule } from '@nestjs/axios';
import { QueueController } from './queue.controller';
import { QueueService } from './queue.service';

@Module({
  imports: [
    ConfigModule,
    HttpModule,
    ClientsModule.registerAsync([
      {
        name: 'EMAIL_SERVICE',
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [`amqp://${configService.get('RABBITMQ_DEFAULT_USER')}:${configService.get('RABBITMQ_DEFAULT_PASS')}@rabbitmq:5672`],
            queue: 'email_queue',
            queueOptions: {
              durable: true
            },
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
            urls: [`amqp://${configService.get('RABBITMQ_DEFAULT_USER')}:${configService.get('RABBITMQ_DEFAULT_PASS')}@rabbitmq:5672`],
            queue: 'scheduled_tasks_queue',
            queueOptions: {
              durable: true,
              deadLetterExchange: 'dlx.exchange',
              deadLetterRoutingKey: 'dlx.trigger',
            },
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
            urls: [`amqp://${configService.get('RABBITMQ_DEFAULT_USER')}:${configService.get('RABBITMQ_DEFAULT_PASS')}@rabbitmq:5672`],
            queue: 'dlx.queue',
            queueOptions: {
              durable: true,
            },
            exchanges: [
              {
                name: 'dlx.exchange',
                type: 'direct',
              },
            ],
            prefetchCount: 1,
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
  controllers: [QueueController],
  providers: [QueueService],
  exports: [QueueService]
})
export class QueueModule {} 
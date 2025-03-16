import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { QueueController } from './queue.controller';
import { QueueService } from './queue.service';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [
    ConfigModule,
    HttpModule,
    ClientsModule.registerAsync([
      {
        name: 'PUBLICATION_SERVICE',
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [`amqp://${configService.get('RABBITMQ_DEFAULT_USER')}:${configService.get('RABBITMQ_DEFAULT_PASS')}@rabbitmq:5672`],
            queue: 'publication_queue',
            queueOptions: {
              durable: true
            },
            exchange: 'delayed.publication',
            exchangeType: 'x-delayed-message',
            exchangeOptions: {
              durable: true,
              arguments: {
                'x-delayed-type': 'direct'
              }
            }
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
  controllers: [QueueController],
  providers: [QueueService]
})
export class QueueModule { }
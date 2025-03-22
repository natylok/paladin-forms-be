import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { QueueController } from './translate.controller';
import { TranslateService } from './translate.service';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [
    ConfigModule,
    HttpModule,
    ClientsModule.registerAsync([
      {
        name: 'TRANSLATION_SERVICE',
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [`amqp://${configService.get('RABBITMQ_DEFAULT_USER')}:${configService.get('RABBITMQ_DEFAULT_PASS')}@rabbitmq:5672`],
            queue: 'survey_queue_v2',
            queueOptions: {
              durable: true
            },
            prefetchCount: 1,
            persistent: true
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
  controllers: [QueueController],
  providers: [TranslateService]
})
export class TranslateModule { }
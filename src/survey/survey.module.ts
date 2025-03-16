import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Survey, SurveySchema } from './survey.schema';
import { SurveyController } from './survey.controller';
import { SurveyService } from './survey.service';
import { ClientsModule, Transport } from '@nestjs/microservices';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([{ name: Survey.name, schema: SurveySchema }]), 
    ClientsModule.registerAsync([
      {
        name: 'SURVEY_SERVICE',
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [`amqp://${configService.get('RABBITMQ_DEFAULT_USER')}:${configService.get('RABBITMQ_DEFAULT_PASS')}@rabbitmq:5672`],
            queue: 'survey_queue',
            queueOptions: {
              durable: true,
              noAck: false,
              arguments: {
                'x-message-ttl': 60000, // 1 minute TTL
                'x-dead-letter-exchange': 'survey_dlx',
                'x-dead-letter-routing-key': 'survey_dlq'
              }
            },
            persistent: true,
            prefetchCount: 1,
            isGlobalPrefetchCount: false,
            exchanges: [
              {
                name: 'survey_exchange',
                type: 'direct'
              }
            ],
            socketOptions: {
              heartbeatIntervalInSeconds: 60,
              reconnectTimeInSeconds: 5
            }
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
  controllers: [SurveyController],
  providers: [SurveyService],
})
export class SurveyModule { }

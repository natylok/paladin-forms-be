import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TranslateController } from './translate.controller';
import { TranslateService } from './translate.service';
import { HttpModule } from '@nestjs/axios';
import { SurveyService } from './survey.service';
import { TranslatorService } from './translator.service';
import { MongooseModule } from '@nestjs/mongoose';
import { Survey, SurveySchema } from '../../shared/schemas/survey.schema';
import { Transport, ClientsModule } from '@nestjs/microservices';

@Module({
  imports: [
    ConfigModule,
    HttpModule,
    MongooseModule.forFeature([{ name: Survey.name, schema: SurveySchema }]),
    ClientsModule.registerAsync([
      {
        name: 'SURVEY_SERVICE',
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [`amqp://${configService.get('RABBITMQ_DEFAULT_USER')}:${configService.get('RABBITMQ_DEFAULT_PASS')}@rabbitmq:5672`],
            queue: 'survey_queue_v2',
            queueOptions: {
              durable: true,
              noAck: false,
              autoDelete: false
            },
            persistent: true,
            prefetchCount: 1,
            isGlobalPrefetchCount: false
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
  controllers: [TranslateController],
  providers: [TranslateService, SurveyService, TranslatorService],
})
export class TranslateModule { }
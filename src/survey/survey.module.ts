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
            urls: [`amqp://${configService.get('RABBITMQ_DEFAULT_USER')}:${configService.get('RABBITMQ_DEFAULT_PASS')}@localhost:5672`],
            queue: 'survey_queue',
            queueOptions: {
              durable: true
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

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { FeedbackService } from './feedback.service';
import { FeedbackController } from './feedback.controller';
import { Feedback, FeedbackSchema } from './feedback.schema';
import { Survey, SurveySchema } from '../survey/survey.schema';
import { LoggerModule } from '../logger/logger.module';
import { SentimentService } from './services/sentiment.service';
import { FeedbackCacheService } from './services/cache.service';
import { FeedbackAnalysisService } from './services/feedback-analysis.service';
import { FeedbackExportService } from './services/feedback-export.service';
import { FeedbackFilterService } from './services/feedback-filter.service';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: Feedback.name, schema: FeedbackSchema },
      { name: Survey.name, schema: SurveySchema }
    ]),
    ClientsModule.registerAsync([
      {
        name: 'FEEDBACK_SERVICE',
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [configService.get<string>('RABBITMQ_URL') || 'amqp://localhost:5672'],
            queue: 'feedback_queue',
            queueOptions: {
              durable: true
            },
          },
        }),
        inject: [ConfigService],
      },
    ]),
    LoggerModule,
  ],
  controllers: [FeedbackController],
  providers: [
    FeedbackService,
    SentimentService,
    FeedbackCacheService,
    FeedbackAnalysisService,
    FeedbackExportService,
    FeedbackFilterService,
    {
      provide: 'REDIS_CLIENT',
      useFactory: async (configService: ConfigService) => {
        const { createClient } = await import('redis');
        const client = createClient({
          url: `redis://${configService.get('REDIS_HOST')}:${configService.get('REDIS_PORT')}`
        });
        await client.connect();
        return client;
      },
      inject: [ConfigService],
    }
  ],
  exports: [FeedbackService]
})
export class FeedbackModule {}

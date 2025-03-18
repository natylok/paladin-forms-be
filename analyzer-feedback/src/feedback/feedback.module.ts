import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FeedbackService } from './feedback.service';
import { Feedback, FeedbackSchema } from './feedback.schema';
import { SentimentService } from './senstiment.service';
import { FeedbackController } from './feedback.controller';
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Feedback.name, schema: FeedbackSchema }
    ])
  ],
  controllers: [FeedbackController],
  providers: [
    FeedbackService,
    SentimentService
  ],
  exports: [FeedbackService]
})
export class FeedbackModule {} 
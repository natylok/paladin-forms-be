import { Controller, Post, Body, Param } from '@nestjs/common';
import { FeedbackService } from './feedback.service';
import { EventPattern, Payload } from '@nestjs/microservices';
import { Feedback } from './feedback.schema';
import { SurveyComponentType } from 'src/survey/survey.schema';

@Controller('feedback')
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @Post(':surveyId')
  async submitFeedback(@Param('surveyId') surveyId: string, @Body() responses: Partial<Record<SurveyComponentType, string>>) {
    console.log(`Received feedback for survey ${surveyId}:`, responses);
    await this.feedbackService.submitFeedback(surveyId, responses);
    return { message: 'Feedback submitted successfully!' };
  }

  @EventPattern('feedback_created')
  handleFeedbackCreated(@Payload() payload: Feedback){
    console.log(payload, "done")
    this.feedbackService.saveFeedback(payload);
  }
}

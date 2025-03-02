import { Controller, Post, Body, Param } from '@nestjs/common';
import { FeedbackService } from './feedback.service';
import { EventPattern, Payload } from '@nestjs/microservices';

@Controller('feedback')
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @Post(':surveyId')
  async submitFeedback(@Param('surveyId') surveyId: string, @Body() responses: any) {
    console.log(`Received feedback for survey ${surveyId}:`, responses);
    await this.feedbackService.submitFeedback(surveyId, responses);
    return { message: 'Feedback submitted successfully!' };
  }

  @EventPattern('feedback_created')
  func(@Payload() payload: any){
    console.log("hello", payload)
  }
}

import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { FeedbackService } from './feedback.service';

@Controller()
export class FeedbackController {
  private readonly logger = new Logger(FeedbackController.name);

  constructor(private readonly feedbackService: FeedbackService) {}

  @EventPattern('feedback.created')
  async handleFeedbackCreated(@Payload() data: any) {
    try {
      this.logger.log(`Received feedback for survey: ${data.surveyId}`);
      await this.feedbackService.processFeedback(data);
      this.logger.log(`Successfully processed feedback for survey: ${data.surveyId}`);
    } catch (error) {
      this.logger.error(
        `Failed to process feedback: ${error.message}`,
        error.stack
      );
    }
  }

  @EventPattern('feedback.analyze')
  async handleAnalyzeFeedback(@Payload() data: { surveyId: string }) {
    try {
      this.logger.log(`Analyzing feedback for survey: ${data.surveyId}`);
      const analysis = await this.feedbackService.getFeedbackAnalysis(data.surveyId);
      this.logger.log(`Analysis completed for survey: ${data.surveyId}`);
      return analysis;
    } catch (error) {
      this.logger.error(
        `Failed to analyze feedback: ${error.message}`,
        error.stack
      );
      throw error;
    }
  }
} 
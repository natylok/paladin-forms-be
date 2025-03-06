import { Controller, Post, Body, Param, Get, Req, UseGuards } from '@nestjs/common';
import { FeedbackService } from './feedback.service';
import { EventPattern, Payload } from '@nestjs/microservices';
import { Feedback } from './feedback.schema';
import { SurveyComponentType } from 'src/survey/survey.schema';
import { User } from '@prisma/client';
import { Request } from 'express';
import { JwtGuard } from 'src/auth/guards';

@Controller('feedbacks')
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) { }

  @Post(':surveyId/submit')
  async submitFeedback(@Param('surveyId') surveyId: string, @Body() responses: Record<string, { componentType: string, value: string }>) {
    await this.feedbackService.submitFeedback(surveyId, responses);
    return { message: 'Feedback submitted successfully!' };
  }

  @UseGuards(JwtGuard)
  @Get('')
  async getAllFeedbacks(@Req() req: Request) {
    return this.feedbackService.getFeedbacks(req.user as User);
  }

  @UseGuards(JwtGuard)
  @Get('summerize')
  async summerizeFeedbacks(@Req() req: Request) {
    return this.feedbackService.summerizeAllFeedbacks(req.user as User);
  }

  @UseGuards(JwtGuard)
  @Get('overview')
  async overviewFeedbacks(@Req() req: Request) {
    return this.feedbackService.overviewFeedbacks(req.user as User);
  }

  @EventPattern('feedback_created')
  handleFeedbackCreated(@Payload() payload: Feedback) {
    this.feedbackService.saveFeedback(payload);
  }
}

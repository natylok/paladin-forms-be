import { Controller, Post, Body, Param, Get, Req, UseGuards, HttpException, HttpStatus, Query, Res } from '@nestjs/common';
import { FeedbackService } from './feedback.service';
import { EventPattern, Payload } from '@nestjs/microservices';
import { Feedback } from './feedback.schema';
import { User } from '@prisma/client';
import { Request, Response } from 'express';
import { JwtGuard } from 'src/auth/guards';
import { PremiumGuard } from 'src/auth/guards/premium.guard';
import { LoggerService } from '../logger/logger.service';
import { FilterType } from './types/feedback.types';
import { SurveyComponentType } from '@natylok/paladin-forms-common';

@Controller('feedbacks')
export class FeedbackController {
  constructor(
    private readonly feedbackService: FeedbackService,
    private readonly logger: LoggerService
  ) { }

  @Post(':surveyId/submit')
  async submitFeedback(
    @Param('surveyId') surveyId: string,
    @Body() responses: Record<string, { componentType: SurveyComponentType, value: string, title: string }>
  ) {
    try {
      this.logger.log('Submitting feedback', { surveyId, responses });
      await this.feedbackService.submitFeedback(surveyId, responses);
      this.logger.log('Feedback submitted successfully', { surveyId });
      return { message: 'Feedback submitted successfully!' };
    } catch (error) {
      this.logger.error(
        'Error submitting feedback',
        error instanceof Error ? error.stack : undefined,
        { surveyId, responses }
      );
      throw new HttpException(
        'Failed to submit feedback',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @UseGuards(JwtGuard)
  @Get('')
  async getAllFeedbacks(
    @Req() req: Request,
    @Query('page') page?: string
  ) {
    try {
      const user = req.user as User;
      const pageNumber = page ? parseInt(page, 10) : 1;
      const filter = user.customerId ? { customerId: user.customerId } : { creatorEmail: user.email };
      this.logger.log('Fetching all feedbacks', { page: pageNumber, filter });
      const { feedbacks, totalPages } = await this.feedbackService.getFeedbacks(user, pageNumber);

      this.logger.log('Feedbacks fetched successfully', {
        user: user.email,
        customerId: user.customerId,
        count: feedbacks.length,
        page: pageNumber,
        totalPages
      });

      return {
        feedbacks,
        pagination: {
          currentPage: pageNumber,
          totalPages,
          itemsPerPage: 100
        }
      };
    } catch (error) {
      this.logger.error(
        'Error fetching feedbacks',
        error instanceof Error ? error.stack : undefined,
        { user: (req.user as User)?.email, page: page }
      );
      throw new HttpException(
        'Failed to fetch feedbacks',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @UseGuards(JwtGuard, PremiumGuard)
  @Get('summerize')
  async summerizeFeedbacks(@Req() req: Request, @Param('timeFrame') timeFrame?: string) {
    try {
      const user = req.user as User;
      this.logger.log('Summarizing feedbacks', { user: user.email });
      const summary = await this.feedbackService.summerizeAllFeedbacks(user, timeFrame);
      this.logger.log('Feedbacks summarized successfully', { user: user.email });
      return summary;
    } catch (error) {
      this.logger.error(
        'Error summarizing feedbacks',
        error instanceof Error ? error.stack : undefined,
        { user: (req.user as User)?.email }
      );
      throw new HttpException(
        'Failed to summarize feedbacks',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @UseGuards(JwtGuard, PremiumGuard)
  @Get(':surveyId/export')
  async exportFeedbacks(@Req() req: Request, @Res() res: Response, @Param('surveyId') surveyId: string) {
    try {
      const user = req.user as User;
      this.logger.log('Exporting feedbacks to CSV', { user: user.email, surveyId });

      const csvData = await this.feedbackService.exportFeedbacksToCSV(user, surveyId);

      // Set response headers for file download
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=feedbacks_${surveyId}_${Date.now()}.csv`);

      // Send the CSV data directly
      res.send(csvData);

      this.logger.log('Feedbacks exported successfully', { user: user.email, surveyId });
    } catch (error) {
      this.logger.error(
        'Error exporting feedbacks',
        error instanceof Error ? error.stack : undefined,
        { user: (req.user as User)?.email, surveyId }
      );
      throw new HttpException(
        'Failed to export feedbacks',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @UseGuards(JwtGuard, PremiumGuard)
  @Get('filters')
  async getAvailableFilters(@Req() req: Request) {
    try {
      const user = req.user as User;
      this.logger.log('Getting available filters', { user: user.email, customerId: user.customerId });
      const filters = await this.feedbackService.getAvailableFilters();
      this.logger.log('Available filters retrieved successfully', { user: user.email, customerId: user.customerId });
      return filters;
    } catch (error) {
      this.logger.error(
        'Error getting available filters',
        error instanceof Error ? error.stack : undefined,
        { user: (req.user as User)?.email }
      );
      throw new HttpException(
        'Failed to get available filters',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @UseGuards(JwtGuard, PremiumGuard)
  @Get('filter/:filterType')
  async getFilteredFeedbacks(
    @Req() req: Request,
    @Param('filterType') filterType: FilterType,
    @Query('surveyId') surveyId?: string
  ) {
    try {
      const user = req.user as User;
      this.logger.log('Getting filtered feedbacks', { user: user.email, filterType, surveyId });
      const { feedbacks, total } = await this.feedbackService.getFilteredFeedbacks(user, filterType, surveyId);
      this.logger.log('Filtered feedbacks retrieved successfully', {
        user: user.email,
        filterType,
        count: feedbacks.length
      });
      return {
        feedbacks,
        total
      };
    } catch (error) {
      this.logger.error(
        'Error getting filtered feedbacks',
        error instanceof Error ? error.stack : undefined,
        { user: (req.user as User)?.email, filterType, surveyId }
      );
      throw new HttpException(
        'Failed to get filtered feedbacks',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @UseGuards(JwtGuard)
  @Get(':surveyId/summary')
  async getSurveySummary(@Req() req: Request, @Param('surveyId') surveyId: string) {
    try {
      const user = req.user as User;
      this.logger.log('Getting survey summary', { user: user.email, surveyId });
      return await this.feedbackService.getSurveySummary(user, surveyId)
    }
    catch (error) {
      this.logger.error(
        'Error getting survey summary',
        error instanceof Error ? error.stack : undefined,
        { user: (req.user as User)?.email, surveyId }
      );
      throw new HttpException(
        'Failed to get survey summary',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}

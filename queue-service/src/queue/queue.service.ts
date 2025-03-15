import { Injectable, Logger, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { EmailData, EmailTrigger, PublicationEvent, TimeFrame } from './types/queue.types';

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(
    @Inject('EMAIL_SERVICE') private readonly emailClient: ClientProxy,
    @Inject('SCHEDULER_SERVICE') private readonly schedulerClient: ClientProxy,
    @Inject('DLX_SERVICE') private readonly dlxClient: ClientProxy
  ) {}

  async handlePublicationEvent(event: PublicationEvent): Promise<void> {
    try {
      this.logger.log('Handling publication event', { 
        action: event.action, 
        id: event.id 
      });

      if (event.action === 'delete') {
        // If publication is deleted, we don't need to schedule anything
        return;
      }

      const ttl = this.calculateTTL(event.timeFrame);
      
      const emailTrigger: EmailTrigger = {
        publicationId: event.id,
        timeFrame: event.timeFrame,
        emails: event.emails,
        customerId: event.customerId,
        triggerAt: new Date(Date.now() + ttl)
      };

      // Schedule the email trigger using DLX pattern
      await this.schedulerClient.emit('schedule.email', {
        ...emailTrigger,
        expiration: ttl.toString()
      }).toPromise();

      this.logger.log('Email trigger scheduled with DLX', {
        publicationId: event.id,
        triggerAt: emailTrigger.triggerAt,
        ttl
      });
    } catch (error) {
      this.logger.error(
        'Failed to handle publication event',
        error instanceof Error ? error.stack : undefined,
        { event }
      );
      throw error;
    }
  }

  async sendFeedbackSummaryEmail(data: EmailData): Promise<void> {
    try {
      this.logger.log('Sending feedback summary email', {
        publicationId: data.publicationId,
        emails: data.emails
      });

      // Format the email content based on the summary
      const emailContent = this.formatEmailContent(data);

      // Emit to email sending queue
      await this.emailClient.emit('email.send', {
        to: data.emails,
        subject: `Feedback Summary - ${this.getTimeFrameText(data.timeFrame)}`,
        content: emailContent
      }).toPromise();

      this.logger.log('Feedback summary email sent', {
        publicationId: data.publicationId,
        emails: data.emails
      });
    } catch (error) {
      this.logger.error(
        'Failed to send feedback summary email',
        error instanceof Error ? error.stack : undefined,
        { data }
      );
      throw error;
    }
  }

  private calculateTTL(timeFrame: TimeFrame): number {
    const now = new Date();
    const targetDate = new Date(now);

    switch (timeFrame) {
      case 'day': {
        // Set to end of current day (23:59:59)
        targetDate.setHours(23, 59, 59, 999);
        break;
      }
      case 'week': {
        // Set to end of current week (Sunday 23:59:59)
        const daysUntilSunday = 7 - now.getDay();
        targetDate.setDate(now.getDate() + daysUntilSunday);
        targetDate.setHours(23, 59, 59, 999);
        break;
      }
      case 'month': {
        // Set to end of current month (last day 23:59:59)
        targetDate.setMonth(targetDate.getMonth() + 1, 0);
        targetDate.setHours(23, 59, 59, 999);
        break;
      }
    }

    // Calculate TTL in milliseconds
    return targetDate.getTime() - now.getTime();
  }

  private formatEmailContent(data: EmailData): string {
    const { summary, timeFrame } = data;
    const period = this.getTimeFrameText(timeFrame);

    return `
      <h1>Feedback Summary - ${period}</h1>

      <h2>Overview</h2>
      <ul>
        <li>Total Feedbacks: ${summary.statistics.totalFeedbacks}</li>
        <li>Text Responses: ${summary.statistics.textResponseCount}</li>
        <li>Average Sentiment: ${summary.statistics.averageSentiment.toFixed(2)}</li>
      </ul>

      <h2>Sentiment Distribution</h2>
      <ul>
        <li>Positive: ${summary.sentimentDistribution.positive}</li>
        <li>Neutral: ${summary.sentimentDistribution.neutral}</li>
        <li>Negative: ${summary.sentimentDistribution.negative}</li>
      </ul>

      <h2>Key Insights</h2>
      <h3>Top Strengths</h3>
      <ul>
        ${summary.textAnalysis.topStrengths.map(s => `<li>${s}</li>`).join('')}
      </ul>

      <h3>Top Concerns</h3>
      <ul>
        ${summary.textAnalysis.topConcerns.map(c => `<li>${c}</li>`).join('')}
      </ul>

      <h3>Suggestions</h3>
      <ul>
        ${summary.textAnalysis.suggestions.map(s => `<li>${s}</li>`).join('')}
      </ul>

      ${summary.textAnalysis.urgentIssues.length > 0 ? `
        <h3>Urgent Issues</h3>
        <ul>
          ${summary.textAnalysis.urgentIssues.map(i => `<li>${i}</li>`).join('')}
        </ul>
      ` : ''}

      <h2>Rating Statistics</h2>
      <p>Average Rating: ${summary.statistics.ratingStats.average.toFixed(2)} out of 5</p>
      <p>Total Ratings: ${summary.statistics.ratingStats.total}</p>

      <h2>1-10 Scale Statistics</h2>
      <p>Average Score: ${summary.statistics["1to10"].average.toFixed(2)} out of 10</p>
      <p>Total Responses: ${summary.statistics["1to10"].total}</p>
    `;
  }

  private getTimeFrameText(timeFrame: TimeFrame): string {
    switch (timeFrame) {
      case 'day':
        return 'Daily Report';
      case 'week':
        return 'Weekly Report';
      case 'month':
        return 'Monthly Report';
      default:
        return 'Report';
    }
  }
} 
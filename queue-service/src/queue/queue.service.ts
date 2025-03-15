import { Injectable, Logger, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { EmailData, EmailTrigger, PublicationEvent, TimeFrame } from './types/queue.types';
import { lastValueFrom } from 'rxjs';

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(
    @Inject('EMAIL_SERVICE') private readonly emailClient: ClientProxy,
    @Inject('SCHEDULER_SERVICE') private readonly schedulerClient: ClientProxy
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

      // Schedule the task
      await lastValueFrom(
        this.schedulerClient.emit('scheduled.task', {
          ...emailTrigger,
          headers: {
            'x-message-ttl': ttl
          }
        })
      );

      this.logger.log('Email task scheduled', {
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

  calculateTTL(timeFrame: TimeFrame): number {
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

  async sendFeedbackSummaryEmail(data: EmailData): Promise<void> {
    try {
      this.logger.log('Sending feedback summary email', {
        publicationId: data.publicationId,
        emails: data.emails
      });

      // Format the email content based on the summary
      const emailContent = this.formatEmailContent(data);

      // Emit to email sending queue
      await lastValueFrom(
        this.emailClient.emit('email.send', {
          to: data.emails,
          subject: `Feedback Summary - ${this.getTimeFrameText(data.timeFrame)}`,
          content: emailContent
        })
      );

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

  formatEmailContent(data: EmailData): string {
    const { summary, timeFrame } = data;
    const period = this.getTimeFrameText(timeFrame);

    return `
      <h1>Feedback Summary - ${period}</h1>
      <p>Test email content for ${period}</p>
    `;
  }

  getTimeFrameText(timeFrame: TimeFrame): string {
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
import { Controller, Logger, Inject } from '@nestjs/common';
import { EventPattern, Payload, ClientProxy } from '@nestjs/microservices';
import { HttpService } from '@nestjs/axios';
import { QueueService } from './queue.service';
import { EmailData, EmailTrigger, PublicationEvent } from './types/queue.types';
import { lastValueFrom } from 'rxjs';

@Controller()
export class QueueController {
  private readonly logger = new Logger(QueueController.name);
  private readonly apiUrl = 'http://localhost:3333/internal/email';

  constructor(
    private readonly queueService: QueueService,
    @Inject('EMAIL_SERVICE') private readonly emailClient: ClientProxy,
    @Inject('SCHEDULER_SERVICE') private readonly schedulerClient: ClientProxy,
    private readonly httpService: HttpService
  ) {}

  @EventPattern('publication.created')
  async handlePublicationCreated(@Payload() data: PublicationEvent) {
    try {
      this.logger.log('Received publication.created event', { id: data.id });
      await this.queueService.handlePublicationEvent({
        ...data,
        action: 'create'
      });
    } catch (error) {
      this.logger.error(
        'Failed to handle publication.created event',
        error instanceof Error ? error.stack : undefined,
        { data }
      );
    }
  }

  @EventPattern('publication.updated')
  async handlePublicationUpdated(@Payload() data: PublicationEvent) {
    try {
      this.logger.log('Received publication.updated event', { id: data.id });
      await this.queueService.handlePublicationEvent({
        ...data,
        action: 'update'
      });
    } catch (error) {
      this.logger.error(
        'Failed to handle publication.updated event',
        error instanceof Error ? error.stack : undefined,
        { data }
      );
    }
  }

  @EventPattern('scheduled.task')
  async handleScheduledTask(@Payload() data: EmailTrigger & { headers: { 'x-message-ttl': number } }) {
    try {
      this.logger.log('Processing scheduled task', {
        publicationId: data.publicationId,
        triggerAt: data.triggerAt,
        ttl: data.headers['x-message-ttl']
      });

      // Get feedback summary from analyzer service
      const summary = await lastValueFrom(
        this.emailClient.send('feedback.summary', {
          publicationId: data.publicationId,
          timeFrame: data.timeFrame
        })
      );

      // Format email content
      const emailContent = this.queueService.formatEmailContent({
        ...data,
        summary
      });

      // Send email using internal API
      await lastValueFrom(
        this.httpService.post(
          `${this.apiUrl}/send`,
          {
            to: data.emails,
            subject: `Feedback Summary - ${this.queueService.getTimeFrameText(data.timeFrame)}`,
            html: emailContent
          },
          {
            headers: {
              'x-internal-key': process.env.INTERNAL_API_KEY
            }
          }
        )
      );

      this.logger.log('Email sent successfully', {
        publicationId: data.publicationId,
        to: data.emails
      });

      // Schedule the next email
      const ttl = this.queueService.calculateTTL(data.timeFrame);
      const nextTrigger: EmailTrigger = {
        publicationId: data.publicationId,
        timeFrame: data.timeFrame,
        emails: data.emails,
        customerId: data.customerId,
        triggerAt: new Date(Date.now() + ttl)
      };

      await lastValueFrom(
        this.schedulerClient.emit('scheduled.task', {
          ...nextTrigger,
          headers: {
            'x-message-ttl': ttl
          }
        })
      );

      this.logger.log('Next email task scheduled', {
        publicationId: data.publicationId,
        triggerAt: nextTrigger.triggerAt,
        ttl
      });

    } catch (error) {
      this.logger.error(
        'Failed to process scheduled task',
        error instanceof Error ? error.stack : undefined,
        { data }
      );
    }
  }
} 
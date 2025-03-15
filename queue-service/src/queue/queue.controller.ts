import { Controller, Logger, Inject } from '@nestjs/common';
import { EventPattern, Payload, ClientProxy, Ctx, RmqContext } from '@nestjs/microservices';
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
  ) {
    this.logger.log('Queue controller initialized');
  }

  @EventPattern('publication.created')
  async handlePublicationCreated(@Payload() data: PublicationEvent, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      this.logger.log('Received publication.created event', { 
        id: data.id,
        timeFrame: data.timeFrame,
        emails: data.emails?.length
      });

      await this.queueService.handlePublicationEvent({
        ...data,
        action: 'create'
      });

      this.logger.log('Successfully handled publication.created event', { id: data.id });
      channel.ack(originalMsg);
    } catch (error) {
      this.logger.error(
        'Failed to handle publication.created event',
        error instanceof Error ? error.stack : undefined,
        { data }
      );
      channel.nack(originalMsg);
    }
  }

  @EventPattern('publication.updated')
  async handlePublicationUpdated(@Payload() data: PublicationEvent, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      this.logger.log('Received publication.updated event', { 
        id: data.id,
        timeFrame: data.timeFrame,
        emails: data.emails?.length
      });

      await this.queueService.handlePublicationEvent({
        ...data,
        action: 'update'
      });

      this.logger.log('Successfully handled publication.updated event', { id: data.id });
      channel.ack(originalMsg);
    } catch (error) {
      this.logger.error(
        'Failed to handle publication.updated event',
        error instanceof Error ? error.stack : undefined,
        { data }
      );
      channel.nack(originalMsg);
    }
  }

  @EventPattern('scheduled.task')
  async handleScheduledTask(
    @Payload() data: EmailTrigger & { headers: { 'x-message-ttl': number } },
    @Ctx() context: RmqContext
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      this.logger.log('Processing scheduled task', {
        publicationId: data.publicationId,
        triggerAt: data.triggerAt,
        ttl: data.headers['x-message-ttl']
      });

      // Get feedback summary from analyzer service
      this.logger.log('Fetching feedback summary', { publicationId: data.publicationId });
      const summary = await lastValueFrom(
        this.emailClient.send('feedback.summary', {
          publicationId: data.publicationId,
          timeFrame: data.timeFrame
        })
      );

      // Format email content
      this.logger.log('Formatting email content', { publicationId: data.publicationId });
      const emailContent = this.queueService.formatEmailContent({
        ...data,
        summary
      });

      // Send email using internal API
      this.logger.log('Sending email via internal API', {
        publicationId: data.publicationId,
        to: data.emails
      });

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

      this.logger.log('Scheduling next email task', {
        publicationId: data.publicationId,
        triggerAt: nextTrigger.triggerAt,
        ttl
      });

      await lastValueFrom(
        this.schedulerClient.emit('scheduled.task', {
          ...nextTrigger,
          headers: {
            'x-message-ttl': ttl
          }
        })
      );

      this.logger.log('Next email task scheduled successfully', {
        publicationId: data.publicationId,
        triggerAt: nextTrigger.triggerAt
      });

      channel.ack(originalMsg);
    } catch (error) {
      this.logger.error(
        'Failed to process scheduled task',
        error instanceof Error ? error.stack : undefined,
        { data }
      );
      channel.nack(originalMsg);
    }
  }
} 
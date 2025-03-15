import { Controller, Logger, Inject } from '@nestjs/common';
import { EventPattern, Payload, ClientProxy } from '@nestjs/microservices';
import { QueueService } from './queue.service';
import { EmailData, EmailTrigger, PublicationEvent } from './types/queue.types';
import { lastValueFrom } from 'rxjs';

@Controller()
export class QueueController {
  private readonly logger = new Logger(QueueController.name);

  constructor(
    private readonly queueService: QueueService,
    @Inject('EMAIL_SERVICE') private readonly emailClient: ClientProxy
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

  @EventPattern('dlx.trigger')
  async handleDLXTrigger(@Payload() data: EmailTrigger) {
    try {
      this.logger.log('Processing DLX trigger for scheduled email', { 
        publicationId: data.publicationId,
        triggerAt: data.triggerAt
      });

      // Get feedback summary from analyzer service
      const summary = await lastValueFrom(
        this.emailClient.send('feedback.summary', {
          publicationId: data.publicationId,
          timeFrame: data.timeFrame
        })
      );

      // Send email with feedback summary
      const emailData: EmailData = {
        ...data,
        summary
      };

      await this.queueService.sendFeedbackSummaryEmail(emailData);

      this.logger.log('DLX trigger processed successfully', {
        publicationId: data.publicationId
      });
    } catch (error) {
      this.logger.error(
        'Failed to process DLX trigger',
        error instanceof Error ? error.stack : undefined,
        { data }
      );
    }
  }
} 
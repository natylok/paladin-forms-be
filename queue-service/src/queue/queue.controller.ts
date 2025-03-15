import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload, Ctx, RmqContext } from '@nestjs/microservices';
import { QueueService } from './queue.service';
import { PublicationEvent } from './types/queue.types';

@Controller()
export class QueueController {
  private readonly logger = new Logger(QueueController.name);

  constructor(
    private readonly queueService: QueueService
  ) {
    this.logger.log('Queue controller initialized');
  }

  @EventPattern('publication.created')
  async handlePublicationCreated(@Payload() data: PublicationEvent, @Ctx() context: RmqContext) {
    this.queueService.handlePublicationEvent({
      ...data,
      action: 'create'
    });
  }

  @EventPattern('publication.updated')
  async handlePublicationUpdated(@Payload() data: PublicationEvent, @Ctx() context: RmqContext) {
    this.queueService.handlePublicationEvent({
      ...data,
      action: 'update'
    });
  }

  @EventPattern('publication.deleted')
  async handlePublicationDeleted(@Payload() data: PublicationEvent, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      this.logger.log('Received publication.deleted event', { 
        id: data.id,
        timeFrame: data.timeFrame,
        emails: data.emails?.length
      });

      await this.queueService.handlePublicationEvent({
        ...data,
        action: 'delete'
      });

      channel.ack(originalMsg);
      this.logger.log('Successfully processed publication.deleted event', { id: data.id });
    } catch (error) {
      this.logger.error(
        'Failed to handle publication.deleted event',
        error instanceof Error ? error.stack : undefined,
        { data }
      );
      // Requeue the message if it's a temporary failure
      channel.nack(originalMsg, false, true);
    }
  }
} 
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

      channel.ack(originalMsg);
    } catch (error) {
      this.logger.error(
        'Failed to handle publication.created event',
        error instanceof Error ? error.stack : undefined,
        { data }
      );
      channel.nack(originalMsg, false, true);
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

      channel.ack(originalMsg);
    } catch (error) {
      this.logger.error(
        'Failed to handle publication.updated event',
        error instanceof Error ? error.stack : undefined,
        { data }
      );
      channel.nack(originalMsg, false, true);
    }
  }

  @EventPattern('publication.deleted')
  async handlePublicationDeleted(@Payload() data: PublicationEvent, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      this.logger.log('Received publication.deleted event', { 
        id: data.id
      });

      await this.queueService.handlePublicationEvent({
        ...data,
        action: 'delete'
      });

      channel.ack(originalMsg);
    } catch (error) {
      this.logger.error(
        'Failed to handle publication.deleted event',
        error instanceof Error ? error.stack : undefined,
        { data }
      );
      channel.nack(originalMsg, false, true);
    }
  }
} 
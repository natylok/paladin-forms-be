import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload, Ctx, RmqContext } from '@nestjs/microservices';
import { QueueService } from './queue.service';

@Controller()
export class QueueController {
  private readonly logger = new Logger(QueueController.name);

  constructor(private readonly queueService: QueueService) {}

  @EventPattern('publication.created')
  async handlePublicationCreated(@Payload() data: any, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      this.logger.log('Received publication.created event', { id: data.id });
      await this.queueService.handlePublicationEvent(data);
      channel.ack(originalMsg);
      this.logger.log('Successfully processed publication.created event', { id: data.id });
    } catch (error) {
      this.logger.error(
        'Failed to process publication.created event',
        error instanceof Error ? error.stack : undefined,
        { id: data.id }
      );
      channel.nack(originalMsg, false, true);
    }
  }

  @EventPattern('publication.updated')
  async handlePublicationUpdated(@Payload() data: any, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      this.logger.log('Received publication.updated event', { id: data.id });
      await this.queueService.handlePublicationEvent(data);
      channel.ack(originalMsg);
      this.logger.log('Successfully processed publication.updated event', { id: data.id });
    } catch (error) {
      this.logger.error(
        'Failed to process publication.updated event',
        error instanceof Error ? error.stack : undefined,
        { id: data.id }
      );
      channel.nack(originalMsg, false, true);
    }
  }

  @EventPattern('publication.deleted')
  async handlePublicationDeleted(@Payload() data: any, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      this.logger.log('Received publication.deleted event', { id: data.id });
      await this.queueService.handlePublicationEvent(data);
      channel.ack(originalMsg);
      this.logger.log('Successfully processed publication.deleted event', { id: data.id });
    } catch (error) {
      this.logger.error(
        'Failed to process publication.deleted event',
        error instanceof Error ? error.stack : undefined,
        { id: data.id }
      );
      channel.nack(originalMsg, false, true);
    }
  }
} 
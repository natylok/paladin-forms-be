import { Inject, Injectable, Logger } from '@nestjs/common';
import { PublicationEvent } from './types/queue.types';
import { ClientProxy } from '@nestjs/microservices';

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);
  constructor(
    @Inject('PUBLICATION_SERVICE') private readonly client: ClientProxy
  ) { }

  async handlePublicationEvent(event: PublicationEvent): Promise<void> {
    try {
      this.logger.log('Received publication event', { 
        action: event.action, 
        id: event.id,
        timeFrame: event.timeFrame,
        emails: event.emails?.length
      });

      if (event.action === 'create') {
        await this.client.emit('publication.created', event);
      } else if (event.action === 'update') {
        await this.client.emit('publication.updated', event);
      }
    } catch (error) {
      this.logger.error(
        'Failed to handle publication event',
        error instanceof Error ? error.stack : undefined,
        { event }
      );
      throw error;
    }
  }
}
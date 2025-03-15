import { Injectable, Logger } from '@nestjs/common';
import { PublicationEvent } from './types/queue.types';

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  async handlePublicationEvent(event: PublicationEvent): Promise<void> {
    try {
      this.logger.log('Received publication event', { 
        action: event.action, 
        id: event.id,
        timeFrame: event.timeFrame,
        emails: event.emails?.length
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
}
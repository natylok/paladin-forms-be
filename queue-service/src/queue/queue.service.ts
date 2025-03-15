import { Injectable, Logger } from '@nestjs/common';
import { PublicationEvent } from './types/queue.types';

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  async handlePublicationEvent(event: PublicationEvent): Promise<void> {
    try {
      this.logger.log('Processing publication event', { 
        action: event.action, 
        id: event.id,
        timeFrame: event.timeFrame,
        emails: event.emails?.length
      });

      // Here you can add any specific handling logic for different event types
      switch (event.action) {
        case 'create':
          this.logger.log('Processing publication creation', { id: event.id });
          break;
        case 'update':
          this.logger.log('Processing publication update', { id: event.id });
          break;
        case 'delete':
          this.logger.log('Processing publication deletion', { id: event.id });
          break;
        default:
          this.logger.warn('Unknown publication event action', { action: event.action });
      }

    } catch (error) {
      this.logger.error(
        'Failed to process publication event',
        error instanceof Error ? error.stack : undefined,
        { event }
      );
      throw error;
    }
  }
}
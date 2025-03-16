import { Injectable, Logger, Inject } from '@nestjs/common';
import { PublicationEvent } from './types/queue.types';
import { ClientProxy } from '@nestjs/microservices';

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(
    @Inject('PUBLICATION_SERVICE') private readonly client: ClientProxy
  ) {}

  async handlePublicationEvent(event: PublicationEvent): Promise<void> {
    try {
      this.logger.log('Processing publication event', {
        action: event.action,
        id: event.id,
        timeFrame: event.timeFrame,
        emails: event.emails?.length
      });

      const delay = 15000; // 15 seconds delay

      switch (event.action) {
        case 'create':
        case 'update':
          this.logger.log('Publication change triggered, scheduling delayed notification');
          try {
            await this.client.emit('send_email', {
              data: event,
              options: {
                headers: {
                  'x-delay': delay
                }
              }
            }).toPromise();

            this.logger.log('Publication notification scheduled successfully', { 
              id: event.id,
              delay,
              scheduledFor: new Date(Date.now() + delay).toISOString()
            });
          } catch (error) {
            this.logger.error(
              'Failed to schedule publication notification',
              error instanceof Error ? error.stack : undefined,
              { id: event.id }
            );
          }
          break;
        case 'delete':
          this.logger.log('Processing publication deletion', { id: event.id });
          await this.client.emit('publication.deleted', event).toPromise();
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
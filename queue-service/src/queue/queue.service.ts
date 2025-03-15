import { Injectable, Logger, Inject } from '@nestjs/common';
import { PublicationEvent } from './types/queue.types';
import { ClientProxy } from '@nestjs/microservices';

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(
    @Inject('PUBLICATION_SERVICE') private readonly client: ClientProxy
  ) {}

  private calculateTTL(): number {
    // For testing, using 5 seconds
    return 5000; // 5 seconds in milliseconds
  }

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
        case 'update':
          this.logger.log('Publication change triggered, scheduling email notification');
          try {
            const ttl = this.calculateTTL();
            
            // Schedule the email sending with TTL
            await this.client.emit('send_email', {
              to: event.emails,
              subject: 'Publication Summary',
              creatorEmail: event.creatorEmail,
              html: 'Your publication summary is ready.',
              ttl
            }).toPromise();

            this.logger.log('Email notification scheduled successfully', { 
              id: event.id,
              ttl,
              scheduledFor: new Date(Date.now() + ttl).toISOString()
            });
          } catch (emailError) {
            this.logger.error(
              'Failed to schedule email notification',
              emailError instanceof Error ? emailError.stack : undefined,
              { id: event.id }
            );
          }
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
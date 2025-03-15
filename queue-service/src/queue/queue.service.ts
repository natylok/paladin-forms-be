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
        case 'update':
          this.logger.log('Publication change triggered, sending email notification');
          try {
            const response = await fetch('http://paladin-forms-be:3333/internal/email/send', {
              method: 'POST',
              body: JSON.stringify({
                to: event.emails,
                subject: 'Publication change',
                html: 'A publication has been changed'
              }),
              headers: {
                'Authorization': `Bearer ${process.env.INTERNAL_API_KEY}`,
                'Content-Type': 'application/json'
              }
            });

            if (!response.ok) {
              const errorText = await response.text();
              throw new Error(`Failed to send email: ${response.status} - ${errorText}`);
            }

            this.logger.log('Email notification sent successfully', { id: event.id });
          } catch (emailError) {
            this.logger.error(
              'Failed to send email notification',
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
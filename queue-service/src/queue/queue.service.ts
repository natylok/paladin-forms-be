import { Injectable, Logger, Inject } from '@nestjs/common';
import { PublicationEvent } from './types/queue.types';
import { ClientProxy } from '@nestjs/microservices';

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);
  private readonly DELAYED_EXCHANGE = 'delayed.exchange';
  private readonly DELAYED_QUEUE = 'delayed.queue';

  constructor(
    @Inject('PUBLICATION_SERVICE') private readonly client: ClientProxy
  ) {
    this.setupDelayedExchange();
  }

  private async setupDelayedExchange(): Promise<void> {
    try {
      const channel = await (this.client as any).createChannel();
      
      // Declare the delayed message exchange
      await channel.assertExchange(this.DELAYED_EXCHANGE, 'x-delayed-message', {
        durable: true,
        arguments: { 'x-delayed-type': 'direct' }
      });

      // Declare the queue
      await channel.assertQueue(this.DELAYED_QUEUE, {
        durable: true
      });

      // Bind the queue to the exchange
      await channel.bindQueue(this.DELAYED_QUEUE, this.DELAYED_EXCHANGE, '');
    } catch (error) {
      this.logger.error('Failed to setup delayed exchange', error);
    }
  }

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
            const channel = await (this.client as any).createChannel();
            
            await channel.publish(
              this.DELAYED_EXCHANGE,
              '',
              Buffer.from(JSON.stringify(event)),
              {
                headers: {
                  'x-delay': delay
                },
                persistent: true
              }
            );

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
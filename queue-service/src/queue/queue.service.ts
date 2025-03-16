import { Injectable, Logger, Inject, OnModuleInit } from '@nestjs/common';
import { PublicationEvent } from './types/queue.types';
import { ClientProxy } from '@nestjs/microservices';
import * as amqp from 'amqplib';

@Injectable()
export class QueueService implements OnModuleInit {
  private readonly logger = new Logger(QueueService.name);
  private channel: amqp.Channel;

  constructor(
    @Inject('PUBLICATION_SERVICE') private readonly client: ClientProxy
  ) {}

  async onModuleInit() {
    try {
      const connection = await amqp.connect(`amqp://${process.env.RABBITMQ_DEFAULT_USER}:${process.env.RABBITMQ_DEFAULT_PASS}@rabbitmq:5672`);
      this.channel = await connection.createChannel();

      // Ensure the delayed message exchange exists
      await this.channel.assertExchange('delayed.exchange', 'x-delayed-message', {
        durable: true,
        arguments: {
          'x-delayed-type': 'direct'
        }
      });

      // Ensure the queue exists
      await this.channel.assertQueue('delayed.queue', {
        durable: true
      });

      // Bind the queue to the exchange
      await this.channel.bindQueue('delayed.queue', 'delayed.exchange', 'delayed');

      this.logger.log('Successfully initialized RabbitMQ delayed message setup');
    } catch (error) {
      this.logger.error('Failed to initialize RabbitMQ setup', error);
      throw error;
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
            // Publish message with delay
            await this.channel.publish(
              'delayed.exchange',
              'delayed',
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
            throw error;
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
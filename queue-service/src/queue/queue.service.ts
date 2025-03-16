import { Injectable, Logger, Inject, OnModuleInit } from '@nestjs/common';
import { PublicationEvent, TimeFrame } from './types/queue.types';
import { ClientProxy } from '@nestjs/microservices';
import * as amqp from 'amqplib';
import { async, delay } from 'rxjs';

@Injectable()
export class QueueService implements OnModuleInit {
  private readonly logger = new Logger(QueueService.name);
  private channel: amqp.Channel;
  private readonly EXCHANGE_NAME = 'delayed.exchange';
  private readonly QUEUE_NAME = 'publication_queue';
  private readonly ROUTING_KEY = 'send_email';

  constructor(
    @Inject('PUBLICATION_SERVICE') private readonly client: ClientProxy
  ) { }

  async onModuleInit() {
    try {
      const connection = await amqp.connect(`amqp://${process.env.RABBITMQ_DEFAULT_USER}:${process.env.RABBITMQ_DEFAULT_PASS}@rabbitmq:5672`);
      this.channel = await connection.createChannel();

      // Declare the delayed message exchange
      await this.channel.assertExchange(this.EXCHANGE_NAME, 'x-delayed-message', {
        durable: true,
        arguments: {
          'x-delayed-type': 'direct'
        }
      });

      // Declare the queue
      await this.channel.assertQueue(this.QUEUE_NAME, {
        durable: true
      });

      // Bind the queue to the exchange with the routing key
      await this.channel.bindQueue(this.QUEUE_NAME, this.EXCHANGE_NAME, this.ROUTING_KEY);

      this.logger.log('Successfully initialized RabbitMQ delayed message setup');
    } catch (error) {
      this.logger.error('Failed to initialize RabbitMQ setup', error);
      throw error;
    }
  }

  private calculateDelayBasedOnTimeFrame(timeFrame: TimeFrame): number {
    return 10000;
    switch (timeFrame) {
      case 'day':
        const endOfTheDay = new Date();
        endOfTheDay.setHours(23, 59, 59, 999);
        return endOfTheDay.getTime() - new Date().getTime();
      case 'week':
        const endOfTheWeek = new Date();
        endOfTheWeek.setDate(endOfTheWeek.getDate() + 7);
        return endOfTheWeek.getTime() - new Date().getTime();

      case 'month':
        const endOfTheMonth = new Date();
        endOfTheMonth.setMonth(endOfTheMonth.getMonth() + 1);
        endOfTheMonth.setDate(0);
        endOfTheMonth.setHours(23, 59, 59, 999);
        return endOfTheMonth.getTime() - new Date().getTime();
      default:
        return Infinity; // 15 seconds delay
    }
  }

  private async addEventToQueue(event: PublicationEvent): Promise<void> {
    this.logger.log('Adding event to queue for the next time', {
      id: event.id,
      timeFrame: event.timeFrame,
      emails: event.emails?.length
    });

    const delay = this.calculateDelayBasedOnTimeFrame(event.timeFrame);
    const message = {
      pattern: this.ROUTING_KEY,
      data: event
    };

    await this.channel.publish(
      this.EXCHANGE_NAME,
      this.ROUTING_KEY,
      Buffer.from(JSON.stringify(message)),
      {
        headers: {
          'x-delay': delay
        },
        persistent: true
      }
    );

    this.logger.log('Added event to queue for the next time', {
      id: event.id,
      delay,
      scheduledFor: new Date(Date.now() + delay).toISOString()
    });
  }

  async sendEmail(event: PublicationEvent): Promise<void> {
    try {
      // const response = await fetch('http://paladin-forms-be:3333/internal/email/send', {
      //   method: 'POST',
      //   body: JSON.stringify(event),
      //   headers: {
      //     'x-internal-key': process.env.INTERNAL_API_KEY,
      //     'Content-Type': 'application/json'
      //   }
      // });

      // if (!response.ok) {
      //   throw new Error(`Failed to send email: ${response.status} - ${response.statusText}`);
      // }

      this.logger.log('Email sent successfully', {
        id: event.id,
        to: event.emails,
      });
      
    } catch (error) {
      this.logger.error('Failed to send email', error);
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

      const delay = this.calculateDelayBasedOnTimeFrame(event.timeFrame);

      switch (event.action) {
        case 'create':
        case 'update':
          this.logger.log('Publication change triggered, scheduling delayed notification');
          try {
            await this.addEventToQueue(event);
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
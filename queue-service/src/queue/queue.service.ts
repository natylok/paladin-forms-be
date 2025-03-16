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
    this.logger.log('Calculating delay based on time frame', { timeFrame });
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
        return Number.MAX_SAFE_INTEGER;
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
      const response = await fetch('http://paladin-forms-be:3333/internal/email/send', {
        method: 'POST',
        body: JSON.stringify(event),
        headers: {
          'x-internal-key': process.env.INTERNAL_API_KEY,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to send email: ${response.status} - ${response.statusText}`);
      }

      this.logger.log('Email sent successfully', {
        id: event.id,
        to: event.emails,
      });

      // Schedule the next email with a 10-second delay
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
            'x-delay': delay // 10 seconds delay
          },
          persistent: true
        }
      );

      this.logger.log('Scheduled next email', {
        id: event.id,
        delay,
        scheduledFor: new Date(Date.now() + 10000).toISOString()
      });

    } catch (error) {
      this.logger.error('Failed to send email', error);
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

      this.logger.log('Scheduled next email', {
        id: event.id,
        delay
      });
      return;
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
        case 'update':
          this.logger.log('Publication changed triggered, update events', { id: event.id });
          break;
        case 'delete':
          this.logger.log('Processing publication deletion', { id: event.id });
          
          try {
            // Create a temporary queue to receive messages
            const { queue: tempQueue } = await this.channel.assertQueue('', { exclusive: true });
            
            // Bind it to the exchange
            await this.channel.bindQueue(tempQueue, this.EXCHANGE_NAME, this.ROUTING_KEY);
            
            // Get all messages from the queue
            const messages = await this.channel.consume(tempQueue, async (msg) => {
              if (msg) {
                try {
                  this.logger.log('Processing message', { messageId: msg.properties.messageId });
                  const content = JSON.parse(msg.content.toString());
                  // If the message is not for the deleted publication, requeue it
                  if (content.data.id !== event.id) {
                    this.logger.log('Requeueing message', { messageId: msg.properties.messageId });
                    await this.channel.publish(
                      this.EXCHANGE_NAME,
                      this.ROUTING_KEY,
                      msg.content,
                      {
                        headers: msg.properties.headers
                      }
                    );
                  } else {
                    this.logger.log('Removed scheduled message for deleted publication', {
                      id: event.id,
                      messageId: msg.properties.messageId
                    });
                  }
                  // Acknowledge the message
                  this.channel.ack(msg);
                } catch (error) {
                  this.logger.error('Error processing message during deletion', error);
                  this.channel.nack(msg, false, false);
                }
              }
            }, { noAck: false });

            // Delete the temporary queue
            await this.channel.unbindQueue(tempQueue, this.EXCHANGE_NAME, this.ROUTING_KEY);
            await this.channel.deleteQueue(tempQueue);

            this.logger.log('Successfully removed scheduled messages for deleted publication', {
              id: event.id
            });
          } catch (error) {
            this.logger.error('Failed to remove scheduled messages for deleted publication', error);
          }
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
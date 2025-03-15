import { Controller, Logger, Inject } from '@nestjs/common';
import { EventPattern, Payload, ClientProxy } from '@nestjs/microservices';
import { QueueService } from './queue.service';
import { EmailData, EmailTrigger, PublicationEvent } from './types/queue.types';
import { lastValueFrom } from 'rxjs';
import * as nodemailer from 'nodemailer';

@Controller()
export class QueueController {
  private readonly logger = new Logger(QueueController.name);
  private readonly transporter: nodemailer.Transporter;

  constructor(
    private readonly queueService: QueueService,
    @Inject('EMAIL_SERVICE') private readonly emailClient: ClientProxy
  ) {
    // Initialize nodemailer transporter
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  }

  @EventPattern('publication.created')
  async handlePublicationCreated(@Payload() data: PublicationEvent) {
    try {
      this.logger.log('Received publication.created event', { id: data.id });
      await this.queueService.handlePublicationEvent({
        ...data,
        action: 'create'
      });
    } catch (error) {
      this.logger.error(
        'Failed to handle publication.created event',
        error instanceof Error ? error.stack : undefined,
        { data }
      );
    }
  }

  @EventPattern('publication.updated')
  async handlePublicationUpdated(@Payload() data: PublicationEvent) {
    try {
      this.logger.log('Received publication.updated event', { id: data.id });
      await this.queueService.handlePublicationEvent({
        ...data,
        action: 'update'
      });
    } catch (error) {
      this.logger.error(
        'Failed to handle publication.updated event',
        error instanceof Error ? error.stack : undefined,
        { data }
      );
    }
  }

  @EventPattern('scheduled.task')
  async handleScheduledTask(@Payload() data: EmailTrigger & { headers: { 'x-message-ttl': number } }) {
    try {
      this.logger.log('Processing scheduled task', {
        publicationId: data.publicationId,
        triggerAt: data.triggerAt,
        ttl: data.headers['x-message-ttl']
      });

      // Get feedback summary from analyzer service
      const summary = await lastValueFrom(
        this.emailClient.send('feedback.summary', {
          publicationId: data.publicationId,
          timeFrame: data.timeFrame
        })
      );

      // Format email content
      const emailContent = this.queueService.formatEmailContent({
        ...data,
        summary
      });

      // Send email directly using nodemailer
      await this.transporter.sendMail({
        from: process.env.SMTP_FROM,
        to: data.emails,
        subject: `Feedback Summary - ${this.queueService.getTimeFrameText(data.timeFrame)}`,
        html: emailContent
      });

      this.logger.log('Email sent successfully', {
        publicationId: data.publicationId,
        to: data.emails
      });
    } catch (error) {
      this.logger.error(
        'Failed to process scheduled task',
        error instanceof Error ? error.stack : undefined,
        { data }
      );
    }
  }
} 
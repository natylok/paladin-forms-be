import { Controller, Post, Body, UseGuards, Logger } from '@nestjs/common';
import { InternalGuard } from '../guards/internal.guard';
import * as nodemailer from 'nodemailer';

interface SendEmailDto {
  to: string[];
  subject: string;
  html: string;
}

@Controller('internal/email')
@UseGuards(InternalGuard)
export class EmailController {
  private readonly logger = new Logger(EmailController.name);
  private readonly transporter: nodemailer.Transporter;

  constructor() {
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

  @Post('send')
  async sendEmail(@Body() emailData: SendEmailDto) {
    try {
      this.logger.log('Sending email', {
        to: emailData.to,
        subject: emailData.subject
      });

      await this.transporter.sendMail({
        from: process.env.SMTP_FROM,
        ...emailData
      });

      this.logger.log('Email sent successfully', {
        to: emailData.to
      });

      return { success: true };
    } catch (error) {
      this.logger.error(
        'Failed to send email',
        error instanceof Error ? error.stack : undefined,
        { emailData }
      );
      throw error;
    }
  }
} 
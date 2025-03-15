import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

interface SendEmailDto {
  to: string[];
  subject: string;
  html: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
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

  async sendEmail(emailData: SendEmailDto): Promise<void> {
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
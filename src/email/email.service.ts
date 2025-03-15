import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { FeedbackService } from 'src/feedback/feedback.service';

interface SendEmailDto {
  to: string[];
  subject: string;
  html: string;
  creatorEmail?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly transporter: nodemailer.Transporter;

  constructor(private readonly feedbackService: FeedbackService) {
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
      let html = emailData.html;
      if (emailData.creatorEmail) {
        const summary = await this.feedbackService.summerizeAllFeedbacks({ email: emailData.creatorEmail } as any);
        html = `${html}\n\nFeedback Summary:\n${JSON.stringify(summary, null, 2)}`;
      }

      this.logger.log('Sending email', {
        to: emailData.to,
        subject: emailData.subject
      });

      await this.transporter.sendMail({
        from: process.env.SMTP_FROM,
        ...emailData,
        html
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
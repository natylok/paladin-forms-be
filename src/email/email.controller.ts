import { Controller, Post, Body, UseGuards, Logger } from '@nestjs/common';
import { InternalGuard } from '../guards/internal.guard';
import { EmailService } from './email.service';

interface SendEmailDto {
  to: string[];
  subject: string;
  html: string;
}

@Controller('internal/email')
@UseGuards(InternalGuard)
export class EmailController {
  private readonly logger = new Logger(EmailController.name);

  constructor(private readonly emailService: EmailService) {}

  @Post('send')
  async sendEmail(@Body() emailData: SendEmailDto) {
    try {
      this.logger.log('Received email request', {
        to: emailData.to,
        subject: emailData.subject
      });

      await this.emailService.sendEmail(emailData);

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
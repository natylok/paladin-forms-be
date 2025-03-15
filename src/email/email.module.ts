import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EmailController } from './email.controller';
import { EmailService } from './email.service';
import { FeedbackModule } from '../feedback/feedback.module';

@Module({
  imports: [
    ConfigModule,
    FeedbackModule
  ],
  controllers: [EmailController],
  providers: [EmailService],
  exports: [EmailService]
})
export class EmailModule {} 
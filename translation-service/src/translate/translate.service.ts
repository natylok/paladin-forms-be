import { Injectable, Logger, Inject, OnModuleInit } from '@nestjs/common';
import * as amqp from 'amqplib';

@Injectable()
export class TranslateService implements OnModuleInit {
  private readonly logger = new Logger(TranslateService.name);
  private channel: amqp.Channel;

  constructor(
  ) { }

  async onModuleInit() {
  }


  async translateSurvey(surveyId: string, user: any) {
    this.logger.log('Translating survey', surveyId);
    console.log(user, surveyId)
  }
}
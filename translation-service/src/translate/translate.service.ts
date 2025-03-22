import { Injectable, Logger, Inject, OnModuleInit } from '@nestjs/common';
import { PublicationEvent, TimeFrame } from './types/queue.types';
import { ClientProxy } from '@nestjs/microservices';
import * as amqp from 'amqplib';
import { async, delay } from 'rxjs';

@Injectable()
export class TranslateService implements OnModuleInit {
  private readonly logger = new Logger(TranslateService.name);
  private channel: amqp.Channel;

  constructor(
    @Inject('TRANSLATION_SERVICE') private readonly client: ClientProxy
  ) { }

  async onModuleInit() {
  }


  async translateSurvey(surveyId: string, user: any) {
    this.logger.log('Translating survey', surveyId);
    console.log(user, surveyId)
  }
}
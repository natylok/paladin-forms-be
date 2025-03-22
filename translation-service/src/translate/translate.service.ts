import { Injectable, Logger, Inject, OnModuleInit } from '@nestjs/common';
import * as amqp from 'amqplib';
import { SurveyService } from './survey.service';
import { TranslatorService } from './translate-service';
@Injectable()
export class TranslateService implements OnModuleInit {
  private readonly logger = new Logger(TranslateService.name);
  private channel: amqp.Channel;

  constructor(
    private readonly surveyService: SurveyService,
    private readonly translatorService: TranslatorService,
  ) { 

  }

  async onModuleInit() {
  }


  async translateSurvey(surveyId: string, user: any) {
    this.logger.log('Translating survey', surveyId);
    const survey = await this.surveyService.getSurveyById(surveyId, user);
    const components = survey.components;
    this.logger.log('Components', components);
    
  }
}
import { Injectable, Logger, Inject, OnModuleInit } from '@nestjs/common';
import * as amqp from 'amqplib';
import { SurveyService } from './survey.service';
import { TranslatorService } from './translator.service';
import { TranslationLanguages } from '../consts';

@Injectable()
export class TranslateService implements OnModuleInit {
  private readonly logger = new Logger(TranslateService.name);
  private channel: amqp.Channel;

  constructor(
    private readonly surveyService: SurveyService,
    private readonly translatorService: TranslatorService,
  ) { }

  async onModuleInit() {
  }

  async translateSurvey(surveyId: string, user: any, sourceLang: TranslationLanguages = TranslationLanguages.EN, targetLang: TranslationLanguages = TranslationLanguages.HE) {
    this.logger.log('Translating survey', { surveyId, sourceLang, targetLang });
    const survey = await this.surveyService.getSurveyById(surveyId, user);
    const components = survey.components;
    
    // Use the translator service to translate components
    for (const component of components) {
      if (component.title) {
        component.title = await this.translatorService.translate(component.title, sourceLang, targetLang);
        this.logger.log('Translated title', { title: component.title });
      }
      if (component.options) {
        component.options = await Promise.all(
          component.options.map(option => this.translatorService.translate(option, sourceLang, targetLang))
        );
      }
    }
    
    this.logger.log('Translation completed', { surveyId, sourceLang, components});
    return components;
  }
}
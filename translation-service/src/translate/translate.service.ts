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

  async translateSurveys(surveyIds: string[], user: { email: string }, sourceLang: TranslationLanguages = TranslationLanguages.EN, targetLangs: TranslationLanguages[] = [TranslationLanguages.HE]) {
    this.logger.log('Translating surveys', { surveyIds, user, sourceLang, targetLangs });
    for (const surveyId of surveyIds) {
      const survey = await this.surveyService.getSurveyById(surveyId, user);
      this.logger.log('Survey fetched', { survey });
      const components = survey.components;
      for (const targetLang of targetLangs) {
        for (const component of components) {
          this.logger.log('Translating component', { component });
          component.title = await this.translatorService.translate(component.title, sourceLang, targetLang);
          if (component.options) {
            let translatedOptions = [];
            for (const option of component.options) {
              const translatedOption = await this.translatorService.translate(option, sourceLang, targetLang);
              translatedOptions.push(translatedOption);
            }
            component.options = translatedOptions;
          }
        }
        const surveyTranslations = (survey.translations || []).filter(translation => translation.language !== targetLang);

        const plainSurvey = survey.toObject ? survey.toObject() : survey;
        const updatedSurvey = {
          ...plainSurvey,
          translations: [...surveyTranslations, { language: targetLang, components: components }]
        } as any; // Type assertion needed due to Mongoose types

        await this.surveyService.updateSurvey(surveyId, updatedSurvey);
      }
    }
  }
}
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
    
    // Process surveys concurrently
    await Promise.all(surveyIds.map(async (surveyId) => {
      const survey = await this.surveyService.getSurveyById(surveyId, user);
      this.logger.log('Survey fetched', { surveyId });
      
      // Process each target language concurrently
      await Promise.all(targetLangs.map(async (targetLang) => {
        try {
          // Deep clone components to avoid conflicts between translations
          const components = JSON.parse(JSON.stringify(survey.components));
          
          // Translate all components concurrently
          await Promise.all(components.map(async (component) => {
            // Translate title
            component.title = await this.translatorService.translate(component.title, sourceLang, targetLang);
            
            // Translate options if they exist
            if (component.options?.length) {
              component.options = await Promise.all(
                component.options.map(option => 
                  this.translatorService.translate(option, sourceLang, targetLang)
                )
              );
            }
          }));

          this.logger.log('Components translated', { components });
          // Update survey with new translation
          const surveyTranslations = (survey.translations || [])
            .filter(translation => translation.language !== targetLang);

          const plainSurvey = survey.toObject ? survey.toObject() : survey;
          const updatedSurvey = {
            ...plainSurvey,
            translations: [...surveyTranslations, { language: targetLang, components }]
          } as any;

          await this.surveyService.updateSurvey(surveyId, updatedSurvey);
          this.logger.log(`Completed translation for survey ${surveyId} to ${targetLang}`);
        } catch (error) {
          this.logger.error(`Failed to translate survey ${surveyId} to ${targetLang}`, error);
          throw error;
        }
      }));
    }));
  }
}
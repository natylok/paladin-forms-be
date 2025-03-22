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

  async translateSurveys(
    surveyIds: string[], 
    user: { email: string }, 
    sourceLang: TranslationLanguages = TranslationLanguages.EN, 
    targetLangs: TranslationLanguages[] = [TranslationLanguages.HE],
    redisQueueName?: string
  ) {
    this.logger.log('Translating surveys', { surveyIds, user, sourceLang, targetLangs });
    
    const queueKey = redisQueueName || `translation:queue:${user.email}`;
    
    try {
      // Process each survey sequentially
      for (const surveyId of surveyIds) {
        this.logger.log(`Processing survey ${surveyId}`);
        
        // Process each target language sequentially for this survey
        for (const targetLang of targetLangs) {
          this.logger.log(`Translating to ${targetLang}`);
          
          try {
            // Set status to in_progress
            await this.translatorService.setTranslationStatus(surveyId, targetLang, 'in_progress');
            
            // Perform the translation
            const translatedText = await this.translatorService.translate(
              surveyId,
              sourceLang,
              targetLang
            );
            
            // Set status to completed
            await this.translatorService.setTranslationStatus(surveyId, targetLang, 'completed');
            
            this.logger.log(`Translation completed for survey ${surveyId} to ${targetLang}`);
            
          } catch (error) {
            this.logger.error(`Translation failed for survey ${surveyId} to ${targetLang}`, error);
            await this.translatorService.setTranslationStatus(
              surveyId,
              targetLang,
              'failed',
              error instanceof Error ? error.message : 'Unknown error'
            );
          }
        }
      }
      
      this.logger.log('All translations completed');
      
    } catch (error) {
      this.logger.error('Translation process failed', error);
      throw error;
    }
  }
}
import { Injectable, Logger } from '@nestjs/common';
import { TranslatorService } from './translator.service';
import { TranslationLanguages } from '../consts';
import { SurveyService } from './survey.service';
import { RedisService } from '../redis/redis.service';
import { ClientProxy } from '@nestjs/microservices';
import { Inject } from '@nestjs/common';
@Injectable()
export class TranslateService {
    private readonly logger = new Logger(TranslateService.name);

    constructor(
        private readonly translatorService: TranslatorService,
        private readonly surveyService: SurveyService,
        private readonly redisService: RedisService,
        @Inject('SURVEY_SERVICE') private readonly client: ClientProxy
    ) {}

    async translateSurveys(
        surveyIds: string[], 
        user: { email: string }, 
        sourceLang: TranslationLanguages = TranslationLanguages.EN, 
        targetLangs: TranslationLanguages[] = [TranslationLanguages.HE],
        redisQueueName?: string
    ) {
        this.logger.log('Translating surveys', { surveyIds, user, sourceLang, targetLangs });
        
        // Process surveys sequentially
        this.redisService.set(redisQueueName, 'in_progress');
        for (const surveyId of surveyIds) {
            try {
                const survey = await this.surveyService.getSurveyById(surveyId, user);
                this.logger.log('Survey fetched', { surveyId });
                
                // Process each target language sequentially
                for (const targetLang of targetLangs) {
                    try {
                        // Deep clone components to avoid conflicts between translations
                        const originalComponents = JSON.parse(JSON.stringify(survey.components));
                        this.logger.log(`Starting translation for ${surveyId} to ${targetLang}`, {
                            componentCount: originalComponents.length
                        });
                        
                        // Translate components sequentially
                        const translatedComponents = [];
                        for (const [index, component] of originalComponents.entries()) {
                            try {
                                // Create a new component object for this translation
                                const translatedComponent = { ...component };
                                
                                // Translate title
                                this.logger.debug(`Translating component ${index + 1}/${originalComponents.length} title`);
                                translatedComponent.title = await this.translatorService.translate(
                                    component.title,
                                    sourceLang,
                                    targetLang,
                                    surveyId
                                );
                                this.logger.debug(`Translated title: ${translatedComponent.title}`);
                                
                                // Translate options if they exist
                                if (component.options?.length) {
                                    this.logger.debug(`Translating ${component.options.length} options for component ${index + 1}`);
                                    translatedComponent.options = [];
                                    
                                    // Translate options sequentially
                                    for (const [optionIndex, option] of component.options.entries()) {
                                        const translated = await this.translatorService.translate(
                                            option,
                                            sourceLang,
                                            targetLang,
                                            surveyId
                                        );
                                        this.logger.debug(`Translated option ${optionIndex + 1}/${component.options.length}: ${translated}`);
                                        translatedComponent.options.push(translated);
                                    }
                                }
                                
                                this.logger.debug(`Completed component ${index + 1}/${originalComponents.length}`);
                                translatedComponents.push(translatedComponent);
                            } catch (error) {
                                this.logger.error(`Failed to translate component ${index + 1}`, {
                                    error,
                                    component: component.title
                                });

                                throw error;
                            }
                        }

                        this.logger.log(`All components translated for ${surveyId} to ${targetLang}`, { 
                            componentCount: translatedComponents.length 
                        });

                        // Update survey with new translation
                        const surveyTranslations = (survey.translations || [])
                            .filter(translation => translation.language !== targetLang);

                        const plainSurvey = survey.toObject ? survey.toObject() : survey;
                        const updatedSurvey = {
                            ...plainSurvey,
                            translations: [...surveyTranslations, { 
                                language: targetLang, 
                                components: translatedComponents 
                            }]
                        } as any;

                        await this.surveyService.updateSurvey(surveyId, updatedSurvey);
                        
                        // Set translation status to completed

                        this.logger.log(`Successfully updated survey ${surveyId} with ${targetLang} translations`);
                    } catch (error) {
                        this.redisService.set(redisQueueName, 'failed');
                        this.logger.error(`Failed to translate survey ${surveyId} to ${targetLang}`, error);
                        throw error;
                    }
                }
            } catch (error) {
                this.redisService.set(redisQueueName, 'failed');
                this.logger.error(`Failed to process survey ${surveyId}`, error);
                throw error;
            }
        }
        this.logger.log('All surveys translated');
        this.redisService.set(redisQueueName, 'completed');
    }
}
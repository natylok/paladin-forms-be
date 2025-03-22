import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload, Ctx, RmqContext } from '@nestjs/microservices';
import { TranslateService } from './translate.service';
import { TranslationLanguages } from 'src/consts';

@Controller()
export class TranslateController {
  private readonly logger = new Logger(TranslateController.name);

    constructor(private readonly translateService: TranslateService) {}


    @EventPattern('survey_translation_requested')
    async handleSurveyTranslationRequested(@Payload() data: { user: { email: string }, surveyIds: string[], sourceLang: TranslationLanguages, targetLangs: TranslationLanguages[] }) {
        this.logger.log('Survey translation requested', data);
        this.translateService.translateSurveys(data.surveyIds, data.user, data.sourceLang, data.targetLangs);
    }

} 
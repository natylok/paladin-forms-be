import { Controller } from '@nestjs/common';
import { EventPattern } from '@nestjs/microservices';
import { TranslateService } from './translate.service';
import { TranslationLanguages } from '../consts';

@Controller()
export class TranslateController {
    constructor(private readonly translateService: TranslateService) {}

    @EventPattern('translate_surveys')
    async handleTranslateSurveys(data: {
        surveyIds: string[];
        user: { email: string };
        sourceLang: TranslationLanguages;
        targetLangs: TranslationLanguages[];
        redisQueueName?: string;
    }) {
        return this.translateService.translateSurveys(
            data.surveyIds,
            data.user,
            data.sourceLang,
            data.targetLangs,
            data.redisQueueName
        );
    }
} 
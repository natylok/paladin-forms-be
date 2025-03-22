import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload, Ctx, RmqContext } from '@nestjs/microservices';
import { TranslateService } from './translate.service';

@Controller()
export class QueueController {
  private readonly logger = new Logger(QueueController.name);

    constructor(private readonly translateService: TranslateService) {}


    @EventPattern('survey_translation_requested')
    async handleSurveyTranslationRequested(@Payload() data: any) {
        this.logger.log('Survey translation requested', data);
        this.translateService.translateSurvey(data.surveyId, data.user);
    }

} 
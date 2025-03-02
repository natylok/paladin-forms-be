import { Injectable, Inject, BadRequestException, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Feedback } from './feedback.schema';
import { Survey, SurveyComponentType } from '../survey/survey.schema';

@Injectable()
export class FeedbackService {
    private readonly logger = new Logger(FeedbackService.name);

    constructor(
        @Inject('FEEDBACK_SERVICE') private readonly client: ClientProxy,
        @InjectModel(Survey.name) private readonly surveyModel: Model<Survey>,
        @InjectModel(Feedback.name) private readonly feedbackModel: Model<Feedback>,
    ) {}

    async submitFeedback(surveyId: string, responses: Partial<Record<SurveyComponentType, string>>) {
        const survey = await this.surveyModel.findOne({ surveyId });
        if (!survey) {
            throw new BadRequestException('Survey not found');
        }

        const validResponses: Partial<Record<SurveyComponentType, string>> = {};
        for (const component of survey.components) {
            if (component.title in responses) {
                validResponses[component.title] = responses[component.title];
            }
        }

        const message = { surveyId, responses: validResponses };
        this.logger.log(`🔵 Sending feedback to RabbitMQ: ${JSON.stringify(message)}`);

        try {
            await this.client.emit('feedback_created', message);
            this.logger.log(`🟢 Successfully sent feedback to RabbitMQ`);
        } catch (error) {
            this.logger.error(`🔴 Failed to send feedback to RabbitMQ:`, error);
        }
    }
}

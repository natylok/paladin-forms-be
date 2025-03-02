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

    async submitFeedback(surveyId: string, response: Partial<Record<SurveyComponentType, string>>) {
        const survey = await this.surveyModel.findOne({ surveyId });
        if (!survey) {
            throw new BadRequestException('Survey not found');
        }
        const results = Object.entries(response).reduce((prev, curr) => {
            if(Object.values(SurveyComponentType).includes(curr[0] as SurveyComponentType)) {
                prev[curr[0]] = curr[1];
                return prev;
            }
            return prev
        }, {})

        const message = { surveyId, results };
        this.logger.log(`🔵 Sending feedback to RabbitMQ: ${JSON.stringify(message)}`);

        try {
            await this.client.emit('feedback_created', message);
            this.logger.log(`🟢 Successfully sent feedback to RabbitMQ`);
        } catch (error) {
            this.logger.error(`🔴 Failed to send feedback to RabbitMQ:`, error);
        }
    }

    async saveFeedback(payload: Feedback){
        await new this.feedbackModel(payload).save();
    }
}

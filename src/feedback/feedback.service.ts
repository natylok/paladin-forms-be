import { Injectable, Inject, BadRequestException, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Feedback } from './feedback.schema';
import { Survey, SurveyComponentType } from '../survey/survey.schema';
import { User } from '@prisma/client';
import { summerizeFeedbacks } from 'src/survey/ai.service';

@Injectable()
export class FeedbackService {
    private readonly logger = new Logger(FeedbackService.name);

    constructor(
        @Inject('FEEDBACK_SERVICE') private readonly client: ClientProxy,
        @InjectModel(Survey.name) private readonly surveyModel: Model<Survey>,
        @InjectModel(Feedback.name) private readonly feedbackModel: Model<Feedback>,
    ) {}

    async submitFeedback(surveyId: string, response: Partial<Record<string, {componentType: string, value: string}>>) {
        const survey = await this.surveyModel.findOne({ surveyId });
        if (!survey) {
            throw new BadRequestException('Survey not found');
        }
        const surveyComponentIds = survey.components.map(component => component.id);
        const results = Object.entries(response).reduce((prev, curr) => {
            if(surveyComponentIds.includes(curr[0])) {
                prev[curr[0]] = {
                    componentType: curr[1].componentType,
                    value: curr[1].value
                };
                return prev;
            }
            return prev;
        }, {});

        const feedback = {
            surveyId: survey.surveyId,
            responses: results
        };

        this.logger.log(`🔵 Sending feedback to RabbitMQ: ${JSON.stringify(feedback)}`);

        try {
            await this.client.emit('feedback_created', feedback);
            this.logger.log(`🟢 Successfully sent feedback to RabbitMQ`);
        } catch (error) {
            this.logger.error(`🔴 Failed to send feedback to RabbitMQ:`, error);
            await this.saveFeedback(feedback);
        }
    }

    async saveFeedback(payload: any) {
        try {
            const feedback = new this.feedbackModel(payload);
            await feedback.save();
            this.logger.log(`🟢 Successfully saved feedback to MongoDB`);
        } catch (error) {
            this.logger.error(`🔴 Failed to save feedback to MongoDB:`, error);
            throw error;
        }
    }

    async getFeedbacks(user: User) {
        const surveyIds = (await this.surveyModel.find({creatorEmail: user.email})).map(survey => survey.surveyId);
        return this.feedbackModel.find({ surveyId: { $in: surveyIds } });
    }

    async summerizeAllFeedbacks(user: User) {
        const response = await this.getFeedbacks(user);
        return summerizeFeedbacks(response);
    }
}

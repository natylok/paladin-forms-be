import { Injectable, Inject, BadRequestException, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Feedback } from './feedback.schema';
import { Survey, SurveyComponentType } from '../survey/survey.schema';
import { User } from '@prisma/client';
import { summerizeFeedbacks } from 'src/survey/ai.service';
import { overviewFeedbacks } from './ai.service';
import OpenAI from 'openai';


const openai = new OpenAI({apiKey: process.env.OPENAI_API_KEY})
const overviewFeedbackSystemPrompt = () => `
Return a JSON with this exact structure (use 0 and empty arrays as defaults):
{
  "responseRate": { "total": number, "completed": number, "abandoned": number, "completionRate": number },
  "satisfactionMetrics": {
    "averageRating": number,
    "ratingDistribution": { "1star": number, "2star": number, "3star": number, "4star": number, "5star": number }
  },
  "topFeedbackThemes": { "positive": [string], "negative": [string] },
  "componentPerformance": { "mostEngaged": string, "leastEngaged": string, "averageTimeSpent": number },
  "trendsOverTime": {
    "daily": { "labels": [string], "values": [number] },
    "weekly": { "labels": [string], "values": [number] }
  }
}`;

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

    async overviewFeedbacks(user: User) {
        const feedbacks = await this.getFeedbacks(user);
        
        if (!feedbacks?.length) {
            return {
                responseRate: { total: 0, completed: 0, abandoned: 0, completionRate: 0 },
                satisfactionMetrics: {
                    averageRating: 0,
                    ratingDistribution: { "1star": 0, "2star": 0, "3star": 0, "4star": 0, "5star": 0 }
                },
                topFeedbackThemes: { positive: [], negative: [] },
                componentPerformance: { mostEngaged: "none", leastEngaged: "none", averageTimeSpent: 0 },
                trendsOverTime: {
                    daily: { labels: [], values: [] },
                    weekly: { labels: [], values: [] }
                }
            };
        }

        const response = await openai.chat.completions.create({
            model: 'gpt-4',
            messages: [
                { 
                    role: 'system',
                    content: [{ type: 'text', text: overviewFeedbackSystemPrompt() }]
                },
                { 
                    role: 'user', 
                    content: [{ type: 'text', text: JSON.stringify(feedbacks) }]
                }
            ],
            temperature: 0.1
        });

        try {
            return JSON.parse(response.choices[0].message.content || '{}');
        } catch (error) {
            this.logger.error('Failed to parse AI response:', error);
            return null;
        }
    }
}

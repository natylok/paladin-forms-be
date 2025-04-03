import { Injectable, Inject, Logger, OnModuleInit } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Feedback, FeedbackResponse } from './feedback.schema';
import { Survey } from '../survey/survey.schema';
import { User } from '@prisma/client';
import { LoggerService } from '../logger/logger.service';
import { RedisClientType } from 'redis';
import { SentimentService } from './services/sentiment.service';
import { FeedbackCacheService } from './services/cache.service';
import { FeedbackSummary, TextResponse, FilterType, SurveySummary } from './types/feedback.types';
import { FeedbackAnalysisService } from './services/feedback-analysis.service';
import { FeedbackExportService } from './services/feedback-export.service';
import { FeedbackFilterService } from './services/feedback-filter.service';
import { FeedbackQuestionService } from './services/feedback.question.service';
import { SurveyComponentType } from '@natylok/paladin-forms-common';
@Injectable()
export class FeedbackService implements OnModuleInit {
    private readonly logger = new Logger(FeedbackService.name);
    private readonly CACHE_TTL = 200; // 200 seconds

    constructor(
        @Inject('FEEDBACK_SERVICE') private readonly client: ClientProxy,
        @InjectModel(Survey.name) private readonly surveyModel: Model<Survey>,
        @InjectModel(Feedback.name) private readonly feedbackModel: Model<Feedback>,
        private readonly loggerService: LoggerService,
        @Inject('REDIS_CLIENT') private readonly redis: RedisClientType,
        private readonly sentimentService: SentimentService,
        private readonly cacheService: FeedbackCacheService,
        private readonly analysisService: FeedbackAnalysisService,
        private readonly exportService: FeedbackExportService,
        private readonly filterService: FeedbackFilterService,
        private readonly questionService: FeedbackQuestionService
    ) {
        this.questionService = new FeedbackQuestionService(this.redis);
        this.questionService.initializeModelIfNeeded();
     }

    async submitFeedback(surveyId: string, responses: Record<string, FeedbackResponse>, timeToFillSurvey: number): Promise<void> {
        try {
            this.logger.debug('Processing feedback submission', { surveyId, responses });

            // Emit raw feedback data to RabbitMQ
            await this.client.emit('feedback.created', {
                surveyId,
                responses,
                submittedAt: new Date(),
                timeToFillSurvey
            }).toPromise();

            this.logger.debug('Feedback event emitted successfully', { surveyId });
        } catch (error) {
            this.logger.error(
                'Failed to submit feedback',
                error instanceof Error ? error.stack : undefined,
                { surveyId, responses }
            );
            throw error;
        }
    }
    async getFeedbackById(feedbackId: string, user: User): Promise<Feedback | null> {
        try {
            const surveys = await this.surveyModel.find(user.customerId ? { customerId: user.customerId } : { creatorEmail: user.email });
            const feedback = await this.feedbackModel.findOne({ _id: feedbackId, surveyId: { $in: surveys.map(survey => survey.surveyId) } });
            return feedback;
        } catch (error) {
            this.logger.error('Failed to get feedback by id', error instanceof Error ? error.stack : undefined, { feedbackId, user: user.email });
            throw error;
        }
    }

    async getQuestionFeedbacks(user: User, surveyId: string, prompt: string): Promise<{ questionResults: any[] }> {
        try {
            this.logger.debug('Getting question feedbacks', { user: user.email, surveyId });
            const survey = await this.surveyModel.findOne({ surveyId, ...(user.customerId ? { customerId: user.customerId } : { creatorEmail: user.email }) }).exec();
            if(!survey){
                this.logger.error('Survey not found', { user: user.email, surveyId });
                throw new Error('Survey not found');
            }
            
            // Limit to most recent 50 feedbacks for performance
            const feedbacks = await this.feedbackModel.find({ surveyId })
                .sort({ createdAt: -1 })
                .limit(100)
                .exec();
                
            if (feedbacks.length === 0) {
                return { questionResults: [] };
            }
            const textResponses = feedbacks.flatMap(feedback => {
                return Object.values(feedback.responses).filter(response => response.componentType === SurveyComponentType.TEXT || response.componentType === SurveyComponentType.TEXTBOX);
            })
            try {
                const questionResults = await this.questionService.getQuestionFeedbacks(textResponses, prompt);
                return { questionResults };
            } catch (error) {
                this.logger.error('Error getting question results', error instanceof Error ? error.stack : undefined, { user: user.email, surveyId });
                // Return a fallback response instead of failing the entire request
                return { 
                    questionResults: [{
                        question: prompt,
                        answer: "I'm sorry, but I couldn't process your question at this time. Please try again later."
                    }]
                };
            }
        }
        catch (error) {
            this.logger.error('Failed to get question feedbacks', error instanceof Error ? error.stack : undefined, { user: user.email, surveyId });
            throw error;
        }
    }

    async saveFeedback(feedback: Feedback): Promise<void> {
        try {
            this.logger.debug('Saving feedback', { surveyId: feedback.surveyId });
            const newFeedback = new this.feedbackModel(feedback);
            await newFeedback.save();
            this.logger.debug('Feedback saved successfully', {
                surveyId: feedback.surveyId,
                feedbackId: newFeedback._id
            });
        } catch (error) {
            this.logger.error(
                'Failed to save feedback',
                error instanceof Error ? error.stack : undefined,
                { feedback }
            );
            throw error;
        }
    }

    async getFeedbacks(user: User, page: number = 1, filter?: Record<string, any>): Promise<{ feedbacks: Feedback[], totalPages: number }> {
        try {
            this.logger.debug('Fetching feedbacks for user', { user: user.email, page });
            const itemsPerPage = 100;
            const skip = (page - 1) * itemsPerPage;

            // First get all surveys for the user
            const surveys = await this.surveyModel.find(filter);

            const survey= surveys.find(survey => survey.surveyId === filter.surveyId);

            if(!survey){
                this.logger.error('Survey not found', { user: user.email, filter });
                return { feedbacks: [], totalPages: 0 };
            }

            // Then get feedbacks for those surveys
            const [feedbacks, total] = await Promise.all([
                this.feedbackModel.find({surveyId: survey.surveyId})
                    .skip(skip)
                    .limit(itemsPerPage)
                    .exec(),
                this.feedbackModel.countDocuments(filter)
            ]);

            const totalPages = Math.ceil(total / itemsPerPage);

            if (!feedbacks) {
                this.logger.warn('No feedbacks found for user', { user: user.email, page, filter });
                return { feedbacks: [], totalPages: 0 };
            }

            this.logger.debug('Feedbacks fetched successfully', {
                user: user.email,
                count: feedbacks.length,
                page,
                totalPages
            });

            return { feedbacks, totalPages };
        } catch (error) {
            this.logger.error(
                'Failed to fetch feedbacks',
                error instanceof Error ? error.stack : undefined,
                { user: user.email, page }
            );
            throw error;
        }
    }

    async summerizeAllFeedbacks(user: User, timeFrame?: string, surveyId?: string): Promise<FeedbackSummary | { message: string }> {
        try {
            let filter: Record<string, any> = {};
            if(timeFrame){
                filter = this.filterService.getFilterByTimeFrame(timeFrame);
            }
            const { feedbacks } = await this.getFeedbacks(user, 1, { ...filter, surveyId });
            if (!feedbacks.length) {
                return { message: 'No feedbacks found' };
            }

            const summary = await this.analysisService.analyzeFeedbacks(feedbacks);

            return summary;
        } catch (error) {
            this.logger.error(
                'Failed to summarize feedbacks',
                error instanceof Error ? error.stack : undefined,
                { user: user.email }
            );
            return { message: error instanceof Error ? error.message : 'Unknown error' };
        }
    }

    async getSurveySummary(user: User, surveyId: string): Promise<SurveySummary | { message: string }> {
        try {
            const survey = await this.surveyModel.findOne({ surveyId, ...(user.customerId ? { customerId: user.customerId } : { creatorEmail: user.email }) }).exec();
            if (!survey) {
                return { message: 'Survey not found' };
            }
            const totalFeedbacks = await this.feedbackModel.countDocuments({ surveyId }).exec();
            return { totalFeedbacks };
        } catch (error) {
            this.logger.error('Failed to get survey summary', error instanceof Error ? error.stack : undefined, { user: user.email, surveyId });
            return { message: 'Failed to get survey summary' };
        }
    }

    // Method to manually invalidate cache if needed
    async invalidateFeedbackSummaryCache(user: User): Promise<void> {
        await this.cacheService.invalidateCache(user);
    }

    async overviewFeedbacks(user: User): Promise<any> {
        try {
            this.logger.debug('Generating feedback overview', { user: user.email });
            const feedbacks = await this.getFeedbacks(user);
            if (!feedbacks.feedbacks.length) {
                this.logger.warn('No feedbacks found for overview', { user: user.email });
                return { message: 'No feedbacks found' };
            }

            const overview = {
                totalFeedbacks: feedbacks.feedbacks.length,
                feedbacksByType: this.groupFeedbacksByType(feedbacks.feedbacks),
                recentFeedbacks: feedbacks.feedbacks.slice(-5)  // Last 5 feedbacks
            };

            this.logger.debug('Feedback overview generated', {
                user: user.email,
                totalFeedbacks: overview.totalFeedbacks
            });
            return overview;
        } catch (error) {
            this.logger.error(
                'Failed to generate feedback overview',
                error instanceof Error ? error.stack : undefined,
                { user: user.email }
            );
            throw error;
        }
    }

    private groupFeedbacksByType(feedbacks: Feedback[]): Record<string, number> {
        try {
            return feedbacks.reduce((acc, feedback) => {
                if (feedback.responses) {
                    const responses = feedback.responses;
                    if (responses instanceof Map) {
                        Array.from(responses.entries()).forEach(([_, response]) => {
                            if (response && response.componentType) {
                                acc[response.componentType] = (acc[response.componentType] || 0) + 1;
                            }
                        });
                    } else {
                        Object.values(responses).forEach((response: FeedbackResponse) => {
                            if (response && response.componentType) {
                                acc[response.componentType] = (acc[response.componentType] || 0) + 1;
                            }
                        });
                    }
                }
                return acc;
            }, {} as Record<string, number>);
        } catch (error) {
            this.logger.error(
                'Error grouping feedbacks by type',
                error instanceof Error ? error.stack : undefined,
                { feedbackCount: feedbacks.length }
            );
            throw error;
        }
    }

    async getFilteredFeedbacks(
        user: User,
        filterType: FilterType,
        surveyId?: string
    ): Promise<{ feedbacks: Feedback[], total: number }> {
        try {
            // First get all surveys for the user
            const surveys = await this.surveyModel.find(
                user.customerId ? { customerId: user.customerId } : { creatorEmail: user.email }
            ).select('surveyId').lean().exec();

            const surveyIds = surveys.map(survey => survey.surveyId);

            // Then get feedbacks for those surveys
            const query = surveyId 
                ? { surveyId } 
                : { surveyId: { $in: surveyIds } };
            
            const feedbacks = await this.feedbackModel.find(query).exec();
            return this.filterService.filterFeedbacks(feedbacks, filterType);
        } catch (error) {
            this.logger.error(
                'Failed to filter feedbacks',
                error instanceof Error ? error.stack : undefined,
                { user: user.email, filterType, surveyId }
            );
            throw error;
        }
    }

    async exportFeedbacksToCSV(user: User, surveyId: string) {
        // First verify the survey belongs to the user
        const survey = await this.surveyModel.findOne({
            surveyId,
            ...(user.customerId ? { customerId: user.customerId } : { creatorEmail: user.email })
        }).lean().exec();

        if (!survey) {
            throw new Error('Survey not found or access denied');
        }

        return await this.exportService.exportToCSV(surveyId, user);
    }

    async getAvailableFilters(): Promise<FilterType[]> {
        return this.filterService.getAvailableFilters();
    }

    async getFilterDescription(filterType: FilterType): Promise<string> {
        return this.filterService.getFilterDescription(filterType);
    }

    async onModuleInit() {
        this.logger.log('Feedback service initialized');
    }

}
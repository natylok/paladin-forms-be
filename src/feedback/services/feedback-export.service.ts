import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Feedback, FeedbackResponse } from '../feedback.schema';
import { Survey } from '../../survey/survey.schema';
import { createObjectCsvWriter } from 'csv-writer';
import { User } from '@prisma/client';

@Injectable()
export class FeedbackExportService {
    private readonly logger = new Logger(FeedbackExportService.name);

    constructor(
        @InjectModel(Survey.name) private readonly surveyModel: Model<Survey>,
        @InjectModel(Feedback.name) private readonly feedbackModel: Model<Feedback>
    ) {}

    async exportToCSV(surveyId: string, user: User): Promise<Array<{ id: string; title: string }>> {
        try {
            this.logger.debug('Starting feedback export to CSV', { surveyId });
            const filter = user.customerId ? {customerId: user.customerId} : {creatorEmail: user.email};
            const survey = await this.surveyModel.findOne({ surveyId, ...filter }).exec();
            if (!survey) {
                this.logger.warn('Survey not found', { surveyId });
                throw new BadRequestException('Survey not found');
            }

            const feedbacks = await this.feedbackModel.find({ surveyId }).exec();
            if (!feedbacks.length) {
                this.logger.warn('No feedbacks found to export', { surveyId });
                throw new BadRequestException('No feedbacks found to export');
            }

            const questionIds = this.collectQuestionIds(feedbacks);
            const fields = this.prepareCSVFields(questionIds);

            return fields
        } catch (error) {
            this.logger.error(
                'Failed to export feedbacks to CSV',
                error instanceof Error ? error.stack : undefined,
                { surveyId }
            );
            throw error;
        }
    }

    private collectQuestionIds(feedbacks: Feedback[]): Set<string> {
        const questionIds = new Set<string>();
        feedbacks.forEach(feedback => {
            if (feedback.responses) {
                if (feedback.responses instanceof Map) {
                    Array.from(feedback.responses.entries()).forEach(([questionId, response]) => {
                        if (response && response.componentType && response.value) {
                            questionIds.add(questionId);
                        }
                    });
                } else {
                    Object.entries(feedback.responses).forEach(([questionId, response]) => {
                        const typedResponse = response as FeedbackResponse;
                        if (typedResponse && typedResponse.componentType && typedResponse.value) {
                            questionIds.add(questionId);
                        }
                    });
                }
            }
        });
        return questionIds;
    }

    private prepareCSVFields(questionIds: Set<string>): Array<{ id: string; title: string }> {
        const baseFields = [
            { id: '_id', title: 'Feedback ID' },
            { id: 'createdAt', title: 'Created At' },
            { id: 'updatedAt', title: 'Updated At' },
            { id: 'isRead', title: 'Is Read' }
        ];

        const questionFields = Array.from(questionIds).flatMap(questionId => [
            {
                id: `responses.${questionId}.title`,
                title: `Question ${questionId} - Title`
            },
            {
                id: `responses.${questionId}.componentType`,
                title: `Question ${questionId} - Component Type`
            }
        ]);

        return [...baseFields, ...questionFields];
    }

    private generateFilename(surveyId: string): string {
        return `feedbacks_${surveyId}_${new Date().toISOString()
            .replace(/[-:]/g, '')
            .replace('T', '_')
            .replace('Z', '')}.csv`;
    }

    private async writeToCSV(
        filename: string,
        fields: Array<{ id: string; title: string }>,
        feedbacks: Feedback[]
    ): Promise<void> {
        const csvWriter = createObjectCsvWriter({
            path: `./${filename}`,
            header: fields
        });

        const records = feedbacks.map(feedback => this.prepareFeedbackRecord(feedback));
        await csvWriter.writeRecords(records);
    }

    private prepareFeedbackRecord(feedback: Feedback): Record<string, any> {
        const record: Record<string, any> = {
            _id: feedback._id.toString(),
            createdAt: feedback.createdAt.toISOString(),
            updatedAt: feedback.updatedAt.toISOString(),
            isRead: feedback.isRead
        };

        if (feedback.responses) {
            if (feedback.responses instanceof Map) {
                Array.from(feedback.responses.entries()).forEach(([questionId, response]) => {
                    if (response && response.componentType && response.value) {
                        record[`responses.${questionId}.title`] = response.title || '';
                        record[`responses.${questionId}.componentType`] = response.componentType;
                    }
                });
            } else {
                Object.entries(feedback.responses).forEach(([questionId, response]) => {
                    const typedResponse = response as FeedbackResponse;
                    if (typedResponse && typedResponse.componentType && typedResponse.value) {
                        record[`responses.${questionId}.title`] = typedResponse.title || '';
                        record[`responses.${questionId}.componentType`] = typedResponse.componentType;
                    }
                });
            }
        }

        return record;
    }
} 
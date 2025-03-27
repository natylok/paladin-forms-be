import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Feedback, FeedbackResponse } from '../feedback.schema';
import { Survey } from '../../survey/survey.schema';
import { User } from '@prisma/client';

@Injectable()
export class FeedbackExportService {
    private readonly logger = new Logger(FeedbackExportService.name);

    constructor(
        @InjectModel(Survey.name) private readonly surveyModel: Model<Survey>,
        @InjectModel(Feedback.name) private readonly feedbackModel: Model<Feedback>
    ) {}

    async exportToCSV(surveyId: string, user: User): Promise<string> {
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

            // Create CSV header row
            const headerRow = fields.map(field => field.title).join(',');
            const csvRows = [headerRow];

            // Process each feedback
            for (const feedback of feedbacks) {
                const record = this.prepareFeedbackRecord(feedback);
                const row = fields.map(field => {
                    const value = record[field.id];
                    // Escape quotes and wrap in quotes if contains comma or quotes
                    return typeof value === 'string' && (value.includes(',') || value.includes('"'))
                        ? `"${value.replace(/"/g, '""')}"`
                        : value;
                });
                csvRows.push(row.join(','));
            }

            const csvData = csvRows.join('\n');
            this.logger.debug('CSV data generated successfully', { 
                surveyId,
                rowCount: csvRows.length - 1 // Subtract 1 for header row
            });

            return csvData;
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

        const questionFields = Array.from(questionIds).map(questionId => ({
            id: `responses.${questionId}.value`,
            title: `responses.${questionId}.title`
        }));

        return [...baseFields, ...questionFields];
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
                        record[`responses.${questionId}.title`] = response.title || `Question ${questionId}`;
                        record[`responses.${questionId}.value`] = response.value;
                    }
                });
            } else {
                Object.entries(feedback.responses).forEach(([questionId, response]) => {
                    const typedResponse = response as FeedbackResponse;
                    if (typedResponse && typedResponse.componentType && typedResponse.value) {
                        record[`responses.${questionId}.title`] = typedResponse.title || `Question ${questionId}`;
                        record[`responses.${questionId}.value`] = typedResponse.value;
                    }
                });
            }
        }

        return record;
    }
} 
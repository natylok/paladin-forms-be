import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Feedback } from '../feedback/feedback.schema';
import { Survey } from '../survey/survey.schema';
import { User } from '@prisma/client';
import { LoggerService } from '../logger/logger.service';
import { SurveyComponentType } from '@natylok/paladin-forms-common';

const SATISFACTION_COMPONENTS = [
    SurveyComponentType.STAR_1_TO_5,
    SurveyComponentType.FACE_1_TO_5,
    SurveyComponentType.SCALE_1_TO_10
];

const FEEDBACK_COMPONENTS = [
    SurveyComponentType.TEXTBOX
];

@Injectable()
export class ReportService {
    constructor(
        @InjectModel(Feedback.name) private readonly feedbackModel: Model<Feedback>,
        @InjectModel(Survey.name) private readonly surveyModel: Model<Survey>,
        private readonly logger: LoggerService
    ) {}

    async generateSatisfactionDashboard(user: User, surveyId: string): Promise<any> {
        try {
            this.logger.debug('Generating satisfaction dashboard', { user: user.email, surveyId });
            
            const feedbacks = await this.feedbackModel.find({ surveyId }).exec();
            if (!feedbacks.length) {
                this.logger.warn('No feedbacks found for satisfaction dashboard', { user: user.email, surveyId });
                return { message: 'No feedbacks found' };
            }

            const dashboard = {
                satisfactionMetrics: await this.generateSatisfactionMetrics(feedbacks),
                feedbackAnalysis: await this.generateFeedbackAnalysis(feedbacks),
                trends: await this.generateSatisfactionTrends(feedbacks),
                sentimentDistribution: await this.analyzeSentimentDistribution(feedbacks)
            };

            this.logger.debug('Satisfaction dashboard generated successfully', { user: user.email, surveyId });
            return dashboard;
        } catch (error) {
            this.logger.error(
                'Error generating satisfaction dashboard',
                error instanceof Error ? error.stack : undefined,
                { user: user.email, surveyId }
            );
            throw error;
        }
    }

    private async generateSatisfactionMetrics(feedbacks: Feedback[]): Promise<any> {
        const metrics = {
            overallSatisfaction: 0,
            componentSatisfaction: {} as Record<string, {
                average: number;
                distribution: Record<string, number>;
                totalResponses: number;
            }>,
            satisfactionBreakdown: {
                verySatisfied: 0,
                satisfied: 0,
                neutral: 0,
                dissatisfied: 0,
                veryDissatisfied: 0
            }
        };

        // Calculate satisfaction metrics for each component
        feedbacks.forEach(feedback => {
            Object.entries(feedback.responses).forEach(([componentId, response]) => {
                if (SATISFACTION_COMPONENTS.includes(response.componentType as SurveyComponentType)) {
                    if (!metrics.componentSatisfaction[componentId]) {
                        metrics.componentSatisfaction[componentId] = {
                            average: 0,
                            distribution: {},
                            totalResponses: 0
                        };
                    }

                    const value = parseFloat(response.value);
                    if (!isNaN(value)) {
                        metrics.componentSatisfaction[componentId].totalResponses++;
                        metrics.componentSatisfaction[componentId].distribution[response.value] = 
                            (metrics.componentSatisfaction[componentId].distribution[response.value] || 0) + 1;
                    }
                }
            });
        });

        // Calculate averages and overall satisfaction
        let totalSatisfaction = 0;
        let totalComponents = 0;

        Object.values(metrics.componentSatisfaction).forEach(component => {
            let componentTotal = 0;
            let componentCount = 0;
            
            Object.entries(component.distribution).forEach(([value, count]) => {
                componentTotal += parseFloat(value) * count;
                componentCount += count;
            });

            if (componentCount > 0) {
                component.average = componentTotal / componentCount;
                totalSatisfaction += component.average;
                totalComponents++;
            }
        });

        metrics.overallSatisfaction = totalComponents > 0 ? totalSatisfaction / totalComponents : 0;

        // Calculate satisfaction breakdown
        Object.values(metrics.componentSatisfaction).forEach(component => {
            Object.entries(component.distribution).forEach(([value, count]) => {
                const numValue = parseFloat(value);
                if (numValue >= 4) metrics.satisfactionBreakdown.verySatisfied += count;
                else if (numValue >= 3) metrics.satisfactionBreakdown.satisfied += count;
                else if (numValue >= 2) metrics.satisfactionBreakdown.neutral += count;
                else if (numValue >= 1) metrics.satisfactionBreakdown.dissatisfied += count;
                else metrics.satisfactionBreakdown.veryDissatisfied += count;
            });
        });

        return metrics;
    }

    private async generateFeedbackAnalysis(feedbacks: Feedback[]): Promise<any> {
        const analysis = {
            positiveFeedback: [] as string[],
            negativeFeedback: [] as string[],
            commonThemes: {} as Record<string, number>,
            feedbackDistribution: {} as Record<string, number>
        };

        feedbacks.forEach(feedback => {
            Object.entries(feedback.responses).forEach(([componentId, response]) => {
                if (FEEDBACK_COMPONENTS.includes(response.componentType as SurveyComponentType)) {
                    // Track feedback distribution
                    analysis.feedbackDistribution[response.value] = 
                        (analysis.feedbackDistribution[response.value] || 0) + 1;

                    // Analyze themes in feedback
                    const words = response.value.toLowerCase().split(/\s+/);
                    words.forEach(word => {
                        if (word.length > 3) { // Ignore short words
                            analysis.commonThemes[word] = (analysis.commonThemes[word] || 0) + 1;
                        }
                    });
                }
            });
        });

        // Sort and get top themes
        const sortedThemes = Object.entries(analysis.commonThemes)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 10);

        // Categorize feedback based on associated satisfaction scores
        feedbacks.forEach(feedback => {
            let hasHighSatisfaction = false;
            let hasLowSatisfaction = false;

            Object.values(feedback.responses).forEach(response => {
                if (SATISFACTION_COMPONENTS.includes(response.componentType as SurveyComponentType)) {
                    const value = parseFloat(response.value);
                    if (value >= 4) hasHighSatisfaction = true;
                    if (value <= 2) hasLowSatisfaction = true;
                }
            });

            Object.values(feedback.responses).forEach(response => {
                if (FEEDBACK_COMPONENTS.includes(response.componentType as SurveyComponentType)) {
                    if (hasHighSatisfaction) {
                        analysis.positiveFeedback.push(response.value);
                    }
                    if (hasLowSatisfaction) {
                        analysis.negativeFeedback.push(response.value);
                    }
                }
            });
        });

        return analysis;
    }

    private async generateSatisfactionTrends(feedbacks: Feedback[]): Promise<any> {
        const trends = {
            daily: {} as Record<string, number>,
            weekly: {} as Record<string, number>,
            monthly: {} as Record<string, number>
        };

        feedbacks.forEach(feedback => {
            const date = new Date(feedback.createdAt);
            const dayKey = date.toISOString().split('T')[0];
            const weekKey = `Week ${this.getWeekNumber(date)}`;
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

            let satisfactionScore = 0;
            let satisfactionCount = 0;

            Object.values(feedback.responses).forEach(response => {
                if (SATISFACTION_COMPONENTS.includes(response.componentType as SurveyComponentType)) {
                    const value = parseFloat(response.value);
                    if (!isNaN(value)) {
                        satisfactionScore += value;
                        satisfactionCount++;
                    }
                }
            });

            if (satisfactionCount > 0) {
                const averageSatisfaction = satisfactionScore / satisfactionCount;
                trends.daily[dayKey] = (trends.daily[dayKey] || 0) + averageSatisfaction;
                trends.weekly[weekKey] = (trends.weekly[weekKey] || 0) + averageSatisfaction;
                trends.monthly[monthKey] = (trends.monthly[monthKey] || 0) + averageSatisfaction;
            }
        });

        return trends;
    }

    private async analyzeSentimentDistribution(feedbacks: Feedback[]): Promise<any> {
        const sentiment = {
            positive: 0,
            neutral: 0,
            negative: 0,
            byComponent: {} as Record<string, {
                positive: number;
                neutral: number;
                negative: number;
            }>
        };

        feedbacks.forEach(feedback => {
            Object.entries(feedback.responses).forEach(([componentId, response]) => {
                if (SATISFACTION_COMPONENTS.includes(response.componentType as SurveyComponentType)) {
                    if (!sentiment.byComponent[componentId]) {
                        sentiment.byComponent[componentId] = {
                            positive: 0,
                            neutral: 0,
                            negative: 0
                        };
                    }

                    const value = parseFloat(response.value);
                    if (!isNaN(value)) {
                        if (value >= 4) {
                            sentiment.positive++;
                            sentiment.byComponent[componentId].positive++;
                        } else if (value >= 3) {
                            sentiment.neutral++;
                            sentiment.byComponent[componentId].neutral++;
                        } else {
                            sentiment.negative++;
                            sentiment.byComponent[componentId].negative++;
                        }
                    }
                }
            });
        });

        // Calculate percentages
        const total = sentiment.positive + sentiment.neutral + sentiment.negative;
        if (total > 0) {
            sentiment.positive = (sentiment.positive / total) * 100;
            sentiment.neutral = (sentiment.neutral / total) * 100;
            sentiment.negative = (sentiment.negative / total) * 100;
        }

        return sentiment;
    }

    private getWeekNumber(date: Date): number {
        const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
        const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
        return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
    }
} 
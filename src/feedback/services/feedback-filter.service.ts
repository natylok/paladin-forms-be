import { Injectable, Logger } from '@nestjs/common';
import { Feedback } from '../feedback.schema';
import { SentimentService } from './sentiment.service';
import { FILTER_PHRASES } from '../constants/feedback.constants';
import { containsPhrases, isDemographicResponse } from '../utils/feedback.utils';
import { FilterType } from '../types/feedback.types';
import { SurveyComponentType } from '@natylok/paladin-forms-common';
@Injectable()
export class FeedbackFilterService {
    private readonly logger = new Logger(FeedbackFilterService.name);

    constructor(private readonly sentimentService: SentimentService) {}

    getAvailableFilters(): FilterType[] {
        return Object.values(FilterType);
    }

    getFilterByTimeFrame(timeFrame: string): Record<string, any> {
        const now = new Date();
        const timeThreshold = new Date();

        switch (timeFrame) {
            case 'last_day':
                timeThreshold.setDate(now.getDate() - 1);
                break;
            case 'last_week':
                timeThreshold.setDate(now.getDate() - 7);
                break;
            case 'last_month':
                timeThreshold.setDate(now.getDate() - 30);
                break;
            default:
                return {};
        }

        return { createdAt: { $gte: timeThreshold } };
    }
    
    getFilterDescription(filterType: FilterType): string {
        const descriptions = {
            [FilterType.POSITIVE]: 'Find feedbacks with positive sentiment and high satisfaction ratings',
            [FilterType.NEGATIVE]: 'Find feedbacks with negative sentiment and low satisfaction ratings',
            [FilterType.NEUTRAL]: 'Find feedbacks with neutral sentiment and medium ratings',
            [FilterType.SUGGESTIONS]: 'Find feedbacks containing improvement suggestions',
            [FilterType.BUGS]: 'Find feedbacks mentioning bugs or technical issues',
            [FilterType.PRAISE]: 'Find feedbacks containing praise or compliments',
            [FilterType.URGENT]: 'Find feedbacks marked as urgent or critical',
            [FilterType.LAST_DAY]: 'Find feedbacks from the last 24 hours',
            [FilterType.LAST_WEEK]: 'Find feedbacks from the last 7 days',
            [FilterType.LAST_MONTH]: 'Find feedbacks from the last 30 days'
        };
        return descriptions[filterType] || 'Filter description not found';
    }

    async filterFeedbacks(feedbacks: Feedback[], filterType: FilterType): Promise<{ feedbacks: Feedback[], total: number }> {
        try {
            this.logger.debug('Filtering feedbacks', { filterType, totalFeedbacks: feedbacks.length });

            if (!feedbacks.length) {
                return { feedbacks: [], total: 0 };
            }
            if (this.isTimeBasedFilter(filterType)) {
                return this.getTimeBasedFeedbacks(feedbacks, filterType);
            }
            const matchingFeedbacksPromises = feedbacks.map(async feedback => {
                const shouldInclude = await this.shouldIncludeFeedback(feedback, filterType);
                return shouldInclude ? feedback : null;
            });

            const matchingFeedbacks = (await Promise.all(matchingFeedbacksPromises))
                .filter((feedback): feedback is Feedback => feedback !== null);

            this.logger.debug('Filtered feedbacks', {
                filterType,
                totalFeedbacks: feedbacks.length,
                matchingFeedbacks: matchingFeedbacks.length
            });

            return {
                feedbacks: matchingFeedbacks,
                total: matchingFeedbacks.length
            };

        } catch (error) {
            this.logger.error(
                'Failed to filter feedbacks',
                error instanceof Error ? error.stack : undefined,
                { filterType }
            );
            throw error;
        }
    }

    private isTimeBasedFilter(filterType: FilterType): boolean {
        return [FilterType.LAST_DAY, FilterType.LAST_WEEK, FilterType.LAST_MONTH].includes(filterType);
    }

    private async shouldIncludeFeedback(feedback: Feedback, filterType: FilterType): Promise<boolean> {
        if (!feedback.responses || Object.keys(feedback.responses).length === 0) return false;

        for (const response of Object.values(feedback.responses)) {
            if (!response.value) continue;

            const value = Array.isArray(response.value) ? response.value.join(' ') : response.value;
            
            // Skip demographic data and short responses
            if (value.length < 10 || isDemographicResponse(value)) {
                continue;
            }

            if (await this.matchesFilterCriteria(response, value, filterType)) {
                return true;
            }
        }

        return false;
    }

    private async matchesFilterCriteria(
        response: { componentType: SurveyComponentType; value?: any },
        value: string,
        filterType: FilterType
    ): Promise<boolean> {
        if (['starRating', '1to5scale', '1to10scale'].includes(response.componentType)) {
            const numericValue = Number(value);
            if(response.componentType === SurveyComponentType.SCALE_1_TO_10){
                switch(filterType){
                    case FilterType.POSITIVE:
                        return numericValue >= 7;
                    case FilterType.NEGATIVE:
                        return numericValue <= 3;
                    case FilterType.NEUTRAL:
                        return numericValue === 5;
                }
            }
            if (!isNaN(numericValue)) {
                switch (filterType) {
                    case FilterType.POSITIVE:
                        return numericValue >= 4;
                    case FilterType.NEGATIVE:
                        return numericValue <= 2;
                    case FilterType.NEUTRAL:
                        return numericValue === 3;
                }
            }
        }

        // Then handle text responses
        if (response.componentType === SurveyComponentType.TEXT || response.componentType === SurveyComponentType.TEXTBOX) {
            try {
                const sentiment = await this.sentimentService.analyzeSentiment(value);
                switch (filterType) {
                    case FilterType.POSITIVE:
                        return sentiment.label === 'positive' && sentiment.score > 0.7;
                    case FilterType.NEGATIVE:
                        return sentiment.label === 'negative' && sentiment.score > 0.7;
                    case FilterType.NEUTRAL:
                        return sentiment.label === 'neutral' || 
                               (sentiment.score > 0.3 && sentiment.score < 0.7);
                    case FilterType.SUGGESTIONS:
                        return containsPhrases(value, FILTER_PHRASES.suggestions);
                    case FilterType.BUGS:
                        return containsPhrases(value, FILTER_PHRASES.bugs);
                    case FilterType.PRAISE:
                        return containsPhrases(value, FILTER_PHRASES.praise);
                    case FilterType.URGENT:
                        return containsPhrases(value, FILTER_PHRASES.urgent);
                }
            } catch (error) {
                this.logger.error('Sentiment analysis failed', {
                    error: error instanceof Error ? error.message : 'Unknown error',
                    value
                });
            }
        }
        return false;
    }

    private getTimeBasedFeedbacks(
        feedbacks: Feedback[],
        filterType: FilterType
    ): { feedbacks: Feedback[], total: number } {
        const now = new Date();
        const timeThreshold = new Date();

        switch (filterType) {
            case FilterType.LAST_DAY:
                timeThreshold.setDate(now.getDate() - 1);
                break;
            case FilterType.LAST_WEEK:
                timeThreshold.setDate(now.getDate() - 7);
                break;
            case FilterType.LAST_MONTH:
                timeThreshold.setDate(now.getDate() - 30);
                break;
            default:
                return { feedbacks: [], total: 0 };
        }

        const filteredFeedbacks = feedbacks.filter(feedback => 
            new Date(feedback.createdAt) >= timeThreshold
        );

        this.logger.debug('Time-based filtering completed', {
            filterType,
            totalFeedbacks: feedbacks.length,
            matchingFeedbacks: filteredFeedbacks.length,
            timeThreshold: timeThreshold.toISOString()
        });

        return {
            feedbacks: filteredFeedbacks,
            total: filteredFeedbacks.length
        };
    }
} 
import { Injectable, Logger } from '@nestjs/common';
import { Feedback } from '../feedback.schema';
import { SentimentService } from './sentiment.service';
import { FILTER_PROMPTS, FILTER_PHRASES } from '../constants/feedback.constants';
import { containsPhrases, isDemographicResponse } from '../utils/feedback.utils';

@Injectable()
export class FeedbackFilterService {
    private readonly logger = new Logger(FeedbackFilterService.name);

    constructor(private readonly sentimentService: SentimentService) {}

    getAvailableFilters(): string[] {
        return Object.keys(FILTER_PROMPTS);
    }

    getFilterDescription(filterType: string): string {
        return FILTER_PROMPTS[filterType] || 'Filter description not found';
    }

    async filterFeedbacks(feedbacks: Feedback[], filterType: string): Promise<{ feedbacks: Feedback[], total: number }> {
        try {
            this.logger.debug('Filtering feedbacks', { filterType, totalFeedbacks: feedbacks.length });

            if (!feedbacks.length) {
                return { feedbacks: [], total: 0 };
            }

            // Handle time-based filtering first
            if (['lastDay', 'lastWeek', 'lastMonth'].includes(filterType)) {
                return this.getTimeBasedFeedbacks(feedbacks, filterType as 'lastDay' | 'lastWeek' | 'lastMonth');
            }

            // For other filter types, process each feedback
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

    private async shouldIncludeFeedback(feedback: Feedback, filterType: string): Promise<boolean> {
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
        response: { componentType: string },
        value: string,
        filterType: string
    ): Promise<boolean> {
        switch (filterType) {
            case 'positive':
            case 'negative':
            case 'neutral':
                return await this.matchesSentimentCriteria(response, value, filterType);

            case 'suggestions':
                return containsPhrases(value, FILTER_PHRASES.suggestions);

            case 'bugs':
                return containsPhrases(value, FILTER_PHRASES.bugs);

            case 'praise':
                return containsPhrases(value, FILTER_PHRASES.praise);

            case 'urgent':
                return containsPhrases(value, FILTER_PHRASES.urgent);

            default:
                return false;
        }
    }

    private async matchesSentimentCriteria(
        response: { componentType: string },
        value: string,
        filterType: 'positive' | 'negative' | 'neutral'
    ): Promise<boolean> {
        if (response.componentType === 'text') {
            try {
                const sentiment = await this.sentimentService.analyzeSentiment(value);
                switch (filterType) {
                    case 'positive':
                        return sentiment.label === 'positive' && sentiment.score > 0.7;
                    case 'negative':
                        return sentiment.label === 'negative' && sentiment.score > 0.7;
                    case 'neutral':
                        return sentiment.label === 'neutral' || 
                               (sentiment.score > 0.3 && sentiment.score < 0.7);
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
        filterType: 'lastDay' | 'lastWeek' | 'lastMonth'
    ): { feedbacks: Feedback[], total: number } {
        const now = new Date();
        const timeThreshold = new Date();

        switch (filterType) {
            case 'lastDay':
                timeThreshold.setDate(now.getDate() - 1);
                break;
            case 'lastWeek':
                timeThreshold.setDate(now.getDate() - 7);
                break;
            case 'lastMonth':
                timeThreshold.setDate(now.getDate() - 30);
                break;
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
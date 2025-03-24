import { Injectable, Logger } from '@nestjs/common';
import { FeedbackSummary, TextResponse } from '../types/feedback.types';
import { Feedback } from '../feedback.schema';
import { SentimentService } from './sentiment.service';
import { FILTER_PHRASES } from '../constants/feedback.constants';
import { SurveyComponentType } from '@natylok/paladin-forms-common';
import {
    containsPhrases,
    convertRatingToNumber,
    getWeekKey,
    getMonthKey,
    isDemographicResponse
} from '../utils/feedback.utils';

@Injectable()
export class FeedbackAnalysisService {
    private readonly logger = new Logger(FeedbackAnalysisService.name);

    constructor(private readonly sentimentService: SentimentService) {}

    async analyzeFeedbacks(feedbacks: Feedback[]): Promise<FeedbackSummary> {
        const summary: FeedbackSummary = this.initializeSummary(feedbacks.length);
        await this.processFeedbacks(feedbacks, summary);
        return summary;
    }

    private initializeSummary(totalFeedbacks: number): FeedbackSummary {
        return {
            textAnalysis: {
                topStrengths: [],
                topConcerns: [],
                suggestions: [],
                urgentIssues: []
            },
            statistics: {
                totalFeedbacks,
                textResponseCount: 0,
                averageSentiment: 0,
                "1to10": {
                    total: 0,
                    average: 0,
                    distribution: {
                        '1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6': 0, '7': 0, '8': 0, '9': 0, '10': 0
                    }
                },
                ratingStats: {
                    total: 0,
                    average: 0,
                    distribution: {
                        '1': 0, '2': 0, '3': 0, '4': 0, '5': 0
                    }
                }
            },
            sentimentDistribution: {
                positive: 0,
                negative: 0,
                neutral: 0
            },
            feedbackTrends: {
                byDay: { labels: [], positive: [], negative: [] },
                byWeek: { labels: [], positive: [], negative: [] },
                byMonth: { labels: [], positive: [], negative: [] }
            }
        };
    }

    private async processFeedbacks(feedbacks: Feedback[], summary: FeedbackSummary): Promise<void> {
        const textResponses: TextResponse[] = [];
        const stats = {
            totalSentimentScore: 0,
            sentimentCount: 0,
            sentimentCounts: { positive: 0, negative: 0, neutral: 0 },
            totalRatingScore: 0,
            ratingCount: 0,
            "1to10": {
                total: 0,
                average: 0,
                distribution: {
                    '1': 0, '2': 0, '3': 0, '4': 0, '5': 0,
                    '6': 0, '7': 0, '8': 0, '9': 0, '10': 0
                }
            }
        };

        const dailyFeedbacks = new Map<string, { positive: number, negative: number }>();
        const weeklyFeedbacks = new Map<string, { positive: number, negative: number }>();
        const monthlyFeedbacks = new Map<string, { positive: number, negative: number }>();

        // Process each feedback
        for (const feedback of feedbacks) {
            if (!feedback.responses) continue;

            const feedbackDate = new Date(feedback.createdAt);
            this.initializePeriodCounters(feedbackDate, dailyFeedbacks, weeklyFeedbacks, monthlyFeedbacks);

            for (const response of Object.values(feedback.responses)) {
                if (!response.value) continue;

                const value = Array.isArray(response.value) ? response.value.join(' ') : response.value;
            
                if(response.componentType === SurveyComponentType.SCALE_1_TO_10) {
                    stats["1to10"].total++;
                    stats["1to10"].distribution[value]++;
                }

                if (this.isRatingResponse(response)) {
                    this.processRatingResponse(value, summary, stats);
                }

                if (!this.shouldSkipTextAnalysis(value)) {
                    this.collectTextResponse(response, value, feedbackDate, textResponses);
                }
            }
        }
        this.logger.debug('Processing text responses', { textResponses });
        await this.processTextResponses(
            textResponses,
            summary,
            stats,
            dailyFeedbacks,
            weeklyFeedbacks,
            monthlyFeedbacks
        );

        this.finalizeSummary(
            summary,
            stats,
            dailyFeedbacks,
            weeklyFeedbacks,
            monthlyFeedbacks
        );
    }

    private isRatingResponse(response: { componentType: string }): boolean {
        return ['1to5stars', '1to5scale', '1to5faces'].includes(response.componentType);
    }

    private shouldSkipTextAnalysis(value: string): boolean {
        return value.length < 10 || isDemographicResponse(value);
    }

    private processRatingResponse(
        value: string,
        summary: FeedbackSummary,
        stats: { totalRatingScore: number; ratingCount: number }
    ): void {
        const rating = convertRatingToNumber(value);
        if (rating !== -1) {
            stats.totalRatingScore += rating;
            stats.ratingCount++;
            summary.statistics.ratingStats.total++;
            summary.statistics.ratingStats.distribution[rating.toString()]++;
        }
    }

    private collectTextResponse(
        response: { componentType: string; title?: string },
        value: string,
        date: Date,
        textResponses: TextResponse[]
    ): void {
        if (response.componentType === 'textbox' || response.componentType === 'input') {
            textResponses.push({
                text: value,
                type: response.title || 'general',
                date
            });
        }
    }

    private initializePeriodCounters(
        date: Date,
        dailyFeedbacks: Map<string, { positive: number; negative: number }>,
        weeklyFeedbacks: Map<string, { positive: number; negative: number }>,
        monthlyFeedbacks: Map<string, { positive: number; negative: number }>
    ): void {
        const dayKey = date.toISOString().split('T')[0];
        const weekKey = getWeekKey(date);
        const monthKey = getMonthKey(date);

        [
            { map: dailyFeedbacks, key: dayKey },
            { map: weeklyFeedbacks, key: weekKey },
            { map: monthlyFeedbacks, key: monthKey }
        ].forEach(({ map, key }) => {
            if (!map.has(key)) {
                map.set(key, { positive: 0, negative: 0 });
            }
        });
    }

    private async processTextResponses(
        textResponses: TextResponse[],
        summary: FeedbackSummary,
        stats: {
            totalSentimentScore: number;
            sentimentCount: number;
            sentimentCounts: { positive: number; negative: number; neutral: number };
        },
        dailyFeedbacks: Map<string, { positive: number; negative: number }>,
        weeklyFeedbacks: Map<string, { positive: number; negative: number }>,
        monthlyFeedbacks: Map<string, { positive: number; negative: number }>
    ): Promise<void> {
        for (const response of textResponses) {
            try {
                const sentiment = await this.sentimentService.analyzeSentiment(response.text);
                this.logger.debug('Analyzed sentiment', { sentiment, text: response.text });
                this.updateSentimentStats(
                    sentiment,
                    response,
                    summary,
                    stats,
                    dailyFeedbacks,
                    weeklyFeedbacks,
                    monthlyFeedbacks
                );
            } catch (error) {
                this.logger.error('Failed to analyze text response', {
                    error: error instanceof Error ? error.message : 'Unknown error',
                    text: response.text.substring(0, 50)
                });
            }
        }
    }

    private updateSentimentStats(
        sentiment: { label: string; score: number },
        response: TextResponse,
        summary: FeedbackSummary,
        stats: {
            totalSentimentScore: number;
            sentimentCount: number;
            sentimentCounts: { positive: number; negative: number; neutral: number };
        },
        dailyFeedbacks: Map<string, { positive: number; negative: number }>,
        weeklyFeedbacks: Map<string, { positive: number; negative: number }>,
        monthlyFeedbacks: Map<string, { positive: number; negative: number }>
    ): void {
        stats.totalSentimentScore += sentiment.score;
        stats.sentimentCount++;

        // The sentiment model returns scores between 0 and 1
        // For positive sentiments: score is confidence of being positive
        // For negative sentiments: score is confidence of being negative
        if (sentiment.label === 'positive' && sentiment.score > 0.7) {
            stats.sentimentCounts.positive++;
        } else if (sentiment.label === 'negative' && sentiment.score > 0.7) {
            stats.sentimentCounts.negative++;
        } else {
            stats.sentimentCounts.neutral++;
        }

        const dayKey = response.date.toISOString().split('T')[0];
        const weekKey = getWeekKey(response.date);
        const monthKey = getMonthKey(response.date);

        const hasPraiseWords = containsPhrases(response.text, FILTER_PHRASES.praise);
        const hasConcernWords = containsPhrases(response.text, FILTER_PHRASES.bugs);

        this.updateFeedbackCategories(
            sentiment,
            response.text,
            summary,
            hasPraiseWords,
            hasConcernWords,
            dailyFeedbacks.get(dayKey)!,
            weeklyFeedbacks.get(weekKey)!,
            monthlyFeedbacks.get(monthKey)!
        );
    }

    private updateFeedbackCategories(
        sentiment: { label: string; score: number },
        text: string,
        summary: FeedbackSummary,
        hasPraiseWords: boolean,
        hasConcernWords: boolean,
        dailyStats: { positive: number; negative: number },
        weeklyStats: { positive: number; negative: number },
        monthlyStats: { positive: number; negative: number }
    ): void {
        if (sentiment.label === 'positive' && sentiment.score > 0.7) {
            summary.textAnalysis.topStrengths.push(text);
            dailyStats.positive++;
            weeklyStats.positive++;
            monthlyStats.positive++;
        } else if ((sentiment.label === 'negative' && sentiment.score > 0.7)) {
            summary.textAnalysis.topConcerns.push(text);
            dailyStats.negative++;
            weeklyStats.negative++;
            monthlyStats.negative++;
        }

        if (containsPhrases(text, FILTER_PHRASES.suggestions)) {
            summary.textAnalysis.suggestions.push(text);
        }
        if (containsPhrases(text, FILTER_PHRASES.urgent)) {
            summary.textAnalysis.urgentIssues.push(text);
        }
    }

    private finalizeSummary(
        summary: FeedbackSummary,
        stats: {
            totalSentimentScore: number;
            sentimentCount: number;
            sentimentCounts: { positive: number; negative: number; neutral: number };
            totalRatingScore: number;
            ratingCount: number;
        },
        dailyFeedbacks: Map<string, { positive: number; negative: number }>,
        weeklyFeedbacks: Map<string, { positive: number; negative: number }>,
        monthlyFeedbacks: Map<string, { positive: number; negative: number }>
    ): void {
        if (stats.sentimentCount > 0) {
            this.calculateSentimentDistribution(summary, stats.sentimentCount, stats.sentimentCounts);
            summary.statistics.averageSentiment = Number((stats.totalSentimentScore / stats.sentimentCount).toFixed(2));
        }

        // Calculate rating stats
        if (stats.ratingCount > 0) {
            summary.statistics.ratingStats.average = Number((stats.totalRatingScore / stats.ratingCount).toFixed(2));
        }

        this.updateTimelineTrends(summary, dailyFeedbacks, weeklyFeedbacks, monthlyFeedbacks);
        this.deduplicateAndLimitAnalysis(summary);
    }

    private calculateSentimentDistribution(
        summary: FeedbackSummary,
        sentimentCount: number,
        sentimentCounts: { positive: number; negative: number; neutral: number }
    ): void {
        summary.sentimentDistribution = {
            positive: Number(((sentimentCounts.positive / sentimentCount) * 100).toFixed(2)),
            negative: Number(((sentimentCounts.negative / sentimentCount) * 100).toFixed(2)),
            neutral: Number(((sentimentCounts.neutral / sentimentCount) * 100).toFixed(2))
        };
    }

    private updateTimelineTrends(
        summary: FeedbackSummary,
        dailyFeedbacks: Map<string, { positive: number; negative: number }>,
        weeklyFeedbacks: Map<string, { positive: number; negative: number }>,
        monthlyFeedbacks: Map<string, { positive: number; negative: number }>
    ): void {
        const updateTrend = (
            feedbacks: Map<string, { positive: number; negative: number }>,
            trend: { labels: string[]; positive: number[]; negative: number[] }
        ) => {
            const sorted = Array.from(feedbacks.keys()).sort();
            trend.labels = sorted;
            trend.positive = sorted.map(key => feedbacks.get(key)!.positive);
            trend.negative = sorted.map(key => feedbacks.get(key)!.negative);
        };

        updateTrend(dailyFeedbacks, summary.feedbackTrends.byDay);
        updateTrend(weeklyFeedbacks, summary.feedbackTrends.byWeek);
        updateTrend(monthlyFeedbacks, summary.feedbackTrends.byMonth);
    }

    private deduplicateAndLimitAnalysis(summary: FeedbackSummary): void {
        summary.textAnalysis.topStrengths = [...new Set(summary.textAnalysis.topStrengths)];
        summary.textAnalysis.topConcerns = [...new Set(summary.textAnalysis.topConcerns)];
        summary.textAnalysis.suggestions = [...new Set(summary.textAnalysis.suggestions)];
        summary.textAnalysis.urgentIssues = [...new Set(summary.textAnalysis.urgentIssues)];
    }
} 
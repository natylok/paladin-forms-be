import { Injectable, Logger } from '@nestjs/common';
import { FeedbackSummary, TextResponse } from '../types/feedback.types';
import { Feedback } from '../feedback.schema';
import { SentimentService } from './sentiment.service';
import { FILTER_PHRASES } from '../constants/feedback.constants';
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
        let totalSentimentScore = 0;
        let sentimentCount = 0;
        let sentimentCounts = { positive: 0, negative: 0, neutral: 0 };
        let totalRatingScore = 0;
        let ratingCount = 0;

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
                
                if (this.isRatingResponse(response)) {
                    this.processRatingResponse(value, summary, totalRatingScore, ratingCount);
                }

                if (!this.shouldSkipTextAnalysis(value)) {
                    this.collectTextResponse(response, value, feedbackDate, textResponses);
                }
            }
        }

        await this.processTextResponses(
            textResponses,
            summary,
            sentimentCounts,
            totalSentimentScore,
            sentimentCount,
            dailyFeedbacks,
            weeklyFeedbacks,
            monthlyFeedbacks
        );

        this.finalizeSummary(
            summary,
            sentimentCount,
            sentimentCounts,
            totalSentimentScore,
            dailyFeedbacks,
            weeklyFeedbacks,
            monthlyFeedbacks
        );
    }

    private isRatingResponse(response: { componentType: string }): boolean {
        return ['rating', '1to5scale', '1to10scale'].includes(response.componentType);
    }

    private shouldSkipTextAnalysis(value: string): boolean {
        return value.length < 10 || isDemographicResponse(value);
    }

    private processRatingResponse(
        value: string,
        summary: FeedbackSummary,
        totalRatingScore: number,
        ratingCount: number
    ): void {
        const rating = convertRatingToNumber(value);
        if (rating !== -1) {
            totalRatingScore += rating;
            ratingCount++;
            summary.statistics.ratingStats.distribution[rating.toString()]++;
        }
    }

    private collectTextResponse(
        response: { componentType: string; title?: string },
        value: string,
        date: Date,
        textResponses: TextResponse[]
    ): void {
        if (response.componentType === 'text' || response.componentType === 'textbox' || response.componentType === 'input') {
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
        sentimentCounts: { positive: number; negative: number; neutral: number },
        totalSentimentScore: number,
        sentimentCount: number,
        dailyFeedbacks: Map<string, { positive: number; negative: number }>,
        weeklyFeedbacks: Map<string, { positive: number; negative: number }>,
        monthlyFeedbacks: Map<string, { positive: number; negative: number }>
    ): Promise<void> {
        for (const response of textResponses) {
            try {
                const sentiment = await this.sentimentService.analyzeSentiment(response.text);
                this.updateSentimentStats(
                    sentiment,
                    response,
                    summary,
                    sentimentCounts,
                    totalSentimentScore,
                    sentimentCount,
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
        sentimentCounts: { positive: number; negative: number; neutral: number },
        totalSentimentScore: number,
        sentimentCount: number,
        dailyFeedbacks: Map<string, { positive: number; negative: number }>,
        weeklyFeedbacks: Map<string, { positive: number; negative: number }>,
        monthlyFeedbacks: Map<string, { positive: number; negative: number }>
    ): void {
        totalSentimentScore += sentiment.score;
        sentimentCount++;

        // Increment the appropriate sentiment counter
        if (sentiment.label === 'positive' && sentiment.score > 0.7) {
            sentimentCounts.positive++;
        } else if (sentiment.label === 'negative' && sentiment.score > 0.7) {
            sentimentCounts.negative++;
        } else {
            sentimentCounts.neutral++;
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
        if (sentiment.label === 'positive' && sentiment.score > 0.7 && hasPraiseWords && !hasConcernWords) {
            summary.textAnalysis.topStrengths.push(text);
            dailyStats.positive++;
            weeklyStats.positive++;
            monthlyStats.positive++;
        } else if ((sentiment.label === 'negative' && sentiment.score > 0.7) || hasConcernWords) {
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
        sentimentCount: number,
        sentimentCounts: { positive: number; negative: number; neutral: number },
        totalSentimentScore: number,
        dailyFeedbacks: Map<string, { positive: number; negative: number }>,
        weeklyFeedbacks: Map<string, { positive: number; negative: number }>,
        monthlyFeedbacks: Map<string, { positive: number; negative: number }>
    ): void {
        if (sentimentCount > 0) {
            this.calculateSentimentDistribution(summary, sentimentCount, sentimentCounts);
            summary.statistics.averageSentiment = Number((totalSentimentScore / sentimentCount).toFixed(2));
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
        summary.textAnalysis.topStrengths = [...new Set(summary.textAnalysis.topStrengths)].slice(0, 5);
        summary.textAnalysis.topConcerns = [...new Set(summary.textAnalysis.topConcerns)].slice(0, 5);
        summary.textAnalysis.suggestions = [...new Set(summary.textAnalysis.suggestions)].slice(0, 5);
        summary.textAnalysis.urgentIssues = [...new Set(summary.textAnalysis.urgentIssues)].slice(0, 5);
    }
} 
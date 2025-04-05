import { Injectable, Logger } from '@nestjs/common';
import { pipeline } from '@xenova/transformers';
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
    private similarityModel: any;
    private readonly SIMILARITY_THRESHOLD = 0.5;

    constructor(private readonly sentimentService: SentimentService) {
        this.initializeSimilarityModel();
    }

    private async initializeSimilarityModel() {
        try {
            this.similarityModel = await pipeline(
                'feature-extraction',
                'Xenova/all-MiniLM-L6-v2',
                {
                    quantized: true
                }
            );
            this.logger.log('Similarity model initialized successfully');
        } catch (error) {
            this.logger.error('Failed to initialize similarity model', error);
        }
    }

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

    private cleanSentence(sentence: string): string {
        // Remove punctuation and convert to lowercase
        return sentence
            .toLowerCase()
            .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '')
            .replace(/\s{2,}/g, ' ')
            .trim();
    }

    private async areSentencesSimilar(sentence1: string, sentence2: string): Promise<boolean> {
        if (!this.similarityModel) {
            this.logger.warn('Similarity model not initialized, using fallback method');
            return this.fallbackSimilarityCheck(sentence1, sentence2);
        }

        try {
            const clean1 = this.cleanSentence(sentence1);
            const clean2 = this.cleanSentence(sentence2);
            this.logger.log('clean1', clean1);
            this.logger.log('clean2', clean2);

            // If one sentence is contained within the other, they are similar
            if (clean1.includes(clean2) || clean2.includes(clean1)) {
                return true;
            }

            // Get embeddings for both sentences
            const output1 = await this.similarityModel(clean1);
            const output2 = await this.similarityModel(clean2);
            // Extract the embeddings from the output
            const embedding1 = output1.data;
            const embedding2 = output2.data;
            // Calculate cosine similarity
            this.logger.log('--------------------------------');
            this.logger.log('clean1', clean1, 'clean2', clean2);
            const similarity = this.cosineSimilarity(embedding1, embedding2);
            return similarity > this.SIMILARITY_THRESHOLD;
        } catch (error) {
            this.logger.error('Error calculating sentence similarity', error);
            return this.fallbackSimilarityCheck(sentence1, sentence2);
        }
    }

    private fallbackSimilarityCheck(sentence1: string, sentence2: string): boolean {
        const clean1 = this.cleanSentence(sentence1);
        const clean2 = this.cleanSentence(sentence2);
        
        if (clean1.includes(clean2) || clean2.includes(clean1)) {
            return true;
        }

        const words1 = new Set(clean1.split(' '));
        const words2 = new Set(clean2.split(' '));
        
        const intersection = new Set([...words1].filter(x => words2.has(x)));
        const union = new Set([...words1, ...words2]);
        
        const similarity = intersection.size / union.size;
        return similarity > 0.6;
    }

    private cosineSimilarity(vec1: Float32Array, vec2: Float32Array): number {
        if (!vec1 || !vec2 || vec1.length !== vec2.length) {
            return 0;
        }

        let dotProduct = 0;
        let norm1 = 0;
        let norm2 = 0;

        for (let i = 0; i < vec1.length; i++) {
            dotProduct += vec1[i] * vec2[i];
            norm1 += vec1[i] * vec1[i];
            norm2 += vec2[i] * vec2[i];
        }

        norm1 = Math.sqrt(norm1);
        norm2 = Math.sqrt(norm2);

        if (norm1 === 0 || norm2 === 0) {
            this.logger.warn('Zero norm in cosine similarity calculation');
            return 0;
        }

        return dotProduct / (norm1 * norm2);
    }

    async extractTrendingSentences(feedbacks: {question: string, answer: string}[]): Promise<{question: string, answer: string, sentiment: string, count: number}[]> {
        const sentences: {question: string, answer: string, sentiment: string, count: number}[] = [];
        
        // Process each feedback
        for (const feedback of feedbacks) {
            const answer = feedback.answer;
            const question = feedback.question;
            
            // Skip empty or very short answers
            if (!answer || answer.length < 3) continue;
            
            // Analyze sentiment
            const sentiment = await this.sentimentService.analyzeSentiment(answer);
            
            // Check if this sentence is similar to any existing one with the same sentiment
            let foundSimilar = false;
            for (const existing of sentences) {
                if (existing.sentiment === sentiment.label && 
                    await this.areSentencesSimilar(existing.answer, answer)) {
                    existing.count++;
                    foundSimilar = true;
                    break;
                }
            }
            
            // If no similar sentence found, add as new
            if (!foundSimilar) {
                sentences.push({
                    question,
                    answer,
                    sentiment: sentiment.label,
                    count: 1
                });
            }
        }
        
        // Sort by frequency and return top sentences
        return sentences
            .sort((a, b) => b.count - a.count)
            .slice(0, 20) // Return top 10 trending sentences
            .map(({question, answer, sentiment, count}) => ({question, answer, sentiment, count}));
    }

    async getTrendingTopics(feedbacks: {question: string, answer: string}[]): Promise<{question: string, answer: string, sentiment: string}[]> {
        return await this.extractTrendingSentences(feedbacks);
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
                    this.collectTextResponse(feedback, response, value, feedbackDate, textResponses);
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
        feedback: Feedback,
        response: { componentType: SurveyComponentType; title?: string },
        value: string,
        date: Date,
        textResponses: TextResponse[]
    ): void {
        if (response.componentType === SurveyComponentType.TEXTBOX || response.componentType === SurveyComponentType.TEXT) {
            textResponses.push({
                text: value,
                type: response.title || 'general',
                date,
                feedbackId: feedback.id
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
                    monthlyFeedbacks,
                    response.feedbackId
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
        monthlyFeedbacks: Map<string, { positive: number; negative: number }>,
        feedbackId: string
    ): void {
        stats.totalSentimentScore += sentiment.score;
        stats.sentimentCount++;

        // The sentiment model returns scores between 0 and 1
        // For positive sentiments: score is confidence of being positive
        // For negative sentiments: score is confidence of being negative
        if (sentiment.label === 'POSITIVE' && sentiment.score > 0.7) {
            stats.sentimentCounts.positive++;
        } else if (sentiment.label === 'NEGATIVE' && sentiment.score > 0.7) {
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
            monthlyFeedbacks.get(monthKey)!,
            feedbackId
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
        monthlyStats: { positive: number; negative: number },
        feedbackId: string
    ): void {
        if (sentiment.label === 'POSITIVE' && sentiment.score > 0.7) {
            summary.textAnalysis.topStrengths.push({text, feedbackId});
            dailyStats.positive++;
            weeklyStats.positive++;
            monthlyStats.positive++;
        } else if ((sentiment.label === 'NEGATIVE' && sentiment.score > 0.7)) {
            summary.textAnalysis.topConcerns.push({text, feedbackId});
            dailyStats.negative++;
            weeklyStats.negative++;
            monthlyStats.negative++;
        }

        if (containsPhrases(text, FILTER_PHRASES.suggestions)) {
            summary.textAnalysis.suggestions.push({text, feedbackId});
        }
        if (containsPhrases(text, FILTER_PHRASES.urgent)) {
            summary.textAnalysis.urgentIssues.push({text, feedbackId});
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
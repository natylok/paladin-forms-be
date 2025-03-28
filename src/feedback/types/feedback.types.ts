import { HfInference } from '@huggingface/inference';
import { FeedbackResponse } from '../feedback.schema';

export interface SentimentResult {
    label: string;
    score: number;
}

export interface TextClassificationOutput {
    label: string;
    score: number;
}

export interface HuggingFaceResponse {
    [0]: {
        label: string;
        score: number;
    };
}

export interface SurveySummary {
    totalFeedbacks: number;
}

export interface FeedbackSummary {
    textAnalysis: {
        topStrengths: {text: string, feedbackId: string}[];
        topConcerns: {text: string, feedbackId: string}[];
        suggestions: {text: string, feedbackId: string}[];
        urgentIssues: {text: string, feedbackId: string}[];
    };
    statistics: {
        totalFeedbacks: number;
        textResponseCount: number;
        averageSentiment: number;
        ratingStats: {
            total: number;
            average: number;
            distribution: {
                [key: string]: number;
            };
        };
        "1to10": {
            total: number;
            average: number;
            distribution: {
                [key: string]: number;
            };
        };
    };
    sentimentDistribution: {
        positive: number;
        negative: number;
        neutral: number;
    };
    feedbackTrends: {
        byDay: TimelineTrend;
        byWeek: TimelineTrend;
        byMonth: TimelineTrend;
    };
}

export interface TimelineTrend {
    labels: string[];
    positive: number[];
    negative: number[];
}

export interface TextResponse {
    text: string;
    type: string;
    date: Date;
    feedbackId: string;
}

export type Pipeline = (text: string) => Promise<HuggingFaceResponse>;

export enum FilterType {
    POSITIVE = 'positive',
    NEGATIVE = 'negative',
    NEUTRAL = 'neutral',
    SUGGESTIONS = 'suggestions',
    BUGS = 'bugs',
    PRAISE = 'praise',
    URGENT = 'urgent',
    LAST_DAY = 'lastDay',
    LAST_WEEK = 'lastWeek',
    LAST_MONTH = 'lastMonth'
}

export interface FeedbackFilter {
    type: FilterType;
    threshold?: number;
    includeText?: boolean;
    includeRatings?: boolean;
    dateRange?: {
        start: Date;
        end: Date;
    };
}

export interface ComponentScore {
    componentId: string;
    title: string;
    averageRating: number;
    totalResponses: number;
    sentimentScore: number;
    textResponses: string[];
}

export interface DemographicPattern {
    field: string;
    pattern: RegExp;
    category: string;
} 
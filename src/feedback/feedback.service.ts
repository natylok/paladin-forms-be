import { Injectable, Inject, BadRequestException, Logger, OnModuleInit } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Document, ObjectId } from 'mongoose';
import { Feedback, FeedbackResponse } from './feedback.schema';
import { Survey } from '../survey/survey.schema';
import { User } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { LoggerService } from '../logger/logger.service';
import OpenAI from 'openai';
import * as csv from 'csv-writer';
import { createObjectCsvWriter } from 'csv-writer';
import { RedisClientType } from 'redis';
import { HfInference } from '@huggingface/inference';

// Define types for sentiment analysis
interface SentimentResult {
    label: string;
    score: number;
}

interface TextClassificationOutput {
    label: string;
    score: number;
}

interface HuggingFaceResponse {
    [0]: {
        label: string;
        score: number;
    };
}

type Pipeline = (text: string) => Promise<HuggingFaceResponse>;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Initialize Hugging Face client
const hf = new HfInference(process.env.HUGGING_FACE_API_KEY);

// Add Hugging Face API configuration
const HUGGING_FACE_API = 'https://api-inference.huggingface.co/models/siebert/sentiment-roberta-large-english';

// Add retry configuration
// const MAX_RETRIES = 3;
// const RETRY_DELAY = 1000; // 1 second

// Add API key validation
// if (!process.env.HUGGING_FACE_API_KEY) {
//     throw new Error('HUGGING_FACE_API_KEY environment variable is not set');
// }

const overviewFeedbackSystemPrompt = () => `
You are a deterministic feedback analysis system analyzing survey responses. Before starting your analysis, understand the feedback structure:

Feedback Structure:
Each feedback object contains a 'responses' field that is a map of component responses:
{
  responses: {
    [componentId: string]: {
      title: string,    // The question or component title
      value: string,    // The actual response/answer
      componentType: string  // Type of the component (e.g., 'rating', 'text', etc.)
    }
  }
}

Important Context:
- Each componentId represents a unique question in the survey
- The 'value' field contains the actual response (could be rating numbers or text)
- For rating components: values are on a scale of 0-5
- Text responses may contain sentiment, suggestions, or issues
- The 'title' field contains the actual question being asked

Your Task:
Analyze all feedbacks by first understanding each component's purpose through its title, then interpreting the values accordingly.

Return a JSON object with the following structure:

{
  "overallSatisfaction": {
    "score": number,  // Calculate as: (sum of all ratings / total number of ratings) * 20
    "totalResponses": number,
    "satisfactionBreakdown": {
      "verySatisfied": number,  // Count ratings >= 4, convert to percentage
      "satisfied": number,      // Count ratings = 3, convert to percentage
      "neutral": number,        // Count ratings = 2, convert to percentage
      "dissatisfied": number,   // Count ratings = 1, convert to percentage
      "veryDissatisfied": number // Count ratings = 0, convert to percentage
    }
  },
  "keyInsights": {
    "topStrengths": string[],    // Extract exact phrases from positive feedback (rating >= 4)
    "topConcerns": string[],     // Extract exact phrases from negative feedback (rating <= 2)
    "improvementAreas": string[], // Extract exact phrases from feedback with suggestions
    "userPreferences": string[]  // Extract exact phrases from feedback about preferences
  },
  "componentAnalysis": {
    "mostLiked": {
      "component": string,      // Component with highest average rating
      "satisfactionScore": number,  // Average rating for this component
      "totalResponses": number  // Number of responses for this component
    },
    "needsImprovement": {
      "component": string,      // Component with lowest average rating
      "satisfactionScore": number,  // Average rating for this component
      "totalResponses": number  // Number of responses for this component
    }
  },
  "trends": {
    "satisfactionOverTime": {
      "labels": string[],  // Dates in YYYY-MM-DD format
      "values": number[]   // Daily average satisfaction scores
    },
    "responseVolume": {
      "labels": string[],  // Dates in YYYY-MM-DD format
      "values": number[]   // Number of responses per day
    }
  },
  "userSegments": {
    "satisfiedUsers": {
      "percentage": number,  // Users with average rating >= 4
      "commonCharacteristics": string[]  // Most frequent feedback themes
    },
    "neutralUsers": {
      "percentage": number,  // Users with average rating between 2-3
      "commonCharacteristics": string[]  // Most frequent feedback themes
    },
    "dissatisfiedUsers": {
      "percentage": number,  // Users with average rating <= 1
      "commonCharacteristics": string[]  // Most frequent feedback themes
    }
  },
  "actionableInsights": {
    "priorityActions": string[],  // Direct quotes from feedback about critical issues
    "quickWins": string[],        // Direct quotes about simple improvements
    "longTermGoals": string[]     // Direct quotes about strategic improvements
  }
}

Analysis Process:
1. First pass: Read through all feedback components to understand question context
2. Second pass: Categorize components by type (rating vs text)
3. Third pass: Process ratings and calculate statistics
4. Fourth pass: Analyze text responses for sentiment and themes
5. Final pass: Combine insights and generate summary

Strict Analysis Rules:
1. Satisfaction Score Calculation:
   - Only use components that are clearly ratings
   - Convert all ratings to 0-5 scale
   - Calculate average rating
   - Multiply by 20 to get 0-100 score

2. Percentage Calculations:
   - Use formula: (count / total) * 100
   - Round to 2 decimal places
   - Use 0 for undefined values

3. Component Analysis:
   - First identify rating components by their titles and values
   - Calculate average rating per component
   - Sort by average rating
   - Select highest and lowest rated components

4. Text Analysis:
   - Extract exact phrases from feedback
   - Consider the question context when interpreting responses
   - Count frequency of themes
   - Limit to top 5 phrases per category

5. Data Handling:
   - Use 0 for missing numeric values
   - Use empty arrays [] for missing array values
   - Use empty strings "" for missing text values
   - Round all percentages to 2 decimal places

6. Response Format:
   - Return ONLY the JSON object
   - No additional text or explanation
   - Ensure all strings are properly escaped
   - Ensure all numbers are valid JSON numbers
`;

@Injectable()
export class FeedbackService implements OnModuleInit {
    private readonly logger = new Logger(FeedbackService.name);
    private readonly CACHE_TTL = 200; // 200 seconds

    private readonly filterPrompts = {
        positive: 'Find feedbacks with positive sentiment and high satisfaction ratings (4-5 stars)',
        negative: 'Find feedbacks with negative sentiment and low satisfaction ratings (1-2 stars)',
        neutral: 'Find feedbacks with neutral sentiment and medium ratings (3 stars)',
        lastDay: 'Find feedbacks from the last 24 hours',
        lastWeek: 'Find feedbacks from the last 7 days',
        lastMonth: 'Find feedbacks from the last 30 days',
        suggestions: 'Find feedbacks containing improvement suggestions or feature requests',
        bugs: 'Find feedbacks mentioning bugs, issues, or technical problems',
        praise: 'Find feedbacks containing praise or compliments',
        urgent: 'Find feedbacks marked as urgent or critical issues'
    };

    private readonly demographicPatterns = [
        /^(Yes|No|Rarely|Occasionally|Multiple times a week|Once a week)$/,
        /^(\$[0-9,]+|Less than \$25,000|Prefer not to say)$/,
        /^(18-24|25-34|35-44|45-54|55-64|65 and over)$/,
        /^(Male|Female|Non-binary|Prefer not to say)$/
    ];

    private readonly ratingPhrases = {
        positive: ['very satisfied', 'satisfied', 'extremely satisfied', '5', '4'],
        negative: ['very dissatisfied', 'dissatisfied', 'not satisfied', '1', '2'],
        neutral: ['neutral', 'neither satisfied nor dissatisfied', '3']
    };

    private readonly filterPhrases = {
        suggestions: ['would be nice', 'should add', 'could improve', 'would be better', 'suggest', 'would love to see', 'it would be great if'],
        bugs: ['error', 'bug', 'not working', 'broken', 'fails', 'crash', 'issue', 'problem'],
        praise: ['great', 'excellent', 'awesome', 'love', 'perfect', 'amazing', 'wonderful'],
        urgent: ['urgent', 'critical', 'immediate', 'asap', 'emergency']
    };

    constructor(
        @Inject('FEEDBACK_SERVICE') private readonly client: ClientProxy,
        @InjectModel(Survey.name) private readonly surveyModel: Model<Survey>,
        @InjectModel(Feedback.name) private readonly feedbackModel: Model<Feedback>,
        private readonly loggerService: LoggerService,
        @Inject('REDIS_CLIENT') private readonly redis: RedisClientType
    ) { }

    private generateCacheKey(user: User): string {
        return `paladin:feedback:summary:${user.email}`;
    }

    private async getCachedSummary(cacheKey: string): Promise<any | null> {
        try {
            const cachedData = await this.redis.get(cacheKey);

            this.logger.debug('Cache get attempt', {
                cacheKey,
                hasData: !!cachedData,
                dataType: typeof cachedData
            });

            if (!cachedData) {
                return null;
            }

            try {
                return JSON.parse(cachedData);
            } catch (e) {
                return null;
            }
        } catch (error) {
            this.logger.error('Cache get error', {
                error: error instanceof Error ? error.message : 'Unknown error',
                cacheKey
            });
            return null;
        }
    }

    private async setCachedSummary(cacheKey: string, data: any): Promise<boolean> {
        try {
            const serializedData = JSON.stringify(data);

            this.logger.debug('Cache set attempt', {
                cacheKey,
                dataSize: serializedData.length,
                ttl: this.CACHE_TTL
            });

            // Set data with TTL in seconds
            await this.redis.setEx(cacheKey, this.CACHE_TTL, serializedData);

            // Verify it was set
            const exists = await this.redis.exists(cacheKey);

            const success = exists === 1;
            this.logger.debug('Cache set result', {
                cacheKey,
                success,
                exists
            });

            return success;
        } catch (error) {
            this.logger.error('Cache set error', {
                error: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined,
                cacheKey
            });
            return false;
        }
    }

    async submitFeedback(surveyId: string, responses: Record<string, FeedbackResponse>): Promise<void> {
        try {
            this.logger.debug('Processing feedback submission', { surveyId, responses });

            // Clean the responses object to remove any nested responses
            const cleanResponses: Record<string, FeedbackResponse> = {};

            // If responses is nested inside another responses object, get the inner responses
            const actualResponses = responses.responses || responses;

            Object.entries(actualResponses).forEach(([key, value]) => {
                // Skip if the key is 'responses' or 'surveyId' or 'submittedAt'
                if (key === 'responses' || key === 'surveyId' || key === 'submittedAt') {
                    return;
                }
                // Add the response if it has the required properties
                if (value && typeof value === 'object' && 'componentType' in value && 'value' in value) {
                    cleanResponses[key] = {
                        componentType: value.componentType,
                        value: value.value,
                        title: value.title || ''
                    };
                }
            });

            // Create a new feedback document
            const feedback = new this.feedbackModel({
                surveyId,
                responses: cleanResponses,
                isRead: false
            });

            await feedback.save();
            this.logger.debug('Feedback saved to database', { surveyId, feedbackId: feedback._id });
        } catch (error) {
            this.logger.error(
                'Failed to submit feedback',
                error instanceof Error ? error.stack : undefined,
                { surveyId, responses }
            );
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

    async getFeedbacks(user: User, page: number = 1): Promise<{ feedbacks: Feedback[], totalPages: number }> {
        try {
            this.logger.debug('Fetching feedbacks for user', { user: user.email, page });
            const itemsPerPage = 100;
            const skip = (page - 1) * itemsPerPage;

            const [feedbacks, total] = await Promise.all([
                this.feedbackModel.find()
                    .skip(skip)
                    .limit(itemsPerPage)
                    .exec(),
                this.feedbackModel.countDocuments()
            ]);

            const totalPages = Math.ceil(total / itemsPerPage);

            if (!feedbacks) {
                this.logger.warn('No feedbacks found for user', { user: user.email, page });
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

    private convertRatingToNumber(value: string): number {
        // First try parsing as a number
        const numericValue = parseInt(value);
        if (!isNaN(numericValue)) {
            return numericValue;
        }

        // If not a number, convert text ratings to numbers
        const normalizedValue = value.toLowerCase();
        switch (normalizedValue) {
            case 'very satisfied':
                return 5;
            case 'satisfied':
                return 4;
            case 'neutral':
                return 3;
            case 'dissatisfied':
                return 2;
            case 'very dissatisfied':
                return 1;
            default:
                return -1; // Invalid rating
        }
    }

    async summerizeAllFeedbacks(user: User): Promise<any> {
        try {
            this.logger.debug('Starting feedback summary generation', { user: user.email });
            const { feedbacks } = await this.getFeedbacks(user);

            if (!feedbacks.length) {
                this.logger.warn('No feedbacks found to summarize', { user: user.email });
                return { message: 'No feedbacks found' };
            }

            // Initialize summary structure
            const summary = {
                textAnalysis: {
                    topStrengths: [] as string[],
                    topConcerns: [] as string[],
                    suggestions: [] as string[],
                    urgentIssues: [] as string[]
                },
                statistics: {
                    totalFeedbacks: feedbacks.length,
                    textResponseCount: 0,
                    averageSentiment: 0,
                    ratingStats: {
                        total: 0,
                        average: 0,
                        distribution: {
                            '1': 0,
                            '2': 0,
                            '3': 0,
                            '4': 0,
                            '5': 0
                        }
                    }
                },
                sentimentDistribution: {
                    positive: 0,
                    negative: 0,
                    neutral: 0
                },
                feedbackTrends: {
                    byDay: {
                        labels: [] as string[],
                        positive: [] as number[],
                        negative: [] as number[]
                    },
                    byWeek: {
                        labels: [] as string[],
                        positive: [] as number[],
                        negative: [] as number[]
                    },
                    byMonth: {
                        labels: [] as string[],
                        positive: [] as number[],
                        negative: [] as number[]
                    }
                }
            };

            // Collect all text responses and organize feedbacks by date
            const textResponses: { text: string, type: string, date: Date }[] = [];
            let totalSentimentScore = 0;
            let sentimentCount = 0;
            let sentimentCounts = { positive: 0, negative: 0, neutral: 0 };
            let totalRatingScore = 0;
            let ratingCount = 0;

            // Create maps to store feedback counts by date
            const dailyFeedbacks = new Map<string, { positive: number, negative: number }>();
            const weeklyFeedbacks = new Map<string, { positive: number, negative: number }>();
            const monthlyFeedbacks = new Map<string, { positive: number, negative: number }>();

            // First pass: collect all responses and organize by date
            for (const feedback of feedbacks) {
                if (!feedback.responses) continue;

                const feedbackDate = new Date(feedback.createdAt);
                const dayKey = feedbackDate.toISOString().split('T')[0];
                const weekKey = this.getWeekKey(feedbackDate);
                const monthKey = this.getMonthKey(feedbackDate);

                // Initialize period counters if they don't exist
                if (!dailyFeedbacks.has(dayKey)) {
                    dailyFeedbacks.set(dayKey, { positive: 0, negative: 0 });
                }
                if (!weeklyFeedbacks.has(weekKey)) {
                    weeklyFeedbacks.set(weekKey, { positive: 0, negative: 0 });
                }
                if (!monthlyFeedbacks.has(monthKey)) {
                    monthlyFeedbacks.set(monthKey, { positive: 0, negative: 0 });
                }

                for (const [componentId, response] of Object.entries(feedback.responses)) {
                    if (!response.value) continue;

                    const value = Array.isArray(response.value) ? response.value.join(' ') : response.value;
                    
                    // Handle ratings
                    if (response.componentType === 'rating' || response.componentType === '1to5scale') {
                        const rating = this.convertRatingToNumber(value);
                        if (rating !== -1) {
                            totalRatingScore += rating;
                            ratingCount++;
                            summary.statistics.ratingStats.distribution[rating.toString()]++;
                        }
                    }

                    // Skip demographic or very short responses for text analysis
                    if (value.length < 10 || this.isDemographicResponse(value)) {
                        continue;
                    }

                    if (response.componentType === 'textbox' || response.componentType === 'text') {
                        textResponses.push({
                            text: value,
                            type: response.title || 'general',
                            date: feedbackDate
                        });
                        summary.statistics.textResponseCount++;
                    }
                }
            }

            // Update rating statistics
            if (ratingCount > 0) {
                summary.statistics.ratingStats.total = ratingCount;
                summary.statistics.ratingStats.average = Number((totalRatingScore / ratingCount).toFixed(2));
            }

            this.logger.debug('Collected text responses', {
                count: textResponses.length,
                types: [...new Set(textResponses.map(r => r.type))]
            });

            // Second pass: analyze sentiment and categorize responses
            for (const response of textResponses) {
                try {
                    const sentiment = await this.analyzeSentiment(response.text);
                    totalSentimentScore += sentiment.score;
                    sentimentCount++;

                    // Track sentiment counts
                    sentimentCounts[sentiment.label as keyof typeof sentimentCounts]++;

                    // Update period-based sentiment counts
                    const dayKey = response.date.toISOString().split('T')[0];
                    const weekKey = this.getWeekKey(response.date);
                    const monthKey = this.getMonthKey(response.date);

                    if (sentiment.label === 'positive' && sentiment.score > 0.7) {
                        dailyFeedbacks.get(dayKey)!.positive++;
                        weeklyFeedbacks.get(weekKey)!.positive++;
                        monthlyFeedbacks.get(monthKey)!.positive++;
                    } else if (sentiment.label === 'negative' && sentiment.score > 0.7) {
                        dailyFeedbacks.get(dayKey)!.negative++;
                        weeklyFeedbacks.get(weekKey)!.negative++;
                        monthlyFeedbacks.get(monthKey)!.negative++;
                    }

                    this.logger.debug('Sentiment analysis result', {
                        text: response.text.substring(0, 50),
                        sentiment,
                        type: response.type
                    });

                    // More robust categorization using both sentiment and content analysis
                    const hasPraiseWords = this.containsPhrases(response.text, this.filterPhrases.praise);
                    const hasConcernWords = this.containsPhrases(response.text, this.filterPhrases.bugs);
                    
                    // Categorize as strength if:
                    // 1. Positive sentiment (> 0.7) AND contains praise words
                    // 2. No concern/bug related words
                    if (sentiment.label === 'positive' && 
                        sentiment.score > 0.7 && 
                        hasPraiseWords && 
                        !hasConcernWords) {
                        summary.textAnalysis.topStrengths.push(response.text);
                    } 
                    // Categorize as concern if:
                    // 1. Negative sentiment (> 0.7) OR
                    // 2. Contains bug/issue related words
                    else if ((sentiment.label === 'negative' && sentiment.score > 0.7) || 
                            hasConcernWords) {
                        summary.textAnalysis.topConcerns.push(response.text);
                    }

                    // Check for suggestions and urgent issues
                    if (this.containsPhrases(response.text, this.filterPhrases.suggestions)) {
                        summary.textAnalysis.suggestions.push(response.text);
                    }
                    if (this.containsPhrases(response.text, this.filterPhrases.urgent)) {
                        summary.textAnalysis.urgentIssues.push(response.text);
                    }

                } catch (error) {
                    this.logger.error('Failed to analyze text response', {
                        error: error instanceof Error ? error.message : 'Unknown error',
                        text: response.text.substring(0, 50)
                    });
                }
            }

            // Calculate sentiment distribution percentages
            if (sentimentCount > 0) {
                summary.sentimentDistribution = {
                    positive: Number(((sentimentCounts.positive / sentimentCount) * 100).toFixed(2)),
                    negative: Number(((sentimentCounts.negative / sentimentCount) * 100).toFixed(2)),
                    neutral: Number(((sentimentCounts.neutral / sentimentCount) * 100).toFixed(2))
                };
            }

            // Calculate average sentiment
            if (sentimentCount > 0) {
                summary.statistics.averageSentiment = Number((totalSentimentScore / sentimentCount).toFixed(2));
            }

            // Prepare timeline data
            const sortedDays = Array.from(dailyFeedbacks.keys()).sort();
            const sortedWeeks = Array.from(weeklyFeedbacks.keys()).sort();
            const sortedMonths = Array.from(monthlyFeedbacks.keys()).sort();

            summary.feedbackTrends.byDay = {
                labels: sortedDays,
                positive: sortedDays.map(day => dailyFeedbacks.get(day)!.positive),
                negative: sortedDays.map(day => dailyFeedbacks.get(day)!.negative)
            };

            summary.feedbackTrends.byWeek = {
                labels: sortedWeeks,
                positive: sortedWeeks.map(week => weeklyFeedbacks.get(week)!.positive),
                negative: sortedWeeks.map(week => weeklyFeedbacks.get(week)!.negative)
            };

            summary.feedbackTrends.byMonth = {
                labels: sortedMonths,
                positive: sortedMonths.map(month => monthlyFeedbacks.get(month)!.positive),
                negative: sortedMonths.map(month => monthlyFeedbacks.get(month)!.negative)
            };

            // Deduplicate and limit arrays to top 5 most relevant items
            summary.textAnalysis.topStrengths = [...new Set(summary.textAnalysis.topStrengths)].slice(0, 5);
            summary.textAnalysis.topConcerns = [...new Set(summary.textAnalysis.topConcerns)].slice(0, 5);
            summary.textAnalysis.suggestions = [...new Set(summary.textAnalysis.suggestions)].slice(0, 5);
            summary.textAnalysis.urgentIssues = [...new Set(summary.textAnalysis.urgentIssues)].slice(0, 5);

            this.logger.debug('Summary generated', {
                topStrengthsCount: summary.textAnalysis.topStrengths.length,
                topConcernsCount: summary.textAnalysis.topConcerns.length,
                suggestionsCount: summary.textAnalysis.suggestions.length,
                urgentIssuesCount: summary.textAnalysis.urgentIssues.length,
                averageSentiment: summary.statistics.averageSentiment,
                timelinePeriods: {
                    days: sortedDays.length,
                    weeks: sortedWeeks.length,
                    months: sortedMonths.length
                }
            });

            return summary;
        } catch (error) {
            this.logger.error(
                'Failed to summarize feedbacks',
                error instanceof Error ? error.stack : undefined,
                { user: user.email }
            );
            return {
                error: 'Failed to generate summary',
                message: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    // Method to manually invalidate cache if needed
    async invalidateFeedbackSummaryCache(user: User): Promise<void> {
        const cacheKey = this.generateCacheKey(user);
        await this.redis.del(cacheKey);
        this.logger.debug('Feedback summary cache invalidated', { user: user.email });
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

    async exportFeedbacksToCSV(user: User, surveyId: string): Promise<string> {
        try {
            this.logger.debug('Starting feedback export to CSV', { user: user.email, surveyId });

            // Get survey details
            const survey = await this.surveyModel.findOne({ surveyId }).exec();
            if (!survey) {
                this.logger.warn('Survey not found', { surveyId });
                throw new BadRequestException('Survey not found');
            }

            // Get all feedbacks for this survey
            const feedbacks = await this.feedbackModel.find({ surveyId }).exec();
            if (!feedbacks.length) {
                this.logger.warn('No feedbacks found to export', { user: user.email, surveyId });
                throw new BadRequestException('No feedbacks found to export');
            }

            // Get all unique question IDs for this survey
            const questionIds = new Set<string>();
            feedbacks.forEach(feedback => {
                if (feedback.responses) {
                    const responses = feedback.responses;
                    if (responses instanceof Map) {
                        Array.from(responses.entries()).forEach(([questionId, response]) => {
                            if (response && response.componentType && response.value) {
                                questionIds.add(questionId);
                            }
                        });
                    } else {
                        Object.entries(responses).forEach(([questionId, response]) => {
                            const typedResponse = response as FeedbackResponse;
                            if (typedResponse && typedResponse.componentType && typedResponse.value) {
                                questionIds.add(questionId);
                            }
                        });
                    }
                }
            });

            // Prepare CSV fields
            const baseFields = [
                { label: 'Feedback ID', value: '_id' },
                { label: 'Created At', value: 'createdAt' },
                { label: 'Updated At', value: 'updatedAt' },
                { label: 'Is Read', value: 'isRead' }
            ];

            // Add question fields
            Array.from(questionIds).forEach(questionId => {
                if (questionId) {
                    baseFields.push({
                        label: `Question ${questionId} - Title`,
                        value: `responses.${questionId}.title`
                    });
                    baseFields.push({
                        label: `Question ${questionId} - Component Type`,
                        value: `responses.${questionId}.componentType`
                    });
                }
            });

            // Convert fields to CSV writer format
            const fields = baseFields.map(field => ({
                id: field.value,
                title: field.label
            }));

            // Create a unique filename
            const filename = `feedbacks_${surveyId}_${new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').replace('Z', '')}.csv`;
            const filepath = `./${filename}`;

            // Create CSV writer
            const csvWriter = createObjectCsvWriter({
                path: filepath,
                header: fields
            });

            // Write feedbacks to CSV
            await csvWriter.writeRecords(feedbacks.map(feedback => {
                const csvRow: Record<string, any> = {
                    _id: feedback._id.toString(),
                    createdAt: feedback.createdAt.toISOString(),
                    updatedAt: feedback.updatedAt.toISOString(),
                    isRead: feedback.isRead
                };

                if (feedback.responses) {
                    const responses = feedback.responses;
                    if (responses instanceof Map) {
                        Array.from(responses.entries()).forEach(([questionId, response]) => {
                            if (response && response.componentType && response.value) {
                                csvRow[`responses.${questionId}.title`] = response.title || '';
                                csvRow[`responses.${questionId}.componentType`] = response.componentType;
                            }
                        });
                    } else {
                        Object.entries(responses).forEach(([questionId, response]) => {
                            const typedResponse = response as FeedbackResponse;
                            if (typedResponse && typedResponse.componentType && typedResponse.value) {
                                csvRow[`responses.${questionId}.title`] = typedResponse.title || '';
                                csvRow[`responses.${questionId}.componentType`] = typedResponse.componentType;
                            }
                        });
                    }
                }

                return csvRow;
            }));

            this.logger.debug('Feedbacks exported to CSV', { user: user.email, surveyId, filepath });
            return `Feedbacks exported to CSV successfully. File saved as: ${filename}`;
        } catch (error) {
            this.logger.error(
                'Failed to export feedbacks to CSV',
                error instanceof Error ? error.stack : undefined,
                { user: user.email, surveyId }
            );
            throw error;
        }
    }

    async getAvailableFilters(): Promise<string[]> {
        return Object.keys(this.filterPrompts);
    }

    async getFilterDescription(filterType: string): Promise<string> {
        return this.filterPrompts[filterType] || 'Filter description not found';
    }

    private isDemographicResponse(value: string): boolean {
        return this.demographicPatterns.some(pattern => pattern.test(value));
    }

    private matchesRatingCriteria(value: string | string[], type: 'positive' | 'negative' | 'neutral'): boolean {
        if (Array.isArray(value)) return false;
        
        const numericValue = parseInt(value);
        if (!isNaN(numericValue)) {
            switch (type) {
                case 'positive': return numericValue >= 4;
                case 'negative': return numericValue <= 2;
                case 'neutral': return numericValue === 3;
            }
        }

        const normalizedValue = value.toLowerCase();
        return this.ratingPhrases[type].includes(normalizedValue);
    }

    private containsPhrases(text: string, phrases: string[]): boolean {
        const normalizedText = text.toLowerCase();
        return phrases.some(phrase => normalizedText.includes(phrase.toLowerCase()));
    }

    private extractCommonPhrases(texts: string[]): string[] {
        const phrases = texts.reduce((acc, text) => {
            Object.values(this.filterPhrases).flat().forEach(phrase => {
                if (text.toLowerCase().includes(phrase.toLowerCase())) {
                    acc.push(text);
                }
            });
            return acc;
        }, [] as string[]);
        return [...new Set(phrases)].slice(0, 5);
    }

    private async shouldIncludeFeedback(feedback: Feedback, filterType: string): Promise<boolean> {
        if (!feedback.responses || Object.keys(feedback.responses).length === 0) return false;

        for (const response of Object.values(feedback.responses)) {
            if (!response.value) continue;

            const value = Array.isArray(response.value) ? response.value.join(' ') : response.value;
            
            // Skip demographic data and short responses
            if (value.length < 10 || this.isDemographicResponse(value)) {
                continue;
            }

            switch (filterType) {
                case 'positive':
                case 'negative':
                case 'neutral':
                    if (response.componentType === '1to5scale' || response.componentType === 'rating') {
                        if (this.matchesRatingCriteria(value, filterType as 'positive' | 'negative' | 'neutral')) {
                            return true;
                        }
                    } else if (response.componentType === 'text') {
                        // Use sentiment analysis for text responses
                        try {
                            const sentiment = await this.analyzeSentiment(value);
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
                    break;

                case 'suggestions':
                    if (this.containsPhrases(value, this.filterPhrases.suggestions)) {
                        return true;
                    }
                    break;

                case 'bugs':
                    if (this.containsPhrases(value, this.filterPhrases.bugs)) {
                        return true;
                    }
                    break;

                case 'praise':
                    if (this.containsPhrases(value, this.filterPhrases.praise)) {
                        return true;
                    }
                    break;

                case 'urgent':
                    if (this.containsPhrases(value, this.filterPhrases.urgent)) {
                        return true;
                    }
                    break;
            }
        }

        return false;
    }

    private getTimeBasedFeedbacks(feedbacks: Feedback[], filterType: 'lastDay' | 'lastWeek' | 'lastMonth'): { feedbacks: Feedback[], total: number } {
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

    async getFilteredFeedbacks(user: User, filterType: string, surveyId?: string): Promise<{ feedbacks: Feedback[], total: number }> {
        try {
            this.logger.debug('Getting filtered feedbacks', { user: user.email, filterType, surveyId });

            const query = surveyId ? { surveyId } : {};
            const feedbacks = await this.feedbackModel.find(query).exec();

            if (!feedbacks.length) {
                this.logger.warn('No feedbacks found to filter', { user: user.email, filterType, surveyId });
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

            const matchingFeedbacks = (await Promise.all(matchingFeedbacksPromises)).filter((feedback): feedback is Document<unknown, {}, Feedback> & Feedback & { _id: ObjectId } => feedback !== null);

            this.logger.debug('Filtered feedbacks', {
                user: user.email,
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
                { user: user.email, filterType, surveyId }
            );
            throw error;
        }
    }

    private async analyzeSentiment(text: string): Promise<SentimentResult> {
        try {
            const result = await hf.textClassification({
                model: 'siebert/sentiment-roberta-large-english',
                inputs: text
            });
            
            // Convert label to our format (positive, negative, neutral)
            let normalizedLabel: string;
            if (result[0].label.includes('POSITIVE')) {
                normalizedLabel = 'positive';
            } else if (result[0].label.includes('NEGATIVE')) {
                normalizedLabel = 'negative';
            } else {
                normalizedLabel = 'neutral';
            }

            return { 
                label: normalizedLabel, 
                score: result[0].score 
            };
        } catch (error) {
            this.logger.error('Error in sentiment analysis', {
                error: error instanceof Error ? error.message : 'Unknown error',
                text
            });
            return { label: 'neutral', score: 0.5 };
        }
    }

    // Helper methods for date handling
    private getWeekKey(date: Date): string {
        const year = date.getFullYear();
        const weekNumber = this.getWeekNumber(date);
        return `${year}-W${weekNumber.toString().padStart(2, '0')}`;
    }

    private getMonthKey(date: Date): string {
        return date.toISOString().substring(0, 7); // YYYY-MM format
    }

    private getWeekNumber(date: Date): number {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    }

    async onModuleInit() {
        this.logger.log('Feedback service initialized');
    }

}
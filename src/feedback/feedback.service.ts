import { Injectable, Inject, BadRequestException, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Feedback, FeedbackResponse } from './feedback.schema';
import { Survey } from '../survey/survey.schema';
import { User } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { LoggerService } from '../logger/logger.service';
import OpenAI from 'openai';
import * as csv from 'csv-writer';
import { createObjectCsvWriter } from 'csv-writer';
import { RedisClientType } from 'redis';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
export class FeedbackService {
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

    async summerizeAllFeedbacks(user: User): Promise<any> {
        try {
            this.logger.debug('Attempting to get feedback summary', { user: user.email });

            const cacheKey = this.generateCacheKey(user);
            this.logger.debug('Checking cache with key', { cacheKey });

            // Try to get from cache
            const cachedSummary = await this.getCachedSummary(cacheKey);
            if (cachedSummary) {
                this.logger.debug('Returning cached feedback summary', {
                    user: user.email,
                    cacheKey,
                    summaryType: typeof cachedSummary
                });
                return cachedSummary;
            }

            // Generate new summary if not in cache
            this.logger.debug('Cache miss - generating new feedback summary', { user: user.email });
            const feedbacks = await this.getFeedbacks(user);
            if (!feedbacks.feedbacks.length) {
                this.logger.warn('No feedbacks found to summarize', { user: user.email });
                return { message: 'No feedbacks found' };
            }

            const response = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [
                    {
                        role: 'system',
                        content: overviewFeedbackSystemPrompt()
                    },
                    {
                        role: 'user',
                        content: JSON.stringify(feedbacks.feedbacks)
                    }
                ],
                temperature: 0.2,
                max_tokens: 1000
            });

            const summary = response.choices[0]?.message?.content;

            if (!summary) {
                throw new Error('Failed to generate summary from OpenAI');
            }

            // Parse the summary
            const parsedSummary = JSON.parse(summary);

            // Attempt to cache the parsed summary
            const cached = await this.setCachedSummary(cacheKey, parsedSummary);
            if (cached) {
                this.logger.debug('Feedback summary cached successfully', {
                    user: user.email,
                    cacheKey
                });
            } else {
                this.logger.warn('Failed to cache feedback summary', {
                    user: user.email,
                    cacheKey
                });
            }

            return parsedSummary;
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

    async getFilteredFeedbacks(user: User, filterType: string, surveyId?: string): Promise<{ feedbacks: Feedback[], total: number }> {
        try {
            this.logger.debug('Getting filtered feedbacks', { user: user.email, filterType, surveyId });

            const query = surveyId ? { surveyId } : {};
            const feedbacks = await this.feedbackModel.find(query).exec();

            if (!feedbacks.length) {
                this.logger.warn('No feedbacks found to filter', { user: user.email, filterType, surveyId });
                return { feedbacks: [], total: 0 };
            }

            const filterPrompt = this.filterPrompts[filterType] || `Find feedbacks that match the ${filterType} criteria`;

            const response = await openai.chat.completions.create({
                model: 'gpt-4-turbo',
                messages: [
                    {
                        role: 'system',
                        content: `You are a precise feedback filtering system. Your task is to analyze feedback responses and return indices of ONLY those that EXACTLY match the filtering criteria.

FEEDBACK STRUCTURE:
Each feedback contains responses to survey questions:
{
  "responses": {
    [componentId: string]: {
      "title": string,    // The question being asked
      "value": string | string[],    // The response given
      "componentType": string  // Type of input (rating, text, etc.)
    }
  }
}

FILTERING RULES:
For "${filterType}" filter, apply these specific criteria:

1. Rating-based filters (check value field):
   - positive: ONLY include if rating is "4", "5", "Very satisfied", or "Extremely satisfied"
   - negative: ONLY include if rating is "1", "2", "Very dissatisfied", or "Dissatisfied"
   - neutral: ONLY include if rating is "3" or "Neutral"

2. Content-based filters (check value field):
   - suggestions: ONLY include if response contains phrases like "would be nice", "should add", "could improve", "would be better", "suggest", "would love to see", "it would be great if"
   - bugs: ONLY include if response contains words like "error", "issue", "doesn't work", "broken", "bug", "problem", "not working", "fails", "crashed"
   - praise: ONLY include if response contains words like "great", "excellent", "awesome", "love", "perfect", "amazing", "wonderful"
   - urgent: ONLY include if response contains words like "urgent", "critical", "immediate", "asap", "emergency"

3. Time-based filters (check createdAt timestamp):
   - lastDay: ONLY include if within last 24 hours
   - lastWeek: ONLY include if within last 7 days
   - lastMonth: ONLY include if within last 30 days

VALIDATION REQUIREMENTS:
1. For each feedback, check ALL response values
2. For text-based filters, check if ANY response contains the required phrases
3. For rating-based filters, check if ANY rating matches the criteria
4. For time-based filters, check the createdAt timestamp
5. ONLY include index if feedback DEFINITELY matches criteria
6. When in doubt, EXCLUDE rather than include

RESPONSE FORMAT:
Return ONLY a JSON array of indices where you are 100% confident they match the criteria.
Example: [0,1,2] or [] if none match

DO NOT INCLUDE:
- Feedbacks without matching responses
- Feedbacks where you're unsure about the match
- Empty feedbacks
- Feedbacks without relevant response types`
                    },
                    {
                        role: 'user',
                        content: JSON.stringify(feedbacks)
                    }
                ],
                temperature: 0.1,
                max_tokens: 150
            });

            let matchingIndices: number[] = [];
            const content = response.choices[0]?.message?.content;

            if (!content) {
                this.logger.warn('Empty response from AI', { user: user.email, filterType });
                return { feedbacks: [], total: 0 };
            }

            try {
                // Clean the response of any potential formatting
                const cleanedContent = content
                    .replace(/\`\`\`json|\`\`\`|\`/g, '')
                    .trim();
                
                matchingIndices = JSON.parse(cleanedContent);

                if (!Array.isArray(matchingIndices)) {
                    this.logger.warn('AI returned non-array response', { 
                        user: user.email, 
                        filterType,
                        response: cleanedContent 
                    });
                    return { feedbacks: [], total: 0 };
                }

                // Additional validation of the results
                const validatedFeedbacks = matchingIndices
                    .filter(index => {
                        const feedback = feedbacks[index];
                        // Ensure feedback exists and has responses
                        if (!feedback?.responses || Object.keys(feedback.responses).length === 0) {
                            return false;
                        }
                        return true;
                    })
                    .map(index => feedbacks[index]);

                this.logger.debug('Filtered feedbacks using AI', {
                    user: user.email,
                    filterType,
                    totalFeedbacks: feedbacks.length,
                    matchingFeedbacks: validatedFeedbacks.length
                });

                return {
                    feedbacks: validatedFeedbacks,
                    total: validatedFeedbacks.length
                };

            } catch (error) {
                this.logger.error(
                    'Failed to parse AI response',
                    error instanceof Error ? error.stack : undefined,
                    { 
                        user: user.email, 
                        filterType,
                        response: content 
                    }
                );
                return { feedbacks: [], total: 0 };
            }
        } catch (error) {
            this.logger.error(
                'Failed to filter feedbacks using AI',
                error instanceof Error ? error.stack : undefined,
                { user: user.email, filterType, surveyId }
            );
            throw error;
        }
    }

}
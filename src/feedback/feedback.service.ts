import { Injectable, Inject, BadRequestException, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Feedback, FeedbackResponse } from './feedback.schema';
import { Survey, SurveyComponentType } from '../survey/survey.schema';
import { User } from '@prisma/client';
import { LoggerService } from '../logger/logger.service';
import OpenAI from 'openai';
import * as csv from 'csv-writer';
import { createObjectCsvWriter } from 'csv-writer';
import { Parser } from 'json2csv';

const openai = new OpenAI({apiKey: process.env.OPENAI_API_KEY});

const overviewFeedbackSystemPrompt = () => `
You are a deterministic feedback analysis system. Your task is to analyze feedback data using strict, predefined rules to ensure consistent results. Return a JSON object with the following structure:

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

Strict Analysis Rules:
1. Satisfaction Score Calculation:
   - Convert all ratings to 0-5 scale
   - Calculate average rating
   - Multiply by 20 to get 0-100 score

2. Percentage Calculations:
   - Use formula: (count / total) * 100
   - Round to 2 decimal places
   - Use 0 for undefined values

3. Component Analysis:
   - Calculate average rating per component
   - Sort by average rating
   - Select highest and lowest rated components

4. Trend Analysis:
   - Group by date
   - Calculate daily averages
   - Sort dates chronologically

5. User Segmentation:
   - Calculate average rating per user
   - Segment based on rating thresholds
   - Count percentages of each segment

6. Text Analysis:
   - Extract exact phrases from feedback
   - Count frequency of phrases
   - Select most frequent phrases
   - Limit to top 5 phrases per category

7. Data Handling:
   - Use 0 for missing numeric values
   - Use empty arrays [] for missing array values
   - Use empty strings "" for missing text values
   - Round all percentages to 2 decimal places
   - Round all averages to 2 decimal places

8. Response Format:
   - Return ONLY the JSON object
   - No additional text or explanation
   - No markdown formatting
   - No code blocks
   - Ensure all strings are properly escaped
   - Ensure all numbers are valid JSON numbers

This system will produce identical results for identical input data, following these strict rules without any interpretation or variation.
`;

@Injectable()
export class FeedbackService {
    private readonly logger = new Logger(FeedbackService.name);

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
        private readonly loggerService: LoggerService
    ) {}

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
            this.logger.debug('Summarizing all feedbacks', { user: user.email });
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

            // Clean the response to ensure it's valid JSON
            const cleanedSummary = summary.trim().replace(/^```json\s*|\s*```$/g, '');
            
            try {
                const parsedSummary = JSON.parse(cleanedSummary);
                this.logger.debug('Feedbacks summarized successfully', { user: user.email });
                return parsedSummary;
            } catch (parseError) {
                this.logger.error(
                    'Failed to parse OpenAI response as JSON',
                    parseError instanceof Error ? parseError.stack : undefined,
                    { user: user.email, rawResponse: cleanedSummary }
                );
                throw new Error('Failed to parse feedback summary');
            }
        } catch (error) {
            this.logger.error(
                'Failed to summarize feedbacks',
                error instanceof Error ? error.stack : undefined,
                { user: user.email }
            );
            throw error;
        }
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
            const fields = [
                { label: 'Feedback ID', value: '_id' },
                { label: 'Created At', value: 'createdAt' },
                { label: 'Updated At', value: 'updatedAt' },
                { label: 'Is Read', value: 'isRead' }
            ];

            // Add question fields
            Array.from(questionIds).forEach(questionId => {
                if (questionId) {
                    fields.push({
                        label: `Question ${questionId} - Title`,
                        value: `responses.${questionId}.title`
                    });
                    fields.push({
                        label: `Question ${questionId} - Component Type`,
                        value: `responses.${questionId}.componentType`
                    });
                    fields.push({
                        label: `Question ${questionId} - Answer`,
                        value: `responses.${questionId}.value`
                    });
                }
            });

            // Prepare CSV records
            const records = feedbacks.map(feedback => {
                const record: any = {
                    _id: feedback._id,
                    createdAt: feedback.createdAt.toISOString(),
                    updatedAt: feedback.updatedAt.toISOString(),
                    isRead: feedback.isRead
                };

                // Add responses
                if (feedback.responses) {
                    const responses = feedback.responses;
                    if (responses instanceof Map) {
                        Array.from(responses.entries()).forEach(([questionId, response]) => {
                            if (response && response.componentType && response.value) {
                                record[`responses.${questionId}.title`] = response.title || '';
                                record[`responses.${questionId}.componentType`] = response.componentType;
                                record[`responses.${questionId}.value`] = response.value;
                            }
                        });
                    } else {
                        Object.entries(responses).forEach(([questionId, response]) => {
                            const typedResponse = response as FeedbackResponse;
                            if (typedResponse && typedResponse.componentType && typedResponse.value) {
                                record[`responses.${questionId}.title`] = typedResponse.title || '';
                                record[`responses.${questionId}.componentType`] = typedResponse.componentType;
                                record[`responses.${questionId}.value`] = typedResponse.value;
                            }
                        });
                    }
                }

                return record;
            });

            // Sort records by creation date
            records.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

            // Generate CSV string
            const parser = new Parser({ fields });
            const csvString = parser.parse(records);

            this.logger.debug('Feedbacks exported to CSV successfully', { 
                user: user.email,
                surveyId,
                feedbackCount: records.length
            });

            return csvString;
        } catch (error) {
            this.logger.error(
                'Failed to export feedbacks to CSV',
                error instanceof Error ? error.stack : undefined,
                { user: user.email, surveyId }
            );
            throw error;
        }
    }

    async getFilteredFeedbacks(user: User, filterType: string, surveyId?: string): Promise<{ feedbacks: Feedback[], total: number }> {
        try {
            this.logger.debug('Getting filtered feedbacks', { user: user.email, filterType, surveyId });

            // Base query
            const query: any = {};
            if (surveyId) {
                query.surveyId = surveyId;
            }

            // Get all feedbacks for the query
            const feedbacks = await this.feedbackModel.find(query).exec();
            if (!feedbacks.length) {
                return { feedbacks: [], total: 0 };
            }

            // Get the filter prompt
            const prompt = this.filterPrompts[filterType];
            if (!prompt) {
                throw new BadRequestException('Invalid filter type');
            }

            // Analyze feedbacks with AI
            const response = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [
                    {
                        role: 'system',
                        content: `You are a feedback analysis system. Your task is to analyze feedback data and return a JSON array of feedback IDs that match the following criteria: ${prompt}

IMPORTANT: Return ONLY a JSON array of feedback IDs as strings, like this: ["id1", "id2", "id3"]
Do not include any other text, explanation, or formatting.
Do not use backticks or markdown.
Do not include the word "json" in your response.
Ensure all IDs are strings.`
                    },
                    {
                        role: 'user',
                        content: JSON.stringify(feedbacks)
                    }
                ],
                temperature: 0.2,
                max_tokens: 1000
            });

            // Get the response content and clean it
            let content = response.choices[0]?.message?.content || '[]';
            
            // Remove any potential markdown or backticks
            content = content.replace(/```json\s*|\s*```/g, '').trim();
            
            // Remove any potential "json" text
            content = content.replace(/^json\s*/i, '').trim();
            
            // Ensure the content starts and ends with square brackets
            if (!content.startsWith('[')) content = '[' + content;
            if (!content.endsWith(']')) content = content + ']';

            try {
                // Parse the cleaned content
                const matchingIds = JSON.parse(content);
                
                // Ensure we have an array of strings
                if (!Array.isArray(matchingIds)) {
                    this.logger.error('AI response is not an array', { content });
                    return { feedbacks: [], total: 0 };
                }

                // Filter feedbacks based on AI analysis
                const filteredFeedbacks = feedbacks.filter(feedback => 
                    matchingIds.includes(feedback._id.toString())
                );

                this.logger.debug('Feedbacks filtered successfully', {
                    user: user.email,
                    filterType,
                    totalFeedbacks: feedbacks.length,
                    filteredCount: filteredFeedbacks.length
                });

                return {
                    feedbacks: filteredFeedbacks,
                    total: filteredFeedbacks.length
                };
            } catch (parseError) {
                this.logger.error('Failed to parse AI response', {
                    error: parseError,
                    content,
                    filterType
                });
                return { feedbacks: [], total: 0 };
            }
        } catch (error) {
            this.logger.error(
                'Failed to get filtered feedbacks',
                error instanceof Error ? error.stack : undefined,
                { user: user.email, filterType, surveyId }
            );
            throw error;
        }
    }

    async getAvailableFilters(): Promise<string[]> {
        return Object.keys(this.filterPrompts);
    }

    async getFilterDescription(filterType: string): Promise<string> {
        const description = this.filterPrompts[filterType];
        if (!description) {
            throw new BadRequestException('Invalid filter type');
        }
        return description;
    }
}

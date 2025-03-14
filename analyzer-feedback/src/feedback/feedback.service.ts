import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Feedback, FeedbackDocument } from './feedback.schema';

interface RawFeedbackResponse {
  componentType: string;
  value: string | number;
  title?: string;
}

@Injectable()
export class FeedbackService {
  private readonly logger = new Logger(FeedbackService.name);

  constructor(
    @InjectModel(Feedback.name) private feedbackModel: Model<FeedbackDocument>
  ) {}

  async processFeedback(data: any): Promise<Feedback> {
    try {
      this.logger.log(`Processing feedback for survey: ${data.surveyId}`);
      
      // Clean and transform the responses
      const cleanResponses = this.cleanAndTransformResponses(data.responses);

      // Prepare feedback data for saving
      const feedbackToSave = {
        surveyId: data.surveyId,
        responses: cleanResponses,
        metadata: {
          originalTimestamp: data.submittedAt || new Date(),
          source: 'paladin-forms-be'
        }
      };

      const feedback = new this.feedbackModel(feedbackToSave);
      await feedback.save();
      
      this.logger.log(`Feedback saved successfully for survey: ${data.surveyId}`);
      
      // Trigger analysis process
      await this.analyzeFeedback(feedback);
      
      return feedback;
    } catch (error) {
      this.logger.error(`Error processing feedback: ${error.message}`, error.stack);
      throw error;
    }
  }

  private cleanAndTransformResponses(responses: Record<string, any>): any[] {
    const cleanResponses: Record<string, RawFeedbackResponse> = {};
    const actualResponses = responses.responses || responses;

    // First, clean the responses
    Object.entries(actualResponses).forEach(([key, value]) => {
      if (key === 'responses' || key === 'surveyId' || key === 'submittedAt') {
        return;
      }
      if (value && typeof value === 'object' && 'componentType' in value && 'value' in value) {
        const typedValue = value as { componentType: string; value: string | number; title?: string };
        cleanResponses[key] = {
          componentType: typedValue.componentType,
          value: typedValue.value,
          title: typedValue.title || ''
        };
      }
    });

    // Then transform to array format
    return Object.entries(cleanResponses).map(([componentId, response]) => ({
      componentId,
      value: response.value,
      componentType: response.componentType,
      title: response.title || ''
    }));
  }

  private async analyzeFeedback(feedback: FeedbackDocument): Promise<void> {
    try {
      this.logger.log(`Analyzing feedback: ${feedback._id}`);

      // Extract text responses for analysis
      const textResponses = feedback.responses
        .filter(response => typeof response.value === 'string' && response.value.length > 0)
        .map(response => response.value as string);

      if (textResponses.length === 0) {
        this.logger.log(`No text responses to analyze for feedback: ${feedback._id}`);
        return;
      }

      // Basic sentiment analysis
      const sentiment = await this.performBasicSentimentAnalysis(textResponses);

      // Update the feedback document with analysis results
      await this.feedbackModel.findByIdAndUpdate(feedback._id, {
        $set: {
          isAnalyzed: true,
          ...sentiment
        }
      });

      this.logger.log(`Analysis completed for feedback: ${feedback._id}`);
    } catch (error) {
      this.logger.error(`Error analyzing feedback: ${error.message}`, error.stack);
    }
  }

  private async performBasicSentimentAnalysis(textResponses: string[]): Promise<any> {
    const combinedText = textResponses.join(' ').toLowerCase();
    
    // Simple keyword-based sentiment analysis
    const positiveWords = ['great', 'good', 'excellent', 'amazing', 'love', 'helpful', 'best'];
    const negativeWords = ['bad', 'poor', 'terrible', 'worst', 'hate', 'difficult', 'confusing'];
    
    const positiveCount = positiveWords.reduce((count, word) => 
      count + (combinedText.match(new RegExp(word, 'g')) || []).length, 0);
    
    const negativeCount = negativeWords.reduce((count, word) => 
      count + (combinedText.match(new RegExp(word, 'g')) || []).length, 0);
    
    const totalWords = combinedText.split(' ').length;
    const sentimentScore = (positiveCount - negativeCount) / Math.max(totalWords, 1);
    
    return {
      sentiment: sentimentScore > 0.1 ? 'positive' : sentimentScore < -0.1 ? 'negative' : 'neutral',
      analysis: `Found ${positiveCount} positive and ${negativeCount} negative expressions`,
      analysisScore: (sentimentScore + 1) / 2, // Normalize to 0-1 range
      analysisMetadata: {
        positiveCount,
        negativeCount,
        totalWords,
        responseCount: textResponses.length,
        averageLength: totalWords / textResponses.length
      }
    };
  }

  async getFeedbackAnalysis(surveyId: string): Promise<any> {
    try {
      const feedbacks = await this.feedbackModel
        .find({ surveyId, isAnalyzed: true })
        .select('sentiment analysis analysisScore analysisMetadata')
        .exec();

      return {
        surveyId,
        analysisCount: feedbacks.length,
        analyses: feedbacks
      };
    } catch (error) {
      this.logger.error(`Error getting feedback analysis: ${error.message}`, error.stack);
      throw error;
    }
  }
} 
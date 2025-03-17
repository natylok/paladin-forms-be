import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Feedback, FeedbackDocument } from './feedback.schema';
import { SentimentService } from './senstiment.service';

export enum SurveyComponentType {
  STAR_1_TO_5 = '1to5stars',
  TEXTBOX = 'textbox',
  SCALE_1_TO_10 = '1to10',
  INPUT = 'input',
  FACE_1_TO_5 = '1to5faces',
  RADIO_BUTTONS = 'radioButtons',
  DROPDOWN = 'dropdown',
  SCALE_1_TO_5 = '1to5scale',
  CHECKBOX = 'checkbox',
  SLIDER = 'slider',
  DATE_PICKER = 'datePicker',
  DIVIDER = 'divider',
  MULTIPLE_CHOICE = 'multi',
  TEXT = 'text'
}

interface RawFeedbackResponse {
  componentType: string;
  value: string | number;
  title?: string;
}

const RATING_COMPONENTS = [
  SurveyComponentType.STAR_1_TO_5,
  SurveyComponentType.SCALE_1_TO_5,
  SurveyComponentType.SCALE_1_TO_10,
  SurveyComponentType.FACE_1_TO_5,
];

const INPUT_COMPONENTS = [
  SurveyComponentType.TEXTBOX,
  SurveyComponentType.INPUT,

]

@Injectable()
export class FeedbackService {
  private readonly logger = new Logger(FeedbackService.name);

  constructor(
    @InjectModel(Feedback.name) private feedbackModel: Model<FeedbackDocument>,
    private readonly sentimentService: SentimentService
  ) { }

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
      let score = 0;
      this.logger.log(`Analyzing feedback: ${feedback._id}`);

      feedback.responses.forEach(async (response) => {
        const sentiment = await this.sentimentService.analyzeSentiment(response.value as string);
        if (RATING_COMPONENTS.includes(response.componentType as SurveyComponentType)) {
          if (Number(response.value) > 3) {
            score += 1;
          }
          else if (Number(response.value) < 3) {
            score -= 1;
          }
        }
        else if (INPUT_COMPONENTS.includes(response.componentType as SurveyComponentType)) {
          if (sentiment.label === 'positive') {
            score += 1;
          }
          else if (sentiment.label === 'negative') {
            score -= 1;
          }
        }
      });



      this.logger.log(`Analysis completed for feedback: ${feedback._id}`);
      await this.feedbackModel.findByIdAndUpdate(feedback._id, {
        $set: {
          isAnalyzed: true,
          score: score >= 2 ? 'positive' : score <= -2 ? 'negative' : 'neutral'
        }
      });
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
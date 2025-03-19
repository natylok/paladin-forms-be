import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type FeedbackDocument = Feedback & Document;

@Schema({ timestamps: true })
export class Feedback {
  @Prop({ required: true })
  surveyId: string;

  @Prop({ required: true })
  responses: FeedbackResponse[];

  @Prop()
  customerId?: string;

  @Prop({ type: Object })
  metadata?: Record<string, any>;

  @Prop({ default: false })
  isAnalyzed: boolean;

  @Prop()
  sentiment?: string;

  @Prop()
  analysis?: string;

  @Prop()
  score?: string;

  @Prop({ type: Object })
  analysisMetadata?: Record<string, any>;
}

export interface FeedbackResponse {
  componentId: string;
  value: string | number;
  componentType: string;
  title?: string;
}

export const FeedbackSchema = SchemaFactory.createForClass(Feedback); 
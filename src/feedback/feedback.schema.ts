import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export interface FeedbackResponse {
  componentType: string;
  value: string;
  title: string;
}

@Schema({ timestamps: true })
export class Feedback extends Document {
  @Prop({ type: String, required: true })
  surveyId: string;

  @Prop({
    type: Object,
    required: true,
    default: {}
  })
  responses: Record<string, FeedbackResponse>;

  @Prop({ type: Boolean, default: false })
  isRead: boolean;

  createdAt: Date;
  updatedAt: Date;
}

export const FeedbackSchema = SchemaFactory.createForClass(Feedback);

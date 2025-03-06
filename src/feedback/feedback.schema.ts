import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export interface FeedbackResponse {
  componentType: string;
  value: string;
}

@Schema({ timestamps: true })
export class Feedback extends Document {
  @Prop({ type: Types.ObjectId, required: true, ref: 'Survey' })
  surveyId: Types.ObjectId;

  @Prop({
    type: Map,
    of: {
      type: {
        componentType: { type: String },
        value: { type: String }
      }
    },
    required: false,
  })
  responses?: Record<string, FeedbackResponse>;

  @Prop({type: Boolean, default: false})
  isRead: boolean;
}

export const FeedbackSchema = SchemaFactory.createForClass(Feedback);

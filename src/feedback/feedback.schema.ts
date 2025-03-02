import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { SurveyComponentType } from '../survey/survey.schema';

@Schema({ timestamps: true })
export class Feedback extends Document {
  @Prop({ type: Types.ObjectId, required: true, ref: 'Survey' })
  surveyId: Types.ObjectId;

  @Prop({
    type: Map,
    of: String,
    required: false,
  })
  responses?: Partial<Record<SurveyComponentType, string>>; // ✅ Ensures optional fields match survey schema
}

export const FeedbackSchema = SchemaFactory.createForClass(Feedback);

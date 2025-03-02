import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { Types } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

export enum SurveyComponentType {
  STAR_1_TO_5 = '1to5stars',
  TEXTBOX = 'textbox',
  SCALE_1_TO_10 = '1to10',
  INPUT = 'input',
  FACE_1_TO_5 = '1to5faces',
  RADIO_BUTTONS = 'radioButtons',
}

@Schema()
export class Component {
  @Prop({ required: true })
  title: string;

  @Prop({ required: true, enum: Object.values(SurveyComponentType) })
  type: SurveyComponentType;
}

export const ComponentSchema = SchemaFactory.createForClass(Component);

@Schema({ timestamps: true })
export class Survey extends Document {
  @Prop({ unique: true, default: uuidv4 })
  surveyId: string;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  creatorEmail: string;

  @Prop({ type: [ComponentSchema], default: [] })
  components: Component[];

  @Prop({
    type: {
      backgroundColor: { type: String, required: true },
    },
  })
  style: {
    backgroundColor: string;
  };

  @Prop({ default: true })
  isActive: boolean
  
}

export const SurveySchema = SchemaFactory.createForClass(Survey);

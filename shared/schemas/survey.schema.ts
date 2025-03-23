import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { TriggerVariableType, TriggerVariable, TriggerByAction, SurveyComponentType, DependsOn, SurveyType } from '@natylok/paladin-forms-common';

@Schema()
export class SurveySettings {
  @Prop({ type: Number, default: 100 })
  showOnPercent: number;

  @Prop({ type: Number, default: 30 })
  usersWhoDeclined: number;

  @Prop({ type: Number, default: 30 })
  usersWhoSubmitted: number;

  @Prop({ type: Number, default: 30 })
  usersOnSessionInSeconds: number;

  @Prop({ type: Number, default: 0 })
  minTimeOnSiteSeconds: number;

  @Prop({ type: [String], default: [] })
  excludeUrls: string[];

  @Prop({ type: [String], default: [] })
  includeUrls: string[];

  @Prop({ type: Number, default: 3 })
  maxAttemptsPerUser: number;

  @Prop({
    type: {
      key: { type: String },
      type: { type: String, enum: Object.values(TriggerVariableType) },
      value: { type: String }
    }
  })
  triggerByVariable?: TriggerVariable;

  @Prop({
    type: {
      elementSelector: { type: String },
      action: { type: String },
    }
  })
  triggerByAction?: TriggerByAction;
}

export const SurveySettingsSchema = SchemaFactory.createForClass(SurveySettings);

@Schema()
export class SkipLogic {
  @Prop({ type: String })
  componentId: string;

  @Prop({ type: String })
  value: string;

  @Prop({ type: String })
  toComponentId: string;
}

export const SkipLogicSchema = SchemaFactory.createForClass(SkipLogic);

@Schema()
export class Component {
  @Prop({ default: [] })
  options: string[];

  @Prop({ type: String })
  title: string;

  @Prop({ type: String, enum: Object.values(SurveyComponentType) })
  type: SurveyComponentType;

  @Prop({ type: String, default: uuidv4 })
  id: string;

  @Prop({
    type: {
      componentId: { type: String },
      condition: { type: String }
    }
  })
  dependsOn?: DependsOn;

  @Prop({ type: Boolean, default: false })
  required: boolean;
}

export const ComponentSchema = SchemaFactory.createForClass(Component);

@Schema()
export class Translation {
  @Prop({ type: String, required: true })
  language: string;

  @Prop({ type: String })
  title: string;

  @Prop({ type: [Object], default: [] })
  components: {
    id: string;
    title: string;
    options: string[];
  }[];
}

export const TranslationSchema = SchemaFactory.createForClass(Translation);

@Schema({ timestamps: true })
export class Survey extends Document {
  @Prop({ type: String })
  customerId?: string;

  @Prop({ type: String, required: true })
  surveyName: string;

  @Prop({ type: String, default: uuidv4 })
  surveyId: string;

  @Prop({ type: String })
  title: string;

  @Prop({ type: String })
  creatorEmail: string;

  @Prop({
    type: {
      backgroundColor: { type: String },
      height: { type: String },
      width: { type: String },
      logoUrl: { type: String }
    }
  })
  style: {
    backgroundColor: string;
    width: string;
    height: string;
    logoUrl: string
  };

  @Prop({ type: Boolean, default: true })
  isActive: boolean;

  @Prop({ type: SurveySettingsSchema })
  settings: SurveySettings;
  
  @Prop({ type: [ComponentSchema], default: [] })
  components: Component[];

  @Prop({ type: String, enum: Object.values(SurveyType), default: SurveyType.Modal })
  surveyType: SurveyType;

  @Prop({type: [SkipLogicSchema], default: []})
  skipLogic?: SkipLogic[];

  @Prop({type: String, default: new Date().toISOString()})
  createdAt: string;

  @Prop({type: [TranslationSchema], default: []})
  translations?: Translation[];
}

export const SurveySchema = SchemaFactory.createForClass(Survey); 
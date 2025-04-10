import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { Types } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { TriggerVariableType, TriggerVariable, TriggerByAction, SurveyComponentType, DependsOn, SurveyType, SkipLogic, CompareType } from '@natylok/paladin-forms-common';
import { TranslationLanguages } from 'src/consts/translations';

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

export const validateSkipLogic = (value: Record<string, SkipLogic[]>) => {
  return (
    Object.values(value).every((skipLogic) => {
      return skipLogic.every((skip) => {
        return skip.toComponentId && skip.condition && Object.values(CompareType).includes(skip.condition.compareType) && skip.condition.value;
      })
    })
  )
}

export const SurveySettingsSchema = SchemaFactory.createForClass(SurveySettings);


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
  @Prop({ type: String, enum: Object.values(TranslationLanguages) })
  language: TranslationLanguages;

  @Prop({ type: [ComponentSchema], default: [] })
  components: Component[];
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

  @Prop({type: Object, default: {}, validate: { validator: validateSkipLogic }})
  skipLogic?: Record<string, SkipLogic[]>;

  @Prop({type: String, default: new Date().toISOString()})
  createdAt: string;

  @Prop({type: [TranslationSchema], default: []})
  translations?: Translation[];

  @Prop({type: Number, default: 0})
  numOfViews?: number;

  @Prop({type: Boolean, default: false})
  isRtl?: boolean;
  
  @Prop({type: String, default: new Date().toISOString()})
  updatedAt: string;
}

export const SurveySchema = SchemaFactory.createForClass(Survey);
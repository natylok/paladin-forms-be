import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { Types } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

export interface DependsOn {
  componentId: string;
  condition: string;
}

export interface TriggerVariable {
  key: string;
  type: TriggerVariableType;
  value: string;
}

export interface ISurvey {
  surveyId: string;
  title: string;
  creatorEmail: string;
  components: {
    title: string;
    type: SurveyComponentType;
    id: string;
    dependsOn?: DependsOn;
    required: boolean;
  }[];
  style: {
    backgroundColor: string;
    width: string;
    height: string;
  };
  isActive: boolean;
  settings: {
    showOnPercent: number;
    showOnAbandonment: boolean;
    cooldownDays: number;
    usersWhoDeclined: number;
    usersWhoSubmitted: number;
    usersOnSessionInSeconds: number;
    targetUserSegment: UserSegmentType;
    triggerType: TriggerType;
    allowSkip: boolean;
    minTimeOnSiteSeconds: number;
    excludeUrls: string[];
    includeUrls: string[];
    maxAttemptsPerUser: number;
    triggerByVariable?: TriggerVariable;
  };
  surveyType: SurveyType;
}

export enum SurveyType {
  Button = 'button',
  Modal = 'modal',
}

export enum SurveyComponentType {
  STAR_1_TO_5 = '1to5stars',
  TEXTBOX = 'textbox',
  SCALE_1_TO_10 = '1to10',
  INPUT = 'input',
  FACE_1_TO_5 = '1to5faces',
  RADIO_BUTTONS = 'radioButtons',
}

export enum UserSegmentType {
  ALL_USERS = 'all_users',
  FIRST_TIME = 'first_time',
  RETURNING = 'returning',
  VIP = 'vip',
  AT_RISK = 'at_risk'
}

export enum TriggerType {
  POST_ACTION = 'post_action',
  EXIT_INTENT = 'exit_intent',
  MILESTONE = 'milestone',
  INACTIVITY = 'inactivity',
  NATURAL_BREAK = 'natural_break'
}

export enum TriggerVariableType {
  COOKIE = 'COOKIE',
  VAR = 'VAR',
  URL = 'URL'
}

@Schema()
export class SurveySettings {
  @Prop({ type: Number, default: 100 })
  showOnPercent: number;

  @Prop({ type: Boolean, default: false })
  showOnAbandonment: boolean;

  @Prop({ 
    type: {
      url: { type: String },
      includes: { type: Boolean }
    }
  })
  showUrl: {
    url: string;
    includes: boolean;
  };

  @Prop({ type: Number, default: 30 })
  cooldownDays: number;

  @Prop({ type: Number, default: 30 })
  usersWhoDeclined: number;

  @Prop({ type: Number, default: 30 })
  usersWhoSubmitted: number;

  @Prop({ type: Number, default: 30 })
  usersOnSessionInSeconds: number;

  @Prop({ type: String, enum: Object.values(UserSegmentType), default: UserSegmentType.ALL_USERS })
  targetUserSegment: UserSegmentType;

  @Prop({ type: String, enum: Object.values(TriggerType), default: TriggerType.NATURAL_BREAK })
  triggerType: TriggerType;

  @Prop({ type: Boolean, default: true })
  allowSkip: boolean;

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
}

export const SurveySettingsSchema = SchemaFactory.createForClass(SurveySettings);

@Schema()
export class Component {
  @Prop({ default: []})
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

@Schema({ timestamps: true })
export class Survey extends Document {
  @Prop({ type: String, default: uuidv4 })
  surveyId: string;

  @Prop({ type: String })
  title: string;

  @Prop({ type: String })
  creatorEmail: string;

  @Prop({ type: [ComponentSchema], default: [] })
  components: Component[];

  @Prop({
    type: {
      backgroundColor: { type: String },
      height: { type: String },
      width: { type: String }
    }
  })
  style: {
    backgroundColor: string;
    width: string;
    height: string;
  };

  @Prop({ type: Boolean, default: true })
  isActive: boolean;

  @Prop({ type: SurveySettingsSchema })
  settings: SurveySettings;

  @Prop({ type: String, enum: Object.values(SurveyType), default: SurveyType.Button })
  surveyType: SurveyType;
}

export const SurveySchema = SchemaFactory.createForClass(Survey);
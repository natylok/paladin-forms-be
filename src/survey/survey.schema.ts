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

export interface TriggerByAction {
  action: 'CLICK';
  elementSelector: string;
}

export interface ISurvey {
  surveyId: string;
  surveyName: string;
  title: string;
  creatorEmail: string;
  components: {
    options: string[];
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
    logoUrl: string;
  };
  isActive: boolean;
  settings: {
    showOnPercent: number;
    usersWhoDeclined: number;
    usersWhoSubmitted: number;
    usersOnSessionInSeconds: number;
    minTimeOnSiteSeconds: number;
    excludeUrls: string[];
    includeUrls: string[];
    maxAttemptsPerUser: number;
    triggerByAction?: TriggerByAction;
    triggerByVariable?: TriggerVariable;
  };
  surveyType: SurveyType;
}

export interface SkipLogic {
  componentId: string;
  value: string;
  pageId: string;
}

export interface IPage {
  id: string;
  components: Component[];
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
  DROPDOWN = 'dropdown',
  SCALE_1_TO_5 = '1to5scale',
  CHECKBOX = 'checkbox',
  SLIDER = 'slider',
  DATE_PICKER = 'datePicker',
  MULTIPLE_CHOICE = 'multipleChoice',
  DIVIDER = 'divider',
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
  pageId: string;
}

export const SkipLogicSchema = SchemaFactory.createForClass(SkipLogic);

@Schema()
export class Page {
  @Prop({ default: [] })
  components: Component[];
}

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

export const PageSchema = SchemaFactory.createForClass(Page);

export const ComponentSchema = SchemaFactory.createForClass(Component);

@Schema({ timestamps: true })
export class Survey extends Document {
  @Prop({ type: String, required: true })
  surveyName: string;

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

  @Prop({ type: [PageSchema], default: [] })
  pages?: IPage[];

  @Prop({ type: String, enum: Object.values(SurveyType), default: SurveyType.Modal })
  surveyType: SurveyType;

  @Prop({type: [SkipLogicSchema], default: []})
  skipLogic?: SkipLogic[];
}

export const SurveySchema = SchemaFactory.createForClass(Survey);
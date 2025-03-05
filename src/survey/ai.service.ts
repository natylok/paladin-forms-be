import fs from 'fs';
import path from 'path';
import { OpenAI } from 'openai';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const surveyBestConditions = `
System Prompt: Best Conditions for Displaying Surveys

"Ensure surveys are shown at the most effective moments based on timing, frequency, user segmentation, and trigger conditions. Use the following guidelines to determine when a survey should be displayed:"

Timing
Show surveys immediately after key interactions (e.g., post-purchase, post-support chat, after using a new feature).
Display surveys during natural breaks (e.g., after onboarding, at the end of a workflow, on a thank-you page).
Avoid showing surveys mid-task or during critical actions (e.g., in the middle of checkout).
Frequency
Limit surveys per user to prevent fatigue (e.g., no more than once every 20-30 days unless transactional).
Transaction-based surveys (e.g., post-purchase) can be frequent if they are brief (1-3 questions).
Monitor response rates: if engagement drops, adjust the frequency accordingly.
User Segmentation
First-time users: Ask about onboarding experience.
Returning users: Gather deeper feedback on long-term experience.
VIP customers: Offer occasional in-depth surveys to gain valuable insights.
At-risk users (e.g., inactive or unsubscribing): Show exit surveys to identify pain points.
Trigger Conditions
Post-action: After purchase, after using a key feature, after a support interaction.
Exit-intent: When a user is about to leave (cart abandonment, cancellation).
Milestones: After X days of usage, contract renewal, loyalty anniversaries.
Inactivity: If a user hasn't engaged in a while, trigger a survey to understand why.
Opt-In vs. Forced Surveys
Surveys should be optional to avoid user frustration. Provide an easy "No thanks" option.
Mandatory responses can lower data quality; allow users to skip if needed.
If a survey is ignored, wait before showing it again (e.g., delay next prompt by X days).
Goal: Display surveys at the right time to maximize completion rates, prevent fatigue, and gather high-quality, actionable feedback for businesses.
`

export const formSchemaFile = `
    import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { Types } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

export interface DependsOn {
  componentId: string;
  condition: string;
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
    required?: boolean;
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
    showUrl: {
      url: string;
      includes: boolean;
    };
    cooldownDays: number;
    usersWhoDeclined: number;
    usersWhoSubmitted: number;
    usersOnSessionInSeconds: number;
    targetUserSegment: UserSegmentType;
    triggerType: TriggerType;
    minTimeOnSiteSeconds: number;
    excludeUrls: string[];
    maxAttemptsPerUser: number;
    triggerByVariable?: {
      key: string;
      type: TriggerVariableType;
      value: string;
    };
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

export interface TriggerVariable {
  key: string;
  type: TriggerVariableType;
  value: string;
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
`
const aiSystemPrompt = (surveyType: string, userEmail: string) => `
  You need to use the following schema please use the exact same schema:
  ${formSchemaFile}
  fill out the components with questions
  You are a survey creator.
  You are given a prompt and you need to create a survey based on the prompt please dont be bias and dont add any extra fields.
  survey type is ${surveyType} so please set the survey type based on the type.
  also please set form settings based on the following rules
  user email is ${userEmail} so please set the user email based on the email.
   prepare the survey to fit the schema have in form schema, remove all /n or any other thing so i can clearly do JSON.parse on the response.
just return it as string {} like that so i could json.parse it and use it in the code.
`;

export const generateSurvey = async (prompt: string, surveyType: string, userEmail: string) => {
    const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: aiSystemPrompt(surveyType, userEmail) }, { role: 'user', content: prompt }],
    });
    return response.choices[0].message.content?.replace(/\n/g, '');
};


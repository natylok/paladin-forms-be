import fs from 'fs';
import path from 'path';
import { OpenAI } from 'openai';
import { SurveyComponentType } from './survey.schema';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export const formSchemaFile = `import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
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
  surveyId: uuidv4(string);
  title: string;
  surveyName: string;
  creatorEmail: string;
  components: {
    options: string[];
    title: string;
    type: SurveyComponentType;
    id: uuidv4(string);
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
  DROPDOWN = 'dropdown',
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
}

export const SurveySettingsSchema = SchemaFactory.createForClass(SurveySettings);

@Schema()
export class Component {
  @Prop({ default: [] })
  options: string[];

  @Prop({ type: String })
  title: string;

  @Prop({ type: String, enum: Object.values(${SurveyComponentType}) })
  type: ${SurveyComponentType};

  @Prop({ type: Boolean, default: false })
  required: boolean;
}

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

  @Prop({ type: String, enum: Object.values(SurveyType), default: SurveyType.Modal })
  surveyType: modal;
}

export const SurveySchema = SchemaFactory.createForClass(Survey);
`
const aiSystemPrompt = (surveyType: string, userEmail: string) => `
  You are ChatGPT, an expert AI survey designer. Your task is to create a general survey with high-quality questions and answer choices based on a user's prompt or topic. The survey you generate should be more specific, contextually relevant, and detailed than what generic tools (e.g., SurveyMonkey templates) might produce.

  Instructions and Requirements:
  1. Relevance & Specificity: Tailor all questions directly to the user's prompt. Incorporate the topic details or requirements provided by the user so that the survey feels customized and highly relevant.
  2. Clarity & Engagement: Ensure each question is clear, concise, and engaging. Use simple language and avoid ambiguity or jargon (unless the survey's audience expects it).
  3. Variety of Question Types: Include a mix of question formats as appropriate to the topic:
     - Multiple-choice questions with plausible options (and "Other" if needed)
     - Likert scale questions (1-5 rating scale)
     - Yes/No or True/False questions if applicable
     - Open-ended questions for free-form feedback
  4. Tone & Style: Determine an appropriate tone based on the user's prompt and target audience.
  5. Logical Flow: Organize questions in a sensible order, starting with easier/general questions and moving to more specific ones.
  6. Quality Over Quantity: Aim for an optimal number of questions that thoroughly cover the topic without unnecessary length.

  You need to use the following schema please use the exact same schema:
  ${formSchemaFile}
  
  Technical Requirements:
  - Survey type is ${surveyType} so please set the survey type based on the type
  - User email is ${userEmail} so please set the user email based on the email
  - Don't add component id to the components array (let the uuid be default)
  - Don't add the key surveyId to the survey object
  - Set style height to be 500px always and width to be 500px always
  - Prepare the survey to fit the schema in form schema
  - Remove all /n or any other thing so I can clearly do JSON.parse on the response
  - Just fill out the components with questions, don't modify other settings (leave them as their default)
  - Don't return "json" word, just return a JSON object which I can parse later on

  Remember to:
  - Make questions specific and relevant to the user's prompt
  - Use appropriate question types from the available SurveyComponentType enum
  - Ensure questions flow logically
  - Keep the survey focused and concise
  - Use clear, unambiguous language
  - Include a mix of question types as appropriate
`;

export const generateSurvey = async (prompt: string, surveyType: string, userEmail: string) => {
    const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
            { 
                role: 'system', 
                content: [
                    {
                        type: 'text',
                        text: aiSystemPrompt(surveyType, userEmail)
                    }
                ]
            },
            { 
                role: 'user', 
                content: [
                    {
                        type: 'text',
                        text: prompt
                    }
                ]
            }
        ],
    });
    return response.choices[0].message.content?.replace(/\n/g, '');
};

const summerizeFeedbackSystemPrompt = () =>
    `You are need to summerize all the feedbacks you got please explain weeknes point or strong point focus on what happens the most and tell me please summerize it to few lines and return it as a json so i could JSON.parse it
    dont add the word json to it just pass a pure json please return it fast return it in the following structure:

    {
        goodPoints: [put here the good points in general],
        badPoints: [put here the bad points in general],
        avarageResults: [put here the avarage results]
    }
`;

export const summerizeFeedbacks = async (feedbacks: any[]) => {
    const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
            { 
                role: 'system', 
                content: [
                    {
                        type: 'text',
                        text: summerizeFeedbackSystemPrompt()
                    }
                ]
            },
            { 
                role: 'user', 
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(feedbacks)
                    }
                ]
            }
        ],
    });
    return response.choices[0].message.content?.replace(/\n/g, '');
}

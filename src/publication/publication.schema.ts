import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
export type PublicationDocument = Publication & Document;

export type TimeFrame = 'day' | 'week' | 'month';

@Schema({ timestamps: true })
export class Publication {
  @Prop({type: String, default: () => uuidv4()})
  id: string;

  @Prop({ required: true, enum: ['day', 'week', 'month'] })
  timeFrame: TimeFrame;

  @Prop({ required: true, type: [String] })
  emails: string[];

  @Prop({ required: true })
  creatorEmail: string;

  @Prop({ required: false })
  customerId?: string;
}

export const PublicationSchema = SchemaFactory.createForClass(Publication); 
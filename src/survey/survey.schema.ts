import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { Types } from 'mongoose';

@Schema()
export class Component {
  @Prop({ required: true })
  title: string;

  @Prop({ required: true, enum: ['1to5stars', 'textbox', '1to10', 'input', '1to5faces', 'radio buttons'] })
  type: string;
}

export const ComponentSchema = SchemaFactory.createForClass(Component);

@Schema({ timestamps: true }) // Adds createdAt & updatedAt automatically
export class Survey extends Document {
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
}

export const SurveySchema = SchemaFactory.createForClass(Survey);

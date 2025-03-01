import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Survey, SurveySchema } from './survey.schema';
import { SurveyController } from './survey.controller';
import { SurveyService } from './survey.service';

@Module({
  imports: [MongooseModule.forFeature([{ name: Survey.name, schema: SurveySchema }])],
  controllers: [SurveyController],
  providers: [SurveyService],
})
export class SurveyModule {}

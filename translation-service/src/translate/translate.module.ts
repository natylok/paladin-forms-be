import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TranslateController } from './translate.controller';
import { TranslateService } from './translate.service';
import { HttpModule } from '@nestjs/axios';
import { SurveyService } from './survey.service';
import { TranslatorService } from './translator.service';
import { MongooseModule } from '@nestjs/mongoose';
import { Survey, SurveySchema } from './survey.schema';

@Module({
  imports: [
    ConfigModule,
    HttpModule,
    MongooseModule.forFeature([{ name: Survey.name, schema: SurveySchema }]),
  ],
  controllers: [TranslateController],
  providers: [TranslateService, SurveyService, TranslatorService],
})
export class TranslateModule { }
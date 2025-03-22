import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TranslateController } from './translate.controller';
import { TranslateService } from './translate.service';
import { HttpModule } from '@nestjs/axios';
import { SurveyService } from './survey.service';
import { TranslatorService } from './translate-service';
@Module({
  imports: [
    ConfigModule,
    HttpModule,
  ],
  controllers: [TranslateController],
  providers: [TranslateService, SurveyService, TranslatorService]
})
export class TranslateModule { }
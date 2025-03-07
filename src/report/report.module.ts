import { Module } from '@nestjs/common';
import { ReportController } from './report.controller';
import { ReportService } from './report.service';
import { MongooseModule } from '@nestjs/mongoose';
import { Feedback, FeedbackSchema } from '../feedback/feedback.schema';
import { Survey, SurveySchema } from '../survey/survey.schema';
import { LoggerModule } from '../logger/logger.module';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Feedback.name, schema: FeedbackSchema },
            { name: Survey.name, schema: SurveySchema }
        ]),
        LoggerModule
    ],
    controllers: [ReportController],
    providers: [ReportService],
    exports: [ReportService]
})
export class ReportModule {} 
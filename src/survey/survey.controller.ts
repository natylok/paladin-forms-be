import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards, Req } from '@nestjs/common';
import { SurveyService } from './survey.service';
import { CreateSurveyDto } from './dto/create-survey.dto';
import { JwtGuard } from 'src/auth/guards';
import { Request } from 'express';
import { User } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { EventPattern, Payload, RmqContext, Ctx } from '@nestjs/microservices';
import { generateSurvey } from './ai.service';
import { LimitSurveysGuard } from './limitSurveyGuard';
import { RateLimit } from 'src/decorators/rate-limit.decorator';
import { LoggerService } from 'src/logger/logger.service';

@Controller('surveys')
export class SurveyController {
    openai: OpenAI;
    constructor(private readonly surveyService: SurveyService, private configService: ConfigService, private logger: LoggerService) {
        this.openai = new OpenAI({ apiKey: configService.get('OPEN_AI_KEY') });
    }

    @UseGuards(JwtGuard, LimitSurveysGuard)
    @Post()
    async createSurvey(@Body() createSurveyDto: CreateSurveyDto, @Req() req: Request) {
        return this.surveyService.createSurvey(createSurveyDto, req.user as User);
    }

    @UseGuards(JwtGuard)
    @Get()
    async getSurveys(@Req() req: Request) {
        return this.surveyService.getSurveys(req.user as User);
    }

    @Get(':id')
    async getSurveyById(@Param('id') id: string) {
        return this.surveyService.getSurveyById(id);
    }

    @UseGuards(JwtGuard)
    @Put(':id')
    async updateSurvey(@Param('id') id: string, @Body() updateData: Partial<CreateSurveyDto>, @Req() req: Request) {
        return this.surveyService.updateSurvey(id, updateData, req.user as User);
    }

    @UseGuards(JwtGuard)
    @Delete(':id')
    async deleteSurvey(@Param('id') id: string, @Req() req: Request) {
        return this.surveyService.deleteSurvey(id, req.user as User);
    }
  
    @Post('generate')
    @UseGuards(JwtGuard, LimitSurveysGuard)
    @RateLimit(50)
    async generateSurvey(@Body() data: { prompt: string, surveyType?: string }, @Req() req: Request) {
        this.logger.log('Generating survey', { prompt: data.prompt, surveyType: data.surveyType, user: (req.user as User).email });
        const survey = await generateSurvey(data.prompt, data.surveyType, (req.user as User).email);
        return JSON.parse(survey);
    }

    @EventPattern('survey_changed')
    async handleSurveyCreated(
        @Payload() user: User,
        @Ctx() context: RmqContext
    ) {
        this.logger.log('Received survey_changed event', { user: user.email });
        try {
            await this.surveyService.generateJavascriptCode(user);
            this.logger.log('Successfully processed survey_changed event', { user: user.email });
            // Use the built-in acknowledgment pattern
            context.getChannelRef().ack(context.getMessage());
        } catch (error) {
            this.logger.error(
                'Failed to process survey_changed event',
                error instanceof Error ? error.stack : undefined,
                { user: user.email }
            );
            // Reject the message without requeuing
            context.getChannelRef().reject(context.getMessage(), false);
        }
    }
}
import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards, Req } from '@nestjs/common';
import { SurveyService } from './survey.service';
import { CreateSurveyDto } from './dto/create-survey.dto';
import { JwtGuard } from 'src/auth/guards';
import { Request } from 'express';
import { User } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { EventPattern, Payload } from '@nestjs/microservices';
import { generateSurvey } from './ai.service';
import { LimitSurveysGuard } from './limitSurveyGuard';

@Controller('surveys')
export class SurveyController {
    openai: OpenAI;
    constructor(private readonly surveyService: SurveyService, private configService: ConfigService) {
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
    async func(@Body() data: { prompt: string, surveyType?: string }, @Req() req: Request) {
        const survey = await generateSurvey(data.prompt, data.surveyType, (req.user as User).email);
        await this.createSurvey(JSON.parse(survey), req);
        return { survey: JSON.parse(survey) };
    }

    @EventPattern('survey_changed')
    handleSurveyCreated(@Payload() user: User) {
        this.surveyService.generateJavascriptCode(user);
    }
}
import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards, Req } from '@nestjs/common';
import { SurveyService } from './survey.service';
import { CreateSurveyDto } from './dto/create-survey.dto';
import { JwtGuard } from 'src/auth/guards';
import { Request } from 'express';
import { User } from '@prisma/client';

@Controller('surveys')
export class SurveyController {
    constructor(private readonly surveyService: SurveyService) { }
    
    @UseGuards(JwtGuard)
    @Post()
    async createSurvey(@Body() createSurveyDto: CreateSurveyDto, @Req() req: Request) {
        return this.surveyService.createSurvey(createSurveyDto, req.user as User);
    }

    @UseGuards(JwtGuard)
    @Get()
    async getSurveys() {
        return this.surveyService.getSurveys();
    }

    @UseGuards(JwtGuard)
    @Get(':id')
    async getSurveyById(@Param('id') id: string) {
        return this.surveyService.getSurveyById(id);
    }

    @UseGuards(JwtGuard)
    @Put(':id')
    async updateSurvey(@Param('id') id: string, @Body() updateData: Partial<CreateSurveyDto>) {
        return this.surveyService.updateSurvey(id, updateData);
    }

    @UseGuards(JwtGuard)
    @Delete(':id')
    async deleteSurvey(@Param('id') id: string) {
        return this.surveyService.deleteSurvey(id);
    }
}

import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards, Req, Logger } from '@nestjs/common';
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
import { v4 as uuidv4 } from 'uuid';
import { TranslationLanguages } from 'src/consts/translations';
import { PremiumGuard } from 'src/auth/guards/premium.guard';
import { ISurvey } from '@natylok/paladin-forms-common';
@Controller('surveys')
export class SurveyController {
    openai: OpenAI;
    private readonly logger = new Logger(SurveyController.name);

    constructor(private readonly surveyService: SurveyService, private configService: ConfigService, private loggerService: LoggerService) {
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

    @UseGuards(JwtGuard)
    @Get(':id')
    async getSurveyById(@Param('id') id: string, @Req() req: Request) {
        try {
            this.logger.log('Fetching survey by ID', { surveyId: id });
            const survey = await this.surveyService.getSurveyById(id, req.user as User);
            this.logger.log('Survey fetched successfully', { surveyId: id });
            return survey;
        } catch (error) {
            this.logger.error(
                'Error fetching survey',
                error instanceof Error ? error.stack : undefined,
                { surveyId: id }
            );
            throw error;
        }
    }

    @UseGuards(JwtGuard)
    @Post(':surveyId/upload-image')
    async uploadImage(@Param('surveyId') surveyId: string, @Req() req: Request) {
        return this.surveyService.uploadImage(surveyId, req.user as User, req.body.image);
    }

    @UseGuards(JwtGuard)
    @Put(':id')
    async updateSurvey(@Param('id') id: string, @Body() updateData: Partial<CreateSurveyDto>, @Req() req: Request) {
        return this.surveyService.updateSurvey(id, updateData, req.user as User);
    }

    @UseGuards(JwtGuard)
    @Get('translate-status/:id')
    async getTranslateStatus(@Param('id') id: string, @Req() req: Request) {
        const status = await this.surveyService.getTranslateStatus(id);
        return {
            status,
        }
    }

    @UseGuards(JwtGuard)
    @Post('translate-surveys')
    async translateSurveys(@Body() body: { surveyIds: string[], sourceLang: TranslationLanguages, targetLangs: TranslationLanguages[] }, @Req() req: Request) {
        return this.surveyService.translateSurveys(body.surveyIds, req.user as User, body.sourceLang, body.targetLangs);
    }

    @UseGuards(JwtGuard)
    @Delete(':id')
    async deleteSurvey(@Param('id') id: string, @Req() req: Request) {
        return this.surveyService.deleteSurvey(id, req.user as User);
    }
  
    @Get(':surveyId/view')
    async viewSurvey(@Param('surveyId') surveyId: string) {
        return this.surveyService.viewSurvey(surveyId);
    }

    @Post('generate')
    @UseGuards(JwtGuard, LimitSurveysGuard)
    async generateSurvey(@Body() data: { prompt: string, surveyType?: string }, @Req() req: Request) {
        this.logger.log('Generating survey', { prompt: data.prompt, surveyType: data.surveyType, user: (req.user as User).email });
        const survey = await generateSurvey(data.prompt, data.surveyType, (req.user as User).email);
        const parsedSurvey = JSON.parse(survey);
        parsedSurvey.components.forEach(component => {  
            component.id = uuidv4();
        });
        return parsedSurvey;
    }


    @UseGuards(JwtGuard)
    @Get('publish-survey/:id')
    async publishSurvey(@Param('id') id: string, @Req() req: Request) {
        return this.surveyService.publishSurvey(id, req.user as User);
    }

    @EventPattern('publish_survey')
    async handlePublishSurvey(@Payload() data: { user: User, surveyId: string }, @Ctx() context: RmqContext) {
        const channel = context.getChannelRef();
        const originalMsg = context.getMessage();
        this.surveyService.handlePublishSurvey(data.surveyId, data.user);
        await channel.ack(originalMsg);
    }

    @EventPattern('survey_created')
    async onSurveyCreated(@Payload() data: { user: User, survey: ISurvey }, @Ctx() context: RmqContext) {
        this.logger.debug('Survey created event received')
        const channel = context.getChannelRef();
        const originalMsg = context.getMessage();

        this.surveyService.createLinkToSurvey(data.user, data.survey);
        await channel.ack(originalMsg);
        try {
            this.logger.log(`Processing survey_created event for user: ${data.user.email}, surveyId: ${data.survey.surveyId}`);
        }
        catch (error) {
            this.logger.error(
                `Failed to process survey_created event for user: ${data.user.email}`,
                error instanceof Error ? error.stack : undefined
            );
        }
    }
}
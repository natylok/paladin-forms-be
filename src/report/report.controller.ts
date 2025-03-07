import { Controller, Get, Param, Req, UseGuards, HttpException, HttpStatus } from '@nestjs/common';
import { ReportService } from './report.service';
import { User } from '@prisma/client';
import { Request } from 'express';
import { JwtGuard } from '../auth/guards';
import { PremiumGuard } from '../auth/guards/premium.guard';
import { LoggerService } from '../logger/logger.service';

@Controller('reports')
@UseGuards(JwtGuard, PremiumGuard)
export class ReportController {
    constructor(
        private readonly reportService: ReportService,
        private readonly logger: LoggerService
    ) {}

    @Get(':surveyId/satisfaction')
    async getSatisfactionDashboard(@Req() req: Request, @Param('surveyId') surveyId: string) {
        try {
            const user = req.user as User;
            this.logger.log('Generating satisfaction dashboard', { user: user.email, surveyId });
            const data = await this.reportService.generateSatisfactionDashboard(user, surveyId);
            this.logger.log('Satisfaction dashboard generated successfully', { user: user.email, surveyId });
            return data;
        } catch (error) {
            this.logger.error(
                'Error generating satisfaction dashboard',
                error instanceof Error ? error.stack : undefined,
                { user: (req.user as User)?.email, surveyId }
            );
            throw new HttpException(
                'Failed to generate satisfaction dashboard',
                HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }
} 
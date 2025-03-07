import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SurveyService } from './survey.service';
import { LoggerService } from '../logger/logger.service';

@Injectable()
export class LimitSurveysGuard implements CanActivate {
  constructor(
    private prisma: PrismaService,
    private surveyService: SurveyService,
    private logger: LoggerService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    const userSurveys = await this.surveyService.getSurveysByUser(user);
    const userFromDb = await this.prisma.user.findUnique({
      where: { id: user.id }
    });

    if (userSurveys.length >= userFromDb.surveysLimit) {
      this.logger.error(
        `User ${user.email} has reached their limit of ${userFromDb.surveysLimit} surveys`,
        undefined,
        { user: user.email, userId: user.id, surveysCount: userSurveys.length, limit: userFromDb.surveysLimit }
      );
      throw new HttpException(
        `You have reached your limit of ${userFromDb.surveysLimit} surveys`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }

    return true;
  }
}

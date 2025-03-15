import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './user/user.module';
import { PrismaModule } from './prisma/prisma.module';
import { SurveyModule } from './survey/survey.module';
import { MongooseModule } from '@nestjs/mongoose';
import { FeedbackModule } from './feedback/feedback.module';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { LoggerModule } from './logger/logger.module';
import { ReportModule } from './report/report.module';
import { RedisModule } from './redis/redis.module';
import { PublicationModule } from './publication/publication.module';
@Module({
  imports: [
    ConfigModule.forRoot(),
    RedisModule,
    AuthModule,
    UsersModule,
    PrismaModule,
    MongooseModule.forRoot(process.env.MONGO_URI),
    SurveyModule,
    FeedbackModule,
    LoggerModule,
    ReportModule,
    PublicationModule
  ]
})
export class AppModule { }

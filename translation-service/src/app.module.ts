import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TranslateModule } from './translate/translate.module';
import { MongooseModule } from '@nestjs/mongoose';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    RedisModule,
    TranslateModule,
    MongooseModule.forRoot(process.env.MONGO_URI),
  ],
})
export class AppModule {} 
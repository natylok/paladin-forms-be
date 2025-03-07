import { Module } from '@nestjs/common';
import { UsersService } from './user.service';
import { PrismaModule } from '../prisma/prisma.module';
import { LoggerModule } from '../logger/logger.module';

@Module({
  imports: [PrismaModule, LoggerModule],
  providers: [UsersService],
  exports: [UsersService], // Ensure UsersService is exported
})
export class UsersModule {}
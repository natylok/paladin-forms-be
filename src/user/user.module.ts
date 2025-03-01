import { Module } from '@nestjs/common';
import { UsersService } from './user.service';
@Module({
  providers: [UsersService],
  exports: [UsersService], // Ensure UsersService is exported
})
export class UsersModule {}
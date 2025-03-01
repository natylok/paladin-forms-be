// users.controller.ts
import { Controller, Post, Body, UseGuards, Request, Get } from '@nestjs/common';
import { JwtGuard } from '../auth/guards/jwt-auth.guard';
import { UsersService } from './user.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) { }

  @Post('register')
  async register(@Body() createUserDto: { email: string; password: string }) {
    return this.usersService.createUser(createUserDto);
  }

  @UseGuards(JwtGuard)
  @Get('profile')
  getProfile(@Request() req) {
    return req.user;
  }
}

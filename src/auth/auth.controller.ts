// auth.controller.ts
import { Controller, Post, UseGuards, Request, Get, Res } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { JwtGuard } from './guards/jwt-auth.guard';
import { GoogleOauthGuard } from './guards/google-oauth.guard';
import { Response } from 'express';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @UseGuards(LocalAuthGuard)
  @Post('login')
  async login(@Request() req) {
    return this.authService.login(req.user);
  }

  @UseGuards(GoogleOauthGuard)
  @Get('google')
  async googleAuth() {
    // Initiates Google OAuth2 login flow
  }

  @UseGuards(GoogleOauthGuard)
  @Get('google/callback')
  async googleAuthCallback(@Request() req, @Res() res: Response) {
    const token = await this.authService.googleLogin(req.user);
    res.cookie('access_token', token.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
    });

    return res.redirect(`/auth/profile?token=${token.access_token}`);; // Redirect to your desired route after successful login
  }

  @UseGuards(JwtGuard)
  @Get('profile')
  getProfile(@Request() req) {
    return req.user;
  }
}

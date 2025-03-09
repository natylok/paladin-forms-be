// auth.controller.ts
import { Controller, Post, UseGuards, Request, Get, Res, Req } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { JwtGuard } from './guards/jwt-auth.guard';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { Response, Request as ExpressRequest } from 'express';
import { ConfigService } from '@nestjs/config';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService
  ) {}

  @UseGuards(LocalAuthGuard)
  @Post('login')
  async login(@Request() req) {
    return this.authService.login(req.user);
  }

  @UseGuards(GoogleAuthGuard)
  @Get('google')
  async googleAuth() {
    // Guard will handle the authentication
  }

  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  async googleAuthRedirect(@Req() req: ExpressRequest, @Res() res: Response) {
    try {
      const { accessToken } = await this.authService.googleLogin(req);
      
      // Set the JWT token in an HTTP-only cookie
      res.cookie('access_token', accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
      });

      // Redirect to the dashboard
      return res.redirect('http://localhost:3000/dashboard');
    } catch (error) {
      // Redirect to login page with error
      return res.redirect('http://localhost:3000/login?error=Authentication failed');
    }
  }

  @UseGuards(JwtGuard)
  @Get('profile')
  getProfile(@Request() req) {
    return req.user;
  }

  @Get('logout')
  async logout(@Res() res: Response) {
    res.clearCookie('access_token');
    return res.redirect('http://localhost:3000/login');
  }
}

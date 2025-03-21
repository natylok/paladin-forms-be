// auth.controller.ts
import { Controller, Post, UseGuards, Request, Get, Res, Req, Body } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { JwtGuard } from './guards/jwt-auth.guard';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { Response, Request as ExpressRequest } from 'express';
import { ConfigService } from '@nestjs/config';
import { LoggerService } from '../logger/logger.service';
import { User } from '@prisma/client';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';

interface RequestWithUser extends Request {
  user: User;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
    private readonly logger: LoggerService
  ) {}

  @Post('signup')
  async signup(@Body() signupDto: SignupDto) {
    return this.authService.signup(signupDto);
  }
  
  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @UseGuards(GoogleAuthGuard)
  @Get('google')
  async googleAuth(@Req() req: ExpressRequest) {
    this.logger.log('User initiating Google authentication');
    // Guard will handle the authentication
  }

  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  async googleAuthRedirect(@Req() req: RequestWithUser, @Res() res: Response) {
    try {
      this.logger.log('Processing Google authentication callback', {
        email: req.user.email
      });

      const { accessToken } = await this.authService.googleLogin(req);
      
      // Set the JWT token in an HTTP-only cookie
      res.cookie('access_token', accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        domain: process.env.NODE_ENV === 'production' ? '.paladin-forms.com' : 'localhost',
        path: '/',
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
      });

      this.logger.log('Google authentication successful, redirecting to dashboard', {
        email: req.user.email
      });

      // Redirect to the dashboard with the access token as a query parameter
      // This allows the frontend to store it for Bearer token usage
      return res.redirect(`${process.env.NODE_ENV === 'production' 
        ? `http://localhost:3000` 
        : 'http://localhost:3000'}/dashboard?access_token=${accessToken}`);
    } catch (error) {
      this.logger.error(
        'Google authentication failed',
        error instanceof Error ? error.stack : undefined,
        { email: req.user?.email }
      );
      // Redirect to login page with error
      return res.redirect('http://localhost:3000/login?error=Authentication failed');
    }
  }

  @UseGuards(JwtGuard)
  @Get('profile')
  getProfile(@Request() req: RequestWithUser) {
    this.logger.debug('User accessing profile', { email: req.user.email });
    return req.user;
  }

  @Get('logout')
  async logout(@Req() req: RequestWithUser, @Res() res: Response) {
    this.logger.log('User logging out', { email: req.user?.email });
    res.clearCookie('access_token');
    this.logger.debug('Access token cookie cleared');
    return res.redirect('http://localhost:3000/login');
  }
}

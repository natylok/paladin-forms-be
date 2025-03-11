import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { UsersService } from 'src/user/user.service';
import { LoggerService } from '../../logger/logger.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly logger: LoggerService
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => {
          if (req && req.cookies) {
            return req.cookies['access_token'];
          }
          return null;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'),
    });
    this.logger.log('JWT authentication strategy initialized');
  }

  async validate(payload: any) {
    this.logger.debug('Validating JWT token', { email: payload.email });

    const user = await this.usersService.findOneByEmail?.(payload.email);
    if (!user) {
      this.logger.warn('JWT validation failed - user not found', { email: payload.email });
      throw new UnauthorizedException('User not found or token invalid');
    }

    this.logger.debug('JWT validation successful', { email: payload.email });
    return user;
  }
}

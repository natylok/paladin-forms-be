import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';
import { LoggerService } from '../../logger/logger.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
    constructor(
        private configService: ConfigService,
        private logger: LoggerService
    ) {
        super({
            clientID: configService.get('GOOGLE_CLIENT_ID'),
            clientSecret: configService.get('GOOGLE_CLIENT_SECRET'),
            callbackURL: `https://${configService.get('HOST')}/auth/google/callback`,
            scope: ['email', 'profile'],
            proxy: true,
            timeout: 20000,
            authorizationURL: 'https://accounts.google.com/o/oauth2/v2/auth',
            tokenURL: 'https://oauth2.googleapis.com/token'
        });
        this.logger.log('Google authentication strategy initialized');
    }

    async validate(accessToken: string, refreshToken: string, profile: any) {
        this.logger.log('Validating Google authentication', { 
            email: profile.emails[0].value,
            googleId: profile.id 
        });

        const user = {
            email: profile.emails[0].value,
            firstName: profile.name.givenName,
            lastName: profile.name.familyName,
            picture: profile.photos[0].value,
            accessToken,
            googleId: profile.id
        };

        this.logger.debug('Google authentication successful', { 
            email: user.email,
            googleId: user.googleId
        });

        return user;
    }
}

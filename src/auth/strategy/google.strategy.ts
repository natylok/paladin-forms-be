import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { Injectable } from '@nestjs/common';
import { UsersService } from 'src/user/user.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
    constructor(
        private configService: ConfigService,
        private usersService: UsersService,
    ) {
        super({
            clientID: configService.get('GOOGLE_CLIENT_ID'),
            clientSecret: configService.get<string>('GOOGLE_CLIENT_SECRET'),
            callbackURL: configService.get<string>('GOOGLE_CALLBACK'),
            scope: ['email', 'profile'],
        });
    }

    async validate(
        accessToken: string,
        refreshToken: string,
        profile: any,
        done: VerifyCallback,
    ): Promise<any> {
        const { id, emails } = profile;
        let user = await this.usersService.findOneByGoogleId(id);
        if (!user) {
            user = await this.usersService.createUser({
                googleId: id,
                email: emails[0].value,
            });
        }
        done(null, user);
    }
}

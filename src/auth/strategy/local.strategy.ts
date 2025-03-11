import { Strategy } from 'passport-local';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../auth.service';
import { LoggerService } from '../../logger/logger.service';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
    constructor(
        private authService: AuthService,
        private logger: LoggerService
    ) {
        super({ usernameField: 'email' });
        this.logger.log('Local authentication strategy initialized');
    }

    async validate(email: string, password: string): Promise<any> {
        this.logger.log('Validating local authentication', { email });
        
        const user = await this.authService.validateUser(email, password);
        if (!user) {
            this.logger.warn('Local authentication failed - invalid credentials', { email });
            throw new UnauthorizedException();
        }

        this.logger.debug('Local authentication successful', { email });
        return user;
    }
}

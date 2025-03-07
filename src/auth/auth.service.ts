import { ForbiddenException, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from 'src/user/user.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthDto } from './dto';
import * as argon from 'argon2';
import { Prisma, User } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { LoggerService } from '../logger/logger.service';

type UserWithHash = User & { hash: string };

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private prisma: PrismaService,
    private config: ConfigService,
    private logger: LoggerService
  ) {}

  async validateUser(email: string, password: string): Promise<Omit<User, 'hash'> | null> {
    const user = await this.usersService.findOneByEmail(email) as UserWithHash;
    if (user?.hash && (await argon.verify(user.hash, password))) {
      const { hash, ...result } = user;
      return result;
    }
    return null;
  }

  async login(user: Omit<User, 'hash'>) {
    const payload = { email: user.email, sub: user.id };
    return {
      access_token: this.jwtService.sign(payload),
    };
  }

  async googleLogin(user: Omit<User, 'hash'>) {
    const payload = { email: user.email, sub: user.id };
    return {
      access_token: this.jwtService.sign(payload),
    };
  }

  async signup(dto: AuthDto) {
    try {
      this.logger.log('Processing signup request', { email: dto.email });
      // generate the password hash
      const hash = await argon.hash(dto.password);
      // save the new user in the db
      const user = await this.prisma.user.create({
        data: {
          email: dto.email,
          hash,
          surveysLimit: 3,
        } as Prisma.UserCreateInput,
      });

      this.logger.log('User created successfully', { email: dto.email });
      return this.signToken(user.id, user.email);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          this.logger.error(
            'Email already exists',
            error.stack,
            { email: dto.email }
          );
          throw new ForbiddenException('Credentials taken');
        }
      }
      this.logger.error(
        'Error during signup',
        error instanceof Error ? error.stack : undefined,
        { email: dto.email }
      );
      throw error;
    }
  }

  async signin(dto: AuthDto) {
    try {
      this.logger.log('Processing signin request', { email: dto.email });
      // find the user by email
      const user = await this.prisma.user.findUnique({
        where: {
          email: dto.email,
        },
      }) as UserWithHash;
      // if user does not exist throw exception
      if (!user?.hash) {
        this.logger.warn('User not found or no password set', { email: dto.email });
        throw new ForbiddenException('Credentials incorrect');
      }

      // compare password
      const pwMatches = await argon.verify(user.hash, dto.password);
      // if password incorrect throw exception
      if (!pwMatches) {
        this.logger.warn('Invalid password during signin', { email: dto.email });
        throw new ForbiddenException('Credentials incorrect');
      }

      this.logger.log('User signed in successfully', { email: dto.email });
      return this.signToken(user.id, user.email);
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }
      this.logger.error(
        'Error during signin',
        error instanceof Error ? error.stack : undefined,
        { email: dto.email }
      );
      throw error;
    }
  }

  async signToken(userId: number, email: string): Promise<{ access_token: string }> {
    try {
      this.logger.debug('Generating JWT token', { userId, email });
      const payload = {
        sub: userId,
        email,
      };
      const secret = this.config.get('JWT_SECRET');

      const token = await this.jwtService.signAsync(payload, {
        expiresIn: '15m',
        secret: secret,
      });

      this.logger.debug('JWT token generated successfully', { email });
      return {
        access_token: token,
      };
    } catch (error) {
      this.logger.error(
        'Error generating JWT token',
        error instanceof Error ? error.stack : undefined,
        { userId, email }
      );
      throw error;
    }
  }
}

 

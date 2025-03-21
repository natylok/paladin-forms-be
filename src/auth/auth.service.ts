import { ForbiddenException, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from 'src/user/user.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthDto, LoginDto, SignupDto } from './dto';
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

  async login(loginDto: LoginDto) {
    const user = await this.usersService.findOneByEmail(loginDto.email) as UserWithHash;
    if (!user) {
      throw new ForbiddenException('User not found');
    }
    const pwMatches = await argon.verify(user.hash, loginDto.password);
    if (!pwMatches) {
      throw new ForbiddenException('Credentials incorrect');
    }
    const payload = { email: user.email, sub: user.id };
    return {
      access_token: this.jwtService.sign(payload),
    };

  }

  async googleLogin(req: any) {
    if (!req.user) {
      throw new Error('No user from Google');
    }

    // Find or create user in your database
    const user = await this.prisma.user.upsert({
      where: { email: req.user.email },
      update: {},  // Only update email
      create: {
        email: req.user.email
      }
    });

    // Generate JWT token
    const payload = { email: user.email, sub: user.id };
    const accessToken = await this.jwtService.signAsync(payload);

    return { accessToken };
  }

  async isEmailExist(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });
    return !!user;
  }

  async signup(signupDto: SignupDto ) {
    try {
      this.logger.log('Processing signup request', { email: signupDto.email });
      if(await this.isEmailExist(signupDto.email)) {
        throw new ForbiddenException('Email already exists');
      }
      // generate the password hash
      const hash = await argon.hash(signupDto.password);
      // save the new user in the db
      const user = await this.prisma.user.create({
        data: {
          email: signupDto.email,
          hash,
          surveysLimit: 3,
          userType: 'FREEMIUM',
        } as Prisma.UserCreateInput,
      });

      this.logger.log('User created successfully', { email: signupDto.email });
      const token = await this.signToken(user.id, user.email);
      return {
        user,
        token,
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          this.logger.error(
            'Email already exists',
            error.stack,
            { email: signupDto.email }
          );
          throw new ForbiddenException('Credentials taken');
        }
      }
      this.logger.error(
        'Error during signup',
        error instanceof Error ? error.stack : undefined,
        { email: signupDto.email }
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

 

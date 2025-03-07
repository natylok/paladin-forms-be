import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as argon from 'argon2';
import { LoggerService } from '../logger/logger.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private logger: LoggerService
  ) {}

  async findOneByEmail(email: string) {
    try {
      this.logger.debug('Finding user by email', { email });
      const user = await this.prisma.user.findUnique({
        where: { email },
      });
      if (!user) {
        this.logger.warn('User not found', { email });
      }
      return user;
    } catch (error) {
      this.logger.error(
        'Error finding user by email',
        error instanceof Error ? error.stack : undefined,
        { email }
      );
      throw error;
    }
  }

  async findOneByGoogleId(googleId: string) {
    return this.prisma.user.findUnique({ where: { googleId } });
  }

  async createUser(data: { email: string; password?: string; googleId?: string }) {
    try {
      this.logger.debug('Creating new user', { email: data.email });
      
      // Generate a random hash for Google users or use password hash for regular users
      const hash = data.password 
        ? await argon.hash(data.password)
        : await argon.hash(Math.random().toString(36));

      const user = await this.prisma.user.create({
        data: {
          email: data.email,
          hash,
          googleId: data.googleId,
          surveysLimit: 3,
        } as Prisma.UserCreateInput,
      });

      this.logger.debug('User created successfully', { email: data.email });
      return user;
    } catch (error) {
      this.logger.error(
        'Error creating user',
        error instanceof Error ? error.stack : undefined,
        { email: data.email }
      );
      throw error;
    }
  }

  async validatePassword(password: string, hashedPassword: string): Promise<boolean> {
    return argon.verify(hashedPassword, password);
  }
}

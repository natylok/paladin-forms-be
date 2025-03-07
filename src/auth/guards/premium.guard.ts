import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../logger/logger.service';
import { User } from '@prisma/client';

@Injectable()
export class PremiumGuard implements CanActivate {
  constructor(
    private prisma: PrismaService,
    private logger: LoggerService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      this.logger.warn('No user found in request for premium guard');
      return false;
    }

    try {
      const userFromDb = await this.prisma.user.findUnique({
        where: { id: user.id }
      });

      if (!userFromDb) {
        this.logger.warn('User not found in database for premium guard', { userId: user.id });
        return false;
      }

      const isPremium = userFromDb.userType === 'PRO' || userFromDb.userType === 'ENTERPRISE';
      
      if (!isPremium) {
        this.logger.warn('User does not have premium access', { 
          userId: user.id, 
          userType: userFromDb.userType 
        });
      } else {
        this.logger.debug('Premium access granted', { 
          userId: user.id, 
          userType: userFromDb.userType 
        });
      }

      return isPremium;
    } catch (error) {
      this.logger.error(
        'Error checking premium status',
        error instanceof Error ? error.stack : undefined,
        { userId: user.id }
      );
      return false;
    }
  }
} 
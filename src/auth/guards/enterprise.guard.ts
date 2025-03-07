import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../logger/logger.service';
import { User } from '@prisma/client';

@Injectable()
export class EnterpriseGuard implements CanActivate {
  constructor(
    private prisma: PrismaService,
    private logger: LoggerService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      this.logger.warn('No user found in request for enterprise guard');
      return false;
    }

    try {
      const userFromDb = await this.prisma.user.findUnique({
        where: { id: user.id }
      });

      if (!userFromDb) {
        this.logger.warn('User not found in database for enterprise guard', { userId: user.id });
        return false;
      }

      const isEnterprise = userFromDb.userType === 'ENTERPRISE';
      
      if (!isEnterprise) {
        this.logger.warn('User does not have enterprise access', { 
          userId: user.id, 
          userType: userFromDb.userType 
        });
      } else {
        this.logger.debug('Enterprise access granted', { 
          userId: user.id, 
          userType: userFromDb.userType 
        });
      }

      return isEnterprise;
    } catch (error) {
      this.logger.error(
        'Error checking enterprise status',
        error instanceof Error ? error.stack : undefined,
        { userId: user.id }
      );
      return false;
    }
  }
} 
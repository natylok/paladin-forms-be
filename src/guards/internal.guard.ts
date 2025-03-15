import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Observable } from 'rxjs';

@Injectable()
export class InternalGuard implements CanActivate {
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest();
    const internalKey = request.headers['x-internal-key'];
    
    // Just check if the internal key is valid, since we're using Docker networking
    return internalKey === process.env.INTERNAL_API_KEY;
  }
} 
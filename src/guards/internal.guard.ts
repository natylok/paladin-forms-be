import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Observable } from 'rxjs';

@Injectable()
export class InternalGuard implements CanActivate {
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest();
    const internalKey = request.headers['x-internal-key'];
    
    // Check if the request is coming from localhost and has the correct internal key
    const isLocalhost = request.ip === '127.0.0.1' || request.ip === '::1';
    const hasValidKey = internalKey === process.env.INTERNAL_API_KEY;

    return isLocalhost && hasValidKey;
  }
} 
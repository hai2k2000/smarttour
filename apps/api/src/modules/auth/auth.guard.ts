import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { authEnforceEnabled, smartTourEnvironment } from '../../config/runtime-env';
import { AuthService } from './auth.service';
import { tokenFromHeaders } from './auth-token';
import { PERMISSIONS_KEY, PUBLIC_ROUTE_KEY } from './permissions.decorator';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE_KEY, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [context.getHandler(), context.getClass()]) || [];
    const request = context.switchToHttp().getRequest();
    const token = tokenFromHeaders(request.headers);
    const env = smartTourEnvironment();
    const enforce = authEnforceEnabled();
    if ((env === 'production' || env === 'staging') && !enforce) {
      throw new UnauthorizedException('Auth enforcement must be enabled in this environment');
    }
    if (!token && !enforce) return true;
    const session = await this.authService.validateToken(token);
    request.user = session.user;
    if (required.length && !this.authService.hasPermissions(session.user, required)) throw new ForbiddenException('Thiếu quyền truy cập');
    return true;
  }
}

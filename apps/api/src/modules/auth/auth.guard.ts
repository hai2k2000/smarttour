import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { authEnforceEnabled } from '../../config/runtime-env';
import { AuthService } from './auth.service';
import { PERMISSIONS_KEY, PUBLIC_ROUTE_KEY } from './permissions.decorator';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE_KEY, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [context.getHandler(), context.getClass()]) || [];
    const request = context.switchToHttp().getRequest();
    const token = this.bearer(request.headers?.authorization) || this.cookie(request.headers?.cookie);
    const enforce = authEnforceEnabled();
    if (!token && !enforce) return true;
    const session = await this.authService.validateToken(token);
    request.user = session.user;
    if (required.length && !this.authService.hasPermissions(session.user, required)) throw new UnauthorizedException('Thiếu quyền truy cập');
    return true;
  }

  private bearer(value?: string) {
    if (!value) return null;
    const [type, token] = value.split(' ');
    return type?.toLowerCase() === 'bearer' && token ? token : null;
  }

  private cookie(value?: string | string[]) {
    const header = Array.isArray(value) ? value.join(';') : value;
    const cookie = header?.split(';').map((item) => item.trim()).find((item) => item.startsWith('smarttour.auth.token='));
    return cookie ? decodeURIComponent(cookie.slice('smarttour.auth.token='.length)) : null;
  }
}

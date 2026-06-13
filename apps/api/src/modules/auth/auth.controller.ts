import { Body, Controller, Get, Headers, Ip, Param, Post, Put, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthCookieResponse, clearAuthCookie, setAuthCookie } from './auth-cookie';
import { AuthService } from './auth.service';
import { AuthTokenHeaders, tokenFromHeaders } from './auth-token';
import { Public, RequirePermissions } from './permissions.decorator';

type AuthRequest = {
  headers: AuthTokenHeaders;
  user?: {
    id: string;
    branch?: string | null;
    department?: string | null;
    roles?: Array<{ role?: { status?: string; permissions?: Array<{ permission: string }> } }>;
  };
};

type SessionPayload = {
  token?: string;
  expiresAt?: Date | string;
};

@ApiTags('auth')
@ApiBearerAuth()
@Controller('auth')
export class AuthController {
  constructor(private readonly service: AuthService) {}

  @Post('bootstrap')
  @Public()
  async bootstrap(
    @Body() dto: Record<string, unknown>,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Ip() ip: string,
    @Res({ passthrough: true }) response: AuthCookieResponse,
  ) {
    const result = await this.service.bootstrap(dto, { headers, ip });
    this.setSessionCookie(response, result);
    return result;
  }

  @Post('login')
  @Public()
  async login(
    @Body() dto: Record<string, unknown>,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Ip() ip: string,
    @Res({ passthrough: true }) response: AuthCookieResponse,
  ) {
    const result = await this.service.login(dto, { headers, ip });
    this.setSessionCookie(response, result);
    return result;
  }

  @Post('logout')
  @Public()
  async logout(@Req() request: AuthRequest, @Res({ passthrough: true }) response: AuthCookieResponse) {
    try {
      return await this.service.logout(tokenFromHeaders(request.headers), request.user?.id);
    } finally {
      clearAuthCookie(response);
    }
  }

  @Get('me')
  me(@Req() request: AuthRequest) {
    return this.service.me(tokenFromHeaders(request.headers));
  }

  @Post('change-password')
  async changePassword(
    @Req() request: AuthRequest,
    @Body() dto: Record<string, unknown>,
    @Ip() ip: string,
    @Res({ passthrough: true }) response: AuthCookieResponse,
  ) {
    const result = await this.service.changePassword(request.user?.id, dto, tokenFromHeaders(request.headers), { headers: request.headers, ip });
    this.setSessionCookie(response, result);
    return result;
  }

  @Get('users')
  @RequirePermissions('auth.user.manage')
  users(@Req() request: AuthRequest) {
    return this.service.listUsers(request.user);
  }

  @Post('users')
  @RequirePermissions('auth.user.manage')
  createUser(@Body() dto: Record<string, unknown>, @Req() request: AuthRequest) {
    return this.service.createUser(dto, request.user);
  }

  @Put('users/:id')
  @RequirePermissions('auth.user.manage')
  updateUser(@Param('id') id: string, @Body() dto: Record<string, unknown>, @Req() request: AuthRequest) {
    return this.service.updateUser(id, dto, request.user);
  }

  @Get('roles')
  @RequirePermissions('auth.role.manage')
  roles(@Req() request: AuthRequest) {
    return this.service.listRoles(request.user);
  }

  @Post('roles')
  @RequirePermissions('auth.role.manage')
  createRole(@Body() dto: Record<string, unknown>, @Req() request: AuthRequest) {
    return this.service.createRole(dto, request.user);
  }

  @Put('roles/:id')
  @RequirePermissions('auth.role.manage')
  updateRole(@Param('id') id: string, @Body() dto: Record<string, unknown>, @Req() request: AuthRequest) {
    return this.service.updateRole(id, dto, request.user);
  }

  private setSessionCookie(response: AuthCookieResponse, result: SessionPayload | undefined) {
    if (result?.token && result.expiresAt) setAuthCookie(response, result.token, result.expiresAt);
  }
}

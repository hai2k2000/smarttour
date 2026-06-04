import { Body, Controller, Get, Headers, Ip, Param, Post, Put, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
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

@ApiTags('auth')
@ApiBearerAuth()
@Controller('auth')
export class AuthController {
  constructor(private readonly service: AuthService) {}

  @Post('bootstrap')
  @Public()
  bootstrap(@Body() dto: Record<string, unknown>, @Headers() headers: Record<string, string | string[] | undefined>, @Ip() ip: string) {
    return this.service.bootstrap(dto, { headers, ip });
  }

  @Post('login')
  @Public()
  login(@Body() dto: Record<string, unknown>, @Headers() headers: Record<string, string | string[] | undefined>, @Ip() ip: string) {
    return this.service.login(dto, { headers, ip });
  }

  @Post('logout')
  logout(@Req() request: AuthRequest) {
    return this.service.logout(tokenFromHeaders(request.headers), request.user?.id);
  }

  @Get('me')
  me(@Req() request: AuthRequest) {
    return this.service.me(tokenFromHeaders(request.headers));
  }

  @Post('change-password')
  changePassword(@Req() request: AuthRequest, @Body() dto: Record<string, unknown>, @Ip() ip: string) {
    return this.service.changePassword(request.user?.id, dto, tokenFromHeaders(request.headers), { headers: request.headers, ip });
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
}

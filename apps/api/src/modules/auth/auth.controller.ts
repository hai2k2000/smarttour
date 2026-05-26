import { Body, Controller, Get, Headers, Ip, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { Public, RequirePermissions } from './permissions.decorator';

@ApiTags('auth')
@ApiBearerAuth()
@Controller('auth')
@UseGuards(AuthGuard)
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
  logout(@Req() request: { headers: { authorization?: string }; user?: { id: string } }) {
    return this.service.logout(this.bearer(request.headers.authorization), request.user?.id);
  }

  @Get('me')
  me(@Req() request: { headers: { authorization?: string } }) {
    return this.service.me(this.bearer(request.headers.authorization));
  }

  @Post('change-password')
  changePassword(@Req() request: { headers: { authorization?: string }; user?: { id: string } }, @Body() dto: Record<string, unknown>) {
    return this.service.changePassword(request.user?.id, dto, this.bearer(request.headers.authorization));
  }

  @Get('users')
  @RequirePermissions('auth.user.manage')
  users() {
    return this.service.listUsers();
  }

  @Post('users')
  @RequirePermissions('auth.user.manage')
  createUser(@Body() dto: Record<string, unknown>) {
    return this.service.createUser(dto);
  }

  @Put('users/:id')
  @RequirePermissions('auth.user.manage')
  updateUser(@Param('id') id: string, @Body() dto: Record<string, unknown>) {
    return this.service.updateUser(id, dto);
  }

  @Get('roles')
  @RequirePermissions('auth.role.manage')
  roles() {
    return this.service.listRoles();
  }

  @Post('roles')
  @RequirePermissions('auth.role.manage')
  createRole(@Body() dto: Record<string, unknown>) {
    return this.service.createRole(dto);
  }

  @Put('roles/:id')
  @RequirePermissions('auth.role.manage')
  updateRole(@Param('id') id: string, @Body() dto: Record<string, unknown>) {
    return this.service.updateRole(id, dto);
  }

  private bearer(value?: string) {
    if (!value) return undefined;
    const [type, token] = value.split(' ');
    return type?.toLowerCase() === 'bearer' && token ? token : undefined;
  }
}

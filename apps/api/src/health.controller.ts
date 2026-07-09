import { Controller, Get, Header } from '@nestjs/common';
import { Public } from './modules/auth/permissions.decorator';

@Controller('health')
export class HealthController {
  @Public()
  @Header('Cache-Control', 'no-store')
  @Get()
  health() {
    return { ok: true, service: 'smarttour-api' };
  }
}

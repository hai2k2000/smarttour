import { Controller, Get } from '@nestjs/common';
import { Public } from './modules/auth/permissions.decorator';

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  health() {
    return { ok: true, service: 'smarttour-api' };
  }
}

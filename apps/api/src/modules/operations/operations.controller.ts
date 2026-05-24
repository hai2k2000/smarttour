import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { OperationsService } from './operations.service';

@ApiTags('operations')
@Controller('operations')
export class OperationsController {
  constructor(private readonly operationsService: OperationsService) {}

  @Get('dashboard')
  dashboard() {
    return this.operationsService.getDashboard();
  }

  @Get('modules')
  modules() {
    return this.operationsService.getModules();
  }
}

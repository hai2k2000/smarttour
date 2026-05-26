import { Controller, Get, Header, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequestUser } from '../auth/data-scope';
import { RequirePermissions } from '../auth/permissions.decorator';
import { OrderCenterService } from './order-center.service';

@ApiTags('order-center')
@RequirePermissions('order.view')
@Controller('order-center')
export class OrderCenterController {
  constructor(private readonly service: OrderCenterService) {}

  @Get('dashboard')
  dashboard(@Query() query: Record<string, string>, @Req() request?: { user?: RequestUser }) {
    return this.service.dashboard(query as any, request?.user);
  }

  @Get()
  list(@Query() query: Record<string, string>, @Req() request?: { user?: RequestUser }) {
    return this.service.list(query as any, request?.user);
  }

  @Get('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="smarttour-order-center.csv"')
  export(@Query() query: Record<string, string>, @Req() request?: { user?: RequestUser }) {
    return this.service.exportCsv(query as any, request?.user);
  }
}

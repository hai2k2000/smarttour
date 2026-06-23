import { Controller, Get, Header, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequestUser } from '../auth/data-scope';
import { RequirePermissions } from '../auth/permissions.decorator';
import { OrderCenterQueryDto } from './dto/order-center-query.dto';
import { OrderCenterService } from './order-center.service';

@ApiTags('order-center')
@RequirePermissions('order.view')
@Controller('order-center')
export class OrderCenterController {
  constructor(private readonly service: OrderCenterService) {}

  @Get('dashboard')
  dashboard(@Query() query: OrderCenterQueryDto, @Req() request?: { user?: RequestUser }) {
    return this.service.dashboard(query, request?.user);
  }

  @Get()
  list(@Query() query: OrderCenterQueryDto, @Req() request?: { user?: RequestUser }) {
    return this.service.list(query, request?.user);
  }

  @Get('export')
  @RequirePermissions('order.view', 'order.export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="smarttour-order-center.csv"')
  export(@Query() query: OrderCenterQueryDto, @Req() request?: { user?: RequestUser }) {
    return this.service.exportCsv(query, request?.user);
  }
}

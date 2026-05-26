import { Body, Controller, Get, Header, Param, Post, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequestUser } from '../auth/data-scope';
import { RequirePermissions } from '../auth/permissions.decorator';
import { CommissionReportsService } from './commission-reports.service';

@ApiTags('commission-reports')
@RequirePermissions('commission.view')
@Controller('commission-reports')
export class CommissionReportsController {
  constructor(private readonly service: CommissionReportsService) {}

  @Get()
  list(@Query() query: Record<string, string>, @Req() request?: { user?: RequestUser }) {
    return this.service.list(query, request?.user);
  }

  @Get('summary')
  summary(@Query() query: Record<string, string>, @Req() request?: { user?: RequestUser }) {
    return this.service.summary(query, request?.user);
  }

  @Get('grouping/:groupBy')
  grouping(@Param('groupBy') groupBy: string, @Query() query: Record<string, string>, @Req() request?: { user?: RequestUser }) {
    return this.service.grouping(groupBy, query, request?.user);
  }

  @Get('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="smarttour-commission-report.csv"')
  export(@Query() query: Record<string, string>, @Req() request?: { user?: RequestUser }) {
    return this.service.exportCsv(query, request?.user);
  }

  @Post('sync')
  @RequirePermissions('commission.manage')
  sync() {
    return this.service.syncFromOrders();
  }

  @Post('approve')
  @RequirePermissions('commission.manage')
  approve(@Body() dto: Record<string, unknown>) {
    return this.service.approve(dto);
  }

  @Post('reject')
  @RequirePermissions('commission.manage')
  reject(@Body() dto: Record<string, unknown>) {
    return this.service.reject(dto);
  }

  @Post('revoke')
  @RequirePermissions('commission.manage')
  revoke(@Body() dto: Record<string, unknown>) {
    return this.service.revoke(dto);
  }

  @Post('pay')
  @RequirePermissions('commission.manage')
  pay(@Body() dto: Record<string, unknown>) {
    return this.service.pay(dto);
  }

  @Get(':id')
  detail(@Param('id') id: string, @Req() request?: { user?: RequestUser }) {
    return this.service.detail(id, request?.user);
  }
}

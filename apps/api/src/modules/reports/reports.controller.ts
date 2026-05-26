import { Controller, Get, Header, Param, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequestUser } from '../auth/data-scope';
import { RequirePermissions } from '../auth/permissions.decorator';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@RequirePermissions('report.view')
@Controller('reports')
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  @Get('overview')
  overview(@Query() query: Record<string, string>, @Req() request?: { user?: RequestUser }) {
    return this.service.overview(query, request?.user);
  }

  @Get('business-summary')
  businessSummary(@Query() query: Record<string, string>, @Req() request?: { user?: RequestUser }) {
    return this.service.businessSummary(query, request?.user);
  }

  @Get('revenue/:groupBy')
  revenue(@Param('groupBy') groupBy: string, @Query() query: Record<string, string>, @Req() request?: { user?: RequestUser }) {
    return this.service.revenue(groupBy, query, request?.user);
  }

  @Get('profit')
  profit(@Query() query: Record<string, string>, @Req() request?: { user?: RequestUser }) {
    return this.service.profit(query, request?.user);
  }

  @Get('finance')
  finance(@Query() query: Record<string, string>, @Req() request?: { user?: RequestUser }) {
    return this.service.finance(query, request?.user);
  }

  @Get('finance/order-history/:orderId')
  orderHistory(@Param('orderId') orderId: string, @Req() request?: { user?: RequestUser }) {
    return this.service.orderHistory(orderId, request?.user);
  }

  @Get('debt/customers')
  customerDebt(@Query() query: Record<string, string>, @Req() request?: { user?: RequestUser }) {
    return this.service.customerDebt(query, request?.user);
  }

  @Get('debt/suppliers')
  supplierDebt(@Query() query: Record<string, string>, @Req() request?: { user?: RequestUser }) {
    return this.service.supplierDebt(query, request?.user);
  }

  @Get('debt/suppliers/:supplierId/history')
  supplierHistory(@Param('supplierId') supplierId: string, @Query() query: Record<string, string>, @Req() request?: { user?: RequestUser }) {
    return this.service.supplierHistory(supplierId, query, request?.user);
  }

  @Get('employees')
  employees(@Query() query: Record<string, string>, @Req() request?: { user?: RequestUser }) {
    return this.service.employees(query, request?.user);
  }

  @Get('employees/performance')
  employeePerformance(@Query() query: Record<string, string>, @Req() request?: { user?: RequestUser }) {
    return this.service.employeePerformance(query, request?.user);
  }

  @Get('export/:report')
  @RequirePermissions('report.export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="smarttour-report.csv"')
  export(@Param('report') report: string, @Query() query: Record<string, string>, @Req() request?: { user?: RequestUser }) {
    return this.service.exportCsv(report, query, request?.user);
  }
}

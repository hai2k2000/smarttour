import { Controller, ForbiddenException, Get, Header, Param, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequestUser, userPermissions } from '../auth/data-scope';
import { RequirePermissions } from '../auth/permissions.decorator';
import { ReportQueryDto } from './dto/report-query.dto';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@RequirePermissions('report.view')
@Controller('reports')
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  @Get('overview')
  overview(@Query() query: ReportQueryDto, @Req() request?: { user?: RequestUser }) {
    return this.service.overview(query, request?.user);
  }

  @Get('business-summary')
  businessSummary(@Query() query: ReportQueryDto, @Req() request?: { user?: RequestUser }) {
    return this.service.businessSummary(query, request?.user);
  }

  @Get('revenue/:groupBy')
  revenue(@Param('groupBy') groupBy: string, @Query() query: ReportQueryDto, @Req() request?: { user?: RequestUser }) {
    return this.service.revenue(groupBy, query, request?.user);
  }

  @Get('profit')
  profit(@Query() query: ReportQueryDto, @Req() request?: { user?: RequestUser }) {
    return this.service.profit(query, request?.user);
  }

  @Get('finance')
  @RequirePermissions('report.view', 'finance.cashflow.view')
  finance(@Query() query: ReportQueryDto, @Req() request?: { user?: RequestUser }) {
    return this.service.finance(query, request?.user);
  }

  @Get('finance/order-history/:orderId')
  @RequirePermissions('report.view', 'finance.cashflow.view')
  orderHistory(@Param('orderId') orderId: string, @Req() request?: { user?: RequestUser }) {
    return this.service.orderHistory(orderId, request?.user);
  }

  @Get('debt/customers')
  @RequirePermissions('report.view', 'finance.debt.view')
  customerDebt(@Query() query: ReportQueryDto, @Req() request?: { user?: RequestUser }) {
    return this.service.customerDebt(query, request?.user);
  }

  @Get('debt/suppliers')
  @RequirePermissions('report.view', 'finance.debt.view')
  supplierDebt(@Query() query: ReportQueryDto, @Req() request?: { user?: RequestUser }) {
    return this.service.supplierDebt(query, request?.user);
  }

  @Get('debt/suppliers/:supplierId/history')
  @RequirePermissions('report.view', 'finance.debt.view')
  supplierHistory(@Param('supplierId') supplierId: string, @Query() query: ReportQueryDto, @Req() request?: { user?: RequestUser }) {
    return this.service.supplierHistory(supplierId, query, request?.user);
  }

  @Get('employees')
  employees(@Query() query: ReportQueryDto, @Req() request?: { user?: RequestUser }) {
    return this.service.employees(query, request?.user);
  }

  @Get('employees/performance')
  employeePerformance(@Query() query: ReportQueryDto, @Req() request?: { user?: RequestUser }) {
    return this.service.employeePerformance(query, request?.user);
  }

  @Get('export/:report')
  @RequirePermissions('report.view', 'report.export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="smarttour-report.csv"')
  export(@Param('report') report: string, @Query() query: ReportQueryDto, @Req() request?: { user?: RequestUser }) {
    this.assertSensitiveExportPermission(report, request?.user);
    return this.service.exportCsv(report, query, request?.user);
  }

  private assertSensitiveExportPermission(report: string, user?: RequestUser) {
    const required = report === 'finance'
      ? 'finance.cashflow.view'
      : report === 'customer-debt' || report === 'supplier-debt'
        ? 'finance.debt.view'
        : undefined;
    if (!required) return;
    const permissions = userPermissions(user);
    if (!permissions.has('*') && !permissions.has(required)) throw new ForbiddenException('Thiếu quyền xem báo cáo tài chính');
  }
}

import { Controller, ForbiddenException, Get, Param, Query, Req, Res, StreamableFile } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ServerResponse } from 'node:http';
import { csvToXlsxWorkbook, XLSX_MIME } from '../../common/xlsx-workbook';
import { RequestUser, userPermissions } from '../auth/data-scope';
import { RequirePermissions } from '../auth/permissions.decorator';
import { DebtReportQueryDto, FinanceReportQueryDto, OrderReportQueryDto, ReportQueryDto } from './dto/report-query.dto';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@RequirePermissions('report.view')
@Controller('reports')
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  @Get('overview')
  overview(@Query() query: OrderReportQueryDto, @Req() request?: { user?: RequestUser }) {
    return this.service.overview(query, request?.user);
  }

  @Get('business-summary')
  businessSummary(@Query() query: OrderReportQueryDto, @Req() request?: { user?: RequestUser }) {
    return this.service.businessSummary(query, request?.user);
  }

  @Get('revenue/:groupBy')
  revenue(@Param('groupBy') groupBy: string, @Query() query: OrderReportQueryDto, @Req() request?: { user?: RequestUser }) {
    return this.service.revenue(groupBy, query, request?.user);
  }

  @Get('profit')
  profit(@Query() query: OrderReportQueryDto, @Req() request?: { user?: RequestUser }) {
    return this.service.profit(query, request?.user);
  }

  @Get('finance')
  @RequirePermissions('report.view', 'finance.cashflow.view')
  finance(@Query() query: FinanceReportQueryDto, @Req() request?: { user?: RequestUser }) {
    return this.service.finance(query, request?.user);
  }

  @Get('finance/order-history/:orderId')
  @RequirePermissions('report.view', 'finance.cashflow.view')
  orderHistory(@Param('orderId') orderId: string, @Req() request?: { user?: RequestUser }) {
    return this.service.orderHistory(orderId, request?.user);
  }

  @Get('debt/customers')
  @RequirePermissions('report.view', 'finance.debt.view')
  customerDebt(@Query() query: DebtReportQueryDto, @Req() request?: { user?: RequestUser }) {
    return this.service.customerDebt(query, request?.user);
  }

  @Get('debt/suppliers')
  @RequirePermissions('report.view', 'finance.debt.view')
  supplierDebt(@Query() query: DebtReportQueryDto, @Req() request?: { user?: RequestUser }) {
    return this.service.supplierDebt(query, request?.user);
  }

  @Get('debt/suppliers/:supplierId/history')
  @RequirePermissions('report.view', 'finance.debt.view')
  supplierHistory(@Param('supplierId') supplierId: string, @Query() query: ReportQueryDto, @Req() request?: { user?: RequestUser }) {
    return this.service.supplierHistory(supplierId, query, request?.user);
  }

  @Get('employees')
  employees(@Query() query: OrderReportQueryDto, @Req() request?: { user?: RequestUser }) {
    return this.service.employees(query, request?.user);
  }

  @Get('employees/performance')
  employeePerformance(@Query() query: OrderReportQueryDto, @Req() request?: { user?: RequestUser }) {
    return this.service.employeePerformance(query, request?.user);
  }

  @Get('export/:report')
  @RequirePermissions('report.view', 'report.export')
  async export(@Param('report') report: string, @Query() query: ReportQueryDto, @Req() request: { user?: RequestUser } | undefined, @Res({ passthrough: true }) response: ServerResponse) {
    this.assertSensitiveExportPermission(report, request?.user);
    const csv = await this.service.exportCsv(report, query, request?.user);
    if (query.format === 'xlsx') {
      this.setExportHeaders(response, XLSX_MIME, `smarttour-report-${report}.xlsx`);
      return new StreamableFile(csvToXlsxWorkbook(`report-${report}`, csv));
    }
    this.setExportHeaders(response, 'text/csv; charset=utf-8', 'smarttour-report.csv');
    return csv;
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


  private setExportHeaders(response: ServerResponse, contentType: string, filename: string) {
    response.setHeader('Content-Type', contentType);
    response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  }
}

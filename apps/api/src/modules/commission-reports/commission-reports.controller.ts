import { Body, Controller, Get, HttpCode, Param, ParseEnumPipe, Post, Query, Req, Res, StreamableFile } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ServerResponse } from 'node:http';
import { csvToXlsxWorkbook, XLSX_MIME } from '../../common/xlsx-workbook';
import { RequestUser } from '../auth/data-scope';
import { RequirePermissions } from '../auth/permissions.decorator';
import { CommissionReportActionDto, CommissionReportGroupBy, CommissionReportsQueryDto, PayCommissionReportDto } from './dto/commission-report.dto';
import { CommissionReportsService } from './commission-reports.service';

@ApiTags('commission-reports')
@RequirePermissions('commission.view')
@Controller('commission-reports')
export class CommissionReportsController {
  constructor(private readonly service: CommissionReportsService) {}

  @Get()
  list(@Query() query: CommissionReportsQueryDto, @Req() request?: { user?: RequestUser }) {
    return this.service.list(query, request?.user);
  }

  @Get('summary')
  summary(@Query() query: CommissionReportsQueryDto, @Req() request?: { user?: RequestUser }) {
    return this.service.summary(query, request?.user);
  }

  @Get('grouping/:groupBy')
  grouping(
    @Param('groupBy', new ParseEnumPipe(CommissionReportGroupBy)) groupBy: CommissionReportGroupBy,
    @Query() query: CommissionReportsQueryDto,
    @Req() request?: { user?: RequestUser },
  ) {
    return this.service.grouping(groupBy, query, request?.user);
  }

  @Get('export')
  @RequirePermissions('commission.view', 'commission.export')
  async export(@Query() query: CommissionReportsQueryDto, @Req() request: { user?: RequestUser } | undefined, @Res({ passthrough: true }) response: ServerResponse) {
    const csv = await this.service.exportCsv(query, request?.user);
    if (query.format === 'xlsx') {
      this.setExportHeaders(response, XLSX_MIME, 'smarttour-commission-report.xlsx');
      return new StreamableFile(csvToXlsxWorkbook('commission-report', csv));
    }
    this.setExportHeaders(response, 'text/csv; charset=utf-8', 'smarttour-commission-report.csv');
    return csv;
  }

  @Post('sync')
  @HttpCode(200)
  @RequirePermissions('commission.manage')
  sync(@Req() request?: { user?: RequestUser }) {
    return this.service.syncFromOrders(request?.user);
  }

  @Post('approve')
  @HttpCode(200)
  @RequirePermissions('commission.approve')
  approve(@Body() dto: CommissionReportActionDto, @Req() request?: { user?: RequestUser }) {
    return this.service.approve(dto, request?.user);
  }

  @Post('reject')
  @HttpCode(200)
  @RequirePermissions('commission.manage')
  reject(@Body() dto: CommissionReportActionDto, @Req() request?: { user?: RequestUser }) {
    return this.service.reject(dto, request?.user);
  }

  @Post('revoke')
  @HttpCode(200)
  @RequirePermissions('commission.manage')
  revoke(@Body() dto: CommissionReportActionDto, @Req() request?: { user?: RequestUser }) {
    return this.service.revoke(dto, request?.user);
  }

  @Post('pay')
  @HttpCode(200)
  @RequirePermissions('commission.manage')
  pay(@Body() dto: PayCommissionReportDto, @Req() request?: { user?: RequestUser }) {
    return this.service.pay(dto, request?.user);
  }

  @Get(':id')
  detail(@Param('id') id: string, @Req() request?: { user?: RequestUser }) {
    return this.service.detail(id, request?.user);
  }


  private setExportHeaders(response: ServerResponse, contentType: string, filename: string) {
    response.setHeader('Content-Type', contentType);
    response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  }
}

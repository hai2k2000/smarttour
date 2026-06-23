import { Controller, Get, Query, Req, Res, StreamableFile } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ServerResponse } from 'node:http';
import { csvToXlsxWorkbook, XLSX_MIME } from '../../common/xlsx-workbook';
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
  async export(@Query() query: OrderCenterQueryDto, @Req() request: { user?: RequestUser } | undefined, @Res({ passthrough: true }) response: ServerResponse) {
    const csv = await this.service.exportCsv(query, request?.user);
    if (query.format === 'xlsx') {
      this.setExportHeaders(response, XLSX_MIME, 'smarttour-order-center.xlsx');
      return new StreamableFile(csvToXlsxWorkbook('order-center', csv));
    }
    this.setExportHeaders(response, 'text/csv; charset=utf-8', 'smarttour-order-center.csv');
    return csv;
  }


  private setExportHeaders(response: ServerResponse, contentType: string, filename: string) {
    response.setHeader('Content-Type', contentType);
    response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  }
}

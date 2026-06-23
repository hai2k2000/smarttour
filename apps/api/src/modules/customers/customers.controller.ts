import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req, Res, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { ServerResponse } from 'node:http';
import { csvToXlsxWorkbook, XLSX_MIME } from '../../common/xlsx-workbook';
import { RequestUser } from '../auth/data-scope';
import { RequirePermissions } from '../auth/permissions.decorator';
import { fileUploadInterceptorOptions } from '../files/files.service';
import {
  CustomerBodyDto,
  CustomerBulkTagDto,
  CustomerBulkUpdateDto,
  CustomerCallLogDto,
  CustomerCampaignBodyDto,
  CustomerCareTaskDto,
  CustomerCareTaskUpdateDto,
  CustomerCommentDto,
  CustomerImportRowsDto,
  CustomerMergeDto,
  CustomerOpportunityDto,
  CustomerTagBodyDto,
  CustomerTransferOwnerDto,
  CustomerTypeBodyDto,
} from './dto/customer-body.dto';
import { CustomerActivityQueryDto, CustomerListQueryDto } from './dto/customer-query.dto';
import { CustomersService } from './customers.service';

@ApiTags('customers')
@Controller('customers')
export class CustomersController {
  constructor(private readonly service: CustomersService) {}

  @Get()
  @RequirePermissions('customer.view')
  list(@Query() query: CustomerListQueryDto, @Req() request: { user?: RequestUser }) {
    return this.service.list(query as Record<string, string>, request.user);
  }

  @Get('dashboard')
  @RequirePermissions('customer.view')
  dashboard(@Query() query: CustomerListQueryDto, @Req() request: { user?: RequestUser }) {
    return this.service.dashboard(query as Record<string, string>, request.user);
  }

  @Get('types')
  @RequirePermissions('customer.view')
  types() {
    return this.service.types();
  }

  @Post('types')
  @RequirePermissions('customer.manage')
  createType(@Body() dto: CustomerTypeBodyDto) {
    return this.service.createType(dto);
  }

  @Patch('types/:id')
  @RequirePermissions('customer.manage')
  updateType(@Param('id') id: string, @Body() dto: CustomerTypeBodyDto) {
    return this.service.updateType(id, dto);
  }

  @Get('tags')
  @RequirePermissions('customer.view')
  tags() {
    return this.service.tags();
  }

  @Post('tags')
  @RequirePermissions('customer.manage')
  createTag(@Body() dto: CustomerTagBodyDto) {
    return this.service.createTag(dto);
  }

  @Post('bulk-tag')
  @RequirePermissions('customer.manage')
  bulkTag(@Body() dto: CustomerBulkTagDto, @Req() request: { user?: RequestUser }) {
    return this.service.bulkTag(dto, request.user);
  }

  @Post('bulk-update')
  @RequirePermissions('customer.manage')
  bulkUpdate(@Body() dto: CustomerBulkUpdateDto, @Req() request: { user?: RequestUser }) {
    return this.service.bulkUpdate(dto, request.user);
  }

  @Get('campaigns')
  @RequirePermissions('customer.view')
  campaigns() {
    return this.service.campaigns();
  }

  @Post('campaigns')
  @RequirePermissions('customer.manage')
  createCampaign(@Body() dto: CustomerCampaignBodyDto) {
    return this.service.createCampaign(dto);
  }

  @Post('import')
  @RequirePermissions('customer.manage')
  importRows(@Body() dto: CustomerImportRowsDto, @Req() request: { user?: RequestUser }) {
    return this.service.importRows(dto, request.user);
  }

  @Get('export')
  @RequirePermissions('customer.view')
  async export(@Query() query: CustomerListQueryDto, @Req() request: { user?: RequestUser }, @Res({ passthrough: true }) response: ServerResponse) {
    const csv = await this.service.exportCsv(query as Record<string, string>, request.user);
    if (query.format === 'xlsx') {
      this.setExportHeaders(response, XLSX_MIME, 'smarttour-customers.xlsx');
      return new StreamableFile(csvToXlsxWorkbook('customers', csv));
    }
    this.setExportHeaders(response, 'text/csv; charset=utf-8', 'smarttour-customers.csv');
    return csv;
  }

  @Post(':id/files')
  @RequirePermissions('customer.manage')
  @UseInterceptors(FileInterceptor('file', fileUploadInterceptorOptions()))
  addFile(
    @Param('id') id: string,
    @UploadedFile() file: { originalname: string; mimetype: string; size: number; buffer: Buffer } | undefined,
    @Req() request: { user?: RequestUser },
  ) {
    return this.service.addFile(id, file, request.user?.id, request.user);
  }

  @Delete(':id/files/:fileId')
  @RequirePermissions('customer.manage')
  removeFile(@Param('id') id: string, @Param('fileId') fileId: string, @Req() request: { user?: RequestUser }) {
    return this.service.deleteFile(id, fileId, request.user);
  }

  @Get(':id')
  @RequirePermissions('customer.view')
  detail(@Param('id') id: string, @Req() request: { user?: RequestUser }) {
    return this.service.detail(id, request.user);
  }

  @Post()
  @RequirePermissions('customer.manage')
  create(@Body() dto: CustomerBodyDto, @Req() request: { user?: RequestUser }) {
    return this.service.create(dto, request.user);
  }

  @Put(':id')
  @RequirePermissions('customer.manage')
  update(@Param('id') id: string, @Body() dto: CustomerBodyDto, @Req() request: { user?: RequestUser }) {
    return this.service.update(id, dto, request.user);
  }

  @Delete(':id')
  @RequirePermissions('customer.manage')
  remove(@Param('id') id: string, @Req() request: { user?: RequestUser }) {
    return this.service.remove(id, request.user);
  }

  @Post(':id/merge')
  @RequirePermissions('customer.manage')
  merge(@Param('id') targetId: string, @Body() dto: CustomerMergeDto, @Req() request: { user?: RequestUser }) {
    return this.service.merge(targetId, dto, request.user);
  }

  @Post(':id/transfer-owner')
  @RequirePermissions('customer.manage')
  transferOwner(@Param('id') id: string, @Body() dto: CustomerTransferOwnerDto, @Req() request: { user?: RequestUser }) {
    return this.service.transferOwner(id, dto, request.user);
  }

  @Post(':id/comments')
  @RequirePermissions('customer.manage')
  addComment(@Param('id') id: string, @Body() dto: CustomerCommentDto, @Req() request: { user?: RequestUser }) {
    return this.service.addComment(id, dto, request.user);
  }

  @Post(':id/care-tasks')
  @RequirePermissions('customer.manage')
  addCareTask(@Param('id') id: string, @Body() dto: CustomerCareTaskDto, @Req() request: { user?: RequestUser }) {
    return this.service.addCareTask(id, dto, request.user);
  }

  @Post(':id/call-logs')
  @RequirePermissions('customer.manage')
  addCallLog(@Param('id') id: string, @Body() dto: CustomerCallLogDto, @Req() request: { user?: RequestUser }) {
    return this.service.addCallLog(id, dto, request.user);
  }

  @Post(':id/opportunities')
  @RequirePermissions('customer.manage')
  addOpportunity(@Param('id') id: string, @Body() dto: CustomerOpportunityDto, @Req() request: { user?: RequestUser }) {
    return this.service.addOpportunity(id, dto, request.user);
  }

  @Patch(':id/care-tasks/:taskId')
  @RequirePermissions('customer.manage')
  updateCareTask(@Param('id') id: string, @Param('taskId') taskId: string, @Body() dto: CustomerCareTaskUpdateDto, @Req() request: { user?: RequestUser }) {
    return this.service.updateCareTask(id, taskId, dto, request.user);
  }

  @Get(':id/orders')
  @RequirePermissions('customer.view')
  orders(@Param('id') id: string, @Req() request: { user?: RequestUser }) {
    return this.service.orders(id, request.user);
  }

  @Get(':id/quotes')
  @RequirePermissions('customer.view')
  quotes(@Param('id') id: string, @Req() request: { user?: RequestUser }) {
    return this.service.quotes(id, request.user);
  }

  @Get(':id/debts')
  @RequirePermissions('customer.view')
  debts(@Param('id') id: string, @Req() request: { user?: RequestUser }) {
    return this.service.debts(id, request.user);
  }

  @Get(':id/timeline')
  @RequirePermissions('customer.view')
  timeline(@Param('id') id: string, @Query() query: CustomerActivityQueryDto, @Req() request: { user?: RequestUser }) {
    return this.service.timeline(id, request.user, query as Record<string, string>);
  }

  @Get(':id/care-history')
  @RequirePermissions('customer.view')
  careHistory(@Param('id') id: string, @Query() query: CustomerActivityQueryDto, @Req() request: { user?: RequestUser }) {
    return this.service.careHistory(id, request.user, query as Record<string, string>);
  }

  @Get(':id/opportunities')
  @RequirePermissions('customer.view')
  opportunities(@Param('id') id: string, @Query() query: CustomerActivityQueryDto, @Req() request: { user?: RequestUser }) {
    return this.service.opportunities(id, request.user, query as Record<string, string>);
  }


  private setExportHeaders(response: ServerResponse, contentType: string, filename: string) {
    response.setHeader('Content-Type', contentType);
    response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  }
}

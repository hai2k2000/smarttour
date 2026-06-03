import { Body, Controller, Delete, Get, Header, Param, Patch, Post, Put, Query, Req, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { RequestUser } from '../auth/data-scope';
import { RequirePermissions } from '../auth/permissions.decorator';
import { CustomersService } from './customers.service';

@ApiTags('customers')
@Controller('customers')
export class CustomersController {
  constructor(private readonly service: CustomersService) {}

  @Get()
  @RequirePermissions('customer.view')
  list(@Query() query: Record<string, string>, @Req() request: { user?: RequestUser }) {
    return this.service.list(query, request.user);
  }

  @Get('dashboard')
  @RequirePermissions('customer.view')
  dashboard(@Query() query: Record<string, string>, @Req() request: { user?: RequestUser }) {
    return this.service.dashboard(query, request.user);
  }

  @Get('types')
  @RequirePermissions('customer.view')
  types() {
    return this.service.types();
  }

  @Post('types')
  @RequirePermissions('customer.manage')
  createType(@Body() dto: Record<string, unknown>) {
    return this.service.createType(dto);
  }

  @Patch('types/:id')
  @RequirePermissions('customer.manage')
  updateType(@Param('id') id: string, @Body() dto: Record<string, unknown>) {
    return this.service.updateType(id, dto);
  }

  @Get('tags')
  @RequirePermissions('customer.view')
  tags() {
    return this.service.tags();
  }

  @Post('tags')
  @RequirePermissions('customer.manage')
  createTag(@Body() dto: Record<string, unknown>) {
    return this.service.createTag(dto);
  }

  @Post('bulk-tag')
  @RequirePermissions('customer.manage')
  bulkTag(@Body() dto: Record<string, unknown>) {
    return this.service.bulkTag(dto);
  }

  @Post('bulk-update')
  @RequirePermissions('customer.manage')
  bulkUpdate(@Body() dto: Record<string, unknown>, @Req() request: { user?: RequestUser }) {
    return this.service.bulkUpdate(dto, request.user);
  }

  @Get('campaigns')
  @RequirePermissions('customer.view')
  campaigns() {
    return this.service.campaigns();
  }

  @Post('campaigns')
  @RequirePermissions('customer.manage')
  createCampaign(@Body() dto: Record<string, unknown>) {
    return this.service.createCampaign(dto);
  }

  @Post('import')
  @RequirePermissions('customer.manage')
  importRows(@Body() dto: Record<string, unknown>) {
    return this.service.importRows(dto);
  }

  @Get('export')
  @RequirePermissions('customer.view')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="smarttour-customers.csv"')
  export(@Query() query: Record<string, string>, @Req() request: { user?: RequestUser }) {
    return this.service.exportCsv(query, request.user);
  }

  @Post(':id/files')
  @RequirePermissions('customer.manage')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
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
  create(@Body() dto: Record<string, unknown>, @Req() request: { user?: RequestUser }) {
    return this.service.create(dto, request.user);
  }

  @Put(':id')
  @RequirePermissions('customer.manage')
  update(@Param('id') id: string, @Body() dto: Record<string, unknown>, @Req() request: { user?: RequestUser }) {
    return this.service.update(id, dto, request.user);
  }

  @Delete(':id')
  @RequirePermissions('customer.manage')
  remove(@Param('id') id: string, @Req() request: { user?: RequestUser }) {
    return this.service.remove(id, request.user);
  }

  @Post(':id/merge')
  @RequirePermissions('customer.manage')
  merge(@Param('id') targetId: string, @Body() dto: Record<string, unknown>) {
    return this.service.merge(targetId, dto);
  }

  @Post(':id/transfer-owner')
  @RequirePermissions('customer.manage')
  transferOwner(@Param('id') id: string, @Body() dto: Record<string, unknown>) {
    return this.service.transferOwner(id, dto);
  }

  @Post(':id/comments')
  @RequirePermissions('customer.manage')
  addComment(@Param('id') id: string, @Body() dto: Record<string, unknown>, @Req() request: { user?: RequestUser }) {
    return this.service.addComment(id, dto, request.user);
  }

  @Post(':id/care-tasks')
  @RequirePermissions('customer.manage')
  addCareTask(@Param('id') id: string, @Body() dto: Record<string, unknown>, @Req() request: { user?: RequestUser }) {
    return this.service.addCareTask(id, dto, request.user);
  }

  @Post(':id/call-logs')
  @RequirePermissions('customer.manage')
  addCallLog(@Param('id') id: string, @Body() dto: Record<string, unknown>, @Req() request: { user?: RequestUser }) {
    return this.service.addCallLog(id, dto, request.user);
  }

  @Post(':id/opportunities')
  @RequirePermissions('customer.manage')
  addOpportunity(@Param('id') id: string, @Body() dto: Record<string, unknown>, @Req() request: { user?: RequestUser }) {
    return this.service.addOpportunity(id, dto, request.user);
  }

  @Patch(':id/care-tasks/:taskId')
  @RequirePermissions('customer.manage')
  updateCareTask(@Param('id') id: string, @Param('taskId') taskId: string, @Body() dto: Record<string, unknown>, @Req() request: { user?: RequestUser }) {
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

  @Get(':id/contracts')
  @RequirePermissions('customer.view')
  contracts() {
    return { rows: [] };
  }

  @Get(':id/debts')
  @RequirePermissions('customer.view')
  debts(@Param('id') id: string, @Req() request: { user?: RequestUser }) {
    return this.service.debts(id, request.user);
  }

  @Get(':id/timeline')
  @RequirePermissions('customer.view')
  timeline(@Param('id') id: string) {
    return this.service.timeline(id);
  }

  @Get(':id/care-history')
  @RequirePermissions('customer.view')
  careHistory(@Param('id') id: string) {
    return this.service.careHistory(id);
  }

  @Get(':id/opportunities')
  @RequirePermissions('customer.view')
  opportunities(@Param('id') id: string) {
    return this.service.opportunities(id);
  }
}

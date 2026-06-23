import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequestUser } from '../auth/data-scope';
import { Public, RequirePermissions } from '../auth/permissions.decorator';
import { CreateQuotationDto, ListQuotationsQueryDto, QuotationActionDto, UpdateQuotationDto } from './dto/quotation.dto';
import { QuotationsService } from './quotations.service';

@ApiTags('quotations')
@Controller('quotations')
export class QuotationsController {
  constructor(private readonly service: QuotationsService) {}

  @Get('dashboard')
  @RequirePermissions('quotation.view')
  dashboard(@Req() request?: { user?: RequestUser }) {
    return this.service.dashboard(request?.user);
  }

  @Get('public/:token')
  @Public()
  publicDetail(@Param('token') token: string) {
    return this.service.publicDetail(token);
  }

  @Get()
  @RequirePermissions('quotation.view')
  list(@Query() query: ListQuotationsQueryDto, @Req() request?: { user?: RequestUser }) {
    return this.service.list(query, request?.user);
  }

  @Get(':id')
  @RequirePermissions('quotation.view')
  detail(@Param('id') id: string, @Req() request?: { user?: RequestUser }) {
    return this.service.detail(id, request?.user);
  }

  @Post()
  @RequirePermissions('quotation.manage')
  create(@Body() dto: CreateQuotationDto, @Req() request?: { user?: RequestUser }) {
    return this.service.create(dto, request?.user);
  }

  @Put(':id')
  @RequirePermissions('quotation.manage')
  update(@Param('id') id: string, @Body() dto: UpdateQuotationDto, @Req() request?: { user?: RequestUser }) {
    return this.service.update(id, dto, request?.user);
  }

  @Delete(':id')
  @RequirePermissions('quotation.manage')
  remove(@Param('id') id: string, @Req() request?: { user?: RequestUser }) {
    return this.service.remove(id, request?.user);
  }

  @Post(':id/submit')
  @HttpCode(200)
  @RequirePermissions('quotation.manage')
  submit(@Param('id') id: string, @Body() dto: QuotationActionDto, @Req() request?: { user?: RequestUser }) {
    return this.service.submit(id, dto, request?.user);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @RequirePermissions('quotation.approve')
  approve(@Param('id') id: string, @Body() dto: QuotationActionDto, @Req() request?: { user?: RequestUser }) {
    return this.service.approve(id, dto, request?.user);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @RequirePermissions('quotation.manage')
  reject(@Param('id') id: string, @Body() dto: QuotationActionDto, @Req() request?: { user?: RequestUser }) {
    return this.service.reject(id, dto, request?.user);
  }

  @Patch(':id/smartlink')
  @HttpCode(200)
  @RequirePermissions('quotation.manage')
  smartLink(@Param('id') id: string, @Body('enabled') enabled?: boolean, @Req() request?: { user?: RequestUser }) {
    return this.service.smartLink(id, enabled ?? true, request?.user);
  }

  @Post(':id/convert')
  @HttpCode(200)
  @RequirePermissions('quotation.manage')
  convert(@Param('id') id: string, @Body() dto: QuotationActionDto, @Req() request?: { user?: RequestUser }) {
    return this.service.convert(id, dto, request?.user);
  }
}

import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, Req, Res, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { ServerResponse } from 'node:http';
import { csvToXlsxWorkbook, XLSX_MIME } from '../../common/xlsx-workbook';
import { RequestUser } from '../auth/data-scope';
import { RequirePermissions } from '../auth/permissions.decorator';
import { fileUploadInterceptorOptions } from '../files/files.service';
import { CreateFitTourDto } from './dto/create-fit-tour.dto';
import { FitTourAttachmentUploadDto, FitTourCopyOperationDto, FitTourCopySourceDto, FitTourExportDto, FitTourExportQueryDto } from './dto/fit-tour-action.dto';
import { ListFitToursQueryDto } from './dto/list-fit-tours-query.dto';
import { UpdateFitTourDto } from './dto/update-fit-tour.dto';
import { FitToursService } from './fit-tours.service';

@ApiTags('fit-tours')
@RequirePermissions('tour.view')
@Controller('fit-tours')
export class FitToursController {
  constructor(private readonly fitToursService: FitToursService) {}

  @Get()
  list(@Query() query: ListFitToursQueryDto, @Req() request?: { user?: RequestUser }) {
    return this.fitToursService.list(query, request?.user);
  }

  @Post('import')
  @RequirePermissions('tour.manage')
  import(@Body() dto: CreateFitTourDto, @Req() request?: { user?: RequestUser }) {
    return this.fitToursService.importLegacy(dto, request?.user);
  }

  @Post('export')
  @HttpCode(200)
  @RequirePermissions('tour.export')
  async export(@Body() dto: FitTourExportDto, @Req() request: { user?: RequestUser } | undefined, @Res({ passthrough: true }) response: ServerResponse) {
    const csv = await this.fitToursService.exportCsv(dto.id, request?.user);
    if (dto.format === 'xlsx') {
      this.setExportHeaders(response, XLSX_MIME, 'smarttour-fit-tour.xlsx');
      return new StreamableFile(csvToXlsxWorkbook('fit-tour', csv));
    }
    this.setExportHeaders(response, 'text/csv; charset=utf-8', 'smarttour-fit-tour.csv');
    return csv;
  }

  @Get(':id/export')
  @RequirePermissions('tour.export')
  async exportById(@Param('id') id: string, @Query() query: FitTourExportQueryDto, @Req() request: { user?: RequestUser } | undefined, @Res({ passthrough: true }) response: ServerResponse) {
    const csv = await this.fitToursService.exportCsv(id, request?.user);
    if (query.format === 'xlsx') {
      this.setExportHeaders(response, XLSX_MIME, 'smarttour-fit-tour.xlsx');
      return new StreamableFile(csvToXlsxWorkbook('fit-tour', csv));
    }
    this.setExportHeaders(response, 'text/csv; charset=utf-8', 'smarttour-fit-tour.csv');
    return csv;
  }

  @Get(':id')
  detail(@Param('id') id: string, @Req() request?: { user?: RequestUser }) {
    return this.fitToursService.detail(id, request?.user);
  }

  @Post()
  @RequirePermissions('tour.manage')
  create(@Body() dto: CreateFitTourDto, @Req() request?: { user?: RequestUser }) {
    return this.fitToursService.create(dto, request?.user);
  }

  @Put(':id')
  @RequirePermissions('tour.manage')
  update(@Param('id') id: string, @Body() dto: UpdateFitTourDto, @Req() request?: { user?: RequestUser }) {
    return this.fitToursService.update(id, dto, request?.user);
  }

  @Post(':id/attachments')
  @RequirePermissions('tour.manage')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', fileUploadInterceptorOptions()))
  uploadAttachment(
    @Param('id') id: string,
    @Body() dto: FitTourAttachmentUploadDto = {},
    @UploadedFile() file: { originalname: string; mimetype: string; size: number; buffer: Buffer } | undefined,
    @Req() request?: { user?: RequestUser },
  ) {
    return this.fitToursService.uploadAttachment(id, dto.step, file, request?.user);
  }

  @Delete(':id/attachments/:attachmentId')
  @RequirePermissions('tour.manage')
  removeAttachment(@Param('id') id: string, @Param('attachmentId') attachmentId: string, @Req() request?: { user?: RequestUser }) {
    return this.fitToursService.removeAttachment(id, attachmentId, request?.user);
  }

  @Post(':id/steps/:step/confirm')
  @HttpCode(200)
  @RequirePermissions('tour.manage')
  confirmStep(@Param('id') id: string, @Param('step') step: string, @Body() dto: UpdateFitTourDto, @Req() request?: { user?: RequestUser }) {
    return this.fitToursService.confirmStep(id, step, dto, request?.user);
  }

  @Patch(':id/steps/:step')
  @RequirePermissions('tour.manage')
  saveStep(@Param('id') id: string, @Param('step') step: string, @Body() dto: UpdateFitTourDto, @Req() request?: { user?: RequestUser }) {
    return this.fitToursService.saveStep(id, step, dto, request?.user);
  }

  @Patch(':id')
  @RequirePermissions('tour.manage')
  patch(@Param('id') id: string, @Body() dto: UpdateFitTourDto, @Req() request?: { user?: RequestUser }) {
    return this.fitToursService.update(id, dto, request?.user);
  }

  @Delete(':id')
  @RequirePermissions('tour.manage')
  remove(@Param('id') id: string, @Req() request?: { user?: RequestUser }) {
    return this.fitToursService.remove(id, request?.user);
  }

  @Post(':id/copy-budget')
  @HttpCode(200)
  @RequirePermissions('tour.manage')
  copyBudget(@Param('id') id: string, @Body() dto: FitTourCopySourceDto, @Req() request?: { user?: RequestUser }) {
    return this.fitToursService.copyBudget(id, dto.sourceTourId, request?.user);
  }

  @Post(':id/copy-operation')
  @HttpCode(200)
  @RequirePermissions('tour.manage')
  copyOperation(@Param('id') id: string, @Body() dto: FitTourCopyOperationDto = {}, @Req() request?: { user?: RequestUser }) {
    return this.fitToursService.copyOperation(id, dto.sourceTourId, request?.user);
  }


  private setExportHeaders(response: ServerResponse, contentType: string, filename: string) {
    response.setHeader('Content-Type', contentType);
    response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  }
}

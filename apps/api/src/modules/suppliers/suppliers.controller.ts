import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, Req, Res, StreamableFile, UploadedFile, UseFilters, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { ServerResponse } from 'node:http';
import { csvToXlsxWorkbook, XLSX_MIME } from '../../common/xlsx-workbook';
import { RequestUser } from '../auth/data-scope';
import { RequirePermissions } from '../auth/permissions.decorator';
import { FileUploadSizeExceptionFilter } from '../files/file-upload-size-exception.filter';
import { fileUploadInterceptorOptions } from '../files/files.service';
import { CreateSupplierCategoryDto } from './dto/create-supplier-category.dto';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { CreateGenericSupplierDto, UpdateGenericSupplierDto } from './dto/generic-supplier.dto';
import { CreateHotelSupplierDto, LockAllotmentDto, OverrideAllotmentDto, ReleaseAllotmentDto, UpdateHotelSupplierDto, UpdateSupplierStatusDto } from './dto/hotel-supplier.dto';
import { SupplierImportDto } from './dto/supplier-import.dto';
import { AllotmentInventoryQueryDto, HotelSupplierListQueryDto, SupplierCategoryListQueryDto, SupplierListQueryDto, TypedSupplierListQueryDto } from './dto/supplier-query.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { supplierImportInterceptorOptions, type SupplierImportFile } from './supplier-import';
import { SupplierImportSizeExceptionFilter } from './supplier-import-size-exception.filter';
import { isTypedSupplierRoute } from './supplier-types';
import { SuppliersService } from './suppliers.service';

@ApiTags('supplier-categories')
@RequirePermissions('supplier.view')
@Controller('supplier-categories')
export class SupplierCategoriesController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Get()
  list(@Query() query: SupplierCategoryListQueryDto) {
    return this.suppliersService.listCategories(query);
  }

  @Post()
  @RequirePermissions('supplier.manage')
  create(@Body() dto: CreateSupplierCategoryDto) {
    return this.suppliersService.createCategory(dto);
  }

  @Patch(':id')
  @RequirePermissions('supplier.manage')
  update(@Param('id') id: string, @Body() dto: CreateSupplierCategoryDto) {
    return this.suppliersService.updateCategory(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('supplier.manage')
  remove(@Param('id') id: string) {
    return this.suppliersService.deleteCategory(id);
  }
}

@ApiTags('suppliers')
@RequirePermissions('supplier.view')
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Get()
  list(@Query() query: SupplierListQueryDto, @Req() request: { user?: RequestUser }) {
    return this.suppliersService.listSuppliers(query, request.user);
  }


  @Get('export')
  async exportSuppliers(@Query() query: SupplierListQueryDto, @Req() request: { user?: RequestUser }, @Res({ passthrough: true }) response: ServerResponse) {
    const csv = await this.suppliersService.exportSuppliersCsv(query, request.user);
    if (query.format === 'xlsx') {
      this.setExportHeaders(response, XLSX_MIME, 'smarttour-suppliers.xlsx');
      return new StreamableFile(csvToXlsxWorkbook('suppliers', csv));
    }
    this.setExportHeaders(response, 'text/csv; charset=utf-8', 'smarttour-suppliers.csv');
    return csv;
  }

  @Get('hotels')
  listHotels(@Query() query: HotelSupplierListQueryDto, @Req() request: { user?: RequestUser }) {
    return this.suppliersService.listHotelSuppliers(query, request.user);
  }


  @Get('hotels/export')
  async exportHotels(@Query() query: HotelSupplierListQueryDto, @Req() request: { user?: RequestUser }, @Res({ passthrough: true }) response: ServerResponse) {
    const csv = await this.suppliersService.exportHotelSuppliersCsv(query, request.user);
    if (query.format === 'xlsx') {
      this.setExportHeaders(response, XLSX_MIME, 'smarttour-hotel-suppliers.xlsx');
      return new StreamableFile(csvToXlsxWorkbook('supplier-hotels', csv));
    }
    this.setExportHeaders(response, 'text/csv; charset=utf-8', 'smarttour-hotel-suppliers.csv');
    return csv;
  }

  @Get('hotels/:id')
  hotelDetail(@Param('id') id: string, @Req() request: { user?: RequestUser }) {
    return this.suppliersService.getHotelSupplier(id, request.user);
  }

  @Post('hotels')
  @RequirePermissions('supplier.manage')
  createHotel(@Body() dto: CreateHotelSupplierDto, @Req() request: { user?: RequestUser }) {
    return this.suppliersService.createHotelSupplier(dto, request.user);
  }

  @Put('hotels/:id')
  @RequirePermissions('supplier.manage')
  updateHotel(@Param('id') id: string, @Body() dto: UpdateHotelSupplierDto, @Req() request: { user?: RequestUser }) {
    return this.suppliersService.updateHotelSupplier(id, dto, request.user);
  }

  @Get('hotel-allotments/dashboard')
  allotmentDashboard() {
    return this.suppliersService.allotmentDashboard();
  }

  @Get('hotel-allotments/inventory')
  allotmentInventory(@Query() query: AllotmentInventoryQueryDto, @Req() request: { user?: RequestUser }) {
    return this.suppliersService.listAllotmentInventory(query, request.user);
  }

  @Patch('hotel-allotments/:id/override')
  @HttpCode(200)
  @RequirePermissions('supplier.manage')
  overrideAllotment(@Param('id') id: string, @Body() dto: OverrideAllotmentDto, @Req() request: { user?: RequestUser }) {
    return this.suppliersService.overrideAllotment(id, dto, request.user);
  }

  @Post('hotel-allotments/:id/lock')
  @HttpCode(200)
  @RequirePermissions('supplier.manage')
  lockAllotment(@Param('id') id: string, @Body() dto: LockAllotmentDto, @Req() request: { user?: RequestUser }) {
    return this.suppliersService.lockAllotment(id, dto, request.user);
  }

  @Post('hotel-allotment-allocations/:id/confirm')
  @HttpCode(200)
  @RequirePermissions('supplier.manage')
  confirmAllotment(@Param('id') id: string, @Body() dto: ReleaseAllotmentDto, @Req() request: { user?: RequestUser }) {
    return this.suppliersService.confirmAllotmentAllocation(id, dto, request.user);
  }

  @Post('hotel-allotment-allocations/:id/release')
  @HttpCode(200)
  @RequirePermissions('supplier.manage')
  releaseAllotment(@Param('id') id: string, @Body() dto: ReleaseAllotmentDto, @Req() request: { user?: RequestUser }) {
    return this.suppliersService.releaseAllotmentAllocation(id, dto, request.user);
  }

  @Post('import/preview')
  @RequirePermissions('supplier.manage')
  @ApiConsumes('multipart/form-data')
  @UseFilters(SupplierImportSizeExceptionFilter)
  @UseInterceptors(FileInterceptor('file', supplierImportInterceptorOptions()))
  previewImport(
    @Body() dto: SupplierImportDto,
    @UploadedFile() file: SupplierImportFile | undefined,
    @Req() request: { user?: RequestUser },
  ) {
    return this.suppliersService.previewSupplierImport(dto, file, request.user);
  }

  @Post('import')
  @RequirePermissions('supplier.manage')
  @ApiConsumes('multipart/form-data')
  @UseFilters(SupplierImportSizeExceptionFilter)
  @UseInterceptors(FileInterceptor('file', supplierImportInterceptorOptions()))
  importSuppliers(
    @Body() dto: SupplierImportDto,
    @UploadedFile() file: SupplierImportFile | undefined,
    @Req() request: { user?: RequestUser },
  ) {
    return this.suppliersService.importSuppliers(dto, file, request.user);
  }

  @Get('finance-summaries')
  @RequirePermissions('supplier.view', 'finance.payment.view')
  financeSummaries(@Query('ids') ids: string | undefined, @Req() request: { user?: RequestUser }) {
    return this.suppliersService.listSupplierFinanceSummaries(ids?.split(',') || [], request.user);
  }

  @Get(':id/finance-summary')
  @RequirePermissions('supplier.view', 'finance.payment.view')
  financeSummary(@Param('id') id: string, @Req() request: { user?: RequestUser }) {
    return this.suppliersService.supplierFinanceSummary(id, request.user);
  }

  @Get(':type/export')
  async exportTyped(@Param('type') type: string, @Query() query: TypedSupplierListQueryDto, @Req() request: { user?: RequestUser }, @Res({ passthrough: true }) response: ServerResponse) {
    const csv = await this.suppliersService.exportTypedSuppliersCsv(type, query, request.user);
    if (query.format === 'xlsx') {
      this.setExportHeaders(response, XLSX_MIME, `smarttour-suppliers-${type}.xlsx`);
      return new StreamableFile(csvToXlsxWorkbook(`supplier-${type}`, csv));
    }
    this.setExportHeaders(response, 'text/csv; charset=utf-8', `smarttour-suppliers-${type}.csv`);
    return csv;
  }

  @Get(':routeKey')
  listTypedOrDetail(@Param('routeKey') routeKey: string, @Query() query: TypedSupplierListQueryDto, @Req() request: { user?: RequestUser }) {
    if (isTypedSupplierRoute(routeKey)) return this.suppliersService.listTypedSuppliers(routeKey, query, request.user);
    return this.suppliersService.getSupplierFromRouteKey(routeKey, request.user);
  }

  @Get(':type/:id')
  typedDetail(@Param('type') type: string, @Param('id') id: string, @Req() request: { user?: RequestUser }) {
    return this.suppliersService.getTypedSupplier(type, id, request.user);
  }

  @Post(':type')
  @RequirePermissions('supplier.manage')
  createTyped(@Param('type') type: string, @Body() dto: CreateGenericSupplierDto, @Req() request: { user?: RequestUser }) {
    return this.suppliersService.createTypedSupplier(type, dto, request.user);
  }

  @Put(':type/:id')
  @RequirePermissions('supplier.manage')
  updateTyped(@Param('type') type: string, @Param('id') id: string, @Body() dto: UpdateGenericSupplierDto, @Req() request: { user?: RequestUser }) {
    return this.suppliersService.updateTypedSupplier(type, id, dto, request.user);
  }

  @Patch(':type/:id/status')
  @HttpCode(200)
  @RequirePermissions('supplier.manage')
  updateTypedStatus(@Param('type') type: string, @Param('id') id: string, @Body() dto: UpdateSupplierStatusDto, @Req() request: { user?: RequestUser }) {
    return this.suppliersService.updateTypedSupplierStatus(type, id, dto.status, request.user);
  }

  @Delete(':type/:id')
  @RequirePermissions('supplier.manage')
  removeTyped(@Param('type') type: string, @Param('id') id: string, @Req() request: { user?: RequestUser }) {
    return this.suppliersService.deleteTypedSupplier(type, id, request.user);
  }

  @Post(':id/files')
  @RequirePermissions('supplier.manage')
  @ApiConsumes('multipart/form-data')
  @UseFilters(FileUploadSizeExceptionFilter)
  @UseInterceptors(FileInterceptor('file', fileUploadInterceptorOptions()))
  addSupplierFile(
    @Param('id') id: string,
    @UploadedFile() file: { originalname: string; mimetype: string; size: number; buffer: Buffer } | undefined,
    @Req() request: { user?: RequestUser },
  ) {
    return this.suppliersService.addSupplierFile(id, file, request.user?.id, request.user);
  }

  @Delete(':id/files/:fileId')
  @RequirePermissions('supplier.manage')
  deleteSupplierFile(@Param('id') id: string, @Param('fileId') fileId: string, @Req() request: { user?: RequestUser }) {
    return this.suppliersService.deleteSupplierFile(id, fileId, request.user);
  }

  @Post()
  @RequirePermissions('supplier.manage')
  create(@Body() dto: CreateSupplierDto, @Req() request: { user?: RequestUser }) {
    return this.suppliersService.createSupplier(dto, request.user);
  }

  @Patch(':id')
  @RequirePermissions('supplier.manage')
  update(@Param('id') id: string, @Body() dto: UpdateSupplierDto, @Req() request: { user?: RequestUser }) {
    return this.suppliersService.updateSupplier(id, dto, request.user);
  }

  @Patch(':id/status')
  @HttpCode(200)
  @RequirePermissions('supplier.manage')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateSupplierStatusDto, @Req() request: { user?: RequestUser }) {
    return this.suppliersService.updateSupplierStatus(id, dto.status, request.user);
  }

  @Delete(':id')
  @RequirePermissions('supplier.manage')
  remove(@Param('id') id: string, @Req() request: { user?: RequestUser }) {
    return this.suppliersService.deleteSupplier(id, request.user);
  }


  private setExportHeaders(response: ServerResponse, contentType: string, filename: string) {
    response.setHeader('Content-Type', contentType);
    response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  }
}

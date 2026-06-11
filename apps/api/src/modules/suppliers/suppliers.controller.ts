import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { RequestUser } from '../auth/data-scope';
import { RequirePermissions } from '../auth/permissions.decorator';
import { fileUploadInterceptorOptions } from '../files/files.service';
import { CreateSupplierCategoryDto } from './dto/create-supplier-category.dto';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { CreateGenericSupplierDto, UpdateGenericSupplierDto } from './dto/generic-supplier.dto';
import { CreateHotelSupplierDto, LockAllotmentDto, OverrideAllotmentDto, ReleaseAllotmentDto, UpdateHotelSupplierDto, UpdateSupplierStatusDto } from './dto/hotel-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { SuppliersService } from './suppliers.service';

const typedSupplierRoutes = [
  'restaurants',
  'flights',
  'attraction-tickets',
  'landtour-suppliers',
  'water',
  'transport',
  'bus',
  'other',
  'villas',
  'passport',
  'guides',
  'series-tickets',
];

@ApiTags('supplier-categories')
@RequirePermissions('supplier.view')
@Controller('supplier-categories')
export class SupplierCategoriesController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Get()
  list() {
    return this.suppliersService.listCategories();
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
  list(@Query('search') search?: string, @Query('categoryId') categoryId?: string) {
    return this.suppliersService.listSuppliers(search, categoryId);
  }

  @Get('hotels')
  listHotels(
    @Query('search') search?: string,
    @Query('province') province?: string,
    @Query('hotelProject') hotelProject?: string,
    @Query('classHotel') classHotel?: string,
    @Query('status') status?: 'ACTIVE' | 'INACTIVE',
    @Query('market') market?: string,
  ) {
    return this.suppliersService.listHotelSuppliers({ search, province, hotelProject, classHotel, status, market });
  }

  @Get('hotels/:id')
  hotelDetail(@Param('id') id: string) {
    return this.suppliersService.getHotelSupplier(id);
  }

  @Post('hotels')
  @RequirePermissions('supplier.manage')
  createHotel(@Body() dto: CreateHotelSupplierDto) {
    return this.suppliersService.createHotelSupplier(dto);
  }

  @Put('hotels/:id')
  @RequirePermissions('supplier.manage')
  updateHotel(@Param('id') id: string, @Body() dto: UpdateHotelSupplierDto) {
    return this.suppliersService.updateHotelSupplier(id, dto);
  }

  @Get('hotel-allotments/dashboard')
  allotmentDashboard() {
    return this.suppliersService.allotmentDashboard();
  }

  @Get('hotel-allotments/inventory')
  allotmentInventory(
    @Query('supplierId') supplierId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.suppliersService.listAllotmentInventory({ supplierId, startDate, endDate });
  }

  @Patch('hotel-allotments/:id/override')
  @RequirePermissions('supplier.manage')
  overrideAllotment(@Param('id') id: string, @Body() dto: OverrideAllotmentDto) {
    return this.suppliersService.overrideAllotment(id, dto);
  }

  @Post('hotel-allotments/:id/lock')
  @RequirePermissions('supplier.manage')
  lockAllotment(@Param('id') id: string, @Body() dto: LockAllotmentDto, @Req() request: { user?: RequestUser }) {
    return this.suppliersService.lockAllotment(id, dto, request.user);
  }

  @Post('hotel-allotment-allocations/:id/confirm')
  @RequirePermissions('supplier.manage')
  confirmAllotment(@Param('id') id: string, @Body() dto: ReleaseAllotmentDto, @Req() request: { user?: RequestUser }) {
    return this.suppliersService.confirmAllotmentAllocation(id, dto, request.user);
  }

  @Post('hotel-allotment-allocations/:id/release')
  @RequirePermissions('supplier.manage')
  releaseAllotment(@Param('id') id: string, @Body() dto: ReleaseAllotmentDto, @Req() request: { user?: RequestUser }) {
    return this.suppliersService.releaseAllotmentAllocation(id, dto, request.user);
  }

  @Get(':type')
  listTyped(
    @Param('type') type: string,
    @Query('search') search?: string,
    @Query('province') province?: string,
    @Query('status') status?: 'ACTIVE' | 'INACTIVE',
    @Query('market') market?: string,
  ) {
    if (!typedSupplierRoutes.includes(type)) return this.suppliersService.getSupplier(type);
    return this.suppliersService.listTypedSuppliers(type, { search, province, status, market });
  }

  @Get(':type/:id')
  typedDetail(@Param('type') type: string, @Param('id') id: string) {
    return this.suppliersService.getTypedSupplier(type, id);
  }

  @Post(':type')
  @RequirePermissions('supplier.manage')
  createTyped(@Param('type') type: string, @Body() dto: CreateGenericSupplierDto) {
    return this.suppliersService.createTypedSupplier(type, dto);
  }

  @Put(':type/:id')
  @RequirePermissions('supplier.manage')
  updateTyped(@Param('type') type: string, @Param('id') id: string, @Body() dto: UpdateGenericSupplierDto) {
    return this.suppliersService.updateTypedSupplier(type, id, dto);
  }

  @Patch(':type/:id/status')
  @RequirePermissions('supplier.manage')
  updateTypedStatus(@Param('type') type: string, @Param('id') id: string, @Body() dto: UpdateSupplierStatusDto) {
    return this.suppliersService.updateTypedSupplierStatus(type, id, dto.status);
  }

  @Delete(':type/:id')
  @RequirePermissions('supplier.manage')
  removeTyped(@Param('type') type: string, @Param('id') id: string) {
    return this.suppliersService.getTypedSupplier(type, id).then(() => this.suppliersService.deleteSupplier(id));
  }

  @Post(':id/files')
  @RequirePermissions('supplier.manage')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', fileUploadInterceptorOptions()))
  addSupplierFile(
    @Param('id') id: string,
    @UploadedFile() file: { originalname: string; mimetype: string; size: number; buffer: Buffer } | undefined,
    @Req() request: { user?: RequestUser },
  ) {
    return this.suppliersService.addSupplierFile(id, file, request.user?.id);
  }

  @Delete(':id/files/:fileId')
  @RequirePermissions('supplier.manage')
  deleteSupplierFile(@Param('id') id: string, @Param('fileId') fileId: string) {
    return this.suppliersService.deleteSupplierFile(id, fileId);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.suppliersService.getSupplier(id);
  }

  @Post()
  @RequirePermissions('supplier.manage')
  create(@Body() dto: CreateSupplierDto) {
    return this.suppliersService.createSupplier(dto);
  }

  @Patch(':id')
  @RequirePermissions('supplier.manage')
  update(@Param('id') id: string, @Body() dto: UpdateSupplierDto) {
    return this.suppliersService.updateSupplier(id, dto);
  }

  @Patch(':id/status')
  @RequirePermissions('supplier.manage')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateSupplierStatusDto) {
    return this.suppliersService.updateSupplierStatus(id, dto.status);
  }

  @Delete(':id')
  @RequirePermissions('supplier.manage')
  remove(@Param('id') id: string) {
    return this.suppliersService.deleteSupplier(id);
  }
}

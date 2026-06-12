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
import { AllotmentInventoryQueryDto, HotelSupplierListQueryDto, SupplierCategoryListQueryDto, SupplierListQueryDto, TypedSupplierListQueryDto } from './dto/supplier-query.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
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
  list(@Query() query: SupplierListQueryDto) {
    return this.suppliersService.listSuppliers(query);
  }

  @Get('hotels')
  listHotels(@Query() query: HotelSupplierListQueryDto) {
    return this.suppliersService.listHotelSuppliers(query);
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
  allotmentInventory(@Query() query: AllotmentInventoryQueryDto) {
    return this.suppliersService.listAllotmentInventory(query);
  }

  @Patch('hotel-allotments/:id/override')
  @RequirePermissions('supplier.manage')
  overrideAllotment(@Param('id') id: string, @Body() dto: OverrideAllotmentDto, @Req() request: { user?: RequestUser }) {
    return this.suppliersService.overrideAllotment(id, dto, request.user);
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

  @Get(':routeKey')
  listTypedOrDetail(@Param('routeKey') routeKey: string, @Query() query: TypedSupplierListQueryDto) {
    if (isTypedSupplierRoute(routeKey)) return this.suppliersService.listTypedSuppliers(routeKey, query);
    return this.suppliersService.getSupplierFromRouteKey(routeKey);
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
    return this.suppliersService.deleteTypedSupplier(type, id);
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

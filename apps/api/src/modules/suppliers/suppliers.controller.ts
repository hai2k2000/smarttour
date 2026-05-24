import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CreateSupplierCategoryDto } from './dto/create-supplier-category.dto';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { SuppliersService } from './suppliers.service';

@ApiTags('supplier-categories')
@Controller('supplier-categories')
export class SupplierCategoriesController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Get()
  list() {
    return this.suppliersService.listCategories();
  }

  @Post()
  create(@Body() dto: CreateSupplierCategoryDto) {
    return this.suppliersService.createCategory(dto);
  }
}

@ApiTags('suppliers')
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Get()
  list(@Query('search') search?: string, @Query('categoryId') categoryId?: string) {
    return this.suppliersService.listSuppliers(search, categoryId);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.suppliersService.getSupplier(id);
  }

  @Post()
  create(@Body() dto: CreateSupplierDto) {
    return this.suppliersService.createSupplier(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSupplierDto) {
    return this.suppliersService.updateSupplier(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.suppliersService.deleteSupplier(id);
  }
}

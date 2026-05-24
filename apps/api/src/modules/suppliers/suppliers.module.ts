import { Module } from '@nestjs/common';
import { SupplierCategoriesController, SuppliersController } from './suppliers.controller';
import { SuppliersService } from './suppliers.service';

@Module({
  controllers: [SupplierCategoriesController, SuppliersController],
  providers: [SuppliersService],
})
export class SuppliersModule {}

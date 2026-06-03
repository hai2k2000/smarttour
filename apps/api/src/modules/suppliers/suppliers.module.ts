import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { SupplierCategoriesController, SuppliersController } from './suppliers.controller';
import { SuppliersService } from './suppliers.service';

@Module({
  imports: [FilesModule],
  controllers: [SupplierCategoriesController, SuppliersController],
  providers: [SuppliersService],
})
export class SuppliersModule {}

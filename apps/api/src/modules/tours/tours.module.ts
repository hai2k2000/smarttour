import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { TourCoreService } from './tour-core.service';
import { ToursController } from './tours.controller';
import { ToursService } from './tours.service';

@Module({
  imports: [DatabaseModule],
  controllers: [ToursController],
  providers: [TourCoreService, ToursService],
  exports: [TourCoreService, ToursService],
})
export class ToursModule {}

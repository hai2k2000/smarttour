import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { FilesModule } from '../files/files.module';
import { ToursModule } from '../tours/tours.module';
import { FitTourLegacyCompatService } from './fit-tour-legacy-compat.service';
import { FitToursController } from './fit-tours.controller';
import { FitToursService } from './fit-tours.service';

@Module({
  imports: [DatabaseModule, FilesModule, ToursModule],
  controllers: [FitToursController],
  providers: [FitTourLegacyCompatService, FitToursService],
})
export class FitToursModule {}

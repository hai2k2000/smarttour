import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { FilesModule } from '../files/files.module';
import { TourGuidesController } from './tour-guides.controller';
import { TourGuidesService } from './tour-guides.service';

@Module({
  imports: [DatabaseModule, FilesModule],
  controllers: [TourGuidesController],
  providers: [TourGuidesService],
})
export class TourGuidesModule {}

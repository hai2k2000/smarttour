import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { TourGuidesController } from './tour-guides.controller';
import { TourGuidesService } from './tour-guides.service';

@Module({
  imports: [DatabaseModule],
  controllers: [TourGuidesController],
  providers: [TourGuidesService],
})
export class TourGuidesModule {}

import { Module } from '@nestjs/common';
import { TourItineraryDaysController, TourProgramsController } from './tour-programs.controller';
import { TourProgramsService } from './tour-programs.service';

@Module({
  controllers: [TourProgramsController, TourItineraryDaysController],
  providers: [TourProgramsService],
})
export class TourProgramsModule {}

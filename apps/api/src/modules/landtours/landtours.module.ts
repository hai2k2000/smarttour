import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { ToursModule } from '../tours/tours.module';
import { LandToursController } from './landtours.controller';
import { LandToursService } from './landtours.service';

@Module({
  imports: [DatabaseModule, ToursModule],
  controllers: [LandToursController],
  providers: [LandToursService],
})
export class LandToursModule {}

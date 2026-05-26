import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { LandToursController } from './landtours.controller';
import { LandToursService } from './landtours.service';

@Module({
  imports: [DatabaseModule],
  controllers: [LandToursController],
  providers: [LandToursService],
})
export class LandToursModule {}

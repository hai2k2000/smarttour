import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { FitToursController } from './fit-tours.controller';
import { FitToursService } from './fit-tours.service';

@Module({
  imports: [DatabaseModule],
  controllers: [FitToursController],
  providers: [FitToursService],
})
export class FitToursModule {}

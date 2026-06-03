import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { FilesModule } from '../files/files.module';
import { FitToursController } from './fit-tours.controller';
import { FitToursService } from './fit-tours.service';

@Module({
  imports: [DatabaseModule, FilesModule],
  controllers: [FitToursController],
  providers: [FitToursService],
})
export class FitToursModule {}

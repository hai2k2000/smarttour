import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { ToursModule } from '../tours/tours.module';
import { GitToursController } from './git-tours.controller';
import { GitToursService } from './git-tours.service';

@Module({
  imports: [DatabaseModule, ToursModule],
  controllers: [GitToursController],
  providers: [GitToursService],
})
export class GitToursModule {}

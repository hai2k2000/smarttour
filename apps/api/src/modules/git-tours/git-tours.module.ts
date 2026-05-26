import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { GitToursController } from './git-tours.controller';
import { GitToursService } from './git-tours.service';

@Module({
  imports: [DatabaseModule],
  controllers: [GitToursController],
  providers: [GitToursService],
})
export class GitToursModule {}

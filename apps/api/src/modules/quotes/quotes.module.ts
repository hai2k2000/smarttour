import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { QuotesController } from './quotes.controller';
import { QuotesService } from './quotes.service';

@Module({
  imports: [DatabaseModule],
  controllers: [QuotesController],
  providers: [QuotesService],
})
export class QuotesModule {}

import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { CommissionReportsController } from './commission-reports.controller';
import { CommissionReportsService } from './commission-reports.service';

@Module({
  imports: [DatabaseModule],
  controllers: [CommissionReportsController],
  providers: [CommissionReportsService],
})
export class CommissionReportsModule {}

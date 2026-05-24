import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health.controller';
import { OperationsModule } from './modules/operations/operations.module';
import { SuppliersModule } from './modules/suppliers/suppliers.module';
import { TourProgramsModule } from './modules/tour-programs/tour-programs.module';

@Module({
  imports: [DatabaseModule, OperationsModule, SuppliersModule, TourProgramsModule],
  controllers: [HealthController],
})
export class AppModule {}

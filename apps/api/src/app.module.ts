import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health.controller';
import { OperationsModule } from './modules/operations/operations.module';
import { SuppliersModule } from './modules/suppliers/suppliers.module';

@Module({
  imports: [DatabaseModule, OperationsModule, SuppliersModule],
  controllers: [HealthController],
})
export class AppModule {}

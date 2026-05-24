import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { OperationsModule } from './modules/operations/operations.module';

@Module({
  imports: [OperationsModule],
  controllers: [HealthController],
})
export class AppModule {}

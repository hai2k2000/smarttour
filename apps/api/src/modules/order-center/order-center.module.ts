import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { OrderCenterController } from './order-center.controller';
import { OrderCenterService } from './order-center.service';

@Module({
  imports: [DatabaseModule],
  controllers: [OrderCenterController],
  providers: [OrderCenterService],
})
export class OrderCenterModule {}

import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { OrderAllotmentService } from './order-allotment-sync';
import { OrderChildrenSyncService } from './order-children-sync';
import { OrderCustomerSnapshotService } from './order-customer-snapshot';
import { OrderLifecycleService } from './order-lifecycle';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [DatabaseModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrderLifecycleService, OrderChildrenSyncService, OrderAllotmentService, OrderCustomerSnapshotService],
})
export class OrdersModule {}

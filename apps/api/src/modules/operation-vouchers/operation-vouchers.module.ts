import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { OperationVouchersController } from './operation-vouchers.controller';
import { OperationVouchersService } from './operation-vouchers.service';

@Module({
  imports: [DatabaseModule],
  controllers: [OperationVouchersController],
  providers: [OperationVouchersService],
})
export class OperationVouchersModule {}

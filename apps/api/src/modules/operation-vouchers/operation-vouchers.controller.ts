import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../auth/permissions.decorator';
import { AddOperationVoucherPaymentDto, CreateOperationVoucherDto, UpdateOperationVoucherDto } from './dto/operation-voucher.dto';
import { OperationVouchersService } from './operation-vouchers.service';

@ApiTags('operation-vouchers')
@RequirePermissions('operation.form.view')
@Controller('operation-vouchers')
export class OperationVouchersController {
  constructor(private readonly service: OperationVouchersService) {}

  @Get()
  list(@Query('search') search?: string, @Query('status') status?: string) {
    return this.service.list(search, status);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.service.detail(id);
  }

  @Post()
  @RequirePermissions('operation.form.manage')
  create(@Body() dto: CreateOperationVoucherDto) {
    return this.service.create(dto);
  }

  @Put(':id')
  @RequirePermissions('operation.form.manage')
  update(@Param('id') id: string, @Body() dto: UpdateOperationVoucherDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('operation.form.manage')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Post(':id/payment')
  @RequirePermissions('operation.payment-request.create')
  addPayment(@Param('id') id: string, @Body() dto: AddOperationVoucherPaymentDto) {
    return this.service.addPayment(id, dto);
  }

  @Post(':id/create-payment-voucher')
  @RequirePermissions('operation.payment-request.approve')
  createPaymentVoucher(@Param('id') id: string) {
    return this.service.createPaymentVoucher(id);
  }
}

import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequestUser } from '../auth/data-scope';
import { RequirePermissions } from '../auth/permissions.decorator';
import { AddOperationVoucherPaymentDto, CreateOperationVoucherDto, ListOperationVouchersQueryDto, UpdateOperationVoucherDto } from './dto/operation-voucher.dto';
import { OperationVouchersService } from './operation-vouchers.service';

@ApiTags('operation-vouchers')
@RequirePermissions('operation.form.view')
@Controller('operation-vouchers')
export class OperationVouchersController {
  constructor(private readonly service: OperationVouchersService) {}

  @Get()
  list(@Query() query: ListOperationVouchersQueryDto, @Req() request?: { user?: RequestUser }) {
    return this.service.list(query.search, query.status, request?.user, query.take, query.skip);
  }

  @Get(':id')
  detail(@Param('id') id: string, @Req() request?: { user?: RequestUser }) {
    return this.service.detail(id, request?.user);
  }

  @Post()
  @RequirePermissions('operation.form.manage')
  create(@Body() dto: CreateOperationVoucherDto, @Req() request?: { user?: RequestUser }) {
    return this.service.create(dto, request?.user);
  }

  @Put(':id')
  @RequirePermissions('operation.form.manage')
  update(@Param('id') id: string, @Body() dto: UpdateOperationVoucherDto, @Req() request?: { user?: RequestUser }) {
    return this.service.update(id, dto, request?.user);
  }

  @Delete(':id')
  @RequirePermissions('operation.form.manage')
  remove(@Param('id') id: string, @Req() request?: { user?: RequestUser }) {
    return this.service.remove(id, request?.user);
  }

  @Post(':id/payment')
  @RequirePermissions('operation.payment-request.create')
  addPayment(@Param('id') id: string, @Body() dto: AddOperationVoucherPaymentDto, @Req() request?: { user?: RequestUser }) {
    return this.service.addPayment(id, dto, request?.user);
  }

  @Post(':id/create-payment-voucher')
  @RequirePermissions('operation.payment-request.approve')
  createPaymentVoucher(@Param('id') id: string, @Req() request?: { user?: RequestUser }) {
    return this.service.createPaymentVoucher(id, request?.user);
  }
}

import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequestUser } from '../auth/data-scope';
import { RequirePermissions } from '../auth/permissions.decorator';
import { ListOperationFormsQueryDto, ListSupplierPaymentRequestsQueryDto } from './dto/list-operations-query.dto';
import { OperationsService } from './operations.service';

@ApiTags('operations')
@Controller('operations')
export class OperationsController {
  constructor(private readonly operationsService: OperationsService) {}

  @Get('dashboard')
  @RequirePermissions('operation.form.view')
  dashboard(@Req() request?: { user?: RequestUser }) {
    return this.operationsService.getDashboard(request?.user);
  }

  @Get('modules')
  @RequirePermissions('operation.form.view')
  modules() {
    return this.operationsService.getModules();
  }

  @Get('forms')
  @RequirePermissions('operation.form.view')
  forms(@Query() query: ListOperationFormsQueryDto, @Req() request?: { user?: RequestUser }) {
    return this.operationsService.listForms(query, request?.user);
  }

  @Post('forms')
  @RequirePermissions('operation.form.manage')
  createForm(@Body() dto?: Record<string, unknown>, @Req() request?: { user?: RequestUser }) {
    return this.operationsService.createForm(dto, request?.user);
  }

  @Get('forms/:id')
  @RequirePermissions('operation.form.view')
  form(@Param('id') id: string, @Req() request?: { user?: RequestUser }) {
    return this.operationsService.formDetail(id, request?.user);
  }

  @Put('forms/:id')
  @RequirePermissions('operation.form.manage')
  updateForm(@Param('id') id: string, @Body() dto?: Record<string, unknown>, @Req() request?: { user?: RequestUser }) {
    return this.operationsService.updateForm(id, dto, request?.user);
  }

  @Post('forms/:id/status')
  @HttpCode(200)
  @RequirePermissions('operation.form.manage')
  updateFormStatus(@Param('id') id: string, @Body() dto?: Record<string, unknown>, @Req() request?: { user?: RequestUser }) {
    return this.operationsService.changeFormStatus(id, dto?.status, dto, request?.user);
  }

  @Delete('forms/:id')
  @HttpCode(200)
  @RequirePermissions('operation.form.manage')
  @ApiOperation({ summary: 'Legacy alias for POST /operations/forms/{id}/cancel', deprecated: true })
  cancelFormLegacy(@Param('id') id: string, @Body() dto?: Record<string, unknown>, @Req() request?: { user?: RequestUser }) {
    return this.operationsService.cancelForm(id, dto, request?.user);
  }

  @Post('forms/:id/cancel')
  @HttpCode(200)
  @RequirePermissions('operation.form.manage')
  @ApiOperation({ summary: 'H\u1ee7y phi\u1ebfu \u0111i\u1ec1u h\u00e0nh. \u0110\u00e2y l\u00e0 route ch\u00ednh th\u1ee9c; DELETE /operations/forms/{id} ch\u1ec9 gi\u1eef \u0111\u1ec3 t\u01b0\u01a1ng th\u00edch.' })
  cancelForm(@Param('id') id: string, @Body() dto?: Record<string, unknown>, @Req() request?: { user?: RequestUser }) {
    return this.operationsService.cancelForm(id, dto, request?.user);
  }

  @Get('supplier-payment-requests')
  @RequirePermissions('operation.payment-request.view')
  paymentRequests(@Query() query: ListSupplierPaymentRequestsQueryDto, @Req() request?: { user?: RequestUser }) {
    return this.operationsService.listPaymentRequests(query, request?.user);
  }

  @Post('supplier-payment-requests')
  @RequirePermissions('operation.payment-request.create')
  createPaymentRequest(@Body() dto?: Record<string, unknown>, @Req() request?: { user?: RequestUser }) {
    return this.operationsService.createPaymentRequest(dto, request?.user);
  }

  @Get('supplier-payment-requests/:id')
  @RequirePermissions('operation.payment-request.view')
  paymentRequest(@Param('id') id: string, @Req() request?: { user?: RequestUser }) {
    return this.operationsService.paymentRequestDetail(id, request?.user);
  }

  @Put('supplier-payment-requests/:id')
  @RequirePermissions('operation.payment-request.create')
  updatePaymentRequest(@Param('id') id: string, @Body() dto?: Record<string, unknown>, @Req() request?: { user?: RequestUser }) {
    return this.operationsService.updatePaymentRequest(id, dto, request?.user);
  }

  @Delete('supplier-payment-requests/:id')
  @RequirePermissions('operation.payment-request.create')
  deletePaymentRequest(@Param('id') id: string, @Req() request?: { user?: RequestUser }) {
    return this.operationsService.deletePaymentRequest(id, request?.user);
  }

  @Post('supplier-payment-requests/:id/submit')
  @HttpCode(200)
  @RequirePermissions('operation.payment-request.create')
  submitPaymentRequest(@Param('id') id: string, @Body() dto?: Record<string, unknown>, @Req() request?: { user?: RequestUser }) {
    return this.operationsService.submitPaymentRequest(id, dto, request?.user);
  }

  @Post('supplier-payment-requests/:id/approve')
  @HttpCode(200)
  @RequirePermissions('operation.payment-request.approve')
  approvePaymentRequest(@Param('id') id: string, @Body() dto?: Record<string, unknown>, @Req() request?: { user?: RequestUser }) {
    return this.operationsService.approvePaymentRequest(id, dto, request?.user);
  }

  @Post('supplier-payment-requests/:id/reject')
  @HttpCode(200)
  @RequirePermissions('operation.payment-request.approve')
  rejectPaymentRequest(@Param('id') id: string, @Body() dto?: Record<string, unknown>, @Req() request?: { user?: RequestUser }) {
    return this.operationsService.rejectPaymentRequest(id, dto, request?.user);
  }

  @Post('supplier-payment-requests/:id/create-finance-payment')
  @HttpCode(200)
  @RequirePermissions('operation.payment-request.approve', 'finance.payment.create')
  createFinancePaymentForRequest(@Param('id') id: string, @Body() dto?: Record<string, unknown>, @Req() request?: { user?: RequestUser }) {
    return this.operationsService.createFinancePaymentForRequest(id, dto, request?.user);
  }
}

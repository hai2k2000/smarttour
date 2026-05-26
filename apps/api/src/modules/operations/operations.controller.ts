import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequestUser } from '../auth/data-scope';
import { RequirePermissions } from '../auth/permissions.decorator';
import { OperationsService } from './operations.service';

@ApiTags('operations')
@Controller('operations')
export class OperationsController {
  constructor(private readonly operationsService: OperationsService) {}

  @Get('dashboard')
  @RequirePermissions('operation.form.view')
  dashboard() {
    return this.operationsService.getDashboard();
  }

  @Get('modules')
  @RequirePermissions('operation.form.view')
  modules() {
    return this.operationsService.getModules();
  }

  @Get('forms')
  @RequirePermissions('operation.form.view')
  forms(@Query() query: Record<string, string>, @Req() request?: { user?: RequestUser }) {
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

  @Delete('forms/:id')
  @RequirePermissions('operation.form.manage')
  cancelForm(@Param('id') id: string, @Body() dto?: Record<string, unknown>, @Req() request?: { user?: RequestUser }) {
    return this.operationsService.cancelForm(id, dto, request?.user);
  }

  @Post('forms/:id/cancel')
  @RequirePermissions('operation.form.manage')
  cancelFormPost(@Param('id') id: string, @Body() dto?: Record<string, unknown>, @Req() request?: { user?: RequestUser }) {
    return this.operationsService.cancelForm(id, dto, request?.user);
  }

  @Get('supplier-payment-requests')
  @RequirePermissions('operation.payment-request.view')
  paymentRequests(@Query() query: Record<string, string>, @Req() request?: { user?: RequestUser }) {
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
  @RequirePermissions('operation.payment-request.create')
  submitPaymentRequest(@Param('id') id: string, @Body() dto?: Record<string, unknown>, @Req() request?: { user?: RequestUser }) {
    return this.operationsService.submitPaymentRequest(id, dto, request?.user);
  }

  @Post('supplier-payment-requests/:id/approve')
  @RequirePermissions('operation.payment-request.approve')
  approvePaymentRequest(@Param('id') id: string, @Body() dto?: Record<string, unknown>, @Req() request?: { user?: RequestUser }) {
    return this.operationsService.approvePaymentRequest(id, dto, request?.user);
  }

  @Post('supplier-payment-requests/:id/reject')
  @RequirePermissions('operation.payment-request.approve')
  rejectPaymentRequest(@Param('id') id: string, @Body() dto?: Record<string, unknown>, @Req() request?: { user?: RequestUser }) {
    return this.operationsService.rejectPaymentRequest(id, dto, request?.user);
  }

  @Post('supplier-payment-requests/:id/create-finance-payment')
  @RequirePermissions('operation.payment-request.approve')
  createFinancePaymentForRequest(@Param('id') id: string, @Body() dto?: Record<string, unknown>, @Req() request?: { user?: RequestUser }) {
    return this.operationsService.createFinancePaymentForRequest(id, dto, request?.user);
  }
}

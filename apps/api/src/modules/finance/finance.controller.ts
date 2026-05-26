import { Body, Controller, Delete, Get, Header, Param, Post, Put, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequestUser } from '../auth/data-scope';
import { RequirePermissions } from '../auth/permissions.decorator';
import { FinanceService } from './finance.service';

@ApiTags('finance')
@Controller('finance')
export class FinanceController {
  constructor(private readonly service: FinanceService) {}

  @Get('receipts')
  @RequirePermissions('finance.receipt.view')
  receipts(@Query() query: Record<string, string>, @Req() request: { user?: RequestUser }) {
    return this.service.listReceipts(query, request.user);
  }

  @Post('receipts')
  @RequirePermissions('finance.receipt.create')
  createReceipt(@Body() dto: Record<string, unknown>, @Req() request: { user?: RequestUser }) {
    return this.service.createReceipt(dto, request.user);
  }

  @Get('receipts/export')
  @RequirePermissions('finance.receipt.export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="smarttour-finance-receipts.csv"')
  exportReceipts(@Query() query: Record<string, string>, @Req() request: { user?: RequestUser }) {
    return this.service.exportReceipts(query, request.user);
  }

  @Post('receipts/import')
  @RequirePermissions('finance.receipt.import')
  importReceipts(@Body() dto: Record<string, unknown>) {
    return this.service.importPlaceholder('receipts', dto);
  }

  @Get('receipts/:id')
  @RequirePermissions('finance.receipt.view')
  receipt(@Param('id') id: string, @Req() request: { user?: RequestUser }) {
    return this.service.receiptDetail(id, request.user);
  }

  @Put('receipts/:id')
  @RequirePermissions('finance.receipt.update')
  updateReceipt(@Param('id') id: string, @Body() dto: Record<string, unknown>, @Req() request: { user?: RequestUser }) {
    return this.service.updateReceipt(id, dto, request.user);
  }

  @Delete('receipts/:id')
  @RequirePermissions('finance.receipt.delete')
  deleteReceipt(@Param('id') id: string, @Req() request: { user?: RequestUser }) {
    return this.service.deleteReceipt(id, request.user);
  }

  @Post('receipts/:id/approve')
  @RequirePermissions('finance.receipt.approve')
  approveReceipt(@Param('id') id: string, @Body() dto: Record<string, unknown>, @Req() request: { user?: RequestUser }) {
    return this.service.approveReceipt(id, dto, request.user);
  }

  @Post('receipts/:id/reject')
  @RequirePermissions('finance.receipt.approve')
  rejectReceipt(@Param('id') id: string, @Body() dto: Record<string, unknown>, @Req() request: { user?: RequestUser }) {
    return this.service.rejectReceipt(id, dto, request.user);
  }

  @Post('receipts/:id/cancel')
  @RequirePermissions('finance.receipt.approve')
  cancelReceipt(@Param('id') id: string, @Body() dto: Record<string, unknown>, @Req() request: { user?: RequestUser }) {
    return this.service.cancelReceipt(id, dto, request.user);
  }

  @Get('payments')
  @RequirePermissions('finance.payment.view')
  payments(@Query() query: Record<string, string>, @Req() request: { user?: RequestUser }) {
    return this.service.listPayments(query, request.user);
  }

  @Post('payments')
  @RequirePermissions('finance.payment.create')
  createPayment(@Body() dto: Record<string, unknown>, @Req() request: { user?: RequestUser }) {
    return this.service.createPayment(dto, request.user);
  }

  @Get('payments/export')
  @RequirePermissions('finance.payment.export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="smarttour-finance-payments.csv"')
  exportPayments(@Query() query: Record<string, string>, @Req() request: { user?: RequestUser }) {
    return this.service.exportPayments(query, request.user);
  }

  @Post('payments/import')
  @RequirePermissions('finance.payment.import')
  importPayments(@Body() dto: Record<string, unknown>) {
    return this.service.importPlaceholder('payments', dto);
  }

  @Get('payments/:id')
  @RequirePermissions('finance.payment.view')
  payment(@Param('id') id: string, @Req() request: { user?: RequestUser }) {
    return this.service.paymentDetail(id, request.user);
  }

  @Put('payments/:id')
  @RequirePermissions('finance.payment.update')
  updatePayment(@Param('id') id: string, @Body() dto: Record<string, unknown>, @Req() request: { user?: RequestUser }) {
    return this.service.updatePayment(id, dto, request.user);
  }

  @Delete('payments/:id')
  @RequirePermissions('finance.payment.delete')
  deletePayment(@Param('id') id: string, @Req() request: { user?: RequestUser }) {
    return this.service.deletePayment(id, request.user);
  }

  @Post('payments/:id/approve')
  @RequirePermissions('finance.payment.approve')
  approvePayment(@Param('id') id: string, @Body() dto: Record<string, unknown>, @Req() request: { user?: RequestUser }) {
    return this.service.approvePayment(id, dto, request.user);
  }

  @Post('payments/:id/reject')
  @RequirePermissions('finance.payment.approve')
  rejectPayment(@Param('id') id: string, @Body() dto: Record<string, unknown>, @Req() request: { user?: RequestUser }) {
    return this.service.rejectPayment(id, dto, request.user);
  }

  @Post('payments/:id/cancel')
  @RequirePermissions('finance.payment.approve')
  cancelPayment(@Param('id') id: string, @Body() dto: Record<string, unknown>, @Req() request: { user?: RequestUser }) {
    return this.service.cancelPayment(id, dto, request.user);
  }

  @Get('invoices')
  @RequirePermissions('finance.invoice.view')
  invoices(@Query() query: Record<string, string>) {
    return this.service.listInvoices(query);
  }

  @Post('invoices')
  @RequirePermissions('finance.invoice.create')
  createInvoice(@Body() dto: Record<string, unknown>) {
    return this.service.createInvoice(dto);
  }

  @Get('invoices/export')
  @RequirePermissions('finance.invoice.export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="smarttour-finance-invoices.csv"')
  exportInvoices(@Query() query: Record<string, string>) {
    return this.service.exportInvoices(query);
  }

  @Get('invoices/:id')
  @RequirePermissions('finance.invoice.view')
  invoice(@Param('id') id: string) {
    return this.service.invoiceDetail(id);
  }

  @Put('invoices/:id')
  @RequirePermissions('finance.invoice.update')
  updateInvoice(@Param('id') id: string, @Body() dto: Record<string, unknown>) {
    return this.service.updateInvoice(id, dto);
  }

  @Delete('invoices/:id')
  @RequirePermissions('finance.invoice.delete')
  deleteInvoice(@Param('id') id: string) {
    return this.service.deleteInvoice(id);
  }

  @Post('invoices/:id/approve')
  @RequirePermissions('finance.invoice.approve')
  approveInvoice(@Param('id') id: string, @Body() dto: Record<string, unknown>) {
    return this.service.approveInvoice(id, dto);
  }

  @Post('invoices/:id/reject')
  @RequirePermissions('finance.invoice.approve')
  rejectInvoice(@Param('id') id: string, @Body() dto: Record<string, unknown>) {
    return this.service.rejectInvoice(id, dto);
  }

  @Post('invoices/:id/cancel')
  @RequirePermissions('finance.invoice.approve')
  cancelInvoice(@Param('id') id: string, @Body() dto: Record<string, unknown>) {
    return this.service.cancelInvoice(id, dto);
  }

  @Get('debt/customers')
  @RequirePermissions('finance.cashflow.view')
  customerDebt(@Query() query: Record<string, string>, @Req() request: { user?: RequestUser }) {
    return this.service.customerDebt(query, request.user);
  }

  @Get('debt/suppliers')
  @RequirePermissions('finance.cashflow.view')
  supplierDebt(@Query() query: Record<string, string>, @Req() request: { user?: RequestUser }) {
    return this.service.supplierDebt(query, request.user);
  }

  @Get('cashflow')
  @RequirePermissions('finance.cashflow.view')
  cashflow(@Query() query: Record<string, string>, @Req() request: { user?: RequestUser }) {
    return this.service.cashflow(query, request.user);
  }

  @Get('cashflow/export')
  @RequirePermissions('finance.cashflow.export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="smarttour-finance-cashflow.csv"')
  exportCashflow(@Query() query: Record<string, string>, @Req() request: { user?: RequestUser }) {
    return this.service.exportCashflow(query, request.user);
  }
}

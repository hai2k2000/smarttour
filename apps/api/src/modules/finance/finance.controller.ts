import { BadRequestException, Body, Controller, Delete, Get, Header, HttpCode, Param, Post, Put, Query, Req, Res, StreamableFile, UploadedFile, UseFilters, UseInterceptors } from '@nestjs/common';
import { ServerResponse } from 'node:http';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { RequestUser } from '../auth/data-scope';
import { RequirePermissions } from '../auth/permissions.decorator';
import { FileUploadSizeExceptionFilter } from '../files/file-upload-size-exception.filter';
import { fileUploadInterceptorOptions } from '../files/files.service';
import { FinanceCashflowService } from './finance-cashflow.service';
import { FinanceInvoiceService } from './finance-invoice.service';
import { financeImportInterceptorOptions } from './finance-import';
import { FinanceImportSizeExceptionFilter } from './finance-import-size-exception.filter';
import { FinanceLedgerService } from './finance-ledger.service';
import { FinancePaymentService } from './finance-payment.service';
import { FinanceReceiptService } from './finance-receipt.service';
import {
  FinanceDebtAdjustmentDto,
  FinanceDocumentActionDto,
  FinanceInvoiceBodyDto,
  FinancePaymentBodyDto,
  FinancePaymentImportDto,
  FinanceReceiptBodyDto,
  FinanceReceiptImportDto,
} from './dto/finance-body.dto';
import { FinanceQueryDto } from './dto/finance-query.dto';

@ApiTags('finance')
@Controller('finance')
export class FinanceController {
  constructor(
    private readonly receiptsService: FinanceReceiptService,
    private readonly paymentsService: FinancePaymentService,
    private readonly invoicesService: FinanceInvoiceService,
    private readonly ledgerService: FinanceLedgerService,
    private readonly cashflowService: FinanceCashflowService,
  ) {}

  @Get('receipts')
  @RequirePermissions('finance.receipt.view')
  receipts(@Query() query: FinanceQueryDto, @Req() request: { user?: RequestUser }) {
    return this.receiptsService.list(query as Record<string, string>, request.user);
  }

  @Post('receipts')
  @RequirePermissions('finance.receipt.create')
  createReceipt(@Body() dto: FinanceReceiptBodyDto, @Req() request: { user?: RequestUser }) {
    return this.receiptsService.create(dto, request.user);
  }

  @Get('receipts/export')
  @RequirePermissions('finance.receipt.export')
  async exportReceipts(@Query() query: FinanceQueryDto, @Req() request: { user?: RequestUser }, @Res({ passthrough: true }) response: ServerResponse) {
    if (query.format === 'xlsx') {
      this.setExportHeaders(response, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'smarttour-finance-receipts.xlsx');
      return new StreamableFile(await this.receiptsService.exportXlsx(query as Record<string, string>, request.user));
    }
    this.setExportHeaders(response, 'text/csv; charset=utf-8', 'smarttour-finance-receipts.csv');
    return this.receiptsService.export(query as Record<string, string>, request.user);
  }

  @Post('receipts/import')
  @RequirePermissions('finance.receipt.import')
  @ApiConsumes('multipart/form-data')
  @UseFilters(FinanceImportSizeExceptionFilter)
  @UseInterceptors(FileInterceptor('file', financeImportInterceptorOptions()))
  importReceipts(
    @Body() dto: FinanceReceiptImportDto,
    @UploadedFile() file: { originalname: string; mimetype: string; size: number; buffer: Buffer } | undefined,
    @Req() request: { user?: RequestUser },
  ) {
    return this.receiptsService.import(dto, file, request.user);
  }

  @Get('receipts/:id')
  @RequirePermissions('finance.receipt.view')
  receipt(@Param('id') id: string, @Req() request: { user?: RequestUser }) {
    return this.receiptsService.detail(id, request.user);
  }

  @Post('receipts/:id/file')
  @RequirePermissions('finance.receipt.update')
  @ApiConsumes('multipart/form-data')
  @UseFilters(FileUploadSizeExceptionFilter)
  @UseInterceptors(FileInterceptor('file', fileUploadInterceptorOptions()))
  uploadReceiptFile(
    @Param('id') id: string,
    @UploadedFile() file: { originalname: string; mimetype: string; size: number; buffer: Buffer } | undefined,
    @Req() request: { user?: RequestUser },
  ) {
    if (!file) throw new BadRequestException('Cần chọn file để tải lên');
    return this.receiptsService.uploadFile(id, file, request.user?.id, request.user);
  }

  @Delete('receipts/:id/file')
  @RequirePermissions('finance.receipt.update')
  deleteReceiptFile(@Param('id') id: string, @Req() request: { user?: RequestUser }) {
    return this.receiptsService.deleteFile(id, request.user);
  }

  @Put('receipts/:id')
  @RequirePermissions('finance.receipt.update')
  updateReceipt(@Param('id') id: string, @Body() dto: FinanceReceiptBodyDto, @Req() request: { user?: RequestUser }) {
    return this.receiptsService.update(id, dto, request.user);
  }

  @Delete('receipts/:id')
  @RequirePermissions('finance.receipt.delete')
  deleteReceipt(@Param('id') id: string, @Req() request: { user?: RequestUser }) {
    return this.receiptsService.delete(id, request.user);
  }

  @Post('receipts/:id/approve')
  @HttpCode(200)
  @RequirePermissions('finance.receipt.approve')
  approveReceipt(@Param('id') id: string, @Body() dto: FinanceDocumentActionDto, @Req() request: { user?: RequestUser }) {
    return this.receiptsService.approve(id, dto, request.user);
  }

  @Post('receipts/:id/reject')
  @HttpCode(200)
  @RequirePermissions('finance.receipt.approve')
  rejectReceipt(@Param('id') id: string, @Body() dto: FinanceDocumentActionDto, @Req() request: { user?: RequestUser }) {
    return this.receiptsService.reject(id, dto, request.user);
  }

  @Post('receipts/:id/cancel')
  @HttpCode(200)
  @RequirePermissions('finance.receipt.approve')
  cancelReceipt(@Param('id') id: string, @Body() dto: FinanceDocumentActionDto, @Req() request: { user?: RequestUser }) {
    return this.receiptsService.cancel(id, dto, request.user);
  }

  @Get('payments')
  @RequirePermissions('finance.payment.view')
  payments(@Query() query: FinanceQueryDto, @Req() request: { user?: RequestUser }) {
    return this.paymentsService.list(query as Record<string, string>, request.user);
  }

  @Post('payments')
  @RequirePermissions('finance.payment.create')
  createPayment(@Body() dto: FinancePaymentBodyDto, @Req() request: { user?: RequestUser }) {
    return this.paymentsService.create(dto, request.user);
  }

  @Get('payments/export')
  @RequirePermissions('finance.payment.export')
  async exportPayments(@Query() query: FinanceQueryDto, @Req() request: { user?: RequestUser }, @Res({ passthrough: true }) response: ServerResponse) {
    if (query.format === 'xlsx') {
      this.setExportHeaders(response, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'smarttour-finance-payments.xlsx');
      return new StreamableFile(await this.paymentsService.exportXlsx(query as Record<string, string>, request.user));
    }
    this.setExportHeaders(response, 'text/csv; charset=utf-8', 'smarttour-finance-payments.csv');
    return this.paymentsService.export(query as Record<string, string>, request.user);
  }

  @Post('payments/import')
  @RequirePermissions('finance.payment.import')
  @ApiConsumes('multipart/form-data')
  @UseFilters(FinanceImportSizeExceptionFilter)
  @UseInterceptors(FileInterceptor('file', financeImportInterceptorOptions()))
  importPayments(
    @Body() dto: FinancePaymentImportDto,
    @UploadedFile() file: { originalname: string; mimetype: string; size: number; buffer: Buffer } | undefined,
    @Req() request: { user?: RequestUser },
  ) {
    return this.paymentsService.import(dto, file, request.user);
  }

  @Get('payments/:id')
  @RequirePermissions('finance.payment.view')
  payment(@Param('id') id: string, @Req() request: { user?: RequestUser }) {
    return this.paymentsService.detail(id, request.user);
  }

  @Post('payments/:id/file')
  @RequirePermissions('finance.payment.update')
  @ApiConsumes('multipart/form-data')
  @UseFilters(FileUploadSizeExceptionFilter)
  @UseInterceptors(FileInterceptor('file', fileUploadInterceptorOptions()))
  uploadPaymentFile(
    @Param('id') id: string,
    @UploadedFile() file: { originalname: string; mimetype: string; size: number; buffer: Buffer } | undefined,
    @Req() request: { user?: RequestUser },
  ) {
    if (!file) throw new BadRequestException('Cần chọn file để tải lên');
    return this.paymentsService.uploadFile(id, file, request.user?.id, request.user);
  }

  @Delete('payments/:id/file')
  @RequirePermissions('finance.payment.update')
  deletePaymentFile(@Param('id') id: string, @Req() request: { user?: RequestUser }) {
    return this.paymentsService.deleteFile(id, request.user);
  }

  @Put('payments/:id')
  @RequirePermissions('finance.payment.update')
  updatePayment(@Param('id') id: string, @Body() dto: FinancePaymentBodyDto, @Req() request: { user?: RequestUser }) {
    return this.paymentsService.update(id, dto, request.user);
  }

  @Delete('payments/:id')
  @RequirePermissions('finance.payment.delete')
  deletePayment(@Param('id') id: string, @Req() request: { user?: RequestUser }) {
    return this.paymentsService.delete(id, request.user);
  }

  @Post('payments/:id/approve')
  @HttpCode(200)
  @RequirePermissions('finance.payment.approve')
  approvePayment(@Param('id') id: string, @Body() dto: FinanceDocumentActionDto, @Req() request: { user?: RequestUser }) {
    return this.paymentsService.approve(id, dto, request.user);
  }

  @Post('payments/:id/reject')
  @HttpCode(200)
  @RequirePermissions('finance.payment.approve')
  rejectPayment(@Param('id') id: string, @Body() dto: FinanceDocumentActionDto, @Req() request: { user?: RequestUser }) {
    return this.paymentsService.reject(id, dto, request.user);
  }

  @Post('payments/:id/cancel')
  @HttpCode(200)
  @RequirePermissions('finance.payment.approve')
  cancelPayment(@Param('id') id: string, @Body() dto: FinanceDocumentActionDto, @Req() request: { user?: RequestUser }) {
    return this.paymentsService.cancel(id, dto, request.user);
  }

  @Get('invoices')
  @RequirePermissions('finance.invoice.view')
  invoices(@Query() query: FinanceQueryDto, @Req() request: { user?: RequestUser }) {
    return this.invoicesService.list(query as Record<string, string>, request.user);
  }

  @Post('invoices')
  @RequirePermissions('finance.invoice.create')
  createInvoice(@Body() dto: FinanceInvoiceBodyDto, @Req() request: { user?: RequestUser }) {
    return this.invoicesService.create(dto, request.user);
  }

  @Get('invoices/export')
  @RequirePermissions('finance.invoice.export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="smarttour-finance-invoices.csv"')
  exportInvoices(@Query() query: FinanceQueryDto, @Req() request: { user?: RequestUser }) {
    return this.invoicesService.export(query as Record<string, string>, request.user);
  }

  @Get('invoices/:id')
  @RequirePermissions('finance.invoice.view')
  invoice(@Param('id') id: string, @Req() request: { user?: RequestUser }) {
    return this.invoicesService.detail(id, request.user);
  }

  @Post('invoices/:id/files')
  @RequirePermissions('finance.invoice.update')
  @ApiConsumes('multipart/form-data')
  @UseFilters(FileUploadSizeExceptionFilter)
  @UseInterceptors(FileInterceptor('file', fileUploadInterceptorOptions()))
  uploadInvoiceFile(
    @Param('id') id: string,
    @UploadedFile() file: { originalname: string; mimetype: string; size: number; buffer: Buffer } | undefined,
    @Req() request: { user?: RequestUser },
  ) {
    if (!file) throw new BadRequestException('Cần chọn file để tải lên');
    return this.invoicesService.uploadFile(id, file, request.user?.id, request.user);
  }

  @Delete('invoices/:id/files/:fileId')
  @RequirePermissions('finance.invoice.update')
  deleteInvoiceFile(@Param('id') id: string, @Param('fileId') fileId: string, @Req() request: { user?: RequestUser }) {
    return this.invoicesService.deleteFile(id, fileId, request.user);
  }

  @Put('invoices/:id')
  @RequirePermissions('finance.invoice.update')
  updateInvoice(@Param('id') id: string, @Body() dto: FinanceInvoiceBodyDto, @Req() request: { user?: RequestUser }) {
    return this.invoicesService.update(id, dto, request.user);
  }

  @Delete('invoices/:id')
  @RequirePermissions('finance.invoice.delete')
  deleteInvoice(@Param('id') id: string, @Req() request: { user?: RequestUser }) {
    return this.invoicesService.delete(id, request.user);
  }

  @Post('invoices/:id/approve')
  @HttpCode(200)
  @RequirePermissions('finance.invoice.approve')
  approveInvoice(@Param('id') id: string, @Body() dto: FinanceDocumentActionDto, @Req() request: { user?: RequestUser }) {
    return this.invoicesService.approve(id, dto, request.user);
  }

  @Post('invoices/:id/reject')
  @HttpCode(200)
  @RequirePermissions('finance.invoice.approve')
  rejectInvoice(@Param('id') id: string, @Body() dto: FinanceDocumentActionDto, @Req() request: { user?: RequestUser }) {
    return this.invoicesService.reject(id, dto, request.user);
  }

  @Post('invoices/:id/cancel')
  @HttpCode(200)
  @RequirePermissions('finance.invoice.approve')
  cancelInvoice(@Param('id') id: string, @Body() dto: FinanceDocumentActionDto, @Req() request: { user?: RequestUser }) {
    return this.invoicesService.cancel(id, dto, request.user);
  }

  @Get('debt/customers')
  @RequirePermissions('finance.debt.view')
  customerDebt(@Query() query: FinanceQueryDto, @Req() request: { user?: RequestUser }) {
    return this.ledgerService.customerDebt(query as Record<string, string>, request.user);
  }

  @Post('debt/customers/:customerId/adjustments')
  @RequirePermissions('finance.debt.adjust')
  createCustomerDebtAdjustment(@Param('customerId') customerId: string, @Body() dto: FinanceDebtAdjustmentDto, @Req() request: { user?: RequestUser }) {
    return this.ledgerService.createCustomerAdjustment(customerId, dto, request.user);
  }

  @Get('debt/suppliers')
  @RequirePermissions('finance.debt.view')
  supplierDebt(@Query() query: FinanceQueryDto, @Req() request: { user?: RequestUser }) {
    return this.ledgerService.supplierDebt(query as Record<string, string>, request.user);
  }

  @Post('debt/suppliers/:supplierId/adjustments')
  @RequirePermissions('finance.debt.adjust')
  createSupplierDebtAdjustment(@Param('supplierId') supplierId: string, @Body() dto: FinanceDebtAdjustmentDto, @Req() request: { user?: RequestUser }) {
    return this.ledgerService.createSupplierAdjustment(supplierId, dto, request.user);
  }

  @Get('cashflow')
  @RequirePermissions('finance.cashflow.view')
  cashflow(@Query() query: FinanceQueryDto, @Req() request: { user?: RequestUser }) {
    return this.cashflowService.list(query as Record<string, string>, request.user);
  }

  @Get('cashflow/export')
  @RequirePermissions('finance.cashflow.export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="smarttour-finance-cashflow.csv"')
  exportCashflow(@Query() query: FinanceQueryDto, @Req() request: { user?: RequestUser }) {
    return this.cashflowService.export(query as Record<string, string>, request.user);
  }

  private setExportHeaders(response: ServerResponse, contentType: string, filename: string) {
    response.setHeader('Content-Type', contentType);
    response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  }
}

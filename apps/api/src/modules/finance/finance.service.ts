import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { FinanceApprovalStatus, FinanceCashflowEntryType, FinanceInvoiceStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { applyWriteDataScope, branchDepartmentScopeWhere, RequestUser } from '../auth/data-scope';
import { FilesService } from '../files/files.service';
import { createPaymentReversalCashflow, createReceiptReversalCashflow, upsertPaymentCashflow, upsertReceiptCashflow } from './finance-cashflow-postings';
import { createInvoiceReversalCustomerLedger, createReceiptReversalCustomerLedger, upsertInvoiceCustomerLedger, upsertReceiptCustomerLedger } from './finance-customer-ledger';
import { assertCanApproveFinanceEntity, assertCanCancelFinanceEntity, assertCanRejectFinanceEntity } from './finance-final-state';
import { applyOrderPayment, applyOrderReceipt, resolveInvoiceCustomer, resolvePaymentSupplier, resolveReceiptCustomer } from './finance-order-links';
import { reconcileApprovedPayment, reconcileCancelledPayment } from './finance-payment-reconciliation';
import { hasMoneyChange, invoiceSummary, paymentSummary, receiptSummary } from './finance-rules';

type AnyRecord = Record<string, unknown>;
type ImportFile = { originalname: string; mimetype: string; size: number; buffer: Buffer };

@Injectable()
export class FinanceService {
  constructor(private readonly prisma: PrismaService, private readonly filesService: FilesService) {}

  async listReceipts(query: Record<string, string>, user?: RequestUser) {
    const where = branchDepartmentScopeWhere(this.receiptWhere(query), user);
    const rows = await this.prisma.financeReceipt.findMany({
      where,
      include: { orders: true },
      orderBy: [{ updatedAt: 'desc' }, { receiptCode: 'asc' }],
      take: this.take(query.take),
    });
    const summaryRows = await this.prisma.financeReceipt.findMany({ where });
    return { rows, summary: receiptSummary(summaryRows) };
  }

  async receiptDetail(id: string, user?: RequestUser) {
    const row = await this.prisma.financeReceipt.findFirst({ where: branchDepartmentScopeWhere({ id, deletedAt: null }, user), include: { orders: true, cashflowEntries: true } });
    if (!row) throw new NotFoundException('Receipt not found');
    return row;
  }

  async uploadReceiptFile(
    id: string,
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer } | undefined,
    actorId?: string,
    user?: RequestUser,
  ) {
    const current = await this.receiptDetail(id, user);
    const upload = await this.filesService.upload(file, `finance/receipts/${id}`, actorId);
    try {
      const updated = await this.prisma.financeReceipt.update({ where: { id }, data: { attachmentName: upload.fileName, attachmentUrl: upload.url } });
      const previousKey = this.objectKey(current.attachmentUrl);
      if (previousKey && previousKey !== upload.objectKey) await this.filesService.remove(previousKey).catch(() => undefined);
      return updated;
    } catch (error) {
      await this.filesService.remove(upload.objectKey).catch(() => undefined);
      throw error;
    }
  }

  async deleteReceiptFile(id: string, user?: RequestUser) {
    const current = await this.receiptDetail(id, user);
    const objectKey = this.objectKey(current.attachmentUrl);
    if (objectKey) await this.filesService.remove(objectKey);
    return this.prisma.financeReceipt.update({ where: { id }, data: { attachmentName: null, attachmentUrl: null } });
  }

  async createReceipt(dto: AnyRecord, user?: RequestUser) {
    dto = applyWriteDataScope(dto, user);
    return this.prisma.$transaction(async (tx) => {
      const receiptCode = this.text(dto.receiptCode) || await this.nextCode(tx, 'FINANCE_RECEIPT', 'PT', this.date(dto.paymentDate), this.text(dto.branch));
      const receipt = await tx.financeReceipt.create({ data: { ...this.receiptData({ ...dto, receiptCode }), orders: { create: this.receiptOrders(dto) } }, include: { orders: true } });
      await this.audit(tx, 'CREATE', 'FinanceReceipt', receipt.id, dto);
      return receipt;
    });
  }

  async updateReceipt(id: string, dto: AnyRecord, user?: RequestUser) {
    const current = await this.receiptDetail(id, user);
    dto = applyWriteDataScope(dto, user);
    if (current.approvalStatus === FinanceApprovalStatus.APPROVED && hasMoneyChange(dto)) {
      throw new BadRequestException('Approved receipt amount cannot be edited');
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.financeReceiptOrder.deleteMany({ where: { receiptId: id } });
      const receipt = await tx.financeReceipt.update({
        where: { id },
        data: { ...this.receiptData({ ...dto, receiptCode: this.text(dto.receiptCode) || current.receiptCode }), orders: { create: this.receiptOrders(dto) } },
        include: { orders: true },
      });
      await this.audit(tx, 'UPDATE', 'FinanceReceipt', id, dto);
      return receipt;
    });
  }

  async deleteReceipt(id: string, user?: RequestUser) {
    const current = await this.receiptDetail(id, user);
    if (current.approvalStatus === FinanceApprovalStatus.APPROVED) throw new BadRequestException('Approved receipt cannot be deleted');
    return this.prisma.financeReceipt.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async approveReceipt(id: string, dto: AnyRecord, user?: RequestUser) {
    const actor = this.text(dto.actor) || 'accounting';
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.financeReceipt.findFirst({ where: branchDepartmentScopeWhere({ id }, user), include: { orders: true } });
      if (!current) throw new NotFoundException('Receipt not found');
      assertCanApproveFinanceEntity(current, 'Receipt');
      const receipt = await tx.financeReceipt.update({
        where: { id },
        data: { approvalStatus: 'APPROVED', approvedBy: actor, approvedAt: new Date(), lockedAt: new Date() },
        include: { orders: true },
      });
      const customerId = await resolveReceiptCustomer(tx, receipt);
      await upsertReceiptCashflow(tx, receipt, customerId);
      await upsertReceiptCustomerLedger(tx, receipt, customerId, actor);
      for (const line of receipt.orders) {
        if (line.orderId) await applyOrderReceipt(tx, line.orderId, Number(line.amount));
      }
      await this.audit(tx, 'APPROVE', 'FinanceReceipt', id, { actor, note: this.text(dto.note) });
      return receipt;
    });
  }

  async rejectReceipt(id: string, dto: AnyRecord, user?: RequestUser) {
    return this.changeReceiptStatus(id, 'REJECTED', dto, user, 'Receipt');
  }

  async cancelReceipt(id: string, dto: AnyRecord, user?: RequestUser) {
    const actor = this.text(dto.actor) || 'accounting';
    const reason = this.text(dto.reason) || this.text(dto.note) || 'Cancel approved receipt';
    return this.prisma.$transaction(async (tx) => {
      const receipt = await tx.financeReceipt.findFirst({ where: branchDepartmentScopeWhere({ id }, user), include: { orders: true } });
      if (!receipt) throw new NotFoundException('Receipt not found');
      assertCanCancelFinanceEntity(receipt, 'Receipt');
      const reversalCode = await this.nextCode(tx, 'FINANCE_RECEIPT', 'PTDC', new Date(), receipt.branch || undefined);
      const reversal = await tx.financeReceipt.create({
        data: {
          receiptCode: reversalCode,
          receiptName: `Dao ${receipt.receiptCode}`,
          receiptType: receipt.receiptType,
          paymentDate: new Date(),
          paymentMethod: receipt.paymentMethod,
          customerId: receipt.customerId,
          payerName: receipt.payerName,
          payerPhone: receipt.payerPhone,
          payerEmail: receipt.payerEmail,
          payerAddress: receipt.payerAddress,
          reason,
          totalAmount: receipt.receiptAmount,
          receiptAmount: receipt.receiptAmount,
          approvalStatus: 'APPROVED',
          approvedBy: actor,
          approvedAt: new Date(),
          lockedAt: new Date(),
          reversalOfId: id,
          createdBy: actor,
        },
      });
      await tx.financeReceipt.update({ where: { id }, data: { approvalStatus: 'CANCELLED', cancelledBy: actor, cancelledAt: new Date(), cancelReason: reason } });
      const customerId = await resolveReceiptCustomer(tx, receipt);
      await createReceiptReversalCashflow(tx, receipt, reversal.id, customerId, actor, reason);
      await createReceiptReversalCustomerLedger(tx, receipt, reversal.id, customerId, reversalCode, reason, actor);
      for (const line of receipt.orders) {
        if (line.orderId) await applyOrderReceipt(tx, line.orderId, -Number(line.amount));
      }
      await this.audit(tx, 'CANCEL', 'FinanceReceipt', id, { actor, reason, reversalId: reversal.id });
      return tx.financeReceipt.findUnique({ where: { id }, include: { reversals: true } });
    });
  }

  async listPayments(query: Record<string, string>, user?: RequestUser) {
    const where = branchDepartmentScopeWhere(this.paymentWhere(query), user);
    const rows = await this.prisma.financePayment.findMany({
      where,
      include: {
        operationVoucher: { select: { voucherCode: true, status: true } },
        supplierPaymentRequests: { select: { code: true, status: true } },
      },
      orderBy: [{ updatedAt: 'desc' }, { voucherCode: 'asc' }],
      take: this.take(query.take),
    });
    const summaryRows = await this.prisma.financePayment.findMany({ where });
    return { rows, summary: paymentSummary(summaryRows) };
  }

  async paymentDetail(id: string, user?: RequestUser) {
    const row = await this.prisma.financePayment.findFirst({
      where: branchDepartmentScopeWhere({ id, deletedAt: null }, user),
      include: {
        cashflowEntries: true,
        operationVoucher: { select: { voucherCode: true, status: true } },
        supplierPaymentRequests: { select: { code: true, status: true } },
      },
    });
    if (!row) throw new NotFoundException('Payment not found');
    return row;
  }

  async uploadPaymentFile(
    id: string,
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer } | undefined,
    actorId?: string,
    user?: RequestUser,
  ) {
    const current = await this.paymentDetail(id, user);
    const upload = await this.filesService.upload(file, `finance/payments/${id}`, actorId);
    try {
      const updated = await this.prisma.financePayment.update({ where: { id }, data: { attachmentName: upload.fileName, attachmentUrl: upload.url } });
      const previousKey = this.objectKey(current.attachmentUrl);
      if (previousKey && previousKey !== upload.objectKey) await this.filesService.remove(previousKey).catch(() => undefined);
      return updated;
    } catch (error) {
      await this.filesService.remove(upload.objectKey).catch(() => undefined);
      throw error;
    }
  }

  async deletePaymentFile(id: string, user?: RequestUser) {
    const current = await this.paymentDetail(id, user);
    const objectKey = this.objectKey(current.attachmentUrl);
    if (objectKey) await this.filesService.remove(objectKey);
    return this.prisma.financePayment.update({ where: { id }, data: { attachmentName: null, attachmentUrl: null } });
  }

  async createPayment(dto: AnyRecord, user?: RequestUser) {
    dto = applyWriteDataScope(dto, user);
    return this.prisma.$transaction(async (tx) => {
      const voucherCode = this.text(dto.voucherCode) || await this.nextCode(tx, 'FINANCE_PAYMENT', 'PC', this.date(dto.paymentDate), this.text(dto.branch));
      const payment = await tx.financePayment.create({ data: this.paymentData({ ...dto, voucherCode }) });
      await this.audit(tx, 'CREATE', 'FinancePayment', payment.id, dto);
      return payment;
    });
  }

  async updatePayment(id: string, dto: AnyRecord, user?: RequestUser) {
    const current = await this.paymentDetail(id, user);
    dto = applyWriteDataScope(dto, user);
    if (current.approvalStatus === FinanceApprovalStatus.APPROVED && hasMoneyChange(dto)) {
      throw new BadRequestException('Approved payment amount cannot be edited');
    }
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.financePayment.update({ where: { id }, data: this.paymentData({ ...dto, voucherCode: this.text(dto.voucherCode) || current.voucherCode }) });
      await this.audit(tx, 'UPDATE', 'FinancePayment', id, dto);
      return payment;
    });
  }

  async deletePayment(id: string, user?: RequestUser) {
    const current = await this.paymentDetail(id, user);
    if (current.approvalStatus === FinanceApprovalStatus.APPROVED) throw new BadRequestException('Approved payment cannot be deleted');
    return this.prisma.financePayment.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async approvePayment(id: string, dto: AnyRecord, user?: RequestUser) {
    const actor = this.text(dto.actor) || 'accounting';
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.financePayment.findFirst({ where: branchDepartmentScopeWhere({ id }, user) });
      if (!current) throw new NotFoundException('Payment not found');
      assertCanApproveFinanceEntity(current, 'Payment');
      const payment = await tx.financePayment.update({
        where: { id },
        data: { approvalStatus: 'APPROVED', approvedBy: actor, approvedAt: new Date(), lockedAt: new Date() },
      });
      const supplierId = await resolvePaymentSupplier(tx, payment);
      await upsertPaymentCashflow(tx, payment, supplierId);
      if (supplierId) {
        await tx.supplierLedgerEntry.upsert({
          where: { sourceType_sourceId_entryType: { sourceType: 'FINANCE_PAYMENT', sourceId: id, entryType: 'DEBIT' } },
          create: {
            supplierId,
            paymentId: id,
            orderId: payment.orderId,
            operationVoucherId: payment.operationVoucherId,
            sourceType: 'FINANCE_PAYMENT',
            sourceId: id,
            entryType: 'DEBIT',
            debitAmount: payment.paymentAmount,
            documentCode: payment.voucherCode,
            documentDate: payment.paymentDate || new Date(),
            branch: payment.branch,
            department: payment.department,
            staff: payment.assignedStaff,
            description: payment.reason || payment.voucherName,
            createdBy: actor,
          },
          update: {
            supplierId,
            debitAmount: payment.paymentAmount,
            documentCode: payment.voucherCode,
            documentDate: payment.paymentDate || new Date(),
            branch: payment.branch,
            department: payment.department,
            staff: payment.assignedStaff,
            description: payment.reason || payment.voucherName,
          },
        });
      }
      if (payment.orderId) await applyOrderPayment(tx, payment.orderId, Number(payment.paymentAmount));
      await reconcileApprovedPayment(tx, payment);
      await this.audit(tx, 'APPROVE', 'FinancePayment', id, { actor, note: this.text(dto.note) });
      return payment;
    });
  }

  async rejectPayment(id: string, dto: AnyRecord, user?: RequestUser) {
    return this.changePaymentStatus(id, 'REJECTED', dto, user, 'Payment');
  }

  async cancelPayment(id: string, dto: AnyRecord, user?: RequestUser) {
    const actor = this.text(dto.actor) || 'accounting';
    const reason = this.text(dto.reason) || this.text(dto.note) || 'Cancel approved payment';
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.financePayment.findFirst({ where: branchDepartmentScopeWhere({ id }, user) });
      if (!payment) throw new NotFoundException('Payment not found');
      assertCanCancelFinanceEntity(payment, 'Payment');
      const reversalCode = await this.nextCode(tx, 'FINANCE_PAYMENT', 'PCDC', new Date(), payment.branch || undefined);
      const reversal = await tx.financePayment.create({
        data: { voucherCode: reversalCode, voucherName: `Dao ${payment.voucherCode}`, voucherType: payment.voucherType, paymentDate: new Date(), paymentMethod: payment.paymentMethod, supplierId: payment.supplierId, orderId: payment.orderId, receiverName: payment.receiverName, reason, totalAmount: payment.paymentAmount, paymentAmount: payment.paymentAmount, approvalStatus: 'APPROVED', approvedBy: actor, approvedAt: new Date(), lockedAt: new Date(), reversalOfId: id, createdBy: actor },
      });
      await tx.financePayment.update({ where: { id }, data: { approvalStatus: 'CANCELLED', cancelledBy: actor, cancelledAt: new Date(), cancelReason: reason } });
      const supplierId = await resolvePaymentSupplier(tx, payment);
      await createPaymentReversalCashflow(tx, payment, reversal.id, supplierId, actor, reason);
      if (supplierId) {
        const original = await tx.supplierLedgerEntry.findUnique({ where: { sourceType_sourceId_entryType: { sourceType: 'FINANCE_PAYMENT', sourceId: id, entryType: 'DEBIT' } } });
        await tx.supplierLedgerEntry.create({ data: { supplierId, paymentId: reversal.id, orderId: payment.orderId, operationVoucherId: payment.operationVoucherId, sourceType: 'FINANCE_PAYMENT', sourceId: reversal.id, entryType: 'REVERSAL', creditAmount: payment.paymentAmount, documentCode: reversalCode, documentDate: new Date(), description: reason, reversedEntryId: original?.id, createdBy: actor } });
      }
      if (payment.orderId) await applyOrderPayment(tx, payment.orderId, -Number(payment.paymentAmount));
      await reconcileCancelledPayment(tx, payment);
      await this.audit(tx, 'CANCEL', 'FinancePayment', id, { actor, reason, reversalId: reversal.id });
      return tx.financePayment.findUnique({ where: { id }, include: { reversals: true } });
    });
  }

  async listInvoices(query: Record<string, string>) {
    const where = this.invoiceWhere(query);
    const rows = await this.prisma.financeInvoice.findMany({ where, include: { items: true, files: true }, orderBy: [{ updatedAt: 'desc' }, { invoiceCode: 'asc' }], take: this.take(query.take) });
    const summaryRows = await this.prisma.financeInvoice.findMany({ where });
    return { rows, summary: invoiceSummary(summaryRows) };
  }

  async invoiceDetail(id: string) {
    const row = await this.prisma.financeInvoice.findFirst({ where: { id, deletedAt: null }, include: { items: true, files: true } });
    if (!row) throw new NotFoundException('Invoice not found');
    return row;
  }

  async uploadInvoiceFile(
    id: string,
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer } | undefined,
    actorId?: string,
  ) {
    await this.invoiceDetail(id);
    const upload = await this.filesService.upload(file, `finance/invoices/${id}`, actorId);
    try {
      return await this.prisma.financeInvoiceFile.create({
        data: { invoiceId: id, fileName: upload.fileName, fileUrl: upload.url, fileType: upload.mimeType, uploadedBy: actorId },
      });
    } catch (error) {
      await this.filesService.remove(upload.objectKey).catch(() => undefined);
      throw error;
    }
  }

  async deleteInvoiceFile(id: string, fileId: string) {
    await this.invoiceDetail(id);
    const file = await this.prisma.financeInvoiceFile.findFirst({ where: { id: fileId, invoiceId: id } });
    if (!file) throw new NotFoundException('Invoice file not found');
    const objectKey = this.objectKey(file.fileUrl);
    if (objectKey) await this.filesService.remove(objectKey);
    return this.prisma.financeInvoiceFile.delete({ where: { id: fileId } });
  }

  async createInvoice(dto: AnyRecord) {
    return this.prisma.$transaction(async (tx) => {
      const invoiceCode = this.text(dto.invoiceCode) || await this.nextCode(tx, 'FINANCE_INVOICE', 'VAT', this.date(dto.issuedDate), this.text(dto.branch));
      const calculated = this.invoiceData(dto);
      const invoice = await tx.financeInvoice.create({ data: { ...calculated, invoiceCode, items: { create: this.invoiceItems(dto) } }, include: { items: true } });
      await this.audit(tx, 'CREATE', 'FinanceInvoice', invoice.id, dto);
      return invoice;
    });
  }

  async updateInvoice(id: string, dto: AnyRecord) {
    const current = await this.invoiceDetail(id);
    if (current.approvalStatus === FinanceApprovalStatus.APPROVED && hasMoneyChange(dto)) throw new BadRequestException('Approved invoice amount cannot be edited');
    return this.prisma.$transaction(async (tx) => {
      await tx.financeInvoiceItem.deleteMany({ where: { invoiceId: id } });
      const invoice = await tx.financeInvoice.update({ where: { id }, data: { ...this.invoiceData({ ...dto, invoiceCode: this.text(dto.invoiceCode) || current.invoiceCode }), items: { create: this.invoiceItems(dto) } }, include: { items: true } });
      await this.audit(tx, 'UPDATE', 'FinanceInvoice', id, dto);
      return invoice;
    });
  }

  async deleteInvoice(id: string) {
    const current = await this.invoiceDetail(id);
    if (current.approvalStatus === FinanceApprovalStatus.APPROVED) throw new BadRequestException('Approved invoice cannot be deleted');
    return this.prisma.financeInvoice.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async approveInvoice(id: string, dto: AnyRecord) {
    const actor = this.text(dto.actor) || 'accounting';
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.financeInvoice.findUnique({ where: { id } });
      if (!current) throw new NotFoundException('Invoice not found');
      assertCanApproveFinanceEntity(current, 'Invoice');
      const invoice = await tx.financeInvoice.update({ where: { id }, data: { status: 'APPROVED', approvalStatus: 'APPROVED', approvedBy: actor, approvedAt: new Date() } });
      const customerId = await resolveInvoiceCustomer(tx, invoice);
      await upsertInvoiceCustomerLedger(tx, invoice, customerId, actor);
      await this.audit(tx, 'APPROVE', 'FinanceInvoice', id, { actor, note: this.text(dto.note) });
      return invoice;
    });
  }

  async rejectInvoice(id: string, dto: AnyRecord) {
    const actor = this.text(dto.actor) || 'accounting';
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.financeInvoice.findUnique({ where: { id } });
      if (!current) throw new NotFoundException('Invoice not found');
      assertCanRejectFinanceEntity(current, 'Invoice');
      const invoice = await tx.financeInvoice.update({ where: { id }, data: { status: 'REJECTED', approvalStatus: 'REJECTED', approvedBy: actor, approvedAt: new Date() } });
      await this.audit(tx, 'REJECT', 'FinanceInvoice', id, { actor, note: this.text(dto.note) });
      return invoice;
    });
  }

  async cancelInvoice(id: string, dto: AnyRecord) {
    const actor = this.text(dto.actor) || 'accounting';
    const reason = this.text(dto.reason) || this.text(dto.note) || 'Cancel approved invoice';
    return this.prisma.$transaction(async (tx) => {
      const invoice = await tx.financeInvoice.findUnique({ where: { id } });
      if (!invoice) throw new NotFoundException('Invoice not found');
      assertCanCancelFinanceEntity(invoice, 'Invoice');
      const reversalCode = await this.nextCode(tx, 'FINANCE_INVOICE', 'VATDC', new Date(), undefined);
      const reversal = await tx.financeInvoice.create({
        data: { invoiceCode: reversalCode, systemCode: invoice.systemCode, orderId: invoice.orderId, receiptId: invoice.receiptId, customerId: invoice.customerId, customerName: invoice.customerName, customerPhone: invoice.customerPhone, customerEmail: invoice.customerEmail, invoiceType: 'ADJUSTMENT', issuedDate: new Date(), totalBeforeTax: invoice.totalBeforeTax, totalTax: invoice.totalTax, totalAfterTax: invoice.totalAfterTax, amountInWords: invoice.amountInWords, status: 'APPROVED', approvalStatus: 'APPROVED', approvedBy: actor, approvedAt: new Date(), reversalOfId: id, note: reason, createdBy: actor },
      });
      await tx.financeInvoice.update({ where: { id }, data: { status: 'CANCELLED', approvalStatus: 'CANCELLED', cancelledBy: actor, cancelledAt: new Date(), cancelReason: reason } });
      const customerId = await resolveInvoiceCustomer(tx, invoice);
      await createInvoiceReversalCustomerLedger(tx, invoice, reversal.id, customerId, reversalCode, reason, actor);
      await this.audit(tx, 'CANCEL', 'FinanceInvoice', id, { actor, reason, reversalId: reversal.id });
      return tx.financeInvoice.findUnique({ where: { id }, include: { reversals: true } });
    });
  }

  async cashflow(query: Record<string, string>, user?: RequestUser) {
    const where = branchDepartmentScopeWhere(this.cashflowWhere(query), user);
    const rows = await this.prisma.financeCashflowEntry.findMany({ where, orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }], take: this.take(query.take) });
    const totalReceipt = rows.filter((row) => row.entryType === 'RECEIPT').reduce((sum, row) => sum + Number(row.amount), 0);
    const totalPayment = rows.filter((row) => row.entryType === 'PAYMENT').reduce((sum, row) => sum + Number(row.amount), 0);
    const byMethod = rows.reduce((map, row) => {
      const current = map.get(row.paymentMethod) || { method: row.paymentMethod, receipt: 0, payment: 0 };
      if (row.entryType === 'RECEIPT') current.receipt += Number(row.amount);
      else current.payment += Number(row.amount);
      map.set(row.paymentMethod, current);
      return map;
    }, new Map<string, { method: string; receipt: number; payment: number }>());
    return { rows, summary: { totalReceipt, totalPayment, netCashflow: totalReceipt - totalPayment, byMethod: Array.from(byMethod.values()) } };
  }

  async exportReceipts(query: Record<string, string>, user?: RequestUser) {
    const { rows } = await this.listReceipts({ ...query, take: '1000' }, user);
    return this.csv(rows, ['receiptCode', 'receiptName', 'receiptType', 'paymentDate', 'paymentMethod', 'payerName', 'payerPhone', 'totalAmount', 'paidBefore', 'receiptAmount', 'remainingAmount', 'approvalStatus', 'branch', 'assignedStaff']);
  }

  async exportPayments(query: Record<string, string>, user?: RequestUser) {
    const { rows } = await this.listPayments({ ...query, take: '1000' }, user);
    return this.csv(rows, ['voucherCode', 'voucherName', 'voucherType', 'paymentDate', 'paymentMethod', 'receiverName', 'receiverPhone', 'totalAmount', 'paymentAmount', 'remainingAmount', 'approvalStatus', 'branch', 'assignedStaff']);
  }

  async exportInvoices(query: Record<string, string>) {
    const { rows } = await this.listInvoices({ ...query, take: '1000' });
    return this.csv(rows, ['invoiceCode', 'invoiceNumber', 'customerName', 'taxCode', 'companyName', 'tourCode', 'tourName', 'issuedDate', 'totalBeforeTax', 'totalTax', 'totalAfterTax', 'invoiceType', 'taxAuthorityCode', 'approvalStatus']);
  }

  async exportCashflow(query: Record<string, string>, user?: RequestUser) {
    const { rows } = await this.cashflow({ ...query, take: '2000' }, user);
    return this.csv(rows, ['sourceType', 'entryType', 'amount', 'paymentMethod', 'paymentDate', 'branch', 'department', 'staff', 'orderId', 'supplierId', 'customerId', 'note']);
  }

  async customerDebt(query: Record<string, string>, user?: RequestUser) {
    const where = branchDepartmentScopeWhere<Prisma.CustomerLedgerEntryWhereInput>({
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.from || query.to ? { documentDate: { gte: this.date(query.from), lte: this.date(query.to) } } : {}),
    }, user);
    const entries = await this.prisma.customerLedgerEntry.findMany({ where, include: { customer: true, order: true, receipt: true, invoice: true }, orderBy: [{ documentDate: 'desc' }, { createdAt: 'desc' }], take: this.take(query.take) });
    return { rows: this.customerDebtRows(entries), entries, summary: this.ledgerSummary(entries) };
  }

  async supplierDebt(query: Record<string, string>, user?: RequestUser) {
    const where = branchDepartmentScopeWhere<Prisma.SupplierLedgerEntryWhereInput>({
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(query.from || query.to ? { documentDate: { gte: this.date(query.from), lte: this.date(query.to) } } : {}),
    }, user);
    const entries = await this.prisma.supplierLedgerEntry.findMany({ where, include: { supplier: true, order: true, operationVoucher: true, payment: true }, orderBy: [{ documentDate: 'desc' }, { createdAt: 'desc' }], take: this.take(query.take) });
    return { rows: this.supplierDebtRows(entries), entries, summary: this.supplierLedgerSummary(entries) };
  }

  async createCustomerDebtAdjustment(customerId: string, dto: AnyRecord, user?: RequestUser) {
    const customer = await this.prisma.customer.findFirst({ where: branchDepartmentScopeWhere({ id: customerId, mergedIntoId: null }, user), select: { id: true } });
    if (!customer) throw new NotFoundException('Customer not found');
    const scoped = applyWriteDataScope(dto as AnyRecord & { branch?: string | null; department?: string | null }, user);
    const direction = this.adjustmentDirection(dto);
    const amount = this.adjustmentAmount(dto);
    const actor = this.text(dto.actor) || user?.username || user?.email || 'accounting';
    return this.prisma.$transaction(async (tx) => {
      const entry = await tx.customerLedgerEntry.create({
        data: {
          customerId,
          sourceType: 'MANUAL',
          sourceId: randomUUID(),
          entryType: 'ADJUSTMENT',
          debitAmount: direction === 'INCREASE' ? amount : 0,
          creditAmount: direction === 'DECREASE' ? amount : 0,
          documentCode: this.text(dto.documentCode) || this.code('DCCUS'),
          documentDate: this.date(dto.documentDate) || new Date(),
          dueDate: this.date(dto.dueDate),
          branch: this.text(scoped.branch),
          department: this.text(scoped.department),
          staff: actor,
          description: this.text(dto.description) || this.text(dto.note) || 'Điều chỉnh công nợ khách hàng',
          createdBy: actor,
        },
      });
      await this.audit(tx, 'ADJUST', 'CustomerLedgerEntry', entry.id, { customerId, direction, amount, actor });
      return entry;
    });
  }

  async createSupplierDebtAdjustment(supplierId: string, dto: AnyRecord, user?: RequestUser) {
    const supplier = await this.prisma.supplier.findFirst({ where: { id: supplierId, deletedAt: null }, select: { id: true } });
    if (!supplier) throw new NotFoundException('Supplier not found');
    const scoped = applyWriteDataScope(dto as AnyRecord & { branch?: string | null; department?: string | null }, user);
    const direction = this.adjustmentDirection(dto);
    const amount = this.adjustmentAmount(dto);
    const actor = this.text(dto.actor) || user?.username || user?.email || 'accounting';
    return this.prisma.$transaction(async (tx) => {
      const entry = await tx.supplierLedgerEntry.create({
        data: {
          supplierId,
          sourceType: 'MANUAL',
          sourceId: randomUUID(),
          entryType: 'ADJUSTMENT',
          debitAmount: direction === 'DECREASE' ? amount : 0,
          creditAmount: direction === 'INCREASE' ? amount : 0,
          documentCode: this.text(dto.documentCode) || this.code('DCNCC'),
          documentDate: this.date(dto.documentDate) || new Date(),
          dueDate: this.date(dto.dueDate),
          branch: this.text(scoped.branch),
          department: this.text(scoped.department),
          staff: actor,
          description: this.text(dto.description) || this.text(dto.note) || 'Điều chỉnh công nợ nhà cung cấp',
          createdBy: actor,
        },
      });
      await this.audit(tx, 'ADJUST', 'SupplierLedgerEntry', entry.id, { supplierId, direction, amount, actor });
      return entry;
    });
  }

  async importReceipts(dto: AnyRecord, file?: ImportFile, user?: RequestUser) {
    const rows = this.financeImportRows(dto, file).map((row, index) => this.validateReceiptImportRow(row, index + 2));
    await this.assertImportCodesAvailable('receipts', rows, 'receiptCode');
    return this.prisma.$transaction(async (tx) => {
      const imported = [];
      for (const rawRow of rows) {
        const row = applyWriteDataScope(rawRow as AnyRecord & { branch?: string | null; department?: string | null }, user);
        const receiptCode = this.text(row.receiptCode) || await this.nextCode(tx, 'FINANCE_RECEIPT', 'PT', this.date(row.paymentDate), this.text(row.branch));
        const receipt = await tx.financeReceipt.create({ data: { ...this.receiptData({ ...row, receiptCode }), orders: { create: this.receiptOrders(row) } }, include: { orders: true } });
        await this.audit(tx, 'IMPORT', 'FinanceReceipt', receipt.id, { source: file?.originalname || 'rows' });
        imported.push(receipt);
      }
      return { type: 'receipts', imported: imported.length, rows: imported };
    });
  }

  async importPayments(dto: AnyRecord, file?: ImportFile, user?: RequestUser) {
    const rows = this.financeImportRows(dto, file).map((row, index) => this.validatePaymentImportRow(row, index + 2));
    await this.assertImportCodesAvailable('payments', rows, 'voucherCode');
    return this.prisma.$transaction(async (tx) => {
      const imported = [];
      for (const rawRow of rows) {
        const row = applyWriteDataScope(rawRow as AnyRecord & { branch?: string | null; department?: string | null }, user);
        const voucherCode = this.text(row.voucherCode) || await this.nextCode(tx, 'FINANCE_PAYMENT', 'PC', this.date(row.paymentDate), this.text(row.branch));
        const payment = await tx.financePayment.create({ data: { ...this.paymentData({ ...row, voucherCode }) } });
        await this.audit(tx, 'IMPORT', 'FinancePayment', payment.id, { source: file?.originalname || 'rows' });
        imported.push(payment);
      }
      return { type: 'payments', imported: imported.length, rows: imported };
    });
  }

  private objectKey(fileUrl?: string | null) {
    return fileUrl ? new URL(fileUrl, 'http://smarttour.local').searchParams.get('key') : null;
  }

  private receiptData(dto: AnyRecord): Prisma.FinanceReceiptUncheckedCreateInput {
    const total = this.decimal(dto.totalAmount);
    const paidBefore = this.decimal(dto.paidBefore);
    const receiptAmount = this.decimal(dto.receiptAmount);
    return {
      receiptCode: this.text(dto.receiptCode) || this.code('PT'),
      receiptName: this.text(dto.receiptName) || 'Phieu thu',
      receiptType: (this.text(dto.receiptType) || 'TOUR_PAYMENT') as never,
      documentDate: this.date(dto.documentDate),
      transferDate: this.date(dto.transferDate),
      paymentDate: this.date(dto.paymentDate),
      paymentMethod: (this.text(dto.paymentMethod) || 'BANK_TRANSFER') as never,
      customerId: this.text(dto.customerId),
      payerName: this.text(dto.payerName),
      payerPhone: this.text(dto.payerPhone),
      payerEmail: this.text(dto.payerEmail),
      payerAddress: this.text(dto.payerAddress),
      reason: this.text(dto.reason),
      partnerName: this.text(dto.partnerName),
      note: this.text(dto.note),
      totalAmount: total,
      paidBefore,
      receiptAmount,
      remainingAmount: Math.max(total - paidBefore - receiptAmount, 0),
      approvalStatus: (this.text(dto.approvalStatus) || 'DRAFT') as never,
      branch: this.text(dto.branch),
      department: this.text(dto.department),
      assignedStaff: this.text(dto.assignedStaff),
      approvedBy: this.text(dto.approvedBy),
      collectorSupplier: this.text(dto.collectorSupplier),
      follower: this.text(dto.follower),
      tourCreator: this.text(dto.tourCreator),
      attachmentName: this.text(dto.attachmentName),
      attachmentUrl: this.text(dto.attachmentUrl),
      createdBy: this.text(dto.createdBy),
    };
  }

  private receiptOrders(dto: AnyRecord) {
    const rows = Array.isArray(dto.orders) ? dto.orders as AnyRecord[] : [];
    return rows.filter((row) => this.decimal(row.amount) > 0).map((row) => ({
      orderId: this.text(row.orderId),
      orderCode: this.text(row.orderCode),
      tourCode: this.text(row.tourCode),
      tourName: this.text(row.tourName),
      amount: this.decimal(row.amount),
    }));
  }

  private paymentData(dto: AnyRecord): Prisma.FinancePaymentUncheckedCreateInput {
    const total = this.decimal(dto.totalAmount);
    const amount = this.decimal(dto.paymentAmount);
    return {
      voucherCode: this.text(dto.voucherCode) || this.code('PC'),
      voucherName: this.text(dto.voucherName),
      voucherType: (this.text(dto.voucherType) || 'SUPPLIER_PAYMENT') as never,
      documentDate: this.date(dto.documentDate),
      transferDate: this.date(dto.transferDate),
      paymentDate: this.date(dto.paymentDate),
      paymentMethod: (this.text(dto.paymentMethod) || 'BANK_TRANSFER') as never,
      supplierId: this.text(dto.supplierId),
      operationVoucherId: this.text(dto.operationVoucherId),
      orderId: this.text(dto.orderId),
      receiverName: this.text(dto.receiverName),
      receiverPhone: this.text(dto.receiverPhone),
      receiverEmail: this.text(dto.receiverEmail),
      receiverAddress: this.text(dto.receiverAddress),
      reason: this.text(dto.reason),
      partnerName: this.text(dto.partnerName),
      note: this.text(dto.note),
      totalAmount: total,
      paymentAmount: amount,
      remainingAmount: Math.max(total - amount, 0),
      bankAccountName: this.text(dto.bankAccountName),
      bankAccountNumber: this.text(dto.bankAccountNumber),
      bankName: this.text(dto.bankName),
      isSupplierDeposit: Boolean(dto.isSupplierDeposit),
      approvalStatus: (this.text(dto.approvalStatus) || 'DRAFT') as never,
      branch: this.text(dto.branch),
      department: this.text(dto.department),
      assignedStaff: this.text(dto.assignedStaff),
      approvedBy: this.text(dto.approvedBy),
      follower: this.text(dto.follower),
      attachmentName: this.text(dto.attachmentName),
      attachmentUrl: this.text(dto.attachmentUrl),
      createdBy: this.text(dto.createdBy),
    };
  }

  private invoiceData(dto: AnyRecord): Prisma.FinanceInvoiceUncheckedCreateInput {
    const items = this.invoiceItems(dto);
    const totalBeforeTax = items.reduce((sum, row) => sum + Number(row.amountBeforeTax), 0);
    const totalTax = items.reduce((sum, row) => sum + Number(row.taxAmount), 0);
    const totalAfterTax = items.reduce((sum, row) => sum + Number(row.amountAfterTax), 0);
    const byRate = (rate: number, field: 'amountBeforeTax' | 'taxAmount') => items.filter((row) => Number(row.taxRate) === rate).reduce((sum, row) => sum + Number(row[field]), 0);
    return {
      invoiceCode: this.text(dto.invoiceCode) || this.code('VAT'),
      systemCode: this.text(dto.systemCode),
      orderId: this.text(dto.orderId),
      receiptId: this.text(dto.receiptId),
      customerId: this.text(dto.customerId),
      customerName: this.text(dto.customerName),
      customerPhone: this.text(dto.customerPhone),
      customerEmail: this.text(dto.customerEmail),
      citizenId: this.text(dto.citizenId),
      paymentMethod: (this.text(dto.paymentMethod) || 'BANK_TRANSFER') as never,
      taxCode: this.text(dto.taxCode),
      companyName: this.text(dto.companyName),
      companyAddress: this.text(dto.companyAddress),
      bankAccountNumber: this.text(dto.bankAccountNumber),
      bankName: this.text(dto.bankName),
      invoiceType: (this.text(dto.invoiceType) || 'VAT') as never,
      taxAuthorityCode: this.text(dto.taxAuthorityCode),
      invoiceNumber: this.text(dto.invoiceNumber),
      invoiceDate: this.date(dto.invoiceDate),
      issuedDate: this.date(dto.issuedDate),
      emailSentDate: this.date(dto.emailSentDate),
      tourCode: this.text(dto.tourCode),
      tourName: this.text(dto.tourName),
      checkinDate: this.date(dto.checkinDate),
      checkoutDate: this.date(dto.checkoutDate),
      totalBeforeTax,
      totalTax,
      totalAfterTax,
      tax0Total: byRate(0, 'amountBeforeTax'),
      tax5Total: byRate(5, 'amountBeforeTax'),
      tax8Total: byRate(8, 'amountBeforeTax'),
      tax10Total: byRate(10, 'amountBeforeTax'),
      vat5Total: byRate(5, 'taxAmount'),
      vat8Total: byRate(8, 'taxAmount'),
      vat10Total: byRate(10, 'taxAmount'),
      amountInWords: this.text(dto.amountInWords) || `${Math.round(totalAfterTax).toLocaleString('vi-VN')} VND`,
      status: (this.text(dto.status) || 'DRAFT') as never,
      approvalStatus: (this.text(dto.approvalStatus) || 'DRAFT') as never,
      note: this.text(dto.note),
      createdBy: this.text(dto.createdBy),
    };
  }

  private invoiceItems(dto: AnyRecord): Prisma.FinanceInvoiceItemUncheckedCreateWithoutInvoiceInput[] {
    const rows = Array.isArray(dto.items) ? dto.items as AnyRecord[] : [];
    return rows.filter((row) => this.text(row.itemName)).map((row, index) => {
      const quantity = this.decimal(row.quantity) || 1;
      const unitPrice = this.decimal(row.unitPrice);
      const taxRate = this.decimal(row.taxRate);
      const amountBeforeTax = quantity * unitPrice;
      const taxAmount = amountBeforeTax * taxRate / 100;
      return {
        itemName: this.text(row.itemName) || 'Dich vu',
        unit: this.text(row.unit),
        quantity,
        unitPrice,
        amountBeforeTax,
        taxRate,
        taxAmount,
        amountAfterTax: amountBeforeTax + taxAmount,
        sortOrder: index,
      };
    });
  }

  private async changeReceiptStatus(id: string, status: FinanceApprovalStatus, dto: AnyRecord, user?: RequestUser, label = 'Receipt') {
    const actor = this.text(dto.actor) || 'accounting';
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.financeReceipt.findFirst({ where: branchDepartmentScopeWhere({ id }, user), select: { id: true, approvalStatus: true, cancelledAt: true } });
      if (!current) throw new NotFoundException('Receipt not found');
      if (status === 'REJECTED') assertCanRejectFinanceEntity(current, label);
      const receipt = await tx.financeReceipt.update({ where: { id }, data: { approvalStatus: status, approvedBy: actor, approvedAt: new Date() } });
      await this.audit(tx, status === 'REJECTED' ? 'REJECT' : 'STATUS', 'FinanceReceipt', id, { actor, status, note: this.text(dto.note) });
      return receipt;
    });
  }

  private async changePaymentStatus(id: string, status: FinanceApprovalStatus, dto: AnyRecord, user?: RequestUser, label = 'Payment') {
    const actor = this.text(dto.actor) || 'accounting';
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.financePayment.findFirst({ where: branchDepartmentScopeWhere({ id }, user), select: { id: true, approvalStatus: true, cancelledAt: true } });
      if (!current) throw new NotFoundException('Payment not found');
      if (status === 'REJECTED') assertCanRejectFinanceEntity(current, label);
      const payment = await tx.financePayment.update({ where: { id }, data: { approvalStatus: status, approvedBy: actor, approvedAt: new Date() } });
      await this.audit(tx, status === 'REJECTED' ? 'REJECT' : 'STATUS', 'FinancePayment', id, { actor, status, note: this.text(dto.note) });
      return payment;
    });
  }

  private receiptWhere(query: Record<string, string>): Prisma.FinanceReceiptWhereInput {
    return {
      deletedAt: null,
      ...(query.status ? { approvalStatus: query.status as never } : {}),
      ...(query.receiptType ? { receiptType: query.receiptType as never } : {}),
      ...(query.paymentMethod ? { paymentMethod: query.paymentMethod as never } : {}),
      ...(query.branch ? { branch: { contains: query.branch, mode: 'insensitive' } } : {}),
      ...(query.assignedStaff ? { assignedStaff: { contains: query.assignedStaff, mode: 'insensitive' } } : {}),
      ...(query.minAmount || query.maxAmount ? { receiptAmount: { gte: this.decimalOrUndefined(query.minAmount), lte: this.decimalOrUndefined(query.maxAmount) } } : {}),
      ...(query.search ? { OR: [{ receiptCode: { contains: query.search, mode: 'insensitive' } }, { receiptName: { contains: query.search, mode: 'insensitive' } }, { payerName: { contains: query.search, mode: 'insensitive' } }, { payerPhone: { contains: query.search, mode: 'insensitive' } }, { payerEmail: { contains: query.search, mode: 'insensitive' } }, { orders: { some: { tourCode: { contains: query.search, mode: 'insensitive' } } } }] } : {}),
      ...this.dateRange('paymentDate', query.from, query.to),
    };
  }

  private paymentWhere(query: Record<string, string>): Prisma.FinancePaymentWhereInput {
    return {
      deletedAt: null,
      ...(query.status ? { approvalStatus: query.status as never } : {}),
      ...(query.voucherType ? { voucherType: query.voucherType as never } : {}),
      ...(query.paymentMethod ? { paymentMethod: query.paymentMethod as never } : {}),
      ...(query.branch ? { branch: { contains: query.branch, mode: 'insensitive' } } : {}),
      ...(query.assignedStaff ? { assignedStaff: { contains: query.assignedStaff, mode: 'insensitive' } } : {}),
      ...(query.minAmount || query.maxAmount ? { paymentAmount: { gte: this.decimalOrUndefined(query.minAmount), lte: this.decimalOrUndefined(query.maxAmount) } } : {}),
      ...(query.search ? { OR: [{ voucherCode: { contains: query.search, mode: 'insensitive' } }, { voucherName: { contains: query.search, mode: 'insensitive' } }, { receiverName: { contains: query.search, mode: 'insensitive' } }, { receiverPhone: { contains: query.search, mode: 'insensitive' } }, { receiverEmail: { contains: query.search, mode: 'insensitive' } }] } : {}),
      ...this.dateRange('paymentDate', query.from, query.to),
    };
  }

  private invoiceWhere(query: Record<string, string>): Prisma.FinanceInvoiceWhereInput {
    return {
      deletedAt: null,
      ...(query.status ? { approvalStatus: query.status as never } : {}),
      ...(query.invoiceType ? { invoiceType: query.invoiceType as never } : {}),
      ...(query.minAmount || query.maxAmount ? { totalAfterTax: { gte: this.decimalOrUndefined(query.minAmount), lte: this.decimalOrUndefined(query.maxAmount) } } : {}),
      ...(query.search ? { OR: [{ invoiceCode: { contains: query.search, mode: 'insensitive' } }, { invoiceNumber: { contains: query.search, mode: 'insensitive' } }, { systemCode: { contains: query.search, mode: 'insensitive' } }, { taxCode: { contains: query.search, mode: 'insensitive' } }, { customerName: { contains: query.search, mode: 'insensitive' } }, { customerPhone: { contains: query.search, mode: 'insensitive' } }, { note: { contains: query.search, mode: 'insensitive' } }] } : {}),
      ...this.dateRange('issuedDate', query.from, query.to),
    };
  }

  private cashflowWhere(query: Record<string, string>): Prisma.FinanceCashflowEntryWhereInput {
    return {
      ...(query.entryType ? { entryType: query.entryType as never } : {}),
      ...(query.paymentMethod ? { paymentMethod: query.paymentMethod as never } : {}),
      ...(query.branch ? { branch: { contains: query.branch, mode: 'insensitive' } } : {}),
      ...(query.department ? { department: { contains: query.department, mode: 'insensitive' } } : {}),
      ...(query.staff ? { staff: { contains: query.staff, mode: 'insensitive' } } : {}),
      ...this.dateRange('paymentDate', query.from, query.to),
    };
  }

  private async audit(tx: Prisma.TransactionClient, action: string, entity: string, entityId: string, metadata: unknown) {
    await tx.auditLog.create({ data: { action, entity, entityId, metadata: metadata as Prisma.InputJsonValue } });
  }

  private dateRange(field: 'paymentDate' | 'issuedDate', from?: string, to?: string) {
    if (!from && !to) return {};
    return { [field]: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } };
  }

  private csv(rows: AnyRecord[], keys: string[]) {
    return [keys.join(','), ...rows.map((row) => keys.map((key) => this.csvCell(row[key])).join(','))].join('\n');
  }

  private csvCell(value: unknown) {
    if (value instanceof Date) return value.toISOString();
    return `"${String(value ?? '').replaceAll('"', '""')}"`;
  }

  private financeImportRows(dto: AnyRecord, file?: ImportFile) {
    let rows: unknown[];
    if (file) {
      const isCsv = file.originalname.toLowerCase().endsWith('.csv') || ['text/csv', 'application/vnd.ms-excel'].includes(file.mimetype.toLowerCase());
      if (!isCsv) throw new BadRequestException('Chỉ hỗ trợ import CSV. XLSX cần được xuất thành CSV trước khi tải lên.');
      rows = this.parseCsv(file.buffer.toString('utf8'));
    } else if (Array.isArray(dto.rows)) {
      rows = dto.rows;
    } else if (typeof dto.csv === 'string') {
      rows = this.parseCsv(dto.csv);
    } else {
      throw new BadRequestException('Cần tải lên file CSV hoặc gửi mảng rows');
    }
    if (!rows.length) throw new BadRequestException('File import không có dòng dữ liệu');
    if (rows.length > 500) throw new BadRequestException('Mỗi lần chỉ được import tối đa 500 dòng');
    if (rows.some((row) => !row || typeof row !== 'object' || Array.isArray(row))) throw new BadRequestException('Dữ liệu import không hợp lệ');
    return rows as AnyRecord[];
  }

  private parseCsv(value: string) {
    const csv = value.replace(/^\uFEFF/, '');
    const firstLine = csv.split(/\r?\n/, 1)[0] || '';
    const delimiter = firstLine.includes(',') ? ',' : firstLine.includes(';') ? ';' : ',';
    const lines: string[][] = [];
    let row: string[] = [];
    let cell = '';
    let quoted = false;
    for (let index = 0; index < csv.length; index += 1) {
      const character = csv[index];
      if (quoted) {
        if (character === '"' && csv[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else if (character === '"') {
          quoted = false;
        } else {
          cell += character;
        }
      } else if (character === '"') {
        quoted = true;
      } else if (character === delimiter) {
        row.push(cell);
        cell = '';
      } else if (character === '\n') {
        row.push(cell.replace(/\r$/, ''));
        lines.push(row);
        row = [];
        cell = '';
      } else {
        cell += character;
      }
    }
    if (quoted) throw new BadRequestException('CSV có dấu ngoặc kép chưa đóng');
    if (cell || row.length) {
      row.push(cell.replace(/\r$/, ''));
      lines.push(row);
    }
    const header = (lines.shift() || []).map((column) => column.trim());
    if (!header.length || header.some((column) => !column)) throw new BadRequestException('CSV thiếu header hợp lệ');
    if (new Set(header).size !== header.length) throw new BadRequestException('CSV có header trùng lặp');
    return lines.filter((cells) => cells.some((entry) => entry.trim())).map((cells, index) => {
      if (cells.length > header.length) throw new BadRequestException(`CSV dòng ${index + 2} có quá nhiều cột`);
      return Object.fromEntries(header.map((column, columnIndex) => [column, cells[columnIndex]?.trim() || undefined]));
    });
  }

  private validateReceiptImportRow(row: AnyRecord, line: number) {
    const receiptAmount = this.importNumber(row.receiptAmount, 'receiptAmount', line, true);
    const paidBefore = this.importNumber(row.paidBefore, 'paidBefore', line);
    const totalAmount = this.importNumber(row.totalAmount, 'totalAmount', line, false, receiptAmount);
    if (totalAmount < paidBefore + receiptAmount) throw new BadRequestException(`Dòng ${line}: totalAmount phải lớn hơn hoặc bằng paidBefore + receiptAmount`);
    return {
      ...row,
      receiptName: this.requiredImportText(row.receiptName, 'receiptName', line),
      receiptType: this.importEnum(row.receiptType, 'receiptType', line, ['DEPOSIT', 'TOUR_PAYMENT', 'CUSTOMER_DEBT', 'COLLECT_ON_BEHALF', 'SUPPLIER_FUND_REFUND', 'OTHER']) || 'TOUR_PAYMENT',
      paymentMethod: this.importEnum(row.paymentMethod, 'paymentMethod', line, ['BANK_TRANSFER', 'CASH', 'CARD', 'QR', 'OFFSET', 'OTHER']) || 'BANK_TRANSFER',
      paymentDate: this.importDate(row.paymentDate, 'paymentDate', line),
      documentDate: this.importDate(row.documentDate, 'documentDate', line),
      transferDate: this.importDate(row.transferDate, 'transferDate', line),
      totalAmount,
      paidBefore,
      receiptAmount,
      approvalStatus: 'DRAFT',
      createdBy: this.text(row.createdBy) || 'finance-import',
    };
  }

  private validatePaymentImportRow(row: AnyRecord, line: number) {
    const paymentAmount = this.importNumber(row.paymentAmount, 'paymentAmount', line, true);
    const totalAmount = this.importNumber(row.totalAmount, 'totalAmount', line, false, paymentAmount);
    if (totalAmount < paymentAmount) throw new BadRequestException(`Dòng ${line}: totalAmount phải lớn hơn hoặc bằng paymentAmount`);
    return {
      ...row,
      voucherName: this.requiredImportText(row.voucherName, 'voucherName', line),
      voucherType: this.importEnum(row.voucherType, 'voucherType', line, ['SUPPLIER_PAYMENT', 'CUSTOMER_REFUND', 'COMMISSION', 'INTERNAL_EXPENSE', 'SUPPLIER_DEPOSIT', 'ADVANCE', 'OTHER']) || 'SUPPLIER_PAYMENT',
      paymentMethod: this.importEnum(row.paymentMethod, 'paymentMethod', line, ['BANK_TRANSFER', 'CASH', 'CARD', 'QR', 'OFFSET', 'OTHER']) || 'BANK_TRANSFER',
      paymentDate: this.importDate(row.paymentDate, 'paymentDate', line),
      documentDate: this.importDate(row.documentDate, 'documentDate', line),
      transferDate: this.importDate(row.transferDate, 'transferDate', line),
      totalAmount,
      paymentAmount,
      approvalStatus: 'DRAFT',
      createdBy: this.text(row.createdBy) || 'finance-import',
    };
  }

  private async assertImportCodesAvailable(type: 'receipts' | 'payments', rows: AnyRecord[], field: 'receiptCode' | 'voucherCode') {
    const codes = rows.map((row) => this.text(row[field])).filter((code): code is string => Boolean(code));
    const duplicate = codes.find((code, index) => codes.indexOf(code) !== index);
    if (duplicate) throw new BadRequestException(`Mã ${duplicate} bị trùng trong file import`);
    if (!codes.length) return;
    if (type === 'receipts') {
      const existing = await this.prisma.financeReceipt.findFirst({ where: { receiptCode: { in: codes } }, select: { receiptCode: true } });
      if (existing) throw new BadRequestException(`Mã ${existing.receiptCode} đã tồn tại`);
    } else {
      const existing = await this.prisma.financePayment.findFirst({ where: { voucherCode: { in: codes } }, select: { voucherCode: true } });
      if (existing) throw new BadRequestException(`Mã ${existing.voucherCode} đã tồn tại`);
    }
  }

  private requiredImportText(value: unknown, field: string, line: number) {
    const text = this.text(value);
    if (!text) throw new BadRequestException(`Dòng ${line}: thiếu ${field}`);
    return text;
  }

  private adjustmentDirection(dto: AnyRecord) {
    const direction = this.text(dto.direction);
    if (direction !== 'INCREASE' && direction !== 'DECREASE') throw new BadRequestException('direction must be INCREASE or DECREASE');
    return direction;
  }

  private adjustmentAmount(dto: AnyRecord) {
    const amount = this.decimal(dto.amount);
    if (amount <= 0) throw new BadRequestException('amount must be greater than zero');
    return amount;
  }

  private importNumber(value: unknown, field: string, line: number, positive = false, fallback = 0) {
    if (value == null || value === '') return fallback;
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0 || (positive && number <= 0)) throw new BadRequestException(`Dòng ${line}: ${field} không hợp lệ`);
    return number;
  }

  private importDate(value: unknown, field: string, line: number) {
    const text = this.text(value);
    if (!text) return undefined;
    if (!this.date(text)) throw new BadRequestException(`Dòng ${line}: ${field} không hợp lệ`);
    return text;
  }

  private importEnum(value: unknown, field: string, line: number, allowed: string[]) {
    const text = this.text(value);
    if (!text) return undefined;
    if (!allowed.includes(text)) throw new BadRequestException(`Dòng ${line}: ${field} không hợp lệ`);
    return text;
  }

  private text(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private decimal(value: unknown) {
    const number = Number(value ?? 0);
    return Number.isFinite(number) ? number : 0;
  }

  private decimalOrUndefined(value: unknown) {
    if (value == null || value === '') return undefined;
    return this.decimal(value);
  }

  private date(value: unknown) {
    if (!value || typeof value !== 'string') return undefined;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  private code(prefix: string) {
    return `${prefix}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now().toString().slice(-5)}`;
  }

  private async nextCode(tx: Prisma.TransactionClient, scope: string, prefix: string, value?: Date, branch?: string) {
    const date = value || new Date();
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const id = randomUUID();
    const rows = await tx.$queryRawUnsafe<{ currentNo: number; padding: number }[]>(
      `INSERT INTO "CodeSequence" ("id","scope","prefix","year","month","branch","currentNo","padding","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,1,6,NOW())
       ON CONFLICT ("scope","prefix","year",(COALESCE("month",0)),(COALESCE("branch",'')))
       DO UPDATE SET "currentNo" = "CodeSequence"."currentNo" + 1, "updatedAt" = NOW()
       RETURNING "currentNo", "padding"`,
      id,
      scope,
      prefix,
      year,
      month,
      branch || null,
    );
    const row = rows[0] || { currentNo: 1, padding: 6 };
    return `${prefix}-${year}${String(month).padStart(2, '0')}-${String(row.currentNo).padStart(row.padding, '0')}`;
  }

  private ledgerSummary(rows: { debitAmount: Prisma.Decimal; creditAmount: Prisma.Decimal }[]) {
    const debit = rows.reduce((sum, row) => sum + Number(row.debitAmount), 0);
    const credit = rows.reduce((sum, row) => sum + Number(row.creditAmount), 0);
    return { debit, credit, balance: debit - credit, count: rows.length };
  }

  private supplierLedgerSummary(rows: { debitAmount: Prisma.Decimal; creditAmount: Prisma.Decimal }[]) {
    const paid = rows.reduce((sum, row) => sum + Number(row.debitAmount), 0);
    const payable = rows.reduce((sum, row) => sum + Number(row.creditAmount), 0);
    return { debit: payable, credit: paid, balance: payable - paid, count: rows.length };
  }

  private customerDebtRows(entries: Array<{ customerId: string; customer: { fullName: string; phone: string; code: string }; debitAmount: Prisma.Decimal; creditAmount: Prisma.Decimal; dueDate: Date | null; documentDate: Date | null; createdAt: Date }>) {
    const grouped = new Map<string, { id: string; code: string; name: string; phone: string; debitTotal: number; creditTotal: number; entries: typeof entries }>();
    for (const entry of entries) {
      const current = grouped.get(entry.customerId) || { id: entry.customerId, code: entry.customer.code, name: entry.customer.fullName, phone: entry.customer.phone, debitTotal: 0, creditTotal: 0, entries: [] };
      current.debitTotal += Number(entry.debitAmount);
      current.creditTotal += Number(entry.creditAmount);
      current.entries.push(entry);
      grouped.set(entry.customerId, current);
    }
    return Array.from(grouped.values())
      .map(({ entries: rowEntries, ...row }) => ({ ...row, balance: row.debitTotal - row.creditTotal, aging: this.debtAging(rowEntries, 'debitAmount', 'creditAmount') }))
      .filter((row) => row.balance !== 0)
      .sort((left, right) => right.balance - left.balance);
  }

  private supplierDebtRows(entries: Array<{ supplierId: string; supplier: { name: string; phone: string | null; supplierCode: string | null }; debitAmount: Prisma.Decimal; creditAmount: Prisma.Decimal; dueDate: Date | null; documentDate: Date | null; createdAt: Date }>) {
    const grouped = new Map<string, { id: string; code: string; name: string; phone?: string; debitTotal: number; creditTotal: number; entries: typeof entries }>();
    for (const entry of entries) {
      const current = grouped.get(entry.supplierId) || { id: entry.supplierId, code: entry.supplier.supplierCode || '', name: entry.supplier.name, phone: entry.supplier.phone || undefined, debitTotal: 0, creditTotal: 0, entries: [] };
      current.debitTotal += Number(entry.creditAmount);
      current.creditTotal += Number(entry.debitAmount);
      current.entries.push(entry);
      grouped.set(entry.supplierId, current);
    }
    return Array.from(grouped.values())
      .map(({ entries: rowEntries, ...row }) => ({ ...row, balance: row.debitTotal - row.creditTotal, aging: this.debtAging(rowEntries, 'creditAmount', 'debitAmount') }))
      .filter((row) => row.balance !== 0)
      .sort((left, right) => right.balance - left.balance);
  }

  private debtAging(
    entries: Array<{ debitAmount: Prisma.Decimal; creditAmount: Prisma.Decimal; dueDate: Date | null; documentDate: Date | null; createdAt: Date }>,
    obligationField: 'debitAmount' | 'creditAmount',
    settlementField: 'debitAmount' | 'creditAmount',
  ) {
    const aging = { current: 0, overdue1To30: 0, overdue31To60: 0, overdue61To90: 0, overdueOver90: 0 };
    let settlements = entries.reduce((sum, entry) => sum + Number(entry[settlementField]), 0);
    const obligations = entries
      .map((entry) => ({ amount: Number(entry[obligationField]), dueDate: entry.dueDate, documentDate: entry.documentDate, createdAt: entry.createdAt }))
      .filter((entry) => entry.amount > 0)
      .sort((left, right) => Number(left.dueDate || left.documentDate || left.createdAt) - Number(right.dueDate || right.documentDate || right.createdAt));
    const now = new Date();
    for (const obligation of obligations) {
      const remaining = Math.max(obligation.amount - settlements, 0);
      settlements = Math.max(settlements - obligation.amount, 0);
      if (!remaining) continue;
      if (!obligation.dueDate || obligation.dueDate >= now) {
        aging.current += remaining;
        continue;
      }
      const overdueDays = Math.ceil((now.getTime() - obligation.dueDate.getTime()) / 86400000);
      if (overdueDays <= 30) aging.overdue1To30 += remaining;
      else if (overdueDays <= 60) aging.overdue31To60 += remaining;
      else if (overdueDays <= 90) aging.overdue61To90 += remaining;
      else aging.overdueOver90 += remaining;
    }
    if (settlements > 0) aging.current -= settlements;
    return { ...aging, overdueTotal: aging.overdue1To30 + aging.overdue31To60 + aging.overdue61To90 + aging.overdueOver90 };
  }

  private take(value?: string) {
    const take = Number(value || 300);
    return Math.min(Number.isFinite(take) ? take : 300, 2000);
  }

}

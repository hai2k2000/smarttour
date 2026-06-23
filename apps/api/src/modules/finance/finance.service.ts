import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { FinanceApprovalStatus, FinanceCashflowEntryType, FinanceInvoiceStatus, OrderCostStatus, OrderPaymentStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { applyWriteDataScope, branchDepartmentScopeWhere, hasUnrestrictedDataScope, RequestUser } from '../auth/data-scope';
import { FilesService } from '../files/files.service';
import { containsSearch, normalizeListSearch } from '../list-search';
import { createPaymentReversalCashflow, createReceiptReversalCashflow, upsertPaymentCashflow, upsertReceiptCashflow } from './finance-cashflow-postings';
import { createInvoiceReversalCustomerLedger, createPaymentReversalSupplierLedger, createReceiptReversalCustomerLedger, upsertInvoiceCustomerLedger, upsertPaymentSupplierLedger, upsertReceiptCustomerLedger } from './finance-customer-ledger';
import { assertCanApproveFinanceEntity, assertCanCancelFinanceEntity, assertCanDeleteFinanceEntity, assertCanRejectFinanceEntity, assertCanUpdateFinanceEntity, lockFinanceInvoice, lockFinancePayment, lockFinanceReceipt } from './finance-final-state';
import { financeImportRows, validatePaymentImportRow, validateReceiptImportRow } from './finance-import';
import { applyOrderPayment, applyOrderReceipt, assertInvoiceLinks, assertPaymentLinks, assertReceiptOrderLinks, resolveInvoiceCustomerScope, resolvePaymentSupplier, resolveReceiptCustomer, resolveTourId } from './finance-order-links';
import { reconcileApprovedPayment, reconcileCancelledPayment } from './finance-payment-reconciliation';
import { toXlsxWorkbook } from './finance-xlsx';

type AnyRecord = Record<string, unknown>;
type ImportFile = { originalname: string; mimetype: string; size: number; buffer: Buffer };
const PROTECTED_FINANCE_WRITE_FIELDS = new Set([
  'actor',
  'approvalStatus',
  'status',
  'approvedBy',
  'approvedAt',
  'rejectedBy',
  'rejectedAt',
  'cancelledBy',
  'cancelledAt',
  'cancelReason',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
  'deletedAt',
  'lockedAt',
  'reversalOfId',
]);
const COMPANY_EXPENSE_PAYMENT_TYPES = new Set(['INTERNAL_EXPENSE', 'OTHER']);
const FINANCE_RECEIPT_TYPES = ['DEPOSIT', 'TOUR_PAYMENT', 'CUSTOMER_DEBT', 'COLLECT_ON_BEHALF', 'SUPPLIER_FUND_REFUND', 'OTHER'];
const FINANCE_PAYMENT_TYPES = ['SUPPLIER_PAYMENT', 'CUSTOMER_REFUND', 'COMMISSION', 'INTERNAL_EXPENSE', 'SUPPLIER_DEPOSIT', 'ADVANCE', 'OTHER'];
const FINANCE_PAYMENT_METHODS = ['BANK_TRANSFER', 'CASH', 'CARD', 'QR', 'OFFSET', 'OTHER'];
const FINANCE_INVOICE_TYPES = ['VAT', 'E_INVOICE', 'PROFORMA', 'ADJUSTMENT', 'OTHER'];
function receiptExportKeys() {
  return ['receiptCode', 'tourId', 'receiptName', 'receiptType', 'paymentDate', 'paymentMethod', 'payerName', 'payerPhone', 'totalAmount', 'paidBefore', 'receiptAmount', 'remainingAmount', 'approvalStatus', 'branch', 'assignedStaff'];
}

function paymentExportKeys() {
  return ['voucherCode', 'tourId', 'voucherName', 'voucherType', 'paymentDate', 'paymentMethod', 'receiverName', 'receiverPhone', 'totalAmount', 'paymentAmount', 'remainingAmount', 'approvalStatus', 'branch', 'assignedStaff'];
}

@Injectable()
export class FinanceService {
  constructor(private readonly prisma: PrismaService, private readonly filesService: FilesService) {}

  async listReceipts(query: Record<string, string>, user?: RequestUser) {
    const where = branchDepartmentScopeWhere(this.receiptWhere(query), user);
    const [rows, summary] = await Promise.all([
      this.prisma.financeReceipt.findMany({
        where,
        include: { orders: { select: { id: true, orderId: true, orderCode: true, tourCode: true, tourName: true, amount: true } } },
        orderBy: [{ updatedAt: 'desc' }, { receiptCode: 'asc' }],
        take: this.take(query.take),
      }),
      this.receiptSummaryFromDb(where),
    ]);
    return { rows, summary };
  }

  async receiptDetail(id: string, user?: RequestUser) {
    const row = await this.prisma.financeReceipt.findFirst({ where: branchDepartmentScopeWhere({ id, deletedAt: null }, user), include: { orders: true, cashflowEntries: true } });
    if (!row) throw new NotFoundException('Không tìm thấy phiếu thu');
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
      if (previousKey && previousKey !== upload.objectKey) await this.filesService.removeIfPresent(previousKey).catch(() => undefined);
      return updated;
    } catch (error) {
      await this.filesService.removeIfPresent(upload.objectKey).catch(() => undefined);
      throw error;
    }
  }

  async deleteReceiptFile(id: string, user?: RequestUser) {
    const current = await this.receiptDetail(id, user);
    const objectKey = this.objectKey(current.attachmentUrl);
    if (objectKey) await this.filesService.removeIfPresent(objectKey);
    return this.prisma.financeReceipt.update({ where: { id }, data: { attachmentName: null, attachmentUrl: null } });
  }

  async createReceipt(dto: AnyRecord, user?: RequestUser) {
    dto = applyWriteDataScope(this.financeWriteInput(dto), user);
    const actor = this.actor(user);
    return this.prisma.$transaction(async (tx) => {
      const receiptCode = this.text(dto.receiptCode) || await this.nextCode(tx, 'FINANCE_RECEIPT', 'PT', this.date(dto.paymentDate), this.text(dto.branch));
      const orders = this.receiptOrders(dto);
      this.assertReceiptOrderAllocation(this.decimal(dto.receiptAmount), orders);
      await assertReceiptOrderLinks(tx, { customerId: this.text(dto.customerId), orders }, user);
      const tourId = this.requireFinanceTourId(await resolveTourId(tx, { tourId: this.text(dto.tourId), tourCode: this.text(dto.tourCode), orders }, user), 'Phiếu thu');
      const receipt = await tx.financeReceipt.create({ data: { ...this.receiptData({ ...dto, receiptCode, tourId }), approvalStatus: 'DRAFT', createdBy: actor, orders: { create: orders } }, include: { orders: true } });
      await this.audit(tx, 'CREATE', 'FinanceReceipt', receipt.id, dto, user);
      return receipt;
    });
  }

  async updateReceipt(id: string, dto: AnyRecord, user?: RequestUser) {
    const current = await this.receiptDetail(id, user);
    dto = applyWriteDataScope(this.financeWriteInput(dto), user);
    assertCanUpdateFinanceEntity(current, 'Phiếu thu');
    return this.prisma.$transaction(async (tx) => {
      const hasOrders = Object.prototype.hasOwnProperty.call(dto, 'orders');
      const orders = hasOrders ? this.receiptOrders(dto) : current.orders;
      this.assertReceiptOrderAllocation(this.decimal(dto.receiptAmount ?? current.receiptAmount), orders);
      await assertReceiptOrderLinks(tx, { customerId: this.text(dto.customerId) || current.customerId, orders }, user);
      const tourId = this.requireFinanceTourId(await resolveTourId(tx, { tourId: this.text(dto.tourId) || current.tourId, tourCode: this.text(dto.tourCode), orders }, user) || current.tourId, 'Phiếu thu');
      const data: AnyRecord = this.receiptData({ ...current, ...dto, receiptCode: this.text(dto.receiptCode) || current.receiptCode, tourId });
      if (hasOrders) {
        await tx.financeReceiptOrder.deleteMany({ where: { receiptId: id } });
        data.orders = { create: orders };
      }
      const receipt = await tx.financeReceipt.update({ where: { id }, data, include: { orders: true } });
      await this.audit(tx, 'UPDATE', 'FinanceReceipt', id, dto, user);
      return receipt;
    });
  }

  async deleteReceipt(id: string, user?: RequestUser) {
    const current = await this.receiptDetail(id, user);
    assertCanDeleteFinanceEntity(current, 'Phiếu thu');
    return this.prisma.financeReceipt.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async approveReceipt(id: string, dto: AnyRecord, user?: RequestUser) {
    const actor = this.actor(user);
    return this.prisma.$transaction(async (tx) => {
      await lockFinanceReceipt(tx, id);
      const current = await tx.financeReceipt.findFirst({ where: branchDepartmentScopeWhere({ id }, user), include: { orders: true } });
      if (!current) throw new NotFoundException('Không tìm thấy phiếu thu');
      assertCanApproveFinanceEntity(current, 'Phiếu thu');
      this.assertReceiptOrderAllocation(this.decimal(current.receiptAmount), current.orders);
      await assertReceiptOrderLinks(tx, { customerId: current.customerId, orders: current.orders }, user);
      const receipt = await tx.financeReceipt.update({
        where: { id },
        data: { approvalStatus: 'APPROVED', approvedBy: actor, approvedAt: new Date(), lockedAt: new Date() },
        include: { orders: true },
      });
      const tourId = this.requireFinanceTourId(await resolveTourId(tx, { tourId: receipt.tourId, receiptId: id, orders: receipt.orders }, user), 'Phiếu thu');
      if (tourId && receipt.tourId !== tourId) await tx.financeReceipt.update({ where: { id }, data: { tourId } });
      const postedReceipt = { ...receipt, tourId };
      const customerId = await resolveReceiptCustomer(tx, postedReceipt, user);
      await upsertReceiptCashflow(tx, postedReceipt, customerId);
      await upsertReceiptCustomerLedger(tx, postedReceipt, customerId, actor);
      for (const line of receipt.orders) {
        if (line.orderId) await applyOrderReceipt(tx, line.orderId, Number(line.amount));
      }
      await this.audit(tx, 'APPROVE', 'FinanceReceipt', id, { actor, note: this.text(dto.note) }, user);
      return receipt;
    });
  }

  async rejectReceipt(id: string, dto: AnyRecord, user?: RequestUser) {
    return this.changeReceiptStatus(id, 'REJECTED', dto, user);
  }

  async cancelReceipt(id: string, dto: AnyRecord, user?: RequestUser) {
    const actor = this.actor(user);
    const reason = this.text(dto.reason) || this.text(dto.note) || 'Hủy phiếu thu đã duyệt';
    return this.prisma.$transaction(async (tx) => {
      await lockFinanceReceipt(tx, id);
      const receipt = await tx.financeReceipt.findFirst({ where: branchDepartmentScopeWhere({ id }, user), include: { orders: true } });
      if (!receipt) throw new NotFoundException('Không tìm thấy phiếu thu');
      assertCanCancelFinanceEntity(receipt, 'Phiếu thu');
      this.assertReceiptOrderAllocation(this.decimal(receipt.receiptAmount), receipt.orders);
      await assertReceiptOrderLinks(tx, { customerId: receipt.customerId, orders: receipt.orders }, user);
      const tourId = this.requireFinanceTourId(await resolveTourId(tx, { tourId: receipt.tourId, receiptId: id, orders: receipt.orders }, user), 'Phiếu thu');
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
          tourId,
          branch: receipt.branch,
          department: receipt.department,
          assignedStaff: receipt.assignedStaff,
          approvalStatus: 'APPROVED',
          approvedBy: actor,
          approvedAt: new Date(),
          lockedAt: new Date(),
          reversalOfId: id,
          createdBy: actor,
        },
      });
      if (receipt.orders.length) {
        await tx.financeReceiptOrder.createMany({
          data: receipt.orders.map((line) => ({
            receiptId: reversal.id,
            orderId: line.orderId,
            orderCode: line.orderCode,
            tourCode: line.tourCode,
            tourName: line.tourName,
            amount: line.amount,
          })),
        });
      }
      await tx.financeReceipt.update({ where: { id }, data: { approvalStatus: 'CANCELLED', cancelledBy: actor, cancelledAt: new Date(), cancelReason: reason } });
      const postedReceipt = { ...receipt, tourId };
      const customerId = await resolveReceiptCustomer(tx, postedReceipt, user);
      await createReceiptReversalCashflow(tx, postedReceipt, reversal.id, customerId, actor, reason);
      await createReceiptReversalCustomerLedger(tx, postedReceipt, reversal.id, customerId, reversalCode, reason, actor);
      for (const line of receipt.orders) {
        if (line.orderId) await applyOrderReceipt(tx, line.orderId, -Number(line.amount));
      }
      await this.audit(tx, 'CANCEL', 'FinanceReceipt', id, { actor, reason, reversalId: reversal.id }, user);
      return tx.financeReceipt.findUnique({ where: { id }, include: { reversals: true } });
    });
  }

  async listPayments(query: Record<string, string>, user?: RequestUser) {
    const where = branchDepartmentScopeWhere(this.paymentWhere(query), user);
    const [rows, summary] = await Promise.all([
      this.prisma.financePayment.findMany({
        where,
        include: {
          operationVoucher: { select: { voucherCode: true, status: true } },
          supplierPaymentRequests: { select: { code: true, status: true } },
        },
        orderBy: [{ updatedAt: 'desc' }, { voucherCode: 'asc' }],
        take: this.take(query.take),
      }),
      this.paymentSummaryFromDb(where),
    ]);
    return { rows, summary };
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
    if (!row) throw new NotFoundException('Không tìm thấy phiếu chi');
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
      if (previousKey && previousKey !== upload.objectKey) await this.filesService.removeIfPresent(previousKey).catch(() => undefined);
      return updated;
    } catch (error) {
      await this.filesService.removeIfPresent(upload.objectKey).catch(() => undefined);
      throw error;
    }
  }

  async deletePaymentFile(id: string, user?: RequestUser) {
    const current = await this.paymentDetail(id, user);
    const objectKey = this.objectKey(current.attachmentUrl);
    if (objectKey) await this.filesService.removeIfPresent(objectKey);
    return this.prisma.financePayment.update({ where: { id }, data: { attachmentName: null, attachmentUrl: null } });
  }

  async createPayment(dto: AnyRecord, user?: RequestUser) {
    dto = applyWriteDataScope(this.financeWriteInput(dto), user);
    const actor = this.actor(user);
    return this.prisma.$transaction(async (tx) => {
      const voucherCode = this.text(dto.voucherCode) || await this.nextCode(tx, 'FINANCE_PAYMENT', 'PC', this.date(dto.paymentDate), this.text(dto.branch));
      await assertPaymentLinks(tx, { supplierId: this.text(dto.supplierId), orderId: this.text(dto.orderId), operationVoucherId: this.text(dto.operationVoucherId) }, user);
      const tourId = this.paymentTourId(await resolveTourId(tx, { tourId: this.text(dto.tourId), tourCode: this.text(dto.tourCode), orderId: this.text(dto.orderId), operationVoucherId: this.text(dto.operationVoucherId) }, user), dto);
      const payment = await tx.financePayment.create({ data: { ...this.paymentData({ ...dto, voucherCode, tourId }), approvalStatus: 'DRAFT', createdBy: actor } });
      await this.audit(tx, 'CREATE', 'FinancePayment', payment.id, dto, user);
      return payment;
    });
  }

  async updatePayment(id: string, dto: AnyRecord, user?: RequestUser) {
    const current = await this.paymentDetail(id, user);
    dto = applyWriteDataScope(this.financeWriteInput(dto), user);
    assertCanUpdateFinanceEntity(current, 'Phiếu chi');
    return this.prisma.$transaction(async (tx) => {
      await assertPaymentLinks(tx, { supplierId: this.text(dto.supplierId) || current.supplierId, orderId: this.text(dto.orderId) || current.orderId, operationVoucherId: this.text(dto.operationVoucherId) || current.operationVoucherId }, user);
      const tourId = this.paymentTourId(await resolveTourId(tx, { tourId: this.text(dto.tourId) || current.tourId, tourCode: this.text(dto.tourCode), orderId: this.text(dto.orderId) || current.orderId, operationVoucherId: this.text(dto.operationVoucherId) || current.operationVoucherId }, user) || current.tourId, { ...current, ...dto });
      const payment = await tx.financePayment.update({ where: { id }, data: this.paymentData({ ...current, ...dto, voucherCode: this.text(dto.voucherCode) || current.voucherCode, tourId }) });
      await this.audit(tx, 'UPDATE', 'FinancePayment', id, dto, user);
      return payment;
    });
  }

  async deletePayment(id: string, user?: RequestUser) {
    const current = await this.paymentDetail(id, user);
    assertCanDeleteFinanceEntity(current, 'Phiếu chi');
    return this.prisma.$transaction(async (tx) => {
      await tx.supplierPaymentRequest.updateMany({ where: { financePaymentId: id }, data: { financePaymentId: null, status: 'APPROVED' } });
      return tx.financePayment.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }

  async approvePayment(id: string, dto: AnyRecord, user?: RequestUser) {
    const actor = this.actor(user);
    return this.prisma.$transaction(async (tx) => {
      await lockFinancePayment(tx, id);
      const current = await tx.financePayment.findFirst({ where: branchDepartmentScopeWhere({ id }, user) });
      if (!current) throw new NotFoundException('Không tìm thấy phiếu chi');
      assertCanApproveFinanceEntity(current, 'Phiếu chi');
      await assertPaymentLinks(tx, { supplierId: current.supplierId, orderId: current.orderId, operationVoucherId: current.operationVoucherId, tourId: current.tourId }, user);
      const payment = await tx.financePayment.update({
        where: { id },
        data: { approvalStatus: 'APPROVED', approvedBy: actor, approvedAt: new Date(), lockedAt: new Date() },
      });
      const tourId = this.paymentTourId(await resolveTourId(tx, { tourId: payment.tourId, orderId: payment.orderId, operationVoucherId: payment.operationVoucherId }, user), payment);
      if (tourId && payment.tourId !== tourId) await tx.financePayment.update({ where: { id }, data: { tourId } });
      const postedPayment = { ...payment, tourId };
      const supplierId = await resolvePaymentSupplier(tx, postedPayment);
      await upsertPaymentCashflow(tx, postedPayment, supplierId);
      await upsertPaymentSupplierLedger(tx, postedPayment, supplierId, actor);
      if (payment.orderId) await applyOrderPayment(tx, payment.orderId, Number(payment.paymentAmount));
      await reconcileApprovedPayment(tx, payment);
      await this.audit(tx, 'APPROVE', 'FinancePayment', id, { actor, note: this.text(dto.note) }, user);
      return payment;
    });
  }

  async rejectPayment(id: string, dto: AnyRecord, user?: RequestUser) {
    return this.changePaymentStatus(id, 'REJECTED', dto, user);
  }

  async cancelPayment(id: string, dto: AnyRecord, user?: RequestUser) {
    const actor = this.actor(user);
    const reason = this.text(dto.reason) || this.text(dto.note) || 'Hủy phiếu chi đã duyệt';
    return this.prisma.$transaction(async (tx) => {
      await lockFinancePayment(tx, id);
      const payment = await tx.financePayment.findFirst({ where: branchDepartmentScopeWhere({ id }, user) });
      if (!payment) throw new NotFoundException('Không tìm thấy phiếu chi');
      assertCanCancelFinanceEntity(payment, 'Phiếu chi');
      await assertPaymentLinks(tx, { supplierId: payment.supplierId, orderId: payment.orderId, operationVoucherId: payment.operationVoucherId, tourId: payment.tourId }, user);
      const tourId = this.paymentTourId(await resolveTourId(tx, { tourId: payment.tourId, orderId: payment.orderId, operationVoucherId: payment.operationVoucherId }, user), payment);
      const reversalCode = await this.nextCode(tx, 'FINANCE_PAYMENT', 'PCDC', new Date(), payment.branch || undefined);
      const reversal = await tx.financePayment.create({
        data: { voucherCode: reversalCode, voucherName: `Dao ${payment.voucherCode}`, voucherType: payment.voucherType, paymentDate: new Date(), paymentMethod: payment.paymentMethod, supplierId: payment.supplierId, operationVoucherId: payment.operationVoucherId, orderId: payment.orderId, tourId, receiverName: payment.receiverName, reason, totalAmount: payment.paymentAmount, paymentAmount: payment.paymentAmount, branch: payment.branch, department: payment.department, assignedStaff: payment.assignedStaff, approvalStatus: 'APPROVED', approvedBy: actor, approvedAt: new Date(), lockedAt: new Date(), reversalOfId: id, createdBy: actor },
      });
      await tx.financePayment.update({ where: { id }, data: { approvalStatus: 'CANCELLED', cancelledBy: actor, cancelledAt: new Date(), cancelReason: reason } });
      const postedPayment = { ...payment, tourId };
      const supplierId = await resolvePaymentSupplier(tx, postedPayment);
      await createPaymentReversalCashflow(tx, postedPayment, reversal.id, supplierId, actor, reason);
      await createPaymentReversalSupplierLedger(tx, postedPayment, reversal.id, supplierId, reversalCode, reason, actor);
      if (payment.orderId) await applyOrderPayment(tx, payment.orderId, -Number(payment.paymentAmount));
      await reconcileCancelledPayment(tx, payment);
      await this.audit(tx, 'CANCEL', 'FinancePayment', id, { actor, reason, reversalId: reversal.id }, user);
      return tx.financePayment.findUnique({ where: { id }, include: { reversals: true } });
    });
  }

  async listInvoices(query: Record<string, string>, user?: RequestUser) {
    const where = this.invoiceScopeWhere(this.invoiceWhere(query), user);
    const [rows, summary] = await Promise.all([
      this.prisma.financeInvoice.findMany({ where, orderBy: [{ updatedAt: 'desc' }, { invoiceCode: 'asc' }], take: this.take(query.take) }),
      this.invoiceSummaryFromDb(where),
    ]);
    return { rows, summary };
  }

  async invoiceDetail(id: string, user?: RequestUser) {
    const row = await this.prisma.financeInvoice.findFirst({ where: this.invoiceScopeWhere({ id, deletedAt: null }, user), include: { items: true, files: true } });
    if (!row) throw new NotFoundException('Không tìm thấy hóa đơn');
    return row;
  }

  async uploadInvoiceFile(
    id: string,
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer } | undefined,
    actorId?: string,
    user?: RequestUser,
  ) {
    await this.invoiceDetail(id, user);
    const upload = await this.filesService.upload(file, `finance/invoices/${id}`, actorId);
    try {
      return await this.prisma.financeInvoiceFile.create({
        data: { invoiceId: id, fileName: upload.fileName, fileUrl: upload.url, fileType: upload.mimeType, uploadedBy: actorId },
      });
    } catch (error) {
      await this.filesService.removeIfPresent(upload.objectKey).catch(() => undefined);
      throw error;
    }
  }

  async deleteInvoiceFile(id: string, fileId: string, user?: RequestUser) {
    await this.invoiceDetail(id, user);
    const file = await this.prisma.financeInvoiceFile.findFirst({ where: { id: fileId, invoiceId: id } });
    if (!file) throw new NotFoundException('Không tìm thấy file hóa đơn');
    const objectKey = this.objectKey(file.fileUrl);
    if (objectKey) await this.filesService.removeIfPresent(objectKey);
    return this.prisma.financeInvoiceFile.delete({ where: { id: fileId } });
  }

  async createInvoice(dto: AnyRecord, user?: RequestUser) {
    dto = applyWriteDataScope(this.financeWriteInput(dto) as AnyRecord & { branch?: string | null; department?: string | null }, user);
    const actor = this.actor(user);
    return this.prisma.$transaction(async (tx) => {
      await assertInvoiceLinks(tx, { customerId: this.text(dto.customerId), orderId: this.text(dto.orderId), receiptId: this.text(dto.receiptId) }, user);
      await this.assertInvoiceWriteScope(tx, dto, user);
      const invoiceCode = this.text(dto.invoiceCode) || await this.nextCode(tx, 'FINANCE_INVOICE', 'VAT', this.date(dto.issuedDate), this.text(dto.branch));
      const tourId = this.requireFinanceTourId(await resolveTourId(tx, { tourId: this.text(dto.tourId), tourCode: this.text(dto.tourCode), orderId: this.text(dto.orderId), receiptId: this.text(dto.receiptId) }, user), 'Hóa đơn');
      const calculated = this.invoiceData({ ...dto, tourId });
      const invoice = await tx.financeInvoice.create({ data: { ...calculated, invoiceCode, status: 'DRAFT', approvalStatus: 'DRAFT', createdBy: actor, items: { create: this.invoiceItems(dto) } }, include: { items: true } });
      await this.audit(tx, 'CREATE', 'FinanceInvoice', invoice.id, dto, user);
      return invoice;
    });
  }

  async updateInvoice(id: string, dto: AnyRecord, user?: RequestUser) {
    const current = await this.invoiceDetail(id, user);
    dto = applyWriteDataScope(this.financeWriteInput(dto) as AnyRecord & { branch?: string | null; department?: string | null }, user);
    assertCanUpdateFinanceEntity(current, 'Hóa đơn');
    return this.prisma.$transaction(async (tx) => {
      const hasItems = Object.prototype.hasOwnProperty.call(dto, 'items');
      await assertInvoiceLinks(tx, { customerId: this.text(dto.customerId) || current.customerId, orderId: this.text(dto.orderId) || current.orderId, receiptId: this.text(dto.receiptId) || current.receiptId }, user);
      const tourId = this.requireFinanceTourId(await resolveTourId(tx, { tourId: this.text(dto.tourId) || current.tourId, tourCode: this.text(dto.tourCode), orderId: this.text(dto.orderId) || current.orderId, receiptId: this.text(dto.receiptId) || current.receiptId }, user) || current.tourId, 'Hóa đơn');
      await this.assertInvoiceWriteScope(tx, {
        customerId: this.text(dto.customerId) || current.customerId,
        orderId: this.text(dto.orderId) || current.orderId,
        tourId,
        receiptId: this.text(dto.receiptId) || current.receiptId,
      }, user);
      const data: AnyRecord = this.invoiceData({ ...current, ...dto, invoiceCode: this.text(dto.invoiceCode) || current.invoiceCode, tourId });
      if (hasItems) {
        await tx.financeInvoiceItem.deleteMany({ where: { invoiceId: id } });
        data.items = { create: this.invoiceItems(dto) };
      }
      const invoice = await tx.financeInvoice.update({ where: { id }, data, include: { items: true } });
      await this.audit(tx, 'UPDATE', 'FinanceInvoice', id, dto, user);
      return invoice;
    });
  }

  async deleteInvoice(id: string, user?: RequestUser) {
    const current = await this.invoiceDetail(id, user);
    assertCanDeleteFinanceEntity(current, 'Hóa đơn');
    return this.prisma.financeInvoice.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async approveInvoice(id: string, dto: AnyRecord, user?: RequestUser) {
    const actor = this.actor(user);
    return this.prisma.$transaction(async (tx) => {
      await lockFinanceInvoice(tx, id);
      const current = await tx.financeInvoice.findFirst({ where: this.invoiceScopeWhere({ id, deletedAt: null }, user) });
      if (!current) throw new NotFoundException('Không tìm thấy hóa đơn');
      assertCanApproveFinanceEntity(current, 'Hóa đơn');
      await assertInvoiceLinks(tx, { customerId: current.customerId, orderId: current.orderId, receiptId: current.receiptId, tourId: current.tourId }, user);
      const invoice = await tx.financeInvoice.update({ where: { id }, data: { status: 'APPROVED', approvalStatus: 'APPROVED', approvedBy: actor, approvedAt: new Date() } });
      const tourId = this.requireFinanceTourId(await resolveTourId(tx, { tourId: invoice.tourId, orderId: invoice.orderId, receiptId: invoice.receiptId }, user), 'Hóa đơn');
      if (tourId && invoice.tourId !== tourId) await tx.financeInvoice.update({ where: { id }, data: { tourId } });
      const invoiceCustomerScope = await resolveInvoiceCustomerScope(tx, invoice, user);
      await upsertInvoiceCustomerLedger(tx, { ...invoice, tourId, branch: invoiceCustomerScope.branch, department: invoiceCustomerScope.department }, invoiceCustomerScope.customerId, actor);
      await this.audit(tx, 'APPROVE', 'FinanceInvoice', id, { actor, note: this.text(dto.note) }, user);
      return invoice;
    });
  }

  async rejectInvoice(id: string, dto: AnyRecord, user?: RequestUser) {
    const actor = this.actor(user);
    return this.prisma.$transaction(async (tx) => {
      await lockFinanceInvoice(tx, id);
      const current = await tx.financeInvoice.findFirst({ where: this.invoiceScopeWhere({ id, deletedAt: null }, user), select: { id: true, approvalStatus: true, cancelledAt: true } });
      if (!current) throw new NotFoundException('Không tìm thấy hóa đơn');
      assertCanRejectFinanceEntity(current, 'Hóa đơn');
      const invoice = await tx.financeInvoice.update({ where: { id }, data: { status: 'REJECTED', approvalStatus: 'REJECTED', approvedBy: actor, approvedAt: new Date() } });
      await this.audit(tx, 'REJECT', 'FinanceInvoice', id, { actor, note: this.text(dto.note) }, user);
      return invoice;
    });
  }

  async cancelInvoice(id: string, dto: AnyRecord, user?: RequestUser) {
    const actor = this.actor(user);
    const reason = this.text(dto.reason) || this.text(dto.note) || 'Hủy hóa đơn đã duyệt';
    return this.prisma.$transaction(async (tx) => {
      await lockFinanceInvoice(tx, id);
      const invoice = await tx.financeInvoice.findFirst({ where: this.invoiceScopeWhere({ id, deletedAt: null }, user) });
      if (!invoice) throw new NotFoundException('Không tìm thấy hóa đơn');
      assertCanCancelFinanceEntity(invoice, 'Hóa đơn');
      await assertInvoiceLinks(tx, { customerId: invoice.customerId, orderId: invoice.orderId, receiptId: invoice.receiptId, tourId: invoice.tourId }, user);
      const tourId = this.requireFinanceTourId(await resolveTourId(tx, { tourId: invoice.tourId, orderId: invoice.orderId, receiptId: invoice.receiptId }, user), 'Hóa đơn');
      const reversalCode = await this.nextCode(tx, 'FINANCE_INVOICE', 'VATDC', new Date(), undefined);
      const reversal = await tx.financeInvoice.create({
        data: { invoiceCode: reversalCode, systemCode: invoice.systemCode, orderId: invoice.orderId, tourId, receiptId: invoice.receiptId, customerId: invoice.customerId, customerName: invoice.customerName, customerPhone: invoice.customerPhone, customerEmail: invoice.customerEmail, invoiceType: 'ADJUSTMENT', issuedDate: new Date(), totalBeforeTax: invoice.totalBeforeTax, totalTax: invoice.totalTax, totalAfterTax: invoice.totalAfterTax, amountInWords: invoice.amountInWords, status: 'APPROVED', approvalStatus: 'APPROVED', approvedBy: actor, approvedAt: new Date(), reversalOfId: id, note: reason, createdBy: actor },
      });
      await tx.financeInvoice.update({ where: { id }, data: { status: 'CANCELLED', approvalStatus: 'CANCELLED', cancelledBy: actor, cancelledAt: new Date(), cancelReason: reason } });
      const invoiceCustomerScope = await resolveInvoiceCustomerScope(tx, invoice, user);
      await createInvoiceReversalCustomerLedger(tx, { ...invoice, tourId, branch: invoiceCustomerScope.branch, department: invoiceCustomerScope.department }, reversal.id, invoiceCustomerScope.customerId, reversalCode, reason, actor);
      await this.audit(tx, 'CANCEL', 'FinanceInvoice', id, { actor, reason, reversalId: reversal.id }, user);
      return tx.financeInvoice.findUnique({ where: { id }, include: { reversals: true } });
    });
  }

  async cashflow(query: Record<string, string>, user?: RequestUser) {
    const where = branchDepartmentScopeWhere(this.cashflowWhere(query), user);
    const orderBy = [{ paymentDate: 'desc' as const }, { createdAt: 'desc' as const }];
    const [rows, summary] = await Promise.all([
      this.prisma.financeCashflowEntry.findMany({ where, orderBy, take: this.take(query.take) }),
      this.cashflowSummaryFromDb(where),
    ]);
    return { rows, summary };
  }

  async exportReceipts(query: Record<string, string>, user?: RequestUser) {
    const rows = await this.exportReceiptRows(query, user);
    return this.csv(rows, receiptExportKeys());
  }

  async exportReceiptsXlsx(query: Record<string, string>, user?: RequestUser) {
    const rows = await this.exportReceiptRows(query, user);
    return toXlsxWorkbook('finance-receipts', rows, receiptExportKeys());
  }

  async exportPayments(query: Record<string, string>, user?: RequestUser) {
    const rows = await this.exportPaymentRows(query, user);
    return this.csv(rows, paymentExportKeys());
  }

  async exportPaymentsXlsx(query: Record<string, string>, user?: RequestUser) {
    const rows = await this.exportPaymentRows(query, user);
    return toXlsxWorkbook('finance-payments', rows, paymentExportKeys());
  }

  private async exportReceiptRows(query: Record<string, string>, user?: RequestUser) {
    const where = branchDepartmentScopeWhere(this.receiptWhere(query), user);
    return this.prisma.financeReceipt.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }, { receiptCode: 'asc' }],
    });
  }

  private async exportPaymentRows(query: Record<string, string>, user?: RequestUser) {
    const where = branchDepartmentScopeWhere(this.paymentWhere(query), user);
    return this.prisma.financePayment.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }, { voucherCode: 'asc' }],
    });
  }

  async exportInvoices(query: Record<string, string>, user?: RequestUser) {
    const where = this.invoiceScopeWhere(this.invoiceWhere(query), user);
    const rows = await this.prisma.financeInvoice.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }, { invoiceCode: 'asc' }],
    });
    return this.csv(rows, ['invoiceCode', 'invoiceNumber', 'customerName', 'taxCode', 'companyName', 'tourCode', 'tourName', 'issuedDate', 'totalBeforeTax', 'totalTax', 'totalAfterTax', 'invoiceType', 'taxAuthorityCode', 'approvalStatus']);
  }

  async exportCashflow(query: Record<string, string>, user?: RequestUser) {
    const where = branchDepartmentScopeWhere(this.cashflowWhere(query), user);
    const rows = await this.prisma.financeCashflowEntry.findMany({
      where,
      orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }],
    });
    return this.csv(rows, ['sourceType', 'entryType', 'amount', 'paymentMethod', 'paymentDate', 'branch', 'department', 'staff', 'orderId', 'tourId', 'supplierId', 'customerId', 'note']);
  }

  async customerDebt(query: Record<string, string>, user?: RequestUser) {
    const search = normalizeListSearch(query.search);
    const contains = search ? containsSearch(search) : undefined;
    const where = branchDepartmentScopeWhere<Prisma.CustomerLedgerEntryWhereInput>({
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.tourId ? { tourId: query.tourId } : {}),
      ...(contains ? { customer: { is: { OR: [{ fullName: contains }, { phone: contains }, { code: contains }] } } } : {}),
      ...(query.from || query.to ? { documentDate: { gte: this.queryDate(query.from, 'from'), lte: query.to ? this.endOfDateFilter(query.to) : undefined } } : {}),
    }, user);
    const include = { customer: true, order: true, receipt: true, invoice: true };
    const orderBy = [{ documentDate: 'desc' as const }, { createdAt: 'desc' as const }];
    const [entries, rows, summary] = await Promise.all([
      this.prisma.customerLedgerEntry.findMany({ where, include, orderBy, take: this.take(query.take) }),
      this.customerDebtRowsFromDb(where, this.take(query.take)),
      this.customerLedgerSummaryFromDb(where),
    ]);
    return { rows, entries, summary };
  }

  async supplierDebt(query: Record<string, string>, user?: RequestUser) {
    const search = normalizeListSearch(query.search);
    const contains = search ? containsSearch(search) : undefined;
    const where = branchDepartmentScopeWhere<Prisma.SupplierLedgerEntryWhereInput>({
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(query.tourId ? { tourId: query.tourId } : {}),
      ...(contains ? { supplier: { is: { OR: [{ name: contains }, { phone: contains }, { supplierCode: contains }] } } } : {}),
      ...(query.from || query.to ? { documentDate: { gte: this.queryDate(query.from, 'from'), lte: query.to ? this.endOfDateFilter(query.to) : undefined } } : {}),
    }, user);
    const include = { supplier: true, order: true, operationVoucher: true, payment: true };
    const orderBy = [{ documentDate: 'desc' as const }, { createdAt: 'desc' as const }];
    const [entries, rows, summary] = await Promise.all([
      this.prisma.supplierLedgerEntry.findMany({ where, include, orderBy, take: this.take(query.take) }),
      this.supplierDebtRowsFromDb(where, this.take(query.take)),
      this.supplierLedgerSummaryFromDb(where),
    ]);
    return { rows, entries, summary };
  }

  async createCustomerDebtAdjustment(customerId: string, dto: AnyRecord, user?: RequestUser) {
    const customer = await this.prisma.customer.findFirst({ where: branchDepartmentScopeWhere({ id: customerId, mergedIntoId: null }, user), select: { id: true } });
    if (!customer) throw new NotFoundException('Không tìm thấy khách hàng');
    const scoped = applyWriteDataScope(dto as AnyRecord & { branch?: string | null; department?: string | null }, user);
    const direction = this.adjustmentDirection(dto);
    const amount = this.adjustmentAmount(dto);
    const actor = this.actor(user);
    return this.prisma.$transaction(async (tx) => {
      const tourId = await resolveTourId(tx, { tourId: this.text(dto.tourId), orderId: this.text(dto.orderId) }, user);
      const entry = await tx.customerLedgerEntry.create({
        data: {
          customerId,
          orderId: this.text(dto.orderId),
          tourId,
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
      await this.audit(tx, 'ADJUST', 'CustomerLedgerEntry', entry.id, { customerId, direction, amount, actor }, user);
      return entry;
    });
  }

  async createSupplierDebtAdjustment(supplierId: string, dto: AnyRecord, user?: RequestUser) {
    const supplier = await this.prisma.supplier.findFirst({ where: { id: supplierId, deletedAt: null }, select: { id: true } });
    if (!supplier) throw new NotFoundException('Không tìm thấy nhà cung cấp');
    const scoped = applyWriteDataScope(dto as AnyRecord & { branch?: string | null; department?: string | null }, user);
    const direction = this.adjustmentDirection(dto);
    const amount = this.adjustmentAmount(dto);
    const actor = this.actor(user);
    return this.prisma.$transaction(async (tx) => {
      const tourId = await resolveTourId(tx, { tourId: this.text(dto.tourId), orderId: this.text(dto.orderId) }, user);
      const entry = await tx.supplierLedgerEntry.create({
        data: {
          supplierId,
          orderId: this.text(dto.orderId),
          tourId,
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
      await this.audit(tx, 'ADJUST', 'SupplierLedgerEntry', entry.id, { supplierId, direction, amount, actor }, user);
      return entry;
    });
  }

  async importReceipts(dto: AnyRecord, file?: ImportFile, user?: RequestUser) {
    const rows = financeImportRows(dto, file).map((row, index) => validateReceiptImportRow(row, index + 2));
    const actor = this.actor(user);
    return this.prisma.$transaction(async (tx) => {
      await this.assertImportCodesAvailable('receipts', rows, 'receiptCode', tx);
      const imported = [];
      for (const rawRow of rows) {
        const row = applyWriteDataScope(this.financeWriteInput(rawRow as AnyRecord) as AnyRecord & { branch?: string | null; department?: string | null }, user);
        const receiptCode = this.text(row.receiptCode) || await this.nextCode(tx, 'FINANCE_RECEIPT', 'PT', this.date(row.paymentDate), this.text(row.branch));
        const orders = this.receiptOrders(row);
        this.assertReceiptOrderAllocation(this.decimal(row.receiptAmount), orders);
        await assertReceiptOrderLinks(tx, { customerId: this.text(row.customerId), orders }, user);
        const tourId = this.requireFinanceTourId(await resolveTourId(tx, { tourId: this.text(row.tourId), tourCode: this.text(row.tourCode), orders }, user), 'Phiếu thu');
        const receipt = await tx.financeReceipt.create({ data: { ...this.receiptData({ ...row, receiptCode, tourId }), approvalStatus: 'DRAFT', createdBy: actor, orders: { create: orders } }, include: { orders: true } });
        await this.audit(tx, 'IMPORT', 'FinanceReceipt', receipt.id, { source: file?.originalname || 'rows' }, user);
        imported.push(receipt);
      }
      return { type: 'receipts', imported: imported.length, rows: imported };
    });
  }

  async importPayments(dto: AnyRecord, file?: ImportFile, user?: RequestUser) {
    const rows = financeImportRows(dto, file).map((row, index) => validatePaymentImportRow(row, index + 2));
    const actor = this.actor(user);
    return this.prisma.$transaction(async (tx) => {
      await this.assertImportCodesAvailable('payments', rows, 'voucherCode', tx);
      const imported = [];
      for (const rawRow of rows) {
        const row = applyWriteDataScope(this.financeWriteInput(rawRow as AnyRecord) as AnyRecord & { branch?: string | null; department?: string | null }, user);
        const voucherCode = this.text(row.voucherCode) || await this.nextCode(tx, 'FINANCE_PAYMENT', 'PC', this.date(row.paymentDate), this.text(row.branch));
        await assertPaymentLinks(tx, { supplierId: this.text(row.supplierId), orderId: this.text(row.orderId), operationVoucherId: this.text(row.operationVoucherId) }, user);
        const tourId = this.paymentTourId(await resolveTourId(tx, { tourId: this.text(row.tourId), tourCode: this.text(row.tourCode), orderId: this.text(row.orderId), operationVoucherId: this.text(row.operationVoucherId) }, user), row);
        const payment = await tx.financePayment.create({ data: { ...this.paymentData({ ...row, voucherCode, tourId }), approvalStatus: 'DRAFT', createdBy: actor } });
        await this.audit(tx, 'IMPORT', 'FinancePayment', payment.id, { source: file?.originalname || 'rows' }, user);
        imported.push(payment);
      }
      return { type: 'payments', imported: imported.length, rows: imported };
    });
  }

  private objectKey(fileUrl?: string | null) {
    if (!fileUrl) return null;
    const url = new URL(fileUrl, 'http://smarttour.local');
    const key = url.searchParams.get('key');
    if (key) return key;
    const legacyPrefix = '/files/';
    return url.pathname.startsWith(legacyPrefix) ? decodeURIComponent(url.pathname.slice(legacyPrefix.length)) : null;
  }

  private requireFinanceTourId(tourId: string | null | undefined, label: string) {
    const resolved = this.text(tourId);
    if (!resolved) throw new BadRequestException(`${label} phải liên kết với tour hợp lệ`);
    return resolved;
  }

  private paymentTourId(tourId: string | null | undefined, payment: AnyRecord) {
    const voucherType = this.text(payment.voucherType) || 'SUPPLIER_PAYMENT';
    if (voucherType === 'SUPPLIER_PAYMENT' && !this.text(payment.supplierId) && !this.text(payment.operationVoucherId)) {
      throw new BadRequestException('Phiếu chi nhà cung cấp phải liên kết nhà cung cấp hoặc phiếu điều hành');
    }
    const resolved = this.text(tourId);
    if (resolved) return resolved;
    if (this.allowsCompanyExpenseWithoutTour(payment)) return null;
    return this.requireFinanceTourId(resolved, 'Phiếu chi');
  }

  private allowsCompanyExpenseWithoutTour(payment: AnyRecord) {
    const voucherType = this.text(payment.voucherType) || 'SUPPLIER_PAYMENT';
    return COMPANY_EXPENSE_PAYMENT_TYPES.has(voucherType)
      && !this.text(payment.orderId)
      && !this.text(payment.operationVoucherId);
  }

  private receiptData(dto: AnyRecord): Prisma.FinanceReceiptUncheckedCreateInput {
    const total = this.decimal(dto.totalAmount);
    const paidBefore = this.decimal(dto.paidBefore);
    const receiptAmount = this.decimal(dto.receiptAmount);
    if (total < paidBefore + receiptAmount) {
      throw new BadRequestException('Tổng tiền phiếu thu phải lớn hơn hoặc bằng đã thu trước đó cộng số tiền thu');
    }
    return {
      receiptCode: this.text(dto.receiptCode) || this.code('PT'),
      receiptName: this.text(dto.receiptName) || 'Phiếu thu',
      receiptType: this.enumValue(dto.receiptType, FINANCE_RECEIPT_TYPES, 'TOUR_PAYMENT', 'Loại phiếu thu') as never,
      documentDate: this.date(dto.documentDate, 'Ngày chứng từ'),
      transferDate: this.date(dto.transferDate, 'Ngày chuyển khoản'),
      paymentDate: this.date(dto.paymentDate, 'Ngày thanh toán'),
      paymentMethod: this.enumValue(dto.paymentMethod, FINANCE_PAYMENT_METHODS, 'BANK_TRANSFER', 'Phương thức thanh toán') as never,
      customerId: this.text(dto.customerId),
      tourId: this.text(dto.tourId),
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
      branch: this.text(dto.branch),
      department: this.text(dto.department),
      assignedStaff: this.text(dto.assignedStaff),
      collectorSupplier: this.text(dto.collectorSupplier),
      follower: this.text(dto.follower),
      tourCreator: this.text(dto.tourCreator),
      attachmentName: this.text(dto.attachmentName),
      attachmentUrl: this.text(dto.attachmentUrl),
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

  private assertReceiptOrderAllocation(receiptAmount: number, orders: { amount: unknown }[]) {
    if (!orders.length) return;
    const allocated = orders.reduce((sum, row) => sum + Number(row.amount), 0);
    if (Math.abs(allocated - receiptAmount) > 0.0001) {
      throw new BadRequestException('Tổng phân bổ booking phải bằng số tiền phiếu thu');
    }
  }

  private paymentData(dto: AnyRecord): Prisma.FinancePaymentUncheckedCreateInput {
    const total = this.decimal(dto.totalAmount);
    const amount = this.decimal(dto.paymentAmount);
    if (total < amount) {
      throw new BadRequestException('Tổng tiền phiếu chi phải lớn hơn hoặc bằng số tiền chi');
    }
    return {
      voucherCode: this.text(dto.voucherCode) || this.code('PC'),
      voucherName: this.text(dto.voucherName),
      voucherType: this.enumValue(dto.voucherType, FINANCE_PAYMENT_TYPES, 'SUPPLIER_PAYMENT', 'Loại phiếu chi') as never,
      documentDate: this.date(dto.documentDate, 'Ngày chứng từ'),
      transferDate: this.date(dto.transferDate, 'Ngày chuyển khoản'),
      paymentDate: this.date(dto.paymentDate, 'Ngày thanh toán'),
      paymentMethod: this.enumValue(dto.paymentMethod, FINANCE_PAYMENT_METHODS, 'BANK_TRANSFER', 'Phương thức thanh toán') as never,
      supplierId: this.text(dto.supplierId),
      operationVoucherId: this.text(dto.operationVoucherId),
      orderId: this.text(dto.orderId),
      tourId: this.text(dto.tourId),
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
      branch: this.text(dto.branch),
      department: this.text(dto.department),
      assignedStaff: this.text(dto.assignedStaff),
      follower: this.text(dto.follower),
      attachmentName: this.text(dto.attachmentName),
      attachmentUrl: this.text(dto.attachmentUrl),
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
      tourId: this.text(dto.tourId),
      receiptId: this.text(dto.receiptId),
      customerId: this.text(dto.customerId),
      customerName: this.text(dto.customerName),
      customerPhone: this.text(dto.customerPhone),
      customerEmail: this.text(dto.customerEmail),
      citizenId: this.text(dto.citizenId),
      paymentMethod: this.enumValue(dto.paymentMethod, FINANCE_PAYMENT_METHODS, 'BANK_TRANSFER', 'Phương thức thanh toán') as never,
      taxCode: this.text(dto.taxCode),
      companyName: this.text(dto.companyName),
      companyAddress: this.text(dto.companyAddress),
      bankAccountNumber: this.text(dto.bankAccountNumber),
      bankName: this.text(dto.bankName),
      invoiceType: this.enumValue(dto.invoiceType, FINANCE_INVOICE_TYPES, 'VAT', 'Loại hóa đơn') as never,
      taxAuthorityCode: this.text(dto.taxAuthorityCode),
      invoiceNumber: this.text(dto.invoiceNumber),
      invoiceDate: this.date(dto.invoiceDate, 'Ngày hóa đơn'),
      issuedDate: this.date(dto.issuedDate, 'Ngày phát hành'),
      emailSentDate: this.date(dto.emailSentDate, 'Ngày gửi email'),
      tourCode: this.text(dto.tourCode),
      tourName: this.text(dto.tourName),
      checkinDate: this.date(dto.checkinDate, 'Ngày check-in'),
      checkoutDate: this.date(dto.checkoutDate, 'Ngày check-out'),
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
      note: this.text(dto.note),
    };
  }

  private invoiceItems(dto: AnyRecord): Prisma.FinanceInvoiceItemUncheckedCreateWithoutInvoiceInput[] {
    const rows = Array.isArray(dto.items) ? dto.items as AnyRecord[] : [];
    return rows.filter((row) => this.text(row.itemName)).map((row, index) => {
      const quantity = this.decimal(row.quantity ?? 1);
      if (quantity <= 0) throw new BadRequestException('Số lượng hóa đơn phải lớn hơn 0');
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
  private async changeReceiptStatus(id: string, status: FinanceApprovalStatus, dto: AnyRecord, user?: RequestUser) {
    const actor = this.actor(user);
    return this.prisma.$transaction(async (tx) => {
      await lockFinanceReceipt(tx, id);
      const current = await tx.financeReceipt.findFirst({ where: branchDepartmentScopeWhere({ id }, user), select: { id: true, approvalStatus: true, cancelledAt: true } });
      if (!current) throw new NotFoundException('Không tìm thấy phiếu thu');
      if (status === FinanceApprovalStatus.REJECTED) assertCanRejectFinanceEntity(current, 'Phiếu thu');
      const receipt = await tx.financeReceipt.update({ where: { id }, data: { approvalStatus: status, approvedBy: actor, approvedAt: new Date() } });
      await this.audit(tx, status === 'REJECTED' ? 'REJECT' : 'STATUS', 'FinanceReceipt', id, { actor, status, note: this.text(dto.note) }, user);
      return receipt;
    });
  }

  private async changePaymentStatus(id: string, status: FinanceApprovalStatus, dto: AnyRecord, user?: RequestUser) {
    const actor = this.actor(user);
    return this.prisma.$transaction(async (tx) => {
      await lockFinancePayment(tx, id);
      const current = await tx.financePayment.findFirst({ where: branchDepartmentScopeWhere({ id }, user), select: { id: true, approvalStatus: true, cancelledAt: true } });
      if (!current) throw new NotFoundException('Không tìm thấy phiếu chi');
      if (status === FinanceApprovalStatus.REJECTED) assertCanRejectFinanceEntity(current, 'Phiếu chi');
      const payment = await tx.financePayment.update({ where: { id }, data: { approvalStatus: status, approvedBy: actor, approvedAt: new Date() } });
      if (status === FinanceApprovalStatus.REJECTED) {
        await tx.supplierPaymentRequest.updateMany({ where: { financePaymentId: id }, data: { financePaymentId: null, status: 'APPROVED' } });
      }
      await this.audit(tx, status === 'REJECTED' ? 'REJECT' : 'STATUS', 'FinancePayment', id, { actor, status, note: this.text(dto.note) }, user);
      return payment;
    });
  }

  private async receiptSummaryFromDb(where: Prisma.FinanceReceiptWhereInput) {
    const [count, total, draft, deposit, approved] = await Promise.all([
      this.prisma.financeReceipt.count({ where }),
      this.prisma.financeReceipt.aggregate({ where, _sum: { receiptAmount: true } }),
      this.prisma.financeReceipt.count({ where: { AND: [where, { approvalStatus: FinanceApprovalStatus.DRAFT }] } }),
      this.prisma.financeReceipt.count({ where: { AND: [where, { receiptType: 'DEPOSIT' }] } }),
      this.prisma.financeReceipt.count({ where: { AND: [where, { approvalStatus: FinanceApprovalStatus.APPROVED }] } }),
    ]);
    return {
      count,
      totalAmount: Number(total._sum.receiptAmount ?? 0),
      draft,
      deposit,
      approved,
    };
  }

  private async paymentSummaryFromDb(where: Prisma.FinancePaymentWhereInput) {
    const [count, total, draft, approved, rejected] = await Promise.all([
      this.prisma.financePayment.count({ where }),
      this.prisma.financePayment.aggregate({ where, _sum: { paymentAmount: true } }),
      this.prisma.financePayment.count({ where: { AND: [where, { approvalStatus: FinanceApprovalStatus.DRAFT }] } }),
      this.prisma.financePayment.count({ where: { AND: [where, { approvalStatus: FinanceApprovalStatus.APPROVED }] } }),
      this.prisma.financePayment.count({ where: { AND: [where, { approvalStatus: FinanceApprovalStatus.REJECTED }] } }),
    ]);
    return {
      count,
      totalAmount: Number(total._sum.paymentAmount ?? 0),
      draft,
      approved,
      rejected,
    };
  }

  private async invoiceSummaryFromDb(where: Prisma.FinanceInvoiceWhereInput) {
    const [count, total, pending, approved, rejected] = await Promise.all([
      this.prisma.financeInvoice.count({ where }),
      this.prisma.financeInvoice.aggregate({ where, _sum: { totalAfterTax: true } }),
      this.prisma.financeInvoice.count({ where: { AND: [where, { approvalStatus: FinanceApprovalStatus.PENDING }] } }),
      this.prisma.financeInvoice.count({ where: { AND: [where, { approvalStatus: FinanceApprovalStatus.APPROVED }] } }),
      this.prisma.financeInvoice.count({ where: { AND: [where, { approvalStatus: FinanceApprovalStatus.REJECTED }] } }),
    ]);
    return {
      count,
      totalAmount: Number(total._sum.totalAfterTax ?? 0),
      pending,
      approved,
      rejected,
    };
  }

  private async cashflowSummaryFromDb(where: Prisma.FinanceCashflowEntryWhereInput) {
    const groups = await this.prisma.financeCashflowEntry.groupBy({
      by: ['entryType', 'paymentMethod'],
      where,
      _sum: { amount: true },
    });
    const byMethodMap = new Map<string, { method: string; receipt: number; payment: number }>();
    let totalReceipt = 0;
    let totalPayment = 0;
    for (const group of groups) {
      const amount = Number(group._sum.amount ?? 0);
      const current = byMethodMap.get(group.paymentMethod) || { method: group.paymentMethod, receipt: 0, payment: 0 };
      if (group.entryType === FinanceCashflowEntryType.RECEIPT) {
        totalReceipt += amount;
        current.receipt += amount;
      } else {
        totalPayment += amount;
        current.payment += amount;
      }
      byMethodMap.set(group.paymentMethod, current);
    }
    return {
      totalReceipt,
      totalPayment,
      netCashflow: totalReceipt - totalPayment,
      byMethod: Array.from(byMethodMap.values()),
    };
  }

  private receiptWhere(query: Record<string, string>): Prisma.FinanceReceiptWhereInput {
    const search = normalizeListSearch(query.search);
    const contains = search ? containsSearch(search) : undefined;
    return {
      deletedAt: null,
      ...(query.status ? { approvalStatus: query.status as never } : {}),
      ...(query.receiptType ? { receiptType: query.receiptType as never } : {}),
      ...(query.tourId ? { tourId: query.tourId } : {}),
      ...(query.paymentMethod ? { paymentMethod: query.paymentMethod as never } : {}),
      ...(query.branch ? { branch: { contains: query.branch, mode: 'insensitive' } } : {}),
      ...(query.assignedStaff ? { assignedStaff: { contains: query.assignedStaff, mode: 'insensitive' } } : {}),
      ...(query.minAmount || query.maxAmount ? { receiptAmount: { gte: this.decimalOrUndefined(query.minAmount), lte: this.decimalOrUndefined(query.maxAmount) } } : {}),
      ...(contains ? { OR: [{ receiptCode: contains }, { receiptName: contains }, { payerName: contains }, { payerPhone: contains }, { payerEmail: contains }, { orders: { some: { tourCode: contains } } }] } : {}),
      ...this.dateRange('paymentDate', query.from, query.to),
    };
  }

  private paymentWhere(query: Record<string, string>): Prisma.FinancePaymentWhereInput {
    const search = normalizeListSearch(query.search);
    const contains = search ? containsSearch(search) : undefined;
    return {
      deletedAt: null,
      ...(query.status ? { approvalStatus: query.status as never } : {}),
      ...(query.voucherType ? { voucherType: query.voucherType as never } : {}),
      ...(query.tourId ? { tourId: query.tourId } : {}),
      ...(query.paymentMethod ? { paymentMethod: query.paymentMethod as never } : {}),
      ...(query.branch ? { branch: { contains: query.branch, mode: 'insensitive' } } : {}),
      ...(query.assignedStaff ? { assignedStaff: { contains: query.assignedStaff, mode: 'insensitive' } } : {}),
      ...(query.minAmount || query.maxAmount ? { paymentAmount: { gte: this.decimalOrUndefined(query.minAmount), lte: this.decimalOrUndefined(query.maxAmount) } } : {}),
      ...(contains ? { OR: [{ voucherCode: contains }, { voucherName: contains }, { receiverName: contains }, { receiverPhone: contains }, { receiverEmail: contains }] } : {}),
      ...this.dateRange('paymentDate', query.from, query.to),
    };
  }

  private invoiceWhere(query: Record<string, string>): Prisma.FinanceInvoiceWhereInput {
    const search = normalizeListSearch(query.search);
    const contains = search ? containsSearch(search) : undefined;
    return {
      deletedAt: null,
      ...(query.status ? { approvalStatus: query.status as never } : {}),
      ...(query.invoiceType ? { invoiceType: query.invoiceType as never } : {}),
      ...(query.tourId ? { tourId: query.tourId } : {}),
      ...(query.minAmount || query.maxAmount ? { totalAfterTax: { gte: this.decimalOrUndefined(query.minAmount), lte: this.decimalOrUndefined(query.maxAmount) } } : {}),
      ...(contains ? { OR: [{ invoiceCode: contains }, { invoiceNumber: contains }, { systemCode: contains }, { taxCode: contains }, { customerName: contains }, { customerPhone: contains }, { note: contains }] } : {}),
      ...this.dateRange('issuedDate', query.from, query.to),
    };
  }

  private invoiceScopeWhere(where: Prisma.FinanceInvoiceWhereInput, user?: RequestUser): Prisma.FinanceInvoiceWhereInput {
    if (!user || hasUnrestrictedDataScope(user)) return where;
    return {
      AND: [
        where,
        {
          OR: [
            { customer: { is: branchDepartmentScopeWhere<Prisma.CustomerWhereInput>({}, user) } },
            { order: { is: branchDepartmentScopeWhere<Prisma.OrderWhereInput>({ deletedAt: null }, user) } },
            { tour: { is: branchDepartmentScopeWhere<Prisma.TourWhereInput>({ deletedAt: null }, user) } },
            { receipt: { is: branchDepartmentScopeWhere<Prisma.FinanceReceiptWhereInput>({ deletedAt: null }, user) } },
          ],
        },
      ],
    };
  }

  private async assertInvoiceWriteScope(tx: Prisma.TransactionClient, dto: AnyRecord, user?: RequestUser) {
    if (!user || hasUnrestrictedDataScope(user)) return;
    const links = [
      {
        id: this.text(dto.customerId),
        exists: async (id: string) => tx.customer.findFirst({ where: branchDepartmentScopeWhere<Prisma.CustomerWhereInput>({ id, mergedIntoId: null }, user), select: { id: true } }),
      },
      {
        id: this.text(dto.orderId),
        exists: async (id: string) => tx.order.findFirst({ where: branchDepartmentScopeWhere<Prisma.OrderWhereInput>({ id, deletedAt: null }, user), select: { id: true } }),
      },
      {
        id: this.text(dto.tourId),
        exists: async (id: string) => tx.tour.findFirst({ where: branchDepartmentScopeWhere<Prisma.TourWhereInput>({ id, deletedAt: null }, user), select: { id: true } }),
      },
      {
        id: this.text(dto.receiptId),
        exists: async (id: string) => tx.financeReceipt.findFirst({ where: branchDepartmentScopeWhere<Prisma.FinanceReceiptWhereInput>({ id, deletedAt: null }, user), select: { id: true } }),
      },
    ].filter((link): link is { id: string; exists: (id: string) => Promise<{ id: string } | null> } => Boolean(link.id));

    if (!links.length) throw new BadRequestException('Hóa đơn cần liên kết khách hàng, booking, tour hoặc phiếu thu trong phạm vi dữ liệu được phép');
    for (const link of links) {
      if (!(await link.exists(link.id))) throw new BadRequestException('Không thể ghi hóa đơn ngoài phạm vi dữ liệu được phép');
    }
  }

  private cashflowWhere(query: Record<string, string>): Prisma.FinanceCashflowEntryWhereInput {
    return {
      ...(query.entryType ? { entryType: query.entryType as never } : {}),
      ...(query.paymentMethod ? { paymentMethod: query.paymentMethod as never } : {}),
      ...(query.tourId ? { tourId: query.tourId } : {}),
      ...(query.branch ? { branch: { contains: query.branch, mode: 'insensitive' } } : {}),
      ...(query.department ? { department: { contains: query.department, mode: 'insensitive' } } : {}),
      ...(query.staff ? { staff: { contains: query.staff, mode: 'insensitive' } } : {}),
      ...this.dateRange('paymentDate', query.from, query.to),
    };
  }

  private async audit(tx: Prisma.TransactionClient, action: string, entity: string, entityId: string, metadata: unknown, user?: RequestUser) {
    await tx.auditLog.create({ data: { action, entity, entityId, actorId: user?.id, metadata: metadata as Prisma.InputJsonValue } });
  }

  private dateRange(field: 'paymentDate' | 'issuedDate', from?: string, to?: string) {
    if (!from && !to) return {};
    return { [field]: { ...(from ? { gte: this.queryDate(from, 'from') } : {}), ...(to ? { lte: this.endOfDateFilter(to) } : {}) } };
  }

  private queryDate(value: string | undefined, field: string) {
    if (!value) return undefined;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new BadRequestException(`${field} không hợp lệ`);
    return date;
  }

  private endOfDateFilter(value: string) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const date = this.queryDate(value, 'to')!;
      date.setUTCHours(23, 59, 59, 999);
      return date;
    }
    return this.queryDate(value, 'to')!;
  }

  private csv(rows: AnyRecord[], keys: string[]) {
    return `\uFEFF${[keys.join(','), ...rows.map((row) => keys.map((key) => this.csvCell(row[key])).join(','))].join('\r\n')}`;
  }

  private csvCell(value: unknown) {
    if (value instanceof Date) return value.toISOString();
    return `"${String(value ?? '').replaceAll('"', '""')}"`;
  }
  private async assertImportCodesAvailable(type: 'receipts' | 'payments', rows: AnyRecord[], field: 'receiptCode' | 'voucherCode', tx: Prisma.TransactionClient = this.prisma) {
    const codes = rows.map((row) => this.text(row[field])).filter((code): code is string => Boolean(code));
    const duplicate = codes.find((code, index) => codes.indexOf(code) !== index);
    if (duplicate) throw new BadRequestException(`Mã ${duplicate} bị trùng trong file import`);
    if (!codes.length) return;
    if (type === 'receipts') {
      const existing = await tx.financeReceipt.findFirst({ where: { receiptCode: { in: codes } }, select: { receiptCode: true } });
      if (existing) throw new BadRequestException(`Mã ${existing.receiptCode} đã tồn tại`);
    } else {
      const existing = await tx.financePayment.findFirst({ where: { voucherCode: { in: codes } }, select: { voucherCode: true } });
      if (existing) throw new BadRequestException(`Mã ${existing.voucherCode} đã tồn tại`);
    }
  }
  private adjustmentDirection(dto: AnyRecord) {
    const direction = this.text(dto.direction);
    if (direction !== 'INCREASE' && direction !== 'DECREASE') throw new BadRequestException('direction phải là INCREASE hoặc DECREASE');
    return direction;
  }

  private adjustmentAmount(dto: AnyRecord) {
    const amount = this.decimal(dto.amount);
    if (amount <= 0) throw new BadRequestException('amount phải lớn hơn 0');
    return amount;
  }

  private financeWriteInput(dto: AnyRecord) {
    return Object.fromEntries(Object.entries(dto).filter(([key]) => !PROTECTED_FINANCE_WRITE_FIELDS.has(key)));
  }

  private actor(user?: RequestUser) {
    return user?.username || user?.email || user?.id || 'system';
  }

  private text(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private decimal(value: unknown) {
    if (value == null || value === '') return 0;
    const number = Number(value);
    if (!Number.isFinite(number)) throw new BadRequestException('Số tiền không hợp lệ');
    if (number < 0) throw new BadRequestException('Số tiền không được âm');
    return number;
  }

  private decimalOrUndefined(value: unknown) {
    if (value == null || value === '') return undefined;
    return this.decimal(value);
  }

  private date(value: unknown, label = 'Ngày') {
    if (value instanceof Date) return value;
    if (value == null || value === '') return undefined;
    if (typeof value !== 'string') throw new BadRequestException(`${label} không hợp lệ`);
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new BadRequestException(`${label} không hợp lệ`);
    return date;
  }

  private enumValue(value: unknown, allowed: string[], fallback: string, label: string) {
    const normalized = this.text(value);
    if (!normalized) return fallback;
    if (!allowed.includes(normalized)) throw new BadRequestException(`${label} không hợp lệ`);
    return normalized;
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

  private async customerLedgerSummaryFromDb(where: Prisma.CustomerLedgerEntryWhereInput) {
    const total = await this.prisma.customerLedgerEntry.aggregate({
      where,
      _count: { _all: true },
      _sum: { debitAmount: true, creditAmount: true },
    });
    const debit = Number(total._sum.debitAmount ?? 0);
    const credit = Number(total._sum.creditAmount ?? 0);
    return { debit, credit, balance: debit - credit, count: total._count._all };
  }

  private async supplierLedgerSummaryFromDb(where: Prisma.SupplierLedgerEntryWhereInput) {
    const total = await this.prisma.supplierLedgerEntry.aggregate({
      where,
      _count: { _all: true },
      _sum: { debitAmount: true, creditAmount: true },
    });
    const paid = Number(total._sum.debitAmount ?? 0);
    const payable = Number(total._sum.creditAmount ?? 0);
    return { debit: payable, credit: paid, balance: payable - paid, count: total._count._all };
  }

  private async customerDebtRowsFromDb(where: Prisma.CustomerLedgerEntryWhereInput, take: number) {
    const grouped = await this.prisma.customerLedgerEntry.groupBy({
      by: ['customerId'],
      where,
      _sum: { debitAmount: true, creditAmount: true },
    });
    const rows = grouped
      .map((row) => {
        const debitTotal = Number(row._sum.debitAmount ?? 0);
        const creditTotal = Number(row._sum.creditAmount ?? 0);
        return { customerId: row.customerId, debitTotal, creditTotal, balance: debitTotal - creditTotal };
      })
      .filter((row) => row.balance !== 0)
      .sort((left, right) => right.balance - left.balance)
      .slice(0, take);
    const customers = await this.prisma.customer.findMany({
      where: { id: { in: rows.map((row) => row.customerId) } },
      select: { id: true, code: true, fullName: true, phone: true },
    });
    const entries = await this.prisma.customerLedgerEntry.findMany({
      where: { AND: [where, { customerId: { in: rows.map((row) => row.customerId) } }] },
      select: { customerId: true, debitAmount: true, creditAmount: true, dueDate: true, documentDate: true, createdAt: true },
      orderBy: [{ documentDate: 'desc' }, { createdAt: 'desc' }],
    });
    const customersById = new Map(customers.map((customer) => [customer.id, customer]));
    const entriesByCustomer = this.groupBy(entries, (entry) => entry.customerId);
    return rows.map((row) => {
      const customer = customersById.get(row.customerId);
      return {
        id: row.customerId,
        code: customer?.code || '',
        name: customer?.fullName || '',
        phone: customer?.phone || '',
        debitTotal: row.debitTotal,
        creditTotal: row.creditTotal,
        balance: row.balance,
        aging: this.debtAging(entriesByCustomer.get(row.customerId) || [], 'debitAmount', 'creditAmount'),
      };
    });
  }

  private async supplierDebtRowsFromDb(where: Prisma.SupplierLedgerEntryWhereInput, take: number) {
    const grouped = await this.prisma.supplierLedgerEntry.groupBy({
      by: ['supplierId'],
      where,
      _sum: { debitAmount: true, creditAmount: true },
    });
    const rows = grouped
      .map((row) => {
        const creditTotal = Number(row._sum.debitAmount ?? 0);
        const debitTotal = Number(row._sum.creditAmount ?? 0);
        return { supplierId: row.supplierId, debitTotal, creditTotal, balance: debitTotal - creditTotal };
      })
      .filter((row) => row.balance !== 0)
      .sort((left, right) => right.balance - left.balance)
      .slice(0, take);
    const suppliers = await this.prisma.supplier.findMany({
      where: { id: { in: rows.map((row) => row.supplierId) }, deletedAt: null },
      select: { id: true, supplierCode: true, name: true, phone: true },
    });
    const entries = await this.prisma.supplierLedgerEntry.findMany({
      where: { AND: [where, { supplierId: { in: rows.map((row) => row.supplierId) } }] },
      select: { supplierId: true, debitAmount: true, creditAmount: true, dueDate: true, documentDate: true, createdAt: true },
      orderBy: [{ documentDate: 'desc' }, { createdAt: 'desc' }],
    });
    const suppliersById = new Map(suppliers.map((supplier) => [supplier.id, supplier]));
    const entriesBySupplier = this.groupBy(entries, (entry) => entry.supplierId);
    return rows.map((row) => {
      const supplier = suppliersById.get(row.supplierId);
      return {
        id: row.supplierId,
        code: supplier?.supplierCode || '',
        name: supplier?.name || '',
        phone: supplier?.phone || undefined,
        debitTotal: row.debitTotal,
        creditTotal: row.creditTotal,
        balance: row.balance,
        aging: this.debtAging(entriesBySupplier.get(row.supplierId) || [], 'creditAmount', 'debitAmount'),
      };
    });
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

  private groupBy<T, K>(items: T[], keyOf: (item: T) => K) {
    const grouped = new Map<K, T[]>();
    for (const item of items) {
      const key = keyOf(item);
      const group = grouped.get(key) || [];
      group.push(item);
      grouped.set(key, group);
    }
    return grouped;
  }

  private balanceAging(balance: number) {
    return { current: balance, overdue1To30: 0, overdue31To60: 0, overdue61To90: 0, overdueOver90: 0, overdueTotal: 0 };
  }

  private take(value?: string) {
    if (value == null || value === '') return 300;
    const take = Number(value);
    if (!Number.isInteger(take) || take <= 0) throw new BadRequestException('take phải là số nguyên dương');
    return Math.min(take, 2000);
  }

}

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { FinanceApprovalStatus, FinanceCashflowEntryType, FinanceInvoiceStatus, OrderCostStatus, OrderPaymentStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { applyWriteDataScope, branchDepartmentScopeWhere, RequestUser } from '../auth/data-scope';

type AnyRecord = Record<string, unknown>;

@Injectable()
export class FinanceService {
  constructor(private readonly prisma: PrismaService) {}

  async listReceipts(query: Record<string, string>, user?: RequestUser) {
    const where = branchDepartmentScopeWhere(this.receiptWhere(query), user);
    const rows = await this.prisma.financeReceipt.findMany({
      where,
      include: { orders: true },
      orderBy: [{ updatedAt: 'desc' }, { receiptCode: 'asc' }],
      take: this.take(query.take),
    });
    const summaryRows = await this.prisma.financeReceipt.findMany({ where });
    return { rows, summary: this.receiptSummary(summaryRows) };
  }

  async receiptDetail(id: string, user?: RequestUser) {
    const row = await this.prisma.financeReceipt.findFirst({ where: branchDepartmentScopeWhere({ id, deletedAt: null }, user), include: { orders: true, cashflowEntries: true } });
    if (!row) throw new NotFoundException('Receipt not found');
    return row;
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
    if (current.approvalStatus === FinanceApprovalStatus.APPROVED && this.hasMoneyChange(dto)) {
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
      if (current.approvalStatus === FinanceApprovalStatus.APPROVED) return current;
      const receipt = await tx.financeReceipt.update({
        where: { id },
        data: { approvalStatus: 'APPROVED', approvedBy: actor, approvedAt: new Date(), lockedAt: new Date() },
        include: { orders: true },
      });
      const customerId = await this.resolveReceiptCustomer(tx, receipt);
      await tx.financeCashflowEntry.upsert({
        where: { sourceType_sourceId: { sourceType: 'RECEIPT', sourceId: id } },
        create: {
          sourceType: 'RECEIPT',
          sourceId: id,
          entryType: 'RECEIPT',
          amount: receipt.receiptAmount,
          paymentMethod: receipt.paymentMethod,
          paymentDate: receipt.paymentDate || new Date(),
          branch: receipt.branch,
          department: receipt.department,
          staff: receipt.assignedStaff,
          customerId,
          receiptId: id,
          note: receipt.reason,
        },
        update: {
          amount: receipt.receiptAmount,
          paymentMethod: receipt.paymentMethod,
          paymentDate: receipt.paymentDate || new Date(),
          branch: receipt.branch,
          department: receipt.department,
          staff: receipt.assignedStaff,
          customerId,
          receiptId: id,
          note: receipt.reason,
        },
      });
      if (customerId) {
        await tx.customerLedgerEntry.upsert({
          where: { sourceType_sourceId_entryType: { sourceType: 'FINANCE_RECEIPT', sourceId: id, entryType: 'CREDIT' } },
          create: {
            customerId,
            receiptId: id,
            orderId: receipt.orders.find((line) => line.orderId)?.orderId,
            sourceType: 'FINANCE_RECEIPT',
            sourceId: id,
            entryType: 'CREDIT',
            creditAmount: receipt.receiptAmount,
            documentCode: receipt.receiptCode,
            documentDate: receipt.paymentDate || new Date(),
            branch: receipt.branch,
            department: receipt.department,
            staff: receipt.assignedStaff,
            description: receipt.reason || receipt.receiptName,
            createdBy: actor,
          },
          update: {
            customerId,
            creditAmount: receipt.receiptAmount,
            documentCode: receipt.receiptCode,
            documentDate: receipt.paymentDate || new Date(),
            branch: receipt.branch,
            department: receipt.department,
            staff: receipt.assignedStaff,
            description: receipt.reason || receipt.receiptName,
          },
        });
      }
      for (const line of receipt.orders) {
        if (line.orderId) await this.applyOrderReceipt(tx, line.orderId, Number(line.amount));
      }
      await this.audit(tx, 'APPROVE', 'FinanceReceipt', id, { actor, note: this.text(dto.note) });
      return receipt;
    });
  }

  async rejectReceipt(id: string, dto: AnyRecord, user?: RequestUser) {
    return this.changeReceiptStatus(id, 'REJECTED', dto, user);
  }

  async cancelReceipt(id: string, dto: AnyRecord, user?: RequestUser) {
    const actor = this.text(dto.actor) || 'accounting';
    const reason = this.text(dto.reason) || this.text(dto.note) || 'Cancel approved receipt';
    return this.prisma.$transaction(async (tx) => {
      const receipt = await tx.financeReceipt.findFirst({ where: branchDepartmentScopeWhere({ id }, user), include: { orders: true } });
      if (!receipt) throw new NotFoundException('Receipt not found');
      if (receipt.approvalStatus !== FinanceApprovalStatus.APPROVED) throw new BadRequestException('Only approved receipt can be cancelled');
      if (receipt.cancelledAt) return receipt;
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
      await tx.financeCashflowEntry.create({
        data: { sourceType: 'RECEIPT_REVERSAL', sourceId: reversal.id, entryType: 'PAYMENT', amount: receipt.receiptAmount, paymentMethod: receipt.paymentMethod, paymentDate: new Date(), branch: receipt.branch, department: receipt.department, staff: actor, customerId: receipt.customerId, receiptId: reversal.id, note: reason },
      });
      const customerId = await this.resolveReceiptCustomer(tx, receipt);
      if (customerId) {
        const original = await tx.customerLedgerEntry.findUnique({ where: { sourceType_sourceId_entryType: { sourceType: 'FINANCE_RECEIPT', sourceId: id, entryType: 'CREDIT' } } });
        await tx.customerLedgerEntry.create({
          data: { customerId, receiptId: reversal.id, sourceType: 'FINANCE_RECEIPT', sourceId: reversal.id, entryType: 'REVERSAL', debitAmount: receipt.receiptAmount, documentCode: reversalCode, documentDate: new Date(), description: reason, reversedEntryId: original?.id, createdBy: actor },
        });
      }
      await this.audit(tx, 'CANCEL', 'FinanceReceipt', id, { actor, reason, reversalId: reversal.id });
      return tx.financeReceipt.findUnique({ where: { id }, include: { reversals: true } });
    });
  }

  async listPayments(query: Record<string, string>, user?: RequestUser) {
    const where = branchDepartmentScopeWhere(this.paymentWhere(query), user);
    const rows = await this.prisma.financePayment.findMany({ where, orderBy: [{ updatedAt: 'desc' }, { voucherCode: 'asc' }], take: this.take(query.take) });
    const summaryRows = await this.prisma.financePayment.findMany({ where });
    return { rows, summary: this.paymentSummary(summaryRows) };
  }

  async paymentDetail(id: string, user?: RequestUser) {
    const row = await this.prisma.financePayment.findFirst({ where: branchDepartmentScopeWhere({ id, deletedAt: null }, user), include: { cashflowEntries: true } });
    if (!row) throw new NotFoundException('Payment not found');
    return row;
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
    if (current.approvalStatus === FinanceApprovalStatus.APPROVED && this.hasMoneyChange(dto)) {
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
      if (current.approvalStatus === FinanceApprovalStatus.APPROVED) return current;
      const payment = await tx.financePayment.update({
        where: { id },
        data: { approvalStatus: 'APPROVED', approvedBy: actor, approvedAt: new Date(), lockedAt: new Date() },
      });
      const supplierId = await this.resolvePaymentSupplier(tx, payment);
      await tx.financeCashflowEntry.upsert({
        where: { sourceType_sourceId: { sourceType: 'PAYMENT', sourceId: id } },
        create: {
          sourceType: 'PAYMENT',
          sourceId: id,
          entryType: 'PAYMENT',
          amount: payment.paymentAmount,
          paymentMethod: payment.paymentMethod,
          paymentDate: payment.paymentDate || new Date(),
          branch: payment.branch,
          department: payment.department,
          staff: payment.assignedStaff,
          orderId: payment.orderId,
          supplierId,
          paymentId: id,
          note: payment.reason,
        },
        update: {
          amount: payment.paymentAmount,
          paymentMethod: payment.paymentMethod,
          paymentDate: payment.paymentDate || new Date(),
          branch: payment.branch,
          department: payment.department,
          staff: payment.assignedStaff,
          orderId: payment.orderId,
          supplierId,
          paymentId: id,
          note: payment.reason,
        },
      });
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
      if (payment.orderId) await this.applyOrderPayment(tx, payment.orderId, Number(payment.paymentAmount));
      await this.audit(tx, 'APPROVE', 'FinancePayment', id, { actor, note: this.text(dto.note) });
      return payment;
    });
  }

  async rejectPayment(id: string, dto: AnyRecord, user?: RequestUser) {
    return this.changePaymentStatus(id, 'REJECTED', dto, user);
  }

  async cancelPayment(id: string, dto: AnyRecord, user?: RequestUser) {
    const actor = this.text(dto.actor) || 'accounting';
    const reason = this.text(dto.reason) || this.text(dto.note) || 'Cancel approved payment';
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.financePayment.findFirst({ where: branchDepartmentScopeWhere({ id }, user) });
      if (!payment) throw new NotFoundException('Payment not found');
      if (payment.approvalStatus !== FinanceApprovalStatus.APPROVED) throw new BadRequestException('Only approved payment can be cancelled');
      if (payment.cancelledAt) return payment;
      const reversalCode = await this.nextCode(tx, 'FINANCE_PAYMENT', 'PCDC', new Date(), payment.branch || undefined);
      const reversal = await tx.financePayment.create({
        data: { voucherCode: reversalCode, voucherName: `Dao ${payment.voucherCode}`, voucherType: payment.voucherType, paymentDate: new Date(), paymentMethod: payment.paymentMethod, supplierId: payment.supplierId, operationVoucherId: payment.operationVoucherId, orderId: payment.orderId, receiverName: payment.receiverName, reason, totalAmount: payment.paymentAmount, paymentAmount: payment.paymentAmount, approvalStatus: 'APPROVED', approvedBy: actor, approvedAt: new Date(), lockedAt: new Date(), reversalOfId: id, createdBy: actor },
      });
      await tx.financePayment.update({ where: { id }, data: { approvalStatus: 'CANCELLED', cancelledBy: actor, cancelledAt: new Date(), cancelReason: reason } });
      await tx.financeCashflowEntry.create({
        data: { sourceType: 'PAYMENT_REVERSAL', sourceId: reversal.id, entryType: 'RECEIPT', amount: payment.paymentAmount, paymentMethod: payment.paymentMethod, paymentDate: new Date(), branch: payment.branch, department: payment.department, staff: actor, orderId: payment.orderId, supplierId: payment.supplierId, paymentId: reversal.id, note: reason },
      });
      const supplierId = await this.resolvePaymentSupplier(tx, payment);
      if (supplierId) {
        const original = await tx.supplierLedgerEntry.findUnique({ where: { sourceType_sourceId_entryType: { sourceType: 'FINANCE_PAYMENT', sourceId: id, entryType: 'DEBIT' } } });
        await tx.supplierLedgerEntry.create({ data: { supplierId, paymentId: reversal.id, orderId: payment.orderId, operationVoucherId: payment.operationVoucherId, sourceType: 'FINANCE_PAYMENT', sourceId: reversal.id, entryType: 'REVERSAL', creditAmount: payment.paymentAmount, documentCode: reversalCode, documentDate: new Date(), description: reason, reversedEntryId: original?.id, createdBy: actor } });
      }
      await this.audit(tx, 'CANCEL', 'FinancePayment', id, { actor, reason, reversalId: reversal.id });
      return tx.financePayment.findUnique({ where: { id }, include: { reversals: true } });
    });
  }

  async listInvoices(query: Record<string, string>) {
    const where = this.invoiceWhere(query);
    const rows = await this.prisma.financeInvoice.findMany({ where, include: { items: true }, orderBy: [{ updatedAt: 'desc' }, { invoiceCode: 'asc' }], take: this.take(query.take) });
    const summaryRows = await this.prisma.financeInvoice.findMany({ where });
    return { rows, summary: this.invoiceSummary(summaryRows) };
  }

  async invoiceDetail(id: string) {
    const row = await this.prisma.financeInvoice.findFirst({ where: { id, deletedAt: null }, include: { items: true } });
    if (!row) throw new NotFoundException('Invoice not found');
    return row;
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
    if (current.approvalStatus === FinanceApprovalStatus.APPROVED && this.hasMoneyChange(dto)) throw new BadRequestException('Approved invoice amount cannot be edited');
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
      if (current.approvalStatus === FinanceApprovalStatus.APPROVED) return current;
      const invoice = await tx.financeInvoice.update({ where: { id }, data: { status: 'APPROVED', approvalStatus: 'APPROVED', approvedBy: actor, approvedAt: new Date() } });
      const customerId = await this.resolveInvoiceCustomer(tx, invoice);
      if (customerId) {
        await tx.customerLedgerEntry.upsert({
          where: { sourceType_sourceId_entryType: { sourceType: 'FINANCE_INVOICE', sourceId: id, entryType: 'DEBIT' } },
          create: {
            customerId,
            invoiceId: id,
            orderId: invoice.orderId,
            sourceType: 'FINANCE_INVOICE',
            sourceId: id,
            entryType: 'DEBIT',
            debitAmount: invoice.totalAfterTax,
            documentCode: invoice.invoiceNumber || invoice.invoiceCode,
            documentDate: invoice.issuedDate || invoice.invoiceDate || new Date(),
            description: invoice.note || invoice.companyName || invoice.customerName,
            createdBy: actor,
          },
          update: {
            customerId,
            debitAmount: invoice.totalAfterTax,
            documentCode: invoice.invoiceNumber || invoice.invoiceCode,
            documentDate: invoice.issuedDate || invoice.invoiceDate || new Date(),
            description: invoice.note || invoice.companyName || invoice.customerName,
          },
        });
      }
      await this.audit(tx, 'APPROVE', 'FinanceInvoice', id, { actor, note: this.text(dto.note) });
      return invoice;
    });
  }

  async rejectInvoice(id: string, dto: AnyRecord) {
    const actor = this.text(dto.actor) || 'accounting';
    return this.prisma.$transaction(async (tx) => {
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
      if (invoice.approvalStatus !== FinanceApprovalStatus.APPROVED) throw new BadRequestException('Only approved invoice can be cancelled');
      if (invoice.cancelledAt) return invoice;
      const reversalCode = await this.nextCode(tx, 'FINANCE_INVOICE', 'VATDC', new Date(), undefined);
      const reversal = await tx.financeInvoice.create({
        data: { invoiceCode: reversalCode, systemCode: invoice.systemCode, orderId: invoice.orderId, receiptId: invoice.receiptId, customerId: invoice.customerId, customerName: invoice.customerName, customerPhone: invoice.customerPhone, customerEmail: invoice.customerEmail, invoiceType: 'ADJUSTMENT', issuedDate: new Date(), totalBeforeTax: invoice.totalBeforeTax, totalTax: invoice.totalTax, totalAfterTax: invoice.totalAfterTax, amountInWords: invoice.amountInWords, status: 'APPROVED', approvalStatus: 'APPROVED', approvedBy: actor, approvedAt: new Date(), reversalOfId: id, note: reason, createdBy: actor },
      });
      await tx.financeInvoice.update({ where: { id }, data: { status: 'CANCELLED', approvalStatus: 'CANCELLED', cancelledBy: actor, cancelledAt: new Date(), cancelReason: reason } });
      const customerId = await this.resolveInvoiceCustomer(tx, invoice);
      if (customerId) {
        const original = await tx.customerLedgerEntry.findUnique({ where: { sourceType_sourceId_entryType: { sourceType: 'FINANCE_INVOICE', sourceId: id, entryType: 'DEBIT' } } });
        await tx.customerLedgerEntry.create({ data: { customerId, invoiceId: reversal.id, orderId: invoice.orderId, sourceType: 'FINANCE_INVOICE', sourceId: reversal.id, entryType: 'REVERSAL', creditAmount: invoice.totalAfterTax, documentCode: reversalCode, documentDate: new Date(), description: reason, reversedEntryId: original?.id, createdBy: actor } });
      }
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
    const rows = await this.prisma.customerLedgerEntry.findMany({ where, include: { customer: true, order: true, receipt: true, invoice: true }, orderBy: [{ documentDate: 'desc' }, { createdAt: 'desc' }], take: this.take(query.take) });
    return { rows, summary: this.ledgerSummary(rows) };
  }

  async supplierDebt(query: Record<string, string>, user?: RequestUser) {
    const where = branchDepartmentScopeWhere<Prisma.SupplierLedgerEntryWhereInput>({
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(query.from || query.to ? { documentDate: { gte: this.date(query.from), lte: this.date(query.to) } } : {}),
    }, user);
    const rows = await this.prisma.supplierLedgerEntry.findMany({ where, include: { supplier: true, order: true, operationVoucher: true, payment: true }, orderBy: [{ documentDate: 'desc' }, { createdAt: 'desc' }], take: this.take(query.take) });
    return { rows, summary: this.ledgerSummary(rows) };
  }

  importPlaceholder(type: string, dto: AnyRecord) {
    return { type, imported: 0, message: 'CSV/XLSX parser placeholder; upload binary storage is not enabled yet.', receivedRows: Array.isArray(dto.rows) ? dto.rows.length : 0 };
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

  private async applyOrderReceipt(tx: Prisma.TransactionClient, orderId: string, amount: number) {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order) return;
    const paidAmount = Number(order.paidAmount) + amount;
    const remainingRevenue = Math.max(Number(order.totalRevenue) - paidAmount, 0);
    await tx.order.update({ where: { id: orderId }, data: { paidAmount, remainingRevenue, paymentStatus: remainingRevenue <= 0 ? OrderPaymentStatus.PAID : OrderPaymentStatus.PARTIAL } });
  }

  private async applyOrderPayment(tx: Prisma.TransactionClient, orderId: string, amount: number) {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order) return;
    const paidCost = Number(order.paidCost) + amount;
    const remainingCost = Math.max(Number(order.totalCost) - paidCost, 0);
    await tx.order.update({ where: { id: orderId }, data: { paidCost, remainingCost, costStatus: remainingCost <= 0 ? OrderCostStatus.PAID : OrderCostStatus.PARTIAL } });
  }

  private async resolveReceiptCustomer(tx: Prisma.TransactionClient, receipt: { customerId: string | null; orders: { orderId: string | null }[] }) {
    if (receipt.customerId) return receipt.customerId;
    const orderId = receipt.orders.find((line) => line.orderId)?.orderId;
    if (!orderId) return null;
    const order = await tx.order.findUnique({ where: { id: orderId }, select: { customerId: true } });
    return order?.customerId || null;
  }

  private async resolvePaymentSupplier(tx: Prisma.TransactionClient, payment: { supplierId: string | null; operationVoucherId: string | null }) {
    if (payment.supplierId) return payment.supplierId;
    if (!payment.operationVoucherId) return null;
    const voucher = await tx.operationVoucher.findUnique({ where: { id: payment.operationVoucherId }, select: { supplierId: true } });
    return voucher?.supplierId || null;
  }

  private async resolveInvoiceCustomer(tx: Prisma.TransactionClient, invoice: { customerId: string | null; orderId: string | null }) {
    if (invoice.customerId) return invoice.customerId;
    if (!invoice.orderId) return null;
    const order = await tx.order.findUnique({ where: { id: invoice.orderId }, select: { customerId: true } });
    return order?.customerId || null;
  }

  private async changeReceiptStatus(id: string, status: FinanceApprovalStatus, dto: AnyRecord, user?: RequestUser) {
    const actor = this.text(dto.actor) || 'accounting';
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.financeReceipt.findFirst({ where: branchDepartmentScopeWhere({ id }, user), select: { id: true } });
      if (!current) throw new NotFoundException('Receipt not found');
      const receipt = await tx.financeReceipt.update({ where: { id }, data: { approvalStatus: status, approvedBy: actor, approvedAt: new Date() } });
      await this.audit(tx, status === 'REJECTED' ? 'REJECT' : 'STATUS', 'FinanceReceipt', id, { actor, status, note: this.text(dto.note) });
      return receipt;
    });
  }

  private async changePaymentStatus(id: string, status: FinanceApprovalStatus, dto: AnyRecord, user?: RequestUser) {
    const actor = this.text(dto.actor) || 'accounting';
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.financePayment.findFirst({ where: branchDepartmentScopeWhere({ id }, user), select: { id: true } });
      if (!current) throw new NotFoundException('Payment not found');
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

  private receiptSummary(rows: { receiptAmount: Prisma.Decimal; approvalStatus: FinanceApprovalStatus; receiptType: unknown }[]) {
    return {
      count: rows.length,
      totalAmount: rows.reduce((sum, row) => sum + Number(row.receiptAmount), 0),
      draft: rows.filter((row) => row.approvalStatus === 'DRAFT').length,
      deposit: rows.filter((row) => row.receiptType === 'DEPOSIT').length,
      approved: rows.filter((row) => row.approvalStatus === 'APPROVED').length,
    };
  }

  private paymentSummary(rows: { paymentAmount: Prisma.Decimal; approvalStatus: FinanceApprovalStatus }[]) {
    return { count: rows.length, totalAmount: rows.reduce((sum, row) => sum + Number(row.paymentAmount), 0), draft: rows.filter((row) => row.approvalStatus === 'DRAFT').length, approved: rows.filter((row) => row.approvalStatus === 'APPROVED').length, rejected: rows.filter((row) => row.approvalStatus === 'REJECTED').length };
  }

  private invoiceSummary(rows: { totalAfterTax: Prisma.Decimal; approvalStatus: FinanceApprovalStatus }[]) {
    return { count: rows.length, totalAmount: rows.reduce((sum, row) => sum + Number(row.totalAfterTax), 0), pending: rows.filter((row) => row.approvalStatus === 'PENDING').length, approved: rows.filter((row) => row.approvalStatus === 'APPROVED').length, rejected: rows.filter((row) => row.approvalStatus === 'REJECTED').length };
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

  private take(value?: string) {
    const take = Number(value || 300);
    return Math.min(Number.isFinite(take) ? take : 300, 2000);
  }

  private hasMoneyChange(dto: AnyRecord) {
    return ['totalAmount', 'paidBefore', 'receiptAmount', 'paymentAmount', 'items'].some((key) => key in dto);
  }
}

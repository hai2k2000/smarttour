import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

function assertPositiveAmount(value: Prisma.Decimal, label: string) {
  if (Number(value) <= 0) throw new BadRequestException(`${label} phải lớn hơn 0 trước khi ghi nhận công nợ`);
}

type ReceiptForCustomerLedger = {
  id: string;
  receiptAmount: Prisma.Decimal;
  receiptCode: string;
  receiptName: string | null;
  paymentDate: Date | null;
  reason: string | null;
  branch: string | null;
  department: string | null;
  assignedStaff: string | null;
  orders: { orderId: string | null }[];
  tourId?: string | null;
};

type InvoiceForCustomerLedger = {
  id: string;
  orderId: string | null;
  invoiceNumber: string | null;
  invoiceCode: string;
  issuedDate: Date | null;
  invoiceDate: Date | null;
  totalAfterTax: Prisma.Decimal;
  note: string | null;
  companyName: string | null;
  customerName: string | null;
  branch?: string | null;
  department?: string | null;
  tourId?: string | null;
};

export async function upsertReceiptCustomerLedger(
  tx: Prisma.TransactionClient,
  receipt: ReceiptForCustomerLedger,
  customerId: string | null,
  actor: string,
) {
  if (!customerId) return;
  assertPositiveAmount(receipt.receiptAmount, 'Số tiền phiếu thu');

  await tx.customerLedgerEntry.upsert({
    where: { sourceType_sourceId_entryType: { sourceType: 'FINANCE_RECEIPT', sourceId: receipt.id, entryType: 'CREDIT' } },
    create: {
      customerId,
      receiptId: receipt.id,
      orderId: receipt.orders.find((line) => line.orderId)?.orderId,
      tourId: receipt.tourId,
      sourceType: 'FINANCE_RECEIPT',
      sourceId: receipt.id,
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
      tourId: receipt.tourId,
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

export async function createReceiptReversalCustomerLedger(
  tx: Prisma.TransactionClient,
  receipt: ReceiptForCustomerLedger,
  reversalId: string,
  customerId: string | null,
  reversalCode: string,
  reason: string,
  actor: string,
) {
  if (!customerId) return;
  assertPositiveAmount(receipt.receiptAmount, 'Số tiền đảo phiếu thu');

  const original = await tx.customerLedgerEntry.findUnique({
    where: { sourceType_sourceId_entryType: { sourceType: 'FINANCE_RECEIPT', sourceId: receipt.id, entryType: 'CREDIT' } },
  });
  if (!original) throw new BadRequestException('Không tìm thấy bút toán công nợ gốc của phiếu thu');
  await tx.customerLedgerEntry.create({
    data: {
      customerId,
      receiptId: reversalId,
      orderId: receipt.orders.find((line) => line.orderId)?.orderId,
      tourId: receipt.tourId,
      sourceType: 'FINANCE_RECEIPT',
      sourceId: reversalId,
      entryType: 'REVERSAL',
      debitAmount: receipt.receiptAmount,
      documentCode: reversalCode,
      documentDate: new Date(),
      branch: receipt.branch,
      department: receipt.department,
      staff: actor,
      description: reason,
      reversedEntryId: original?.id,
      createdBy: actor,
    },
  });
}

export async function upsertInvoiceCustomerLedger(
  tx: Prisma.TransactionClient,
  invoice: InvoiceForCustomerLedger,
  customerId: string | null,
  actor: string,
) {
  if (!customerId) throw new BadRequestException('Hóa đơn phải có khách hàng hợp lệ trước khi ghi nhận công nợ');
  assertPositiveAmount(invoice.totalAfterTax, 'Tổng tiền hóa đơn');

  await tx.customerLedgerEntry.upsert({
    where: { sourceType_sourceId_entryType: { sourceType: 'FINANCE_INVOICE', sourceId: invoice.id, entryType: 'DEBIT' } },
    create: {
      customerId,
      invoiceId: invoice.id,
      orderId: invoice.orderId,
      tourId: invoice.tourId,
      sourceType: 'FINANCE_INVOICE',
      sourceId: invoice.id,
      entryType: 'DEBIT',
      debitAmount: invoice.totalAfterTax,
      documentCode: invoice.invoiceNumber || invoice.invoiceCode,
      documentDate: invoice.issuedDate || invoice.invoiceDate || new Date(),
      branch: invoice.branch,
      department: invoice.department,
      description: invoice.note || invoice.companyName || invoice.customerName,
      createdBy: actor,
    },
    update: {
      customerId,
      tourId: invoice.tourId,
      debitAmount: invoice.totalAfterTax,
      documentCode: invoice.invoiceNumber || invoice.invoiceCode,
      documentDate: invoice.issuedDate || invoice.invoiceDate || new Date(),
      branch: invoice.branch,
      department: invoice.department,
      description: invoice.note || invoice.companyName || invoice.customerName,
    },
  });
}

export async function createInvoiceReversalCustomerLedger(
  tx: Prisma.TransactionClient,
  invoice: InvoiceForCustomerLedger,
  reversalId: string,
  customerId: string | null,
  reversalCode: string,
  reason: string,
  actor: string,
) {
  if (!customerId) throw new BadRequestException('Hóa đơn phải có khách hàng hợp lệ trước khi hoàn tác công nợ');
  assertPositiveAmount(invoice.totalAfterTax, 'Tổng tiền đảo hóa đơn');

  const original = await tx.customerLedgerEntry.findUnique({
    where: { sourceType_sourceId_entryType: { sourceType: 'FINANCE_INVOICE', sourceId: invoice.id, entryType: 'DEBIT' } },
  });
  if (!original) throw new BadRequestException('Không tìm thấy bút toán công nợ gốc của hóa đơn');
  await tx.customerLedgerEntry.create({
    data: {
      customerId,
      invoiceId: reversalId,
      orderId: invoice.orderId,
      tourId: invoice.tourId,
      sourceType: 'FINANCE_INVOICE',
      sourceId: reversalId,
      entryType: 'REVERSAL',
      creditAmount: invoice.totalAfterTax,
      documentCode: reversalCode,
      documentDate: new Date(),
      branch: invoice.branch,
      department: invoice.department,
      description: reason,
      reversedEntryId: original?.id,
      createdBy: actor,
    },
  });
}


type PaymentForSupplierLedger = {
  id: string;
  paymentAmount: Prisma.Decimal;
  voucherCode: string;
  voucherName: string | null;
  paymentDate: Date | null;
  reason: string | null;
  branch: string | null;
  department: string | null;
  assignedStaff: string | null;
  orderId: string | null;
  operationVoucherId: string | null;
  tourId?: string | null;
};

export async function upsertPaymentSupplierLedger(
  tx: Prisma.TransactionClient,
  payment: PaymentForSupplierLedger,
  supplierId: string | null,
  actor: string,
) {
  if (!supplierId) return;
  assertPositiveAmount(payment.paymentAmount, 'Số tiền phiếu chi');

  await tx.supplierLedgerEntry.upsert({
    where: { sourceType_sourceId_entryType: { sourceType: 'FINANCE_PAYMENT', sourceId: payment.id, entryType: 'DEBIT' } },
    create: {
      supplierId,
      paymentId: payment.id,
      orderId: payment.orderId,
      tourId: payment.tourId,
      operationVoucherId: payment.operationVoucherId,
      sourceType: 'FINANCE_PAYMENT',
      sourceId: payment.id,
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
      orderId: payment.orderId,
      tourId: payment.tourId,
      operationVoucherId: payment.operationVoucherId,
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

export async function createPaymentReversalSupplierLedger(
  tx: Prisma.TransactionClient,
  payment: PaymentForSupplierLedger,
  reversalId: string,
  supplierId: string | null,
  reversalCode: string,
  reason: string,
  actor: string,
) {
  if (!supplierId) return;
  assertPositiveAmount(payment.paymentAmount, 'Số tiền đảo phiếu chi');

  const original = await tx.supplierLedgerEntry.findUnique({
    where: { sourceType_sourceId_entryType: { sourceType: 'FINANCE_PAYMENT', sourceId: payment.id, entryType: 'DEBIT' } },
  });
  if (!original) throw new BadRequestException('Không tìm thấy bút toán công nợ gốc của phiếu chi');
  await tx.supplierLedgerEntry.create({
    data: {
      supplierId,
      paymentId: reversalId,
      orderId: payment.orderId,
      tourId: payment.tourId,
      operationVoucherId: payment.operationVoucherId,
      sourceType: 'FINANCE_PAYMENT',
      sourceId: reversalId,
      entryType: 'REVERSAL',
      creditAmount: payment.paymentAmount,
      documentCode: reversalCode,
      documentDate: new Date(),
      branch: payment.branch,
      department: payment.department,
      staff: actor,
      description: reason,
      reversedEntryId: original.id,
      createdBy: actor,
    },
  });
}

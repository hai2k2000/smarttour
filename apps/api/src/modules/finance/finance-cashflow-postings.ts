import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

function assertPositiveAmount(value: Prisma.Decimal, label: string) {
  if (Number(value) <= 0) throw new BadRequestException(`${label} phải lớn hơn 0 trước khi ghi nhận dòng tiền`);
}

export async function upsertReceiptCashflow(
  tx: Prisma.TransactionClient,
  receipt: {
    id: string;
    receiptAmount: Prisma.Decimal;
    paymentMethod: string;
    paymentDate: Date | null;
    branch: string | null;
    department: string | null;
    assignedStaff: string | null;
    reason: string | null;
    tourId?: string | null;
  },
  customerId: string | null,
) {
  assertPositiveAmount(receipt.receiptAmount, 'Số tiền phiếu thu');
  await tx.financeCashflowEntry.upsert({
    where: { sourceType_sourceId: { sourceType: 'RECEIPT', sourceId: receipt.id } },
    create: {
      sourceType: 'RECEIPT',
      sourceId: receipt.id,
      entryType: 'RECEIPT',
      amount: receipt.receiptAmount,
      paymentMethod: receipt.paymentMethod as never,
      paymentDate: receipt.paymentDate || new Date(),
      branch: receipt.branch,
      department: receipt.department,
      staff: receipt.assignedStaff,
      customerId,
      tourId: receipt.tourId,
      receiptId: receipt.id,
      note: receipt.reason,
    },
    update: {
      amount: receipt.receiptAmount,
      paymentMethod: receipt.paymentMethod as never,
      paymentDate: receipt.paymentDate || new Date(),
      branch: receipt.branch,
      department: receipt.department,
      staff: receipt.assignedStaff,
      customerId,
      tourId: receipt.tourId,
      receiptId: receipt.id,
      note: receipt.reason,
    },
  });
}

export async function createReceiptReversalCashflow(
  tx: Prisma.TransactionClient,
  receipt: {
    receiptAmount: Prisma.Decimal;
    paymentMethod: string;
    branch: string | null;
    department: string | null;
    tourId?: string | null;
  },
  reversalId: string,
  customerId: string | null,
  actor: string,
  reason: string,
) {
  assertPositiveAmount(receipt.receiptAmount, 'Số tiền đảo phiếu thu');
  await tx.financeCashflowEntry.create({
    data: {
      sourceType: 'RECEIPT_REVERSAL',
      sourceId: reversalId,
      entryType: 'PAYMENT',
      amount: receipt.receiptAmount,
      paymentMethod: receipt.paymentMethod as never,
      paymentDate: new Date(),
      branch: receipt.branch,
      department: receipt.department,
      staff: actor,
      customerId,
      tourId: receipt.tourId,
      receiptId: reversalId,
      note: reason,
    },
  });
}

export async function upsertPaymentCashflow(
  tx: Prisma.TransactionClient,
  payment: {
    id: string;
    paymentAmount: Prisma.Decimal;
    paymentMethod: string;
    paymentDate: Date | null;
    branch: string | null;
    department: string | null;
    assignedStaff: string | null;
    orderId: string | null;
    reason: string | null;
    tourId?: string | null;
  },
  supplierId: string | null,
) {
  assertPositiveAmount(payment.paymentAmount, 'Số tiền phiếu chi');
  await tx.financeCashflowEntry.upsert({
    where: { sourceType_sourceId: { sourceType: 'PAYMENT', sourceId: payment.id } },
    create: {
      sourceType: 'PAYMENT',
      sourceId: payment.id,
      entryType: 'PAYMENT',
      amount: payment.paymentAmount,
      paymentMethod: payment.paymentMethod as never,
      paymentDate: payment.paymentDate || new Date(),
      branch: payment.branch,
      department: payment.department,
      staff: payment.assignedStaff,
      orderId: payment.orderId,
      tourId: payment.tourId,
      supplierId,
      paymentId: payment.id,
      note: payment.reason,
    },
    update: {
      amount: payment.paymentAmount,
      paymentMethod: payment.paymentMethod as never,
      paymentDate: payment.paymentDate || new Date(),
      branch: payment.branch,
      department: payment.department,
      staff: payment.assignedStaff,
      orderId: payment.orderId,
      tourId: payment.tourId,
      supplierId,
      paymentId: payment.id,
      note: payment.reason,
    },
  });
}

export async function createPaymentReversalCashflow(
  tx: Prisma.TransactionClient,
  payment: {
    paymentAmount: Prisma.Decimal;
    paymentMethod: string;
    branch: string | null;
    department: string | null;
    orderId: string | null;
    tourId?: string | null;
  },
  reversalId: string,
  supplierId: string | null,
  actor: string,
  reason: string,
) {
  assertPositiveAmount(payment.paymentAmount, 'Số tiền đảo phiếu chi');
  await tx.financeCashflowEntry.create({
    data: {
      sourceType: 'PAYMENT_REVERSAL',
      sourceId: reversalId,
      entryType: 'RECEIPT',
      amount: payment.paymentAmount,
      paymentMethod: payment.paymentMethod as never,
      paymentDate: new Date(),
      branch: payment.branch,
      department: payment.department,
      staff: actor,
      orderId: payment.orderId,
      tourId: payment.tourId,
      supplierId,
      paymentId: reversalId,
      note: reason,
    },
  });
}

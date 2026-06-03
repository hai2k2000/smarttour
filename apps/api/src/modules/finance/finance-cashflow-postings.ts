import { Prisma } from '@prisma/client';

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
  },
  customerId: string | null,
) {
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
  },
  reversalId: string,
  customerId: string | null,
  actor: string,
  reason: string,
) {
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
  },
  supplierId: string | null,
) {
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
  },
  reversalId: string,
  supplierId: string | null,
  actor: string,
  reason: string,
) {
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
      supplierId,
      paymentId: reversalId,
      note: reason,
    },
  });
}

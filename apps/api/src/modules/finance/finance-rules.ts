import { FinanceApprovalStatus, Prisma } from '@prisma/client';

type AnyRecord = Record<string, unknown>;

export function hasMoneyChange(dto: AnyRecord) {
  return ['totalAmount', 'paidBefore', 'receiptAmount', 'paymentAmount', 'items'].some((key) => key in dto);
}

export function receiptSummary(rows: { receiptAmount: Prisma.Decimal; approvalStatus: FinanceApprovalStatus; receiptType: unknown }[]) {
  return {
    count: rows.length,
    totalAmount: rows.reduce((sum, row) => sum + Number(row.receiptAmount), 0),
    draft: rows.filter((row) => row.approvalStatus === 'DRAFT').length,
    deposit: rows.filter((row) => row.receiptType === 'DEPOSIT').length,
    approved: rows.filter((row) => row.approvalStatus === 'APPROVED').length,
  };
}

export function paymentSummary(rows: { paymentAmount: Prisma.Decimal; approvalStatus: FinanceApprovalStatus }[]) {
  return {
    count: rows.length,
    totalAmount: rows.reduce((sum, row) => sum + Number(row.paymentAmount), 0),
    draft: rows.filter((row) => row.approvalStatus === 'DRAFT').length,
    approved: rows.filter((row) => row.approvalStatus === 'APPROVED').length,
    rejected: rows.filter((row) => row.approvalStatus === 'REJECTED').length,
  };
}

export function invoiceSummary(rows: { totalAfterTax: Prisma.Decimal; approvalStatus: FinanceApprovalStatus }[]) {
  return {
    count: rows.length,
    totalAmount: rows.reduce((sum, row) => sum + Number(row.totalAfterTax), 0),
    pending: rows.filter((row) => row.approvalStatus === 'PENDING').length,
    approved: rows.filter((row) => row.approvalStatus === 'APPROVED').length,
    rejected: rows.filter((row) => row.approvalStatus === 'REJECTED').length,
  };
}

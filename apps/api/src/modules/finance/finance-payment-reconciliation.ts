import { OperationVoucherStatus, Prisma } from '@prisma/client';

export async function reconcileApprovedPayment(
  tx: Prisma.TransactionClient,
  payment: { id: string; operationVoucherId: string | null; paymentAmount: Prisma.Decimal },
) {
  await tx.supplierPaymentRequest.updateMany({ where: { financePaymentId: payment.id, status: 'APPROVED' }, data: { status: 'PAID' } });
  if (!payment.operationVoucherId) return;

  const voucher = await tx.operationVoucher.findUnique({ where: { id: payment.operationVoucherId } });
  if (!voucher) return;

  const existing = await tx.operationVoucherPayment.findFirst({ where: { voucherId: voucher.id, paymentVoucherId: payment.id } });
  if (existing) return;

  const amount = Math.min(Number(payment.paymentAmount), Number(voucher.remainAmount));
  if (amount <= 0) return;

  await tx.operationVoucherPayment.create({
    data: {
      voucherId: voucher.id,
      paymentVoucherId: payment.id,
      paidAmount: amount,
      paymentDate: new Date(),
      note: 'Duyet phieu chi tai chinh',
    },
  });

  const paidAmount = Number(voucher.paidAmount) + amount;
  const remainAmount = Math.max(Number(voucher.totalAmount) - paidAmount, 0);
  await tx.operationVoucher.update({
    where: { id: voucher.id },
    data: {
      paidAmount,
      remainAmount,
      status: remainAmount <= 0 ? OperationVoucherStatus.PAID : OperationVoucherStatus.PARTIAL,
    },
  });
}

export async function reconcileCancelledPayment(
  tx: Prisma.TransactionClient,
  payment: { id: string; operationVoucherId: string | null },
) {
  await tx.supplierPaymentRequest.updateMany({ where: { financePaymentId: payment.id, status: 'PAID' }, data: { status: 'APPROVED', financePaymentId: null } });
  if (!payment.operationVoucherId) return;

  const voucher = await tx.operationVoucher.findUnique({ where: { id: payment.operationVoucherId } });
  if (!voucher) return;

  const reconciled = await tx.operationVoucherPayment.findFirst({ where: { voucherId: voucher.id, paymentVoucherId: payment.id } });
  if (!reconciled) return;

  await tx.operationVoucherPayment.delete({ where: { id: reconciled.id } });

  const paidAmount = Math.max(Number(voucher.paidAmount) - Number(reconciled.paidAmount), 0);
  const remainAmount = Math.max(Number(voucher.totalAmount) - paidAmount, 0);
  await tx.operationVoucher.update({
    where: { id: voucher.id },
    data: {
      paidAmount,
      remainAmount,
      status: remainAmount <= 0 ? OperationVoucherStatus.PAID : paidAmount > 0 ? OperationVoucherStatus.PARTIAL : OperationVoucherStatus.PENDING,
    },
  });
}

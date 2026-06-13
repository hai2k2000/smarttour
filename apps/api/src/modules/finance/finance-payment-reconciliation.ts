import { BadRequestException } from '@nestjs/common';
import { OperationVoucherStatus, Prisma } from '@prisma/client';

export async function reconcileApprovedPayment(
  tx: Prisma.TransactionClient,
  payment: { id: string; operationVoucherId: string | null; paymentAmount: Prisma.Decimal },
) {
  await tx.supplierPaymentRequest.updateMany({ where: { financePaymentId: payment.id, status: 'APPROVED' }, data: { status: 'PAID' } });
  if (!payment.operationVoucherId) return;

  await tx.$queryRawUnsafe('SELECT id FROM "OperationVoucher" WHERE id = $1 AND "deletedAt" IS NULL FOR UPDATE', payment.operationVoucherId);
  const voucher = await tx.operationVoucher.findFirst({ where: { id: payment.operationVoucherId, deletedAt: null } });
  if (!voucher) throw new BadRequestException('Không tìm thấy phiếu điều hành liên kết với phiếu chi');

  const existing = await tx.operationVoucherPayment.findFirst({ where: { voucherId: voucher.id, paymentVoucherId: payment.id } });
  if (existing) return;

  const amount = Number(payment.paymentAmount);
  if (amount <= 0) throw new BadRequestException('Payment amount must be greater than 0');
  if (amount > Number(voucher.remainAmount) + 0.000001) throw new BadRequestException('Payment amount cannot exceed the operation voucher remaining amount');

  await tx.operationVoucherPayment.create({
    data: {
      voucherId: voucher.id,
      paymentVoucherId: payment.id,
      paidAmount: amount,
      paymentDate: new Date(),
      note: 'Duyệt phiếu chi tài chính',
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

  await tx.$queryRawUnsafe('SELECT id FROM "OperationVoucher" WHERE id = $1 AND "deletedAt" IS NULL FOR UPDATE', payment.operationVoucherId);
  const voucher = await tx.operationVoucher.findFirst({ where: { id: payment.operationVoucherId, deletedAt: null } });
  if (!voucher) throw new BadRequestException('Không tìm thấy phiếu điều hành để hoàn tác phiếu chi');

  const reconciled = await tx.operationVoucherPayment.findFirst({ where: { voucherId: voucher.id, paymentVoucherId: payment.id } });
  if (!reconciled) throw new BadRequestException('Không tìm thấy dữ liệu đối soát của phiếu chi để hoàn tác');

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

import { BadRequestException } from '@nestjs/common';
import { FinanceApprovalStatus, Prisma } from '@prisma/client';

type FinanceState = {
  approvalStatus: FinanceApprovalStatus;
  cancelledAt?: Date | null;
};

function terminalReason(entity: FinanceState) {
  if (entity.cancelledAt || entity.approvalStatus === 'CANCELLED') return 'đã hủy';
  if (entity.approvalStatus === 'APPROVED') return 'đã duyệt';
  if (entity.approvalStatus === 'REJECTED') return 'đã từ chối';
  return '';
}

export function assertCanApproveFinanceEntity(entity: FinanceState, label: string) {
  const reason = terminalReason(entity);
  if (reason) throw new BadRequestException(`${label} ${reason}, không thể duyệt lại`);
}

export function assertCanRejectFinanceEntity(entity: FinanceState, label: string) {
  const reason = terminalReason(entity);
  if (reason) throw new BadRequestException(`${label} ${reason}, không thể từ chối lại`);
}

export function assertCanCancelFinanceEntity(entity: FinanceState, label: string) {
  if (entity.cancelledAt || entity.approvalStatus === 'CANCELLED') {
    throw new BadRequestException(`${label} đã hủy, không thể hủy lại`);
  }
  if (entity.approvalStatus !== 'APPROVED') {
    throw new BadRequestException(`Chỉ có thể hủy ${label.toLowerCase()} đã duyệt`);
  }
}

export function assertCanDeleteFinanceEntity(entity: FinanceState, label: string) {
  const reason = terminalReason(entity);
  if (reason) throw new BadRequestException(`${label} ${reason}, không thể xóa`);
}

export function assertCanChangeFinanceAmount(entity: FinanceState, label: string) {
  const reason = terminalReason(entity);
  if (reason) throw new BadRequestException(`${label} ${reason}, không thể sửa số tiền`);
}


export async function lockFinanceReceipt(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT "id" FROM "FinanceReceipt" WHERE "id" = ${id} FOR UPDATE`;
}

export async function lockFinancePayment(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT "id" FROM "FinancePayment" WHERE "id" = ${id} FOR UPDATE`;
}

export async function lockFinanceInvoice(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT "id" FROM "FinanceInvoice" WHERE "id" = ${id} FOR UPDATE`;
}

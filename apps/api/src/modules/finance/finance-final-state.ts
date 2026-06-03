import { BadRequestException } from '@nestjs/common';
import { FinanceApprovalStatus } from '@prisma/client';

type FinanceState = {
  approvalStatus: FinanceApprovalStatus;
  cancelledAt?: Date | null;
};

export function assertCanApproveFinanceEntity(entity: FinanceState, label: string) {
  if (entity.cancelledAt || entity.approvalStatus === 'CANCELLED') {
    throw new BadRequestException(`${label} is already cancelled`);
  }
  if (entity.approvalStatus === 'APPROVED') {
    throw new BadRequestException(`${label} is already approved`);
  }
  if (entity.approvalStatus === 'REJECTED') {
    throw new BadRequestException(`${label} is already rejected`);
  }
}

export function assertCanRejectFinanceEntity(entity: FinanceState, label: string) {
  if (entity.cancelledAt || entity.approvalStatus === 'CANCELLED') {
    throw new BadRequestException(`${label} is already cancelled`);
  }
  if (entity.approvalStatus === 'APPROVED') {
    throw new BadRequestException(`${label} is already approved`);
  }
  if (entity.approvalStatus === 'REJECTED') {
    throw new BadRequestException(`${label} is already rejected`);
  }
}

export function assertCanCancelFinanceEntity(entity: FinanceState, label: string) {
  if (entity.cancelledAt || entity.approvalStatus === 'CANCELLED') {
    throw new BadRequestException(`${label} is already cancelled`);
  }
  if (entity.approvalStatus !== 'APPROVED') {
    throw new BadRequestException(`Only approved ${label.toLowerCase()} can be cancelled`);
  }
}

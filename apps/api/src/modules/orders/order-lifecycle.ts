import { BadRequestException } from '@nestjs/common';
import { OrderStatus, OrderType, Prisma } from '@prisma/client';
import { UnlockOrderDto } from './dto/order.dto';
import { confirmAutoAllotmentLocks, releaseAutoAllotmentLocks } from './order-allotment-sync';

type SettledOrder = { id: string; settledAt: Date | null; status?: OrderStatus | string | null };
type LifecycleOrder = SettledOrder & { type: OrderType };

export function assertOrderEditable(order: SettledOrder) {
  if (order.settledAt) throw new BadRequestException('Settled order cannot be edited');
}

export function assertOrderNotSettled(order: SettledOrder, action: string) {
  if (order.settledAt) throw new BadRequestException(`Settled order cannot be ${action}`);
}

export async function applyOrderStatus(tx: Prisma.TransactionClient, order: LifecycleOrder, status: OrderStatus, include: Prisma.OrderInclude) {
  assertOrderNotSettled(order, 'changed');
  if (order.type === 'HOTEL_BOOKING') {
    if (status === 'CANCELLED') await releaseAutoAllotmentLocks(tx, order.id, 'STATUS_CANCEL_RELEASE');
    if (['RUNNING', 'COMPLETED', 'SETTLED'].includes(status)) await confirmAutoAllotmentLocks(tx, order.id, 'STATUS_CONFIRM');
  }
  const updated = await tx.order.update({ where: { id: order.id }, data: { status }, include });
  await tx.orderLog.create({ data: { orderId: order.id, action: 'STATUS', oldValue: { status: order.status }, newValue: { status } } });
  return updated;
}

export async function settleOrder(tx: Prisma.TransactionClient, order: LifecycleOrder) {
  if (order.settledAt) return tx.order.findUniqueOrThrow({ where: { id: order.id } });
  if (order.type === 'HOTEL_BOOKING') await confirmAutoAllotmentLocks(tx, order.id, 'SETTLE_CONFIRM');
  const settled = await tx.order.update({ where: { id: order.id }, data: { status: 'SETTLED', settledAt: new Date() } });
  await tx.orderLog.create({ data: { orderId: order.id, action: 'SETTLE', newValue: { settledAt: settled.settledAt } } });
  return settled;
}

export async function unlockSettledOrder(tx: Prisma.TransactionClient, order: LifecycleOrder, dto: UnlockOrderDto) {
  if (!order.settledAt) throw new BadRequestException('Order is not settled');
  const updated = await tx.order.update({ where: { id: order.id }, data: { settledAt: null, status: 'COMPLETED' } });
  await tx.orderLog.create({
    data: {
      orderId: order.id,
      userId: text(dto.actor),
      action: 'UNLOCK_SETTLEMENT',
      oldValue: { settledAt: order.settledAt, status: order.status },
      newValue: { settledAt: null, status: 'COMPLETED', reason: dto.reason },
    },
  });
  return updated;
}

function text(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

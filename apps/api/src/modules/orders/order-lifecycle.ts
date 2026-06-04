import { BadRequestException, Injectable } from '@nestjs/common';
import { OrderStatus, OrderType, Prisma } from '@prisma/client';
import { UnlockOrderDto } from './dto/order.dto';
import { OrderAllotmentService } from './order-allotment-sync';

type SettledOrder = { id: string; settledAt: Date | null; status?: OrderStatus | string | null };
type LifecycleOrder = SettledOrder & { type: OrderType };
const ORDER_STATUS_TARGETS: Record<OrderType, ReadonlySet<OrderStatus>> = {
  FIT_TOUR: new Set(['DRAFT', 'UPCOMING', 'RUNNING', 'COMPLETED', 'CANCELLED', 'SETTLED']),
  GIT_COMBO: new Set(['DRAFT', 'UPCOMING', 'RUNNING', 'COMPLETED', 'CANCELLED', 'SETTLED']),
  LANDTOUR: new Set(['DRAFT', 'UPCOMING', 'RUNNING', 'COMPLETED', 'CANCELLED', 'SETTLED']),
  HOTEL_BOOKING: new Set(['DRAFT', 'UPCOMING', 'RUNNING', 'COMPLETED', 'CANCELLED', 'SETTLED']),
  SINGLE_SERVICE: new Set(['DRAFT', 'UPCOMING', 'RUNNING', 'COMPLETED', 'CANCELLED', 'SETTLED']),
  FLIGHT_ORDER: new Set(['DRAFT', 'UPCOMING', 'COMPLETED', 'CANCELLED', 'SETTLED']),
};

@Injectable()
export class OrderLifecycleService {
  constructor(private readonly allotments: OrderAllotmentService) {}

  assertEditable(order: SettledOrder) {
    return assertOrderEditable(order);
  }

  assertNotSettled(order: SettledOrder, action: string) {
    return assertOrderNotSettled(order, action);
  }

  async applyStatus(tx: Prisma.TransactionClient, order: LifecycleOrder, status: OrderStatus, include: Prisma.OrderInclude) {
    assertOrderNotSettled(order, 'changed');
    assertValidStatusTarget(order, status);
    if (status === 'SETTLED') return this.settle(tx, order, include);

    if (order.type === 'HOTEL_BOOKING') await this.allotments.alignAutoLocksForStatus(tx, order.id, status, 'STATUS');
    const updated = await tx.order.update({ where: { id: order.id }, data: { status }, include });
    await tx.orderLog.create({ data: { orderId: order.id, action: 'STATUS', oldValue: { status: order.status }, newValue: { status } } });
    return updated;
  }

  async settle(tx: Prisma.TransactionClient, order: LifecycleOrder, include?: Prisma.OrderInclude) {
    if (order.settledAt) {
      return include ? tx.order.findUniqueOrThrow({ where: { id: order.id }, include }) : tx.order.findUniqueOrThrow({ where: { id: order.id } });
    }
    if (order.type === 'HOTEL_BOOKING') await this.allotments.alignAutoLocksForStatus(tx, order.id, 'SETTLED', 'SETTLE');
    const data = { status: 'SETTLED' as OrderStatus, settledAt: new Date() };
    const settled = include ? await tx.order.update({ where: { id: order.id }, data, include }) : await tx.order.update({ where: { id: order.id }, data });
    await tx.orderLog.create({ data: { orderId: order.id, action: 'SETTLE', oldValue: { status: order.status, settledAt: order.settledAt }, newValue: { settledAt: settled.settledAt } } });
    return settled;
  }

  unlock(tx: Prisma.TransactionClient, order: LifecycleOrder, dto: UnlockOrderDto) {
    return unlockSettledOrder(tx, order, dto);
  }
}

export function assertOrderEditable(order: SettledOrder) {
  if (order.settledAt) throw new BadRequestException('Settled order cannot be edited');
}

export function assertOrderNotSettled(order: SettledOrder, action: string) {
  if (order.settledAt) throw new BadRequestException(`Settled order cannot be ${action}`);
}

export async function unlockSettledOrder(tx: Prisma.TransactionClient, order: LifecycleOrder, dto: UnlockOrderDto) {
  if (!order.settledAt) throw new BadRequestException('Order is not settled');
  if (order.status !== 'SETTLED') throw new BadRequestException('Only settled orders can be unlocked');
  if (!text(dto.actor)) throw new BadRequestException('Unlock actor is required');
  if (!text(dto.reason)) throw new BadRequestException('Unlock reason is required');
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

export function assertValidStatusTarget(order: LifecycleOrder, status: OrderStatus) {
  const allowed = ORDER_STATUS_TARGETS[order.type];
  if (!allowed?.has(status)) throw new BadRequestException(`Status ${status} is not valid for ${order.type}`);
}

function text(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

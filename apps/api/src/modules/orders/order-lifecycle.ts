import { BadRequestException, Injectable } from '@nestjs/common';
import { OrderStatus, OrderType, Prisma } from '@prisma/client';
import { UnlockOrderDto } from './dto/order.dto';
import { OrderAllotmentService } from './order-allotment-sync';

type SettledOrder = { id: string; settledAt: Date | null; status?: OrderStatus | string | null };
type LifecycleOrder = SettledOrder & { type: OrderType };
type OrderStatusTransitionMap = Record<OrderStatus, ReadonlySet<OrderStatus>>;

const STANDARD_ORDER_STATUS_TRANSITIONS: OrderStatusTransitionMap = {
  DRAFT: new Set(['DRAFT', 'UPCOMING', 'CANCELLED']),
  UPCOMING: new Set(['UPCOMING', 'RUNNING', 'COMPLETED', 'CANCELLED', 'SETTLED']),
  RUNNING: new Set(['RUNNING', 'UPCOMING', 'COMPLETED', 'CANCELLED', 'SETTLED']),
  COMPLETED: new Set(['COMPLETED', 'UPCOMING', 'RUNNING', 'CANCELLED', 'SETTLED']),
  CANCELLED: new Set(['CANCELLED', 'UPCOMING']),
  SETTLED: new Set(['SETTLED']),
};

const FLIGHT_ORDER_STATUS_TRANSITIONS: OrderStatusTransitionMap = {
  DRAFT: new Set(['DRAFT', 'UPCOMING', 'CANCELLED']),
  UPCOMING: new Set(['UPCOMING', 'COMPLETED', 'CANCELLED', 'SETTLED']),
  RUNNING: new Set(['UPCOMING', 'COMPLETED', 'CANCELLED']),
  COMPLETED: new Set(['COMPLETED', 'UPCOMING', 'CANCELLED', 'SETTLED']),
  CANCELLED: new Set(['CANCELLED', 'UPCOMING']),
  SETTLED: new Set(['SETTLED']),
};

const ORDER_STATUS_TRANSITIONS: Record<OrderType, OrderStatusTransitionMap> = {
  FIT_TOUR: STANDARD_ORDER_STATUS_TRANSITIONS,
  GIT_COMBO: STANDARD_ORDER_STATUS_TRANSITIONS,
  LANDTOUR: STANDARD_ORDER_STATUS_TRANSITIONS,
  HOTEL_BOOKING: STANDARD_ORDER_STATUS_TRANSITIONS,
  SINGLE_SERVICE: STANDARD_ORDER_STATUS_TRANSITIONS,
  FLIGHT_ORDER: FLIGHT_ORDER_STATUS_TRANSITIONS,
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
    if (order.status === 'CANCELLED') throw new BadRequestException('Cancelled order cannot be settled');
    if (order.type === 'HOTEL_BOOKING') await this.allotments.alignAutoLocksForStatus(tx, order.id, 'SETTLED', 'SETTLE');
    const data = { status: 'SETTLED' as OrderStatus, settledAt: new Date() };
    const settled = include ? await tx.order.update({ where: { id: order.id }, data, include }) : await tx.order.update({ where: { id: order.id }, data });
    await tx.orderLog.create({ data: { orderId: order.id, action: 'SETTLE', oldValue: { status: order.status, settledAt: order.settledAt }, newValue: { settledAt: settled.settledAt } } });
    return settled;
  }

  unlock(tx: Prisma.TransactionClient, order: LifecycleOrder, dto: UnlockOrderDto, actorId?: string | null) {
    return unlockSettledOrder(tx, order, dto, actorId);
  }
}

export function assertOrderEditable(order: SettledOrder) {
  if (order.settledAt) throw new BadRequestException('Settled order cannot be edited');
}

export function assertOrderNotSettled(order: SettledOrder, action: string) {
  if (order.settledAt) throw new BadRequestException(`Settled order cannot be ${action}`);
}

export async function unlockSettledOrder(tx: Prisma.TransactionClient, order: LifecycleOrder, dto: UnlockOrderDto, actorId?: string | null) {
  if (!order.settledAt) throw new BadRequestException('Order is not settled');
  if (order.status !== 'SETTLED') throw new BadRequestException('Only settled orders can be unlocked');
  const userId = text(actorId);
  if (!userId) throw new BadRequestException('Authenticated unlock actor is required');
  if (!text(dto.reason)) throw new BadRequestException('Unlock reason is required');
  const updated = await tx.order.update({ where: { id: order.id }, data: { settledAt: null, status: 'COMPLETED' } });
  await tx.orderLog.create({
    data: {
      orderId: order.id,
      userId,
      action: 'UNLOCK_SETTLEMENT',
      oldValue: { settledAt: order.settledAt, status: order.status },
      newValue: { settledAt: null, status: 'COMPLETED', reason: dto.reason },
    },
  });
  return updated;
}

export function assertValidStatusTarget(order: LifecycleOrder, status: OrderStatus) {
  const current = order.status as OrderStatus;
  const allowed = ORDER_STATUS_TRANSITIONS[order.type]?.[current];
  if (!allowed?.has(status)) throw new BadRequestException(`Cannot change order status from ${current} to ${status} for ${order.type}`);
}

function text(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

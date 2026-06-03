import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CreateOrderDto } from './dto/order.dto';

@Injectable()
export class OrderAllotmentService {
  syncHotelLocks(tx: Prisma.TransactionClient, orderId: string, dto: Partial<CreateOrderDto>, action: string) {
    return syncHotelAllotmentLocks(tx, orderId, dto, action);
  }

  releaseAutoLocks(tx: Prisma.TransactionClient, orderId: string, action: string) {
    return releaseAutoAllotmentLocks(tx, orderId, action);
  }

  confirmAutoLocks(tx: Prisma.TransactionClient, orderId: string, action: string) {
    return confirmAutoAllotmentLocks(tx, orderId, action);
  }
}

export async function syncHotelAllotmentLocks(tx: Prisma.TransactionClient, orderId: string, dto: Partial<CreateOrderDto>, action: string) {
  const order = await tx.order.findUnique({ where: { id: orderId }, select: { id: true, systemCode: true } });
  if (!order) throw new NotFoundException('Không tìm thấy đơn hàng');
  const operationRows = await tx.orderOperationItem.findMany({ where: { orderId }, orderBy: { sortOrder: 'asc' }, select: { id: true, sortOrder: true } });
  for (const [index, item] of (dto.operationItems ?? []).entries()) {
    const serviceId = text(item.serviceId);
    if (!serviceId) continue;
    const quantity = Math.max(1, Math.ceil(Number(item.quantity ?? 1)));
    const serviceDate = date(item.serviceDate) ?? date(dto.startDate) ?? new Date();
    const allotment = await tx.supplierAllotment.findFirst({
      where: {
        serviceId,
        status: 'ACTIVE',
        OR: [{ startDate: null }, { startDate: { lte: serviceDate } }],
        AND: [{ OR: [{ endDate: null }, { endDate: { gte: serviceDate } }] }],
      },
      orderBy: [{ startDate: 'desc' }, { updatedAt: 'desc' }],
    });
    if (!allotment) continue;
    const allotmentQty = allotment.allotmentQty || allotment.quantityLock || 0;
    if (allotment.bookedQty + allotment.lockedQty + quantity > allotmentQty) {
      throw new BadRequestException(`Not enough hotel allotment for ${item.bookingCode || item.serviceType || serviceId}`);
    }
    const allocation = await tx.supplierAllotmentAllocation.create({
      data: {
        allotmentId: allotment.id,
        supplierId: allotment.supplierId,
        serviceId,
        orderOperationItemId: operationRows[index]?.id,
        orderId,
        quantity,
        status: 'LOCKED',
        lockedAt: new Date(),
        note: `Auto lock from order ${order.systemCode}`,
        createdBy: 'ORDER_AUTO',
      },
    });
    await tx.supplierAllotment.update({ where: { id: allotment.id }, data: { lockedQty: { increment: quantity } } });
    await tx.supplierAllotmentLog.create({
      data: {
        allotmentId: allotment.id,
        supplierId: allotment.supplierId,
        action,
        oldValue: { lockedQty: allotment.lockedQty },
        newValue: { allocationId: allocation.id, orderId, serviceId, quantity },
        actor: 'ORDER_AUTO',
      },
    });
  }
}

export async function releaseAutoAllotmentLocks(tx: Prisma.TransactionClient, orderId: string, action: string) {
  const allocations = await tx.supplierAllotmentAllocation.findMany({
    where: { orderId, createdBy: 'ORDER_AUTO', status: { in: ['LOCKED', 'CONFIRMED'] } },
  });
  for (const allocation of allocations) {
    const decrement = allocation.status === 'CONFIRMED' ? { bookedQty: { decrement: allocation.quantity } } : { lockedQty: { decrement: allocation.quantity } };
    await tx.supplierAllotmentAllocation.update({
      where: { id: allocation.id },
      data: { status: 'RELEASED', releasedAt: new Date(), note: allocation.note ?? action },
    });
    await tx.supplierAllotment.update({ where: { id: allocation.allotmentId }, data: decrement });
    await tx.supplierAllotmentLog.create({
      data: {
        allotmentId: allocation.allotmentId,
        supplierId: allocation.supplierId,
        action,
        oldValue: { allocationId: allocation.id, status: allocation.status },
        newValue: { allocationId: allocation.id, status: 'RELEASED', quantity: allocation.quantity },
        actor: 'ORDER_AUTO',
      },
    });
  }
}

export async function confirmAutoAllotmentLocks(tx: Prisma.TransactionClient, orderId: string, action: string) {
  const allocations = await tx.supplierAllotmentAllocation.findMany({
    where: { orderId, createdBy: 'ORDER_AUTO', status: 'LOCKED' },
  });
  for (const allocation of allocations) {
    await tx.supplierAllotmentAllocation.update({
      where: { id: allocation.id },
      data: { status: 'CONFIRMED', confirmedAt: new Date() },
    });
    await tx.supplierAllotment.update({
      where: { id: allocation.allotmentId },
      data: { lockedQty: { decrement: allocation.quantity }, bookedQty: { increment: allocation.quantity } },
    });
    await tx.supplierAllotmentLog.create({
      data: {
        allotmentId: allocation.allotmentId,
        supplierId: allocation.supplierId,
        action,
        oldValue: { allocationId: allocation.id, status: 'LOCKED' },
        newValue: { allocationId: allocation.id, status: 'CONFIRMED', quantity: allocation.quantity },
        actor: 'ORDER_AUTO',
      },
    });
  }
}

function text(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function date(value?: string | null) {
  return value ? new Date(value) : null;
}

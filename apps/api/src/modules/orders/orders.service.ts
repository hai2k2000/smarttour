import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, OrderType, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { applyWriteDataScope, branchDepartmentScopeWhere, RequestUser } from '../auth/data-scope';
import { CreateOrderDto, UnlockOrderDto, UpdateOrderDto } from './dto/order.dto';
import { OrderAllotmentService } from './order-allotment-sync';
import { calculateOrderTotals } from './order-calculator';
import { OrderChildrenSyncService } from './order-children-sync';
import { OrderCustomerSnapshotService } from './order-customer-snapshot';
import { mergeOrderTotalsInput, orderStatusForAllotment, ScopedOrderDto, shouldResyncHotelAllotments, toOrderCopyDto, toOrderData, validateOrderDates } from './order-data-mapper';
import { OrderLifecycleService } from './order-lifecycle';

const ORDER_TYPES: Record<string, OrderType> = {
  'fit-tours': 'FIT_TOUR',
  'git-combos': 'GIT_COMBO',
  landtours: 'LANDTOUR',
  'hotel-bookings': 'HOTEL_BOOKING',
  'single-services': 'SINGLE_SERVICE',
  'flight-orders': 'FLIGHT_ORDER',
};

@Injectable()
export class OrdersService {
  private readonly lifecycle: OrderLifecycleService;
  private readonly children: OrderChildrenSyncService;
  private readonly allotments: OrderAllotmentService;
  private readonly customerSnapshot: OrderCustomerSnapshotService;

  constructor(
    private readonly prisma: PrismaService,
    lifecycle?: OrderLifecycleService,
    children?: OrderChildrenSyncService,
    allotments?: OrderAllotmentService,
    customerSnapshot?: OrderCustomerSnapshotService,
  ) {
    this.allotments = allotments ?? new OrderAllotmentService();
    this.lifecycle = lifecycle ?? new OrderLifecycleService(this.allotments);
    this.children = children ?? new OrderChildrenSyncService();
    this.customerSnapshot = customerSnapshot ?? new OrderCustomerSnapshotService();
  }

  private listSelect() {
    return {
      id: true,
      type: true,
      status: true,
      paymentStatus: true,
      costStatus: true,
      systemCode: true,
      tourCode: true,
      name: true,
      customerId: true,
      customerName: true,
      customerPhone: true,
      customerEmail: true,
      startDate: true,
      endDate: true,
      totalRevenue: true,
      paidAmount: true,
      remainingRevenue: true,
      totalCost: true,
      paidCost: true,
      remainingCost: true,
      profit: true,
      branch: true,
      department: true,
      operatorOwner: true,
      updatedAt: true,
      customer: { select: { id: true, code: true, fullName: true, phone: true, email: true, branch: true, department: true } },
      _count: { select: { members: true, salesItems: true, operationItems: true, allotmentLocks: true } },
    } satisfies Prisma.OrderSelect;
  }

  list(typePath: string, search?: string, user?: RequestUser) {
    const type = this.resolveType(typePath);
    const where: Prisma.OrderWhereInput = {
      type,
      deletedAt: null,
      ...(search
        ? {
            OR: [
              { systemCode: { contains: search, mode: 'insensitive' } },
              { tourCode: { contains: search, mode: 'insensitive' } },
              { name: { contains: search, mode: 'insensitive' } },
              { customerName: { contains: search, mode: 'insensitive' } },
              { customerPhone: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    return this.prisma.order.findMany({
      where: branchDepartmentScopeWhere(where, user),
      select: this.listSelect(),
      orderBy: [{ updatedAt: 'desc' }, { systemCode: 'asc' }],
    });
  }

  async detail(typePath: string, id: string, user?: RequestUser) {
    const order = await this.prisma.order.findFirst({
      where: branchDepartmentScopeWhere({ id, type: this.resolveType(typePath), deletedAt: null }, user),
      include: this.includeAll(),
    });
    if (!order) throw new NotFoundException('Không tìm thấy đơn hàng');
    return order;
  }

  async create(typePath: string, dto: CreateOrderDto, user?: RequestUser) {
    const type = this.resolveType(typePath);
    const scopedDto = applyWriteDataScope(dto as ScopedOrderDto, user) as ScopedOrderDto;
    validateOrderDates(scopedDto);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const orderDto = (await this.customerSnapshot.withSnapshot(tx, scopedDto)) as ScopedOrderDto;
        const order = await tx.order.create({
          data: {
            type,
            ...toOrderData(orderDto),
            ...(orderDto.status === 'SETTLED' ? { settledAt: new Date() } : {}),
            ...calculateOrderTotals(orderDto),
          } as Prisma.OrderCreateInput,
        });
        await this.children.create(tx, order.id, orderDto);
        if (type === 'HOTEL_BOOKING') await this.allotments.alignAutoLocksForStatus(tx, order.id, orderDto.status ?? 'UPCOMING', 'CREATE');
        await tx.orderLog.create({ data: { orderId: order.id, action: 'CREATE', newValue: orderDto as unknown as Prisma.InputJsonValue } });
        return tx.order.findUniqueOrThrow({ where: { id: order.id }, include: this.includeAll() });
      });
    } catch (error) {
      this.handleUniqueCodeError(error);
    }
  }

  async update(typePath: string, id: string, dto: UpdateOrderDto, user?: RequestUser) {
    const current = await this.detail(typePath, id, user);
    const scopedDto = applyWriteDataScope(dto as ScopedOrderDto, user) as ScopedOrderDto;
    this.lifecycle.assertEditable(current);
    validateOrderDates(scopedDto);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const orderDto = (await this.customerSnapshot.withSnapshot(tx, scopedDto)) as ScopedOrderDto;
        const hotelNeedsAllotmentResync = current.type === 'HOTEL_BOOKING' && shouldResyncHotelAllotments(orderDto);
        if (hotelNeedsAllotmentResync) await this.allotments.releaseAutoLocks(tx, id, 'UPDATE_RELEASE');

        await tx.order.update({
          where: { id },
          data: {
            ...toOrderData(orderDto),
            ...(orderDto.status === 'SETTLED' ? { settledAt: new Date() } : {}),
            ...calculateOrderTotals(mergeOrderTotalsInput(current, orderDto)),
          } as Prisma.OrderUpdateInput,
        });
        await this.children.sync(tx, id, orderDto);
        if (hotelNeedsAllotmentResync) await this.allotments.alignAutoLocksForStatus(tx, id, orderStatusForAllotment(current.status, orderDto), 'UPDATE');
        await tx.orderLog.create({ data: { orderId: id, action: 'UPDATE', newValue: orderDto as unknown as Prisma.InputJsonValue } });
        return tx.order.findUniqueOrThrow({ where: { id }, include: this.includeAll() });
      });
    } catch (error) {
      this.handleUniqueCodeError(error);
    }
  }

  async remove(typePath: string, id: string, user?: RequestUser) {
    const order = await this.detail(typePath, id, user);
    this.lifecycle.assertNotSettled(order, 'deleted');
    return this.prisma.$transaction(async (tx) => {
      if (order.type === 'HOTEL_BOOKING') await this.allotments.releaseAutoLocks(tx, id, 'DELETE_RELEASE');
      await tx.orderLog.create({ data: { orderId: id, action: 'DELETE', oldValue: { status: order.status } } });
      return tx.order.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }

  async updateStatus(typePath: string, id: string, status: OrderStatus, user?: RequestUser) {
    const order = await this.detail(typePath, id, user);
    return this.prisma.$transaction(async (tx) => {
      return this.lifecycle.applyStatus(tx, order, status, this.includeAll());
    });
  }

  async copy(typePath: string, id: string, user?: RequestUser) {
    const order = await this.detail(typePath, id, user);
    return this.create(typePath, toOrderCopyDto(order), user);
  }

  async settle(typePath: string, id: string, user?: RequestUser) {
    const order = await this.detail(typePath, id, user);
    return this.prisma.$transaction(async (tx) => {
      return this.lifecycle.settle(tx, order, this.includeAll());
    });
  }

  async unlock(typePath: string, id: string, dto: UnlockOrderDto, user?: RequestUser) {
    const order = await this.detail(typePath, id, user);
    return this.prisma.$transaction(async (tx) => {
      return this.lifecycle.unlock(tx, order, dto);
    });
  }

  private includeAll() {
    return {
      customer: true,
      guides: true,
      salesItems: { include: { supplier: true, service: true } },
      operationItems: { include: { supplier: true, service: true, allotmentLocks: true } },
      allotmentLocks: { include: { allotment: true, service: true, orderOperationItem: true }, orderBy: { createdAt: 'desc' } },
      members: true,
      itineraries: true,
      handoverItems: true,
      surveyQuestions: true,
      terms: true,
      files: true,
    } satisfies Prisma.OrderInclude;
  }

  private resolveType(typePath: string) {
    const type = ORDER_TYPES[typePath];
    if (!type) throw new NotFoundException('Order type not found');
    return type;
  }

  private handleUniqueCodeError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('Order code already exists');
    }
    throw error;
  }
}

import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, OrderType, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { applyWriteDataScope, branchDepartmentScopeWhere, RequestUser } from '../auth/data-scope';
import { containsSearch, normalizeListSearch } from '../list-search';
import { CreateOrderDto, UnlockOrderDto, UpdateOrderDto } from './dto/order.dto';
import { OrderAllotmentService } from './order-allotment-sync';
import { calculateOrderTotals } from './order-calculator';
import { OrderChildrenSyncService } from './order-children-sync';
import { OrderCustomerSnapshotService } from './order-customer-snapshot';
import { mergeOrderDateInput, mergeOrderTotalsInput, orderStatusForAllotment, ScopedOrderDto, shouldResyncHotelAllotments, toOrderCopyDto, toOrderData, validateOrderDates } from './order-data-mapper';
import { OrderLifecycleService } from './order-lifecycle';

const ORDER_TYPES: Record<string, OrderType> = {
  fit: 'FIT_TOUR',
  'fit-tours': 'FIT_TOUR',
  git: 'GIT_COMBO',
  combos: 'GIT_COMBO',
  'git-combos': 'GIT_COMBO',
  landtour: 'LANDTOUR',
  landtours: 'LANDTOUR',
  hotels: 'HOTEL_BOOKING',
  'hotel-bookings': 'HOTEL_BOOKING',
  services: 'SINGLE_SERVICE',
  'single-services': 'SINGLE_SERVICE',
  flights: 'FLIGHT_ORDER',
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
      _count: { select: { members: true, salesItems: true, operationItems: true, allotmentLocks: true } },
    } satisfies Prisma.OrderSelect;
  }

  list(typePath: string, search?: string, user?: RequestUser) {
    const type = this.resolveType(typePath);
    const searchText = normalizeListSearch(search);
    const where: Prisma.OrderWhereInput = {
      type,
      deletedAt: null,
      ...(searchText
        ? {
            OR: [
              { systemCode: containsSearch(searchText) },
              { tourCode: containsSearch(searchText) },
              { name: containsSearch(searchText) },
              { customerName: containsSearch(searchText) },
              { customerPhone: containsSearch(searchText) },
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
      include: this.detailInclude(),
    });
    if (!order) throw new NotFoundException('Không tìm thấy đơn hàng');
    return order;
  }

  private async loadForEdit(typePath: string, id: string, user?: RequestUser) {
    const order = await this.prisma.order.findFirst({
      where: branchDepartmentScopeWhere({ id, type: this.resolveType(typePath), deletedAt: null }, user),
      include: this.editInclude(),
    });
    if (!order) throw new NotFoundException('Không tìm thấy đơn hàng');
    return order;
  }

  private async loadForCopy(typePath: string, id: string, user?: RequestUser) {
    const order = await this.prisma.order.findFirst({
      where: branchDepartmentScopeWhere({ id, type: this.resolveType(typePath), deletedAt: null }, user),
      include: this.copyInclude(),
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
        const totals = calculateOrderTotals(orderDto);
        const order = await tx.order.create({
          data: {
            type,
            ...toOrderData(orderDto),
            ...(orderDto.status === 'SETTLED' ? { settledAt: new Date() } : {}),
            ...totals,
          } as Prisma.OrderCreateInput,
        });
        await this.children.create(tx, order.id, orderDto);
        if (type === 'HOTEL_BOOKING') await this.allotments.alignAutoLocksForStatus(tx, order.id, orderDto.status ?? 'UPCOMING', 'CREATE');
        await tx.orderLog.create({ data: { orderId: order.id, action: 'CREATE', newValue: this.logPayload(orderDto, totals) } });
        return tx.order.findUniqueOrThrow({ where: { id: order.id }, include: this.editInclude() });
      });
    } catch (error) {
      this.handleUniqueCodeError(error);
    }
  }

  async update(typePath: string, id: string, dto: UpdateOrderDto, user?: RequestUser) {
    const current = await this.loadForEdit(typePath, id, user);
    const scopedDto = applyWriteDataScope(dto as ScopedOrderDto, user) as ScopedOrderDto;
    if (scopedDto.status !== undefined) throw new BadRequestException('Order status must be changed through the status action endpoint');
    this.lifecycle.assertEditable(current);
    validateOrderDates(mergeOrderDateInput(current, scopedDto));
    try {
      return await this.prisma.$transaction(async (tx) => {
        const orderDto = (await this.customerSnapshot.withSnapshot(tx, scopedDto)) as ScopedOrderDto;
        const hotelNeedsAllotmentResync = current.type === 'HOTEL_BOOKING' && shouldResyncHotelAllotments(orderDto);
        if (hotelNeedsAllotmentResync) await this.allotments.releaseAutoLocks(tx, id, 'UPDATE_RELEASE');

        const totalsInput = mergeOrderTotalsInput(current, orderDto);
        const totals = calculateOrderTotals(totalsInput);
        await tx.order.update({
          where: { id },
          data: {
            ...toOrderData(orderDto),
            ...(orderDto.status === 'SETTLED' ? { settledAt: new Date() } : {}),
            ...totals,
          } as Prisma.OrderUpdateInput,
        });
        await this.children.sync(tx, id, orderDto);
        if (hotelNeedsAllotmentResync) await this.allotments.alignAutoLocksForStatus(tx, id, orderStatusForAllotment(current.status, orderDto), 'UPDATE');
        await tx.orderLog.create({
          data: {
            orderId: id,
            action: 'UPDATE',
            oldValue: this.orderStateSummary(current),
            newValue: this.logPayload(orderDto, totals),
          },
        });
        return tx.order.findUniqueOrThrow({ where: { id }, include: this.editInclude() });
      });
    } catch (error) {
      this.handleUniqueCodeError(error);
    }
  }

  async remove(typePath: string, id: string, user?: RequestUser) {
    const order = await this.loadForEdit(typePath, id, user);
    this.lifecycle.assertNotSettled(order, 'deleted');
    return this.prisma.$transaction(async (tx) => {
      if (order.type === 'HOTEL_BOOKING') await this.allotments.releaseAutoLocks(tx, id, 'DELETE_RELEASE');
      await tx.orderLog.create({ data: { orderId: id, action: 'DELETE', oldValue: { status: order.status } } });
      return tx.order.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }

  async updateStatus(typePath: string, id: string, status: OrderStatus, user?: RequestUser) {
    const order = await this.loadForEdit(typePath, id, user);
    return this.prisma.$transaction(async (tx) => {
      return this.lifecycle.applyStatus(tx, order, status, this.editInclude());
    });
  }

  async copy(typePath: string, id: string, user?: RequestUser) {
    const order = await this.loadForCopy(typePath, id, user);
    return this.create(typePath, toOrderCopyDto(order), user);
  }

  async settle(typePath: string, id: string, user?: RequestUser) {
    const order = await this.loadForEdit(typePath, id, user);
    return this.prisma.$transaction(async (tx) => {
      return this.lifecycle.settle(tx, order, this.editInclude());
    });
  }

  async unlock(typePath: string, id: string, dto: UnlockOrderDto, user?: RequestUser) {
    const order = await this.loadForEdit(typePath, id, user);
    return this.prisma.$transaction(async (tx) => {
      return this.lifecycle.unlock(tx, order, dto);
    });
  }

  private detailInclude() {
    return {
      customer: true,
      guides: true,
      salesItems: { include: { supplier: true, service: true }, orderBy: { sortOrder: 'asc' } },
      operationItems: { include: { supplier: true, service: true, allotmentLocks: true }, orderBy: { sortOrder: 'asc' } },
      allotmentLocks: { include: { allotment: true, service: true, orderOperationItem: true }, orderBy: { createdAt: 'desc' } },
      members: true,
      itineraries: true,
      handoverItems: true,
      surveyQuestions: true,
      terms: true,
      files: true,
    } satisfies Prisma.OrderInclude;
  }

  private editInclude() {
    return {
      customer: true,
      guides: true,
      salesItems: { orderBy: { sortOrder: 'asc' } },
      operationItems: { include: { allotmentLocks: true }, orderBy: { sortOrder: 'asc' } },
      allotmentLocks: { orderBy: { createdAt: 'desc' } },
      members: true,
      itineraries: true,
      handoverItems: true,
      surveyQuestions: true,
      terms: true,
      files: true,
    } satisfies Prisma.OrderInclude;
  }

  private copyInclude() {
    return {
      guides: true,
      salesItems: { orderBy: { sortOrder: 'asc' } },
      operationItems: { orderBy: { sortOrder: 'asc' } },
      members: true,
      itineraries: true,
      handoverItems: true,
      surveyQuestions: true,
      terms: true,
    } satisfies Prisma.OrderInclude;
  }

  private logPayload(dto: Partial<ScopedOrderDto>, totals?: ReturnType<typeof calculateOrderTotals>) {
    const childCounts = {
      guides: dto.guides?.length,
      salesItems: dto.salesItems?.length,
      operationItems: dto.operationItems?.length,
      members: dto.members?.length,
      itineraries: dto.itineraries?.length,
      handoverItems: dto.handoverItems?.length,
      surveyQuestions: dto.surveyQuestions?.length,
      terms: dto.terms?.length,
    };
    const changedFields = Object.keys(dto).filter((key) => !this.omittedLogFields().has(key));
    return {
      systemCode: dto.systemCode,
      tourCode: dto.tourCode,
      name: dto.name,
      status: dto.status,
      branch: dto.branch,
      department: dto.department,
      customerId: dto.customerId,
      startDate: dto.startDate,
      endDate: dto.endDate,
      changedFields,
      childCounts: Object.fromEntries(Object.entries(childCounts).filter(([, value]) => value !== undefined)),
      ...(totals ? { totals } : {}),
    } as Prisma.InputJsonValue;
  }

  private orderStateSummary(order: {
    systemCode: string;
    status: OrderStatus;
    paymentStatus: string;
    costStatus: string;
    totalRevenue: unknown;
    paidAmount: unknown;
    totalCost: unknown;
    paidCost: unknown;
    settledAt?: Date | null;
    salesItems?: unknown[];
    operationItems?: unknown[];
    members?: unknown[];
  }) {
    return {
      systemCode: order.systemCode,
      status: order.status,
      paymentStatus: order.paymentStatus,
      costStatus: order.costStatus,
      settledAt: order.settledAt,
      totals: {
        totalRevenue: Number(order.totalRevenue),
        paidAmount: Number(order.paidAmount),
        totalCost: Number(order.totalCost),
        paidCost: Number(order.paidCost),
      },
      childCounts: {
        salesItems: order.salesItems?.length ?? 0,
        operationItems: order.operationItems?.length ?? 0,
        members: order.members?.length ?? 0,
      },
    } as Prisma.InputJsonValue;
  }

  private omittedLogFields() {
    return new Set([
      'guides',
      'salesItems',
      'operationItems',
      'members',
      'itineraries',
      'handoverItems',
      'surveyQuestions',
      'terms',
      'customerPhone',
      'customerEmail',
      'customerAddress',
      'note',
      'handoverRequest',
      'surveyDescription',
    ]);
  }

  private resolveType(typePath: string) {
    const type = ORDER_TYPES[typePath];
    if (!type) throw new NotFoundException('Order type not found');
    return type;
  }

  private handleUniqueCodeError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const fields = Array.isArray(error.meta?.target) ? error.meta.target.join(', ') : String(error.meta?.target || 'unique field');
      throw new ConflictException(`Order unique field already exists: ${fields}`);
    }
    throw error;
  }
}

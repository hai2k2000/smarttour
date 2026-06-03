import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, OrderType, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { applyWriteDataScope, branchDepartmentScopeWhere, RequestUser } from '../auth/data-scope';
import { CreateOrderDto, UnlockOrderDto, UpdateOrderDto } from './dto/order.dto';
import { releaseAutoAllotmentLocks, syncHotelAllotmentLocks } from './order-allotment-sync';
import { replaceOrderChildren } from './order-children-sync';
import { withCustomerSnapshot } from './order-customer-snapshot';
import { calculateOrderTotals } from './order-calculator';
import { applyOrderStatus, assertOrderEditable, assertOrderNotSettled, settleOrder, unlockSettledOrder } from './order-lifecycle';

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
  constructor(private readonly prisma: PrismaService) {}

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
      include: { customer: true, _count: { select: { members: true, salesItems: true, operationItems: true, allotmentLocks: true } } },
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
    dto = applyWriteDataScope(dto as CreateOrderDto & { department?: string | null }, user) as CreateOrderDto;
    this.validateDates(dto);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const orderDto = await withCustomerSnapshot(tx, dto);
        const order = await tx.order.create({
          data: {
            type,
            ...this.toOrderData(orderDto),
            ...calculateOrderTotals(orderDto),
          } as Prisma.OrderCreateInput,
        });
        await replaceOrderChildren(tx, order.id, orderDto);
        if (type === 'HOTEL_BOOKING') await syncHotelAllotmentLocks(tx, order.id, orderDto, 'CREATE');
        await tx.orderLog.create({ data: { orderId: order.id, action: 'CREATE', newValue: orderDto as unknown as Prisma.InputJsonValue } });
        return tx.order.findUniqueOrThrow({ where: { id: order.id }, include: this.includeAll() });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Order code already exists');
      }
      throw error;
    }
  }

  async update(typePath: string, id: string, dto: UpdateOrderDto, user?: RequestUser) {
    const current = await this.detail(typePath, id, user);
    dto = applyWriteDataScope(dto as UpdateOrderDto & { department?: string | null }, user) as UpdateOrderDto;
    assertOrderEditable(current);
    this.validateDates(dto);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const orderDto = await withCustomerSnapshot(tx, dto);
        const merged = {
          ...current,
          ...orderDto,
          salesItems: orderDto.salesItems ?? current.salesItems.map((item) => ({
            serviceType: item.serviceType ?? undefined,
            supplierId: item.supplierId ?? undefined,
            serviceId: item.serviceId ?? undefined,
            description: item.description ?? undefined,
            quantity: Number(item.quantity),
            serviceCount: Number(item.serviceCount),
            unitPrice: Number(item.unitPrice),
            vat: Number(item.vat),
            note: item.note ?? undefined,
          })),
          operationItems: orderDto.operationItems ?? current.operationItems.map((item) => ({
            serviceType: item.serviceType ?? undefined,
            supplierId: item.supplierId ?? undefined,
            serviceId: item.serviceId ?? undefined,
            bookingCode: item.bookingCode ?? undefined,
            serviceDate: item.serviceDate?.toISOString(),
            quantity: Number(item.quantity),
            netPrice: Number(item.netPrice),
            vat: Number(item.vat),
            status: item.status,
            note: item.note ?? undefined,
          })),
        } as CreateOrderDto;

        await tx.order.update({
          where: { id },
          data: {
            ...this.toOrderData(orderDto),
            ...calculateOrderTotals(merged),
          } as Prisma.OrderUpdateInput,
        });
        await replaceOrderChildren(tx, id, orderDto);
        if (current.type === 'HOTEL_BOOKING' && orderDto.operationItems) {
          await releaseAutoAllotmentLocks(tx, id, 'UPDATE_RELEASE');
          await syncHotelAllotmentLocks(tx, id, merged, 'UPDATE_LOCK');
        }
        await tx.orderLog.create({ data: { orderId: id, action: 'UPDATE', newValue: orderDto as unknown as Prisma.InputJsonValue } });
        return tx.order.findUniqueOrThrow({ where: { id }, include: this.includeAll() });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Order code already exists');
      }
      throw error;
    }
  }

  async remove(typePath: string, id: string, user?: RequestUser) {
    const order = await this.detail(typePath, id, user);
    assertOrderNotSettled(order, 'deleted');
    return this.prisma.$transaction(async (tx) => {
      if (order.type === 'HOTEL_BOOKING') await releaseAutoAllotmentLocks(tx, id, 'DELETE_RELEASE');
      await tx.orderLog.create({ data: { orderId: id, action: 'DELETE', oldValue: { status: order.status } } });
      return tx.order.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }

  async updateStatus(typePath: string, id: string, status: OrderStatus, user?: RequestUser) {
    const order = await this.detail(typePath, id, user);
    return this.prisma.$transaction(async (tx) => {
      return applyOrderStatus(tx, order, status, this.includeAll());
    });
  }

  async copy(typePath: string, id: string, user?: RequestUser) {
    const order = await this.detail(typePath, id, user);
    const systemCode = `${order.systemCode}-COPY-${Date.now().toString().slice(-4)}`;
    return this.create(typePath, {
      systemCode,
      tourCode: order.tourCode ?? undefined,
      holdCode: order.holdCode ? `${order.holdCode}-COPY` : undefined,
      name: `${order.name} Copy`,
      route: order.route ?? undefined,
      marketGroup: order.marketGroup ?? undefined,
      bookingDate: order.bookingDate?.toISOString(),
      paymentDate: order.paymentDate?.toISOString(),
      startDate: order.startDate?.toISOString(),
      endDate: order.endDate?.toISOString(),
      status: order.settledAt ? 'COMPLETED' : order.status,
      tourCategory: order.tourCategory ?? undefined,
      currency: order.currency,
      exchangeRate: Number(order.exchangeRate),
      createdBy: order.createdBy ?? undefined,
      createdDate: new Date().toISOString(),
      branch: order.branch ?? undefined,
      department: order.department ?? undefined,
      customerId: order.customerId ?? undefined,
      customerName: order.customerName ?? undefined,
      customerType: order.customerType ?? undefined,
      customerPhone: order.customerPhone ?? undefined,
      customerEmail: order.customerEmail ?? undefined,
      customerAddress: order.customerAddress ?? undefined,
      agencyName: order.agencyName ?? undefined,
      collaborator: order.collaborator ?? undefined,
      operatorOwner: order.operatorOwner ?? undefined,
      adultQty: order.adultQty,
      childQty: order.childQty,
      infantQty: order.infantQty,
      quantity: order.quantity,
      roomClass: order.roomClass ?? undefined,
      servicePackage: order.servicePackage ?? undefined,
      transportType: order.transportType ?? undefined,
      pickupPoint: order.pickupPoint ?? undefined,
      dropoffPoint: order.dropoffPoint ?? undefined,
      seatTotal: order.seatTotal,
      seatHeld: order.seatHeld,
      seatSold: order.seatSold,
      allowOverbooking: order.allowOverbooking,
      receiveDeadline: order.receiveDeadline?.toISOString(),
      closeDeadline: order.closeDeadline?.toISOString(),
      paidAmount: Number(order.paidAmount),
      paidCost: Number(order.paidCost),
      commission: Number(order.commission),
      note: order.note ?? undefined,
      handoverRequest: order.handoverRequest ?? undefined,
      surveyDescription: order.surveyDescription ?? undefined,
      salesItems: order.salesItems as any,
      operationItems: order.operationItems as any,
      guides: order.guides as any,
      members: order.members as any,
      itineraries: order.itineraries as any,
      handoverItems: order.handoverItems as any,
      surveyQuestions: order.surveyQuestions as any,
      terms: order.terms as any,
    } as CreateOrderDto & { department?: string }, user);
  }

  async settle(typePath: string, id: string, user?: RequestUser) {
    const order = await this.detail(typePath, id, user);
    return this.prisma.$transaction(async (tx) => {
      return settleOrder(tx, order);
    });
  }

  async unlock(typePath: string, id: string, dto: UnlockOrderDto, user?: RequestUser) {
    const order = await this.detail(typePath, id, user);
    return this.prisma.$transaction(async (tx) => {
      return unlockSettledOrder(tx, order, dto);
    });
  }

  private toOrderData(dto: Partial<CreateOrderDto>) {
    return {
      ...(dto.systemCode !== undefined ? { systemCode: dto.systemCode.trim() } : {}),
      ...(dto.tourCode !== undefined ? { tourCode: this.text(dto.tourCode) } : {}),
      ...(dto.holdCode !== undefined ? { holdCode: this.text(dto.holdCode) } : {}),
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.route !== undefined ? { route: this.text(dto.route) } : {}),
      ...(dto.marketGroup !== undefined ? { marketGroup: this.text(dto.marketGroup) } : {}),
      ...(dto.bookingDate !== undefined ? { bookingDate: this.date(dto.bookingDate) } : {}),
      ...(dto.paymentDate !== undefined ? { paymentDate: this.date(dto.paymentDate) } : {}),
      ...(dto.startDate !== undefined ? { startDate: this.date(dto.startDate) } : {}),
      ...(dto.endDate !== undefined ? { endDate: this.date(dto.endDate) } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      ...(dto.costStatus !== undefined ? { costStatus: dto.costStatus } : {}),
      ...(dto.tourCategory !== undefined ? { tourCategory: this.text(dto.tourCategory) } : {}),
      ...(dto.currency !== undefined ? { currency: dto.currency || 'VND' } : {}),
      ...(dto.exchangeRate !== undefined ? { exchangeRate: dto.exchangeRate || 1 } : {}),
      ...(dto.createdBy !== undefined ? { createdBy: this.text(dto.createdBy) } : {}),
      ...(dto.createdDate !== undefined ? { createdDate: this.date(dto.createdDate) } : {}),
      ...(dto.branch !== undefined ? { branch: this.text(dto.branch) } : {}),
      ...((dto as { department?: string }).department !== undefined ? { department: this.text((dto as { department?: string }).department) } : {}),
      ...(dto.customerId !== undefined ? { customerId: this.text(dto.customerId) } : {}),
      ...(dto.customerName !== undefined ? { customerName: this.text(dto.customerName) } : {}),
      ...(dto.customerType !== undefined ? { customerType: this.text(dto.customerType) } : {}),
      ...(dto.customerPhone !== undefined ? { customerPhone: this.text(dto.customerPhone) } : {}),
      ...(dto.customerEmail !== undefined ? { customerEmail: this.text(dto.customerEmail) } : {}),
      ...(dto.customerAddress !== undefined ? { customerAddress: this.text(dto.customerAddress) } : {}),
      ...(dto.agencyName !== undefined ? { agencyName: this.text(dto.agencyName) } : {}),
      ...(dto.collaborator !== undefined ? { collaborator: this.text(dto.collaborator) } : {}),
      ...(dto.operatorOwner !== undefined ? { operatorOwner: this.text(dto.operatorOwner) } : {}),
      ...(dto.adultQty !== undefined ? { adultQty: dto.adultQty } : {}),
      ...(dto.childQty !== undefined ? { childQty: dto.childQty } : {}),
      ...(dto.infantQty !== undefined ? { infantQty: dto.infantQty } : {}),
      ...(dto.quantity !== undefined ? { quantity: dto.quantity } : {}),
      ...(dto.roomClass !== undefined ? { roomClass: this.text(dto.roomClass) } : {}),
      ...(dto.servicePackage !== undefined ? { servicePackage: this.text(dto.servicePackage) } : {}),
      ...(dto.transportType !== undefined ? { transportType: this.text(dto.transportType) } : {}),
      ...(dto.pickupPoint !== undefined ? { pickupPoint: this.text(dto.pickupPoint) } : {}),
      ...(dto.dropoffPoint !== undefined ? { dropoffPoint: this.text(dto.dropoffPoint) } : {}),
      ...(dto.seatTotal !== undefined ? { seatTotal: dto.seatTotal } : {}),
      ...(dto.seatHeld !== undefined ? { seatHeld: dto.seatHeld } : {}),
      ...(dto.seatSold !== undefined ? { seatSold: dto.seatSold } : {}),
      ...(dto.allowOverbooking !== undefined ? { allowOverbooking: dto.allowOverbooking } : {}),
      ...(dto.receiveDeadline !== undefined ? { receiveDeadline: this.date(dto.receiveDeadline) } : {}),
      ...(dto.closeDeadline !== undefined ? { closeDeadline: this.date(dto.closeDeadline) } : {}),
      ...(dto.commission !== undefined ? { commission: dto.commission } : {}),
      ...(dto.note !== undefined ? { note: this.text(dto.note) } : {}),
      ...(dto.handoverRequest !== undefined ? { handoverRequest: this.text(dto.handoverRequest) } : {}),
      ...(dto.surveyDescription !== undefined ? { surveyDescription: this.text(dto.surveyDescription) } : {}),
    };
  }

  private validateDates(dto: Partial<CreateOrderDto>) {
    if (dto.startDate && dto.endDate && new Date(dto.endDate) < new Date(dto.startDate)) throw new BadRequestException('End date must be after start date');
    if (dto.bookingDate && dto.paymentDate && new Date(dto.paymentDate) < new Date(dto.bookingDate)) throw new BadRequestException('Payment date must be after booking date');
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

  private text(value?: string | null) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private date(value?: string | null) {
    return value ? new Date(value) : null;
  }
}

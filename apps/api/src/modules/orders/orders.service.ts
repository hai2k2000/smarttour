import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, OrderType, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { applyWriteDataScope, branchDepartmentScopeWhere, RequestUser } from '../auth/data-scope';
import { CreateOrderDto, UnlockOrderDto, UpdateOrderDto } from './dto/order.dto';

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
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async create(typePath: string, dto: CreateOrderDto, user?: RequestUser) {
    const type = this.resolveType(typePath);
    dto = applyWriteDataScope(dto as CreateOrderDto & { department?: string | null }, user) as CreateOrderDto;
    this.validateDates(dto);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const orderDto = await this.withCustomerSnapshot(tx, dto);
        const order = await tx.order.create({
          data: {
            type,
            ...this.toOrderData(orderDto),
            ...this.calculate(orderDto),
          } as Prisma.OrderCreateInput,
        });
        await this.replaceChildren(tx, order.id, orderDto);
        if (type === 'HOTEL_BOOKING') await this.syncHotelAllotmentLocks(tx, order.id, orderDto, 'CREATE');
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
    if (current.settledAt) throw new BadRequestException('Settled order cannot be edited');
    this.validateDates(dto);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const orderDto = await this.withCustomerSnapshot(tx, dto);
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
            ...this.calculate(merged),
          } as Prisma.OrderUpdateInput,
        });
        await this.replaceChildren(tx, id, orderDto);
        if (current.type === 'HOTEL_BOOKING' && orderDto.operationItems) {
          await this.releaseAutoAllotmentLocks(tx, id, 'UPDATE_RELEASE');
          await this.syncHotelAllotmentLocks(tx, id, merged, 'UPDATE_LOCK');
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
    if (order.settledAt) throw new BadRequestException('Settled order cannot be deleted');
    return this.prisma.$transaction(async (tx) => {
      if (order.type === 'HOTEL_BOOKING') await this.releaseAutoAllotmentLocks(tx, id, 'DELETE_RELEASE');
      await tx.orderLog.create({ data: { orderId: id, action: 'DELETE', oldValue: { status: order.status } } });
      return tx.order.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }

  async updateStatus(typePath: string, id: string, status: OrderStatus, user?: RequestUser) {
    const order = await this.detail(typePath, id, user);
    return this.prisma.$transaction(async (tx) => {
      if (order.type === 'HOTEL_BOOKING') {
        if (status === 'CANCELLED') await this.releaseAutoAllotmentLocks(tx, id, 'STATUS_CANCEL_RELEASE');
        if (['RUNNING', 'COMPLETED', 'SETTLED'].includes(status)) await this.confirmAutoAllotmentLocks(tx, id, 'STATUS_CONFIRM');
      }
      const updated = await tx.order.update({ where: { id }, data: { status }, include: this.includeAll() });
      await tx.orderLog.create({ data: { orderId: id, action: 'STATUS', oldValue: { status: order.status }, newValue: { status } } });
      return updated;
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
      status: order.status,
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
    await this.detail(typePath, id, user);
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.update({ where: { id }, data: { status: 'SETTLED', settledAt: new Date() } });
      await tx.orderLog.create({ data: { orderId: id, action: 'SETTLE', newValue: { settledAt: order.settledAt } } });
      return order;
    });
  }

  async unlock(typePath: string, id: string, dto: UnlockOrderDto, user?: RequestUser) {
    const order = await this.detail(typePath, id, user);
    if (!order.settledAt) throw new BadRequestException('Order is not settled');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.order.update({ where: { id }, data: { settledAt: null, status: 'COMPLETED' } });
      await tx.orderLog.create({
        data: {
          orderId: id,
          userId: this.text(dto.actor),
          action: 'UNLOCK_SETTLEMENT',
          oldValue: { settledAt: order.settledAt, status: order.status },
          newValue: { settledAt: null, status: 'COMPLETED', reason: dto.reason },
        },
      });
      return updated;
    });
  }

  private calculate(dto: Partial<CreateOrderDto>) {
    const revenue = (dto.salesItems ?? []).reduce((sum, item) => sum + this.salesAmount(item), 0);
    const cost = (dto.operationItems ?? []).reduce((sum, item) => sum + this.operationAmount(item), 0);
    const paidAmount = dto.paidAmount ?? 0;
    const paidCost = dto.paidCost ?? 0;
    return {
      totalRevenue: revenue,
      paidAmount,
      remainingRevenue: Math.max(0, revenue - paidAmount),
      totalCost: cost,
      paidCost,
      remainingCost: Math.max(0, cost - paidCost),
      profit: revenue - cost,
      paymentStatus: revenue <= 0 || paidAmount <= 0 ? 'UNPAID' : paidAmount >= revenue ? 'PAID' : 'PARTIAL',
      costStatus: cost <= 0 || paidCost <= 0 ? 'PENDING' : paidCost >= cost ? 'PAID' : 'PARTIAL',
    };
  }

  private salesAmount(item: { quantity?: number; serviceCount?: number; unitPrice?: number; vat?: number }) {
    const base = (item.quantity ?? 1) * (item.serviceCount ?? 1) * (item.unitPrice ?? 0);
    return base * (1 + (item.vat ?? 0) / 100);
  }

  private operationAmount(item: { quantity?: number; netPrice?: number; vat?: number }) {
    const base = (item.quantity ?? 1) * (item.netPrice ?? 0);
    return base * (1 + (item.vat ?? 0) / 100);
  }

  private async replaceChildren(tx: Prisma.TransactionClient, orderId: string, dto: Partial<CreateOrderDto>) {
    if (dto.guides) {
      await tx.orderGuide.deleteMany({ where: { orderId } });
      await tx.orderGuide.createMany({ data: dto.guides.filter((i) => i.guideName || i.guideId).map((i) => ({ orderId, guideId: this.text(i.guideId), guideName: this.text(i.guideName), phone: this.text(i.phone), language: this.text(i.language), note: this.text(i.note) })) });
    }
    if (dto.salesItems) {
      await tx.orderSalesItem.deleteMany({ where: { orderId } });
      await tx.orderSalesItem.createMany({ data: dto.salesItems.map((i, index) => ({ orderId, serviceType: this.text(i.serviceType), supplierId: this.text(i.supplierId), serviceId: this.text(i.serviceId), description: this.text(i.description), quantity: i.quantity ?? 1, serviceCount: i.serviceCount ?? 1, unitPrice: i.unitPrice ?? 0, vat: i.vat ?? 0, amount: this.salesAmount(i), note: this.text(i.note), sortOrder: index })) });
    }
    if (dto.operationItems) {
      await tx.orderOperationItem.deleteMany({ where: { orderId } });
      await tx.orderOperationItem.createMany({ data: dto.operationItems.map((i, index) => ({ orderId, serviceType: this.text(i.serviceType), supplierId: this.text(i.supplierId), serviceId: this.text(i.serviceId), bookingCode: this.text(i.bookingCode), serviceDate: this.date(i.serviceDate), quantity: i.quantity ?? 1, netPrice: i.netPrice ?? 0, vat: i.vat ?? 0, amount: this.operationAmount(i), status: i.status ?? 'WAITING', note: this.text(i.note), sortOrder: index })) });
    }
    if (dto.members) {
      await tx.orderMember.deleteMany({ where: { orderId } });
      await tx.orderMember.createMany({ data: dto.members.filter((i) => i.fullName?.trim()).map((i, index) => ({ orderId, fullName: i.fullName.trim(), gender: this.text(i.gender), birthday: this.date(i.birthday), phone: this.text(i.phone), email: this.text(i.email), identityNumber: this.text(i.identityNumber), issuedDate: this.date(i.issuedDate), nationality: this.text(i.nationality), passengerType: this.text(i.passengerType), note: this.text(i.note), sortOrder: index })) });
    }
    if (dto.itineraries) {
      await tx.orderItinerary.deleteMany({ where: { orderId } });
      await tx.orderItinerary.createMany({ data: dto.itineraries.filter((i) => i.title || i.content).map((i, index) => ({ orderId, dayNo: i.dayNo, title: this.text(i.title), content: this.text(i.content), period: this.text(i.period), destination: this.text(i.destination), meals: this.text(i.meals), hotel: this.text(i.hotel), restaurant: this.text(i.restaurant), services: this.text(i.services), note: this.text(i.note), sortOrder: index })) });
    }
    if (dto.handoverItems) {
      await tx.orderHandoverItem.deleteMany({ where: { orderId } });
      await tx.orderHandoverItem.createMany({ data: dto.handoverItems.filter((i) => i.itemName?.trim()).map((i, index) => ({ orderId, itemName: i.itemName.trim(), quantity: i.quantity ?? 1, note: this.text(i.note), sortOrder: index })) });
    }
    if (dto.surveyQuestions) {
      await tx.orderSurveyQuestion.deleteMany({ where: { orderId } });
      await tx.orderSurveyQuestion.createMany({ data: dto.surveyQuestions.filter((i) => i.question?.trim()).map((i, index) => ({ orderId, question: i.question.trim(), note: this.text(i.note), sortOrder: index })) });
    }
    if (dto.terms) {
      await tx.orderTerm.deleteMany({ where: { orderId } });
      await tx.orderTerm.createMany({ data: dto.terms.map((i) => ({ orderId, language: i.language || 'VN', terms: this.text(i.terms), notes: this.text(i.notes) })) });
    }
  }

  private async withCustomerSnapshot(tx: Prisma.TransactionClient, dto: Partial<CreateOrderDto>) {
    const customerId = this.text(dto.customerId);
    if (!customerId) return dto;
    const customer = await tx.customer.findUnique({
      where: { id: customerId },
      select: { id: true, fullName: true, phone: true, email: true, address: true, kind: true, type: { select: { name: true } } },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    return {
      ...dto,
      customerId,
      customerName: dto.customerName ?? customer.fullName,
      customerPhone: dto.customerPhone ?? customer.phone,
      customerEmail: dto.customerEmail ?? customer.email ?? undefined,
      customerAddress: dto.customerAddress ?? customer.address ?? undefined,
      customerType: dto.customerType ?? customer.type?.name ?? customer.kind,
    };
  }

  private async syncHotelAllotmentLocks(tx: Prisma.TransactionClient, orderId: string, dto: Partial<CreateOrderDto>, action: string) {
    const order = await tx.order.findUnique({ where: { id: orderId }, select: { id: true, systemCode: true } });
    if (!order) throw new NotFoundException('Order not found');
    const operationRows = await tx.orderOperationItem.findMany({ where: { orderId }, orderBy: { sortOrder: 'asc' }, select: { id: true, sortOrder: true } });
    for (const [index, item] of (dto.operationItems ?? []).entries()) {
      const serviceId = this.text(item.serviceId);
      if (!serviceId) continue;
      const quantity = Math.max(1, Math.ceil(Number(item.quantity ?? 1)));
      const serviceDate = this.date(item.serviceDate) ?? this.date(dto.startDate) ?? new Date();
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

  private async releaseAutoAllotmentLocks(tx: Prisma.TransactionClient, orderId: string, action: string) {
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

  private async confirmAutoAllotmentLocks(tx: Prisma.TransactionClient, orderId: string, action: string) {
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

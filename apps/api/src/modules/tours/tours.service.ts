import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TourStatus, TourType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { applyWriteDataScope, RequestUser } from '../auth/data-scope';
import { TourCoreService } from './tour-core.service';
import { CreateTourDto } from './dto/create-tour.dto';
import { UpdateTourDto } from './dto/update-tour.dto';

const tourInclude = {
  order: true,
  fitTour: true,
  gitTour: true,
  landTour: true,
  customers: { include: { crmCustomer: true } },
  suppliers: { include: { supplier: true } },
  services: { include: { supplier: true, supplierService: true } },
  revenues: true,
  costs: { include: { supplier: true } },
  operations: true,
  guides: true,
  attachments: true,
  notesList: true,
  terms: true,
  surveys: true,
  payments: true,
  receipts: true,
  expenses: true,
  logs: { orderBy: { createdAt: 'desc' } },
} satisfies Prisma.TourInclude;

@Injectable()
export class ToursService {
  constructor(private readonly prisma: PrismaService, private readonly tourCore: TourCoreService) {}

  private listSelect() {
    return {
      id: true,
      type: true,
      status: true,
      paymentStatus: true,
      workflowStep: true,
      systemCode: true,
      orderId: true,
      tourCode: true,
      name: true,
      marketGroup: true,
      productType: true,
      bookingDate: true,
      paymentDueDate: true,
      startDate: true,
      endDate: true,
      createdBy: true,
      operatorOwner: true,
      branch: true,
      department: true,
      route: true,
      updatedAt: true,
      order: { select: { id: true, systemCode: true, tourCode: true, name: true, status: true, branch: true, department: true } },
      fitTour: { select: { id: true, quoteCode: true, tourCode: true, customerName: true, workflowStatus: true } },
      gitTour: { select: { id: true, holdCode: true, agentName: true } },
      landTour: { select: { id: true, guideName: true, comboType: true } },
      _count: {
        select: {
          customers: true,
          services: true,
          revenues: true,
          costs: true,
          attachments: true,
        },
      },
    } satisfies Prisma.TourSelect;
  }

  list(search?: string, type?: string | TourType, status?: string | TourStatus, user?: RequestUser) {
    const tourType = this.toTourType(type);
    const tourStatus = this.toTourStatus(status);
    const where: Prisma.TourWhereInput = {
      ...(tourType ? { type: tourType } : {}),
      ...(tourStatus ? { status: tourStatus } : {}),
      ...(search
        ? {
            OR: [
              { systemCode: { contains: search, mode: 'insensitive' } },
              { tourCode: { contains: search, mode: 'insensitive' } },
              { name: { contains: search, mode: 'insensitive' } },
              { marketGroup: { contains: search, mode: 'insensitive' } },
              { operatorOwner: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    return this.prisma.tour.findMany({
      where: this.tourCore.scopeWhere(where, user),
      select: this.listSelect(),
      orderBy: [{ updatedAt: 'desc' }, { systemCode: 'asc' }],
    });
  }

  async detail(id: string, user?: RequestUser) {
    const tour = await this.prisma.tour.findFirst({ where: this.tourCore.scopeWhere({ id }, user), include: tourInclude });
    if (!tour) throw new NotFoundException('Không tìm thấy tour');
    return tour;
  }

  async create(dto: CreateTourDto, user?: RequestUser) {
    dto = applyWriteDataScope(dto, user);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.tourCore.ensureOrder(tx, dto.orderId, user);
        const tour = await tx.tour.create({
          data: this.tourCore.toTourData(dto as unknown as Record<string, unknown>, true, { type: dto.type }) as Prisma.TourCreateInput,
          include: tourInclude,
        });
        await this.tourCore.log(tx, tour.id, 'CREATE_TOUR', { actor: this.actor(user), type: dto.type });
        return tour;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Mã hệ thống tour đã tồn tại');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateTourDto, user?: RequestUser) {
    const current = await this.detail(id, user);
    dto = applyWriteDataScope(dto, user);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.tourCore.ensureOrder(tx, dto.orderId, user);
        const tour = await tx.tour.update({
          where: { id },
          data: this.tourCore.toTourData(dto as Record<string, unknown>, false, { type: current.type }) as Prisma.TourUpdateInput,
          include: tourInclude,
        });
        await this.tourCore.log(tx, id, 'UPDATE_TOUR', { actor: this.actor(user) });
        return tour;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Mã hệ thống tour đã tồn tại');
      }
      throw error;
    }
  }

  async remove(id: string, user?: RequestUser) {
    await this.detail(id, user);
    return this.prisma.$transaction((tx) => this.tourCore.softDelete(tx, id, this.actor(user)));
  }

  async close(id: string, dto: { note?: string }, user?: RequestUser) {
    await this.detail(id, user);
    return this.prisma.$transaction((tx) => this.tourCore.close(tx, id, this.actor(user), dto?.note));
  }

  private toTourData(dto: UpdateTourDto, creating: boolean): Prisma.TourUncheckedCreateInput | Prisma.TourUncheckedUpdateInput {
    return {
      ...(creating ? { type: dto.type, systemCode: this.requiredText(dto.systemCode), tourCode: this.requiredText(dto.tourCode) } : {}),
      ...(dto.type !== undefined ? { type: dto.type } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      ...(dto.paymentStatus !== undefined ? { paymentStatus: dto.paymentStatus } : {}),
      ...(dto.workflowStep !== undefined ? { workflowStep: this.optionalText(dto.workflowStep) } : {}),
      ...(dto.systemCode !== undefined ? { systemCode: dto.systemCode.trim().toUpperCase() } : {}),
      ...(dto.orderId !== undefined ? { orderId: this.optionalText(dto.orderId) } : {}),
      ...(dto.tourCode !== undefined ? { tourCode: dto.tourCode.trim().toUpperCase() } : {}),
      ...(dto.name !== undefined ? { name: this.optionalText(dto.name) } : {}),
      ...(dto.marketGroup !== undefined ? { marketGroup: this.optionalText(dto.marketGroup) } : {}),
      ...(dto.productType !== undefined ? { productType: this.optionalText(dto.productType) } : {}),
      ...(dto.bookingDate !== undefined ? { bookingDate: this.optionalDate(dto.bookingDate) } : {}),
      ...(dto.paymentDueDate !== undefined ? { paymentDueDate: this.optionalDate(dto.paymentDueDate) } : {}),
      ...(dto.startDate !== undefined ? { startDate: this.optionalDate(dto.startDate) } : {}),
      ...(dto.endDate !== undefined ? { endDate: this.optionalDate(dto.endDate) } : {}),
      ...(dto.createdBy !== undefined ? { createdBy: this.optionalText(dto.createdBy) } : {}),
      ...(dto.operatorOwner !== undefined ? { operatorOwner: this.optionalText(dto.operatorOwner) } : {}),
      ...(dto.branch !== undefined ? { branch: this.optionalText(dto.branch) } : {}),
      ...(dto.department !== undefined ? { department: this.optionalText(dto.department) } : {}),
      ...(dto.customerSource !== undefined ? { customerSource: this.optionalText(dto.customerSource) } : {}),
      ...(dto.exchangeRateCode !== undefined ? { exchangeRateCode: this.optionalText(dto.exchangeRateCode) } : {}),
      ...(dto.exchangeRate !== undefined ? { exchangeRate: this.number(dto.exchangeRate) } : {}),
      ...(dto.route !== undefined ? { route: this.optionalText(dto.route) } : {}),
      ...(dto.flightRoute !== undefined ? { flightRoute: this.optionalText(dto.flightRoute) } : {}),
      ...(dto.pickupPoint !== undefined ? { pickupPoint: this.optionalText(dto.pickupPoint) } : {}),
      ...(dto.dropoffPoint !== undefined ? { dropoffPoint: this.optionalText(dto.dropoffPoint) } : {}),
      ...(dto.notes !== undefined ? { notes: this.optionalText(dto.notes) } : {}),
    };
  }

  private async ensureOrder(orderId?: string) {
    const id = this.optionalText(orderId);
    if (!id) return;
    const row = await this.prisma.order.findUnique({ where: { id }, select: { id: true } });
    if (!row) throw new NotFoundException('Không tìm thấy đơn hàng');
  }

  private requiredText(value?: string) {
    const text = value?.trim();
    if (!text) throw new BadRequestException('Thiếu trường bắt buộc của tour');
    return text.toUpperCase();
  }

  private optionalText(value?: unknown) {
    const text = typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
    return text ? text : null;
  }

  private optionalDate(value?: string) {
    const text = value?.trim();
    return text ? new Date(text) : null;
  }

  private toTourType(type?: string | TourType | null) {
    const value = this.optionalText(type);
    if (!value) return undefined;
    const normalized = value.toUpperCase();
    if (Object.values(TourType).includes(normalized as TourType)) return normalized as TourType;
    throw new BadRequestException('Loại tour không hợp lệ');
  }

  private toTourStatus(status?: string | TourStatus | null) {
    const value = this.optionalText(status);
    if (!value) return undefined;
    const normalized = value.toUpperCase();
    if (Object.values(TourStatus).includes(normalized as TourStatus)) return normalized as TourStatus;
    throw new BadRequestException('Trạng thái tour không hợp lệ');
  }

  private number(value?: number) {
    const parsed = Number(value || 0);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private actor(user?: RequestUser) {
    return user?.username || user?.email || user?.id || 'system';
  }
}

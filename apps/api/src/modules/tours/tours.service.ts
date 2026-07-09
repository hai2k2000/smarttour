import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TourStatus, TourType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { applyWriteDataScope, RequestUser } from '../auth/data-scope';
import { containsSearch, normalizeListSearch } from '../list-search';
import { TourCoreService } from './tour-core.service';
import { CreateTourDto } from './dto/create-tour.dto';
import { ListToursQueryDto } from './dto/list-tours-query.dto';
import { CloseTourDto } from './dto/tour-action.dto';
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

  list(query: ListToursQueryDto = {}, user?: RequestUser) {
    const tourType = this.toTourType(query.type);
    const tourStatus = this.toTourStatus(query.status);
    const searchText = normalizeListSearch(query.search);
    const contains = searchText ? containsSearch(searchText) : undefined;
    const where: Prisma.TourWhereInput = {
      ...(tourType ? { type: tourType } : {}),
      ...(tourStatus ? { status: tourStatus } : {}),
      ...(contains
        ? {
            OR: [
              { systemCode: contains },
              { tourCode: contains },
              { name: contains },
              { marketGroup: contains },
              { operatorOwner: contains },
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
        const created = await this.tourCore.createRoot(tx, dto as unknown as Record<string, unknown>, { type: dto.type }, user);
        await this.tourCore.logAction(tx, created.id, 'CREATE_TOUR', { user, module: 'tours', metadata: { type: dto.type } });
        return tx.tour.findUniqueOrThrow({ where: { id: created.id }, include: tourInclude });
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
    this.assertLifecycleUpdateAllowed(current.status, dto.status);
    dto = applyWriteDataScope(dto, user);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.tourCore.updateRoot(tx, id, dto as Record<string, unknown>, { type: current.type }, user);
        await this.tourCore.logAction(tx, id, 'UPDATE_TOUR', { user, module: 'tours' });
        return tx.tour.findUniqueOrThrow({ where: { id }, include: tourInclude });
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
    return this.prisma.$transaction(async (tx) => {
      await this.ensureRemovable(tx, id, user);
      return this.tourCore.softDelete(tx, id, this.actor(user));
    });
  }

  private async ensureRemovable(tx: Prisma.TransactionClient, tourId: string, user?: RequestUser) {
    const tour = await tx.tour.findFirst({
      where: this.tourCore.scopeWhere({ id: tourId }, user),
      select: {
        orderId: true,
        _count: {
          select: {
            bookings: true,
            operationVouchers: true,
            operationForms: true,
            financeReceipts: true,
            financePayments: true,
            financeInvoices: true,
            financeCashflowEntries: true,
            payments: true,
            receipts: true,
            expenses: true,
          },
        },
      },
    });
    if (!tour) throw new NotFoundException('Không tìm thấy tour');
    const hasExternalDependency = Boolean(tour.orderId) || Object.values(tour._count).some((count) => count > 0);
    if (hasExternalDependency) {
      throw new BadRequestException('Không thể xóa tour đã phát sinh đơn hàng, booking, điều hành hoặc chứng từ tài chính');
    }
  }

  async close(id: string, dto: CloseTourDto = {}, user?: RequestUser) {
    const current = await this.detail(id, user);
    if (current.status === TourStatus.CANCELLED) throw new BadRequestException('Kh\u00f4ng th\u1ec3 ho\u00e0n th\u00e0nh tour \u0111\u00e3 h\u1ee7y');
    return this.prisma.$transaction((tx) => this.tourCore.close(tx, id, this.actor(user), dto?.note));
  }

  private assertLifecycleUpdateAllowed(currentStatus: TourStatus, nextStatus?: TourStatus) {
    if (nextStatus === undefined || nextStatus === currentStatus) return;
    if (currentStatus === TourStatus.CANCELLED) {
      throw new BadRequestException('Kh\u00f4ng th\u1ec3 m\u1edf l\u1ea1i tour \u0111\u00e3 h\u1ee7y');
    }
  }

  private optionalText(value?: unknown) {
    const text = typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
    return text ? text : null;
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

  private actor(user?: RequestUser) {
    return user?.username || user?.email || user?.id || 'system';
  }
}

import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TourStatus, TourType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { applyWriteDataScope, RequestUser } from '../auth/data-scope';
import { TourCoreService } from '../tours/tour-core.service';
import { CreateGitTourDto } from './dto/create-git-tour.dto';
import { UpdateGitTourDto } from './dto/update-git-tour.dto';

type Row = Record<string, unknown>;

const gitTourInclude = {
  gitTour: true,
  customers: true,
  suppliers: true,
  revenues: true,
  services: { include: { supplier: true } },
  costs: { include: { supplier: true } },
  guides: true,
  attachments: true,
  surveys: true,
  logs: { orderBy: { createdAt: 'desc' } },
} satisfies Prisma.TourInclude;

@Injectable()
export class GitToursService {
  constructor(private readonly prisma: PrismaService, private readonly tourCore: TourCoreService) {}

  list(search?: string, status?: string | TourStatus, user?: RequestUser) {
    const tourStatus = this.toTourStatus(status);
    const where: Prisma.TourWhereInput = {
      type: TourType.GIT,
      ...(tourStatus ? { status: tourStatus } : {}),
      ...(search
        ? {
            OR: [
              { systemCode: { contains: search, mode: 'insensitive' } },
              { tourCode: { contains: search, mode: 'insensitive' } },
              { name: { contains: search, mode: 'insensitive' } },
              { operatorOwner: { contains: search, mode: 'insensitive' } },
              { customers: { some: { name: { contains: search, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };

    return this.prisma.tour.findMany({
      where: this.tourCore.scopeWhere(where, user),
      include: {
        gitTour: true,
        customers: { where: { isPrimary: true }, take: 1 },
        _count: { select: { revenues: true, services: true, costs: true } },
      },
      orderBy: [{ updatedAt: 'desc' }, { systemCode: 'asc' }],
    });
  }

  async detail(id: string, user?: RequestUser) {
    const tour = await this.prisma.tour.findFirst({ where: this.tourCore.scopeWhere({ id, type: TourType.GIT }, user), include: gitTourInclude });
    if (!tour) throw new NotFoundException('Kh?ng t?m th?y tour GIT');
    return tour;
  }

  async create(dto: CreateGitTourDto, user?: RequestUser) {
    dto = applyWriteDataScope(dto, user);
    try {
      const tour = await this.prisma.$transaction(async (tx) => {
        await this.tourCore.ensureOrder(tx, (dto as unknown as Record<string, unknown>).orderId, user);
        const created = await tx.tour.create({
          data: {
            ...this.toTourData(dto, true),
            gitTour: { create: this.toGitDetailData(dto) },
          } as Prisma.TourCreateInput,
        });
        await this.replaceChildren(tx, created.id, dto, true);
        await this.tourCore.log(tx, created.id, 'CREATE_GIT_TOUR', { actor: user?.username || user?.email || user?.id || 'system' });
        return created;
      });
      return this.detail(tour.id, user);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('M? h? th?ng tour GIT ?? t?n t?i');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateGitTourDto, user?: RequestUser) {
    await this.detail(id, user);
    dto = applyWriteDataScope(dto, user);
    try {
      await this.prisma.$transaction(async (tx) => {
        await this.tourCore.ensureOrder(tx, (dto as unknown as Record<string, unknown>).orderId, user);
        await tx.tour.update({ where: { id }, data: this.toTourData(dto, false) as Prisma.TourUpdateInput });
        await tx.gitTourDetail.upsert({
          where: { tourId: id },
          create: { ...(this.toGitDetailData(dto) as Record<string, unknown>), tourId: id } as Prisma.GitTourDetailUncheckedCreateInput,
          update: this.toGitDetailData(dto) as Prisma.GitTourDetailUncheckedUpdateInput,
        });
        await this.replaceChildren(tx, id, dto);
        await this.tourCore.log(tx, id, 'UPDATE_GIT_TOUR', { actor: user?.username || user?.email || user?.id || 'system' });
      });
      return this.detail(id, user);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('M? h? th?ng tour GIT ?? t?n t?i');
      }
      throw error;
    }
  }

  async remove(id: string, user?: RequestUser) {
    await this.detail(id, user);
    return this.prisma.$transaction((tx) => this.tourCore.softDelete(tx, id, user?.username || user?.email || user?.id || 'system'));
  }

  async copyServices(targetTourId: string, sourceTourId?: string, user?: RequestUser) {
    await this.detail(targetTourId, user);
    const source = await this.prisma.tour.findFirst({ where: this.tourCore.scopeWhere({ id: sourceTourId || targetTourId, type: TourType.GIT }, user), include: { services: true } });
    if (!source) throw new NotFoundException('Kh?ng t?m th?y tour ngu?n');

    await this.prisma.$transaction(async (tx) => {
      const services = source.services.map((service) => ({
          tourId: '',
          serviceType: service.serviceType,
          supplierId: service.supplierId,
          supplierServiceId: service.supplierServiceId,
          serviceDate: service.serviceDate,
          description: service.description,
          quantity: service.quantity,
          unit: service.unit,
          currency: service.currency,
          exchangeRate: service.exchangeRate,
          salesUnitPrice: service.salesUnitPrice,
          budgetUnitPrice: service.budgetUnitPrice,
          confirmedUnitPrice: service.confirmedUnitPrice,
          vat: service.vat,
          salesAmount: service.salesAmount,
          budgetAmount: service.budgetAmount,
          confirmedAmount: service.confirmedAmount,
          confirmationStatus: service.confirmationStatus,
          bookingCode: service.bookingCode,
          notes: service.notes,
      }));
      await this.tourCore.replaceServices(tx, targetTourId, services);
      await this.tourCore.replaceSuppliers(tx, targetTourId, this.tourCore.suppliersFromServices(services, 'GIT_SERVICE'));
    });
    return this.detail(targetTourId, user);
  }

  private async replaceChildren(tx: Prisma.TransactionClient, tourId: string, dto: UpdateGitTourDto, creating = false) {
    if (creating || dto.customerName !== undefined || dto.agentName !== undefined) {
      const customers = [this.tourCore.primaryCustomer(dto as unknown as Row, 'Khach hang GIT')];
      const agent = this.tourCore.agentCustomer(dto as unknown as Row);
      if (agent) customers.push(agent);
      await this.tourCore.replaceCustomers(tx, tourId, customers);
    }
    if (creating || dto.revenues !== undefined) {
      await this.tourCore.replaceRevenues(tx, tourId, this.tourCore.mapRevenues(dto.revenues));
    }
    if (creating || dto.costs !== undefined) {
      await this.tourCore.replaceCosts(tx, tourId, this.tourCore.mapCosts(dto.costs, 'GIT_COST'));
    }
    if (creating || dto.budgetServices !== undefined || dto.operationServices !== undefined) {
      const services = [...this.tourCore.mapBudgetServices(dto.budgetServices), ...this.tourCore.mapOperationServices(dto.operationServices)];
      await this.tourCore.replaceServices(tx, tourId, services);
      await this.tourCore.replaceSuppliers(tx, tourId, this.tourCore.suppliersFromServices(services, 'GIT_SERVICE'));
    }
    if (creating || dto.guides !== undefined) {
      await this.tourCore.replaceGuides(tx, tourId, this.tourCore.mapGuides(dto.guides));
    }
    if (creating || dto.attachments !== undefined) {
      await this.tourCore.replaceAttachments(tx, tourId, this.tourCore.mapAttachments(dto.attachments));
    }
    if (creating || dto.surveyQuestions !== undefined) {
      await this.tourCore.replaceSurveys(tx, tourId, this.tourCore.mapSurveys(dto.surveyQuestions));
    }
  }

  private toTourData(dto: UpdateGitTourDto, creating: boolean): Prisma.TourUncheckedCreateInput | Prisma.TourUncheckedUpdateInput {
    return this.tourCore.toTourData(dto as unknown as Record<string, unknown>, creating, {
      type: TourType.GIT,
      routeField: 'itinerarySummary',
      defaultWorkflowStep: 'GIT_INFO',
      defaultStatus: TourStatus.UPCOMING,
    });
  }

  private toGitDetailData(dto: UpdateGitTourDto): Prisma.GitTourDetailUncheckedCreateInput | Prisma.GitTourDetailUncheckedUpdateInput {
    return {
      ...(dto.holdCode !== undefined ? { holdCode: this.optionalText(dto.holdCode) } : {}),
      ...(dto.itinerarySummary !== undefined ? { itinerarySummary: this.optionalText(dto.itinerarySummary) } : {}),
      ...(dto.agentName !== undefined ? { agentName: this.optionalText(dto.agentName) } : {}),
      ...(dto.collaborator !== undefined ? { collaborator: this.optionalText(dto.collaborator) } : {}),
      ...(dto.commissionRate !== undefined ? { commissionRate: this.number(dto.commissionRate) } : {}),
      ...(dto.invoiceStatus !== undefined ? { invoiceStatus: this.optionalText(dto.invoiceStatus) } : {}),
      ...(dto.accountCode !== undefined ? { accountCode: this.optionalText(dto.accountCode) } : {}),
      ...(dto.fileNote !== undefined ? { fileNote: this.optionalText(dto.fileNote) } : {}),
    };
  }

  private text(value: unknown) {
    return String(value || '').trim();
  }

  private optionalText(value: unknown) {
    const text = this.text(value);
    return text ? text : null;
  }

  private toTourStatus(status?: string | TourStatus | null) {
    const value = this.text(status);
    if (!value) return undefined;
    const normalized = value.toUpperCase();
    if (Object.values(TourStatus).includes(normalized as TourStatus)) return normalized as TourStatus;
    throw new BadRequestException('Trạng thái tour GIT không hợp lệ');
  }


  private number(value: unknown) {
    const parsed = Number(value || 0);
    return Number.isFinite(parsed) ? parsed : 0;
  }


}

import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TourStatus, TourType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { applyWriteDataScope, RequestUser } from '../auth/data-scope';
import { containsSearch, normalizeListSearch } from '../list-search';
import { TourCommonChildren, TourCoreService, TourRootConfig } from '../tours/tour-core.service';
import { CreateGitTourDto } from './dto/create-git-tour.dto';
import { UpdateGitTourDto } from './dto/update-git-tour.dto';

type Row = Record<string, unknown>;

const gitTourInclude = {
  gitTour: true,
  customers: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] },
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

  async list(search?: string, status?: string | TourStatus, user?: RequestUser) {
    const tourStatus = this.toTourStatus(status);
    const searchText = normalizeListSearch(search);
    const contains = searchText ? containsSearch(searchText) : undefined;
    const where: Prisma.TourWhereInput = {
      type: TourType.GIT,
      ...(tourStatus ? { status: tourStatus } : {}),
      ...(contains
        ? {
            OR: [
              { systemCode: contains },
              { tourCode: contains },
              { name: contains },
              { operatorOwner: contains },
              { customers: { some: { name: contains } } },
            ],
          }
        : {}),
    };

    const tours = await this.prisma.tour.findMany({
      where: this.tourCore.scopeWhere(where, user),
      include: {
        gitTour: true,
        customers: {
          where: { OR: [{ isPrimary: true }, { customerType: 'AGENT' }] },
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        },
        _count: { select: { revenues: true, services: true, costs: true } },
      },
      orderBy: [{ updatedAt: 'desc' }, { systemCode: 'asc' }],
    });
    return tours.map((tour) => this.withGitCustomerSnapshot(tour, false));
  }

  async detail(id: string, user?: RequestUser) {
    const tour = await this.prisma.tour.findFirst({ where: this.tourCore.scopeWhere({ id, type: TourType.GIT }, user), include: gitTourInclude });
    if (!tour) throw new NotFoundException('Không tìm thấy tour GIT');
    return this.withGitCustomerSnapshot(tour);
  }

  async create(dto: CreateGitTourDto, user?: RequestUser) {
    dto = applyWriteDataScope(dto, user);
    try {
      const tour = await this.prisma.$transaction(async (tx) => {
        const created = await this.tourCore.createRoot(tx, this.toTourRootDto(dto), this.tourConfig(), user);
        await tx.gitTourDetail.create({
          data: { ...(this.toGitDetailData(dto) as Record<string, unknown>), tourId: created.id } as Prisma.GitTourDetailUncheckedCreateInput,
        });
        await this.replaceChildren(tx, created.id, dto, true);
        await this.logGitTourAction(tx, created.id, 'CREATE_GIT_TOUR', user);
        return created;
      });
      return this.detail(tour.id, user);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Mã hệ thống tour GIT đã tồn tại');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateGitTourDto, user?: RequestUser) {
    await this.detail(id, user);
    dto = applyWriteDataScope(dto, user);
    try {
      await this.prisma.$transaction(async (tx) => {
        await this.tourCore.updateRoot(tx, id, this.toTourRootDto(dto), this.tourConfig(), user);
        await tx.gitTourDetail.upsert({
          where: { tourId: id },
          create: { ...(this.toGitDetailData(dto) as Record<string, unknown>), tourId: id } as Prisma.GitTourDetailUncheckedCreateInput,
          update: this.toGitDetailData(dto) as Prisma.GitTourDetailUncheckedUpdateInput,
        });
        await this.replaceChildren(tx, id, dto);
        await this.logGitTourAction(tx, id, 'UPDATE_GIT_TOUR', user);
      });
      return this.detail(id, user);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Mã hệ thống tour GIT đã tồn tại');
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
    const sourceId = sourceTourId || targetTourId;
    await this.prisma.$transaction(async (tx) => {
      await this.tourCore.copyServicesFromTour(tx, targetTourId, sourceId, TourType.GIT, 'GIT_SERVICE', user);
      await this.logGitTourAction(tx, targetTourId, 'COPY_GIT_SERVICES', user, { sourceTourId: sourceId, targetTourId });
    });
    return this.detail(targetTourId, user);
  }

  private async replaceChildren(tx: Prisma.TransactionClient, tourId: string, dto: UpdateGitTourDto, creating = false) {
    const children: TourCommonChildren = {};
    if (creating || dto.customerName !== undefined || dto.agentName !== undefined) {
      children.customers = this.mapTourCustomers(dto);
    }
    if (creating || dto.revenues !== undefined) children.revenues = this.tourCore.mapRevenues(dto.revenues);
    if (creating || dto.costs !== undefined) children.costs = this.tourCore.mapCosts(dto.costs, 'GIT_COST');
    if (creating || dto.budgetServices !== undefined || dto.operationServices !== undefined) {
      children.services = this.mapTourServices(dto);
      children.serviceSupplierRole = 'GIT_SERVICE';
    }
    if (creating || dto.guides !== undefined) children.guides = this.tourCore.mapGuides(dto.guides);
    if (creating || dto.attachments !== undefined) children.attachments = this.tourCore.mapAttachments(dto.attachments);
    if (creating || dto.surveyQuestions !== undefined) children.surveys = this.tourCore.mapSurveys(dto.surveyQuestions);
    await this.tourCore.replaceCommonChildren(tx, tourId, children);
  }

  private mapTourCustomers(dto: UpdateGitTourDto): Prisma.TourCustomerCreateManyInput[] {
    const customers = [this.tourCore.primaryCustomer(dto as unknown as Row, 'Khach hang GIT')];
    const agent = this.tourCore.agentCustomer(dto as unknown as Row);
    if (agent) customers.push(agent);
    return customers;
  }

  private mapTourServices(dto: UpdateGitTourDto): Prisma.TourServiceCreateManyInput[] {
    return [...this.tourCore.mapBudgetServices(dto.budgetServices), ...this.tourCore.mapOperationServices(dto.operationServices)];
  }

  private async logGitTourAction(tx: Prisma.TransactionClient, tourId: string, action: string, user?: RequestUser, metadata: Row = {}) {
    await this.tourCore.logAction(tx, tourId, action, { user, module: 'git-tours', metadata });
  }

  private tourConfig(): TourRootConfig {
    return {
      type: TourType.GIT,
      routeField: 'route',
      defaultWorkflowStep: 'GIT_INFO',
      defaultStatus: TourStatus.UPCOMING,
    };
  }

  private toTourRootDto(dto: UpdateGitTourDto): Row {
    const rootDto = { ...(dto as unknown as Row) };
    if (rootDto.route === undefined && rootDto.itinerarySummary !== undefined) rootDto.route = rootDto.itinerarySummary;
    return rootDto;
  }

  private toGitDetailData(dto: UpdateGitTourDto): Prisma.GitTourDetailUncheckedCreateInput | Prisma.GitTourDetailUncheckedUpdateInput {
    return {
      ...(dto.holdCode !== undefined ? { holdCode: this.optionalText(dto.holdCode) } : {}),
      ...(dto.itinerarySummary !== undefined ? { itinerarySummary: this.optionalText(dto.itinerarySummary) } : {}),
      ...(dto.collaborator !== undefined ? { collaborator: this.optionalText(dto.collaborator) } : {}),
      ...(dto.commissionRate !== undefined ? { commissionRate: this.number(dto.commissionRate) } : {}),
      ...(dto.invoiceStatus !== undefined ? { invoiceStatus: this.optionalText(dto.invoiceStatus) } : {}),
      ...(dto.accountCode !== undefined ? { accountCode: this.optionalText(dto.accountCode) } : {}),
      ...(dto.fileNote !== undefined ? { fileNote: this.optionalText(dto.fileNote) } : {}),
    };
  }

  private withGitCustomerSnapshot<
    T extends {
      gitTour: (Record<string, unknown> & { agentName?: string | null }) | null;
      customers?: Array<{ customerType?: string | null; isPrimary?: boolean | null; name?: string | null }>;
    },
  >(tour: T, keepAgentCustomer = true): T {
    const customers = Array.isArray(tour.customers) ? tour.customers : [];
    const agentName = this.optionalText(customers.find((customer) => customer.customerType === 'AGENT')?.name) || this.optionalText(tour.gitTour?.agentName);
    const visibleCustomers = keepAgentCustomer ? customers : customers.filter((customer) => customer.customerType !== 'AGENT');
    return {
      ...tour,
      customers: visibleCustomers,
      gitTour: tour.gitTour ? { ...tour.gitTour, agentName } : tour.gitTour,
    } as T;
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

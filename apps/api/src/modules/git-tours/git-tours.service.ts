import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PaymentStatus, Prisma, TourServiceStatus, TourStatus, TourType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateGitTourDto } from './dto/create-git-tour.dto';
import { UpdateGitTourDto } from './dto/update-git-tour.dto';

type Row = Record<string, unknown>;

const gitTourInclude = {
  gitTour: true,
  customers: true,
  revenues: true,
  services: { include: { supplier: true } },
  costs: { include: { supplier: true } },
  attachments: true,
  logs: { orderBy: { createdAt: 'desc' } },
} satisfies Prisma.TourInclude;

@Injectable()
export class GitToursService {
  constructor(private readonly prisma: PrismaService) {}

  list(search?: string, status?: TourStatus) {
    const where: Prisma.TourWhereInput = {
      type: TourType.GIT,
      ...(status ? { status } : {}),
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
      where,
      include: {
        gitTour: true,
        customers: { where: { isPrimary: true }, take: 1 },
        _count: { select: { revenues: true, services: true, costs: true } },
      },
      orderBy: [{ updatedAt: 'desc' }, { systemCode: 'asc' }],
    });
  }

  async detail(id: string) {
    const tour = await this.prisma.tour.findFirst({ where: { id, type: TourType.GIT }, include: gitTourInclude });
    if (!tour) throw new NotFoundException('GIT tour not found');
    return tour;
  }

  async create(dto: CreateGitTourDto) {
    try {
      const tour = await this.prisma.$transaction(async (tx) => {
        const created = await tx.tour.create({
          data: {
            ...this.toTourData(dto, true),
            gitTour: { create: this.toGitDetailData(dto) },
            customers: { create: this.mapCustomers(dto) },
            revenues: { create: this.mapRevenues(dto.revenues) },
            services: { create: [...this.mapBudgetServices(dto.budgetServices), ...this.mapOperationServices(dto.operationServices)] },
            logs: { create: { action: 'CREATE_GIT_TOUR', entity: 'Tour' } },
          } as Prisma.TourCreateInput,
        });
        return created;
      });
      return this.detail(tour.id);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('GIT tour system code already exists');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateGitTourDto) {
    await this.detail(id);
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.tour.update({ where: { id }, data: this.toTourData(dto, false) as Prisma.TourUpdateInput });
        await tx.gitTourDetail.upsert({
          where: { tourId: id },
          create: { ...(this.toGitDetailData(dto) as Record<string, unknown>), tourId: id } as Prisma.GitTourDetailUncheckedCreateInput,
          update: this.toGitDetailData(dto) as Prisma.GitTourDetailUncheckedUpdateInput,
        });
        await this.replaceChildren(tx, id, dto);
        await tx.tourLog.create({ data: { tourId: id, action: 'UPDATE_GIT_TOUR', entity: 'Tour' } });
      });
      return this.detail(id);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('GIT tour system code already exists');
      }
      throw error;
    }
  }

  async remove(id: string) {
    await this.detail(id);
    return this.prisma.tour.delete({ where: { id } });
  }

  async copyServices(targetTourId: string, sourceTourId?: string) {
    await this.detail(targetTourId);
    const source = sourceTourId ? await this.prisma.tour.findUnique({ where: { id: sourceTourId }, include: { services: true } }) : await this.prisma.tour.findUnique({ where: { id: targetTourId }, include: { services: true } });
    if (!source) throw new NotFoundException('Source tour not found');

    await this.prisma.$transaction(async (tx) => {
      await tx.tourService.deleteMany({ where: { tourId: targetTourId } });
      await tx.tourService.createMany({
        data: source.services.map((service) => ({
          tourId: targetTourId,
          serviceType: service.serviceType,
          supplierId: service.supplierId,
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
        })),
      });
    });
    return this.detail(targetTourId);
  }

  private async replaceChildren(tx: Prisma.TransactionClient, tourId: string, dto: UpdateGitTourDto) {
    if (dto.customerName !== undefined || dto.agentName !== undefined) {
      await tx.tourCustomer.deleteMany({ where: { tourId } });
      await tx.tourCustomer.createMany({ data: this.mapCustomers(dto).map((customer) => ({ ...customer, tourId })) });
    }
    if (dto.revenues !== undefined) {
      await tx.tourRevenue.deleteMany({ where: { tourId } });
      await tx.tourRevenue.createMany({ data: this.mapRevenues(dto.revenues).map((row) => ({ ...row, tourId })) });
    }
    if (dto.budgetServices !== undefined || dto.operationServices !== undefined) {
      await tx.tourService.deleteMany({ where: { tourId } });
      await tx.tourService.createMany({ data: [...this.mapBudgetServices(dto.budgetServices), ...this.mapOperationServices(dto.operationServices)].map((row) => ({ ...row, tourId })) });
    }
  }

  private toTourData(dto: UpdateGitTourDto, creating: boolean): Prisma.TourUncheckedCreateInput | Prisma.TourUncheckedUpdateInput {
    return {
      ...(creating ? { type: TourType.GIT, systemCode: this.requiredText(dto.systemCode), tourCode: this.requiredText(dto.tourCode) } : {}),
      type: TourType.GIT,
      ...(dto.status !== undefined ? { status: dto.status } : creating ? { status: TourStatus.UPCOMING } : {}),
      ...(dto.paymentStatus !== undefined ? { paymentStatus: dto.paymentStatus } : creating ? { paymentStatus: PaymentStatus.UNPAID } : {}),
      workflowStep: 'GIT_INFO',
      ...(dto.systemCode !== undefined ? { systemCode: dto.systemCode.trim().toUpperCase() } : {}),
      ...(dto.tourCode !== undefined ? { tourCode: dto.tourCode.trim().toUpperCase() } : {}),
      ...(dto.name !== undefined ? { name: this.optionalText(dto.name) } : {}),
      ...(dto.marketGroup !== undefined ? { marketGroup: this.optionalText(dto.marketGroup) } : {}),
      ...(dto.bookingDate !== undefined ? { bookingDate: this.optionalDate(dto.bookingDate) } : {}),
      ...(dto.paymentDueDate !== undefined ? { paymentDueDate: this.optionalDate(dto.paymentDueDate) } : {}),
      ...(dto.startDate !== undefined ? { startDate: this.optionalDate(dto.startDate) } : {}),
      ...(dto.endDate !== undefined ? { endDate: this.optionalDate(dto.endDate) } : {}),
      ...(dto.operatorOwner !== undefined ? { operatorOwner: this.optionalText(dto.operatorOwner) } : {}),
      ...(dto.branch !== undefined ? { branch: this.optionalText(dto.branch) } : {}),
      ...(dto.department !== undefined ? { department: this.optionalText(dto.department) } : {}),
      ...(dto.customerSource !== undefined ? { customerSource: this.optionalText(dto.customerSource) } : {}),
      ...(dto.exchangeRateCode !== undefined ? { exchangeRateCode: this.optionalText(dto.exchangeRateCode) } : {}),
      ...(dto.exchangeRate !== undefined ? { exchangeRate: this.number(dto.exchangeRate) } : {}),
      ...(dto.itinerarySummary !== undefined ? { route: this.optionalText(dto.itinerarySummary) } : {}),
      ...(dto.notes !== undefined ? { notes: this.optionalText(dto.notes) } : {}),
    };
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
      ...(dto.branch !== undefined ? { branch: this.optionalText(dto.branch) } : {}),
      ...(dto.department !== undefined ? { department: this.optionalText(dto.department) } : {}),
      ...(dto.customerSource !== undefined ? { customerSource: this.optionalText(dto.customerSource) } : {}),
      ...(dto.fileNote !== undefined ? { fileNote: this.optionalText(dto.fileNote) } : {}),
    };
  }

  private mapCustomers(dto: UpdateGitTourDto): Prisma.TourCustomerCreateWithoutTourInput[] {
    const customers: Prisma.TourCustomerCreateWithoutTourInput[] = [];
    if (dto.customerName) customers.push({ customerType: 'CUSTOMER', name: dto.customerName.trim(), isPrimary: true, notes: this.optionalText(dto.notes) });
    if (dto.agentName) customers.push({ customerType: 'AGENT', name: dto.agentName.trim(), isPrimary: customers.length === 0 });
    return customers.length > 0 ? customers : [{ customerType: 'CUSTOMER', name: 'GIT Customer', isPrimary: true }];
  }

  private mapRevenues(rows?: unknown[]): Prisma.TourRevenueCreateWithoutTourInput[] {
    return this.rows(rows).map((row) => {
      const quantity = this.number(row.quantity || 1);
      const unitPrice = this.number(row.unitPrice);
      const exchangeRate = this.number(row.exchangeRate || 1);
      const vat = this.number(row.vat);
      return {
        description: this.text(row.description || 'Doanh thu tour'),
        quantity,
        unitPrice,
        currency: this.text(row.currency || 'VND'),
        exchangeRate,
        vat,
        amount: this.money(row.amount, quantity * unitPrice * exchangeRate, vat),
        invoiceNo: this.optionalText(row.invoiceNo),
        paymentStatus: PaymentStatus.UNPAID,
        notes: this.optionalText(row.notes),
      };
    });
  }

  private mapBudgetServices(rows?: unknown[]): Prisma.TourServiceCreateWithoutTourInput[] {
    return this.rows(rows).map((row) => {
      const quantity = this.number(row.quantity || 1);
      const budgetUnitPrice = this.number(row.unitPrice || row.budgetUnitPrice);
      const vat = this.number(row.vat);
      return {
        serviceType: this.text(row.serviceType || 'Dich vu'),
        supplier: this.optionalText(row.supplierId) ? { connect: { id: this.text(row.supplierId) } } : undefined,
        description: this.optionalText(row.description),
        quantity,
        budgetUnitPrice,
        vat,
        budgetAmount: this.money(row.amount, quantity * budgetUnitPrice, vat),
        confirmationStatus: TourServiceStatus.WAITING,
        notes: this.optionalText(row.notes),
      };
    });
  }

  private mapOperationServices(rows?: unknown[]): Prisma.TourServiceCreateWithoutTourInput[] {
    return this.rows(rows).map((row) => {
      const quantity = this.number(row.quantity || 1);
      const confirmedUnitPrice = this.number(row.confirmedUnitPrice || row.unitPrice);
      const vat = this.number(row.vat);
      return {
        serviceType: this.text(row.serviceType || 'Dich vu'),
        supplier: this.optionalText(row.supplierId) ? { connect: { id: this.text(row.supplierId) } } : undefined,
        bookingCode: this.optionalText(row.bookingCode),
        quantity,
        confirmedUnitPrice,
        vat,
        confirmedAmount: this.money(row.amount, quantity * confirmedUnitPrice, vat),
        confirmationStatus: this.toServiceStatus(row.status),
        notes: this.optionalText(row.notes),
      };
    });
  }

  private rows(rows?: unknown[]): Row[] {
    return (rows || []).filter((row): row is Row => Boolean(row) && typeof row === 'object');
  }

  private requiredText(value?: string) {
    const text = value?.trim();
    if (!text) throw new BadRequestException('Required GIT tour field missing');
    return text.toUpperCase();
  }

  private text(value: unknown) {
    return String(value || '').trim();
  }

  private optionalText(value: unknown) {
    const text = this.text(value);
    return text ? text : null;
  }

  private optionalDate(value?: string) {
    const text = value?.trim();
    return text ? new Date(text) : null;
  }

  private number(value: unknown) {
    const parsed = Number(value || 0);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private money(explicitAmount: unknown, subtotal: number, vat: number) {
    const amount = this.number(explicitAmount);
    return amount > 0 ? amount : subtotal * (1 + vat / 100);
  }

  private toServiceStatus(status: unknown) {
    const value = this.text(status);
    if (Object.values(TourServiceStatus).includes(value as TourServiceStatus)) return value as TourServiceStatus;
    return TourServiceStatus.WAITING;
  }
}

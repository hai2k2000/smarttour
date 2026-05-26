import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PaymentStatus, Prisma, TourServiceStatus, TourStatus, TourType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateLandTourDto } from './dto/create-landtour.dto';
import { UpdateLandTourDto } from './dto/update-landtour.dto';

type Row = Record<string, unknown>;

const landTourInclude = {
  landTour: true,
  customers: true,
  services: { include: { supplier: true } },
  terms: true,
  attachments: true,
  logs: { orderBy: { createdAt: 'desc' } },
} satisfies Prisma.TourInclude;

@Injectable()
export class LandToursService {
  constructor(private readonly prisma: PrismaService) {}

  list(search?: string, status?: TourStatus) {
    const where: Prisma.TourWhereInput = {
      type: TourType.LANDTOUR,
      ...(status ? { status } : {}),
      ...(search
        ? {
            OR: [
              { systemCode: { contains: search, mode: 'insensitive' } },
              { tourCode: { contains: search, mode: 'insensitive' } },
              { name: { contains: search, mode: 'insensitive' } },
              { route: { contains: search, mode: 'insensitive' } },
              { customers: { some: { name: { contains: search, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };

    return this.prisma.tour.findMany({
      where,
      include: {
        landTour: true,
        customers: { where: { isPrimary: true }, take: 1 },
        _count: { select: { services: true, terms: true } },
      },
      orderBy: [{ updatedAt: 'desc' }, { systemCode: 'asc' }],
    });
  }

  async detail(id: string) {
    const tour = await this.prisma.tour.findFirst({ where: { id, type: TourType.LANDTOUR }, include: landTourInclude });
    if (!tour) throw new NotFoundException('LandTour not found');
    return tour;
  }

  async create(dto: CreateLandTourDto) {
    try {
      const tour = await this.prisma.tour.create({
        data: {
          ...this.toTourData(dto, true),
          landTour: { create: this.toLandDetailData(dto) },
          customers: { create: this.mapCustomers(dto) },
          services: { create: [...this.mapSalesServices(dto.salesServices), ...this.mapOperationServices(dto.operationServices)] },
          terms: { create: this.mapTerms(dto) },
          logs: { create: { action: 'CREATE_LANDTOUR', entity: 'Tour' } },
        } as Prisma.TourCreateInput,
      });
      return this.detail(tour.id);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('LandTour system code already exists');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateLandTourDto) {
    await this.detail(id);
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.tour.update({ where: { id }, data: this.toTourData(dto, false) as Prisma.TourUpdateInput });
        await tx.landTourDetail.upsert({
          where: { tourId: id },
          create: { ...(this.toLandDetailData(dto) as Record<string, unknown>), tourId: id } as Prisma.LandTourDetailUncheckedCreateInput,
          update: this.toLandDetailData(dto) as Prisma.LandTourDetailUncheckedUpdateInput,
        });
        await this.replaceChildren(tx, id, dto);
        await tx.tourLog.create({ data: { tourId: id, action: 'UPDATE_LANDTOUR', entity: 'Tour' } });
      });
      return this.detail(id);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('LandTour system code already exists');
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
    const source = await this.prisma.tour.findUnique({ where: { id: sourceTourId || targetTourId }, include: { services: true } });
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

  private async replaceChildren(tx: Prisma.TransactionClient, tourId: string, dto: UpdateLandTourDto) {
    if (dto.customerName !== undefined) {
      await tx.tourCustomer.deleteMany({ where: { tourId } });
      await tx.tourCustomer.createMany({ data: this.mapCustomers(dto).map((row) => ({ ...row, tourId })) });
    }
    if (dto.salesServices !== undefined || dto.operationServices !== undefined) {
      await tx.tourService.deleteMany({ where: { tourId } });
      await tx.tourService.createMany({ data: [...this.mapSalesServices(dto.salesServices), ...this.mapOperationServices(dto.operationServices)].map((row) => ({ ...row, tourId })) });
    }
    if (dto.termsVi !== undefined || dto.termsEn !== undefined) {
      await tx.tourTerm.deleteMany({ where: { tourId } });
      await tx.tourTerm.createMany({ data: this.mapTerms(dto).map((row) => ({ ...row, tourId })) });
    }
  }

  private toTourData(dto: UpdateLandTourDto, creating: boolean): Prisma.TourUncheckedCreateInput | Prisma.TourUncheckedUpdateInput {
    return {
      ...(creating ? { type: TourType.LANDTOUR, systemCode: this.requiredText(dto.systemCode), tourCode: this.requiredText(dto.tourCode) } : {}),
      type: TourType.LANDTOUR,
      ...(dto.status !== undefined ? { status: dto.status } : creating ? { status: TourStatus.UPCOMING } : {}),
      ...(dto.paymentStatus !== undefined ? { paymentStatus: dto.paymentStatus } : creating ? { paymentStatus: PaymentStatus.UNPAID } : {}),
      workflowStep: 'LANDTOUR_INFO',
      ...(dto.systemCode !== undefined ? { systemCode: dto.systemCode.trim().toUpperCase() } : {}),
      ...(dto.tourCode !== undefined ? { tourCode: dto.tourCode.trim().toUpperCase() } : {}),
      ...(dto.name !== undefined ? { name: this.optionalText(dto.name) } : {}),
      ...(dto.marketGroup !== undefined ? { marketGroup: this.optionalText(dto.marketGroup) } : {}),
      productType: 'LANDTOUR',
      ...(dto.bookingDate !== undefined ? { bookingDate: this.optionalDate(dto.bookingDate) } : {}),
      ...(dto.paymentDueDate !== undefined ? { paymentDueDate: this.optionalDate(dto.paymentDueDate) } : {}),
      ...(dto.startDate !== undefined ? { startDate: this.optionalDate(dto.startDate) } : {}),
      ...(dto.endDate !== undefined ? { endDate: this.optionalDate(dto.endDate) } : {}),
      ...(dto.operatorOwner !== undefined ? { operatorOwner: this.optionalText(dto.operatorOwner) } : {}),
      ...(dto.exchangeRateCode !== undefined ? { exchangeRateCode: this.optionalText(dto.exchangeRateCode) } : {}),
      ...(dto.exchangeRate !== undefined ? { exchangeRate: this.number(dto.exchangeRate) } : {}),
      ...(dto.itinerarySummary !== undefined ? { route: this.optionalText(dto.itinerarySummary) } : {}),
      ...(dto.notes !== undefined ? { notes: this.optionalText(dto.notes) } : {}),
    };
  }

  private toLandDetailData(dto: UpdateLandTourDto): Prisma.LandTourDetailUncheckedCreateInput | Prisma.LandTourDetailUncheckedUpdateInput {
    return {
      ...(dto.guideName !== undefined ? { guideName: this.optionalText(dto.guideName) } : {}),
      ...(dto.comboType !== undefined ? { comboType: this.optionalText(dto.comboType) } : {}),
      ...(dto.autoTermsEnabled !== undefined ? { autoTermsEnabled: Boolean(dto.autoTermsEnabled) } : {}),
      ...(dto.smartLinkCode !== undefined ? { smartLinkCode: this.optionalText(dto.smartLinkCode) } : {}),
      ...(dto.confirmationNote !== undefined ? { confirmationNote: this.optionalText(dto.confirmationNote) } : {}),
      ...(dto.termsVi !== undefined ? { termsVi: this.optionalText(dto.termsVi) } : {}),
      ...(dto.termsEn !== undefined ? { termsEn: this.optionalText(dto.termsEn) } : {}),
    };
  }

  private mapCustomers(dto: UpdateLandTourDto): Prisma.TourCustomerCreateWithoutTourInput[] {
    return [{ customerType: 'CUSTOMER', name: dto.customerName?.trim() || 'LandTour Customer', isPrimary: true, notes: this.optionalText(dto.notes) }];
  }

  private mapSalesServices(rows?: unknown[]): Prisma.TourServiceCreateWithoutTourInput[] {
    return this.rows(rows).map((row) => {
      const quantity = this.number(row.quantity || 1);
      const salesUnitPrice = this.number(row.unitPrice || row.salesUnitPrice);
      const vat = this.number(row.vat);
      return {
        serviceType: this.text(row.serviceType || 'Land service'),
        supplier: this.optionalText(row.supplierId) ? { connect: { id: this.text(row.supplierId) } } : undefined,
        description: this.optionalText(row.description),
        quantity,
        salesUnitPrice,
        vat,
        salesAmount: this.money(row.amount, quantity * salesUnitPrice, vat),
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
        serviceType: this.text(row.serviceType || 'Land service'),
        supplier: this.optionalText(row.supplierId) ? { connect: { id: this.text(row.supplierId) } } : undefined,
        description: this.optionalText(row.description),
        quantity,
        confirmedUnitPrice,
        vat,
        confirmedAmount: this.money(row.amount, quantity * confirmedUnitPrice, vat),
        confirmationStatus: this.toServiceStatus(row.status),
        bookingCode: this.optionalText(row.bookingCode),
        notes: this.optionalText(row.notes),
      };
    });
  }

  private mapTerms(dto: UpdateLandTourDto): Prisma.TourTermCreateWithoutTourInput[] {
    const terms: Prisma.TourTermCreateWithoutTourInput[] = [];
    if (dto.termsVi) terms.push({ language: 'VI', termType: 'LANDTOUR', content: dto.termsVi });
    if (dto.termsEn) terms.push({ language: 'EN', termType: 'LANDTOUR', content: dto.termsEn });
    return terms;
  }

  private rows(rows?: unknown[]): Row[] {
    return (rows || []).filter((row): row is Row => Boolean(row) && typeof row === 'object');
  }

  private requiredText(value?: string) {
    const text = value?.trim();
    if (!text) throw new BadRequestException('Required LandTour field missing');
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

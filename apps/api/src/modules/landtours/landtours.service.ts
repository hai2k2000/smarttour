import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TourStatus, TourType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { applyWriteDataScope, RequestUser } from '../auth/data-scope';
import { TourCoreService } from '../tours/tour-core.service';
import { CreateLandTourDto } from './dto/create-landtour.dto';
import { UpdateLandTourDto } from './dto/update-landtour.dto';

type Row = Record<string, unknown>;

const landTourInclude = {
  landTour: true,
  customers: true,
  suppliers: true,
  revenues: true,
  services: { include: { supplier: true } },
  costs: { include: { supplier: true } },
  guides: true,
  terms: true,
  attachments: true,
  surveys: true,
  logs: { orderBy: { createdAt: 'desc' } },
} satisfies Prisma.TourInclude;

@Injectable()
export class LandToursService {
  constructor(private readonly prisma: PrismaService, private readonly tourCore: TourCoreService) {}

  list(search?: string, status?: TourStatus, user?: RequestUser) {
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
      where: this.tourCore.scopeWhere(where, user),
      include: {
        landTour: true,
        customers: { where: { isPrimary: true }, take: 1 },
        _count: { select: { services: true, terms: true } },
      },
      orderBy: [{ updatedAt: 'desc' }, { systemCode: 'asc' }],
    });
  }

  async detail(id: string, user?: RequestUser) {
    const tour = await this.prisma.tour.findFirst({ where: this.tourCore.scopeWhere({ id, type: TourType.LANDTOUR }, user), include: landTourInclude });
    if (!tour) throw new NotFoundException('Không tìm thấy landtour');
    return tour;
  }

  async create(dto: CreateLandTourDto, user?: RequestUser) {
    dto = applyWriteDataScope(dto as CreateLandTourDto & { branch?: string | null; department?: string | null }, user) as CreateLandTourDto;
    try {
      const tour = await this.prisma.$transaction(async (tx) => {
        await this.tourCore.ensureOrder(tx, (dto as unknown as Record<string, unknown>).orderId, user);
        const created = await tx.tour.create({
          data: {
            ...this.toTourData(dto, true),
            landTour: { create: this.toLandDetailData(dto) },
          } as Prisma.TourCreateInput,
        });
        await this.replaceChildren(tx, created.id, dto, true);
        await this.tourCore.log(tx, created.id, 'CREATE_LANDTOUR', { actor: user?.username || user?.email || user?.id || 'system' });
        return created;
      });
      return this.detail(tour.id, user);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Mã hệ thống landtour đã tồn tại');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateLandTourDto, user?: RequestUser) {
    await this.detail(id, user);
    dto = applyWriteDataScope(dto as UpdateLandTourDto & { branch?: string | null; department?: string | null }, user) as UpdateLandTourDto;
    try {
      await this.prisma.$transaction(async (tx) => {
        await this.tourCore.ensureOrder(tx, (dto as unknown as Record<string, unknown>).orderId, user);
        await tx.tour.update({ where: { id }, data: this.toTourData(dto, false) as Prisma.TourUpdateInput });
        await tx.landTourDetail.upsert({
          where: { tourId: id },
          create: { ...(this.toLandDetailData(dto) as Record<string, unknown>), tourId: id } as Prisma.LandTourDetailUncheckedCreateInput,
          update: this.toLandDetailData(dto) as Prisma.LandTourDetailUncheckedUpdateInput,
        });
        await this.replaceChildren(tx, id, dto);
        await this.tourCore.log(tx, id, 'UPDATE_LANDTOUR', { actor: user?.username || user?.email || user?.id || 'system' });
      });
      return this.detail(id, user);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Mã hệ thống landtour đã tồn tại');
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
    const source = await this.prisma.tour.findFirst({ where: this.tourCore.scopeWhere({ id: sourceTourId || targetTourId, type: TourType.LANDTOUR }, user), include: { services: true } });
    if (!source) throw new NotFoundException('Không tìm thấy tour nguồn');

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
      await this.tourCore.replaceSuppliers(tx, targetTourId, this.tourCore.suppliersFromServices(services, 'LANDTOUR_SERVICE'));
    });
    return this.detail(targetTourId, user);
  }

  private async replaceChildren(tx: Prisma.TransactionClient, tourId: string, dto: UpdateLandTourDto, creating = false) {
    if (creating || dto.customerName !== undefined) {
      await this.tourCore.replaceCustomers(tx, tourId, [this.tourCore.primaryCustomer(dto as unknown as Row, 'Khách hàng landtour')]);
    }
    if (creating || dto.revenues !== undefined) {
      await this.tourCore.replaceRevenues(tx, tourId, this.tourCore.mapRevenues(dto.revenues));
    }
    if (creating || dto.costs !== undefined) {
      await this.tourCore.replaceCosts(tx, tourId, this.tourCore.mapCosts(dto.costs, 'LANDTOUR_COST'));
    }
    if (creating || dto.salesServices !== undefined || dto.operationServices !== undefined) {
      const services = [...this.tourCore.mapSalesServices(dto.salesServices), ...this.tourCore.mapOperationServices(dto.operationServices)];
      await this.tourCore.replaceServices(tx, tourId, services);
      await this.tourCore.replaceSuppliers(tx, tourId, this.tourCore.suppliersFromServices(services, 'LANDTOUR_SERVICE'));
    }
    if (creating || dto.guideName !== undefined || dto.guides !== undefined) {
      await this.tourCore.replaceGuides(tx, tourId, this.mapTourGuides(dto));
    }
    if (creating || dto.attachments !== undefined) {
      await this.tourCore.replaceAttachments(tx, tourId, this.tourCore.mapAttachments(dto.attachments));
    }
    if (creating || dto.surveyQuestions !== undefined) {
      await this.tourCore.replaceSurveys(tx, tourId, this.tourCore.mapSurveys(dto.surveyQuestions));
    }
    if (creating || dto.termsVi !== undefined || dto.termsEn !== undefined) {
      await this.tourCore.replaceTerms(tx, tourId, this.mapTerms(dto));
    }
  }

  private toTourData(dto: UpdateLandTourDto, creating: boolean): Prisma.TourUncheckedCreateInput | Prisma.TourUncheckedUpdateInput {
    return this.tourCore.toTourData(dto as unknown as Record<string, unknown>, creating, {
      type: TourType.LANDTOUR,
      routeField: 'itinerarySummary',
      defaultWorkflowStep: 'LANDTOUR_INFO',
      defaultProductType: 'LANDTOUR',
      defaultStatus: TourStatus.UPCOMING,
    });
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

  private mapTourGuides(dto: UpdateLandTourDto): Prisma.TourGuideCreateManyInput[] {
    const guides = this.tourCore.mapGuides(dto.guides);
    if (!guides.length && dto.guideName) {
      guides.push({ tourId: '', name: dto.guideName, guideType: 'LANDTOUR' });
    }
    return guides;
  }

  private mapTerms(dto: UpdateLandTourDto): Prisma.TourTermCreateManyInput[] {
    const terms: Prisma.TourTermCreateManyInput[] = [];
    if (dto.termsVi) terms.push({ tourId: '', language: 'VI', termType: 'LANDTOUR', content: dto.termsVi });
    if (dto.termsEn) terms.push({ tourId: '', language: 'EN', termType: 'LANDTOUR', content: dto.termsEn });
    return terms;
  }
  private text(value: unknown) {
    return String(value || '').trim();
  }

  private optionalText(value: unknown) {
    const text = this.text(value);
    return text ? text : null;
  }


  private number(value: unknown) {
    const parsed = Number(value || 0);
    return Number.isFinite(parsed) ? parsed : 0;
  }


}

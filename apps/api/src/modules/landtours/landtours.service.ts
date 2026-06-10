import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TourStatus, TourType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { applyWriteDataScope, RequestUser } from '../auth/data-scope';
import { containsSearch, normalizeListSearch } from '../list-search';
import { TourCommonChildren, TourCoreService, TourRootConfig } from '../tours/tour-core.service';
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
  guides: { orderBy: [{ guideType: 'asc' }, { name: 'asc' }] },
  terms: { orderBy: [{ language: 'asc' }, { termType: 'asc' }] },
  attachments: true,
  surveys: true,
  logs: { orderBy: { createdAt: 'desc' } },
} satisfies Prisma.TourInclude;

@Injectable()
export class LandToursService {
  constructor(private readonly prisma: PrismaService, private readonly tourCore: TourCoreService) {}

  async list(search?: string, status?: string | TourStatus, user?: RequestUser) {
    const tourStatus = this.toTourStatus(status);
    const searchText = normalizeListSearch(search);
    const contains = searchText ? containsSearch(searchText) : undefined;
    const where: Prisma.TourWhereInput = {
      type: TourType.LANDTOUR,
      ...(tourStatus ? { status: tourStatus } : {}),
      ...(contains
        ? {
            OR: [
              { systemCode: contains },
              { tourCode: contains },
              { name: contains },
              { route: contains },
              { customers: { some: { name: contains } } },
              { guides: { some: { name: contains } } },
            ],
          }
        : {}),
    };

    const tours = await this.prisma.tour.findMany({
      where: this.tourCore.scopeWhere(where, user),
      include: {
        landTour: true,
        customers: { where: { isPrimary: true }, take: 1 },
        guides: { orderBy: [{ guideType: 'asc' }, { name: 'asc' }] },
        _count: { select: { services: true, terms: true } },
      },
      orderBy: [{ updatedAt: 'desc' }, { systemCode: 'asc' }],
    });
    return tours.map((tour) => this.withLandGuideSnapshot(tour, false));
  }

  async detail(id: string, user?: RequestUser) {
    const tour = await this.prisma.tour.findFirst({ where: this.tourCore.scopeWhere({ id, type: TourType.LANDTOUR }, user), include: landTourInclude });
    if (!tour) throw new NotFoundException('Không tìm thấy landtour');
    return this.withLandGuideSnapshot(tour);
  }

  async create(dto: CreateLandTourDto, user?: RequestUser) {
    dto = applyWriteDataScope(dto as CreateLandTourDto & { branch?: string | null; department?: string | null }, user) as CreateLandTourDto;
    try {
      const tour = await this.prisma.$transaction(async (tx) => {
        const created = await this.tourCore.createRoot(tx, this.toTourRootDto(dto), this.tourConfig(), user);
        await tx.landTourDetail.create({
          data: { ...(this.toLandDetailData(dto) as Record<string, unknown>), tourId: created.id } as Prisma.LandTourDetailUncheckedCreateInput,
        });
        await this.replaceChildren(tx, created.id, dto, true);
        await this.logLandTourAction(tx, created.id, 'CREATE_LANDTOUR', user);
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
        await this.tourCore.updateRoot(tx, id, this.toTourRootDto(dto), this.tourConfig(), user);
        await tx.landTourDetail.upsert({
          where: { tourId: id },
          create: { ...(this.toLandDetailData(dto) as Record<string, unknown>), tourId: id } as Prisma.LandTourDetailUncheckedCreateInput,
          update: this.toLandDetailData(dto) as Prisma.LandTourDetailUncheckedUpdateInput,
        });
        await this.replaceChildren(tx, id, dto);
        await this.logLandTourAction(tx, id, 'UPDATE_LANDTOUR', user);
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
    const sourceId = sourceTourId || targetTourId;
    await this.prisma.$transaction(async (tx) => {
      await this.tourCore.copyServicesFromTour(tx, targetTourId, sourceId, TourType.LANDTOUR, 'LANDTOUR_SERVICE', user);
      await this.logLandTourAction(tx, targetTourId, 'COPY_LANDTOUR_SERVICES', user, { sourceTourId: sourceId, targetTourId });
    });
    return this.detail(targetTourId, user);
  }

  private async replaceChildren(tx: Prisma.TransactionClient, tourId: string, dto: UpdateLandTourDto, creating = false) {
    const children: TourCommonChildren = {};
    if (creating || dto.customerName !== undefined) children.customers = this.mapTourCustomers(dto);
    if (creating || dto.revenues !== undefined) children.revenues = this.tourCore.mapRevenues(dto.revenues);
    if (creating || dto.costs !== undefined) children.costs = this.tourCore.mapCosts(dto.costs, 'LANDTOUR_COST');
    if (creating || dto.salesServices !== undefined || dto.operationServices !== undefined) {
      children.services = this.mapTourServices(dto);
      children.serviceSupplierRole = 'LANDTOUR_SERVICE';
    }
    if (creating || dto.guideName !== undefined || dto.guides !== undefined) children.guides = this.mapTourGuides(dto);
    if (creating || dto.attachments !== undefined) children.attachments = this.tourCore.mapAttachments(dto.attachments);
    if (creating || dto.surveyQuestions !== undefined) children.surveys = this.tourCore.mapSurveys(dto.surveyQuestions);
    if (creating || dto.termsVi !== undefined || dto.termsEn !== undefined) children.terms = this.mapTerms(dto);
    await this.tourCore.replaceCommonChildren(tx, tourId, children);
  }

  private mapTourCustomers(dto: UpdateLandTourDto): Prisma.TourCustomerCreateManyInput[] {
    return [this.tourCore.primaryCustomer(dto as unknown as Row, 'Khach hang landtour')];
  }

  private mapTourServices(dto: UpdateLandTourDto): Prisma.TourServiceCreateManyInput[] {
    return [...this.tourCore.mapSalesServices(dto.salesServices), ...this.tourCore.mapOperationServices(dto.operationServices)];
  }

  private async logLandTourAction(tx: Prisma.TransactionClient, tourId: string, action: string, user?: RequestUser, metadata: Row = {}) {
    await this.tourCore.logAction(tx, tourId, action, { user, module: 'landtours', metadata });
  }

  private tourConfig(): TourRootConfig {
    return {
      type: TourType.LANDTOUR,
      routeField: 'route',
      defaultWorkflowStep: 'LANDTOUR_INFO',
      defaultProductType: 'LANDTOUR',
      defaultStatus: TourStatus.UPCOMING,
    };
  }

  private toTourRootDto(dto: UpdateLandTourDto): Row {
    const rootDto = { ...(dto as unknown as Row) };
    if (rootDto.route === undefined && rootDto.itinerarySummary !== undefined) rootDto.route = rootDto.itinerarySummary;
    return rootDto;
  }

  private toLandDetailData(dto: UpdateLandTourDto): Prisma.LandTourDetailUncheckedCreateInput | Prisma.LandTourDetailUncheckedUpdateInput {
    return {
      ...(dto.comboType !== undefined ? { comboType: this.optionalText(dto.comboType) } : {}),
      ...(dto.autoTermsEnabled !== undefined ? { autoTermsEnabled: Boolean(dto.autoTermsEnabled) } : {}),
      ...(dto.smartLinkCode !== undefined ? { smartLinkCode: this.optionalText(dto.smartLinkCode) } : {}),
      ...(dto.confirmationNote !== undefined ? { confirmationNote: this.optionalText(dto.confirmationNote) } : {}),
    };
  }

  private withLandGuideSnapshot<
    T extends {
      landTour: (Record<string, unknown> & { guideName?: string | null; termsVi?: string | null; termsEn?: string | null }) | null;
      guides?: Array<{ guideType?: string | null; name?: string | null }>;
      terms?: Array<{ language?: string | null; termType?: string | null; content?: string | null }>;
    },
  >(tour: T, keepGuides = true): T {
    const guides = Array.isArray(tour.guides) ? tour.guides : [];
    const terms = Array.isArray(tour.terms) ? tour.terms : [];
    const guideName =
      this.optionalText(guides.find((guide) => guide.guideType === 'LANDTOUR')?.name) || this.optionalText(guides[0]?.name) || this.optionalText(tour.landTour?.guideName);
    const termsVi = this.termContent(terms, 'VI') || this.optionalText(tour.landTour?.termsVi);
    const termsEn = this.termContent(terms, 'EN') || this.optionalText(tour.landTour?.termsEn);
    return {
      ...tour,
      guides: keepGuides ? guides : undefined,
      landTour: tour.landTour ? { ...tour.landTour, guideName, termsVi, termsEn } : tour.landTour,
    } as T;
  }

  private termContent(terms: Array<{ language?: string | null; termType?: string | null; content?: string | null }>, language: string) {
    return this.optionalText(terms.find((term) => term.language === language && term.termType === 'LANDTOUR')?.content) || this.optionalText(terms.find((term) => term.language === language)?.content);
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

  private toTourStatus(status?: string | TourStatus | null) {
    const value = this.text(status);
    if (!value) return undefined;
    const normalized = value.toUpperCase();
    if (Object.values(TourStatus).includes(normalized as TourStatus)) return normalized as TourStatus;
    throw new BadRequestException('Trạng thái LandTour không hợp lệ');
  }


  private number(value: unknown) {
    const parsed = Number(value || 0);
    return Number.isFinite(parsed) ? parsed : 0;
  }


}

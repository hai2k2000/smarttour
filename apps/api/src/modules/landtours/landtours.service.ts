import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PaymentStatus, Prisma, TourServiceStatus, TourStatus, TourType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { applyWriteDataScope, RequestUser } from '../auth/data-scope';
import { containsSearch, normalizeListSearch } from '../list-search';
import { TourCommonChildren, TourCoreService, TourRootConfig } from '../tours/tour-core.service';
import { CreateLandTourDto } from './dto/create-landtour.dto';
import { DEFAULT_LANDTOURS_TAKE, ListLandToursQueryDto } from './dto/list-landtours-query.dto';
import { UpdateLandTourDto } from './dto/update-landtour.dto';

type Row = Record<string, unknown>;

const LANDTOUR_WORKFLOW_STEPS = new Set(['LANDTOUR_INFO', 'LANDTOUR_COSTING', 'LANDTOUR_OPERATION', 'LANDTOUR_HANDOVER', 'LANDTOUR_SURVEY', 'LANDTOUR_COMPLETED']);

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

  async list(query: ListLandToursQueryDto = {}, user?: RequestUser) {
    const tourStatus = this.toTourStatus(query.status);
    const searchText = normalizeListSearch(query.search);
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
              { operatorOwner: contains },
              { customers: { some: { name: contains } } },
              { guides: { some: { name: contains } } },
              { terms: { some: { content: contains } } },
              { landTour: { is: { comboType: contains } } },
              { landTour: { is: { smartLinkCode: contains } } },
              { landTour: { is: { confirmationNote: contains } } },
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
      take: this.listTake(query.take),
      orderBy: [{ updatedAt: 'desc' }, { systemCode: 'asc' }],
    });
    return tours.map((tour) => this.withLandGuideSnapshot(tour, false));
  }

  private listTake(take?: number) {
    return take ?? DEFAULT_LANDTOURS_TAKE;
  }

  async detail(id: string, user?: RequestUser) {
    const tour = await this.prisma.tour.findFirst({ where: this.tourCore.scopeWhere({ id, type: TourType.LANDTOUR }, user), include: landTourInclude });
    if (!tour) throw new NotFoundException('Không tìm thấy LandTour');
    return this.withLandGuideSnapshot(tour);
  }

  async create(dto: CreateLandTourDto, user?: RequestUser) {
    dto = this.prepareLandTourDto(applyWriteDataScope(dto as CreateLandTourDto & { branch?: string | null; department?: string | null }, user), true) as CreateLandTourDto;
    try {
      const tour = await this.prisma.$transaction(async (tx) => {
        await this.ensureCodeUniqueness(tx, dto);
        const created = await this.tourCore.createRoot(tx, this.toTourRootDto(dto), this.tourConfig(), user);
        await tx.landTourDetail.create({
          data: { ...(this.toLandDetailData(dto) as Record<string, unknown>), tourId: created.id } as Prisma.LandTourDetailUncheckedCreateInput,
        });
        await this.validateChildLinks(tx, dto);
        await this.replaceChildren(tx, created.id, dto, true);
        await this.logLandTourAction(tx, created.id, 'CREATE_LANDTOUR', user, {
          systemCode: dto.systemCode,
          tourCode: dto.tourCode,
          workflowStep: dto.workflowStep || this.tourConfig().defaultWorkflowStep,
        });
        return created;
      });
      return this.detail(tour.id, user);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Mã hệ thống LandTour đã tồn tại');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateLandTourDto, user?: RequestUser) {
    await this.detail(id, user);
    dto = this.prepareLandTourDto(applyWriteDataScope(dto as UpdateLandTourDto & { branch?: string | null; department?: string | null }, user), false);
    try {
      await this.prisma.$transaction(async (tx) => {
        await this.ensureCodeUniqueness(tx, dto, id);
        await this.tourCore.updateRoot(tx, id, this.toTourRootDto(dto), this.tourConfig(), user);
        await tx.landTourDetail.upsert({
          where: { tourId: id },
          create: { ...(this.toLandDetailData(dto) as Record<string, unknown>), tourId: id } as Prisma.LandTourDetailUncheckedCreateInput,
          update: this.toLandDetailData(dto) as Prisma.LandTourDetailUncheckedUpdateInput,
        });
        await this.validateChildLinks(tx, dto);
        await this.replaceChildren(tx, id, dto);
        await this.logLandTourAction(tx, id, 'UPDATE_LANDTOUR', user, { changedFields: Object.keys(dto as Row).sort() });
      });
      return this.detail(id, user);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Mã hệ thống LandTour đã tồn tại');
      }
      throw error;
    }
  }

  async remove(id: string, user?: RequestUser) {
    await this.detail(id, user);
    return this.prisma.$transaction(async (tx) => {
      await this.ensureRemovable(tx, id, user);
      return this.tourCore.softDelete(tx, id, user?.username || user?.email || user?.id || 'system');
    });
  }

  private async ensureCodeUniqueness(tx: Prisma.TransactionClient, dto: UpdateLandTourDto, currentTourId?: string) {
    const systemCode = this.optionalText(dto.systemCode);
    if (systemCode) {
      const duplicate = await tx.tour.findFirst({ where: { systemCode, ...(currentTourId ? { id: { not: currentTourId } } : {}) }, select: { id: true } });
      if (duplicate) throw new ConflictException('Mã hệ thống LandTour đã tồn tại');
    }
    const tourCode = this.optionalText(dto.tourCode);
    if (tourCode) {
      const duplicate = await tx.tour.findFirst({
        where: { type: TourType.LANDTOUR, tourCode, deletedAt: null, ...(currentTourId ? { id: { not: currentTourId } } : {}) },
        select: { id: true },
      });
      if (duplicate) throw new ConflictException('Mã tour LandTour đã tồn tại');
    }
  }

  private async ensureRemovable(tx: Prisma.TransactionClient, tourId: string, user?: RequestUser) {
    const tour = await tx.tour.findFirst({
      where: this.tourCore.scopeWhere({ id: tourId, type: TourType.LANDTOUR }, user),
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
    if (!tour) throw new NotFoundException('Không tìm thấy LandTour');
    const hasExternalDependency = Boolean(tour.orderId) || Object.values(tour._count).some((count) => count > 0);
    if (hasExternalDependency) {
      throw new BadRequestException('Không thể xóa LandTour đã phát sinh đơn hàng, booking, điều hành hoặc chứng từ tài chính');
    }
  }

  async copyServices(targetTourId: string, sourceTourId?: string, user?: RequestUser) {
    await this.detail(targetTourId, user);
    const sourceId = this.optionalText(sourceTourId);
    if (!sourceId) throw new BadRequestException('Hãy chọn tour nguồn để sao chép dịch vụ LandTour');
    if (sourceId === targetTourId) throw new BadRequestException('Tour nguồn sao chép dịch vụ LandTour phải khác tour đích');
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
    if (creating || dto.termsVi !== undefined || dto.termsEn !== undefined) {
      const currentTerms = creating ? [] : await tx.tourTerm.findMany({ where: { tourId, termType: 'LANDTOUR' } });
      children.terms = this.mapTerms(dto, currentTerms);
    }
    await this.tourCore.replaceCommonChildren(tx, tourId, children);
  }

  private mapTourCustomers(dto: UpdateLandTourDto): Prisma.TourCustomerCreateManyInput[] {
    const customerName = this.optionalText(dto.customerName);
    if (!customerName) return [];
    return [{ tourId: '', customerType: 'CUSTOMER', name: customerName, isPrimary: true, notes: this.optionalText(dto.notes) }];
  }

  private mapTourServices(dto: UpdateLandTourDto): Prisma.TourServiceCreateManyInput[] {
    return [...this.mapSalesServices(dto.salesServices), ...this.mapOperationServices(dto.operationServices)];
  }

  private mapSalesServices(rows?: unknown[]): Prisma.TourServiceCreateManyInput[] {
    const inputRows = this.rows(rows);
    return this.tourCore.mapSalesServices(inputRows).map((service, index) => this.withServiceStatus(service, inputRows[index]));
  }

  private mapOperationServices(rows?: unknown[]): Prisma.TourServiceCreateManyInput[] {
    const inputRows = this.rows(rows);
    return this.tourCore.mapOperationServices(inputRows).map((service, index) => this.withServiceStatus(service, inputRows[index]));
  }

  private withServiceStatus(service: Prisma.TourServiceCreateManyInput, row: Row): Prisma.TourServiceCreateManyInput {
    const confirmationStatus = this.toServiceStatus(row.confirmationStatus ?? row.status);
    return confirmationStatus ? { ...service, confirmationStatus } : service;
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

  private prepareLandTourDto<T extends UpdateLandTourDto>(dto: T, creating: boolean): T {
    const normalized = { ...(dto as unknown as Row) };
    if (creating) {
      normalized.systemCode = this.requiredText(normalized.systemCode, 'Mã hệ thống LandTour').toUpperCase();
      normalized.tourCode = this.requiredText(normalized.tourCode, 'Mã tour LandTour').toUpperCase();
      normalized.name = this.requiredText(normalized.name, 'Tên LandTour');
    } else {
      if (normalized.systemCode !== undefined) normalized.systemCode = this.requiredText(normalized.systemCode, 'Mã hệ thống LandTour').toUpperCase();
      if (normalized.tourCode !== undefined) normalized.tourCode = this.requiredText(normalized.tourCode, 'Mã tour LandTour').toUpperCase();
      if (normalized.name !== undefined) normalized.name = this.requiredText(normalized.name, 'Tên LandTour');
    }
    if (normalized.status !== undefined) normalized.status = this.toTourStatus(normalized.status as string | TourStatus | null);
    if (normalized.paymentStatus !== undefined) normalized.paymentStatus = this.toPaymentStatus(normalized.paymentStatus);
    if (normalized.workflowStep !== undefined) normalized.workflowStep = this.toLandTourWorkflowStep(normalized.workflowStep);
    return normalized as unknown as T;
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
    const guideName = this.optionalText(dto.guideName);
    if (!guides.length && guideName) {
      guides.push({ tourId: '', name: guideName, guideType: 'LANDTOUR' });
    }
    return guides;
  }

  private mapTerms(dto: UpdateLandTourDto, currentTerms: Array<{ language?: string | null; content?: string | null }> = []): Prisma.TourTermCreateManyInput[] {
    const currentByLanguage = new Map(currentTerms.map((term) => [this.text(term.language).toUpperCase(), this.optionalText(term.content)]));
    const vi = dto.termsVi !== undefined ? this.optionalText(dto.termsVi) : currentByLanguage.get('VI');
    const en = dto.termsEn !== undefined ? this.optionalText(dto.termsEn) : currentByLanguage.get('EN');
    const terms: Prisma.TourTermCreateManyInput[] = [];
    if (vi) terms.push({ tourId: '', language: 'VI', termType: 'LANDTOUR', content: vi });
    if (en) terms.push({ tourId: '', language: 'EN', termType: 'LANDTOUR', content: en });
    return terms;
  }

  private async validateChildLinks(tx: Prisma.TransactionClient, dto: UpdateLandTourDto) {
    const supplierIds = new Set<string>();
    const supplierServiceIds = new Map<string, string | null>();
    for (const row of [...this.rows(dto.salesServices), ...this.rows(dto.operationServices), ...this.rows(dto.costs)]) {
      const supplierId = this.optionalText(row.supplierId);
      const supplierServiceId = this.optionalText(row.supplierServiceId ?? row.serviceId);
      if (supplierId) supplierIds.add(supplierId);
      if (supplierServiceId) supplierServiceIds.set(supplierServiceId, supplierId);
    }
    if (supplierIds.size) {
      const foundSuppliers = await tx.supplier.findMany({ where: { id: { in: Array.from(supplierIds) }, deletedAt: null }, select: { id: true } });
      const found = new Set(foundSuppliers.map((supplier) => supplier.id));
      const missing = Array.from(supplierIds).find((id) => !found.has(id));
      if (missing) throw new BadRequestException('Nhà cung cấp trong dịch vụ LandTour không hợp lệ hoặc đã bị xóa');
    }
    if (supplierServiceIds.size) {
      const foundServices = await tx.supplierService.findMany({
        where: { id: { in: Array.from(supplierServiceIds.keys()) }, deletedAt: null },
        select: { id: true, supplierId: true },
      });
      const found = new Map(foundServices.map((service) => [service.id, service.supplierId]));
      for (const [serviceId, supplierId] of supplierServiceIds) {
        const actualSupplierId = found.get(serviceId);
        if (!actualSupplierId) throw new BadRequestException('Dịch vụ nhà cung cấp trong LandTour không hợp lệ hoặc đã bị xóa');
        if (supplierId && actualSupplierId !== supplierId) throw new BadRequestException('Dịch vụ nhà cung cấp không thuộc nhà cung cấp đã chọn');
      }
    }
  }

  private rows(rows?: unknown[]): Row[] {
    return (rows || []).filter((row): row is Row => Boolean(row) && typeof row === 'object' && !Array.isArray(row));
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

  private toPaymentStatus(status: unknown) {
    const value = this.text(status);
    if (!value) return undefined;
    const normalized = value.toUpperCase();
    if (Object.values(PaymentStatus).includes(normalized as PaymentStatus)) return normalized as PaymentStatus;
    throw new BadRequestException('Trạng thái thanh toán LandTour không hợp lệ');
  }

  private toServiceStatus(status: unknown) {
    const value = this.text(status);
    if (!value) return undefined;
    const normalized = value.toUpperCase();
    if (Object.values(TourServiceStatus).includes(normalized as TourServiceStatus)) return normalized as TourServiceStatus;
    throw new BadRequestException('Trạng thái dịch vụ LandTour không hợp lệ');
  }

  private toLandTourWorkflowStep(step: unknown) {
    const value = this.text(step).toUpperCase();
    if (!value) return undefined;
    if (LANDTOUR_WORKFLOW_STEPS.has(value)) return value;
    throw new BadRequestException('Bước workflow LandTour không hợp lệ');
  }

  private requiredText(value: unknown, label: string) {
    const text = this.optionalText(value);
    if (!text) throw new BadRequestException(`${label} là bắt buộc`);
    return text;
  }

  private number(value: unknown, label = 'Giá trị số LandTour') {
    const parsed = Number(value ?? 0);
    if (!Number.isFinite(parsed)) throw new BadRequestException(`${label} phải là số hợp lệ`);
    return parsed;
  }
}

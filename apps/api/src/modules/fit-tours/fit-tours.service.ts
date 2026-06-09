import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { FitServiceStatus, FitTourWorkflowStatus, Prisma, TourServiceStatus, TourStatus, TourType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { applyWriteDataScope, branchDepartmentScopeWhere, hasUnrestrictedDataScope, RequestUser } from '../auth/data-scope';
import { containsSearch, normalizeListSearch } from '../list-search';
import { TourCoreService } from '../tours/tour-core.service';
import { CreateFitTourDto } from './dto/create-fit-tour.dto';
import { UpdateFitTourDto } from './dto/update-fit-tour.dto';
import { FitTourLegacyCompatService } from './fit-tour-legacy-compat.service';

type Row = Record<string, unknown>;

const fitTourInclude = {
  tour: { include: { order: true, customers: { include: { crmCustomer: true } } } },
  customer: true,
  order: true,
  commonCosts: { orderBy: { orderNo: 'asc' } },
  hotelCosts: { orderBy: { orderNo: 'asc' } },
  privateCosts: { orderBy: { orderNo: 'asc' } },
  budgetServices: { include: { supplier: true }, orderBy: { serviceType: 'asc' } },
  operationServices: { include: { supplier: true, supplierService: true }, orderBy: { serviceType: 'asc' } },
  guides: { orderBy: { name: 'asc' } },
  handoverItems: { orderBy: { orderNo: 'asc' } },
  surveyQuestions: { orderBy: { orderNo: 'asc' } },
  attachments: { orderBy: { createdAt: 'desc' } },
} satisfies Prisma.FitTourInclude;

const fitTourListSelect = {
  id: true,
  tourId: true,
  quoteCode: true,
  tourCode: true,
  tourName: true,
  customerName: true,
  phone: true,
  startDate: true,
  endDate: true,
  adultCount: true,
  childCount: true,
  infantCount: true,
  sellingPrice: true,
  commissionPerGuest: true,
  workflowStatus: true,
  updatedAt: true,
  tour: {
    select: {
      systemCode: true,
      tourCode: true,
      name: true,
      startDate: true,
      endDate: true,
      updatedAt: true,
      customers: {
        where: { isPrimary: true },
        take: 1,
        select: { name: true, phone: true },
      },
    },
  },
  _count: {
    select: {
      commonCosts: true,
      hotelCosts: true,
      privateCosts: true,
      budgetServices: true,
      operationServices: true,
    },
  },
} satisfies Prisma.FitTourSelect;

const workflowOrder = [
  FitTourWorkflowStatus.DRAFT,
  FitTourWorkflowStatus.PRICING,
  FitTourWorkflowStatus.TOUR_INFO,
  FitTourWorkflowStatus.BUDGET,
  FitTourWorkflowStatus.OPERATION,
  FitTourWorkflowStatus.HANDOVER,
  FitTourWorkflowStatus.SURVEY,
  FitTourWorkflowStatus.COMPLETED,
] as const;
const terminalWorkflowStatuses = new Set<FitTourWorkflowStatus>([FitTourWorkflowStatus.COMPLETED, FitTourWorkflowStatus.CANCELLED]);

const defaultHandoverItems = ['Rooming list', 'V my bay', 'Bo him du lch', 'Chng trnh tour', 'Final confirmation'];
const defaultSurveyQuestions = [
  'Cht lng chng trnh tour',
  'Phng tin vn chuyn',
  'Cht lng  n',
  'Thi  nhn vin t vn',
  'Cht lng khch sn',
  'Hng dn vin',
  'Cng tc t chc',
  'Mc  hi lng chung',
];

@Injectable()
export class FitToursService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tourCore: TourCoreService,
    private readonly legacyCompat: FitTourLegacyCompatService,
  ) {}

  async list(search?: string, status?: string, user?: RequestUser) {
    const workflowStatus = this.toWorkflowStatus(status);
    const searchText = normalizeListSearch(search);
    const contains = searchText ? containsSearch(searchText) : undefined;
    const where: Prisma.FitTourWhereInput = {
      ...(workflowStatus ? { workflowStatus } : {}),
      ...(contains
        ? {
            OR: [
              { quoteCode: contains },
              { tourCode: contains },
              { tourName: contains },
              { customerName: contains },
              { phone: contains },
              { tour: { is: { systemCode: contains } } },
              { tour: { is: { tourCode: contains } } },
              { tour: { is: { name: contains } } },
              { tour: { is: { customers: { some: { name: contains } } } } },
              { tour: { is: { customers: { some: { phone: contains } } } } },
            ],
          }
        : {}),
    };

    const rows = await this.prisma.fitTour.findMany({
      where: this.fitTourScopeWhere(where, user),
      select: fitTourListSelect,
      orderBy: [{ updatedAt: 'desc' }, { quoteCode: 'asc' }],
    });
    return rows.map((row) => {
      const snapshot = this.withTourRootSnapshot(row) as Row;
      const { tour: _tour, ...listRow } = snapshot;
      return listRow;
    });
  }

  async detail(id: string, user?: RequestUser) {
    const fitTour = await this.prisma.fitTour.findFirst({ where: this.fitTourScopeWhere({ id }, user), include: fitTourInclude });
    if (!fitTour) throw new NotFoundException('Không tìm thấy tour FIT');
    return this.withTourRootSnapshot(fitTour);
  }

  async create(dto: CreateFitTourDto, user?: RequestUser) {
    const scopedDto = applyWriteDataScope(dto as CreateFitTourDto & { branch?: string | null; department?: string | null }, user) as CreateFitTourDto;
    try {
      const created = await this.prisma.$transaction((tx) => this.createFitTourAggregate(tx, scopedDto, user));
      return this.detail(created.id, user);
    } catch (error) {
      this.rethrowFitUniqueConflict(error);
      throw error;
    }
  }

  async update(id: string, dto: UpdateFitTourDto, user?: RequestUser) {
    const current = await this.detail(id, user);
    const scopedDto = applyWriteDataScope(dto as UpdateFitTourDto & { branch?: string | null; department?: string | null }, user) as UpdateFitTourDto;
    try {
      await this.prisma.$transaction((tx) => this.updateFitTourAggregate(tx, id, current, scopedDto, user));
      return this.detail(id, user);
    } catch (error) {
      this.rethrowFitUniqueConflict(error);
      throw error;
    }
  }

  async remove(id: string, user?: RequestUser) {
    const fitTour = await this.detail(id, user);
    return this.prisma.$transaction((tx) => this.removeFitTourAggregate(tx, id, fitTour, user));
  }

  async copyBudget(targetTourId: string, sourceTourId?: string, user?: RequestUser) {
    const targetId = this.requiredText(targetTourId, 'Cần chọn tour đích');
    const sourceId = this.optionalText(sourceTourId) || targetId;
    const source = await this.detail(sourceId, user);
    const target = await this.detail(targetId, user);
    const budgetRows = this.legacyCompat.toCopiedBudgetRows(source.budgetServices.length > 0 ? source.budgetServices : this.pricingRowsToBudget(source));

    await this.prisma.$transaction((tx) => this.copyFitBudgetAggregate(tx, source, target, budgetRows, user));
    return this.detail(targetId, user);
  }

  async copyOperation(targetTourId: string, sourceTourId?: string, user?: RequestUser) {
    const targetId = this.requiredText(targetTourId, 'Cần chọn tour đích');
    const sourceId = this.optionalText(sourceTourId) || targetId;
    const source = await this.detail(sourceId, user);
    const target = await this.detail(targetId, user);
    const rows = this.legacyCompat.toCopiedOperationRows(source.operationServices.length > 0 ? source.operationServices : source.budgetServices);

    await this.prisma.$transaction((tx) => this.copyFitOperationAggregate(tx, source, target, rows, user));
    return this.detail(targetId, user);
  }

  private async createFitTourAggregate(tx: Prisma.TransactionClient, dto: CreateFitTourDto, user?: RequestUser) {
    const fitDto = await this.prepareCreateFitDto(tx, dto, user);
    const tour = await this.createTourRootFromFit(tx, fitDto);
    await this.syncTourCoreFromFit(tx, tour.id, fitDto);
    const fitTour = await this.createLegacyFitDetail(tx, tour.id, fitDto);
    await this.logFitTourAction(tx, tour.id, 'CREATE_FIT_TOUR', user, { fitTourId: fitTour.id });
    return fitTour;
  }

  private async updateFitTourAggregate(
    tx: Prisma.TransactionClient,
    id: string,
    current: Awaited<ReturnType<FitToursService['detail']>>,
    dto: UpdateFitTourDto,
    user?: RequestUser,
  ) {
    const { patch, merged } = await this.prepareUpdateFitDto(tx, current, dto, user);
    const tourId = await this.syncTourRootFromFit(tx, current, merged);
    await this.syncTourCoreFromFit(tx, tourId, merged);
    await this.updateLegacyFitDetail(tx, id, current, patch, tourId);
    await this.legacyCompat.syncChildren(tx, id, patch);
    await this.logFitTourAction(tx, tourId, 'UPDATE_FIT_TOUR', user, { fitTourId: id });
  }

  private async removeFitTourAggregate(
    tx: Prisma.TransactionClient,
    id: string,
    fitTour: Awaited<ReturnType<FitToursService['detail']>>,
    user?: RequestUser,
  ) {
    if (fitTour.tourId) await this.tourCore.softDelete(tx, fitTour.tourId, this.actor(user));
    return tx.fitTour.update({ where: { id }, data: { workflowStatus: FitTourWorkflowStatus.CANCELLED } });
  }

  private async copyFitBudgetAggregate(
    tx: Prisma.TransactionClient,
    source: Awaited<ReturnType<FitToursService['detail']>>,
    target: Awaited<ReturnType<FitToursService['detail']>>,
    budgetRows: ReturnType<FitTourLegacyCompatService['toCopiedBudgetRows']>,
    user?: RequestUser,
  ) {
    const targetRootId = this.requiredTourRootId(target);
    await this.syncTourCoreFromFit(tx, targetRootId, { ...target, budgetServices: budgetRows } as unknown as UpdateFitTourDto);
    await this.legacyCompat.replaceBudgetServices(tx, target.id, budgetRows);
    await this.logFitTourAction(tx, targetRootId, 'COPY_FIT_BUDGET', user, { sourceFitTourId: source.id, targetFitTourId: target.id });
  }

  private async copyFitOperationAggregate(
    tx: Prisma.TransactionClient,
    source: Awaited<ReturnType<FitToursService['detail']>>,
    target: Awaited<ReturnType<FitToursService['detail']>>,
    rows: ReturnType<FitTourLegacyCompatService['toCopiedOperationRows']>,
    user?: RequestUser,
  ) {
    const targetRootId = this.requiredTourRootId(target);
    await this.syncTourCoreFromFit(tx, targetRootId, { ...target, operationServices: rows } as unknown as UpdateFitTourDto);
    await this.legacyCompat.replaceOperationServices(tx, target.id, rows);
    await this.logFitTourAction(tx, targetRootId, 'COPY_FIT_OPERATION', user, { sourceFitTourId: source.id, targetFitTourId: target.id });
  }

  private async prepareCreateFitDto(tx: Prisma.TransactionClient, dto: CreateFitTourDto, user?: RequestUser) {
    const fitDto = await this.withCustomerSnapshot(tx, dto);
    await this.tourCore.ensureOrder(tx, fitDto.orderId, user);
    this.validateProvidedFields(fitDto, true);
    this.validateFitTourBusinessRules(fitDto, true);
    this.validateWorkflowTransition(undefined, fitDto.workflowStatus, true);
    return fitDto;
  }

  private async prepareUpdateFitDto(
    tx: Prisma.TransactionClient,
    current: Awaited<ReturnType<FitToursService['detail']>>,
    dto: UpdateFitTourDto,
    user?: RequestUser,
  ) {
    const patch = await this.withCustomerSnapshot(tx, dto);
    await this.tourCore.ensureOrder(tx, patch.orderId, user);
    const merged = { ...current, ...patch } as unknown as UpdateFitTourDto;
    this.validateProvidedFields(patch, false);
    this.validateFitTourBusinessRules(merged, false);
    this.validateWorkflowTransition(current.workflowStatus, patch.workflowStatus, false);
    return { patch, merged };
  }

  private createTourRootFromFit(tx: Prisma.TransactionClient, dto: UpdateFitTourDto) {
    return tx.tour.create({ data: this.toTourCoreData(dto, true) as Prisma.TourUncheckedCreateInput });
  }

  private createLegacyFitDetail(tx: Prisma.TransactionClient, tourId: string, dto: UpdateFitTourDto) {
    return tx.fitTour.create({
      data: {
        ...this.toFitTourData(dto, true),
        tour: { connect: { id: tourId } },
        ...(dto.customerId ? { customer: { connect: { id: dto.customerId } } } : {}),
        ...(dto.orderId ? { order: { connect: { id: dto.orderId } } } : {}),
        ...this.legacyCompat.toChildCreateData(dto),
      } as Prisma.FitTourCreateInput,
    });
  }

  private updateLegacyFitDetail(
    tx: Prisma.TransactionClient,
    id: string,
    current: Pick<Awaited<ReturnType<FitToursService['detail']>>, 'tourId'>,
    patch: UpdateFitTourDto,
    tourId: string,
  ) {
    return tx.fitTour.update({
      where: { id },
      data: {
        ...this.toFitTourData(patch, false),
        ...(current.tourId ? {} : { tour: { connect: { id: tourId } } }),
        ...(patch.customerId !== undefined ? (patch.customerId ? { customer: { connect: { id: patch.customerId } } } : { customer: { disconnect: true } }) : {}),
        ...(patch.orderId !== undefined ? (patch.orderId ? { order: { connect: { id: patch.orderId } } } : { order: { disconnect: true } }) : {}),
      } as Prisma.FitTourUpdateInput,
    });
  }

  private async logFitTourAction(tx: Prisma.TransactionClient, tourId: string, action: string, user: RequestUser | undefined, metadata: Row) {
    await this.tourCore.log(tx, tourId, action, { actor: this.actor(user), ...metadata });
  }

  private actor(user?: RequestUser) {
    return user?.username || user?.email || user?.id || 'system';
  }

  private rethrowFitUniqueConflict(error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('Mã báo giá FIT đã tồn tại');
    }
  }

  private validateProvidedFields(dto: UpdateFitTourDto, creating: boolean) {
    this.validateTextLength(dto.quoteCode, 'quoteCode', 'M bo gi', 2, creating);
    this.validateTextLength(dto.tourCode, 'tourCode', 'M tour', 2, creating);
    this.validateTextLength(dto.customerName, 'customerName', 'H tn khch', 2, creating);
  }

  private validateFitTourBusinessRules(dto: UpdateFitTourDto, creating: boolean) {
    const adultCount = this.nonNegativeInteger(dto.adultCount ?? (creating ? 1 : 0), 'adultCount');
    const childCount = this.nonNegativeInteger(dto.childCount, 'childCount');
    const infantCount = this.nonNegativeInteger(dto.infantCount, 'infantCount');
    if (adultCount + childCount + infantCount < 1) {
      throw new BadRequestException('S khch phi ln hn 0');
    }

    for (const field of [
      'sellingPrice',
      'commissionPerGuest',
      'exchangeRate',
      'seatCount',
      'tourPrice',
      'discount',
      'adultPrice',
      'childPrice25',
      'childPrice611',
      'infantPrice',
      'surcharge',
    ]) {
      if ((dto as Record<string, unknown>)[field] !== undefined) this.nonNegativeNumber((dto as Record<string, unknown>)[field], field);
    }

    const startDate = this.optionalDate(dto.startDate, 'startDate');
    const endDate = this.optionalDate(dto.endDate, 'endDate');
    if (startDate && endDate && startDate > endDate) {
      throw new BadRequestException('Ngy v phi sau hoc bng ngy khi i');
    }

    if (dto.bookingDate !== undefined) this.optionalDate(dto.bookingDate, 'bookingDate');
    for (const field of ['visaDeadline', 'holdUntil', 'confirmedAt', 'closeAt']) {
      if ((dto as Record<string, unknown>)[field] !== undefined) this.optionalDate((dto as Record<string, unknown>)[field], field);
    }

    if (dto.workflowStatus !== undefined) this.toWorkflowStatusStrict(dto.workflowStatus);
  }

  private validateWorkflowTransition(currentStatus: FitTourWorkflowStatus | null | undefined, nextStatus: FitTourWorkflowStatus | undefined, creating: boolean) {
    const next = this.toWorkflowStatusStrict(nextStatus) || FitTourWorkflowStatus.DRAFT;
    if (creating) {
      if (next !== FitTourWorkflowStatus.DRAFT && next !== FitTourWorkflowStatus.PRICING) {
        throw new BadRequestException('Tour FIT mi ch c to  trng thi Nhp hoc Tnh gi');
      }
      return;
    }

    if (nextStatus === undefined) return;
    const current = currentStatus || FitTourWorkflowStatus.DRAFT;
    if (terminalWorkflowStatuses.has(current) && next !== current) {
      throw new BadRequestException('Khng th i trng thi ca tour FIT   trng thi cui');
    }
    if (next === FitTourWorkflowStatus.CANCELLED) return;
    if (next === FitTourWorkflowStatus.COMPLETED && current !== FitTourWorkflowStatus.SURVEY && current !== FitTourWorkflowStatus.COMPLETED) {
      throw new BadRequestException('Ch c hon tt tour FIT sau bc Phiu nh gi dch v');
    }

    const currentIndex = workflowOrder.indexOf(current as (typeof workflowOrder)[number]);
    const nextIndex = workflowOrder.indexOf(next as (typeof workflowOrder)[number]);
    if (currentIndex >= 0 && nextIndex >= 0 && nextIndex > currentIndex + 1) {
      throw new BadRequestException('Khng c chuyn workflow FIT vt qu bc k tip');
    }
  }

  private validateTextLength(dtoValue: unknown, field: string, label: string, minLength: number, required: boolean) {
    if (dtoValue === undefined && !required) return;
    const text = this.requiredText(dtoValue, field);
    if (text.length < minLength) throw new BadRequestException(`${label} cn t nht ${minLength} k t`);
  }

  private fitTourScopeWhere(where: Prisma.FitTourWhereInput, user?: RequestUser): Prisma.FitTourWhereInput {
    if (!user || hasUnrestrictedDataScope(user)) return { AND: [where, { tour: { is: { deletedAt: null } } }] };
    const scopedTour = branchDepartmentScopeWhere<Prisma.TourWhereInput>({ deletedAt: null }, user);
    return { AND: [where, { tour: { is: scopedTour } }] };
  }

  private withTourRootSnapshot<T extends Row>(fitTour: T): T {
    const tour = fitTour.tour as Row | null | undefined;
    if (!tour) return fitTour;
    const customers = Array.isArray(tour.customers) ? (tour.customers as Row[]) : [];
    const primaryCustomer = customers.find((customer) => customer.isPrimary === true) || customers[0];
    return {
      ...fitTour,
      quoteCode: tour.systemCode ?? fitTour.quoteCode,
      tourCode: tour.tourCode ?? fitTour.tourCode,
      tourName: tour.name ?? fitTour.tourName,
      marketGroup: tour.marketGroup ?? fitTour.marketGroup,
      bookingDate: tour.bookingDate ?? fitTour.bookingDate,
      startDate: tour.startDate ?? fitTour.startDate,
      endDate: tour.endDate ?? fitTour.endDate,
      flightRoute: tour.flightRoute ?? fitTour.flightRoute,
      exchangeRateCode: tour.exchangeRateCode ?? fitTour.exchangeRateCode,
      exchangeRate: tour.exchangeRate ?? fitTour.exchangeRate,
      operatorOwner: tour.operatorOwner ?? fitTour.operatorOwner,
      pickupPoint: tour.pickupPoint ?? fitTour.pickupPoint,
      dropoffPoint: tour.dropoffPoint ?? fitTour.dropoffPoint,
      notes: tour.notes ?? fitTour.notes,
      updatedAt: tour.updatedAt ?? fitTour.updatedAt,
      customerName: primaryCustomer?.name ?? fitTour.customerName,
      phone: primaryCustomer?.phone ?? fitTour.phone,
      email: primaryCustomer?.email ?? fitTour.email,
    };
  }

  private async withCustomerSnapshot(tx: Prisma.TransactionClient, dto: UpdateFitTourDto) {
    const customerId = this.optionalText(dto.customerId);
    if (!customerId) return dto;
    const customer = await tx.customer.findUnique({ where: { id: customerId }, select: { fullName: true, phone: true, email: true } });
    if (!customer) throw new NotFoundException('Không tìm thấy khách hàng');
    return {
      ...dto,
      customerId,
      customerName: dto.customerName ?? customer.fullName,
      phone: dto.phone ?? customer.phone,
      email: dto.email ?? customer.email ?? undefined,
    };
  }

  private async ensureOrder(tx: Prisma.TransactionClient, orderId?: string) {
    const id = this.optionalText(orderId);
    if (!id) return;
    const order = await tx.order.findUnique({ where: { id }, select: { id: true } });
    if (!order) throw new NotFoundException('Khng tm thy n hng');
  }

  private async syncTourRootFromFit(
    tx: Prisma.TransactionClient,
    current: Pick<Awaited<ReturnType<FitToursService['detail']>>, 'tourId'>,
    dto: UpdateFitTourDto,
  ) {
    if (!current.tourId) {
      const tour = await tx.tour.create({ data: this.toTourCoreData(dto, true) as Prisma.TourUncheckedCreateInput });
      return tour.id;
    }
    await tx.tour.update({ where: { id: current.tourId }, data: this.toTourCoreData(dto, false) as Prisma.TourUncheckedUpdateInput });
    return current.tourId;
  }

  private requiredTourRootId(fitTour: Pick<Awaited<ReturnType<FitToursService['detail']>>, 'tourId'>) {
    if (!fitTour.tourId) throw new BadRequestException('Tour FIT chua lien ket Tour chung');
    return fitTour.tourId;
  }

  private async syncTourCoreFromFit(tx: Prisma.TransactionClient, tourId: string, dto: UpdateFitTourDto) {
    await this.tourCore.replaceCustomers(tx, tourId, [this.mapTourCustomer(dto)]);
    await this.tourCore.replaceGuides(tx, tourId, this.tourCore.mapGuides(dto.guides));
    await this.tourCore.replaceAttachments(tx, tourId, this.tourCore.mapAttachments(dto.attachments));
    await this.tourCore.replaceSurveys(tx, tourId, this.tourCore.mapSurveys(dto.surveyQuestions, defaultSurveyQuestions));
    await this.tourCore.replaceRevenues(tx, tourId, this.mapTourRevenues(dto));
    await this.tourCore.replaceCosts(tx, tourId, this.mapTourCosts(dto));
    const services = this.mapTourServices(dto).map((row) => ({ ...row, tourId: '' }));
    await this.tourCore.replaceServices(tx, tourId, services);
    await this.tourCore.replaceSuppliers(tx, tourId, this.tourCore.suppliersFromServices(services, 'FIT_SERVICE'));
  }

  private toTourCoreData(dto: UpdateFitTourDto, creating: boolean): Prisma.TourUncheckedCreateInput | Prisma.TourUncheckedUpdateInput {
    return this.tourCore.toTourData(dto as unknown as Record<string, unknown>, creating, {
      type: TourType.FIT,
      systemCodeField: 'quoteCode',
      tourCodeField: 'tourCode',
      nameField: 'tourName',
      productTypeField: 'tourType',
      workflowField: 'workflowStatus',
      defaultWorkflowStep: FitTourWorkflowStatus.DRAFT,
      statusFromWorkflow: (workflowStep) => this.toTourStatus(workflowStep),
      allowStatusInput: false,
      allowWorkflowStepInput: false,
    });
  }

  private mapTourCustomer(dto: UpdateFitTourDto): Prisma.TourCustomerCreateManyInput {
    return {
      tourId: '',
      crmCustomerId: this.optionalText(dto.customerId),
      customerType: 'CUSTOMER',
      name: this.requiredText(dto.customerName, 'Can nhap ten khach hang'),
      phone: this.optionalText(dto.phone),
      email: this.optionalText(dto.email),
      isPrimary: true,
      notes: this.optionalText(dto.notes),
    };
  }

  private mapTourRevenues(dto: UpdateFitTourDto): Prisma.TourRevenueCreateManyInput[] {
    if (dto.revenues !== undefined) return this.tourCore.mapRevenues(dto.revenues);
    const amount = this.number(dto.sellingPrice || dto.tourPrice);
    if (amount <= 0) return [];
    return [
      {
        tourId: '',
        description: this.optionalText(dto.tourName) || this.optionalText(dto.tourCode) || 'FIT revenue',
        quantity: 1,
        unitPrice: amount,
        currency: 'VND',
        exchangeRate: 1,
        vat: 0,
        amount,
        notes: this.optionalText(dto.notes),
      },
    ];
  }

  private mapTourCosts(dto: UpdateFitTourDto): Prisma.TourCostCreateManyInput[] {
    if (dto.costs !== undefined) return this.tourCore.mapCosts(dto.costs, 'FIT_COST');
    const mapRows = (
      rows: Array<{ serviceType: string; description: string | null; amount: number; currency: string; exchangeRate: number; vat: number; notes: string | null }>,
      costType: string,
    ) =>
      rows.map((row) => ({
        tourId: '',
        costType: row.serviceType || costType,
        description: row.description,
        expectedAmount: row.amount,
        actualAmount: row.amount,
        currency: row.currency || 'VND',
        exchangeRate: row.exchangeRate || 1,
        vat: row.vat,
        notes: row.notes,
      }));
    return [
      ...mapRows(this.mapCommonCosts(dto.commonCosts), 'FIT_COMMON_COST'),
      ...mapRows(this.mapHotelCosts(dto.hotelCosts), 'FIT_HOTEL_COST'),
      ...mapRows(this.mapPrivateCosts(dto.privateCosts), 'FIT_PRIVATE_COST'),
    ];
  }

  private mapTourServices(dto: UpdateFitTourDto): Array<Omit<Prisma.TourServiceCreateManyInput, 'tourId'>> {
    const budgetServices = this.mapBudgetServices(dto.budgetServices).map((row) => ({
      serviceType: row.serviceType,
      supplierId: row.supplierId,
      description: row.description,
      quantity: row.quantity,
      unit: null,
      currency: 'VND',
      exchangeRate: 1,
      budgetUnitPrice: row.unitPrice,
      vat: row.vat,
      budgetAmount: row.amount,
      confirmationStatus: TourServiceStatus.WAITING,
      notes: row.notes,
    }));

    const operationServices = this.mapOperationServices(dto.operationServices).map((row) => ({
      serviceType: row.serviceType,
      supplierId: row.supplierId,
      supplierServiceId: row.supplierServiceId,
      description: null,
      quantity: row.quantity,
      unit: null,
      currency: 'VND',
      exchangeRate: 1,
      confirmedUnitPrice: row.confirmedUnitPrice,
      vat: row.vat,
      confirmedAmount: row.amount,
      confirmationStatus: this.toTourServiceStatus(row.status),
      bookingCode: row.bookingCode,
      notes: row.notes,
    }));

    return [...budgetServices, ...operationServices];
  }

  private toFitTourData(dto: UpdateFitTourDto, creating: boolean): Prisma.FitTourUncheckedCreateInput | Prisma.FitTourUncheckedUpdateInput {
    return this.legacyCompat.toFitTourData(dto, creating);
  }

  private mapCommonCosts(rows?: unknown[]) {
    return this.legacyCompat.mapCommonCosts(rows);
  }

  private mapHotelCosts(rows?: unknown[]) {
    return this.legacyCompat.mapHotelCosts(rows);
  }

  private mapPrivateCosts(rows?: unknown[]) {
    return this.legacyCompat.mapPrivateCosts(rows);
  }

  private mapBudgetServices(rows?: unknown[]) {
    return this.legacyCompat.mapBudgetServices(rows);
  }

  private mapOperationServices(rows?: unknown[]) {
    return this.legacyCompat.mapOperationServices(rows);
  }

  private pricingRowsToBudget(source: Awaited<ReturnType<FitToursService['detail']>>) {
    return [...source.commonCosts, ...source.hotelCosts, ...source.privateCosts].map((row) => ({
      serviceType: row.serviceType,
      supplierId: null,
      description: row.description,
      quantity: 'quantity' in row ? row.quantity : row.paxPerRoom,
      unitPrice: row.unitPrice,
      vat: row.vat,
      amount: row.amount,
      notes: row.notes,
    }));
  }

  private rows(rows?: unknown[]): Row[] {
    return (rows || []).filter((row): row is Row => Boolean(row) && typeof row === 'object');
  }

  private text(value: unknown) {
    return String(value || '').trim();
  }

  private requiredText(value: unknown, field: string) {
    const text = this.text(value);
    if (!text) throw new BadRequestException(`${field} l? b?t bu?c`);
    return text;
  }

  private optionalText(value: unknown) {
    const text = this.text(value);
    return text ? text : null;
  }

  private optionalDate(value: unknown, field = 'date') {
    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) throw new BadRequestException(`${field} khng hp l`);
      return value;
    }
    const text = this.text(value);
    if (!text) return null;
    const date = new Date(text);
    if (Number.isNaN(date.getTime())) throw new BadRequestException(`${field} khng hp l`);
    return date;
  }

  private number(value: unknown) {
    const number = Number(value || 0);
    return Number.isFinite(number) ? number : 0;
  }

  private nonNegativeNumber(value: unknown, field: string) {
    const number = Number(value ?? 0);
    if (!Number.isFinite(number)) throw new BadRequestException(`${field} phi l s hp l`);
    if (number < 0) throw new BadRequestException(`${field} khng c m`);
    return number;
  }

  private nonNegativeInteger(value: unknown, field: string) {
    const number = this.nonNegativeNumber(value, field);
    if (!Number.isInteger(number)) throw new BadRequestException(`${field} phi l s nguyn`);
    return number;
  }

  private money(explicitAmount: unknown, subtotal: number, vat: number) {
    const amount = this.number(explicitAmount);
    return amount > 0 ? amount : subtotal * (1 + vat / 100);
  }

  private toWorkflowStatus(status?: string) {
    const value = this.text(status);
    if (!value) return undefined;
    const normalized = value.toUpperCase();
    if (Object.values(FitTourWorkflowStatus).includes(normalized as FitTourWorkflowStatus)) return normalized as FitTourWorkflowStatus;
    throw new BadRequestException('Trạng thái workflow FIT không hợp lệ');
  }

  private toWorkflowStatusStrict(status: unknown) {
    const value = this.text(status);
    if (!value) return undefined;
    if (Object.values(FitTourWorkflowStatus).includes(value as FitTourWorkflowStatus)) return value as FitTourWorkflowStatus;
    throw new BadRequestException('Trng thi workflow FIT khng hp l');
  }

  private toAttachmentStep(step: unknown) {
    const value = this.text(step);
    if (!value) return null;
    if (Object.values(FitTourWorkflowStatus).includes(value as FitTourWorkflowStatus)) return value;
    throw new BadRequestException('Bc workflow ca file nh km khng hp l');
  }

  private toServiceStatus(status: unknown) {
    const value = this.text(status);
    if (Object.values(FitServiceStatus).includes(value as FitServiceStatus)) return value as FitServiceStatus;
    return FitServiceStatus.WAITING;
  }

  private toTourServiceStatus(status: unknown) {
    const value = this.text(status);
    if (Object.values(TourServiceStatus).includes(value as TourServiceStatus)) return value as TourServiceStatus;
    return TourServiceStatus.WAITING;
  }

  private toTourStatus(workflowStep: unknown) {
    const value = this.text(workflowStep);
    if (value === FitTourWorkflowStatus.COMPLETED) return TourStatus.COMPLETED;
    if (value === FitTourWorkflowStatus.CANCELLED) return TourStatus.CANCELLED;
    if (value === FitTourWorkflowStatus.OPERATION || value === FitTourWorkflowStatus.HANDOVER || value === FitTourWorkflowStatus.SURVEY) return TourStatus.RUNNING;
    return TourStatus.UPCOMING;
  }

  private pickOptionalText(dto: Record<string, unknown>, fields: string[]) {
    return Object.fromEntries(fields.filter((field) => dto[field] !== undefined).map((field) => [field, this.optionalText(dto[field])]));
  }

  private pickOptionalNumbers(dto: Record<string, unknown>, fields: string[]) {
    return Object.fromEntries(fields.filter((field) => dto[field] !== undefined).map((field) => [field, this.number(dto[field])]));
  }

  private pickOptionalDates(dto: Record<string, unknown>, fields: string[]) {
    return Object.fromEntries(fields.filter((field) => dto[field] !== undefined).map((field) => [field, this.optionalDate(dto[field])]));
  }
}

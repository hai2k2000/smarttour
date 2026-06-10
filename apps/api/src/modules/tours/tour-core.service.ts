import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PaymentStatus, Prisma, TourStatus, TourType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { branchDepartmentScopeWhere, RequestUser } from '../auth/data-scope';

type AnyRecord = Record<string, unknown>;
type TourChildDelegate<T extends AnyRecord> = {
  deleteMany(args: { where: { tourId: string } }): Promise<unknown>;
  createMany(args: { data: T[] }): Promise<unknown>;
};

export type TourRootConfig = {
  type: TourType;
  systemCodeField?: string;
  tourCodeField?: string;
  nameField?: string;
  productTypeField?: string;
  routeField?: string;
  notesField?: string;
  workflowField?: string;
  defaultWorkflowStep?: string;
  defaultStatus?: TourStatus;
  defaultProductType?: string;
  statusFromWorkflow?: (workflowStep: string) => TourStatus;
  allowStatusInput?: boolean;
  allowWorkflowStepInput?: boolean;
};

export type TourCommonChildren = {
  customers?: Prisma.TourCustomerCreateManyInput[];
  suppliers?: Prisma.TourSupplierCreateManyInput[];
  services?: Prisma.TourServiceCreateManyInput[];
  serviceSupplierRole?: string;
  revenues?: Prisma.TourRevenueCreateManyInput[];
  costs?: Prisma.TourCostCreateManyInput[];
  guides?: Prisma.TourGuideCreateManyInput[];
  attachments?: Prisma.TourAttachmentCreateManyInput[];
  surveys?: Prisma.TourSurveyCreateManyInput[];
  terms?: Prisma.TourTermCreateManyInput[];
};

@Injectable()
export class TourCoreService {
  constructor(private readonly prisma: PrismaService) {}

  scopeWhere<T extends Prisma.TourWhereInput>(where: T, user?: RequestUser): Prisma.TourWhereInput {
    return branchDepartmentScopeWhere({ ...where, deletedAt: null }, user);
  }

  toTourData(dto: AnyRecord, creating: boolean, config: TourRootConfig): Prisma.TourUncheckedCreateInput | Prisma.TourUncheckedUpdateInput {
    const systemCodeField = config.systemCodeField || 'systemCode';
    const tourCodeField = config.tourCodeField || 'tourCode';
    const nameField = config.nameField || 'name';
    const productTypeField = config.productTypeField || 'productType';
    const routeField = config.routeField || 'route';
    const notesField = config.notesField || 'notes';
    const workflowField = config.workflowField || 'workflowStep';
    const workflowStep =
      this.pickText(dto, workflowField) ||
      (config.allowWorkflowStepInput === false ? undefined : this.pickText(dto, 'workflowStep')) ||
      (creating ? config.defaultWorkflowStep : undefined);
    const status = config.allowStatusInput === false ? undefined : (this.pickText(dto, 'status') as TourStatus | undefined);
    const statusFromWorkflow = workflowStep ? this.statusFromWorkflow(workflowStep, config) : undefined;

    return {
      ...(creating
        ? {
            type: config.type,
            systemCode: this.requiredText(dto[systemCodeField], 'systemCode').toUpperCase(),
            tourCode: this.requiredText(dto[tourCodeField], 'tourCode').toUpperCase(),
          }
        : {}),
      ...(dto.type !== undefined ? { type: config.type } : {}),
      ...(status ? { status } : statusFromWorkflow ? { status: statusFromWorkflow } : creating ? { status: config.defaultStatus || TourStatus.UPCOMING } : {}),
      ...(dto.paymentStatus !== undefined ? { paymentStatus: dto.paymentStatus as PaymentStatus } : creating ? { paymentStatus: PaymentStatus.UNPAID } : {}),
      ...(workflowStep !== undefined ? { workflowStep } : {}),
      ...(dto[systemCodeField] !== undefined ? { systemCode: this.requiredText(dto[systemCodeField], 'systemCode').toUpperCase() } : {}),
      ...(dto.orderId !== undefined ? { orderId: this.optionalText(dto.orderId) } : {}),
      ...(dto[tourCodeField] !== undefined ? { tourCode: this.requiredText(dto[tourCodeField], 'tourCode').toUpperCase() } : {}),
      ...(dto[nameField] !== undefined ? { name: this.optionalText(dto[nameField]) } : {}),
      ...(dto.marketGroup !== undefined ? { marketGroup: this.optionalText(dto.marketGroup) } : {}),
      ...(dto[productTypeField] !== undefined ? { productType: this.optionalText(dto[productTypeField]) } : creating && config.defaultProductType ? { productType: config.defaultProductType } : {}),
      ...(dto.bookingDate !== undefined ? { bookingDate: this.optionalDate(dto.bookingDate, 'bookingDate') } : {}),
      ...(dto.paymentDueDate !== undefined ? { paymentDueDate: this.optionalDate(dto.paymentDueDate, 'paymentDueDate') } : {}),
      ...(dto.startDate !== undefined ? { startDate: this.optionalDate(dto.startDate, 'startDate') } : {}),
      ...(dto.endDate !== undefined ? { endDate: this.optionalDate(dto.endDate, 'endDate') } : {}),
      ...(dto.createdBy !== undefined ? { createdBy: this.optionalText(dto.createdBy) } : {}),
      ...(dto.operatorOwner !== undefined ? { operatorOwner: this.optionalText(dto.operatorOwner) } : {}),
      ...(dto.branch !== undefined ? { branch: this.optionalText(dto.branch) } : {}),
      ...(dto.department !== undefined ? { department: this.optionalText(dto.department) } : {}),
      ...(dto.customerSource !== undefined ? { customerSource: this.optionalText(dto.customerSource) } : {}),
      ...(dto.exchangeRateCode !== undefined ? { exchangeRateCode: this.optionalText(dto.exchangeRateCode) } : {}),
      ...(dto.exchangeRate !== undefined ? { exchangeRate: this.number(dto.exchangeRate, 'exchangeRate') } : {}),
      ...(dto[routeField] !== undefined ? { route: this.optionalText(dto[routeField]) } : {}),
      ...(dto.flightRoute !== undefined ? { flightRoute: this.optionalText(dto.flightRoute) } : {}),
      ...(dto.pickupPoint !== undefined ? { pickupPoint: this.optionalText(dto.pickupPoint) } : {}),
      ...(dto.dropoffPoint !== undefined ? { dropoffPoint: this.optionalText(dto.dropoffPoint) } : {}),
      ...(dto[notesField] !== undefined ? { notes: this.optionalText(dto[notesField]) } : {}),
    };
  }

  async ensureOrder(tx: Prisma.TransactionClient, orderId?: unknown, user?: RequestUser) {
    const id = this.optionalText(orderId);
    if (!id) return;
    const row = await tx.order.findFirst({ where: branchDepartmentScopeWhere({ id, deletedAt: null }, user), select: { id: true } });
    if (!row) throw new NotFoundException('Không tìm thấy đơn hàng trong phạm vi dữ liệu');
  }

  async createRoot(tx: Prisma.TransactionClient, dto: AnyRecord, config: TourRootConfig, user?: RequestUser) {
    await this.ensureOrder(tx, dto.orderId, user);
    const data = this.toTourData(dto, true, config) as Prisma.TourUncheckedCreateInput;
    this.ensureDateRange((data as AnyRecord).startDate, (data as AnyRecord).endDate);
    return tx.tour.create({ data });
  }

  async updateRoot(tx: Prisma.TransactionClient, tourId: string, dto: AnyRecord, config: TourRootConfig, user?: RequestUser) {
    await this.ensureOrder(tx, dto.orderId, user);
    const data = this.toTourData(dto, false, config) as Prisma.TourUncheckedUpdateInput;
    await this.ensureUpdatedDateRange(tx, tourId, data as AnyRecord);
    return tx.tour.update({ where: { id: tourId }, data });
  }

  ensureDateRange(startDate: unknown, endDate: unknown) {
    const start = this.dateOnlyTime(startDate, 'startDate');
    const end = this.dateOnlyTime(endDate, 'endDate');
    if (start === null || end === null) return;
    if (start > end) {
      throw new BadRequestException('Ngày khởi hành phải trước hoặc bằng ngày kết thúc');
    }
  }

  async ensureUpdatedDateRange(tx: Prisma.TransactionClient, tourId: string, data: AnyRecord) {
    const hasStartDate = Object.prototype.hasOwnProperty.call(data, 'startDate');
    const hasEndDate = Object.prototype.hasOwnProperty.call(data, 'endDate');
    if (!hasStartDate && !hasEndDate) return;

    let startDate = data.startDate;
    let endDate = data.endDate;
    if (!hasStartDate || !hasEndDate) {
      const current = await tx.tour.findUnique({ where: { id: tourId }, select: { startDate: true, endDate: true } });
      startDate = hasStartDate ? startDate : current?.startDate;
      endDate = hasEndDate ? endDate : current?.endDate;
    }
    this.ensureDateRange(startDate, endDate);
  }

  async softDelete(tx: Prisma.TransactionClient, tourId: string, actor?: string, reason?: string) {
    const tour = await tx.tour.update({
      where: { id: tourId },
      data: { status: TourStatus.CANCELLED, deletedAt: new Date() },
    });
    await this.logAction(tx, tourId, 'DELETE_TOUR', { actor, metadata: { reason, status: TourStatus.CANCELLED } });
    return tour;
  }

  async close(tx: Prisma.TransactionClient, tourId: string, actor?: string, note?: string) {
    const tour = await tx.tour.update({
      where: { id: tourId },
      data: { status: TourStatus.COMPLETED, closedAt: new Date(), closedBy: actor || null },
    });
    await this.logAction(tx, tourId, 'CLOSE_TOUR', { actor, metadata: { note, status: TourStatus.COMPLETED } });
    return tour;
  }

  async log(tx: Prisma.TransactionClient, tourId: string, action: string, metadata?: unknown) {
    await tx.tourLog.create({ data: { tourId, action, entity: 'Tour', metadata: metadata as Prisma.InputJsonValue } });
  }

  async logAction(
    tx: Prisma.TransactionClient,
    tourId: string,
    action: string,
    options: { user?: RequestUser; actor?: string; module?: string; entity?: string; entityId?: string; metadata?: AnyRecord } = {},
  ) {
    const actor = options.actor || this.actor(options.user);
    await this.log(tx, tourId, action, {
      actor,
      action,
      module: options.module || null,
      entity: options.entity || 'Tour',
      entityId: options.entityId || tourId,
      ...(options.metadata || {}),
    });
  }

  actor(user?: RequestUser) {
    return user?.username || user?.email || user?.id || 'system';
  }

  async replaceCustomers(tx: Prisma.TransactionClient, tourId: string, customers: Prisma.TourCustomerCreateManyInput[]) {
    await this.replaceRows(tx.tourCustomer, tourId, customers);
  }

  async replaceSuppliers(tx: Prisma.TransactionClient, tourId: string, suppliers: Prisma.TourSupplierCreateManyInput[]) {
    await this.replaceRows(tx.tourSupplier, tourId, suppliers);
  }

  async replaceServices(tx: Prisma.TransactionClient, tourId: string, services: Prisma.TourServiceCreateManyInput[]) {
    await this.replaceRows(tx.tourService, tourId, services);
  }

  async replaceServicesAndSuppliers(tx: Prisma.TransactionClient, tourId: string, services: Prisma.TourServiceCreateManyInput[], supplierRole = 'SERVICE') {
    await this.replaceServices(tx, tourId, services);
    await this.replaceSuppliers(tx, tourId, this.suppliersFromServices(services, supplierRole));
  }


  async replaceCommonChildren(tx: Prisma.TransactionClient, tourId: string, children: TourCommonChildren) {
    if (this.hasChanges(children, 'customers')) await this.replaceCustomers(tx, tourId, children.customers);
    if (this.hasChanges(children, 'revenues')) await this.replaceRevenues(tx, tourId, children.revenues);
    if (this.hasChanges(children, 'costs')) await this.replaceCosts(tx, tourId, children.costs);
    if (this.hasChanges(children, 'services')) {
      await this.replaceServicesAndSuppliers(tx, tourId, children.services, children.serviceSupplierRole);
    } else if (this.hasChanges(children, 'suppliers')) {
      await this.replaceSuppliers(tx, tourId, children.suppliers);
    }
    if (this.hasChanges(children, 'guides')) await this.replaceGuides(tx, tourId, children.guides);
    if (this.hasChanges(children, 'attachments')) await this.replaceAttachments(tx, tourId, children.attachments);
    if (this.hasChanges(children, 'surveys')) await this.replaceSurveys(tx, tourId, children.surveys);
    if (this.hasChanges(children, 'terms')) await this.replaceTerms(tx, tourId, children.terms);
  }

  async replaceRevenues(tx: Prisma.TransactionClient, tourId: string, revenues: Prisma.TourRevenueCreateManyInput[]) {
    await this.replaceRows(tx.tourRevenue, tourId, revenues);
  }

  async replaceCosts(tx: Prisma.TransactionClient, tourId: string, costs: Prisma.TourCostCreateManyInput[]) {
    await this.replaceRows(tx.tourCost, tourId, costs);
  }

  async replaceGuides(tx: Prisma.TransactionClient, tourId: string, guides: Prisma.TourGuideCreateManyInput[]) {
    await this.replaceRows(tx.tourGuide, tourId, guides);
  }

  async replaceAttachments(tx: Prisma.TransactionClient, tourId: string, attachments: Prisma.TourAttachmentCreateManyInput[]) {
    await this.replaceRows(tx.tourAttachment, tourId, attachments);
  }

  async addAttachment(tx: Prisma.TransactionClient, tourId: string, attachment: Prisma.TourAttachmentCreateManyInput) {
    const { tourId: _ignoredTourId, ...data } = attachment as Prisma.TourAttachmentCreateManyInput & { tourId?: string };
    return tx.tourAttachment.create({ data: { ...data, tourId } });
  }

  async replaceSurveys(tx: Prisma.TransactionClient, tourId: string, surveys: Prisma.TourSurveyCreateManyInput[]) {
    await this.replaceRows(tx.tourSurvey, tourId, surveys);
  }

  async replaceTerms(tx: Prisma.TransactionClient, tourId: string, terms: Prisma.TourTermCreateManyInput[]) {
    await this.replaceRows(tx.tourTerm, tourId, terms);
  }

  private hasChanges<K extends keyof TourCommonChildren>(children: TourCommonChildren, key: K): children is TourCommonChildren & Required<Pick<TourCommonChildren, K>> {
    return children[key] !== undefined;
  }

  private async replaceRows<T extends AnyRecord>(delegate: TourChildDelegate<T & { tourId: string }>, tourId: string, rows: T[]) {
    await delegate.deleteMany({ where: { tourId } });
    if (rows.length) await delegate.createMany({ data: rows.map((row) => ({ ...row, tourId })) as (T & { tourId: string })[] });
  }

  primaryCustomer(dto: AnyRecord, fallbackName: string): Prisma.TourCustomerCreateManyInput {
    return {
      tourId: '',
      customerType: 'CUSTOMER',
      name: this.optionalText(dto.customerName) || fallbackName,
      phone: this.optionalText(dto.phone),
      email: this.optionalText(dto.email),
      isPrimary: true,
      notes: this.optionalText(dto.notes),
    };
  }

  agentCustomer(dto: AnyRecord): Prisma.TourCustomerCreateManyInput | null {
    const name = this.optionalText(dto.agentName);
    return name ? { tourId: '', customerType: 'AGENT', name, isPrimary: false } : null;
  }

  mapGuides(rows?: unknown[]): Prisma.TourGuideCreateManyInput[] {
    return this.rows(rows).map((row) => ({
      tourId: '',
      guideId: this.optionalText(row.guideId),
      name: this.optionalText(row.name || row.ten) || 'Guide',
      phone: this.optionalText(row.phone),
      guideType: this.optionalText(row.guideType),
      notes: this.optionalText(row.notes),
    }));
  }

  mapAttachments(rows?: unknown[]): Prisma.TourAttachmentCreateManyInput[] {
    return this.rows(rows).map((row) => ({
      tourId: '',
      step: this.optionalText(row.step),
      fileName: this.optionalText(row.fileName || row.name) || 'attachment',
      fileUrl: this.optionalText(row.fileUrl),
      mimeType: this.optionalText(row.mimeType),
      size: row.size === undefined || row.size === null ? null : Math.max(Math.trunc(this.number(row.size, 'size')), 0),
      uploadedBy: this.optionalText(row.uploadedBy),
    }));
  }

  mapSurveys(rows: unknown[] | undefined, defaults: string[] = []): Prisma.TourSurveyCreateManyInput[] {
    const source = rows === undefined ? defaults.map((question, index) => ({ question, orderNo: index + 1 })) : rows;
    return this.rows(source).map((row, index) => ({
      tourId: '',
      orderNo: Math.max(Math.trunc(this.number(row.orderNo || row.stt || index + 1, 'orderNo')), 1),
      question: this.optionalText(row.question) || 'Câu hỏi',
      notes: this.optionalText(row.notes),
    }));
  }

  mapRevenues(rows?: unknown[]): Prisma.TourRevenueCreateManyInput[] {
    return this.rows(rows).map((row) => {
      const quantity = this.number(row.quantity || 1, 'quantity');
      const unitPrice = this.number(row.unitPrice, 'unitPrice');
      const exchangeRate = this.number(row.exchangeRate || 1, 'exchangeRate');
      const vat = this.number(row.vat, 'vat');
      return {
        tourId: '',
        description: this.optionalText(row.description) || 'Doanh thu tour',
        quantity,
        unitPrice,
        currency: this.optionalText(row.currency) || 'VND',
        exchangeRate,
        vat,
        amount: this.money(row.amount, quantity * unitPrice * exchangeRate, vat),
        invoiceNo: this.optionalText(row.invoiceNo),
        notes: this.optionalText(row.notes),
      };
    });
  }

  mapSalesServices(rows?: unknown[]): Prisma.TourServiceCreateManyInput[] {
    return this.rows(rows).map((row) => {
      const quantity = this.number(row.quantity || 1, 'quantity');
      const salesUnitPrice = this.number(row.unitPrice || row.salesUnitPrice, 'salesUnitPrice');
      const exchangeRate = this.number(row.exchangeRate || 1, 'exchangeRate');
      const vat = this.number(row.vat, 'vat');
      return {
        tourId: '',
        serviceType: this.optionalText(row.serviceType) || 'Dịch vụ',
        supplierId: this.optionalText(row.supplierId),
        supplierServiceId: this.optionalText(row.supplierServiceId || row.serviceId),
        description: this.optionalText(row.description),
        quantity,
        currency: this.optionalText(row.currency) || 'VND',
        exchangeRate,
        salesUnitPrice,
        vat,
        salesAmount: this.money(row.amount, quantity * salesUnitPrice * exchangeRate, vat),
        notes: this.optionalText(row.notes),
      };
    });
  }

  mapBudgetServices(rows?: unknown[]): Prisma.TourServiceCreateManyInput[] {
    return this.rows(rows).map((row) => {
      const quantity = this.number(row.quantity || 1, 'quantity');
      const budgetUnitPrice = this.number(row.unitPrice || row.budgetUnitPrice, 'budgetUnitPrice');
      const exchangeRate = this.number(row.exchangeRate || 1, 'exchangeRate');
      const vat = this.number(row.vat, 'vat');
      return {
        tourId: '',
        serviceType: this.optionalText(row.serviceType) || 'Dịch vụ',
        supplierId: this.optionalText(row.supplierId),
        supplierServiceId: this.optionalText(row.supplierServiceId || row.serviceId),
        description: this.optionalText(row.description),
        quantity,
        currency: this.optionalText(row.currency) || 'VND',
        exchangeRate,
        budgetUnitPrice,
        vat,
        budgetAmount: this.money(row.amount, quantity * budgetUnitPrice * exchangeRate, vat),
        notes: this.optionalText(row.notes),
      };
    });
  }

  mapOperationServices(rows?: unknown[]): Prisma.TourServiceCreateManyInput[] {
    return this.rows(rows).map((row) => {
      const quantity = this.number(row.quantity || 1, 'quantity');
      const confirmedUnitPrice = this.number(row.confirmedUnitPrice || row.unitPrice, 'confirmedUnitPrice');
      const exchangeRate = this.number(row.exchangeRate || 1, 'exchangeRate');
      const vat = this.number(row.vat, 'vat');
      return {
        tourId: '',
        serviceType: this.optionalText(row.serviceType) || 'Dịch vụ',
        supplierId: this.optionalText(row.supplierId),
        supplierServiceId: this.optionalText(row.supplierServiceId || row.serviceId),
        description: this.optionalText(row.description),
        quantity,
        currency: this.optionalText(row.currency) || 'VND',
        exchangeRate,
        confirmedUnitPrice,
        vat,
        confirmedAmount: this.money(row.amount, quantity * confirmedUnitPrice * exchangeRate, vat),
        bookingCode: this.optionalText(row.bookingCode),
        notes: this.optionalText(row.notes),
      };
    });
  }

  mapCosts(rows?: unknown[], costType = 'TOUR_COST'): Prisma.TourCostCreateManyInput[] {
    return this.rows(rows).map((row) => ({
      tourId: '',
      supplierId: this.optionalText(row.supplierId),
      costType: this.optionalText(row.costType || row.serviceType) || costType,
      description: this.optionalText(row.description),
      expectedAmount: this.number(row.amount || row.expectedAmount, 'expectedAmount'),
      actualAmount: this.number(row.actualAmount, 'actualAmount'),
      currency: this.optionalText(row.currency) || 'VND',
      exchangeRate: this.number(row.exchangeRate || 1, 'exchangeRate'),
      vat: this.number(row.vat, 'vat'),
      invoiceNo: this.optionalText(row.invoiceNo),
      notes: this.optionalText(row.notes),
    }));
  }

  async copyServicesFromTour(
    tx: Prisma.TransactionClient,
    targetTourId: string,
    sourceTourId: string,
    type: TourType,
    supplierRole = 'SERVICE',
    user?: RequestUser,
  ) {
    const source = await tx.tour.findFirst({ where: this.scopeWhere({ id: sourceTourId, type }, user), include: { services: true } });
    if (!source) throw new NotFoundException('Không tìm thấy tour nguồn');
    await this.copyServices(tx, targetTourId, source.services, supplierRole);
  }

  async copyServices(tx: Prisma.TransactionClient, targetTourId: string, sourceServices: Prisma.TourServiceCreateManyInput[], supplierRole = 'SERVICE') {
    const services = this.cloneServicesForCopy(sourceServices);
    await this.replaceServicesAndSuppliers(tx, targetTourId, services, supplierRole);
  }

  cloneServicesForCopy(services: Prisma.TourServiceCreateManyInput[]): Prisma.TourServiceCreateManyInput[] {
    return services.map((service) => ({
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
  }

  suppliersFromServices(services: Prisma.TourServiceCreateManyInput[], defaultRole = 'SERVICE'): Prisma.TourSupplierCreateManyInput[] {
    const suppliers = new Map<string, Prisma.TourSupplierCreateManyInput>();
    for (const service of services) {
      const supplierId = this.optionalText(service.supplierId);
      if (!supplierId || suppliers.has(supplierId)) continue;
      suppliers.set(supplierId, {
        tourId: '',
        supplierId,
        serviceType: this.optionalText(service.serviceType) || defaultRole,
        role: defaultRole,
        status: service.confirmationStatus,
        notes: service.notes,
      });
    }
    return Array.from(suppliers.values());
  }

  private statusFromWorkflow(workflowStep: string, config: TourRootConfig) {
    return config.statusFromWorkflow ? config.statusFromWorkflow(workflowStep) : undefined;
  }

  private pickText(dto: AnyRecord, field: string) {
    return field in dto ? this.optionalText(dto[field]) || undefined : undefined;
  }

  private requiredText(value: unknown, field: string) {
    const text = this.optionalText(value);
    if (!text) throw new BadRequestException(`${field} là bắt buộc`);
    return text;
  }

  private optionalText(value: unknown) {
    const text = String(value ?? '').trim();
    return text ? text : null;
  }

  private rows(rows?: unknown[]): AnyRecord[] {
    return (rows || []).filter((row): row is AnyRecord => Boolean(row) && typeof row === 'object' && !Array.isArray(row));
  }

  private optionalDate(value: unknown, field: string) {
    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) throw new BadRequestException(`${field} kh\u00f4ng h\u1ee3p l\u1ec7`);
      return value;
    }
    const text = this.optionalText(value);
    if (!text) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new BadRequestException(`${field} ph\u1ea3i c\u00f3 \u0111\u1ecbnh d\u1ea1ng YYYY-MM-DD`);
    const [year, month, day] = text.split('-').map(Number);
    const time = Date.UTC(year, month - 1, day);
    const date = new Date(time);
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
      throw new BadRequestException(`${field} kh\u00f4ng h\u1ee3p l\u1ec7`);
    }
    return date;
  }

  private dateOnlyTime(value: unknown, field: string) {
    if (value === null || value === undefined) return null;
    const date = value instanceof Date ? value : this.optionalDate(value, field);
    if (!date) return null;
    if (Number.isNaN(date.getTime())) throw new BadRequestException(`${field} kh\u00f4ng h\u1ee3p l\u1ec7`);
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  }

  private number(value: unknown, field: string) {
    const parsed = Number(value ?? 0);
    if (!Number.isFinite(parsed)) throw new BadRequestException(`${field} phải là số hợp lệ`);
    return parsed;
  }

  private money(explicitAmount: unknown, subtotal: number, vat: number) {
    const amount = this.number(explicitAmount, 'amount');
    return amount > 0 ? amount : subtotal * (1 + vat / 100);
  }
}

import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { BookingStatus, FinancePaymentMethod, OperationStatus, OrderStatus, Prisma, SupplierPaymentStatus, TourStatus, TourType } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { hasUnrestrictedDataScope, RequestUser, userPermissions } from '../auth/data-scope';
import { containsSearch, normalizeListSearch } from '../list-search';
import { ListOperationFormsQueryDto, ListSupplierPaymentRequestsQueryDto, OPERATIONS_LIST_MAX_TAKE } from './dto/list-operations-query.dto';

type AnyRecord = Record<string, unknown>;
type FormWriteMode = 'create' | 'update';
type ScopeMeta = { branch?: string | null; department?: string | null };
type ParsedOperationService = {
  itineraryDayId: string | null;
  supplierId: string;
  supplierServiceId: string;
  serviceType: string;
  serviceName: string;
  confirmationStatus: string;
  expectedCost: number;
  actualCost: number;
  notes: string | null;
};
type ParsedOperationTask = {
  title: string;
  assignee: string | null;
  dueDate: Date | null;
  status: OperationStatus;
  notes: string | null;
};
type ParsedOperationCost = {
  serviceId: string | null;
  costName: string;
  expectedAmount: number;
  actualAmount: number;
  currency: string;
  invoiceNo: string | null;
  notes: string | null;
};
type ParsedPaymentItem = {
  supplierId: string;
  costId: string;
  amount: number;
  notes: string | null;
};
type LinkedOperationForm = {
  status: OperationStatus;
  booking?: { customer?: ScopeMeta | null } | null;
  order?: ScopeMeta | null;
  tour?: ScopeMeta | null;
};
type FinancePaymentOperationForm = LinkedOperationForm & {
  id: string;
  bookingId: string;
  orderId: string | null;
  tourId: string | null;
  booking?: (ScopeMeta & {
    id: string;
    code: string;
    orderId: string | null;
    tourId: string | null;
    customerName: string;
    startDate: Date | null;
    endDate: Date | null;
    operatorOwner?: string | null;
    customer?: ScopeMeta | null;
  }) | null;
  order?: (ScopeMeta & {
    id: string;
    systemCode: string;
    tourCode: string | null;
    name: string;
    route: string | null;
    bookingDate: Date | null;
    startDate: Date | null;
    endDate: Date | null;
    operatorOwner?: string | null;
  }) | null;
  tour?: (ScopeMeta & { id: string }) | null;
};
type OperationDashboard = {
  upcomingDepartures: number;
  operatingTours: number;
  overdueTasks: number;
  waitingSupplierConfirmations: number;
  pendingSupplierPayments: number;
  lowMarginTours: number;
};
type OperationModuleCard = {
  key: string;
  label: string;
  description: string;
  route: string;
  permission: string;
  metrics: Array<keyof OperationDashboard>;
  order: number;
  enabled: boolean;
};

const OPERATION_CONFIRMATION_STATUSES = new Set(['WAITING', 'REQUESTED', 'CONFIRMED', 'OPERATING', 'DONE', 'COMPLETED', 'CANCELLED']);
const OPERATIONS_LIST_CHILD_TAKE = 20;

@Injectable()
export class OperationsService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(user?: RequestUser): Promise<OperationDashboard> {
    const now = new Date();
    const today = this.startOfDay(now);
    const next14 = this.endOfDay(this.addDays(today, 14));
    const departureWindow = { gte: today, lte: next14 };
    const activeFormScope = this.activeOperationFormScope(user);
    const [upcomingOrderDepartures, upcomingStandaloneBookings, runningTours, runningLegacyOrders, overdueTasks, waitingSupplierConfirmations, pendingSupplierPayments, lowMarginTours] = await Promise.all([
      this.prisma.order.count({
        where: this.orderScopeWhere({ deletedAt: null, startDate: departureWindow, status: { in: [OrderStatus.UPCOMING, OrderStatus.RUNNING] } }, user),
      }),
      this.prisma.booking.count({
        where: this.bookingScopeWhere({ orderId: null, startDate: departureWindow, status: { in: [BookingStatus.CONFIRMED, BookingStatus.OPERATING] } }, user),
      }),
      this.prisma.tour.count({ where: this.tourScopeWhere({ deletedAt: null, status: TourStatus.RUNNING }, user) }),
      this.prisma.order.count({ where: this.orderScopeWhere({ deletedAt: null, status: OrderStatus.RUNNING, tours: { none: {} } }, user) }),
      this.prisma.operationTask.count({ where: { dueDate: { lt: today }, status: { notIn: [OperationStatus.DONE, OperationStatus.CANCELLED] }, operationForm: activeFormScope } }),
      this.prisma.operationService.count({ where: { confirmationStatus: { in: ['WAITING', 'REQUESTED'] }, operationForm: activeFormScope } }),
      this.prisma.supplierPaymentRequest.count({ where: this.paymentRequestScopeWhere({ status: { in: [SupplierPaymentStatus.REQUESTED, SupplierPaymentStatus.APPROVED] } }, user) }),
      this.prisma.order.count({ where: this.orderScopeWhere({ deletedAt: null, status: { in: [OrderStatus.UPCOMING, OrderStatus.RUNNING, OrderStatus.COMPLETED] }, totalRevenue: { gt: 0 }, profit: { lt: 0 } }, user) }),
    ]);
    const upcomingDepartures = upcomingOrderDepartures + upcomingStandaloneBookings;
    const operatingTours = runningTours + runningLegacyOrders;
    return { upcomingDepartures, operatingTours, overdueTasks, waitingSupplierConfirmations, pendingSupplierPayments, lowMarginTours };
  }

  getModules(): OperationModuleCard[] {
    return [
      {
        key: 'suppliers',
        label: 'Nh\u00e0 cung c\u1ea5p',
        description: 'Danh m\u1ee5c NCC v\u00e0 d\u1ecbch v\u1ee5 \u0111\u1ec3 \u0111i\u1ec1u h\u00e0nh ch\u1ecdn ngu\u1ed3n cung \u1ee9ng.',
        route: '/suppliers',
        permission: 'supplier.view',
        metrics: [],
        order: 10,
        enabled: true,
      },
      {
        key: 'tour-programs',
        label: 'Tour m\u1eabu',
        description: 'Ch\u01b0\u01a1ng tr\u00ecnh tour v\u00e0 ng\u00e0y h\u00e0nh tr\u00ecnh l\u00e0m n\u1ec1n cho booking.',
        route: '/tour-programs',
        permission: 'tour.view',
        metrics: [],
        order: 20,
        enabled: true,
      },
      {
        key: 'bookings',
        label: 'Booking',
        description: 'Ngu\u1ed3n tour c\u1ea7n \u0111i\u1ec1u h\u00e0nh v\u00e0 theo d\u00f5i ng\u00e0y kh\u1edfi h\u00e0nh.',
        route: '/bookings',
        permission: 'booking.view',
        metrics: ['upcomingDepartures'],
        order: 30,
        enabled: true,
      },
      {
        key: 'operation-forms',
        label: 'Phi\u1ebfu \u0111i\u1ec1u h\u00e0nh',
        description: 'Qu\u1ea3n l\u00fd d\u1ecbch v\u1ee5, c\u00f4ng vi\u1ec7c v\u00e0 chi ph\u00ed \u0111i\u1ec1u h\u00e0nh theo booking.',
        route: '/operations?tab=forms',
        permission: 'operation.form.view',
        metrics: ['overdueTasks', 'waitingSupplierConfirmations'],
        order: 40,
        enabled: true,
      },
      {
        key: 'supplier-payment-requests',
        label: 'Thanh to\u00e1n nh\u00e0 cung c\u1ea5p',
        description: 'Theo d\u00f5i y\u00eau c\u1ea7u thanh to\u00e1n v\u00e0 li\u00ean k\u1ebft phi\u1ebfu chi t\u00e0i ch\u00ednh.',
        route: '/operations?tab=payments',
        permission: 'operation.payment-request.view',
        metrics: ['pendingSupplierPayments'],
        order: 50,
        enabled: true,
      },
      {
        key: 'operation-vouchers',
        label: 'Phi\u1ebfu d\u1ecbch v\u1ee5',
        description: 'Theo d\u00f5i voucher d\u1ecbch v\u1ee5, thanh to\u00e1n v\u00e0 \u0111\u1ed1i so\u00e1t v\u1eadn h\u00e0nh.',
        route: '/operation-vouchers',
        permission: 'operation.form.view',
        metrics: ['operatingTours'],
        order: 60,
        enabled: true,
      },
      {
        key: 'profit-loss-reports',
        label: 'C\u1ea3nh b\u00e1o l\u1ee3i nhu\u1eadn',
        description: 'C\u00e1c tour/order c\u00f3 l\u1ee3i nhu\u1eadn \u00e2m c\u1ea7n ki\u1ec3m tra tr\u01b0\u1edbc khi ch\u1ed1t v\u1eadn h\u00e0nh.',
        route: '/reports/profit',
        permission: 'report.view',
        metrics: ['lowMarginTours'],
        order: 70,
        enabled: true,
      },
    ];
  }

  async listForms(query: ListOperationFormsQueryDto, user?: RequestUser) {
    const search = normalizeListSearch(query.search);
    const contains = search ? containsSearch(search) : undefined;
    return this.prisma.operationForm.findMany({
      where: this.formScopeWhere({
        ...(query.status ? { status: this.operationStatus(query.status, OperationStatus.PENDING) } : {}),
        ...(query.bookingId ? { bookingId: query.bookingId } : {}),
        ...(query.orderId ? { orderId: query.orderId } : {}),
        ...(query.tourId ? { tourId: query.tourId } : {}),
        ...(contains
          ? {
              OR: [
                { booking: { code: contains } },
                { booking: { customerName: contains } },
                { booking: { customerPhone: contains } },
                { order: { systemCode: contains } },
                { order: { tourCode: contains } },
                { order: { name: contains } },
                { order: { route: contains } },
                { tour: { systemCode: contains } },
                { tour: { tourCode: contains } },
                { tour: { name: contains } },
                { tour: { route: contains } },
                { notes: contains },
              ],
            }
          : {}),
      }, user),
      select: this.formListSelect(),
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      take: this.take(query.take),
    });
  }

  async formDetail(id: string, user?: RequestUser) {
    const row = await this.prisma.operationForm.findFirst({ where: this.formScopeWhere({ id }, user), include: this.formDetailInclude() });
    if (!row) throw new NotFoundException('Không tìm thấy phiếu điều hành');
    return row;
  }

  async createForm(dto: AnyRecord = {}, user?: RequestUser) {
    const actor = this.operationActor(dto);
    const bookingId = this.requiredText(dto.bookingId, 'Cần chọn booking để tạo phiếu điều hành');
    const links = await this.resolveBookingOrderTour({ bookingId, orderId: this.text(dto.orderId), tourId: this.text(dto.tourId) });
    await this.ensureLinksScoped({ bookingId, orderId: links.orderId, tourId: links.tourId }, user);
    await this.validateFormPayload(dto, 'create');
    try {
      return await this.prisma.$transaction(async (tx) => {
        const form = await tx.operationForm.create({
          data: {
            bookingId,
            orderId: links.orderId,
            tourId: links.tourId,
            status: this.operationStatus(dto.status, OperationStatus.PENDING),
            notes: this.text(dto.notes),
          },
        });
        await this.replaceFormChildren(tx, form.id, dto);
        await this.audit(tx, 'CREATE', 'OperationForm', form.id, { actor, bookingId, orderId: links.orderId, tourId: links.tourId, status: form.status, payload: dto });
        return tx.operationForm.findUniqueOrThrow({ where: { id: form.id }, include: this.formDetailInclude() });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Booking đã có phiếu điều hành');
      throw error;
    }
  }

  async updateForm(id: string, dto: AnyRecord = {}, user?: RequestUser) {
    const actor = this.operationActor(dto);
    const current = await this.formDetail(id, user);
    const bookingId = this.text(dto.bookingId) ?? current.bookingId;
    const links = await this.resolveBookingOrderTour({
      bookingId,
      orderId: dto.orderId !== undefined ? this.text(dto.orderId) : current.orderId,
      tourId: dto.tourId !== undefined ? this.text(dto.tourId) : current.tourId,
    });
    await this.ensureLinksScoped({ bookingId, orderId: links.orderId, tourId: links.tourId }, user);
    await this.validateFormPayload(dto, 'update');
    await this.ensureFormCostServiceLinks(id, dto);
    await this.ensureFormChildrenReplaceable(id, dto);
    return this.prisma.$transaction(async (tx) => {
      await tx.operationForm.update({
        where: { id },
        data: {
          ...(dto.bookingId !== undefined ? { bookingId } : {}),
          ...(dto.orderId !== undefined || dto.bookingId !== undefined ? { orderId: links.orderId } : {}),
          ...(dto.tourId !== undefined || dto.bookingId !== undefined ? { tourId: links.tourId } : {}),
          ...(dto.status !== undefined ? { status: this.operationStatus(dto.status, OperationStatus.PENDING) } : {}),
          ...(dto.notes !== undefined ? { notes: this.text(dto.notes) } : {}),
        },
      });
      if (dto.services !== undefined || dto.tasks !== undefined || dto.costs !== undefined) await this.replaceFormChildren(tx, id, dto);
      await this.audit(tx, 'UPDATE', 'OperationForm', id, { actor, changedFields: Object.keys(dto), payload: dto });
      return tx.operationForm.findUniqueOrThrow({ where: { id }, include: this.formDetailInclude() });
    });
  }

  async cancelForm(id: string, dto: AnyRecord = {}, user?: RequestUser) {
    const actor = this.operationActor(dto);
    const reason = this.text(dto.reason) ?? this.text(dto.notes);
    const current = await this.formDetail(id, user);
    if (current.status === OperationStatus.CANCELLED) return current;
    if (!reason) throw new BadRequestException('C\u1ea7n nh\u1eadp l\u00fd do h\u1ee7y phi\u1ebfu \u0111i\u1ec1u h\u00e0nh \u0111\u1ec3 l\u01b0u l\u1ecbch s\u1eed x\u1eed l\u00fd');
    if (current.status === OperationStatus.DONE) throw new BadRequestException('Phi\u1ebfu \u0111i\u1ec1u h\u00e0nh \u0111\u00e3 ho\u00e0n t\u1ea5t kh\u00f4ng th\u1ec3 h\u1ee7y');
    await this.ensureFormCanBeCancelled(id);
    return this.prisma.$transaction(async (tx) => {
      const form = await tx.operationForm.update({
        where: { id },
        data: { status: OperationStatus.CANCELLED, ...(reason !== null ? { notes: reason } : {}) },
        include: this.formDetailInclude(),
      });
      await this.audit(tx, 'CANCEL', 'OperationForm', id, { actor, reason, payload: dto });
      return form;
    });
  }

  async listPaymentRequests(query: ListSupplierPaymentRequestsQueryDto, user?: RequestUser) {
    const search = normalizeListSearch(query.search);
    const contains = search ? containsSearch(search) : undefined;
    return this.prisma.supplierPaymentRequest.findMany({
      where: this.paymentRequestScopeWhere({
        ...(query.status ? { status: this.supplierPaymentStatus(query.status, SupplierPaymentStatus.DRAFT) } : {}),
        ...(query.supplierId ? { items: { some: { supplierId: query.supplierId } } } : {}),
        ...(query.financePaymentId ? { financePaymentId: query.financePaymentId } : {}),
        ...(contains
          ? {
              OR: [
                { code: contains },
                { requestedBy: contains },
                { approvedBy: contains },
                { financePayment: { voucherCode: contains } },
                { items: { some: { notes: contains } } },
                { items: { some: { supplier: { supplierCode: contains } } } },
                { items: { some: { supplier: { name: contains } } } },
                { items: { some: { cost: { costName: contains } } } },
                { items: { some: { cost: { notes: contains } } } },
                { items: { some: { cost: { operationForm: { booking: { code: contains } } } } } },
                { items: { some: { cost: { operationForm: { booking: { customerName: contains } } } } } },
                { items: { some: { cost: { operationForm: { order: { systemCode: contains } } } } } },
                { items: { some: { cost: { operationForm: { order: { tourCode: contains } } } } } },
                { items: { some: { cost: { operationForm: { order: { name: contains } } } } } },
                { items: { some: { cost: { operationForm: { tour: { systemCode: contains } } } } } },
                { items: { some: { cost: { operationForm: { tour: { tourCode: contains } } } } } },
                { items: { some: { cost: { operationForm: { tour: { name: contains } } } } } },
              ],
            }
          : {}),
      }, user),
      select: this.paymentRequestListSelect(),
      orderBy: [{ requestedAt: 'desc' }, { code: 'asc' }],
      take: this.take(query.take),
    });
  }

  async paymentRequestDetail(id: string, user?: RequestUser) {
    const row = await this.prisma.supplierPaymentRequest.findFirst({ where: this.paymentRequestScopeWhere({ id }, user), include: this.paymentRequestDetailInclude() });
    if (!row) throw new NotFoundException('Không tìm thấy yêu cầu thanh toán nhà cung cấp');
    return row;
  }

  async createPaymentRequest(dto: AnyRecord = {}, user?: RequestUser) {
    const actor = this.operationActor(dto);
    const status = this.supplierPaymentStatus(dto.status, SupplierPaymentStatus.DRAFT);
    if (status !== SupplierPaymentStatus.DRAFT) throw new BadRequestException('Yêu cầu thanh toán nhà cung cấp phải được tạo ở trạng thái nháp');
    const items = this.paymentItems(dto);
    if (!items.length) throw new BadRequestException('Cần ít nhất một dòng thanh toán nhà cung cấp');
    await this.validatePaymentItems(items);
    await this.ensurePaymentItemsScoped(items, user);
    const codeBranch = await this.paymentRequestCodeBranch(items, dto, user);
    return this.prisma.$transaction(async (tx) => {
      const code = this.text(dto.code) || (await this.nextAvailablePaymentRequestCode(tx, new Date(), codeBranch));
      const request = await tx.supplierPaymentRequest.create({
        data: {
          code,
          status,
          requestedBy: this.text(dto.requestedBy) || actor,
          items: { create: items },
        },
        include: this.paymentRequestDetailInclude(),
      });
      await this.audit(tx, 'CREATE', 'SupplierPaymentRequest', request.id, { actor, requestedBy: request.requestedBy, code, codeBranch, itemCount: items.length, payload: dto });
      return request;
    });
  }

  async updatePaymentRequest(id: string, dto: AnyRecord = {}, user?: RequestUser) {
    const actor = this.operationActor(dto);
    const current = await this.paymentRequestDetail(id, user);
    if (current.status !== SupplierPaymentStatus.DRAFT && current.status !== SupplierPaymentStatus.REJECTED) throw new BadRequestException('Chỉ yêu cầu ở trạng thái nháp hoặc bị từ chối mới được chỉnh sửa');
    const items = dto.items === undefined ? undefined : this.paymentItems(dto);
    if (dto.status !== undefined && this.supplierPaymentStatus(dto.status, current.status) !== current.status) {
      throw new BadRequestException('Vui l\u00f2ng d\u00f9ng \u0111\u01b0\u1eddng d\u1eabn h\u00e0nh \u0111\u1ed9ng \u0111\u1ec3 \u0111\u1ed5i tr\u1ea1ng th\u00e1i y\u00eau c\u1ea7u thanh to\u00e1n nh\u00e0 cung c\u1ea5p');
    }
    if (items) {
      if (!items.length) throw new BadRequestException('Cần ít nhất một dòng thanh toán nhà cung cấp');
      await this.validatePaymentItems(items, id);
      await this.ensurePaymentItemsScoped(items, user);
    }
    return this.prisma.$transaction(async (tx) => {
      if (items) await tx.supplierPaymentItem.deleteMany({ where: { requestId: id } });
      const request = await tx.supplierPaymentRequest.update({
        where: { id },
        data: {
          ...(dto.code !== undefined ? { code: this.requiredText(dto.code, 'Cần nhập mã yêu cầu thanh toán') } : {}),
          ...(dto.requestedBy !== undefined || dto.actor !== undefined ? { requestedBy: this.text(dto.requestedBy) || actor } : {}),
          ...(items ? { items: { create: items } } : {}),
        },
        include: this.paymentRequestDetailInclude(),
      });
      await this.audit(tx, 'UPDATE', 'SupplierPaymentRequest', id, { actor, changedFields: Object.keys(dto), payload: dto });
      return request;
    });
  }

  submitPaymentRequest(id: string, dto: AnyRecord = {}, user?: RequestUser) {
    return this.changePaymentRequestStatus(id, SupplierPaymentStatus.REQUESTED, dto, user);
  }

  async approvePaymentRequest(id: string, dto: AnyRecord = {}, user?: RequestUser) {
    await this.paymentRequestDetail(id, user);
    const actor = this.text(dto.actor) || this.text(dto.approvedBy) || 'operation';
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.supplierPaymentRequest.findUnique({ where: { id }, include: { items: true } });
      if (!request) throw new NotFoundException('Không tìm thấy yêu cầu thanh toán nhà cung cấp');
      if (request.status === SupplierPaymentStatus.PAID) throw new BadRequestException('Y\u00eau c\u1ea7u thanh to\u00e1n nh\u00e0 cung c\u1ea5p \u0111\u00e3 thanh to\u00e1n kh\u00f4ng th\u1ec3 duy\u1ec7t l\u1ea1i');
      if (request.status !== SupplierPaymentStatus.REQUESTED) throw new BadRequestException('Chỉ yêu cầu đã gửi mới được duyệt');
      if (!request.items.length) throw new BadRequestException('Yêu cầu thanh toán nhà cung cấp chưa có dòng nào');
      const approved = await tx.supplierPaymentRequest.update({ where: { id }, data: { status: SupplierPaymentStatus.APPROVED, approvedBy: actor }, include: this.paymentRequestDetailInclude() });
      for (const item of request.items) {
        await tx.supplierLedgerEntry.upsert({
          where: { sourceType_sourceId_entryType: { sourceType: 'MANUAL', sourceId: item.id, entryType: 'CREDIT' } },
          create: {
            supplierId: item.supplierId,
            sourceType: 'MANUAL',
            sourceId: item.id,
            entryType: 'CREDIT',
            creditAmount: item.amount,
            documentCode: request.code,
            documentDate: request.requestedAt,
            description: item.notes || `Yêu cầu thanh toán nhà cung cấp ${request.code}`,
            createdBy: actor,
          },
          update: {
            supplierId: item.supplierId,
            creditAmount: item.amount,
            documentCode: request.code,
            documentDate: request.requestedAt,
            description: item.notes || `Yêu cầu thanh toán nhà cung cấp ${request.code}`,
          },
        });
      }
      await this.audit(tx, 'APPROVE', 'SupplierPaymentRequest', id, { actor, note: this.text(dto.note) });
      return approved;
    });
  }

  rejectPaymentRequest(id: string, dto: AnyRecord = {}, user?: RequestUser) {
    return this.changePaymentRequestStatus(id, SupplierPaymentStatus.REJECTED, dto, user);
  }

  async createFinancePaymentForRequest(id: string, dto: AnyRecord = {}, user?: RequestUser) {
    await this.paymentRequestDetail(id, user);
    const actor = this.text(dto.actor) || 'operation';
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.supplierPaymentRequest.findUnique({
        where: { id },
        include: {
          items: {
            include: {
              supplier: true,
              cost: { include: { operationForm: { include: { booking: { include: { customer: true } }, order: true, tour: true } } } },
            },
          },
          financePayment: true,
        },
      });
      if (!request) throw new NotFoundException('Không tìm thấy yêu cầu thanh toán nhà cung cấp');
      if (request.financePaymentId) return tx.supplierPaymentRequest.findUniqueOrThrow({ where: { id }, include: this.paymentRequestDetailInclude() });
      if (request.status !== SupplierPaymentStatus.APPROVED) throw new BadRequestException('Chỉ yêu cầu đã duyệt mới được tạo phiếu chi tài chính');
      if (!request.items.length || request.items.some((item) => !item.costId || !item.cost?.operationForm)) {
        throw new BadRequestException('Các dòng yêu cầu thanh toán nhà cung cấp phải liên kết với chi phí điều hành');
      }
      if (request.items.some((item) => item.cost?.operationForm.status === OperationStatus.CANCELLED)) {
        throw new BadRequestException('Kh\u00f4ng th\u1ec3 t\u1ea1o phi\u1ebfu chi t\u00e0i ch\u00ednh cho phi\u1ebfu \u0111i\u1ec1u h\u00e0nh \u0111\u00e3 h\u1ee7y');
      }
      const total = request.items.reduce((sum, item) => sum + Number(item.amount), 0);
      if (total <= 0) throw new BadRequestException('Số tiền thanh toán phải lớn hơn 0');
      const supplierIds = Array.from(new Set(request.items.map((item) => item.supplierId)));
      const firstSupplier = request.items[0]?.supplier;
      const operationForms = request.items.flatMap((item) => (item.cost?.operationForm ? [item.cost.operationForm] : [])) as FinancePaymentOperationForm[];
      const firstCostForm = operationForms[0];
      const paymentTourId = await this.resolveFinancePaymentTourId(tx, operationForms, actor, user);
      const scope = this.commonOperationFormScope(operationForms);
      const paymentScope = this.applyScopedWriteMeta({ branch: this.text(dto.branch) || scope.branch, department: this.text(dto.department) || scope.department }, user);
      const payment = await tx.financePayment.create({
        data: {
          voucherCode: await this.nextAvailableFinancePaymentCode(tx, new Date()),
          voucherName: 'Chi nh\u00e0 cung c\u1ea5p',
          voucherType: 'SUPPLIER_PAYMENT',
          paymentDate: this.date(dto.paymentDate, 'Ng\u00e0y thanh to\u00e1n kh\u00f4ng h\u1ee3p l\u1ec7'),
          paymentMethod: this.financePaymentMethod(dto.paymentMethod),
          supplierId: supplierIds.length === 1 ? supplierIds[0] : null,
          orderId: firstCostForm?.orderId ?? firstCostForm?.order?.id ?? firstCostForm?.booking?.orderId ?? null,
          tourId: paymentTourId,
          receiverName: supplierIds.length === 1 ? firstSupplier?.name : 'Nhi\u1ec1u nh\u00e0 cung c\u1ea5p',
          reason: this.text(dto.reason) || `Yêu cầu thanh toán nhà cung cấp ${request.code}`,
          totalAmount: total,
          paymentAmount: total,
          remainingAmount: 0,
          approvalStatus: 'PENDING',
          branch: paymentScope.branch,
          department: paymentScope.department,
          assignedStaff: this.text(dto.assignedStaff) || actor,
          createdBy: actor,
        },
      });
      const linked = await tx.supplierPaymentRequest.updateMany({ where: { id, financePaymentId: null }, data: { financePaymentId: payment.id } });
      if (!linked.count) {
        await tx.financePayment.delete({ where: { id: payment.id } });
        throw new BadRequestException('Yêu cầu thanh toán nhà cung cấp đã có phiếu chi tài chính');
      }
      const updated = await tx.supplierPaymentRequest.findUniqueOrThrow({ where: { id }, include: this.paymentRequestDetailInclude() });
      await this.audit(tx, 'CREATE_FINANCE_PAYMENT', 'SupplierPaymentRequest', id, { actor, financePaymentId: payment.id, total, supplierIds });
      return updated;
    });
  }

  private async resolveFinancePaymentTourId(tx: Prisma.TransactionClient, forms: FinancePaymentOperationForm[], actor: string, user?: RequestUser) {
    if (!forms.length) throw new BadRequestException('Y\u00eau c\u1ea7u thanh to\u00e1n nh\u00e0 cung c\u1ea5p ph\u1ea3i li\u00ean k\u1ebft v\u1edbi phi\u1ebfu \u0111i\u1ec1u h\u00e0nh');
    const existingTourIds = Array.from(new Set(forms.flatMap((form) => [form.tourId, form.tour?.id, form.booking?.tourId].filter((id): id is string => Boolean(id)))));
    if (existingTourIds.length > 1) throw new BadRequestException('C\u00e1c d\u00f2ng thanh to\u00e1n nh\u00e0 cung c\u1ea5p ph\u1ea3i thu\u1ed9c c\u00f9ng m\u1ed9t tour');
    if (existingTourIds.length === 1) {
      await this.attachOperationLinksToTour(tx, forms, existingTourIds[0]);
      return existingTourIds[0];
    }

    const orderIds = Array.from(new Set(forms.map((form) => form.orderId ?? form.booking?.orderId ?? form.order?.id ?? null).filter((id): id is string => Boolean(id))));
    const bookingIds = Array.from(new Set(forms.map((form) => form.bookingId ?? form.booking?.id).filter((id): id is string => Boolean(id))));
    if (orderIds.length > 1 || (!orderIds.length && bookingIds.length > 1)) {
      throw new BadRequestException('C\u00e1c d\u00f2ng thanh to\u00e1n nh\u00e0 cung c\u1ea5p ph\u1ea3i thu\u1ed9c c\u00f9ng m\u1ed9t tour ho\u1eb7c c\u00f9ng m\u1ed9t \u0111\u01a1n h\u00e0ng');
    }

    const orderId = orderIds[0] ?? null;
    if (orderId) {
      const existingOrderTour = await tx.tour.findFirst({ where: { orderId, deletedAt: null }, select: { id: true } });
      if (existingOrderTour) {
        await this.attachOperationLinksToTour(tx, forms, existingOrderTour.id);
        return existingOrderTour.id;
      }
    }

    const sourceForm = forms[0];
    const scope = this.commonOperationFormScope(forms);
    const branch = scope.branch ?? sourceForm.order?.branch ?? sourceForm.booking?.customer?.branch ?? null;
    const department = scope.department ?? sourceForm.order?.department ?? sourceForm.booking?.customer?.department ?? null;
    const scopedMeta = this.applyScopedWriteMeta({ branch, department }, user);
    const startDate = sourceForm.booking?.startDate ?? sourceForm.order?.startDate ?? null;
    const endDate = sourceForm.booking?.endDate ?? sourceForm.order?.endDate ?? null;
    const code = await this.nextAvailableOperationTourCode(tx, startDate ?? new Date());
    const tour = await tx.tour.create({
      data: {
        type: TourType.FIT,
        status: TourStatus.UPCOMING,
        systemCode: code,
        tourCode: sourceForm.order?.tourCode || code,
        name: sourceForm.order?.name || `Tour v\u1eadn h\u00e0nh ${sourceForm.booking?.code ?? code}`,
        orderId,
        bookingDate: sourceForm.order?.bookingDate ?? null,
        startDate,
        endDate,
        createdBy: actor,
        operatorOwner: sourceForm.booking?.operatorOwner ?? sourceForm.order?.operatorOwner ?? null,
        branch: scopedMeta.branch,
        department: scopedMeta.department,
        route: sourceForm.order?.route ?? null,
        notes: `T\u1ef1 t\u1ea1o t\u1eeb phi\u1ebfu \u0111i\u1ec1u h\u00e0nh ${sourceForm.id}`,
      },
      select: { id: true },
    });
    await this.attachOperationLinksToTour(tx, forms, tour.id);
    return tour.id;
  }

  private async attachOperationLinksToTour(tx: Prisma.TransactionClient, forms: FinancePaymentOperationForm[], tourId: string) {
    const formIds = Array.from(new Set(forms.map((form) => form.id).filter(Boolean)));
    const bookingIds = Array.from(new Set(forms.map((form) => form.bookingId ?? form.booking?.id).filter((id): id is string => Boolean(id))));
    if (formIds.length) await tx.operationForm.updateMany({ where: { id: { in: formIds }, tourId: null }, data: { tourId } });
    if (bookingIds.length) await tx.booking.updateMany({ where: { id: { in: bookingIds }, tourId: null }, data: { tourId } });
  }

  async deletePaymentRequest(id: string, user?: RequestUser) {
    const actor = this.userActor(user);
    const current = await this.paymentRequestDetail(id, user);
    if (current.status !== SupplierPaymentStatus.DRAFT && current.status !== SupplierPaymentStatus.REJECTED) throw new BadRequestException('Chỉ yêu cầu ở trạng thái nháp hoặc bị từ chối mới được xóa');
    if (current.financePaymentId) throw new BadRequestException('Không thể xóa yêu cầu thanh toán nhà cung cấp đã có phiếu chi tài chính');
    return this.prisma.$transaction(async (tx) => {
      await tx.supplierPaymentItem.deleteMany({ where: { requestId: id } });
      const deleted = await tx.supplierPaymentRequest.delete({ where: { id } });
      await this.audit(tx, 'DELETE', 'SupplierPaymentRequest', id, { actor, status: current.status, code: current.code });
      return deleted;
    });
  }

  private async changePaymentRequestStatus(id: string, status: SupplierPaymentStatus, dto: AnyRecord = {}, user?: RequestUser) {
    await this.paymentRequestDetail(id, user);
    const actor = this.text(dto.actor) || this.text(dto.approvedBy) || 'operation';
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.supplierPaymentRequest.findUnique({
        where: { id },
        include: { items: { include: { cost: { include: { operationForm: { select: { status: true } } } } } } },
      });
      if (!current) throw new NotFoundException('Không tìm thấy yêu cầu thanh toán nhà cung cấp');
      this.assertSupplierPaymentTransition(current.status, status);
      if (status === SupplierPaymentStatus.REQUESTED) {
        if (!current.items.length) throw new BadRequestException('Yêu cầu thanh toán nhà cung cấp chưa có dòng nào');
        if (current.items.some((item) => !item.costId || !item.cost?.operationForm)) throw new BadRequestException('Các dòng yêu cầu thanh toán nhà cung cấp phải liên kết với chi phí điều hành');
        if (current.items.some((item) => item.cost?.operationForm.status === OperationStatus.CANCELLED)) throw new BadRequestException('Kh\u00f4ng th\u1ec3 y\u00eau c\u1ea7u thanh to\u00e1n cho phi\u1ebfu \u0111i\u1ec1u h\u00e0nh \u0111\u00e3 h\u1ee7y');
      }
      const request = await tx.supplierPaymentRequest.update({
        where: { id },
        data: {
          status,
          ...(status === SupplierPaymentStatus.REQUESTED ? { requestedBy: actor, requestedAt: new Date() } : {}),
          ...(status === SupplierPaymentStatus.REJECTED ? { approvedBy: actor } : {}),
        },
        include: this.paymentRequestDetailInclude(),
      });
      const auditAction = status === SupplierPaymentStatus.REQUESTED ? 'SUBMIT' : 'REJECT';
      await this.audit(tx, auditAction, 'SupplierPaymentRequest', id, { actor, note: this.text(dto.note) });
      return request;
    });
  }

  private async replaceFormChildren(tx: Prisma.TransactionClient, formId: string, dto: AnyRecord) {
    const replacesServices = dto.services !== undefined;
    const services = replacesServices ? this.formServices(dto) : undefined;
    const parsedCosts = dto.costs !== undefined ? this.formCosts(dto) : undefined;
    const tasks = dto.tasks !== undefined ? this.formTasks(dto) : undefined;
    const createdServices: Array<{ id: string }> = [];
    if (dto.costs !== undefined) {
      await tx.operationCost.deleteMany({ where: { operationFormId: formId } });
    }
    if (services) {
      await tx.operationService.deleteMany({ where: { operationFormId: formId } });
      for (const item of services) {
        createdServices.push(await tx.operationService.create({ data: { ...item, operationFormId: formId }, select: { id: true } }));
      }
    }
    if (parsedCosts) {
      const costs = replacesServices ? this.rebindCostsToCreatedServices(parsedCosts, createdServices) : parsedCosts;
      if (costs.length) await tx.operationCost.createMany({ data: costs.map((item) => ({ ...item, operationFormId: formId })) });
    }
    if (tasks) {
      await tx.operationTask.deleteMany({ where: { operationFormId: formId } });
      if (tasks.length) await tx.operationTask.createMany({ data: tasks.map((item) => ({ ...item, operationFormId: formId })) });
    }
  }

  private async resolveBookingOrderTour(input: { bookingId: string; orderId?: string | null; tourId?: string | null }) {
    const booking = await this.prisma.booking.findUnique({ where: { id: input.bookingId }, select: { id: true, orderId: true, tourId: true } });
    if (!booking) throw new NotFoundException('Không tìm thấy booking');
    let orderId = input.orderId ?? booking.orderId;
    let tourId = input.tourId ?? booking.tourId;
    if (input.tourId && booking.tourId && input.tourId !== booking.tourId) throw new BadRequestException('Tour đã chọn không thuộc booking đã chọn');
    let tourOrderId: string | null = null;
    if (tourId) {
      const tour = await this.prisma.tour.findUnique({ where: { id: tourId }, select: { id: true, orderId: true } });
      if (!tour) throw new NotFoundException('Không tìm thấy tour');
      tourOrderId = tour.orderId;
      orderId = orderId ?? tour.orderId;
    }
    if (booking.orderId && tourOrderId && booking.orderId !== tourOrderId) throw new BadRequestException('Tour \u0111\u00e3 ch\u1ecdn kh\u00f4ng thu\u1ed9c \u0111\u01a1n h\u00e0ng c\u1ee7a booking \u0111\u00e3 ch\u1ecdn');
    if (input.orderId && booking.orderId && input.orderId !== booking.orderId) throw new BadRequestException('Đơn hàng đã chọn không thuộc booking đã chọn');
    if (input.orderId && tourOrderId && input.orderId !== tourOrderId) throw new BadRequestException('Đơn hàng đã chọn không thuộc tour đã chọn');
    if (orderId) {
      const order = await this.prisma.order.findUnique({ where: { id: orderId }, select: { id: true } });
      if (!order) throw new NotFoundException('Không tìm thấy đơn hàng');
    }
    return { orderId, tourId };
  }

  private async validateFormPayload(dto: AnyRecord, mode: FormWriteMode) {
    const childLabels = { services: 'dòng dịch vụ điều hành', tasks: 'công việc điều hành', costs: 'dòng chi phí điều hành' } satisfies Record<'services' | 'tasks' | 'costs', string>;
    const validateChild = async <T>(key: 'services' | 'tasks' | 'costs', rows: T[], validate?: (rows: T[]) => Promise<void>) => {
      if (mode === 'create' || dto[key] !== undefined) {
        if (!rows.length) throw new BadRequestException(`Cần ít nhất một ${childLabels[key]}`);
        if (validate) await validate(rows);
      }
    };
    await validateChild('services', this.formServices(dto), (rows) => this.validateFormServices(rows));
    await validateChild('tasks', this.formTasks(dto));
    await validateChild('costs', this.formCosts(dto));
  }

  private async validateFormServices(services: ParsedOperationService[]) {
    const supplierIds = Array.from(new Set(services.map((item) => item.supplierId)));
    const serviceIds = Array.from(new Set(services.map((item) => item.supplierServiceId)));
    const itineraryDayIds = Array.from(new Set(services.map((item) => item.itineraryDayId).filter((id): id is string => Boolean(id))));
    const [suppliers, supplierServices, itineraryDays] = await Promise.all([
      this.prisma.supplier.findMany({ where: { id: { in: supplierIds }, deletedAt: null }, select: { id: true } }),
      this.prisma.supplierService.findMany({ where: { id: { in: serviceIds }, deletedAt: null }, select: { id: true, supplierId: true } }),
      itineraryDayIds.length ? this.prisma.tourItineraryDay.findMany({ where: { id: { in: itineraryDayIds } }, select: { id: true } }) : Promise.resolve([]),
    ]);
    if (suppliers.length !== supplierIds.length) throw new NotFoundException('Không tìm thấy nhà cung cấp');
    if (supplierServices.length !== serviceIds.length) throw new NotFoundException('Không tìm thấy dịch vụ nhà cung cấp');
    if (itineraryDays.length !== itineraryDayIds.length) throw new NotFoundException('Không tìm thấy ngày hành trình');
    const serviceById = new Map(supplierServices.map((item) => [item.id, item]));
    for (const service of services) {
      if (serviceById.get(service.supplierServiceId)?.supplierId !== service.supplierId) {
        throw new BadRequestException('D\u1ecbch v\u1ee5 nh\u00e0 cung c\u1ea5p kh\u00f4ng thu\u1ed9c nh\u00e0 cung c\u1ea5p \u0111\u00e3 ch\u1ecdn');
      }
    }
  }

  private async ensureFormCostServiceLinks(formId: string, dto: AnyRecord) {
    if (dto.costs === undefined || dto.services !== undefined) return;
    const serviceIds = Array.from(new Set(this.formCosts(dto).map((item) => item.serviceId).filter((id): id is string => Boolean(id))));
    if (!serviceIds.length) return;
    const count = await this.prisma.operationService.count({ where: { id: { in: serviceIds }, operationFormId: formId } });
    if (count !== serviceIds.length) throw new BadRequestException('Chi phí điều hành chỉ được liên kết với dịch vụ thuộc cùng phiếu điều hành');
  }

  private rebindCostsToCreatedServices(costs: ParsedOperationCost[], createdServices: Array<{ id: string }>) {
    if (!createdServices.length) return costs.map((item) => ({ ...item, serviceId: null }));
    if (createdServices.length === 1) return costs.map((item) => ({ ...item, serviceId: createdServices[0].id }));
    if (createdServices.length === costs.length) return costs.map((item, index) => ({ ...item, serviceId: createdServices[index]?.id ?? null }));
    return costs.map((item) => ({ ...item, serviceId: null }));
  }

  private async ensureFormChildrenReplaceable(formId: string, dto: AnyRecord) {
    if (dto.costs !== undefined) {
      const linkedPaymentItem = await this.prisma.supplierPaymentItem.findFirst({ where: { cost: { operationFormId: formId } }, select: { id: true } });
      if (linkedPaymentItem) throw new BadRequestException('Không thể thay thế chi phí điều hành sau khi đã phát sinh yêu cầu thanh toán nhà cung cấp');
    }
    if (dto.services !== undefined && dto.costs === undefined) {
      const linkedCost = await this.prisma.operationCost.findFirst({ where: { operationFormId: formId, serviceId: { not: null } }, select: { id: true } });
      if (linkedCost) throw new BadRequestException('Kh\u00f4ng th\u1ec3 thay th\u1ebf d\u1ecbch v\u1ee5 \u0111i\u1ec1u h\u00e0nh khi chi ph\u00ed \u0111ang li\u00ean k\u1ebft v\u1edbi d\u1ecbch v\u1ee5');
    }
  }

  private async ensureFormCanBeCancelled(formId: string) {
    const blockingRequest = await this.prisma.supplierPaymentItem.findFirst({
      where: {
        cost: { operationFormId: formId },
        request: { status: { in: [SupplierPaymentStatus.REQUESTED, SupplierPaymentStatus.APPROVED, SupplierPaymentStatus.PAID] } },
      },
      select: { id: true },
    });
    if (blockingRequest) throw new BadRequestException('Kh\u00f4ng th\u1ec3 h\u1ee7y phi\u1ebfu \u0111i\u1ec1u h\u00e0nh khi c\u00f2n y\u00eau c\u1ea7u thanh to\u00e1n nh\u00e0 cung c\u1ea5p \u0111ang ho\u1ea1t \u0111\u1ed9ng');
  }

  private async validatePaymentItems(items: ParsedPaymentItem[], currentRequestId?: string) {
    const duplicateCostId = items.map((item) => item.costId).find((id, index, ids) => ids.indexOf(id) !== index);
    if (duplicateCostId) throw new BadRequestException('Chi ph\u00ed \u0111i\u1ec1u h\u00e0nh b\u1ecb tr\u00f9ng trong y\u00eau c\u1ea7u thanh to\u00e1n nh\u00e0 cung c\u1ea5p');
    const supplierIds = Array.from(new Set(items.map((item) => item.supplierId)));
    const costIds = items.map((item) => item.costId);
    const [suppliers, costs] = await Promise.all([
      this.prisma.supplier.findMany({ where: { id: { in: supplierIds }, deletedAt: null }, select: { id: true } }),
      this.prisma.operationCost.findMany({
        where: { id: { in: costIds } },
        include: {
          service: { select: { supplierId: true } },
          operationForm: { include: { services: { select: { supplierId: true } } } },
          paymentItems: { include: { request: { select: { id: true, status: true } } } },
        },
      }),
    ]);
    if (suppliers.length !== supplierIds.length) throw new NotFoundException('Không tìm thấy nhà cung cấp');
    if (costs.length !== costIds.length) throw new NotFoundException('Không tìm thấy chi phí điều hành');
    const costById = new Map(costs.map((cost) => [cost.id, cost]));
    for (const item of items) {
      const cost = costById.get(item.costId);
      if (!cost) throw new NotFoundException('Không tìm thấy chi phí điều hành');
      if (cost.operationForm.status === OperationStatus.CANCELLED) throw new BadRequestException('Kh\u00f4ng th\u1ec3 y\u00eau c\u1ea7u thanh to\u00e1n cho phi\u1ebfu \u0111i\u1ec1u h\u00e0nh \u0111\u00e3 h\u1ee7y');
      const payableAmount = Number(cost.actualAmount) > 0 ? Number(cost.actualAmount) : Number(cost.expectedAmount);
      if (payableAmount > 0 && item.amount > payableAmount) throw new BadRequestException('Số tiền thanh toán không được vượt quá số tiền chi phí điều hành');
      if (cost.service?.supplierId && cost.service.supplierId !== item.supplierId) throw new BadRequestException('Nhà cung cấp thanh toán không khớp với nhà cung cấp của dịch vụ điều hành');
      const formSupplierIds = new Set(cost.operationForm.services.map((service) => service.supplierId).filter((id): id is string => Boolean(id)));
      if (!cost.service?.supplierId && formSupplierIds.size && !formSupplierIds.has(item.supplierId)) {
        throw new BadRequestException('Nhà cung cấp thanh toán chưa được liên kết với phiếu điều hành');
      }
      const activeDuplicate = cost.paymentItems.find((paymentItem) => paymentItem.requestId !== currentRequestId && paymentItem.request.status !== SupplierPaymentStatus.REJECTED);
      if (activeDuplicate) throw new BadRequestException('Chi phí điều hành đã có yêu cầu thanh toán nhà cung cấp');
    }
  }

  private formServices(dto: AnyRecord): ParsedOperationService[] {
    return this.array(dto.services).map((raw) => {
      const item = this.record(raw);
      return {
        itineraryDayId: this.text(item.itineraryDayId),
        supplierId: this.requiredText(item.supplierId, 'Cần chọn nhà cung cấp'),
        supplierServiceId: this.requiredText(item.supplierServiceId, 'Cần chọn dịch vụ nhà cung cấp'),
        serviceType: this.requiredText(item.serviceType, 'Cần nhập loại dịch vụ'),
        serviceName: this.requiredText(item.serviceName, 'Cần nhập tên dịch vụ điều hành'),
        confirmationStatus: this.operationConfirmationStatus(item.confirmationStatus),
        expectedCost: this.requiredNumber(item.expectedCost, 'Chi phí dự kiến phải lớn hơn 0', { positive: true }),
        actualCost: this.requiredNumber(item.actualCost, 'Chi phí thực tế phải lớn hơn hoặc bằng 0', { min: 0 }),
        notes: this.text(item.notes),
      };
    });
  }

  private formTasks(dto: AnyRecord): ParsedOperationTask[] {
    return this.array(dto.tasks).map((raw) => {
      const item = this.record(raw);
      return {
        title: this.requiredText(item.title, 'Cần nhập tiêu đề công việc'),
        assignee: this.text(item.assignee),
        dueDate: this.date(item.dueDate, 'H\u1ea1n c\u00f4ng vi\u1ec7c kh\u00f4ng h\u1ee3p l\u1ec7'),
        status: this.operationStatus(item.status, OperationStatus.PENDING, 'công việc điều hành'),
        notes: this.text(item.notes),
      };
    });
  }

  private formCosts(dto: AnyRecord): ParsedOperationCost[] {
    return this.array(dto.costs).map((raw) => {
      const item = this.record(raw);
      return {
        serviceId: this.text(item.serviceId),
        costName: this.requiredText(item.costName, 'Cần nhập tên chi phí'),
        expectedAmount: this.requiredNumber(item.expectedAmount, 'Số tiền dự kiến phải lớn hơn 0', { positive: true }),
        actualAmount: this.requiredNumber(item.actualAmount, 'Số tiền thực tế phải lớn hơn hoặc bằng 0', { min: 0 }),
        currency: this.text(item.currency) || 'VND',
        invoiceNo: this.text(item.invoiceNo),
        notes: this.text(item.notes),
      };
    });
  }

  private paymentItems(dto: AnyRecord): ParsedPaymentItem[] {
    return this.array(dto.items).map((raw) => {
      const item = this.record(raw);
      return {
        supplierId: this.requiredText(item.supplierId, 'Cần chọn nhà cung cấp'),
        costId: this.requiredText(item.costId, 'Cần chọn chi phí'),
        amount: this.requiredNumber(item.amount, 'Số tiền thanh toán phải lớn hơn 0', { positive: true }),
        notes: this.text(item.notes),
      };
    });
  }

  private formScopeWhere(where: Prisma.OperationFormWhereInput, user?: RequestUser): Prisma.OperationFormWhereInput {
    if (!user || hasUnrestrictedDataScope(user)) return where;
    const permissions = userPermissions(user);
    if (this.hasMissingReadScopeValue(permissions, user)) return { AND: [where, { id: '__no_data_scope__' }] };
    const AND: Prisma.OperationFormWhereInput[] = [where];
    if (permissions.has('data.scope.branch') && user.branch) AND.push(this.operationFormBranchScope(user.branch));
    if (permissions.has('data.scope.department') && user.department) AND.push(this.operationFormDepartmentScope(user.department));
    if (AND.length === 1) return { AND: [where, { id: '__no_data_scope__' }] };
    return { AND };
  }

  private paymentRequestScopeWhere(where: Prisma.SupplierPaymentRequestWhereInput, user?: RequestUser): Prisma.SupplierPaymentRequestWhereInput {
    if (!user || hasUnrestrictedDataScope(user)) return where;
    const permissions = userPermissions(user);
    if (this.hasMissingReadScopeValue(permissions, user)) return { AND: [where, { id: '__no_data_scope__' }] };
    const financeScope: Prisma.FinancePaymentWhereInput = {};
    const formScope: Prisma.OperationFormWhereInput = {};
    let hasScope = false;
    if (permissions.has('data.scope.branch') && user.branch) {
      financeScope.branch = user.branch;
      Object.assign(formScope, { AND: [...(Array.isArray(formScope.AND) ? formScope.AND : []), this.operationFormBranchScope(user.branch)] });
      hasScope = true;
    }
    if (permissions.has('data.scope.department') && user.department) {
      financeScope.department = user.department;
      Object.assign(formScope, { AND: [...(Array.isArray(formScope.AND) ? formScope.AND : []), this.operationFormDepartmentScope(user.department)] });
      hasScope = true;
    }
    if (!hasScope) return { AND: [where, { id: '__no_data_scope__' }] };
    return { AND: [where, { OR: [{ financePayment: financeScope }, { items: { some: { cost: { operationForm: formScope } } } }] }] };
  }

  private activeOperationFormScope(user?: RequestUser) {
    return this.formScopeWhere({ status: { notIn: [OperationStatus.DONE, OperationStatus.CANCELLED] } }, user);
  }

  private startOfDay(date: Date) {
    const next = new Date(date);
    next.setHours(0, 0, 0, 0);
    return next;
  }

  private endOfDay(date: Date) {
    const next = new Date(date);
    next.setHours(23, 59, 59, 999);
    return next;
  }

  private addDays(date: Date, days: number) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  private bookingScopeWhere(where: Prisma.BookingWhereInput, user?: RequestUser): Prisma.BookingWhereInput {
    if (!user || hasUnrestrictedDataScope(user)) return where;
    const permissions = userPermissions(user);
    if (this.hasMissingReadScopeValue(permissions, user)) return { AND: [where, { id: '__no_data_scope__' }] };
    const AND: Prisma.BookingWhereInput[] = [where];
    if (permissions.has('data.scope.branch') && user.branch) AND.push({ OR: [{ customer: { branch: user.branch } }, { order: { branch: user.branch } }, { tour: { branch: user.branch } }] });
    if (permissions.has('data.scope.department') && user.department) AND.push({ OR: [{ customer: { department: user.department } }, { order: { department: user.department } }, { tour: { department: user.department } }] });
    if (AND.length === 1) return { AND: [where, { id: '__no_data_scope__' }] };
    return { AND };
  }

  private orderScopeWhere(where: Prisma.OrderWhereInput, user?: RequestUser): Prisma.OrderWhereInput {
    if (!user || hasUnrestrictedDataScope(user)) return where;
    const permissions = userPermissions(user);
    if (this.hasMissingReadScopeValue(permissions, user)) return { AND: [where, { id: '__no_data_scope__' }] };
    const AND: Prisma.OrderWhereInput[] = [where];
    if (permissions.has('data.scope.branch') && user.branch) AND.push({ branch: user.branch });
    if (permissions.has('data.scope.department') && user.department) AND.push({ department: user.department });
    if (AND.length === 1) return { AND: [where, { id: '__no_data_scope__' }] };
    return { AND };
  }

  private tourScopeWhere(where: Prisma.TourWhereInput, user?: RequestUser): Prisma.TourWhereInput {
    if (!user || hasUnrestrictedDataScope(user)) return where;
    const permissions = userPermissions(user);
    if (this.hasMissingReadScopeValue(permissions, user)) return { AND: [where, { id: '__no_data_scope__' }] };
    const AND: Prisma.TourWhereInput[] = [where];
    if (permissions.has('data.scope.branch') && user.branch) AND.push({ branch: user.branch });
    if (permissions.has('data.scope.department') && user.department) AND.push({ department: user.department });
    if (AND.length === 1) return { AND: [where, { id: '__no_data_scope__' }] };
    return { AND };
  }

  private operationFormBranchScope(branch: string): Prisma.OperationFormWhereInput {
    return { OR: [{ booking: { customer: { branch } } }, { order: { branch } }, { tour: { branch } }] };
  }

  private operationFormDepartmentScope(department: string): Prisma.OperationFormWhereInput {
    return { OR: [{ booking: { customer: { department } } }, { order: { department } }, { tour: { department } }] };
  }

  private hasMissingReadScopeValue(permissions: Set<string>, user: RequestUser) {
    return (permissions.has('data.scope.branch') && !user.branch) || (permissions.has('data.scope.department') && !user.department);
  }

  private async ensureLinksScoped(links: { bookingId?: string | null; orderId?: string | null; tourId?: string | null }, user?: RequestUser) {
    if (!user || hasUnrestrictedDataScope(user)) return;
    this.assertScopedWriteUser(user);
    const [booking, order, tour] = await Promise.all([
      links.bookingId ? this.prisma.booking.findFirst({ where: this.bookingScopeWhere({ id: links.bookingId }, user), select: { id: true } }) : Promise.resolve(null),
      links.orderId ? this.prisma.order.findFirst({ where: this.orderScopeWhere({ id: links.orderId }, user), select: { id: true } }) : Promise.resolve(null),
      links.tourId ? this.prisma.tour.findFirst({ where: this.tourScopeWhere({ id: links.tourId }, user), select: { id: true } }) : Promise.resolve(null),
    ]);
    if (links.bookingId && !booking) throw new NotFoundException('Không tìm thấy booking');
    if (links.orderId && !order) throw new NotFoundException('Không tìm thấy đơn hàng');
    if (links.tourId && !tour) throw new NotFoundException('Không tìm thấy tour');
  }

  private async paymentRequestCodeBranch(items: ParsedPaymentItem[], dto: AnyRecord, user?: RequestUser) {
    const explicitBranch = this.text(dto.branch);
    if (user && !hasUnrestrictedDataScope(user)) {
      this.assertScopedWriteUser(user);
      const permissions = userPermissions(user);
      if (permissions.has('data.scope.branch')) return user.branch ?? null;
    }
    const scope = await this.paymentItemsScope(items);
    return explicitBranch || scope.branch;
  }

  private async paymentItemsScope(items: Array<{ costId: string }>): Promise<ScopeMeta> {
    const costIds = Array.from(new Set(items.map((item) => item.costId)));
    if (!costIds.length) return { branch: null, department: null };
    const costs = await this.prisma.operationCost.findMany({
      where: { id: { in: costIds } },
      include: { operationForm: { include: { booking: { include: { customer: true } }, order: true, tour: true } } },
    });
    return this.commonOperationFormScope(costs.map((cost) => cost.operationForm));
  }

  private async ensurePaymentItemsScoped(items: Array<{ costId: string }>, user?: RequestUser) {
    if (!user || hasUnrestrictedDataScope(user)) return;
    this.assertScopedWriteUser(user);
    const costIds = Array.from(new Set(items.map((item) => item.costId)));
    const count = await this.prisma.operationCost.count({ where: { id: { in: costIds }, operationForm: this.formScopeWhere({}, user) } });
    if (count !== costIds.length) throw new NotFoundException('Không tìm thấy chi phí điều hành');
  }

  private assertScopedWriteUser(user: RequestUser) {
    const permissions = userPermissions(user);
    if (permissions.has('data.scope.branch') && !user.branch) throw new BadRequestException('Cần có chi nhánh của người dùng để ghi dữ liệu theo phạm vi chi nhánh');
    if (permissions.has('data.scope.department') && !user.department) throw new BadRequestException('Cần có phòng ban của người dùng để ghi dữ liệu theo phạm vi phòng ban');
    if (!permissions.has('data.scope.branch') && !permissions.has('data.scope.department')) throw new BadRequestException('Cần cấu hình phạm vi dữ liệu của người dùng để ghi dữ liệu theo phạm vi');
  }

  private applyScopedWriteMeta(meta: ScopeMeta, user?: RequestUser): ScopeMeta {
    if (!user || hasUnrestrictedDataScope(user)) return meta;
    this.assertScopedWriteUser(user);
    const permissions = userPermissions(user);
    const scoped = { ...meta };
    if (permissions.has('data.scope.branch')) {
      if (scoped.branch && scoped.branch !== user.branch) throw new BadRequestException('Kh\u00f4ng th\u1ec3 t\u1ea1o phi\u1ebfu chi t\u00e0i ch\u00ednh ngo\u00e0i chi nh\u00e1nh c\u1ee7a b\u1ea1n');
      scoped.branch = user.branch;
    }
    if (permissions.has('data.scope.department')) {
      if (scoped.department && scoped.department !== user.department) throw new BadRequestException('Kh\u00f4ng th\u1ec3 t\u1ea1o phi\u1ebfu chi t\u00e0i ch\u00ednh ngo\u00e0i ph\u00f2ng ban c\u1ee7a b\u1ea1n');
      scoped.department = user.department;
    }
    return scoped;
  }

  private commonOperationFormScope(forms: LinkedOperationForm[]): ScopeMeta {
    const branches = Array.from(new Set(forms.map((form) => this.operationFormBranch(form)).filter((value): value is string => Boolean(value))));
    const departments = Array.from(new Set(forms.map((form) => this.operationFormDepartment(form)).filter((value): value is string => Boolean(value))));
    return {
      branch: branches.length === 1 ? branches[0] : null,
      department: departments.length === 1 ? departments[0] : null,
    };
  }

  private operationFormBranch(form: LinkedOperationForm) {
    return form.order?.branch || form.tour?.branch || form.booking?.customer?.branch || null;
  }

  private operationFormDepartment(form: LinkedOperationForm) {
    return form.order?.department || form.tour?.department || form.booking?.customer?.department || null;
  }

  private userActor(user?: RequestUser) {
    return user?.username || user?.email || user?.name || user?.id || 'operation';
  }

  private assertSupplierPaymentTransition(current: SupplierPaymentStatus, next: SupplierPaymentStatus) {
    if (next === SupplierPaymentStatus.REQUESTED && (current === SupplierPaymentStatus.DRAFT || current === SupplierPaymentStatus.REJECTED)) return;
    if (next === SupplierPaymentStatus.REJECTED && current === SupplierPaymentStatus.REQUESTED) return;
    throw new BadRequestException(`Kh\u00f4ng th\u1ec3 chuy\u1ec3n y\u00eau c\u1ea7u thanh to\u00e1n nh\u00e0 cung c\u1ea5p t\u1eeb ${current} sang ${next}`);
  }

  private formListSelect() {
    return {
      id: true,
      bookingId: true,
      orderId: true,
      tourId: true,
      status: true,
      notes: true,
      createdAt: true,
      updatedAt: true,
      booking: { select: { id: true, code: true, customerName: true, orderId: true, tourId: true } },
      order: { select: { id: true, systemCode: true, tourCode: true, name: true } },
      tour: { select: { id: true, systemCode: true, tourCode: true, name: true } },
      _count: { select: { services: true, tasks: true, costs: true } },
      services: {
        take: OPERATIONS_LIST_CHILD_TAKE,
        select: {
          id: true,
          supplierId: true,
          supplierServiceId: true,
          serviceType: true,
          serviceName: true,
          confirmationStatus: true,
          expectedCost: true,
          actualCost: true,
          supplier: { select: { id: true, supplierCode: true, name: true } },
          supplierService: { select: { id: true, sku: true, serviceName: true } },
        },
        orderBy: { serviceName: 'asc' },
      },
      tasks: { take: OPERATIONS_LIST_CHILD_TAKE, select: { id: true, title: true, assignee: true, dueDate: true, status: true }, orderBy: [{ dueDate: 'asc' }, { title: 'asc' }] },
      costs: { take: OPERATIONS_LIST_CHILD_TAKE, select: { id: true, serviceId: true, costName: true, expectedAmount: true, actualAmount: true, currency: true, notes: true }, orderBy: { costName: 'asc' } },
    } satisfies Prisma.OperationFormSelect;
  }

  private formDetailInclude() {
    return {
      booking: { select: { id: true, code: true, customerName: true, customerPhone: true, orderId: true, tourId: true, startDate: true, endDate: true, status: true } },
      order: { select: { id: true, systemCode: true, tourCode: true, name: true, status: true, branch: true, department: true } },
      tour: { select: { id: true, systemCode: true, tourCode: true, name: true, status: true, branch: true, department: true } },
      services: {
        include: {
          supplier: { select: { id: true, supplierCode: true, name: true, phone: true, email: true } },
          supplierService: { select: { id: true, sku: true, serviceName: true, netPrice: true, sellingPrice: true } },
        },
        orderBy: { serviceName: 'asc' },
      },
      tasks: { orderBy: [{ dueDate: 'asc' }, { title: 'asc' }] },
      costs: {
        include: {
          service: { select: { id: true, serviceName: true, serviceType: true, supplierId: true } },
          paymentItems: { select: { id: true, requestId: true, amount: true, notes: true } },
        },
        orderBy: { costName: 'asc' },
      },
    } satisfies Prisma.OperationFormInclude;
  }

  private paymentRequestListSelect() {
    return {
      id: true,
      code: true,
      status: true,
      requestedBy: true,
      approvedBy: true,
      requestedAt: true,
      financePaymentId: true,
      financePayment: { select: { id: true, voucherCode: true, approvalStatus: true, paymentAmount: true } },
      _count: { select: { items: true } },
      items: {
        take: OPERATIONS_LIST_CHILD_TAKE,
        select: {
          id: true,
          supplierId: true,
          costId: true,
          amount: true,
          notes: true,
          supplier: { select: { id: true, supplierCode: true, name: true } },
          cost: {
            select: {
              id: true,
              costName: true,
              operationForm: { select: { id: true, booking: { select: { id: true, code: true } } } },
            },
          },
        },
        orderBy: { id: 'asc' },
      },
    } satisfies Prisma.SupplierPaymentRequestSelect;
  }

  private paymentRequestDetailInclude() {
    return {
      financePayment: { select: { id: true, voucherCode: true, approvalStatus: true, paymentAmount: true, paymentDate: true, paymentMethod: true } },
      items: {
        include: {
          supplier: { select: { id: true, supplierCode: true, name: true, phone: true, email: true } },
          cost: {
            include: {
              operationForm: {
                include: {
                  booking: { select: { id: true, code: true, customerName: true } },
                  order: { select: { id: true, systemCode: true, tourCode: true, name: true, branch: true, department: true } },
                  tour: { select: { id: true, systemCode: true, tourCode: true, name: true, branch: true, department: true } },
                },
              },
            },
          },
        },
        orderBy: { id: 'asc' },
      },
    } satisfies Prisma.SupplierPaymentRequestInclude;
  }

  private async nextAvailableOperationTourCode(tx: Prisma.TransactionClient, date: Date | null) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const code = await this.nextCode(tx, 'OPERATION_TOUR', 'OPT', date, null);
      const existing = await tx.tour.findUnique({ where: { systemCode: code }, select: { id: true } });
      if (!existing) return code;
    }
    throw new ConflictException('Kh\u00f4ng th\u1ec3 sinh m\u00e3 tour v\u1eadn h\u00e0nh duy nh\u1ea5t');
  }

  private async nextAvailableFinancePaymentCode(tx: Prisma.TransactionClient, date: Date | null) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const code = await this.nextCode(tx, 'FINANCE_PAYMENT', 'PC', date, null);
      const existing = await tx.financePayment.findUnique({ where: { voucherCode: code }, select: { id: true } });
      if (!existing) return code;
    }
    throw new ConflictException('Kh\u00f4ng th\u1ec3 sinh m\u00e3 phi\u1ebfu chi duy nh\u1ea5t');
  }

  private async nextAvailablePaymentRequestCode(tx: Prisma.TransactionClient, date: Date | null, branch?: string | null) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const code = await this.nextCode(tx, 'SUPPLIER_PAYMENT_REQUEST', 'YCTT', date, branch);
      const existing = await tx.supplierPaymentRequest.findUnique({ where: { code }, select: { id: true } });
      if (!existing) return code;
    }
    throw new ConflictException('Kh\u00f4ng th\u1ec3 sinh m\u00e3 y\u00eau c\u1ea7u thanh to\u00e1n duy nh\u1ea5t');
  }

  private async nextCode(tx: Prisma.TransactionClient, scope: string, prefix: string, date: Date | null, branch?: string | null) {
    const base = date ?? new Date();
    const year = base.getFullYear();
    const month = base.getMonth() + 1;
    const rows = await tx.$queryRawUnsafe<{ currentNo: number; padding: number }[]>(
      `INSERT INTO "CodeSequence" ("id","scope","prefix","year","month","branch","currentNo","padding","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,1,6,NOW())
       ON CONFLICT ("scope","prefix","year",(COALESCE("month",0)),(COALESCE("branch",'')))
       DO UPDATE SET "currentNo" = "CodeSequence"."currentNo" + 1, "updatedAt" = NOW()
       RETURNING "currentNo", "padding"`,
      randomUUID(),
      scope,
      prefix,
      year,
      month,
      branch ?? null,
    );
    const seq = rows[0] ?? { currentNo: 1, padding: 6 };
    return `${prefix}-${year}${String(month).padStart(2, '0')}-${String(seq.currentNo).padStart(seq.padding, '0')}`;
  }

  private async audit(tx: Prisma.TransactionClient, action: string, entity: string, entityId: string, metadata?: unknown) {
    const safeMetadata = this.auditMetadata(metadata);
    await tx.auditLog.create({
      data: {
        action,
        entity,
        entityId,
        ...(safeMetadata === undefined ? {} : { metadata: safeMetadata }),
      },
    });
  }

  private auditMetadata(metadata: unknown): Prisma.InputJsonValue | undefined {
    if (metadata === undefined) return undefined;
    return this.toAuditJson(metadata) as Prisma.InputJsonValue;
  }

  private toAuditJson(value: unknown): unknown {
    if (value === undefined) return null;
    if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return value.map((item) => this.toAuditJson(item));
    if (typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .filter(([, item]) => item !== undefined)
          .map(([key, item]) => [key, this.toAuditJson(item)]),
      );
    }
    return String(value);
  }

  private array(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
  }

  private record(value: unknown): AnyRecord {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as AnyRecord) : {};
  }

  private text(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private requiredText(value: unknown, message: string) {
    const text = this.text(value);
    if (!text) throw new BadRequestException(message);
    return text;
  }

  private requiredNumber(value: unknown, message: string, options: { positive?: boolean; min?: number } = {}) {
    if (value === null || value === undefined || value === '') throw new BadRequestException(message);
    const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : Number.NaN;
    if (!Number.isFinite(number)) throw new BadRequestException(message);
    if (options.positive && number <= 0) throw new BadRequestException(message);
    if (options.min !== undefined && number < options.min) throw new BadRequestException(message);
    return number;
  }

  private operationActor(dto: AnyRecord) {
    return this.text(dto.actor) || this.text(dto.requestedBy) || this.text(dto.approvedBy) || 'operation';
  }

  private operationConfirmationStatus(value: unknown) {
    const text = this.text(value)?.toUpperCase() || 'WAITING';
    if (OPERATION_CONFIRMATION_STATUSES.has(text)) return text;
    throw new BadRequestException('Tr\u1ea1ng th\u00e1i x\u00e1c nh\u1eadn d\u1ecbch v\u1ee5 kh\u00f4ng h\u1ee3p l\u1ec7: ' + text);
  }

  private financePaymentMethod(value: unknown) {
    const text = this.text(value)?.toUpperCase() || FinancePaymentMethod.BANK_TRANSFER;
    if (Object.values(FinancePaymentMethod).includes(text as FinancePaymentMethod)) return text as FinancePaymentMethod;
    throw new BadRequestException('Ph\u01b0\u01a1ng th\u1ee9c thanh to\u00e1n kh\u00f4ng h\u1ee3p l\u1ec7: ' + text);
  }

  private operationStatus(value: unknown, fallback: OperationStatus, label = 'phiếu điều hành') {
    const text = this.text(value);
    if (!text) return fallback;
    if (Object.values(OperationStatus).includes(text as OperationStatus)) return text as OperationStatus;
    throw new BadRequestException(`Trạng thái ${label} không hợp lệ: ${text}`);
  }

  private supplierPaymentStatus(value: unknown, fallback: SupplierPaymentStatus) {
    const text = this.text(value);
    if (!text) return fallback;
    if (Object.values(SupplierPaymentStatus).includes(text as SupplierPaymentStatus)) return text as SupplierPaymentStatus;
    throw new BadRequestException(`Tr\u1ea1ng th\u00e1i y\u00eau c\u1ea7u thanh to\u00e1n nh\u00e0 cung c\u1ea5p kh\u00f4ng h\u1ee3p l\u1ec7: ${text}`);
  }

  private date(value: unknown, message = 'Ng\u00e0y kh\u00f4ng h\u1ee3p l\u1ec7') {
    if (!value) return null;
    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) throw new BadRequestException(message);
      return value;
    }
    if (typeof value === 'string' || typeof value === 'number') {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) throw new BadRequestException(message);
      return date;
    }
    throw new BadRequestException(message);
  }

  private take(value?: unknown) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, OPERATIONS_LIST_MAX_TAKE) : 100;
  }
}

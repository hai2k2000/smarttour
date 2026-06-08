import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { OperationStatus, Prisma, SupplierPaymentStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { hasUnrestrictedDataScope, RequestUser, userPermissions } from '../auth/data-scope';

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

@Injectable()
export class OperationsService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(user?: RequestUser) {
    const now = new Date();
    const next14 = new Date(now);
    next14.setDate(next14.getDate() + 14);
    const activeFormScope = this.formScopeWhere({ status: { notIn: [OperationStatus.DONE, OperationStatus.CANCELLED] } }, user);
    const [upcomingDepartures, operatingTours, overdueTasks, waitingSupplierConfirmations, pendingSupplierPayments, lowMarginTours] = await Promise.all([
      this.prisma.order.count({ where: this.orderScopeWhere({ deletedAt: null, startDate: { gte: now, lte: next14 }, status: { in: ['UPCOMING', 'RUNNING'] as never[] } }, user) }),
      this.prisma.tour.count({ where: this.tourScopeWhere({ status: { in: ['RUNNING'] as never[] } }, user) }),
      this.prisma.operationTask.count({ where: { dueDate: { lt: now }, status: { notIn: [OperationStatus.DONE, OperationStatus.CANCELLED] }, operationForm: activeFormScope } }),
      this.prisma.operationService.count({ where: { confirmationStatus: { in: ['WAITING', 'REQUESTED'] }, operationForm: activeFormScope } }),
      this.prisma.supplierPaymentRequest.count({ where: this.paymentRequestScopeWhere({ status: { in: [SupplierPaymentStatus.REQUESTED, SupplierPaymentStatus.APPROVED] } }, user) }),
      this.prisma.order.count({ where: this.orderScopeWhere({ deletedAt: null, totalRevenue: { gt: 0 }, profit: { lt: 0 } }, user) }),
    ]);
    return { upcomingDepartures, operatingTours, overdueTasks, waitingSupplierConfirmations, pendingSupplierPayments, lowMarginTours };
  }

  getModules() {
    return ['suppliers', 'tour-programs', 'bookings', 'operation-forms', 'operation-services', 'operation-costs', 'supplier-payment-requests', 'profit-loss-reports'];
  }

  async listForms(query: Record<string, string>, user?: RequestUser) {
    const search = this.text(query.search);
    return this.prisma.operationForm.findMany({
      where: this.formScopeWhere({
        ...(query.status ? { status: this.operationStatus(query.status, OperationStatus.PENDING) } : {}),
        ...(query.bookingId ? { bookingId: query.bookingId } : {}),
        ...(query.orderId ? { orderId: query.orderId } : {}),
        ...(query.tourId ? { tourId: query.tourId } : {}),
        ...(search
          ? {
              OR: [
                { booking: { code: { contains: search, mode: 'insensitive' } } },
                { order: { systemCode: { contains: search, mode: 'insensitive' } } },
                { tour: { tourCode: { contains: search, mode: 'insensitive' } } },
                { notes: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      }, user),
      include: this.formInclude(),
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      take: this.take(query.take),
    });
  }

  async formDetail(id: string, user?: RequestUser) {
    const row = await this.prisma.operationForm.findFirst({ where: this.formScopeWhere({ id }, user), include: this.formInclude() });
    if (!row) throw new NotFoundException('Không tìm thấy phiếu điều hành');
    return row;
  }

  async createForm(dto: AnyRecord = {}, user?: RequestUser) {
    const bookingId = this.requiredText(dto.bookingId, 'Cần chọn booking');
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
        await this.audit(tx, 'CREATE', 'OperationForm', form.id, dto);
        return tx.operationForm.findUniqueOrThrow({ where: { id: form.id }, include: this.formInclude() });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Booking đã có phiếu điều hành');
      throw error;
    }
  }

  async updateForm(id: string, dto: AnyRecord = {}, user?: RequestUser) {
    const current = await this.formDetail(id, user);
    const bookingId = this.text(dto.bookingId) ?? current.bookingId;
    const links = await this.resolveBookingOrderTour({
      bookingId,
      orderId: dto.orderId !== undefined ? this.text(dto.orderId) : current.orderId,
      tourId: dto.tourId !== undefined ? this.text(dto.tourId) : current.tourId,
    });
    await this.ensureLinksScoped({ bookingId, orderId: links.orderId, tourId: links.tourId }, user);
    await this.validateFormPayload(dto, 'update');
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
      await this.audit(tx, 'UPDATE', 'OperationForm', id, dto);
      return tx.operationForm.findUniqueOrThrow({ where: { id }, include: this.formInclude() });
    });
  }

  async cancelForm(id: string, dto: AnyRecord = {}, user?: RequestUser) {
    const current = await this.formDetail(id, user);
    if (current.status === OperationStatus.CANCELLED) return current;
    if (current.status === OperationStatus.DONE) throw new BadRequestException('Phiếu điều hành đã hoàn tất không thể hủy');
    await this.ensureFormCanBeCancelled(id);
    return this.prisma.$transaction(async (tx) => {
      const form = await tx.operationForm.update({
        where: { id },
        data: { status: OperationStatus.CANCELLED, notes: this.text(dto.reason) ?? this.text(dto.notes) ?? undefined },
        include: this.formInclude(),
      });
      await this.audit(tx, 'CANCEL', 'OperationForm', id, dto);
      return form;
    });
  }

  async listPaymentRequests(query: Record<string, string>, user?: RequestUser) {
    return this.prisma.supplierPaymentRequest.findMany({
      where: this.paymentRequestScopeWhere({
        ...(query.status ? { status: this.supplierPaymentStatus(query.status, SupplierPaymentStatus.DRAFT) } : {}),
        ...(query.supplierId ? { items: { some: { supplierId: query.supplierId } } } : {}),
        ...(query.financePaymentId ? { financePaymentId: query.financePaymentId } : {}),
        ...(query.search ? { code: { contains: query.search, mode: 'insensitive' } } : {}),
      }, user),
      include: this.paymentRequestInclude(),
      orderBy: [{ requestedAt: 'desc' }, { code: 'asc' }],
      take: this.take(query.take),
    });
  }

  async paymentRequestDetail(id: string, user?: RequestUser) {
    const row = await this.prisma.supplierPaymentRequest.findFirst({ where: this.paymentRequestScopeWhere({ id }, user), include: this.paymentRequestInclude() });
    if (!row) throw new NotFoundException('Không tìm thấy yêu cầu thanh toán nhà cung cấp');
    return row;
  }

  async createPaymentRequest(dto: AnyRecord = {}, user?: RequestUser) {
    const status = this.supplierPaymentStatus(dto.status, SupplierPaymentStatus.DRAFT);
    if (status !== SupplierPaymentStatus.DRAFT) throw new BadRequestException('Yêu cầu thanh toán nhà cung cấp phải được tạo ở trạng thái nháp');
    const items = this.paymentItems(dto);
    if (!items.length) throw new BadRequestException('Cần ít nhất một dòng thanh toán nhà cung cấp');
    await this.validatePaymentItems(items);
    await this.ensurePaymentItemsScoped(items, user);
    return this.prisma.$transaction(async (tx) => {
      const code = this.text(dto.code) || (await this.nextCode(tx, 'SUPPLIER_PAYMENT_REQUEST', 'YCTT', new Date(), this.text(dto.branch)));
      const request = await tx.supplierPaymentRequest.create({
        data: {
          code,
          status,
          requestedBy: this.text(dto.requestedBy) || this.text(dto.actor),
          items: { create: items },
        },
        include: this.paymentRequestInclude(),
      });
      await this.audit(tx, 'CREATE', 'SupplierPaymentRequest', request.id, dto);
      return request;
    });
  }

  async updatePaymentRequest(id: string, dto: AnyRecord = {}, user?: RequestUser) {
    const current = await this.paymentRequestDetail(id, user);
    if (current.status !== SupplierPaymentStatus.DRAFT && current.status !== SupplierPaymentStatus.REJECTED) throw new BadRequestException('Chỉ yêu cầu ở trạng thái nháp hoặc bị từ chối mới được chỉnh sửa');
    const items = dto.items === undefined ? undefined : this.paymentItems(dto);
    if (dto.status !== undefined && this.supplierPaymentStatus(dto.status, current.status) !== current.status) {
      throw new BadRequestException('Use supplier payment request action endpoints to change status');
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
          ...(dto.requestedBy !== undefined || dto.actor !== undefined ? { requestedBy: this.text(dto.requestedBy) || this.text(dto.actor) } : {}),
          ...(items ? { items: { create: items } } : {}),
        },
        include: this.paymentRequestInclude(),
      });
      await this.audit(tx, 'UPDATE', 'SupplierPaymentRequest', id, dto);
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
      if (request.status !== SupplierPaymentStatus.REQUESTED) throw new BadRequestException('Chỉ yêu cầu đã gửi mới được duyệt');
      if (!request.items.length) throw new BadRequestException('Yêu cầu thanh toán nhà cung cấp chưa có dòng nào');
      const approved = await tx.supplierPaymentRequest.update({ where: { id }, data: { status: SupplierPaymentStatus.APPROVED, approvedBy: actor }, include: this.paymentRequestInclude() });
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
      if (request.financePaymentId) throw new BadRequestException('Yêu cầu thanh toán nhà cung cấp đã có phiếu chi tài chính');
      if (request.status !== SupplierPaymentStatus.APPROVED) throw new BadRequestException('Chỉ yêu cầu đã duyệt mới được tạo phiếu chi tài chính');
      if (!request.items.length || request.items.some((item) => !item.costId || !item.cost?.operationForm)) {
        throw new BadRequestException('Các dòng yêu cầu thanh toán nhà cung cấp phải liên kết với chi phí điều hành');
      }
      if (request.items.some((item) => item.cost?.operationForm.status === OperationStatus.CANCELLED)) {
        throw new BadRequestException('Cannot create finance payment for a cancelled operation form');
      }
      const total = request.items.reduce((sum, item) => sum + Number(item.amount), 0);
      if (total <= 0) throw new BadRequestException('Số tiền thanh toán phải lớn hơn 0');
      const supplierIds = Array.from(new Set(request.items.map((item) => item.supplierId)));
      const firstSupplier = request.items[0]?.supplier;
      const firstCostForm = request.items.find((item) => item.cost?.operationForm)?.cost?.operationForm;
      const operationForms = request.items.flatMap((item) => (item.cost?.operationForm ? [item.cost.operationForm] : []));
      const scope = this.commonOperationFormScope(operationForms);
      const paymentScope = this.applyScopedWriteMeta({ branch: this.text(dto.branch) || scope.branch, department: this.text(dto.department) || scope.department }, user);
      const payment = await tx.financePayment.create({
        data: {
          voucherCode: await this.nextCode(tx, 'FINANCE_PAYMENT', 'PC', new Date(), paymentScope.branch),
          voucherName: 'Chi NCC',
          voucherType: 'SUPPLIER_PAYMENT',
          paymentDate: this.date(dto.paymentDate),
          paymentMethod: (this.text(dto.paymentMethod) || 'BANK_TRANSFER') as never,
          supplierId: supplierIds.length === 1 ? supplierIds[0] : null,
          orderId: firstCostForm?.orderId ?? null,
          receiverName: supplierIds.length === 1 ? firstSupplier?.name : 'Multiple suppliers',
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
      const updated = await tx.supplierPaymentRequest.findUniqueOrThrow({ where: { id }, include: this.paymentRequestInclude() });
      await this.audit(tx, 'CREATE_FINANCE_PAYMENT', 'SupplierPaymentRequest', id, { actor, financePaymentId: payment.id });
      return updated;
    });
  }

  async deletePaymentRequest(id: string, user?: RequestUser) {
    const current = await this.paymentRequestDetail(id, user);
    if (current.status !== SupplierPaymentStatus.DRAFT && current.status !== SupplierPaymentStatus.REJECTED) throw new BadRequestException('Chỉ yêu cầu ở trạng thái nháp hoặc bị từ chối mới được xóa');
    if (current.financePaymentId) throw new BadRequestException('Không thể xóa yêu cầu thanh toán nhà cung cấp đã có phiếu chi tài chính');
    return this.prisma.$transaction(async (tx) => {
      await tx.supplierPaymentItem.deleteMany({ where: { requestId: id } });
      const deleted = await tx.supplierPaymentRequest.delete({ where: { id } });
      await this.audit(tx, 'DELETE', 'SupplierPaymentRequest', id);
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
        if (current.items.some((item) => item.cost?.operationForm.status === OperationStatus.CANCELLED)) throw new BadRequestException('Cannot submit payment request for a cancelled operation form');
      }
      const request = await tx.supplierPaymentRequest.update({
        where: { id },
        data: {
          status,
          ...(status === SupplierPaymentStatus.REQUESTED ? { requestedBy: actor, requestedAt: new Date() } : {}),
          ...(status === SupplierPaymentStatus.REJECTED ? { approvedBy: actor } : {}),
        },
        include: this.paymentRequestInclude(),
      });
      await this.audit(tx, status, 'SupplierPaymentRequest', id, { actor, note: this.text(dto.note) });
      return request;
    });
  }

  private async replaceFormChildren(tx: Prisma.TransactionClient, formId: string, dto: AnyRecord) {
    const replacesServices = dto.services !== undefined;
    const createdServices: Array<{ id: string }> = [];
    if (dto.costs !== undefined) {
      await tx.operationCost.deleteMany({ where: { operationFormId: formId } });
    }
    if (replacesServices) {
      const services = this.formServices(dto);
      await tx.operationService.deleteMany({ where: { operationFormId: formId } });
      for (const item of services) {
        createdServices.push(await tx.operationService.create({ data: { ...item, operationFormId: formId }, select: { id: true } }));
      }
    }
    if (dto.costs !== undefined) {
      const parsedCosts = this.formCosts(dto);
      const costs = replacesServices ? this.rebindCostsToCreatedServices(parsedCosts, createdServices) : parsedCosts;
      if (costs.length) await tx.operationCost.createMany({ data: costs.map((item) => ({ ...item, operationFormId: formId })) });
    }
    if (dto.tasks !== undefined) {
      const tasks = this.formTasks(dto);
      await tx.operationTask.deleteMany({ where: { operationFormId: formId } });
      if (tasks.length) await tx.operationTask.createMany({ data: tasks.map((item) => ({ ...item, operationFormId: formId })) });
    }
  }

  private async resolveBookingOrderTour(input: { bookingId: string; orderId?: string | null; tourId?: string | null }) {
    const booking = await this.prisma.booking.findUnique({ where: { id: input.bookingId }, select: { id: true, orderId: true, tourId: true } });
    if (!booking) throw new NotFoundException('Không tìm thấy booking');
    let orderId = input.orderId ?? booking.orderId;
    let tourId = input.tourId ?? booking.tourId;
    if (input.tourId && booking.tourId && input.tourId !== booking.tourId) throw new BadRequestException('tourId does not belong to booking');
    let tourOrderId: string | null = null;
    if (tourId) {
      const tour = await this.prisma.tour.findUnique({ where: { id: tourId }, select: { id: true, orderId: true } });
      if (!tour) throw new NotFoundException('Không tìm thấy tour');
      tourOrderId = tour.orderId;
      orderId = orderId ?? tour.orderId;
    }
    if (input.orderId && booking.orderId && input.orderId !== booking.orderId) throw new BadRequestException('orderId does not belong to booking');
    if (input.orderId && tourOrderId && input.orderId !== tourOrderId) throw new BadRequestException('orderId does not belong to tour');
    if (orderId) {
      const order = await this.prisma.order.findUnique({ where: { id: orderId }, select: { id: true } });
      if (!order) throw new NotFoundException('Không tìm thấy đơn hàng');
    }
    return { orderId, tourId };
  }

  private async validateFormPayload(dto: AnyRecord, mode: FormWriteMode) {
    const validateChild = async <T>(key: 'services' | 'tasks' | 'costs', rows: T[], validate?: (rows: T[]) => Promise<void>) => {
      if (mode === 'create' || dto[key] !== undefined) {
        if (!rows.length) throw new BadRequestException(`Cần ít nhất một ${key.slice(0, -1)} là bắt buộc`);
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
        throw new BadRequestException('Supplier service does not belong to supplier');
      }
    }
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
      if (linkedCost) throw new BadRequestException('Cannot replace operation services while costs are linked to services');
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
    if (blockingRequest) throw new BadRequestException('Cannot cancel operation form with active supplier payment requests');
  }

  private async validatePaymentItems(items: ParsedPaymentItem[], currentRequestId?: string) {
    const duplicateCostId = items.map((item) => item.costId).find((id, index, ids) => ids.indexOf(id) !== index);
    if (duplicateCostId) throw new BadRequestException('Duplicate operation cost in supplier payment request');
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
      if (cost.operationForm.status === OperationStatus.CANCELLED) throw new BadRequestException('Cannot request payment for a cancelled operation form');
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
        serviceName: this.requiredText(item.serviceName, 'Cần nhập tên dịch vụ'),
        confirmationStatus: this.text(item.confirmationStatus) || 'WAITING',
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
        title: this.requiredText(item.title, 'Cần nhập tiêu đề task'),
        assignee: this.text(item.assignee),
        dueDate: this.date(item.dueDate),
        status: this.operationStatus(item.status, OperationStatus.PENDING),
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
    const AND: Prisma.SupplierPaymentRequestWhereInput[] = [where];
    if (permissions.has('data.scope.branch') && user.branch) {
      AND.push({ OR: [{ financePayment: { branch: user.branch } }, { items: { some: { cost: { operationForm: this.operationFormBranchScope(user.branch) } } } }] });
    }
    if (permissions.has('data.scope.department') && user.department) {
      AND.push({ OR: [{ financePayment: { department: user.department } }, { items: { some: { cost: { operationForm: this.operationFormDepartmentScope(user.department) } } } }] });
    }
    if (AND.length === 1) return { AND: [where, { id: '__no_data_scope__' }] };
    return { AND };
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

  private async ensurePaymentItemsScoped(items: Array<{ costId: string }>, user?: RequestUser) {
    if (!user || hasUnrestrictedDataScope(user)) return;
    this.assertScopedWriteUser(user);
    const costIds = Array.from(new Set(items.map((item) => item.costId)));
    const count = await this.prisma.operationCost.count({ where: { id: { in: costIds }, operationForm: this.formScopeWhere({}, user) } });
    if (count !== costIds.length) throw new NotFoundException('Không tìm thấy chi phí điều hành');
  }

  private assertScopedWriteUser(user: RequestUser) {
    const permissions = userPermissions(user);
    if (permissions.has('data.scope.branch') && !user.branch) throw new BadRequestException('Cần có branch của user để ghi dữ liệu theo phạm vi branch');
    if (permissions.has('data.scope.department') && !user.department) throw new BadRequestException('Cần có department của user để ghi dữ liệu theo phạm vi phòng ban');
    if (!permissions.has('data.scope.branch') && !permissions.has('data.scope.department')) throw new BadRequestException('User data scope là bắt buộc for scoped writes');
  }

  private applyScopedWriteMeta(meta: ScopeMeta, user?: RequestUser): ScopeMeta {
    if (!user || hasUnrestrictedDataScope(user)) return meta;
    this.assertScopedWriteUser(user);
    const permissions = userPermissions(user);
    const scoped = { ...meta };
    if (permissions.has('data.scope.branch')) {
      if (scoped.branch && scoped.branch !== user.branch) throw new BadRequestException('Cannot write finance payment outside your branch');
      scoped.branch = user.branch;
    }
    if (permissions.has('data.scope.department')) {
      if (scoped.department && scoped.department !== user.department) throw new BadRequestException('Cannot write finance payment outside your department');
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

  private assertSupplierPaymentTransition(current: SupplierPaymentStatus, next: SupplierPaymentStatus) {
    if (next === SupplierPaymentStatus.REQUESTED && (current === SupplierPaymentStatus.DRAFT || current === SupplierPaymentStatus.REJECTED)) return;
    if (next === SupplierPaymentStatus.REJECTED && current === SupplierPaymentStatus.REQUESTED) return;
    throw new BadRequestException(`Cannot change supplier payment request from ${current} to ${next}`);
  }

  private formInclude() {
    return {
      booking: true,
      order: true,
      tour: true,
      services: { include: { supplier: true, supplierService: true }, orderBy: { serviceName: 'asc' } },
      tasks: { orderBy: [{ dueDate: 'asc' }, { title: 'asc' }] },
      costs: { include: { service: true, paymentItems: true }, orderBy: { costName: 'asc' } },
    } satisfies Prisma.OperationFormInclude;
  }

  private paymentRequestInclude() {
    return {
      financePayment: true,
      items: { include: { supplier: true, cost: { include: { operationForm: { include: { booking: true, order: true, tour: true } } } } }, orderBy: { id: 'asc' } },
    } satisfies Prisma.SupplierPaymentRequestInclude;
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
    await tx.auditLog.create({ data: { action, entity, entityId, metadata: metadata === undefined ? undefined : (metadata as Prisma.InputJsonValue) } });
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

  private operationStatus(value: unknown, fallback: OperationStatus) {
    const text = this.text(value);
    if (!text) return fallback;
    if (Object.values(OperationStatus).includes(text as OperationStatus)) return text as OperationStatus;
    throw new BadRequestException(`Invalid operation status: ${text}`);
  }

  private supplierPaymentStatus(value: unknown, fallback: SupplierPaymentStatus) {
    const text = this.text(value);
    if (!text) return fallback;
    if (Object.values(SupplierPaymentStatus).includes(text as SupplierPaymentStatus)) return text as SupplierPaymentStatus;
    throw new BadRequestException(`Invalid supplier payment status: ${text}`);
  }

  private date(value: unknown) {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value === 'string' || typeof value === 'number') {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    return null;
  }

  private take(value?: string) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 2000) : 100;
  }
}

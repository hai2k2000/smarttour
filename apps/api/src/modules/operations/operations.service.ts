import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SupplierPaymentStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { hasUnrestrictedDataScope, RequestUser, userPermissions } from '../auth/data-scope';

type AnyRecord = Record<string, unknown>;

@Injectable()
export class OperationsService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard() {
    const now = new Date();
    const next14 = new Date(now);
    next14.setDate(next14.getDate() + 14);
    const [upcomingDepartures, operatingTours, overdueTasks, waitingSupplierConfirmations, pendingSupplierPayments, lowMarginTours] = await Promise.all([
      this.prisma.order.count({ where: { deletedAt: null, startDate: { gte: now, lte: next14 }, status: { in: ['UPCOMING', 'RUNNING'] as never[] } } }),
      this.prisma.tour.count({ where: { status: { in: ['RUNNING'] as never[] } } }),
      this.prisma.operationTask.count({ where: { dueDate: { lt: now }, status: { notIn: ['DONE', 'CANCELLED'] as never[] } } }),
      this.prisma.operationService.count({ where: { confirmationStatus: { in: ['WAITING', 'PENDING'] } } }),
      this.prisma.supplierPaymentRequest.count({ where: { status: { in: ['REQUESTED', 'APPROVED'] } } }),
      this.prisma.order.count({ where: { deletedAt: null, totalRevenue: { gt: 0 }, profit: { lt: 0 } } }),
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
        ...(query.status ? { status: query.status as never } : {}),
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
    const bookingId = this.requiredText(dto.bookingId, 'bookingId is required');
    await this.ensureBookingScoped(bookingId, user);
    const links = await this.resolveBookingOrderTour({ bookingId, orderId: this.text(dto.orderId), tourId: this.text(dto.tourId) });
    try {
      return await this.prisma.$transaction(async (tx) => {
        const form = await tx.operationForm.create({
          data: {
            bookingId,
            orderId: links.orderId,
            tourId: links.tourId,
            status: (this.text(dto.status) || 'PENDING') as never,
            notes: this.text(dto.notes),
          },
        });
        await this.replaceFormChildren(tx, form.id, dto);
        await this.audit(tx, 'CREATE', 'OperationForm', form.id, dto);
        return tx.operationForm.findUniqueOrThrow({ where: { id: form.id }, include: this.formInclude() });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Booking này đã có phiếu điều hành');
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
    return this.prisma.$transaction(async (tx) => {
      await tx.operationForm.update({
        where: { id },
        data: {
          ...(dto.bookingId !== undefined ? { bookingId } : {}),
          ...(dto.orderId !== undefined || dto.bookingId !== undefined ? { orderId: links.orderId } : {}),
          ...(dto.tourId !== undefined || dto.bookingId !== undefined ? { tourId: links.tourId } : {}),
          ...(dto.status !== undefined ? { status: this.text(dto.status) as never } : {}),
          ...(dto.notes !== undefined ? { notes: this.text(dto.notes) } : {}),
        },
      });
      if (dto.services !== undefined || dto.tasks !== undefined || dto.costs !== undefined) await this.replaceFormChildren(tx, id, dto);
      await this.audit(tx, 'UPDATE', 'OperationForm', id, dto);
      return tx.operationForm.findUniqueOrThrow({ where: { id }, include: this.formInclude() });
    });
  }

  async cancelForm(id: string, dto: AnyRecord = {}, user?: RequestUser) {
    await this.formDetail(id, user);
    return this.prisma.$transaction(async (tx) => {
      const form = await tx.operationForm.update({ where: { id }, data: { status: 'CANCELLED', notes: this.text(dto.reason) ?? this.text(dto.notes) ?? undefined }, include: this.formInclude() });
      await this.audit(tx, 'CANCEL', 'OperationForm', id, dto);
      return form;
    });
  }

  async listPaymentRequests(query: Record<string, string>, user?: RequestUser) {
    return this.prisma.supplierPaymentRequest.findMany({
      where: this.paymentRequestScopeWhere({
        ...(query.status ? { status: query.status as never } : {}),
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
    if (!row) throw new NotFoundException('Không tìm thấy đề nghị thanh toán nhà cung cấp');
    return row;
  }

  async createPaymentRequest(dto: AnyRecord = {}, user?: RequestUser) {
    const items = this.paymentItems(dto);
    if (!items.length) throw new BadRequestException('At least one supplier payment item is required');
    await this.validatePaymentItems(items);
    await this.ensurePaymentItemsScoped(items, user);
    return this.prisma.$transaction(async (tx) => {
      const code = this.text(dto.code) || (await this.nextCode(tx, 'SUPPLIER_PAYMENT_REQUEST', 'YCTT', new Date(), this.text(dto.branch)));
      const request = await tx.supplierPaymentRequest.create({
        data: {
          code,
          status: (this.text(dto.status) || 'DRAFT') as never,
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
    if (!['DRAFT', 'REJECTED'].includes(current.status)) throw new BadRequestException('Only draft or rejected requests can be edited');
    const items = dto.items === undefined ? undefined : this.paymentItems(dto);
    if (items) {
      await this.validatePaymentItems(items);
      await this.ensurePaymentItemsScoped(items, user);
    }
    return this.prisma.$transaction(async (tx) => {
      if (items) {
        await tx.supplierPaymentItem.deleteMany({ where: { requestId: id } });
      }
      const request = await tx.supplierPaymentRequest.update({
        where: { id },
        data: {
          ...(dto.code !== undefined ? { code: this.requiredText(dto.code, 'code is required') } : {}),
          ...(dto.status !== undefined ? { status: this.text(dto.status) as never } : {}),
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
    return this.changePaymentRequestStatus(id, 'REQUESTED', dto, user);
  }

  async approvePaymentRequest(id: string, dto: AnyRecord = {}, user?: RequestUser) {
    await this.paymentRequestDetail(id, user);
    const actor = this.text(dto.actor) || this.text(dto.approvedBy) || 'operation';
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.supplierPaymentRequest.findUnique({ where: { id }, include: { items: true } });
      if (!request) throw new NotFoundException('Không tìm thấy đề nghị thanh toán nhà cung cấp');
      if (request.status === SupplierPaymentStatus.PAID) throw new BadRequestException('Đề nghị đã thanh toán không thể duyệt lại');
      const approved = await tx.supplierPaymentRequest.update({ where: { id }, data: { status: 'APPROVED', approvedBy: actor }, include: this.paymentRequestInclude() });
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
            description: item.notes || `Yeu cau thanh toan ${request.code}`,
            createdBy: actor,
          },
          update: {
            supplierId: item.supplierId,
            creditAmount: item.amount,
            documentCode: request.code,
            documentDate: request.requestedAt,
            description: item.notes || `Yeu cau thanh toan ${request.code}`,
          },
        });
      }
      await this.audit(tx, 'APPROVE', 'SupplierPaymentRequest', id, { actor, note: this.text(dto.note) });
      return approved;
    });
  }

  rejectPaymentRequest(id: string, dto: AnyRecord = {}, user?: RequestUser) {
    return this.changePaymentRequestStatus(id, 'REJECTED', dto, user);
  }

  async createFinancePaymentForRequest(id: string, dto: AnyRecord = {}, user?: RequestUser) {
    await this.paymentRequestDetail(id, user);
    const actor = this.text(dto.actor) || 'operation';
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.supplierPaymentRequest.findUnique({ where: { id }, include: { items: { include: { supplier: true, cost: { include: { operationForm: true } } } }, financePayment: true } });
      if (!request) throw new NotFoundException('Không tìm thấy đề nghị thanh toán nhà cung cấp');
      if (request.financePaymentId) return tx.supplierPaymentRequest.findUniqueOrThrow({ where: { id }, include: this.paymentRequestInclude() });
      if (request.status !== SupplierPaymentStatus.APPROVED) throw new BadRequestException('Chỉ đề nghị đã duyệt mới được tạo phiếu chi tài chính');
      const total = request.items.reduce((sum, item) => sum + Number(item.amount), 0);
      if (total <= 0) throw new BadRequestException('Payment amount must be greater than zero');
      const supplierIds = Array.from(new Set(request.items.map((item) => item.supplierId)));
      const firstSupplier = request.items[0]?.supplier;
      const firstCostForm = request.items.find((item) => item.cost?.operationForm)?.cost?.operationForm;
      const payment = await tx.financePayment.create({
        data: {
          voucherCode: await this.nextCode(tx, 'FINANCE_PAYMENT', 'PC', new Date(), this.text(dto.branch)),
          voucherName: `Chi NCC ${request.code}`,
          voucherType: 'SUPPLIER_PAYMENT',
          paymentDate: this.date(dto.paymentDate),
          paymentMethod: (this.text(dto.paymentMethod) || 'BANK_TRANSFER') as never,
          supplierId: supplierIds.length === 1 ? supplierIds[0] : null,
          orderId: firstCostForm?.orderId ?? null,
          receiverName: supplierIds.length === 1 ? firstSupplier?.name : 'Nhieu nha cung cap',
          reason: this.text(dto.reason) || `Thanh toan yeu cau ${request.code}`,
          totalAmount: total,
          paymentAmount: total,
          remainingAmount: 0,
          approvalStatus: 'PENDING',
          createdBy: actor,
        },
      });
      const updated = await tx.supplierPaymentRequest.update({ where: { id }, data: { status: 'PAID', financePaymentId: payment.id }, include: this.paymentRequestInclude() });
      await this.audit(tx, 'CREATE_FINANCE_PAYMENT', 'SupplierPaymentRequest', id, { actor, financePaymentId: payment.id });
      return updated;
    });
  }

  async deletePaymentRequest(id: string, user?: RequestUser) {
    const current = await this.paymentRequestDetail(id, user);
    if (!['DRAFT', 'REJECTED'].includes(current.status)) throw new BadRequestException('Only draft or rejected requests can be deleted');
    await this.prisma.supplierPaymentItem.deleteMany({ where: { requestId: id } });
    return this.prisma.supplierPaymentRequest.delete({ where: { id } });
  }

  private async changePaymentRequestStatus(id: string, status: SupplierPaymentStatus, dto: AnyRecord = {}, user?: RequestUser) {
    await this.paymentRequestDetail(id, user);
    const actor = this.text(dto.actor) || this.text(dto.approvedBy) || 'operation';
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.supplierPaymentRequest.findUnique({ where: { id } });
      if (!current) throw new NotFoundException('Không tìm thấy đề nghị thanh toán nhà cung cấp');
      if (current.status === SupplierPaymentStatus.PAID && status !== SupplierPaymentStatus.PAID) throw new BadRequestException('Không thể đổi trạng thái đề nghị đã thanh toán');
      const request = await tx.supplierPaymentRequest.update({
        where: { id },
        data: { status, ...(status === SupplierPaymentStatus.REQUESTED ? { requestedBy: actor, requestedAt: new Date() } : {}), ...(status === SupplierPaymentStatus.REJECTED ? { approvedBy: actor } : {}) },
        include: this.paymentRequestInclude(),
      });
      await this.audit(tx, status, 'SupplierPaymentRequest', id, { actor, note: this.text(dto.note) });
      return request;
    });
  }

  private async replaceFormChildren(tx: Prisma.TransactionClient, formId: string, dto: AnyRecord) {
    if (dto.costs !== undefined) {
      await tx.operationCost.deleteMany({ where: { operationFormId: formId } });
      await tx.operationCost.createMany({ data: this.formCosts(dto).map((item) => ({ ...item, operationFormId: formId })) });
    }
    if (dto.services !== undefined) {
      await tx.operationService.deleteMany({ where: { operationFormId: formId } });
      await tx.operationService.createMany({ data: this.formServices(dto).map((item) => ({ ...item, operationFormId: formId })) });
    }
    if (dto.tasks !== undefined) {
      await tx.operationTask.deleteMany({ where: { operationFormId: formId } });
      await tx.operationTask.createMany({ data: this.formTasks(dto).map((item) => ({ ...item, operationFormId: formId })) });
    }
  }

  private async resolveBookingOrderTour(input: { bookingId: string; orderId?: string | null; tourId?: string | null }) {
    let orderId = input.orderId ?? null;
    let tourId = input.tourId ?? null;
    const booking = await this.prisma.booking.findUnique({ where: { id: input.bookingId }, select: { id: true, orderId: true, tourId: true } });
    if (!booking) throw new NotFoundException('Không tìm thấy booking');
    orderId = orderId ?? booking.orderId;
    tourId = tourId ?? booking.tourId;
    if (tourId) {
      const tour = await this.prisma.tour.findUnique({ where: { id: tourId }, select: { id: true, orderId: true } });
      if (!tour) throw new NotFoundException('Tour not found');
      orderId = orderId ?? tour.orderId;
    }
    if (orderId) {
      const order = await this.prisma.order.findUnique({ where: { id: orderId }, select: { id: true } });
      if (!order) throw new NotFoundException('Không tìm thấy đơn hàng');
    }
    return { orderId, tourId };
  }

  private async validatePaymentItems(items: Array<{ supplierId: string; costId?: string | null; amount: number; notes?: string | null }>) {
    const supplierIds = Array.from(new Set(items.map((item) => item.supplierId)));
    const suppliers = await this.prisma.supplier.findMany({ where: { id: { in: supplierIds }, deletedAt: null }, select: { id: true } });
    if (suppliers.length !== supplierIds.length) throw new NotFoundException('Không tìm thấy nhà cung cấp');
    const costIds = Array.from(new Set(items.map((item) => item.costId).filter((id): id is string => Boolean(id))));
    if (costIds.length) {
      const costs = await this.prisma.operationCost.findMany({ where: { id: { in: costIds } }, select: { id: true } });
      if (costs.length !== costIds.length) throw new NotFoundException('Không tìm thấy chi phí vận hành');
    }
  }

  private formServices(dto: AnyRecord) {
    return this.array(dto.services).map((raw) => {
      const item = this.record(raw);
      return {
        itineraryDayId: this.text(item.itineraryDayId),
        supplierId: this.text(item.supplierId),
        supplierServiceId: this.text(item.supplierServiceId),
        serviceType: this.requiredText(item.serviceType, 'serviceType is required'),
        serviceName: this.requiredText(item.serviceName, 'serviceName is required'),
        confirmationStatus: this.text(item.confirmationStatus) || 'WAITING',
        expectedCost: this.number(item.expectedCost),
        actualCost: this.number(item.actualCost),
        notes: this.text(item.notes),
      };
    });
  }

  private formTasks(dto: AnyRecord) {
    return this.array(dto.tasks).map((raw) => {
      const item = this.record(raw);
      return {
        title: this.requiredText(item.title, 'task title is required'),
        assignee: this.text(item.assignee),
        dueDate: this.date(item.dueDate),
        status: (this.text(item.status) || 'PENDING') as never,
        notes: this.text(item.notes),
      };
    });
  }

  private formCosts(dto: AnyRecord) {
    return this.array(dto.costs).map((raw) => {
      const item = this.record(raw);
      return {
        serviceId: this.text(item.serviceId),
        costName: this.requiredText(item.costName, 'costName is required'),
        expectedAmount: this.number(item.expectedAmount),
        actualAmount: this.number(item.actualAmount),
        currency: this.text(item.currency) || 'VND',
        invoiceNo: this.text(item.invoiceNo),
        notes: this.text(item.notes),
      };
    });
  }

  private paymentItems(dto: AnyRecord) {
    return this.array(dto.items).map((raw) => {
      const item = this.record(raw);
      const amount = this.number(item.amount);
      if (amount <= 0) throw new BadRequestException('Payment item amount must be greater than zero');
      return {
        supplierId: this.requiredText(item.supplierId, 'supplierId is required'),
        costId: this.text(item.costId),
        amount,
        notes: this.text(item.notes),
      };
    });
  }

  private formScopeWhere(where: Prisma.OperationFormWhereInput, user?: RequestUser): Prisma.OperationFormWhereInput {
    if (!user || hasUnrestrictedDataScope(user)) return where;
    const permissions = userPermissions(user);
    const OR: Prisma.OperationFormWhereInput[] = [];
    if (permissions.has('data.scope.branch') && user.branch) OR.push({ booking: { customer: { branch: user.branch } } }, { order: { branch: user.branch } }, { tour: { branch: user.branch } });
    if (permissions.has('data.scope.department') && user.department) OR.push({ booking: { customer: { department: user.department } } }, { order: { department: user.department } }, { tour: { department: user.department } });
    if (!OR.length) return { AND: [where, { id: '__no_data_scope__' }] };
    return { AND: [where, { OR }] };
  }

  private paymentRequestScopeWhere(where: Prisma.SupplierPaymentRequestWhereInput, user?: RequestUser): Prisma.SupplierPaymentRequestWhereInput {
    if (!user || hasUnrestrictedDataScope(user)) return where;
    const permissions = userPermissions(user);
    const OR: Prisma.SupplierPaymentRequestWhereInput[] = [];
    if (permissions.has('data.scope.branch') && user.branch) OR.push({ financePayment: { branch: user.branch } }, { items: { some: { cost: { operationForm: this.formScopeWhere({}, user) } } } });
    if (permissions.has('data.scope.department') && user.department) OR.push({ financePayment: { department: user.department } }, { items: { some: { cost: { operationForm: this.formScopeWhere({}, user) } } } });
    if (!OR.length) return { AND: [where, { id: '__no_data_scope__' }] };
    return { AND: [where, { OR }] };
  }

  private async ensureBookingScoped(bookingId: string, user?: RequestUser) {
    if (!user || hasUnrestrictedDataScope(user)) return;
    const row = await this.prisma.operationForm.findFirst({ where: this.formScopeWhere({ bookingId }, user), select: { id: true } });
    if (row) return;
    const booking = await this.prisma.booking.findFirst({
      where: {
        id: bookingId,
        OR: [
          ...(user.branch ? [{ customer: { branch: user.branch } }, { order: { branch: user.branch } }, { tour: { branch: user.branch } }] : []),
          ...(user.department ? [{ customer: { department: user.department } }, { order: { department: user.department } }, { tour: { department: user.department } }] : []),
        ],
      },
      select: { id: true },
    });
    if (!booking) throw new NotFoundException('Không tìm thấy booking');
  }

  private async ensurePaymentItemsScoped(items: Array<{ costId?: string | null }>, user?: RequestUser) {
    if (!user || hasUnrestrictedDataScope(user)) return;
    const costIds = Array.from(new Set(items.map((item) => item.costId).filter((id): id is string => Boolean(id))));
    if (!costIds.length) throw new BadRequestException('costId is required for scoped supplier payment requests');
    const count = await this.prisma.operationCost.count({ where: { id: { in: costIds }, operationForm: this.formScopeWhere({}, user) } });
    if (count !== costIds.length) throw new NotFoundException('Không tìm thấy chi phí vận hành');
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

  private number(value: unknown) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
    return 0;
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

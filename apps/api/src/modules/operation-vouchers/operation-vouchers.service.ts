import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { OperationVoucherStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { applyWriteDataScope, branchDepartmentScopeWhere, hasUnrestrictedDataScope, RequestUser, userPermissions } from '../auth/data-scope';
import { AddOperationVoucherPaymentDto, CreateOperationVoucherDto, UpdateOperationVoucherDto } from './dto/operation-voucher.dto';

type OperationVoucherLinks = {
  bookingId: string | null;
  tourId: string | null;
  orderId: string | null;
  supplierId: string | null;
  supplierName: string | null;
};

type NormalizedOperationVoucherDetail = {
  sku: string | null;
  serviceName: string;
  quantity: number;
  unit: string | null;
  netPrice: number;
  vat: number;
  amount: number;
  note: string | null;
  sortOrder: number;
};

type NormalizedOperationVoucherPayload = {
  voucherCode: string;
  supplierName: string;
  serviceType: string;
  serviceName: string;
  serviceDate: Date;
  paymentDeadline: Date | null;
  note: string | null;
  createdBy: string | null;
  details: NormalizedOperationVoucherDetail[];
};

@Injectable()
export class OperationVouchersService {
  constructor(private readonly prisma: PrismaService) {}

  private listSelect() {
    return {
      id: true,
      voucherCode: true,
      tourId: true,
      bookingId: true,
      orderId: true,
      supplierId: true,
      supplierName: true,
      serviceType: true,
      serviceName: true,
      serviceDate: true,
      totalAmount: true,
      paidAmount: true,
      remainAmount: true,
      paymentDeadline: true,
      status: true,
      note: true,
      createdBy: true,
      createdAt: true,
      updatedAt: true,
      supplier: { select: { id: true, supplierCode: true, name: true, phone: true } },
      booking: { select: { id: true, code: true, customerName: true, startDate: true, endDate: true, status: true } },
      order: { select: { id: true, systemCode: true, tourCode: true, name: true, status: true, branch: true, department: true } },
      tour: { select: { id: true, systemCode: true, tourCode: true, name: true, status: true, branch: true, department: true } },
      _count: { select: { details: true, payments: true } },
    } satisfies Prisma.OperationVoucherSelect;
  }

  list(search?: string, status?: string, user?: RequestUser) {
    const statusFilter = this.operationVoucherStatus(status);
    return this.prisma.operationVoucher.findMany({
      where: this.scopeWhere({
        deletedAt: null,
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(search
          ? {
              OR: [
                { voucherCode: { contains: search, mode: 'insensitive' } },
                { supplierName: { contains: search, mode: 'insensitive' } },
                { serviceName: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      }, user),
      select: this.listSelect(),
      orderBy: [{ updatedAt: 'desc' }, { voucherCode: 'asc' }],
    });
  }

  async detail(id: string, user?: RequestUser) {
    const voucher = await this.prisma.operationVoucher.findFirst({
      where: this.scopeWhere({ id, deletedAt: null }, user),
      include: this.includeAll(),
    });
    if (!voucher) throw new NotFoundException('Operation voucher not found');
    return voucher;
  }

  async create(dto: CreateOperationVoucherDto, user?: RequestUser) {
    const links = await this.resolveLinks(dto);
    const payload = this.normalizeVoucherPayload(dto, links);
    await this.ensureLinksScoped(links, user);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const totals = this.calculate(payload.details, 0);
        const voucher = await tx.operationVoucher.create({
          data: {
            voucherCode: payload.voucherCode,
            tourId: links.tourId,
            bookingId: links.bookingId,
            orderId: links.orderId,
            supplierId: links.supplierId,
            supplierName: payload.supplierName,
            serviceType: payload.serviceType,
            serviceName: payload.serviceName,
            serviceDate: payload.serviceDate,
            paymentDeadline: payload.paymentDeadline,
            totalAmount: totals.totalAmount,
            paidAmount: 0,
            remainAmount: totals.totalAmount,
            status: totals.status,
            note: payload.note,
            createdBy: payload.createdBy,
          },
        });
        await this.replaceDetails(tx, voucher.id, payload.details);
        return tx.operationVoucher.findUniqueOrThrow({ where: { id: voucher.id }, include: this.includeAll() });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Voucher code already exists');
      throw error;
    }
  }

  async update(id: string, dto: UpdateOperationVoucherDto, user?: RequestUser) {
    const current = await this.detail(id, user);
    this.assertEditable(current, 'update');
    const mergedDto: CreateOperationVoucherDto = {
      voucherCode: dto.voucherCode ?? current.voucherCode,
      tourId: dto.tourId !== undefined ? dto.tourId : current.tourId ?? undefined,
      bookingId: dto.bookingId !== undefined ? dto.bookingId : current.bookingId ?? undefined,
      orderId: dto.orderId !== undefined ? dto.orderId : current.orderId ?? undefined,
      supplierId: dto.supplierId !== undefined ? dto.supplierId : current.supplierId ?? undefined,
      supplierName: dto.supplierName !== undefined ? dto.supplierName : current.supplierName ?? undefined,
      serviceType: dto.serviceType ?? current.serviceType,
      serviceName: dto.serviceName ?? current.serviceName,
      serviceDate: dto.serviceDate ?? current.serviceDate.toISOString(),
      paymentDeadline: dto.paymentDeadline !== undefined ? dto.paymentDeadline : current.paymentDeadline?.toISOString(),
      note: dto.note !== undefined ? dto.note : current.note ?? undefined,
      createdBy: dto.createdBy !== undefined ? dto.createdBy : current.createdBy ?? undefined,
      details: dto.details ?? current.details.map((item) => ({
        sku: item.sku ?? undefined,
        serviceName: item.serviceName,
        quantity: Number(item.quantity),
        unit: item.unit ?? undefined,
        netPrice: Number(item.netPrice),
        vat: Number(item.vat),
        note: item.note ?? undefined,
      })),
    };
    const links = await this.resolveLinks(mergedDto);
    const payload = this.normalizeVoucherPayload(mergedDto, links);
    await this.ensureLinksScoped(links, user);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const paidAmount = Number(current.paidAmount);
        const totals = this.calculate(payload.details, paidAmount);
        await tx.operationVoucher.update({
          where: { id },
          data: {
            voucherCode: payload.voucherCode,
            ...(dto.tourId !== undefined || dto.bookingId !== undefined ? { tourId: links.tourId } : {}),
            ...(dto.bookingId !== undefined ? { bookingId: links.bookingId } : {}),
            ...(dto.orderId !== undefined || dto.bookingId !== undefined ? { orderId: links.orderId } : {}),
            ...(dto.supplierId !== undefined ? { supplierId: links.supplierId } : {}),
            supplierName: payload.supplierName,
            serviceType: payload.serviceType,
            serviceName: payload.serviceName,
            serviceDate: payload.serviceDate,
            paymentDeadline: payload.paymentDeadline,
            note: payload.note,
            totalAmount: totals.totalAmount,
            remainAmount: totals.remainAmount,
            status: totals.status,
          },
        });
        if (dto.details) await this.replaceDetails(tx, id, payload.details);
        return tx.operationVoucher.findUniqueOrThrow({ where: { id }, include: this.includeAll() });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Voucher code already exists');
      throw error;
    }
  }

  async remove(id: string, user?: RequestUser) {
    const current = await this.detail(id, user);
    this.assertEditable(current, 'delete');
    return this.prisma.operationVoucher.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async addPayment(id: string, dto: AddOperationVoucherPaymentDto, user?: RequestUser) {
    const voucher = await this.detail(id, user);
    const paymentAmount = this.paymentAmount(dto);
    this.assertPayable(voucher, paymentAmount);
    const paymentDate = this.optionalDate(dto.paymentDate, 'paymentDate') ?? new Date();
    return this.prisma.$transaction(async (tx) => {
      if (dto.paymentVoucherId) {
        const payment = await tx.financePayment.findFirst({ where: branchDepartmentScopeWhere({ id: dto.paymentVoucherId }, user), select: { id: true } });
        if (!payment) throw new NotFoundException('Finance payment not found');
      }
      await tx.operationVoucherPayment.create({
        data: { voucherId: id, paymentVoucherId: this.text(dto.paymentVoucherId), paidAmount: paymentAmount, paymentDate, note: this.text(dto.note) },
      });
      const paidAmount = Number(voucher.paidAmount) + paymentAmount;
      const totals = this.calculate(voucher.details.map((item) => ({ quantity: Number(item.quantity), netPrice: Number(item.netPrice), vat: Number(item.vat), serviceName: item.serviceName })), paidAmount);
      await tx.operationVoucher.update({ where: { id }, data: { paidAmount, remainAmount: totals.remainAmount, status: totals.status } });
      return tx.operationVoucher.findUniqueOrThrow({ where: { id }, include: this.includeAll() });
    });
  }

  async createPaymentVoucher(id: string, user?: RequestUser) {
    const voucher = await this.detail(id, user);
    const amount = Number(voucher.remainAmount);
    this.assertPayable(voucher, amount);
    const scopedPayment = applyWriteDataScope({ branch: undefined, department: undefined }, user);
    return this.prisma.$transaction(async (tx) => {
      const financePayment = await tx.financePayment.create({
        data: {
          ...scopedPayment,
          voucherCode: await this.nextFinancePaymentCode(tx),
          voucherName: `Chi ${voucher.voucherCode}`,
          voucherType: 'SUPPLIER_PAYMENT',
          paymentMethod: 'BANK_TRANSFER',
          supplierId: voucher.supplierId,
          operationVoucherId: voucher.id,
          orderId: voucher.orderId,
          receiverName: voucher.supplierName,
          reason: `Thanh toan phieu dieu hanh ${voucher.voucherCode}`,
          totalAmount: amount,
          paymentAmount: amount,
          remainingAmount: 0,
          approvalStatus: 'PENDING',
          createdBy: voucher.createdBy,
        },
      });
      await tx.operationVoucherPayment.create({
        data: {
          voucherId: id,
          paymentVoucherId: financePayment.id,
          paidAmount: amount,
          paymentDate: new Date(),
          note: 'Tao phieu chi tu phieu dieu hanh',
        },
      });
      const totals = this.calculate(voucher.details.map((item) => ({ quantity: Number(item.quantity), netPrice: Number(item.netPrice), vat: Number(item.vat) })), Number(voucher.paidAmount) + amount);
      await tx.operationVoucher.update({ where: { id }, data: { paidAmount: Number(voucher.paidAmount) + amount, remainAmount: totals.remainAmount, status: totals.status } });
      return tx.operationVoucher.findUniqueOrThrow({ where: { id }, include: this.includeAll() });
    });
  }

  private async resolveLinks(dto: Partial<CreateOperationVoucherDto>): Promise<OperationVoucherLinks> {
    let bookingId = this.text(dto.bookingId);
    let tourId = this.text(dto.tourId);
    let orderId = this.text(dto.orderId);
    let supplierId = this.text(dto.supplierId);
    let supplierName = this.text(dto.supplierName);
    if (bookingId) {
      const booking = await this.prisma.booking.findUnique({ where: { id: bookingId }, select: { id: true, tourId: true, orderId: true } });
      if (!booking) throw new NotFoundException('Không tìm thấy booking');
      tourId = tourId ?? booking.tourId;
      orderId = orderId ?? booking.orderId;
    }
    if (tourId) {
      const tour = await this.prisma.tour.findUnique({ where: { id: tourId }, select: { id: true, orderId: true } });
      if (!tour) throw new NotFoundException('Tour not found');
      orderId = orderId ?? tour.orderId;
    }
    if (orderId) {
      const order = await this.prisma.order.findUnique({ where: { id: orderId }, select: { id: true } });
      if (!order) throw new NotFoundException('Không tìm thấy đơn hàng');
    }
    if (supplierId) {
      const supplier = await this.prisma.supplier.findFirst({ where: { id: supplierId, deletedAt: null }, select: { id: true, name: true } });
      if (!supplier) throw new NotFoundException('Không tìm thấy nhà cung cấp');
      supplierId = supplier.id;
      supplierName = supplierName ?? supplier.name;
    }
    return { bookingId, tourId, orderId, supplierId, supplierName };
  }

  private scopeWhere(where: Prisma.OperationVoucherWhereInput, user?: RequestUser): Prisma.OperationVoucherWhereInput {
    if (!user || hasUnrestrictedDataScope(user)) return where;
    const permissions = userPermissions(user);
    if (this.hasMissingScopeValue(permissions, user)) return { AND: [where, { id: '__no_data_scope__' }] };
    const OR: Prisma.OperationVoucherWhereInput[] = [];
    if (permissions.has('data.scope.branch') && user.branch) OR.push({ order: { branch: user.branch } }, { tour: { branch: user.branch } }, { booking: { customer: { branch: user.branch } } });
    if (permissions.has('data.scope.department') && user.department) OR.push({ order: { department: user.department } }, { tour: { department: user.department } }, { booking: { customer: { department: user.department } } });
    if (!OR.length) return { AND: [where, { id: '__no_data_scope__' }] };
    return { AND: [where, { OR }] };
  }

  private async ensureLinksScoped(links: OperationVoucherLinks, user?: RequestUser) {
    if (!user || hasUnrestrictedDataScope(user)) return;
    applyWriteDataScope({ branch: undefined, department: undefined }, user);
    if (!links.bookingId && !links.tourId && !links.orderId) {
      throw new BadRequestException('bookingId, orderId or tourId is required for scoped operation voucher writes');
    }
    const scoped = await this.prisma.operationVoucher.findFirst({
      where: this.scopeWhere({ bookingId: links.bookingId || undefined, tourId: links.tourId || undefined, orderId: links.orderId || undefined }, user),
      select: { id: true },
    });
    if (scoped) return;
    const permissions = userPermissions(user);
    const orderWhere = links.orderId ? { id: links.orderId, ...(permissions.has('data.scope.branch') && user.branch ? { branch: user.branch } : {}), ...(permissions.has('data.scope.department') && user.department ? { department: user.department } : {}) } : undefined;
    const tourWhere = links.tourId ? { id: links.tourId, ...(permissions.has('data.scope.branch') && user.branch ? { branch: user.branch } : {}), ...(permissions.has('data.scope.department') && user.department ? { department: user.department } : {}) } : undefined;
    const bookingWhere = links.bookingId
      ? {
          id: links.bookingId,
          OR: [
            ...(permissions.has('data.scope.branch') && user.branch ? [{ customer: { branch: user.branch } }, { order: { branch: user.branch } }, { tour: { branch: user.branch } }] : []),
            ...(permissions.has('data.scope.department') && user.department ? [{ customer: { department: user.department } }, { order: { department: user.department } }, { tour: { department: user.department } }] : []),
          ],
        }
      : undefined;
    const [order, tour, booking] = await Promise.all([
      orderWhere ? this.prisma.order.findFirst({ where: orderWhere, select: { id: true } }) : null,
      tourWhere ? this.prisma.tour.findFirst({ where: tourWhere, select: { id: true } }) : null,
      bookingWhere ? this.prisma.booking.findFirst({ where: bookingWhere, select: { id: true } }) : null,
    ]);
    if (!order && !tour && !booking) throw new NotFoundException('Linked booking, order or tour not found');
  }

  private hasMissingScopeValue(permissions: Set<string>, user: RequestUser) {
    return (permissions.has('data.scope.branch') && !user.branch) || (permissions.has('data.scope.department') && !user.department);
  }

  private async nextFinancePaymentCode(tx: Prisma.TransactionClient) {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const rows = await tx.$queryRawUnsafe<{ currentNo: number; padding: number }[]>(
      `INSERT INTO "CodeSequence" ("id","scope","prefix","year","month","branch","currentNo","padding","updatedAt")
       VALUES ($1,'FINANCE_PAYMENT','PC',$2,$3,NULL,1,6,NOW())
       ON CONFLICT ("scope","prefix","year",(COALESCE("month",0)),(COALESCE("branch",'')))
       DO UPDATE SET "currentNo" = "CodeSequence"."currentNo" + 1, "updatedAt" = NOW()
       RETURNING "currentNo", "padding"`,
      randomUUID(),
      year,
      month,
    );
    const seq = rows[0] ?? { currentNo: 1, padding: 6 };
    return `PC-${year}${String(month).padStart(2, '0')}-${String(seq.currentNo).padStart(seq.padding, '0')}`;
  }

  private normalizeVoucherPayload(dto: CreateOperationVoucherDto, links: OperationVoucherLinks): NormalizedOperationVoucherPayload {
    const voucherCode = this.requiredText(dto.voucherCode, 'voucherCode is required');
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$/.test(voucherCode)) {
      throw new BadRequestException('voucherCode must be 2-64 characters and only contain letters, numbers, dot, underscore or dash');
    }
    const supplierName = links.supplierName ?? this.text(dto.supplierName);
    if (!supplierName || supplierName.length < 2) throw new BadRequestException('supplierName is required when supplierId is not provided');
    const serviceType = this.requiredText(dto.serviceType, 'serviceType is required');
    const serviceName = this.requiredText(dto.serviceName, 'serviceName is required');
    const serviceDate = this.requiredDate(dto.serviceDate, 'serviceDate');
    const paymentDeadline = this.optionalDate(dto.paymentDeadline, 'paymentDeadline');
    if (paymentDeadline && paymentDeadline.getTime() < serviceDate.getTime()) {
      throw new BadRequestException('paymentDeadline must be greater than or equal to serviceDate');
    }
    const details = this.normalizeDetails(dto.details);
    if (this.calculate(details, 0).totalAmount <= 0) throw new BadRequestException('Total amount must be greater than zero');
    return {
      voucherCode,
      supplierName,
      serviceType,
      serviceName,
      serviceDate,
      paymentDeadline,
      note: this.text(dto.note),
      createdBy: this.text(dto.createdBy),
      details,
    };
  }

  private normalizeDetails(details: CreateOperationVoucherDto['details']): NormalizedOperationVoucherDetail[] {
    if (!Array.isArray(details) || !details.length) throw new BadRequestException('At least one service detail is required');
    return details.map((item, index) => {
      const serviceName = this.requiredText(item.serviceName, `details[${index}].serviceName is required`);
      const quantity = this.positiveNumber(item.quantity ?? 1, `details[${index}].quantity must be greater than zero`);
      const netPrice = this.nonNegativeNumber(item.netPrice ?? 0, `details[${index}].netPrice must be greater than or equal to zero`);
      const vat = this.nonNegativeNumber(item.vat ?? 0, `details[${index}].vat must be greater than or equal to zero`);
      if (vat > 100) throw new BadRequestException(`details[${index}].vat must be less than or equal to 100`);
      const amount = quantity * netPrice * (1 + vat / 100);
      if (amount <= 0) throw new BadRequestException(`details[${index}].amount must be greater than zero`);
      return {
        sku: this.text(item.sku),
        serviceName,
        quantity,
        unit: this.text(item.unit),
        netPrice,
        vat,
        amount,
        note: this.text(item.note),
        sortOrder: index,
      };
    });
  }

  private calculate(details: Array<{ quantity: number; netPrice: number; vat: number }>, paidAmount: number) {
    const normalizedPaidAmount = this.nonNegativeNumber(paidAmount, 'paidAmount must be greater than or equal to zero');
    const totalAmount = details.reduce((sum, item) => sum + item.quantity * item.netPrice * (1 + item.vat / 100), 0);
    if (normalizedPaidAmount > totalAmount + 0.000001) throw new BadRequestException('Paid amount cannot exceed total amount');
    const paidAmountValue = Math.min(normalizedPaidAmount, totalAmount);
    const remainAmount = Math.max(0, totalAmount - paidAmountValue);
    const status = totalAmount <= 0 || paidAmountValue <= 0 ? OperationVoucherStatus.PENDING : paidAmountValue >= totalAmount ? OperationVoucherStatus.PAID : OperationVoucherStatus.PARTIAL;
    return { totalAmount, remainAmount, status };
  }

  private async replaceDetails(tx: Prisma.TransactionClient, voucherId: string, details: NormalizedOperationVoucherDetail[]) {
    await tx.operationVoucherDetail.deleteMany({ where: { voucherId } });
    await tx.operationVoucherDetail.createMany({
      data: details.map((item) => ({
        voucherId,
        sku: item.sku,
        serviceName: item.serviceName,
        quantity: item.quantity,
        unit: item.unit,
        netPrice: item.netPrice,
        vat: item.vat,
        amount: item.amount,
        note: item.note,
        sortOrder: item.sortOrder,
      })),
    });
  }

  private includeAll() {
    return { supplier: true, booking: true, order: true, tour: true, details: { orderBy: { sortOrder: 'asc' } }, payments: { orderBy: { paymentDate: 'desc' }, include: { paymentVoucher: true } }, financePayments: true } satisfies Prisma.OperationVoucherInclude;
  }

  private text(value?: unknown) {
    const trimmed = typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
    return trimmed ? trimmed : null;
  }

  private requiredText(value: unknown, message: string) {
    const trimmed = typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
    if (!trimmed) throw new BadRequestException(message);
    return trimmed;
  }

  private requiredDate(value: unknown, field: string) {
    const raw = this.requiredText(value, `${field} is required`);
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) throw new BadRequestException(`${field} must be a valid date`);
    return date;
  }

  private optionalDate(value: unknown, field: string) {
    const raw = typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
    if (!raw) return null;
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) throw new BadRequestException(`${field} must be a valid date`);
    return date;
  }

  private nonNegativeNumber(value: unknown, message: string) {
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue) || numberValue < 0) throw new BadRequestException(message);
    return numberValue;
  }

  private positiveNumber(value: unknown, message: string) {
    const numberValue = this.nonNegativeNumber(value, message);
    if (numberValue <= 0) throw new BadRequestException(message);
    return numberValue;
  }

  private paymentAmount(dto: AddOperationVoucherPaymentDto) {
    const amount = dto.paidAmount ?? dto.paymentAmount;
    return this.positiveNumber(amount, 'paymentAmount must be greater than zero');
  }

  private assertEditable(voucher: Awaited<ReturnType<OperationVouchersService['detail']>>, action: 'update' | 'delete') {
    if (voucher.status === OperationVoucherStatus.PAID || Number(voucher.paidAmount) > 0 || voucher.payments.length > 0) {
      throw new BadRequestException(`Only unpaid operation vouchers can be ${action === 'update' ? 'updated' : 'deleted'}`);
    }
  }

  private assertPayable(voucher: Awaited<ReturnType<OperationVouchersService['detail']>>, amount: number) {
    if (voucher.status === OperationVoucherStatus.PAID) throw new BadRequestException('Operation voucher is already paid');
    const remainAmount = Number(voucher.remainAmount);
    if (remainAmount <= 0) throw new BadRequestException('Operation voucher has no remaining amount');
    if (amount > remainAmount + 0.000001) throw new BadRequestException('paymentAmount cannot exceed remaining amount');
  }

  private operationVoucherStatus(status?: string) {
    const normalized = this.text(status)?.toUpperCase();
    if (!normalized) return undefined;
    if (!Object.values(OperationVoucherStatus).includes(normalized as OperationVoucherStatus)) {
      throw new BadRequestException('Invalid operation voucher status');
    }
    return normalized as OperationVoucherStatus;
  }
}

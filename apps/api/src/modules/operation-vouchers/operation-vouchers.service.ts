import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { OperationVoucherStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { hasUnrestrictedDataScope, RequestUser, userPermissions } from '../auth/data-scope';
import { AddOperationVoucherPaymentDto, CreateOperationVoucherDto, UpdateOperationVoucherDto } from './dto/operation-voucher.dto';

@Injectable()
export class OperationVouchersService {
  constructor(private readonly prisma: PrismaService) {}

  list(search?: string, status?: string, user?: RequestUser) {
    return this.prisma.operationVoucher.findMany({
      where: this.scopeWhere({
        deletedAt: null,
        ...(status ? { status: status as any } : {}),
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
      include: { supplier: true, booking: true, order: true, tour: true, _count: { select: { details: true, payments: true } } },
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
    this.validate(dto);
    const links = await this.resolveLinks(dto);
    await this.ensureLinksScoped(links, user);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const totals = this.calculate(dto.details ?? [], 0);
        const voucher = await tx.operationVoucher.create({
          data: {
            voucherCode: dto.voucherCode.trim(),
            tourId: links.tourId,
            bookingId: links.bookingId,
            orderId: links.orderId,
            supplierId: this.text(dto.supplierId),
            supplierName: this.text(dto.supplierName),
            serviceType: dto.serviceType.trim(),
            serviceName: dto.serviceName.trim(),
            serviceDate: new Date(dto.serviceDate),
            paymentDeadline: this.date(dto.paymentDeadline),
            totalAmount: totals.totalAmount,
            paidAmount: 0,
            remainAmount: totals.totalAmount,
            status: totals.totalAmount > 0 ? 'PENDING' : 'PAID',
            note: this.text(dto.note),
            createdBy: this.text(dto.createdBy),
          },
        });
        await this.replaceDetails(tx, voucher.id, dto.details ?? []);
        return tx.operationVoucher.findUniqueOrThrow({ where: { id: voucher.id }, include: this.includeAll() });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Voucher code already exists');
      throw error;
    }
  }

  async update(id: string, dto: UpdateOperationVoucherDto, user?: RequestUser) {
    const current = await this.detail(id, user);
    this.validate({ ...current, ...dto, serviceDate: dto.serviceDate ?? current.serviceDate.toISOString() } as CreateOperationVoucherDto);
    const links = await this.resolveLinks({
      tourId: dto.tourId !== undefined ? dto.tourId : current.tourId ?? undefined,
      bookingId: dto.bookingId !== undefined ? dto.bookingId : current.bookingId ?? undefined,
      orderId: dto.orderId !== undefined ? dto.orderId : current.orderId ?? undefined,
      supplierId: dto.supplierId !== undefined ? dto.supplierId : current.supplierId ?? undefined,
    });
    await this.ensureLinksScoped(links, user);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const detailInput = dto.details ?? current.details.map((item) => ({
          sku: item.sku ?? undefined,
          serviceName: item.serviceName,
          quantity: Number(item.quantity),
          unit: item.unit ?? undefined,
          netPrice: Number(item.netPrice),
          vat: Number(item.vat),
          note: item.note ?? undefined,
        }));
        const paidAmount = Number(current.paidAmount);
        const totals = this.calculate(detailInput, paidAmount);
        await tx.operationVoucher.update({
          where: { id },
          data: {
            ...(dto.voucherCode !== undefined ? { voucherCode: dto.voucherCode.trim() } : {}),
            ...(dto.tourId !== undefined || dto.bookingId !== undefined ? { tourId: links.tourId } : {}),
            ...(dto.bookingId !== undefined ? { bookingId: links.bookingId } : {}),
            ...(dto.orderId !== undefined || dto.bookingId !== undefined ? { orderId: links.orderId } : {}),
            ...(dto.supplierId !== undefined ? { supplierId: this.text(dto.supplierId) } : {}),
            ...(dto.supplierName !== undefined ? { supplierName: this.text(dto.supplierName) } : {}),
            ...(dto.serviceType !== undefined ? { serviceType: dto.serviceType.trim() } : {}),
            ...(dto.serviceName !== undefined ? { serviceName: dto.serviceName.trim() } : {}),
            ...(dto.serviceDate !== undefined ? { serviceDate: new Date(dto.serviceDate) } : {}),
            ...(dto.paymentDeadline !== undefined ? { paymentDeadline: this.date(dto.paymentDeadline) } : {}),
            ...(dto.note !== undefined ? { note: this.text(dto.note) } : {}),
            totalAmount: totals.totalAmount,
            remainAmount: totals.remainAmount,
            status: totals.status,
          },
        });
        if (dto.details) await this.replaceDetails(tx, id, dto.details);
        return tx.operationVoucher.findUniqueOrThrow({ where: { id }, include: this.includeAll() });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Voucher code already exists');
      throw error;
    }
  }

  async remove(id: string, user?: RequestUser) {
    await this.detail(id, user);
    return this.prisma.operationVoucher.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async addPayment(id: string, dto: AddOperationVoucherPaymentDto, user?: RequestUser) {
    const voucher = await this.detail(id, user);
    if (dto.paidAmount <= 0) throw new BadRequestException('Paid amount must be greater than zero');
    if (Number(voucher.paidAmount) + dto.paidAmount > Number(voucher.totalAmount)) throw new BadRequestException('Paid amount cannot exceed total amount');
    return this.prisma.$transaction(async (tx) => {
      if (dto.paymentVoucherId) {
        const payment = await tx.financePayment.findUnique({ where: { id: dto.paymentVoucherId }, select: { id: true } });
        if (!payment) throw new NotFoundException('Finance payment not found');
      }
      await tx.operationVoucherPayment.create({
        data: { voucherId: id, paymentVoucherId: this.text(dto.paymentVoucherId), paidAmount: dto.paidAmount, paymentDate: this.date(dto.paymentDate) ?? new Date(), note: this.text(dto.note) },
      });
      const paidAmount = Number(voucher.paidAmount) + dto.paidAmount;
      const totals = this.calculate(voucher.details.map((item) => ({ quantity: Number(item.quantity), netPrice: Number(item.netPrice), vat: Number(item.vat), serviceName: item.serviceName })), paidAmount);
      await tx.operationVoucher.update({ where: { id }, data: { paidAmount, remainAmount: totals.remainAmount, status: totals.status } });
      return tx.operationVoucher.findUniqueOrThrow({ where: { id }, include: this.includeAll() });
    });
  }

  async createPaymentVoucher(id: string, user?: RequestUser) {
    const voucher = await this.detail(id, user);
    const amount = Number(voucher.remainAmount);
    if (amount <= 0) throw new BadRequestException('Voucher has no remaining amount');
    return this.prisma.$transaction(async (tx) => {
      const financePayment = await tx.financePayment.create({
        data: {
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

  private async resolveLinks(dto: Partial<CreateOperationVoucherDto>) {
    let bookingId = this.text(dto.bookingId);
    let tourId = this.text(dto.tourId);
    let orderId = this.text(dto.orderId);
    if (bookingId) {
      const booking = await this.prisma.booking.findUnique({ where: { id: bookingId }, select: { id: true, tourId: true, orderId: true } });
      if (!booking) throw new NotFoundException('Booking not found');
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
      if (!order) throw new NotFoundException('Order not found');
    }
    if (dto.supplierId) {
      const supplier = await this.prisma.supplier.findFirst({ where: { id: dto.supplierId, deletedAt: null }, select: { id: true } });
      if (!supplier) throw new NotFoundException('Supplier not found');
    }
    return { bookingId, tourId, orderId };
  }

  private scopeWhere(where: Prisma.OperationVoucherWhereInput, user?: RequestUser): Prisma.OperationVoucherWhereInput {
    if (!user || hasUnrestrictedDataScope(user)) return where;
    const permissions = userPermissions(user);
    const OR: Prisma.OperationVoucherWhereInput[] = [];
    if (permissions.has('data.scope.branch') && user.branch) OR.push({ order: { branch: user.branch } }, { tour: { branch: user.branch } }, { booking: { customer: { branch: user.branch } } });
    if (permissions.has('data.scope.department') && user.department) OR.push({ order: { department: user.department } }, { tour: { department: user.department } }, { booking: { customer: { department: user.department } } });
    if (!OR.length) return { AND: [where, { id: '__no_data_scope__' }] };
    return { AND: [where, { OR }] };
  }

  private async ensureLinksScoped(links: { bookingId: string | null; tourId: string | null; orderId: string | null }, user?: RequestUser) {
    if (!user || hasUnrestrictedDataScope(user)) return;
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

  private validate(dto: CreateOperationVoucherDto) {
    if (!dto.serviceDate) throw new BadRequestException('Service date is required');
    if (dto.paymentDeadline && new Date(dto.paymentDeadline) < new Date(dto.serviceDate)) throw new BadRequestException('Payment deadline must be after service date');
    if (!dto.details?.length) throw new BadRequestException('At least one service detail is required');
    if (this.calculate(dto.details, 0).totalAmount <= 0) throw new BadRequestException('Total amount must be greater than zero');
  }

  private calculate(details: Array<{ quantity?: number; netPrice?: number; vat?: number }>, paidAmount: number) {
    const totalAmount = details.reduce((sum, item) => sum + (item.quantity ?? 1) * (item.netPrice ?? 0) * (1 + (item.vat ?? 0) / 100), 0);
    const remainAmount = Math.max(0, totalAmount - paidAmount);
    const status = totalAmount <= 0 || paidAmount <= 0 ? OperationVoucherStatus.PENDING : paidAmount >= totalAmount ? OperationVoucherStatus.PAID : OperationVoucherStatus.PARTIAL;
    return { totalAmount, remainAmount, status };
  }

  private async replaceDetails(tx: Prisma.TransactionClient, voucherId: string, details: CreateOperationVoucherDto['details']) {
    await tx.operationVoucherDetail.deleteMany({ where: { voucherId } });
    await tx.operationVoucherDetail.createMany({
      data: (details ?? []).map((item, index) => ({
        voucherId,
        sku: this.text(item.sku),
        serviceName: item.serviceName.trim(),
        quantity: item.quantity ?? 1,
        unit: this.text(item.unit),
        netPrice: item.netPrice ?? 0,
        vat: item.vat ?? 0,
        amount: (item.quantity ?? 1) * (item.netPrice ?? 0) * (1 + (item.vat ?? 0) / 100),
        note: this.text(item.note),
        sortOrder: index,
      })),
    });
  }

  private includeAll() {
    return { supplier: true, booking: true, order: true, tour: true, details: { orderBy: { sortOrder: 'asc' } }, payments: { orderBy: { paymentDate: 'desc' }, include: { paymentVoucher: true } }, financePayments: true } satisfies Prisma.OperationVoucherInclude;
  }

  private text(value?: string | null) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private date(value?: string | null) {
    return value ? new Date(value) : null;
  }
}

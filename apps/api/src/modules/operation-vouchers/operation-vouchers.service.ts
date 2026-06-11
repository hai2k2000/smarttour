import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { OperationVoucherStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { applyWriteDataScope, branchDepartmentScopeWhere, hasUnrestrictedDataScope, RequestUser, userPermissions } from '../auth/data-scope';
import { containsSearch, normalizeListSearch } from '../list-search';
import { AddOperationVoucherPaymentDto, CreateOperationVoucherDto, OPERATION_VOUCHER_LIST_DEFAULT_TAKE, OPERATION_VOUCHER_LIST_MAX_TAKE, UpdateOperationVoucherDto } from './dto/operation-voucher.dto';

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

  list(search?: string, status?: string, user?: RequestUser, take?: number, skip?: number) {
    const statusFilter = this.operationVoucherStatus(status);
    const searchText = normalizeListSearch(search);
    const contains = searchText ? containsSearch(searchText) : undefined;
    return this.prisma.operationVoucher.findMany({
      where: this.scopeWhere({
        deletedAt: null,
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(contains
          ? {
              OR: [
                { voucherCode: contains },
                { supplierName: contains },
                { serviceType: contains },
                { serviceName: contains },
                { supplier: { supplierCode: contains } },
                { supplier: { name: contains } },
                { booking: { code: contains } },
                { booking: { customerName: contains } },
                { order: { systemCode: contains } },
                { order: { tourCode: contains } },
                { order: { name: contains } },
                { tour: { systemCode: contains } },
                { tour: { tourCode: contains } },
                { tour: { name: contains } },
              ],
            }
          : {}),
      }, user),
      select: this.listSelect(),
      orderBy: [{ updatedAt: 'desc' }, { voucherCode: 'asc' }],
      take: this.take(take),
      skip: this.skip(skip),
    });
  }

  async detail(id: string, user?: RequestUser) {
    const voucher = await this.prisma.operationVoucher.findFirst({
      where: this.scopeWhere({ id, deletedAt: null }, user),
      include: this.includeAll(),
    });
    if (!voucher) throw new NotFoundException('Không tìm thấy phiếu điều hành dịch vụ');
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
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Mã phiếu điều hành đã tồn tại');
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
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Mã phiếu điều hành đã tồn tại');
      throw error;
    }
  }

  async remove(id: string, user?: RequestUser) {
    const current = await this.detail(id, user);
    this.assertEditable(current, 'delete');
    return this.prisma.operationVoucher.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async addPayment(id: string, dto: AddOperationVoucherPaymentDto, user?: RequestUser) {
    const paymentAmount = this.paymentAmount(dto);
    const paymentDate = this.optionalDate(dto.paymentDate, 'ngày thanh toán') ?? new Date();
    return this.prisma.$transaction(async (tx) => {
      const voucher = await this.lockVoucherForPayment(tx, id, user);
      this.assertPayable(voucher, paymentAmount);
      if (dto.paymentVoucherId) {
        const payment = await tx.financePayment.findFirst({ where: branchDepartmentScopeWhere({ id: dto.paymentVoucherId }, user), select: { id: true } });
        if (!payment) throw new NotFoundException('Không tìm thấy phiếu chi tài chính');
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
    const scopedPayment = applyWriteDataScope({ branch: undefined, department: undefined }, user);
    return this.prisma.$transaction(async (tx) => {
      const voucher = await this.lockVoucherForPayment(tx, id, user);
      const amount = Number(voucher.remainAmount);
      this.assertPayable(voucher, amount);
      const financePayment = await tx.financePayment.create({
        data: {
          ...scopedPayment,
          voucherCode: await this.nextAvailableFinancePaymentCode(tx),
          voucherName: `Chi ${voucher.voucherCode}`,
          voucherType: 'SUPPLIER_PAYMENT',
          paymentMethod: 'BANK_TRANSFER',
          supplierId: voucher.supplierId,
          operationVoucherId: voucher.id,
          orderId: voucher.orderId,
          receiverName: voucher.supplierName,
          reason: `Thanh toán phiếu điều hành ${voucher.voucherCode}`,
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
          note: 'Tạo phiếu chi từ phiếu điều hành',
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
      if (!tour) throw new NotFoundException('Không tìm thấy tour');
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
    const AND: Prisma.OperationVoucherWhereInput[] = [where];
    if (permissions.has('data.scope.branch') && user.branch) AND.push({ OR: [{ order: { branch: user.branch } }, { tour: { branch: user.branch } }, { booking: { customer: { branch: user.branch } } }] });
    if (permissions.has('data.scope.department') && user.department) AND.push({ OR: [{ order: { department: user.department } }, { tour: { department: user.department } }, { booking: { customer: { department: user.department } } }] });
    if (AND.length === 1) return { AND: [where, { id: '__no_data_scope__' }] };
    return { AND };
  }

  private async ensureLinksScoped(links: OperationVoucherLinks, user?: RequestUser) {
    if (!user || hasUnrestrictedDataScope(user)) return;
    applyWriteDataScope({ branch: undefined, department: undefined }, user);
    if (!links.bookingId && !links.tourId && !links.orderId) {
      throw new BadRequestException('Cần gắn booking, đơn hàng hoặc tour trong phạm vi dữ liệu để tạo phiếu điều hành');
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
          AND: [
            { id: links.bookingId },
            ...(permissions.has('data.scope.branch') && user.branch ? [{ OR: [{ customer: { branch: user.branch } }, { order: { branch: user.branch } }, { tour: { branch: user.branch } }] }] : []),
            ...(permissions.has('data.scope.department') && user.department ? [{ OR: [{ customer: { department: user.department } }, { order: { department: user.department } }, { tour: { department: user.department } }] }] : []),
          ],
        }
      : undefined;
    const [order, tour, booking] = await Promise.all([
      orderWhere ? this.prisma.order.findFirst({ where: orderWhere, select: { id: true } }) : null,
      tourWhere ? this.prisma.tour.findFirst({ where: tourWhere, select: { id: true } }) : null,
      bookingWhere ? this.prisma.booking.findFirst({ where: bookingWhere, select: { id: true } }) : null,
    ]);
    if (!order && !tour && !booking) throw new NotFoundException('Không tìm thấy booking, đơn hàng hoặc tour trong phạm vi dữ liệu');
  }

  private hasMissingScopeValue(permissions: Set<string>, user: RequestUser) {
    return (permissions.has('data.scope.branch') && !user.branch) || (permissions.has('data.scope.department') && !user.department);
  }


  private take(value?: number) {
    if (value === undefined || value === null) return OPERATION_VOUCHER_LIST_DEFAULT_TAKE;
    return Math.min(Math.max(Number(value) || OPERATION_VOUCHER_LIST_DEFAULT_TAKE, 1), OPERATION_VOUCHER_LIST_MAX_TAKE);
  }

  private skip(value?: number) {
    if (value === undefined || value === null) return 0;
    return Math.max(Number(value) || 0, 0);
  }

  private async lockVoucherForPayment(tx: Prisma.TransactionClient, id: string, user?: RequestUser) {
    const locked = await tx.$queryRawUnsafe<{ id: string }[]>('SELECT id FROM "OperationVoucher" WHERE id = $1 AND "deletedAt" IS NULL FOR UPDATE', id);
    if (!locked.length) throw new NotFoundException('Không tìm thấy phiếu điều hành dịch vụ');
    const voucher = await tx.operationVoucher.findFirst({ where: this.scopeWhere({ id, deletedAt: null }, user), include: this.includeAll() });
    if (!voucher) throw new NotFoundException('Không tìm thấy phiếu điều hành dịch vụ');
    return voucher;
  }

  private async nextAvailableFinancePaymentCode(tx: Prisma.TransactionClient) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const code = await this.nextFinancePaymentCode(tx);
      const existing = await tx.financePayment.findUnique({ where: { voucherCode: code }, select: { id: true } });
      if (!existing) return code;
    }
    throw new ConflictException('Không thể sinh mã phiếu chi duy nhất');
  }

  private async nextFinancePaymentCode(tx: Prisma.TransactionClient) {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const yearMonth = `${year}${String(month).padStart(2, '0')}`;
    const codePrefix = `PC-${yearMonth}-`;
    const existingCodes = await tx.financePayment.findMany({ where: { voucherCode: { startsWith: codePrefix } }, select: { voucherCode: true } });
    const maxExistingNo = existingCodes.reduce((max, row) => {
      const match = row.voucherCode.match(new RegExp(`^${codePrefix}(\d+)$`));
      const value = match ? Number(match[1]) : 0;
      return Number.isFinite(value) && value > max ? value : max;
    }, 0);
    const seedNo = maxExistingNo + 1;
    const seq = await this.nextFinancePaymentSequence(tx, year, month, seedNo);
    return `${codePrefix}${String(seq.currentNo).padStart(seq.padding, '0')}`;
  }

  private async nextFinancePaymentSequence(tx: Prisma.TransactionClient, year: number, month: number, seedNo: number) {
    const supportsExpressionConflict = await this.hasCodeSequenceExpressionIndex(tx);
    if (supportsExpressionConflict) {
      const rows = await tx.$queryRawUnsafe<{ currentNo: number; padding: number }[]>(
        `INSERT INTO "CodeSequence" ("id","scope","prefix","year","month","branch","currentNo","padding","updatedAt")
         VALUES ($1,'FINANCE_PAYMENT','PC',$2,$3,NULL,$4,6,NOW())
         ON CONFLICT ("scope","prefix","year",(COALESCE("month",0)),(COALESCE("branch",'')))
         DO UPDATE SET "currentNo" = GREATEST("CodeSequence"."currentNo" + 1, $4), "updatedAt" = NOW()
         RETURNING "currentNo", "padding"`,
        randomUUID(),
        year,
        month,
        seedNo,
      );
      return rows[0] ?? { currentNo: seedNo, padding: 6 };
    }
    const rows = await tx.$queryRawUnsafe<{ currentNo: number; padding: number }[]>(
      `INSERT INTO "CodeSequence" ("id","scope","prefix","year","month","branch","currentNo","padding","updatedAt")
       VALUES ($1,'FINANCE_PAYMENT','PC',$2,$3,'',$4,6,NOW())
       ON CONFLICT ("scope","prefix","year","month","branch")
       DO UPDATE SET "currentNo" = GREATEST("CodeSequence"."currentNo" + 1, $4), "updatedAt" = NOW()
       RETURNING "currentNo", "padding"`,
      randomUUID(),
      year,
      month,
      seedNo,
    );
    return rows[0] ?? { currentNo: seedNo, padding: 6 };
  }

  private async hasCodeSequenceExpressionIndex(tx: Prisma.TransactionClient) {
    const rows = await tx.$queryRawUnsafe<{ exists: boolean }[]>(
      `SELECT EXISTS (
         SELECT 1
         FROM pg_indexes
         WHERE schemaname = current_schema()
           AND tablename = 'CodeSequence'
           AND indexdef ILIKE '%COALESCE%month%'
           AND indexdef ILIKE '%COALESCE%branch%'
       ) AS "exists"`,
    );
    return Boolean(rows[0]?.exists);
  }

  private normalizeVoucherPayload(dto: CreateOperationVoucherDto, links: OperationVoucherLinks): NormalizedOperationVoucherPayload {
    const voucherCode = this.requiredText(dto.voucherCode, 'Cần nhập mã phiếu điều hành').toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9._-]{1,63}$/.test(voucherCode)) {
      throw new BadRequestException('Mã phiếu điều hành phải dài 2-64 ký tự và chỉ gồm chữ, số, dấu chấm, gạch dưới hoặc gạch ngang');
    }
    const supplierName = links.supplierName ?? this.text(dto.supplierName);
    if (!supplierName || supplierName.length < 2) throw new BadRequestException('Cần nhập tên nhà cung cấp khi chưa chọn nhà cung cấp liên kết');
    const serviceType = this.requiredText(dto.serviceType, 'Cần nhập loại dịch vụ');
    if (serviceType.length < 2) throw new BadRequestException('Loại dịch vụ phải có ít nhất 2 ký tự');
    const serviceName = this.requiredText(dto.serviceName, 'Cần nhập tên dịch vụ');
    if (serviceName.length < 2) throw new BadRequestException('Tên dịch vụ phải có ít nhất 2 ký tự');
    const serviceDate = this.requiredDate(dto.serviceDate, 'ngày dịch vụ');
    const paymentDeadline = this.optionalDate(dto.paymentDeadline, 'hạn thanh toán');
    if (paymentDeadline && paymentDeadline.getTime() < serviceDate.getTime()) {
      throw new BadRequestException('Hạn thanh toán không được trước ngày dịch vụ');
    }
    const details = this.normalizeDetails(dto.details);
    if (this.calculate(details, 0).totalAmount <= 0) throw new BadRequestException('Tổng tiền phiếu điều hành phải lớn hơn 0');
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
    if (!Array.isArray(details) || !details.length) throw new BadRequestException('Cần ít nhất một dòng chi tiết dịch vụ');
    return details.map((raw, index) => {
      const item = this.record(raw, `Dòng chi tiết ${index + 1} không hợp lệ`);
      const label = `Dòng chi tiết ${index + 1}`;
      const serviceName = this.requiredText(item.serviceName, `${label}: cần nhập tên dịch vụ`);
      const quantity = this.positiveNumber(item.quantity ?? 1, `${label}: số lượng phải lớn hơn 0`);
      const netPrice = this.nonNegativeNumber(item.netPrice ?? 0, `${label}: giá NET không được âm`);
      const vat = this.nonNegativeNumber(item.vat ?? 0, `${label}: VAT không được âm`);
      if (vat > 100) throw new BadRequestException(`${label}: VAT không được vượt quá 100%`);
      const amount = quantity * netPrice * (1 + vat / 100);
      if (amount <= 0) throw new BadRequestException(`${label}: thành tiền phải lớn hơn 0`);
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
    const normalizedPaidAmount = this.nonNegativeNumber(paidAmount, 'Số tiền đã thanh toán không được âm');
    const totalAmount = details.reduce((sum, item) => sum + item.quantity * item.netPrice * (1 + item.vat / 100), 0);
    if (normalizedPaidAmount > totalAmount + 0.000001) throw new BadRequestException('Số tiền đã thanh toán không được vượt quá tổng tiền phiếu điều hành');
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
    return {
      supplier: true,
      booking: true,
      order: true,
      tour: true,
      details: { orderBy: { sortOrder: 'asc' } },
      payments: { orderBy: { paymentDate: 'desc' }, include: { paymentVoucher: true } },
      financePayments: { orderBy: { paymentDate: 'desc' } },
    } satisfies Prisma.OperationVoucherInclude;
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

  private record(value: unknown, message: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException(message);
    return value as Record<string, unknown>;
  }

  private requiredDate(value: unknown, label: string) {
    const raw = this.requiredText(value, `Cần nhập ${label}`);
    return this.parseDate(raw, `${label} không hợp lệ`);
  }

  private optionalDate(value: unknown, label: string) {
    const raw = typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
    if (!raw) return null;
    return this.parseDate(raw, `${label} không hợp lệ`);
  }

  private parseDate(raw: string, message: string) {
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) throw new BadRequestException(message);
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw) && date.toISOString().slice(0, 10) !== raw) throw new BadRequestException(message);
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
    return this.positiveNumber(amount, 'Số tiền thanh toán phải lớn hơn 0');
  }

  private assertEditable(voucher: Awaited<ReturnType<OperationVouchersService['detail']>>, action: 'update' | 'delete') {
    if (voucher.status === OperationVoucherStatus.PAID || Number(voucher.paidAmount) > 0 || voucher.payments.length > 0) {
      throw new BadRequestException(action === 'update' ? 'Chỉ phiếu chưa thanh toán mới được chỉnh sửa' : 'Chỉ phiếu chưa thanh toán mới được xóa');
    }
  }

  private assertPayable(voucher: Awaited<ReturnType<OperationVouchersService['detail']>>, amount: number) {
    if (voucher.status === OperationVoucherStatus.PAID) throw new BadRequestException('Phiếu điều hành đã thanh toán đủ');
    const remainAmount = Number(voucher.remainAmount);
    if (remainAmount <= 0) throw new BadRequestException('Phiếu điều hành không còn công nợ cần thanh toán');
    if (amount > remainAmount + 0.000001) throw new BadRequestException('Số tiền thanh toán không được vượt quá công nợ còn lại');
  }

  private operationVoucherStatus(status?: string) {
    const normalized = this.text(status)?.toUpperCase();
    if (!normalized) return undefined;
    if (!Object.values(OperationVoucherStatus).includes(normalized as OperationVoucherStatus)) {
      throw new BadRequestException('Trạng thái phiếu điều hành không hợp lệ');
    }
    return normalized as OperationVoucherStatus;
  }
}

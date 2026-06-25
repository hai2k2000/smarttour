import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderType, Prisma, QuotationStatus } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import { applyWriteDataScope, branchDepartmentScopeWhere, RequestUser } from '../auth/data-scope';
import { containsSearch, normalizeListSearch } from '../list-search';
import { CreateQuotationDto, DEFAULT_QUOTATIONS_TAKE, ListQuotationsQueryDto, MAX_QUOTATIONS_TAKE, QuotationActionDto, UpdateQuotationDto } from './dto/quotation.dto';

type QuotationItemInput = NonNullable<CreateQuotationDto['items']>[number];

const ORDER_TYPE_BY_PRODUCT: Record<string, OrderType> = {
  FIT: 'FIT_TOUR',
  GIT: 'GIT_COMBO',
  LANDTOUR: 'LANDTOUR',
  COMBO: 'GIT_COMBO',
  BOOKING: 'HOTEL_BOOKING',
  VISA: 'SINGLE_SERVICE',
  SERVICE: 'SINGLE_SERVICE',
};

@Injectable()
export class QuotationsService {
  constructor(private readonly prisma: PrismaService) {}

  async dashboard(user?: RequestUser) {
    const where = branchDepartmentScopeWhere({}, user);
    const now = new Date();
    const [total, pending, approved, converted, expired, totals] = await Promise.all([
      this.prisma.quotation.count({ where }),
      this.prisma.quotation.count({ where: this.andWhere(where, { status: 'PENDING_APPROVAL' }) }),
      this.prisma.quotation.count({ where: this.andWhere(where, { status: 'APPROVED' }) }),
      this.prisma.quotation.count({ where: this.andWhere(where, { status: 'CONVERTED' }) }),
      this.prisma.quotation.count({
        where: this.andWhere(where, {
          OR: [
            { status: 'EXPIRED' },
            { expiredDate: { lt: now }, status: { not: 'CONVERTED' } },
          ],
        }),
      }),
      this.prisma.quotation.aggregate({ where, _sum: { totalSelling: true } }),
    ]);
    return {
      total,
      totalValue: Number(totals._sum.totalSelling ?? 0),
      pending,
      approved,
      converted,
      expired,
    };
  }

  list(query: ListQuotationsQueryDto, user?: RequestUser) {
    const search = normalizeListSearch(query.search);
    const contains = search ? containsSearch(search) : undefined;
    const where: Prisma.QuotationWhereInput = {
      ...(query.productType ? { productType: query.productType as any } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.salesOwner ? { salesOwner: { contains: query.salesOwner, mode: 'insensitive' } } : {}),
      ...(query.branch ? { branch: { contains: query.branch, mode: 'insensitive' } } : {}),
      ...(query.marketGroup ? { marketGroup: { contains: query.marketGroup, mode: 'insensitive' } } : {}),
      ...(contains ? { OR: [
        { quoteCode: contains },
        { customerName: contains },
        { customerPhone: contains },
        { route: contains },
      ] } : {}),
    };
    return this.prisma.quotation.findMany({
      where: branchDepartmentScopeWhere(where, user),
      include: { _count: { select: { items: true, logs: true } } },
      orderBy: [{ updatedAt: 'desc' }, { quoteCode: 'asc' }],
      take: this.listTake(query.take),
    });
  }

  async detail(id: string, user?: RequestUser) {
    const quote = await this.prisma.quotation.findFirst({ where: branchDepartmentScopeWhere({ id }, user), include: this.includeAll() });
    if (!quote) throw new NotFoundException('Không tìm thấy báo giá.');
    return quote;
  }

  async publicDetail(token: string) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new NotFoundException('Không tìm thấy SmartLink báo giá.');
    const quote = await this.prisma.quotation.findFirst({
      where: { smartLinkToken: token, smartLinkEnabled: true, status: 'APPROVED', expiredDate: { gt: new Date() } },
      select: {
        quoteCode: true,
        productType: true,
        customerName: true,
        productCategory: true,
        route: true,
        paxAdult: true,
        paxChild: true,
        paxInfant: true,
        paxTotal: true,
        currency: true,
        createdDate: true,
        expiredDate: true,
        departureDate: true,
        returnDate: true,
        totalSelling: true,
        sellingPerPax: true,
        adultPrice: true,
        childPrice: true,
        infantPrice: true,
        language: true,
        terms: true,
        items: {
          select: {
            serviceType: true,
            serviceName: true,
            unit: true,
            quantity: true,
            paxCount: true,
            nightCount: true,
            sellingPrice: true,
            amount: true,
            sortOrder: true,
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
    if (!quote) throw new NotFoundException('Không tìm thấy SmartLink báo giá.');
    return quote;
  }

  async create(dto: CreateQuotationDto, user?: RequestUser) {
    dto = applyWriteDataScope(dto, user);
    dto = this.prepareDto(dto, true);
    this.validateDates(dto);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const totals = this.calculate(dto);
        const quote = await tx.quotation.create({ data: { ...this.toData(dto), ...totals, status: 'DRAFT', smartLinkEnabled: false, smartLinkToken: this.token() } as Prisma.QuotationCreateInput });
        await this.replaceItems(tx, quote.id, dto.items ?? [], dto.exchangeRate);
        await tx.quotationApprovalLog.create({ data: { quotationId: quote.id, action: 'CREATE', actor: this.actor(user), newStatus: quote.status } });
        return tx.quotation.findUniqueOrThrow({ where: { id: quote.id }, include: this.includeAll() });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Mã báo giá đã tồn tại.');
      throw error;
    }
  }

  async update(id: string, dto: UpdateQuotationDto, user?: RequestUser) {
    const current = await this.detail(id, user);
    dto = applyWriteDataScope(dto, user);
    this.assertEditable(current.status);
    dto = this.prepareDto(dto, false);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const items = dto.items ?? current.items.map((item) => ({
          serviceType: item.serviceType,
          supplierId: item.supplierId ?? undefined,
          serviceId: item.serviceId ?? undefined,
          supplierName: item.supplierName ?? undefined,
          serviceName: item.serviceName,
          unit: item.unit ?? undefined,
          quantity: Number(item.quantity),
          paxCount: Number(item.paxCount),
          nightCount: Number(item.nightCount),
          netPrice: Number(item.netPrice),
          vat: Number(item.vat),
          markupAmount: Number(item.markupAmount),
          markupPercent: Number(item.markupPercent),
          note: item.note ?? undefined,
        }));
        const merged = {
          ...current,
          childPricePercent: this.derivePricePercent(current.childPrice, current.sellingPerPax, 75),
          infantPricePercent: this.derivePricePercent(current.infantPrice, current.sellingPerPax, 20),
          ...dto,
          items,
        } as CreateQuotationDto;
        this.validateDates(merged);
        await tx.quotation.update({ where: { id }, data: { ...this.toData(dto), ...this.calculate(merged) } as Prisma.QuotationUpdateInput });
        if (dto.items || dto.exchangeRate !== undefined) await this.replaceItems(tx, id, items, merged.exchangeRate);
        await tx.quotationApprovalLog.create({ data: { quotationId: id, action: 'UPDATE', actor: this.actor(user), oldStatus: current.status, newStatus: current.status } });
        return tx.quotation.findUniqueOrThrow({ where: { id }, include: this.includeAll() });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Mã báo giá đã tồn tại.');
      throw error;
    }
  }

  async remove(id: string, user?: RequestUser) {
    const quote = await this.detail(id, user);
    this.assertDeletable(quote.status);
    return this.prisma.quotation.delete({ where: { id } });
  }

  async submit(id: string, dto: QuotationActionDto, user?: RequestUser) {
    const current = await this.detail(id, user);
    if (current.status === 'PENDING_APPROVAL') return current;
    this.assertStatus(current.status, ['DRAFT', 'REJECTED'], 'submit');
    return this.statusFromCurrent(current, 'PENDING_APPROVAL', 'SUBMIT', dto, user);
  }

  async approve(id: string, dto: QuotationActionDto, user?: RequestUser) {
    const current = await this.detail(id, user);
    if (current.status === 'APPROVED') return current;
    this.assertStatus(current.status, ['PENDING_APPROVAL'], 'approve');
    return this.statusFromCurrent(current, 'APPROVED', 'APPROVE', dto, user);
  }

  async reject(id: string, dto: QuotationActionDto, user?: RequestUser) {
    const current = await this.detail(id, user);
    if (current.status === 'REJECTED') return current;
    this.assertStatus(current.status, ['PENDING_APPROVAL'], 'reject');
    return this.statusFromCurrent(current, 'REJECTED', 'REJECT', dto, user);
  }

  async smartLink(id: string, enabled = true, user?: RequestUser) {
    const current = await this.detail(id, user);
    this.assertStatus(current.status, ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'EXPIRED'], 'toggle smartlink');
    return this.prisma.quotation.update({
      where: { id },
      data: enabled
        ? { smartLinkEnabled: true, smartLinkToken: this.secureSmartLinkToken(current.smartLinkToken, current.smartLinkEnabled) }
        : { smartLinkEnabled: false },
      include: this.includeAll(),
    });
  }

  async convert(id: string, dto: QuotationActionDto, user?: RequestUser) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Quotation" WHERE id = ${id} FOR UPDATE`;
      const quote = await tx.quotation.findFirst({ where: branchDepartmentScopeWhere({ id }, user), include: this.includeAll() });
      if (!quote) throw new NotFoundException('Không tìm thấy báo giá.');
      if (quote.status === 'CONVERTED' && quote.convertedOrderId) return quote;
      if (quote.status !== 'APPROVED') throw new BadRequestException('Chỉ báo giá đã duyệt mới được chuyển thành đơn hàng.');

      const orderType = ORDER_TYPE_BY_PRODUCT[quote.productType] || 'SINGLE_SERVICE';
      const exchangeRate = this.positiveRate(quote.exchangeRate);
      const totals = this.calculate({
        ...(quote as unknown as CreateQuotationDto),
        childPricePercent: this.derivePricePercent(quote.childPrice, quote.sellingPerPax, 75),
        infantPricePercent: this.derivePricePercent(quote.infantPrice, quote.sellingPerPax, 20),
      });
      const order = await tx.order.create({
        data: {
          type: orderType,
          systemCode: `ORD-${quote.quoteCode}`,
          tourCode: quote.quoteCode,
          name: quote.route || quote.productCategory || quote.quoteCode,
          route: quote.route,
          marketGroup: quote.marketGroup,
          bookingDate: new Date(),
          paymentDate: quote.expectedPaymentDate,
          startDate: quote.departureDate,
          endDate: quote.returnDate,
          tourCategory: quote.productCategory,
          currency: quote.currency,
          exchangeRate: quote.exchangeRate,
          createdBy: quote.salesOwner,
          branch: quote.branch,
          department: quote.department,
          customerId: quote.customerId,
          customerName: quote.customerName,
          customerPhone: quote.customerPhone,
          customerEmail: quote.customerEmail,
          operatorOwner: quote.operatorOwner,
          adultQty: quote.paxAdult,
          childQty: quote.paxChild,
          infantQty: quote.paxInfant,
          quantity: quote.paxTotal,
          totalRevenue: totals.totalSelling,
          remainingRevenue: totals.totalSelling,
          totalCost: totals.totalCost,
          remainingCost: totals.totalCost,
          profit: totals.totalSelling - totals.totalCost,
          note: quote.note,
          salesItems: { create: quote.items.map((item, index) => ({ serviceType: item.serviceType, supplierId: item.supplierId, serviceId: item.serviceId, description: item.serviceName, quantity: item.quantity, serviceCount: item.nightCount, unitPrice: this.unitSellingForOrder(item, exchangeRate), vat: 0, amount: this.itemSelling(item, exchangeRate), note: item.note, sortOrder: index })) },
          operationItems: { create: quote.items.map((item, index) => ({ serviceType: item.serviceType, supplierId: item.supplierId, serviceId: item.serviceId, quantity: item.quantity, netPrice: this.unitCostForOrder(item, exchangeRate), vat: 0, amount: this.itemCost(item, exchangeRate), status: 'WAITING', note: item.note, sortOrder: index })) },
          terms: quote.terms ? { create: [{ language: quote.language, terms: quote.terms }] } : undefined,
        } as Prisma.OrderCreateInput,
      });
      await tx.quotation.update({ where: { id }, data: { ...totals, status: 'CONVERTED', convertedOrderId: order.id } });
      await tx.quotationApprovalLog.create({ data: { quotationId: id, action: 'CONVERT', actor: this.actor(user), note: this.text(dto.note), oldStatus: quote.status, newStatus: 'CONVERTED' } });
      return tx.quotation.findUniqueOrThrow({ where: { id }, include: this.includeAll() });
    });
  }
  private async statusFromCurrent(current: Awaited<ReturnType<QuotationsService['detail']>>, status: QuotationStatus, action: string, dto: QuotationActionDto, user?: RequestUser) {
    const quote = await this.prisma.quotation.update({ where: { id: current.id }, data: { status }, include: this.includeAll() });
    await this.prisma.quotationApprovalLog.create({ data: { quotationId: current.id, action, actor: this.actor(user), note: this.text(dto.note), oldStatus: current.status, newStatus: status } });
    return quote;
  }

  private prepareDto<T extends Partial<CreateQuotationDto>>(dto: T, requireItems: boolean): T {
    const prepared = { ...dto } as Partial<CreateQuotationDto>;
    if (dto.items !== undefined || requireItems) {
      prepared.items = this.sanitizeItems(dto.items, requireItems || dto.items !== undefined);
    }
    return prepared as T;
  }

  private sanitizeItems(items: CreateQuotationDto['items'], requireOne: boolean): QuotationItemInput[] {
    const rows = (items ?? []).filter((item) => this.hasItemContent(item));
    if (requireOne && !rows.length) throw new BadRequestException('Cần ít nhất một dòng dịch vụ báo giá.');
    return rows.map((item, index) => {
      const serviceType = this.text(item.serviceType);
      const serviceName = this.text(item.serviceName);
      if (!serviceType || serviceType.length < 2) throw new BadRequestException(`Dòng dịch vụ báo giá ${index + 1} cần loại dịch vụ tối thiểu 2 ký tự.`);
      if (!serviceName || serviceName.length < 2) throw new BadRequestException(`Dòng dịch vụ báo giá ${index + 1} cần tên dịch vụ tối thiểu 2 ký tự.`);
      return {
        serviceType,
        supplierId: this.text(item.supplierId) ?? undefined,
        serviceId: this.text(item.serviceId) ?? undefined,
        supplierName: this.text(item.supplierName) ?? undefined,
        serviceName,
        unit: this.text(item.unit) ?? undefined,
        quantity: this.positiveInput(item.quantity ?? 1, `Số lượng dòng dịch vụ báo giá ${index + 1}`),
        paxCount: this.positiveInput(item.paxCount ?? 1, `Số khách dòng dịch vụ báo giá ${index + 1}`),
        nightCount: this.positiveInput(item.nightCount ?? 1, `Số đêm dòng dịch vụ báo giá ${index + 1}`),
        netPrice: this.nonNegative(item.netPrice),
        vat: this.nonNegative(item.vat),
        markupAmount: this.number(item.markupAmount),
        markupPercent: this.number(item.markupPercent),
        note: this.text(item.note) ?? undefined,
      };
    });
  }

  private hasItemContent(item: QuotationItemInput) {
    return Boolean(
      this.text(item.serviceName) ||
      this.text(item.supplierName) ||
      this.text(item.unit) ||
      this.text(item.note) ||
      this.number(item.netPrice) > 0 ||
      this.number(item.vat) > 0 ||
      this.number(item.markupAmount) !== 0 ||
      this.number(item.markupPercent) !== 0,
    );
  }

  private calculate(dto: Partial<CreateQuotationDto>) {
    const items = dto.items ?? [];
    const exchangeRate = this.positiveRate(dto.exchangeRate);
    const totalCost = items.reduce((sum, item) => sum + this.itemCost(item, exchangeRate), 0);
    const totalMarkup = items.reduce((sum, item) => sum + this.itemMarkup(item, exchangeRate), 0);
    const totalSelling = totalCost + totalMarkup;
    const paxTotal = Math.max(1, (dto.paxAdult ?? 0) + (dto.paxChild ?? 0) + (dto.paxInfant ?? 0));
    const costPerPax = totalCost / paxTotal;
    const sellingPerPax = totalSelling / paxTotal;
    const profitPerPax = sellingPerPax - costPerPax;
    const childPercent = dto.childPricePercent ?? 75;
    const infantPercent = dto.infantPricePercent ?? 20;
    return { totalCost, totalMarkup, totalSelling, paxTotal, costPerPax, sellingPerPax, profitPerPax, marginRate: totalSelling ? (totalMarkup / totalSelling) * 100 : 0, adultPrice: sellingPerPax, childPrice: sellingPerPax * childPercent / 100, infantPrice: sellingPerPax * infantPercent / 100 };
  }

  private itemCost(item: { quantity?: unknown; nightCount?: unknown; netPrice?: unknown; vat?: unknown }, exchangeRate = 1) {
    return this.number(item.quantity, 1) * this.number(item.nightCount, 1) * this.number(item.netPrice) * exchangeRate * (1 + this.number(item.vat) / 100);
  }

  private itemMarkup(item: { quantity?: unknown; nightCount?: unknown; netPrice?: unknown; vat?: unknown; markupAmount?: unknown; markupPercent?: unknown }, exchangeRate = 1) {
    const cost = this.itemCost(item, exchangeRate);
    return this.number(item.markupAmount) + cost * (this.number(item.markupPercent) / 100);
  }

  private itemSelling(item: { quantity?: unknown; nightCount?: unknown; netPrice?: unknown; vat?: unknown; markupAmount?: unknown; markupPercent?: unknown }, exchangeRate = 1) {
    return this.itemCost(item, exchangeRate) + this.itemMarkup(item, exchangeRate);
  }

  private unitCostForOrder(item: { quantity?: number | Prisma.Decimal; nightCount?: number | Prisma.Decimal; netPrice?: number | Prisma.Decimal; vat?: number | Prisma.Decimal }, exchangeRate = 1) {
    const nightCount = Number(item.nightCount ?? 1);
    const netPrice = Number(item.netPrice ?? 0);
    const vat = Number(item.vat ?? 0);
    return nightCount * netPrice * exchangeRate * (1 + vat / 100);
  }

  private unitSellingForOrder(item: { quantity?: number | Prisma.Decimal; nightCount?: number | Prisma.Decimal; netPrice?: number | Prisma.Decimal; vat?: number | Prisma.Decimal; markupAmount?: number | Prisma.Decimal; markupPercent?: number | Prisma.Decimal }, exchangeRate = 1) {
    const quantity = Number(item.quantity ?? 1);
    const nightCount = Number(item.nightCount ?? 1);
    const denominator = Math.max(1, quantity * nightCount);
    return this.itemSelling(item, exchangeRate) / denominator;
  }

  private async replaceItems(tx: Prisma.TransactionClient, quotationId: string, items: CreateQuotationDto['items'], exchangeRateValue?: unknown) {
    const exchangeRate = this.positiveRate(exchangeRateValue);
    await tx.quotationItem.deleteMany({ where: { quotationId } });
    await tx.quotationItem.createMany({ data: (items ?? []).filter((i) => i.serviceName).map((item, index) => {
      const cost = this.itemCost(item, exchangeRate);
      const markup = this.itemMarkup(item, exchangeRate);
      return { quotationId, serviceType: item.serviceType, supplierId: this.text(item.supplierId), serviceId: this.text(item.serviceId), supplierName: this.text(item.supplierName), serviceName: item.serviceName.trim(), unit: this.text(item.unit), quantity: item.quantity ?? 1, paxCount: item.paxCount ?? 1, nightCount: item.nightCount ?? 1, netPrice: item.netPrice ?? 0, vat: item.vat ?? 0, markupAmount: item.markupAmount ?? 0, markupPercent: item.markupPercent ?? 0, sellingPrice: cost + markup, amount: cost + markup, note: this.text(item.note), sortOrder: index };
    }) });
  }

  private toData(dto: Partial<CreateQuotationDto>) {
    return {
      ...(dto.quoteCode !== undefined ? { quoteCode: dto.quoteCode.trim() } : {}),
      ...(dto.productType !== undefined ? { productType: dto.productType } : {}),
      ...(dto.customerCode !== undefined ? { customerCode: this.text(dto.customerCode) } : {}),
      ...(dto.customerName !== undefined ? { customerName: this.text(dto.customerName) } : {}),
      ...(dto.customerPhone !== undefined ? { customerPhone: this.text(dto.customerPhone) } : {}),
      ...(dto.customerEmail !== undefined ? { customerEmail: this.text(dto.customerEmail) } : {}),
      ...(dto.salesOwner !== undefined ? { salesOwner: this.text(dto.salesOwner) } : {}),
      ...(dto.operatorOwner !== undefined ? { operatorOwner: this.text(dto.operatorOwner) } : {}),
      ...(dto.branch !== undefined ? { branch: this.text(dto.branch) } : {}),
      ...(dto.department !== undefined ? { department: this.text(dto.department) } : {}),
      ...(dto.marketGroup !== undefined ? { marketGroup: this.text(dto.marketGroup) } : {}),
      ...(dto.productCategory !== undefined ? { productCategory: this.text(dto.productCategory) } : {}),
      ...(dto.route !== undefined ? { route: this.text(dto.route) } : {}),
      ...(dto.paxAdult !== undefined ? { paxAdult: dto.paxAdult } : {}),
      ...(dto.paxChild !== undefined ? { paxChild: dto.paxChild } : {}),
      ...(dto.paxInfant !== undefined ? { paxInfant: dto.paxInfant } : {}),
      ...(dto.currency !== undefined ? { currency: dto.currency || 'VND' } : {}),
      ...(dto.exchangeRate !== undefined ? { exchangeRate: this.positiveRate(dto.exchangeRate) } : {}),
      ...(dto.createdDate !== undefined ? { createdDate: this.date(dto.createdDate) } : {}),
      ...(dto.expiredDate !== undefined ? { expiredDate: this.date(dto.expiredDate) } : {}),
      ...(dto.expectedPaymentDate !== undefined ? { expectedPaymentDate: this.date(dto.expectedPaymentDate) } : {}),
      ...(dto.departureDate !== undefined ? { departureDate: this.date(dto.departureDate) } : {}),
      ...(dto.returnDate !== undefined ? { returnDate: this.date(dto.returnDate) } : {}),
      ...(dto.approvalLevel !== undefined ? { approvalLevel: dto.approvalLevel } : {}),
      ...(dto.language !== undefined ? { language: dto.language || 'VI' } : {}),
      ...(dto.terms !== undefined ? { terms: this.text(dto.terms) } : {}),
      ...(dto.note !== undefined ? { note: this.text(dto.note) } : {}),
    };
  }

  private includeAll() {
    return { items: { include: { supplier: true, service: true }, orderBy: { sortOrder: 'asc' } }, logs: { orderBy: { createdAt: 'desc' } } } satisfies Prisma.QuotationInclude;
  }

  private assertEditable(status: QuotationStatus) {
    this.assertStatus(status, ['DRAFT', 'PENDING_APPROVAL', 'REJECTED', 'EXPIRED'], 'edit');
  }

  private assertDeletable(status: QuotationStatus) {
    this.assertStatus(status, ['DRAFT', 'REJECTED', 'EXPIRED', 'CANCELLED'], 'delete');
  }

  private assertStatus(status: QuotationStatus, allowed: QuotationStatus[], action: string) {
    if (!allowed.includes(status)) {
      throw new BadRequestException(`Không thể ${this.actionLabel(action)} báo giá từ trạng thái ${this.statusLabel(status)}.`);
    }
  }

  private validateDates(dto: Partial<CreateQuotationDto>) {
    this.assertDateOrder(dto.createdDate, dto.expiredDate, 'Ngày hết hạn phải sau ngày tạo báo giá.');
    this.assertDateOrder(dto.createdDate, dto.expectedPaymentDate, 'Ngày dự kiến thanh toán phải sau ngày tạo báo giá.');
    this.assertDateOrder(dto.departureDate, dto.returnDate, 'Ngày kết thúc phải sau ngày khởi hành.');
  }

  private assertDateOrder(startValue: unknown, endValue: unknown, message: string) {
    const start = this.dateValue(startValue);
    const end = this.dateValue(endValue);
    if (start && end && end < start) throw new BadRequestException(message);
  }

  private secureSmartLinkToken(current: string | null | undefined, alreadyEnabled: boolean) {
    return alreadyEnabled && current && /^[A-Za-z0-9_-]{43}$/.test(current) ? current : this.token();
  }

  private token() {
    return randomBytes(32).toString('base64url');
  }

  private text(value?: string | null) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private actor(user?: RequestUser) {
    return user?.username || user?.email || user?.id || 'system';
  }

  private date(value?: string | Date | null) {
    return this.dateValue(value);
  }

  private dateValue(value?: unknown) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(date.getTime())) throw new BadRequestException('Ngày không hợp lệ.');
    return date;
  }

  private actionLabel(action: string) {
    return ({
      submit: 'gửi duyệt',
      approve: 'duyệt',
      reject: 'từ chối',
      'toggle smartlink': 'bật/tắt SmartLink',
      edit: 'chỉnh sửa',
      delete: 'xóa',
    } as Record<string, string>)[action] ?? action;
  }

  private statusLabel(status: string) {
    return ({
      DRAFT: 'Nháp',
      PENDING_APPROVAL: 'Chờ duyệt',
      APPROVED: 'Đã duyệt',
      REJECTED: 'Từ chối',
      CONVERTED: 'Đã chuyển đơn',
      EXPIRED: 'Hết hạn',
      CANCELLED: 'Đã hủy',
    } as Record<string, string>)[status] ?? status;
  }

  private number(value: unknown, fallback = 0) {
    if (value === undefined || value === null || value === '') return fallback;
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  private nonNegative(value: unknown, fallback = 0) {
    return Math.max(0, this.number(value, fallback));
  }

  private positiveRate(value: unknown, fallback = 1) {
    if (value === undefined || value === null || value === '') return fallback;
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) throw new BadRequestException('Tỷ giá báo giá phải lớn hơn 0');
    return number;
  }

  private andWhere(where: Prisma.QuotationWhereInput, extra: Prisma.QuotationWhereInput): Prisma.QuotationWhereInput {
    return { AND: [where, extra] };
  }

  private listTake(value?: number) {
    if (value === undefined || value === null) return DEFAULT_QUOTATIONS_TAKE;
    if (!Number.isFinite(value)) return DEFAULT_QUOTATIONS_TAKE;
    return Math.min(Math.max(1, Math.trunc(value)), MAX_QUOTATIONS_TAKE);
  }

  private positiveInput(value: unknown, label: string) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) throw new BadRequestException(`${label} phải lớn hơn 0`);
    return number;
  }

  private derivePricePercent(price: unknown, sellingPerPax: unknown, fallback: number) {
    const selling = this.number(sellingPerPax);
    if (selling <= 0) return fallback;
    const percent = this.number(price) / selling * 100;
    return Number.isFinite(percent) && percent >= 0 ? percent : fallback;
  }
}

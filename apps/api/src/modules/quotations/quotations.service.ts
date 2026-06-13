import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderType, Prisma, QuotationStatus } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import { applyWriteDataScope, branchDepartmentScopeWhere, RequestUser } from '../auth/data-scope';
import { containsSearch, normalizeListSearch } from '../list-search';
import { CreateQuotationDto, QuotationActionDto, UpdateQuotationDto } from './dto/quotation.dto';

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
    const quotes = await this.prisma.quotation.findMany({ where: branchDepartmentScopeWhere({}, user) });
    return quotes.reduce((acc, quote) => {
      acc.total += 1;
      acc.totalValue += Number(quote.totalSelling);
      if (quote.status === 'PENDING_APPROVAL') acc.pending += 1;
      if (quote.status === 'APPROVED') acc.approved += 1;
      if (quote.status === 'CONVERTED') acc.converted += 1;
      if (quote.status === 'EXPIRED' || (quote.expiredDate && quote.expiredDate < new Date() && quote.status !== 'CONVERTED')) acc.expired += 1;
      return acc;
    }, { total: 0, totalValue: 0, pending: 0, approved: 0, converted: 0, expired: 0 });
  }

  list(query: { search?: string; productType?: string; status?: QuotationStatus; salesOwner?: string; branch?: string; marketGroup?: string }, user?: RequestUser) {
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
    });
  }

  async detail(id: string, user?: RequestUser) {
    const quote = await this.prisma.quotation.findFirst({ where: branchDepartmentScopeWhere({ id }, user), include: this.includeAll() });
    if (!quote) throw new NotFoundException('Quotation not found');
    return quote;
  }

  async publicDetail(token: string) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new NotFoundException('Quotation smartlink not found');
    const quote = await this.prisma.quotation.findFirst({
      where: { smartLinkToken: token, smartLinkEnabled: true },
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
    if (!quote) throw new NotFoundException('Quotation smartlink not found');
    return quote;
  }

  async create(dto: CreateQuotationDto, user?: RequestUser) {
    dto = applyWriteDataScope(dto, user);
    dto = this.prepareDto(dto, true);
    this.validateDates(dto);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const totals = this.calculate(dto);
        const quote = await tx.quotation.create({ data: { ...this.toData(dto), ...totals, smartLinkToken: this.token() } as Prisma.QuotationCreateInput });
        await this.replaceItems(tx, quote.id, dto.items ?? [], dto.exchangeRate);
        await tx.quotationApprovalLog.create({ data: { quotationId: quote.id, action: 'CREATE', newStatus: quote.status } });
        return tx.quotation.findUniqueOrThrow({ where: { id: quote.id }, include: this.includeAll() });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Quotation code already exists');
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
        await tx.quotationApprovalLog.create({ data: { quotationId: id, action: 'UPDATE', actor: 'Operator', oldStatus: current.status, newStatus: dto.status ?? current.status } });
        return tx.quotation.findUniqueOrThrow({ where: { id }, include: this.includeAll() });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Quotation code already exists');
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
    return this.statusFromCurrent(current, 'PENDING_APPROVAL', 'SUBMIT', dto);
  }

  async approve(id: string, dto: QuotationActionDto, user?: RequestUser) {
    const current = await this.detail(id, user);
    if (current.status === 'APPROVED') return current;
    this.assertStatus(current.status, ['PENDING_APPROVAL'], 'approve');
    return this.statusFromCurrent(current, 'APPROVED', 'APPROVE', dto);
  }

  async reject(id: string, dto: QuotationActionDto, user?: RequestUser) {
    const current = await this.detail(id, user);
    if (current.status === 'REJECTED') return current;
    this.assertStatus(current.status, ['PENDING_APPROVAL'], 'reject');
    return this.statusFromCurrent(current, 'REJECTED', 'REJECT', dto);
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
    const quote = await this.detail(id, user);
    if (quote.status !== 'APPROVED') throw new BadRequestException('Only approved quotations can be converted');
    const orderType = ORDER_TYPE_BY_PRODUCT[quote.productType] || 'SINGLE_SERVICE';
    const exchangeRate = this.positiveRate(quote.exchangeRate);
    const totals = this.calculate({
      ...(quote as unknown as CreateQuotationDto),
      childPricePercent: this.derivePricePercent(quote.childPrice, quote.sellingPerPax, 75),
      infantPricePercent: this.derivePricePercent(quote.infantPrice, quote.sellingPerPax, 20),
    });
    return this.prisma.$transaction(async (tx) => {
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
      await tx.quotationApprovalLog.create({ data: { quotationId: id, action: 'CONVERT', actor: this.text(dto.actor), note: this.text(dto.note), oldStatus: quote.status, newStatus: 'CONVERTED' } });
      return tx.quotation.findUniqueOrThrow({ where: { id }, include: this.includeAll() });
    });
  }

  private async statusFromCurrent(current: Awaited<ReturnType<QuotationsService['detail']>>, status: QuotationStatus, action: string, dto: QuotationActionDto) {
    const quote = await this.prisma.quotation.update({ where: { id: current.id }, data: { status }, include: this.includeAll() });
    await this.prisma.quotationApprovalLog.create({ data: { quotationId: current.id, action, actor: this.text(dto.actor), note: this.text(dto.note), oldStatus: current.status, newStatus: status } });
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
    if (requireOne && !rows.length) throw new BadRequestException('At least one quotation item is required');
    return rows.map((item, index) => {
      const serviceType = this.text(item.serviceType);
      const serviceName = this.text(item.serviceName);
      if (!serviceType || serviceType.length < 2) throw new BadRequestException(`Quotation item ${index + 1} requires service type`);
      if (!serviceName || serviceName.length < 2) throw new BadRequestException(`Quotation item ${index + 1} requires service name`);
      return {
        serviceType,
        supplierId: this.text(item.supplierId) ?? undefined,
        serviceId: this.text(item.serviceId) ?? undefined,
        supplierName: this.text(item.supplierName) ?? undefined,
        serviceName,
        unit: this.text(item.unit) ?? undefined,
        quantity: this.nonNegative(item.quantity, 1),
        paxCount: this.nonNegative(item.paxCount, 1),
        nightCount: this.nonNegative(item.nightCount, 1),
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
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      ...(dto.smartLinkEnabled !== undefined ? { smartLinkEnabled: dto.smartLinkEnabled } : {}),
      ...(dto.language !== undefined ? { language: dto.language || 'VI' } : {}),
      ...(dto.terms !== undefined ? { terms: this.text(dto.terms) } : {}),
      ...(dto.note !== undefined ? { note: this.text(dto.note) } : {}),
    };
  }

  private includeAll() {
    return { items: { include: { supplier: true, service: true }, orderBy: { sortOrder: 'asc' } }, logs: { orderBy: { createdAt: 'desc' } } } satisfies Prisma.QuotationInclude;
  }

  private assertEditable(status: QuotationStatus) {
    this.assertStatus(status, ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'EXPIRED'], 'edit');
  }

  private assertDeletable(status: QuotationStatus) {
    this.assertStatus(status, ['DRAFT', 'REJECTED', 'EXPIRED', 'CANCELLED'], 'delete');
  }

  private assertStatus(status: QuotationStatus, allowed: QuotationStatus[], action: string) {
    if (!allowed.includes(status)) throw new BadRequestException(`Cannot ${action} quotation from status ${status}`);
  }

  private validateDates(dto: Partial<CreateQuotationDto>) {
    this.assertDateOrder(dto.createdDate, dto.expiredDate, 'Expired date must be after created date');
    this.assertDateOrder(dto.createdDate, dto.expectedPaymentDate, 'Expected payment date must be after created date');
    this.assertDateOrder(dto.departureDate, dto.returnDate, 'Return date must be after departure date');
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

  private date(value?: string | Date | null) {
    return this.dateValue(value);
  }

  private dateValue(value?: unknown) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(date.getTime())) throw new BadRequestException('Invalid date');
    return date;
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
    const number = this.number(value, fallback);
    return number > 0 ? number : fallback;
  }

  private derivePricePercent(price: unknown, sellingPerPax: unknown, fallback: number) {
    const selling = this.number(sellingPerPax);
    if (selling <= 0) return fallback;
    const percent = this.number(price) / selling * 100;
    return Number.isFinite(percent) && percent >= 0 ? percent : fallback;
  }
}

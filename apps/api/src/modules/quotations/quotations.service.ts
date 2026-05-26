import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderType, Prisma, QuotationStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { applyWriteDataScope, branchDepartmentScopeWhere, RequestUser } from '../auth/data-scope';
import { CreateQuotationDto, QuotationActionDto, UpdateQuotationDto } from './dto/quotation.dto';

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
    const where: Prisma.QuotationWhereInput = {
      ...(query.productType ? { productType: query.productType as any } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.salesOwner ? { salesOwner: { contains: query.salesOwner, mode: 'insensitive' } } : {}),
      ...(query.branch ? { branch: { contains: query.branch, mode: 'insensitive' } } : {}),
      ...(query.marketGroup ? { marketGroup: { contains: query.marketGroup, mode: 'insensitive' } } : {}),
      ...(query.search ? { OR: [
        { quoteCode: { contains: query.search, mode: 'insensitive' } },
        { customerName: { contains: query.search, mode: 'insensitive' } },
        { customerPhone: { contains: query.search, mode: 'insensitive' } },
        { route: { contains: query.search, mode: 'insensitive' } },
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
    const quote = await this.prisma.quotation.findFirst({ where: { smartLinkToken: token, smartLinkEnabled: true }, include: { items: { orderBy: { sortOrder: 'asc' } } } });
    if (!quote) throw new NotFoundException('Quotation smartlink not found');
    return quote;
  }

  async create(dto: CreateQuotationDto, user?: RequestUser) {
    dto = applyWriteDataScope(dto, user);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const totals = this.calculate(dto);
        const quote = await tx.quotation.create({ data: { ...this.toData(dto), ...totals, smartLinkToken: this.token(dto.quoteCode) } as Prisma.QuotationCreateInput });
        await this.replaceItems(tx, quote.id, dto.items ?? []);
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
    if (current.status === 'CONVERTED') throw new BadRequestException('Converted quotation cannot be edited');
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
        await tx.quotation.update({ where: { id }, data: { ...this.toData(dto), ...this.calculate({ ...current, ...dto, items } as CreateQuotationDto) } as Prisma.QuotationUpdateInput });
        if (dto.items) await this.replaceItems(tx, id, dto.items);
        await tx.quotationApprovalLog.create({ data: { quotationId: id, action: 'UPDATE', actor: 'Operator', oldStatus: current.status, newStatus: dto.status ?? current.status } });
        return tx.quotation.findUniqueOrThrow({ where: { id }, include: this.includeAll() });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Quotation code already exists');
      throw error;
    }
  }

  async remove(id: string, user?: RequestUser) {
    await this.detail(id, user);
    return this.prisma.quotation.delete({ where: { id } });
  }

  async submit(id: string, dto: QuotationActionDto, user?: RequestUser) {
    return this.status(id, 'PENDING_APPROVAL', 'SUBMIT', dto, user);
  }

  async approve(id: string, dto: QuotationActionDto, user?: RequestUser) {
    return this.status(id, 'APPROVED', 'APPROVE', dto, user);
  }

  async reject(id: string, dto: QuotationActionDto, user?: RequestUser) {
    return this.status(id, 'REJECTED', 'REJECT', dto, user);
  }

  async smartLink(id: string, enabled = true, user?: RequestUser) {
    await this.detail(id, user);
    return this.prisma.quotation.update({ where: { id }, data: { smartLinkEnabled: enabled }, include: this.includeAll() });
  }

  async convert(id: string, dto: QuotationActionDto, user?: RequestUser) {
    const quote = await this.detail(id, user);
    if (quote.status !== 'APPROVED') throw new BadRequestException('Only approved quotations can be converted');
    const orderType = ORDER_TYPE_BY_PRODUCT[quote.productType] || 'SINGLE_SERVICE';
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          type: orderType,
          systemCode: `ORD-${quote.quoteCode}`,
          tourCode: quote.quoteCode,
          name: quote.route || quote.productCategory || quote.quoteCode,
          marketGroup: quote.marketGroup,
          bookingDate: new Date(),
          paymentDate: quote.expectedPaymentDate,
          startDate: quote.departureDate,
          endDate: quote.returnDate,
          branch: quote.branch,
          department: quote.department,
          customerName: quote.customerName,
          customerPhone: quote.customerPhone,
          customerEmail: quote.customerEmail,
          operatorOwner: quote.operatorOwner,
          adultQty: quote.paxAdult,
          childQty: quote.paxChild,
          infantQty: quote.paxInfant,
          quantity: quote.paxTotal,
          totalRevenue: quote.totalSelling,
          remainingRevenue: quote.totalSelling,
          totalCost: quote.totalCost,
          remainingCost: quote.totalCost,
          profit: Number(quote.totalSelling) - Number(quote.totalCost),
          salesItems: { create: quote.items.map((item, index) => ({ serviceType: item.serviceType, supplierId: item.supplierId, serviceId: item.serviceId, description: item.serviceName, quantity: item.quantity, serviceCount: item.nightCount, unitPrice: item.sellingPrice, vat: 0, amount: item.amount, note: item.note, sortOrder: index })) },
          operationItems: { create: quote.items.map((item, index) => ({ serviceType: item.serviceType, supplierId: item.supplierId, serviceId: item.serviceId, quantity: item.quantity, netPrice: item.netPrice, vat: item.vat, amount: item.netPrice, status: 'WAITING', note: item.note, sortOrder: index })) },
          terms: quote.terms ? { create: [{ language: quote.language, terms: quote.terms }] } : undefined,
        } as Prisma.OrderCreateInput,
      });
      await tx.quotation.update({ where: { id }, data: { status: 'CONVERTED', convertedOrderId: order.id } });
      await tx.quotationApprovalLog.create({ data: { quotationId: id, action: 'CONVERT', actor: this.text(dto.actor), note: this.text(dto.note), oldStatus: quote.status, newStatus: 'CONVERTED' } });
      return tx.quotation.findUniqueOrThrow({ where: { id }, include: this.includeAll() });
    });
  }

  private async status(id: string, status: QuotationStatus, action: string, dto: QuotationActionDto, user?: RequestUser) {
    const current = await this.detail(id, user);
    const quote = await this.prisma.quotation.update({ where: { id }, data: { status }, include: this.includeAll() });
    await this.prisma.quotationApprovalLog.create({ data: { quotationId: id, action, actor: this.text(dto.actor), note: this.text(dto.note), oldStatus: current.status, newStatus: status } });
    return quote;
  }

  private calculate(dto: Partial<CreateQuotationDto>) {
    const items = dto.items ?? [];
    const totalCost = items.reduce((sum, item) => sum + this.itemCost(item), 0);
    const totalMarkup = items.reduce((sum, item) => sum + this.itemMarkup(item), 0);
    const totalSelling = totalCost + totalMarkup;
    const paxTotal = Math.max(1, (dto.paxAdult ?? 0) + (dto.paxChild ?? 0) + (dto.paxInfant ?? 0));
    const costPerPax = totalCost / paxTotal;
    const sellingPerPax = totalSelling / paxTotal;
    const profitPerPax = sellingPerPax - costPerPax;
    const childPercent = dto.childPricePercent ?? 75;
    const infantPercent = dto.infantPricePercent ?? 20;
    return { totalCost, totalMarkup, totalSelling, paxTotal, costPerPax, sellingPerPax, profitPerPax, marginRate: totalSelling ? (totalMarkup / totalSelling) * 100 : 0, adultPrice: sellingPerPax, childPrice: sellingPerPax * childPercent / 100, infantPrice: sellingPerPax * infantPercent / 100 };
  }

  private itemCost(item: { quantity?: number; nightCount?: number; netPrice?: number; vat?: number }) {
    return (item.quantity ?? 1) * (item.nightCount ?? 1) * (item.netPrice ?? 0) * (1 + (item.vat ?? 0) / 100);
  }

  private itemMarkup(item: { quantity?: number; nightCount?: number; netPrice?: number; vat?: number; markupAmount?: number; markupPercent?: number }) {
    const cost = this.itemCost(item);
    return (item.markupAmount ?? 0) + cost * ((item.markupPercent ?? 0) / 100);
  }

  private async replaceItems(tx: Prisma.TransactionClient, quotationId: string, items: CreateQuotationDto['items']) {
    await tx.quotationItem.deleteMany({ where: { quotationId } });
    await tx.quotationItem.createMany({ data: (items ?? []).filter((i) => i.serviceName).map((item, index) => {
      const cost = this.itemCost(item);
      const markup = this.itemMarkup(item);
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
      ...(dto.exchangeRate !== undefined ? { exchangeRate: dto.exchangeRate || 1 } : {}),
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

  private token(code: string) {
    return `${code.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36)}`;
  }

  private text(value?: string | null) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private date(value?: string | null) {
    return value ? new Date(value) : null;
  }
}

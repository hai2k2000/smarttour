import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, QuoteComboStatus, QuoteStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { containsSearch, normalizeListSearch } from '../list-search';
import { CreateQuoteComboDto, UpdateQuoteComboDto } from './dto/quote-combo.dto';
import { CreateQuoteTourDto, QuoteApprovalDto, UpdateQuoteTourDto } from './dto/quote-tour.dto';

type TourCostItemInput = NonNullable<CreateQuoteTourDto['costItems']>[number];
type TourItineraryInput = NonNullable<CreateQuoteTourDto['itineraries']>[number];
type ComboItemInput = NonNullable<CreateQuoteComboDto['items']>[number];

@Injectable()
export class QuotesService {
  constructor(private readonly prisma: PrismaService) {}

  listTourQuotes(search?: string) {
    const searchText = normalizeListSearch(search);
    const contains = searchText ? containsSearch(searchText) : undefined;
    return this.prisma.tourQuote.findMany({
      where: contains
        ? {
            OR: [
              { quoteCode: contains },
              { tourCode: contains },
              { tourName: contains },
              { customerName: contains },
              { customerPhone: contains },
            ],
          }
        : {},
      include: { _count: { select: { costItems: true, itineraries: true } } },
      orderBy: [{ updatedAt: 'desc' }, { quoteCode: 'asc' }],
    });
  }

  async getTourQuote(id: string) {
    const quote = await this.prisma.tourQuote.findUnique({
      where: { id },
      include: {
        costItems: { orderBy: [{ costType: 'asc' }, { sortOrder: 'asc' }] },
        itineraries: { orderBy: [{ sortOrder: 'asc' }, { dayNo: 'asc' }] },
      },
    });
    if (!quote) throw new NotFoundException('Tour quote not found');
    return quote;
  }

  async createTourQuote(dto: CreateQuoteTourDto) {
    const input = this.prepareTourQuoteDto(dto, true);
    this.validateTourDates(input);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const totals = this.calculateTourQuote(input);
        const quote = await tx.tourQuote.create({
          data: {
            ...this.toTourQuoteData(input),
            ...totals,
          } as Prisma.TourQuoteCreateInput,
        });
        await this.replaceTourQuoteChildren(tx, quote.id, input);
        return tx.tourQuote.findUniqueOrThrow({
          where: { id: quote.id },
          include: { costItems: true, itineraries: true },
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Quote code already exists');
      }
      throw error;
    }
  }

  async updateTourQuote(id: string, dto: UpdateQuoteTourDto) {
    const currentQuote = await this.getTourQuote(id);
    this.assertTourQuoteEditable(currentQuote.status);
    const input = this.prepareTourQuoteDto(dto, false);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const current = await tx.tourQuote.findUniqueOrThrow({
          where: { id },
          include: { costItems: true, itineraries: true },
        });
        this.assertTourQuoteEditable(current.status);
        const currentDto = this.toTourQuoteDto(current);
        const merged = {
          ...currentDto,
          ...input,
          costItems: input.costItems ?? currentDto.costItems,
          itineraries: input.itineraries ?? currentDto.itineraries,
        } as CreateQuoteTourDto;
        this.validateTourDates(merged);
        await tx.tourQuote.update({
          where: { id },
          data: {
            ...this.toTourQuoteData(input),
            ...this.calculateTourQuote(merged),
          },
        });
        await this.replaceTourQuoteChildren(tx, id, input);
        return tx.tourQuote.findUniqueOrThrow({
          where: { id },
          include: { costItems: true, itineraries: true },
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Quote code already exists');
      }
      throw error;
    }
  }

  async deleteTourQuote(id: string) {
    const quote = await this.getTourQuote(id);
    this.assertTourQuoteEditable(quote.status);
    return this.prisma.tourQuote.delete({ where: { id } });
  }

  async approveTourQuote(id: string, dto: QuoteApprovalDto) {
    const quote = await this.getTourQuote(id);
    if (quote.status === 'APPROVED') return quote;
    this.assertTourQuoteStatus(quote.status, ['DRAFT', 'PENDING', 'REJECTED'], 'approve');
    return this.prisma.tourQuote.update({
      where: { id },
      data: { status: 'APPROVED', approvedBy: this.optionalText(dto.approvedBy), approvalNote: this.optionalText(dto.approvalNote) },
    });
  }

  async rejectTourQuote(id: string, dto: QuoteApprovalDto) {
    const quote = await this.getTourQuote(id);
    if (quote.status === 'REJECTED') return quote;
    this.assertTourQuoteStatus(quote.status, ['DRAFT', 'PENDING'], 'reject');
    return this.prisma.tourQuote.update({
      where: { id },
      data: { status: 'REJECTED', approvedBy: this.optionalText(dto.approvedBy), approvalNote: this.optionalText(dto.approvalNote) },
    });
  }

  async convertTourQuote(id: string) {
    const quote = await this.getTourQuote(id);
    if (quote.status === 'CONVERTED') return quote;
    this.assertTourQuoteStatus(quote.status, ['APPROVED'], 'convert');
    return this.prisma.tourQuote.update({ where: { id }, data: { status: 'CONVERTED' } });
  }

  listComboQuotes(search?: string) {
    const searchText = normalizeListSearch(search);
    const contains = searchText ? containsSearch(searchText) : undefined;
    return this.prisma.quoteCombo.findMany({
      where: contains
        ? {
            OR: [
              { comboCode: contains },
              { comboType: contains },
            ],
          }
        : {},
      include: { _count: { select: { items: true } } },
      orderBy: [{ updatedAt: 'desc' }, { comboCode: 'asc' }],
    });
  }

  async getComboQuote(id: string) {
    const combo = await this.prisma.quoteCombo.findUnique({
      where: { id },
      include: { items: { include: { supplier: true, supplierService: true }, orderBy: { sortOrder: 'asc' } } },
    });
    if (!combo) throw new NotFoundException('Combo quote not found');
    return combo;
  }

  async createComboQuote(dto: CreateQuoteComboDto) {
    const input = await this.prepareComboDto(dto, true);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const combo = await tx.quoteCombo.create({
          data: {
            ...this.toComboData(input),
            ...this.calculateCombo(input),
          } as Prisma.QuoteComboCreateInput,
        });
        await this.replaceComboItems(tx, combo.id, input);
        return tx.quoteCombo.findUniqueOrThrow({ where: { id: combo.id }, include: { items: true } });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Combo code already exists');
      }
      throw error;
    }
  }

  async updateComboQuote(id: string, dto: UpdateQuoteComboDto) {
    const currentCombo = await this.getComboQuote(id);
    this.assertComboEditable(currentCombo.status);
    const input = await this.prepareComboDto(dto, false);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const current = await tx.quoteCombo.findUniqueOrThrow({ where: { id }, include: { items: true } });
        this.assertComboEditable(current.status);
        const currentDto = this.toComboDto(current);
        const merged = {
          ...currentDto,
          ...input,
          items: input.items ?? currentDto.items,
        } as CreateQuoteComboDto;
        await tx.quoteCombo.update({
          where: { id },
          data: {
            ...this.toComboData(input),
            ...this.calculateCombo(merged),
          },
        });
        await this.replaceComboItems(tx, id, input);
        return tx.quoteCombo.findUniqueOrThrow({ where: { id }, include: { items: true } });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Combo code already exists');
      }
      throw error;
    }
  }

  async deleteComboQuote(id: string) {
    const combo = await this.getComboQuote(id);
    this.assertComboEditable(combo.status);
    return this.prisma.quoteCombo.delete({ where: { id } });
  }

  async createQuoteFromCombo(id: string) {
    const combo = await this.getComboQuote(id);
    if (combo.status === 'QUOTED') return combo;
    this.assertComboStatus(combo.status, ['DRAFT'], 'quote');
    return this.prisma.quoteCombo.update({ where: { id }, data: { status: 'QUOTED' }, include: { items: true } });
  }

  async createOrderFromCombo(id: string) {
    const combo = await this.getComboQuote(id);
    if (combo.status === 'ORDER_CREATED') return combo;
    this.assertComboStatus(combo.status, ['QUOTED'], 'create order');
    return this.prisma.quoteCombo.update({ where: { id }, data: { status: 'ORDER_CREATED' }, include: { items: true } });
  }

  async recalculateCombo(id: string) {
    const combo = await this.getComboQuote(id);
    this.assertComboEditable(combo.status);
    const dto = {
      comboCode: combo.comboCode,
      comboType: combo.comboType,
      profitPerPax: Number(combo.profitPerPax),
      childPricePercent: Number(combo.childPricePercent),
      items: combo.items.map((item) => ({
        serviceName: item.serviceName,
        netPricePerService: Number(item.netPricePerService),
        nightCount: Number(item.nightCount),
        paxCount: Number(item.paxCount),
      })),
    };
    return this.prisma.quoteCombo.update({ where: { id }, data: this.calculateCombo(dto) });
  }

  private prepareTourQuoteDto<T extends Partial<CreateQuoteTourDto>>(dto: T, requireCostItems: boolean): T {
    const prepared = { ...dto } as Partial<CreateQuoteTourDto>;
    if (dto.costItems !== undefined || requireCostItems) {
      prepared.costItems = this.sanitizeTourCostItems(dto.costItems, requireCostItems || dto.costItems !== undefined);
    }
    if (dto.itineraries !== undefined) {
      prepared.itineraries = this.sanitizeTourItineraries(dto.itineraries);
    }
    return prepared as T;
  }

  private sanitizeTourCostItems(items: CreateQuoteTourDto['costItems'], requireOne: boolean): TourCostItemInput[] {
    const rows = (items ?? []).filter((item) => this.hasTourCostContent(item));
    if (requireOne && !rows.length) throw new BadRequestException('At least one cost item is required');
    return rows.map((item, index) => {
      const serviceType = this.optionalText(item.serviceType);
      const description = this.optionalText(item.description);
      if (!serviceType && !description) throw new BadRequestException(`Cost item ${index + 1} requires service type or description`);
      return {
        costType: item.costType,
        serviceType: serviceType ?? undefined,
        description: description ?? undefined,
        unit: this.optionalText(item.unit) ?? undefined,
        quantity: this.nonNegative(item.quantity, 1),
        serviceCount: this.nonNegative(item.serviceCount, 1),
        paxPerRoom: this.nonNegative(item.paxPerRoom, 1),
        currency: this.optionalText(item.currency) || 'VND',
        exchangeRate: this.nonNegative(item.exchangeRate, 1),
        unitPrice: this.nonNegative(item.unitPrice),
        vat: this.nonNegative(item.vat),
        note: this.optionalText(item.note) ?? undefined,
      };
    });
  }

  private sanitizeTourItineraries(items: CreateQuoteTourDto['itineraries']): TourItineraryInput[] {
    return (items ?? [])
      .filter((item) => this.optionalText(item.title) || this.optionalText(item.content))
      .map((item, index) => ({
        dayNo: Math.max(1, Math.floor(this.number(item.dayNo, index + 1))),
        title: this.optionalText(item.title) ?? undefined,
        content: this.optionalText(item.content) ?? undefined,
      }));
  }

  private hasTourCostContent(item: TourCostItemInput) {
    return Boolean(
      this.optionalText(item.serviceType) ||
      this.optionalText(item.description) ||
      this.optionalText(item.note) ||
      this.number(item.unitPrice) > 0 ||
      this.number(item.vat) > 0,
    );
  }

  private async prepareComboDto<T extends Partial<CreateQuoteComboDto>>(dto: T, requireItems: boolean): Promise<T> {
    const prepared = { ...dto } as Partial<CreateQuoteComboDto>;
    if (dto.items !== undefined || requireItems) {
      prepared.items = await this.sanitizeComboItems(dto.items, requireItems || dto.items !== undefined);
    }
    return prepared as T;
  }

  private async sanitizeComboItems(items: CreateQuoteComboDto['items'], requireOne: boolean): Promise<ComboItemInput[]> {
    const rows = (items ?? []).filter((item) => this.hasComboItemContent(item));
    if (requireOne && !rows.length) throw new BadRequestException('At least one combo item is required');
    const serviceIds = [...new Set(rows.map((item) => this.optionalText(item.serviceId)).filter((id): id is string => Boolean(id)))];
    const services = serviceIds.length
      ? await this.prisma.supplierService.findMany({ where: { id: { in: serviceIds } }, select: { id: true, supplierId: true, serviceName: true, netPrice: true } })
      : [];
    const serviceById = new Map(services.map((service) => [service.id, service]));

    return rows.map((item, index) => {
      const serviceId = this.optionalText(item.serviceId);
      const service = serviceId ? serviceById.get(serviceId) : undefined;
      if (serviceId && !service) throw new BadRequestException(`Combo item ${index + 1} references an unknown service`);
      const supplierId = this.optionalText(item.supplierId);
      if (service?.supplierId && supplierId && supplierId !== service.supplierId) {
        throw new BadRequestException(`Combo item ${index + 1} service does not belong to selected supplier`);
      }
      const serviceName = this.optionalText(item.serviceName) || this.optionalText(service?.serviceName);
      if (!serviceName || serviceName.length < 2) throw new BadRequestException(`Combo item ${index + 1} requires service name`);
      return {
        supplierId: supplierId || service?.supplierId || undefined,
        serviceId: service?.id || undefined,
        serviceName,
        checkIn: this.optionalText(item.checkIn) ?? undefined,
        netPricePerService: this.nonNegative(item.netPricePerService, service ? Number(service.netPrice) : 0),
        nightCount: this.positive(item.nightCount, 1),
        paxCount: this.positive(item.paxCount, 1),
      };
    });
  }

  private hasComboItemContent(item: ComboItemInput) {
    return Boolean(
      this.optionalText(item.serviceName) ||
      this.optionalText(item.serviceId) ||
      this.optionalText(item.supplierId) ||
      this.number(item.netPricePerService) > 0,
    );
  }

  private calculateTourQuote(dto: Partial<CreateQuoteTourDto>) {
    const items = dto.costItems ?? [];
    const itemAmount = (item: { quantity?: number; serviceCount?: number; exchangeRate?: number; unitPrice?: number; vat?: number }) =>
      (item.quantity ?? 1) * (item.serviceCount ?? 1) * (item.unitPrice ?? 0) * (item.exchangeRate ?? 1) + (item.vat ?? 0);
    const commonCostTotal = items.filter((item) => item.costType === 'COMMON').reduce((sum, item) => sum + itemAmount(item), 0);
    const privateCostTotal = items.filter((item) => item.costType === 'HOTEL' || item.costType === 'PRIVATE').reduce((sum, item) => sum + itemAmount(item), 0);
    const totalPax = Math.max(1, (dto.adultQty ?? 0) + (dto.childQty ?? 0) + (dto.infantQty ?? 0));
    const netPrice = commonCostTotal / totalPax + privateCostTotal;
    const profit = dto.profit ?? 0;
    const commission = dto.commission ?? 0;
    const discount = dto.discount ?? 0;
    const sellingPrice = Math.max(0, netPrice + profit + commission - discount);
    const childPricePercent = dto.childPricePercent ?? 75;
    const infantPricePercent = dto.infantPricePercent ?? 20;
    return {
      totalPax,
      commonCostTotal,
      privateCostTotal,
      netPrice,
      profit,
      commission,
      discount,
      sellingPrice,
      childPricePercent,
      childSellingPrice: sellingPrice * childPricePercent / 100,
      infantPricePercent,
      infantSellingPrice: sellingPrice * infantPricePercent / 100,
      profitRate: sellingPrice > 0 ? profit / sellingPrice * 100 : 0,
    };
  }

  private calculateCombo(dto: Partial<CreateQuoteComboDto>) {
    const totalNetPricePerPax = (dto.items ?? []).reduce((sum, item) => {
      const pax = Math.max(1, item.paxCount ?? 1);
      const nights = Math.max(1, item.nightCount ?? 1);
      return sum + ((item.netPricePerService ?? 0) * nights) / pax;
    }, 0);
    const profitPerPax = dto.profitPerPax ?? 0;
    const adultComboPrice = totalNetPricePerPax + profitPerPax;
    const childPricePercent = dto.childPricePercent ?? 75;
    return {
      totalNetPricePerPax,
      profitPerPax,
      adultComboPrice,
      childPricePercent,
      childComboPrice: adultComboPrice * childPricePercent / 100,
    };
  }

  private async replaceTourQuoteChildren(tx: Prisma.TransactionClient, quoteId: string, dto: Partial<CreateQuoteTourDto>) {
    if (dto.costItems) {
      await tx.quoteCostItem.deleteMany({ where: { quoteId } });
      await tx.quoteCostItem.createMany({
        data: dto.costItems.map((item, index) => {
          const amount = (item.quantity ?? 1) * (item.serviceCount ?? 1) * (item.unitPrice ?? 0) * (item.exchangeRate ?? 1) + (item.vat ?? 0);
          return {
            quoteId,
            costType: item.costType,
            serviceType: this.optionalText(item.serviceType),
            description: this.optionalText(item.description),
            unit: this.optionalText(item.unit),
            quantity: item.quantity ?? 1,
            serviceCount: item.serviceCount ?? 1,
            paxPerRoom: item.paxPerRoom ?? 1,
            currency: item.currency || 'VND',
            exchangeRate: item.exchangeRate ?? 1,
            unitPrice: item.unitPrice ?? 0,
            vat: item.vat ?? 0,
            amount,
            note: this.optionalText(item.note),
            sortOrder: index,
          };
        }),
      });
    }

    if (dto.itineraries) {
      await tx.quoteItinerary.deleteMany({ where: { quoteId } });
      const items = dto.itineraries.filter((item) => item.title || item.content);
      if (items.length) {
        await tx.quoteItinerary.createMany({
          data: items.map((item, index) => ({
            quoteId,
            dayNo: item.dayNo,
            title: this.optionalText(item.title),
            content: this.optionalText(item.content),
            sortOrder: index,
          })),
        });
      }
    }
  }

  private async replaceComboItems(tx: Prisma.TransactionClient, comboId: string, dto: Partial<CreateQuoteComboDto>) {
    if (!dto.items) return;
    await tx.quoteComboItem.deleteMany({ where: { comboId } });
    const items = dto.items.filter((item) => item.serviceName?.trim());
    if (!items.length) return;
    await tx.quoteComboItem.createMany({
      data: items.map((item, index) => {
        const pax = Math.max(1, item.paxCount ?? 1);
        const nights = Math.max(1, item.nightCount ?? 1);
        return {
          comboId,
          supplierId: this.optionalText(item.supplierId),
          serviceId: this.optionalText(item.serviceId),
          serviceName: item.serviceName.trim(),
          checkIn: this.optionalDate(item.checkIn),
          netPricePerService: item.netPricePerService ?? 0,
          nightCount: nights,
          paxCount: pax,
          netPricePerPax: ((item.netPricePerService ?? 0) * nights) / pax,
          sortOrder: index,
        };
      }),
    });
  }

  private toTourQuoteData(dto: Partial<CreateQuoteTourDto>) {
    return {
      ...(dto.quoteCode !== undefined ? { quoteCode: dto.quoteCode.trim() } : {}),
      ...(dto.tourCode !== undefined ? { tourCode: dto.tourCode.trim() } : {}),
      ...(dto.tourName !== undefined ? { tourName: this.optionalText(dto.tourName) } : {}),
      ...(dto.route !== undefined ? { route: this.optionalText(dto.route) } : {}),
      ...(dto.marketGroup !== undefined ? { marketGroup: this.optionalText(dto.marketGroup) } : {}),
      ...(dto.currency !== undefined ? { currency: dto.currency || 'VND' } : {}),
      ...(dto.exchangeRate !== undefined ? { exchangeRate: dto.exchangeRate || 1 } : {}),
      ...(dto.bookingDate !== undefined ? { bookingDate: this.optionalDate(dto.bookingDate) } : {}),
      ...(dto.paymentDate !== undefined ? { paymentDate: this.optionalDate(dto.paymentDate) } : {}),
      ...(dto.departureDate !== undefined ? { departureDate: this.optionalDate(dto.departureDate) } : {}),
      ...(dto.returnDate !== undefined ? { returnDate: this.optionalDate(dto.returnDate) } : {}),
      ...(dto.customerName !== undefined ? { customerName: this.optionalText(dto.customerName) } : {}),
      ...(dto.customerPhone !== undefined ? { customerPhone: this.optionalText(dto.customerPhone) } : {}),
      ...(dto.customerEmail !== undefined ? { customerEmail: this.optionalText(dto.customerEmail) } : {}),
      ...(dto.customerAddress !== undefined ? { customerAddress: this.optionalText(dto.customerAddress) } : {}),
      ...(dto.customerNote !== undefined ? { customerNote: this.optionalText(dto.customerNote) } : {}),
      ...(dto.operatorOwner !== undefined ? { operatorOwner: this.optionalText(dto.operatorOwner) } : {}),
      ...(dto.collaborator !== undefined ? { collaborator: this.optionalText(dto.collaborator) } : {}),
      ...(dto.adultQty !== undefined ? { adultQty: dto.adultQty } : {}),
      ...(dto.childQty !== undefined ? { childQty: dto.childQty } : {}),
      ...(dto.infantQty !== undefined ? { infantQty: dto.infantQty } : {}),
    };
  }

  private toComboData(dto: Partial<CreateQuoteComboDto>) {
    return {
      ...(dto.comboCode !== undefined ? { comboCode: dto.comboCode.trim() } : {}),
      ...(dto.comboType !== undefined ? { comboType: dto.comboType.trim() } : {}),
      ...(dto.note !== undefined ? { note: this.optionalText(dto.note) } : {}),
    };
  }

  private toTourQuoteDto(quote: Prisma.TourQuoteGetPayload<{ include: { costItems: true; itineraries: true } }>): CreateQuoteTourDto {
    return {
      quoteCode: quote.quoteCode,
      tourCode: quote.tourCode,
      tourName: quote.tourName ?? undefined,
      route: quote.route ?? undefined,
      marketGroup: quote.marketGroup ?? undefined,
      currency: quote.currency,
      exchangeRate: Number(quote.exchangeRate),
      bookingDate: quote.bookingDate?.toISOString(),
      paymentDate: quote.paymentDate?.toISOString(),
      departureDate: quote.departureDate?.toISOString(),
      returnDate: quote.returnDate?.toISOString(),
      customerName: quote.customerName ?? undefined,
      customerPhone: quote.customerPhone ?? undefined,
      customerEmail: quote.customerEmail ?? undefined,
      customerAddress: quote.customerAddress ?? undefined,
      customerNote: quote.customerNote ?? undefined,
      operatorOwner: quote.operatorOwner ?? undefined,
      collaborator: quote.collaborator ?? undefined,
      adultQty: quote.adultQty,
      childQty: quote.childQty,
      infantQty: quote.infantQty,
      profit: Number(quote.profit),
      commission: Number(quote.commission),
      discount: Number(quote.discount),
      childPricePercent: Number(quote.childPricePercent),
      infantPricePercent: Number(quote.infantPricePercent),
      costItems: quote.costItems.map((item) => ({
        costType: item.costType,
        serviceType: item.serviceType ?? undefined,
        description: item.description ?? undefined,
        unit: item.unit ?? undefined,
        quantity: Number(item.quantity),
        serviceCount: Number(item.serviceCount),
        paxPerRoom: Number(item.paxPerRoom),
        currency: item.currency,
        exchangeRate: Number(item.exchangeRate),
        unitPrice: Number(item.unitPrice),
        vat: Number(item.vat),
        note: item.note ?? undefined,
      })),
      itineraries: quote.itineraries.map((item) => ({
        dayNo: item.dayNo,
        title: item.title ?? undefined,
        content: item.content ?? undefined,
      })),
    };
  }

  private toComboDto(combo: Prisma.QuoteComboGetPayload<{ include: { items: true } }>): CreateQuoteComboDto {
    return {
      comboCode: combo.comboCode,
      comboType: combo.comboType,
      note: combo.note ?? undefined,
      profitPerPax: Number(combo.profitPerPax),
      childPricePercent: Number(combo.childPricePercent),
      items: combo.items.map((item) => ({
        supplierId: item.supplierId ?? undefined,
        serviceId: item.serviceId ?? undefined,
        serviceName: item.serviceName,
        checkIn: item.checkIn?.toISOString(),
        netPricePerService: Number(item.netPricePerService),
        nightCount: Number(item.nightCount),
        paxCount: Number(item.paxCount),
      })),
    };
  }

  private assertTourQuoteEditable(status: QuoteStatus) {
    this.assertTourQuoteStatus(status, ['DRAFT', 'PENDING', 'APPROVED', 'REJECTED'], 'edit');
  }

  private assertTourQuoteStatus(status: QuoteStatus, allowed: QuoteStatus[], action: string) {
    if (!allowed.includes(status)) throw new BadRequestException(`Cannot ${action} tour quote from status ${status}`);
  }

  private assertComboEditable(status: QuoteComboStatus) {
    this.assertComboStatus(status, ['DRAFT', 'QUOTED'], 'edit');
  }

  private assertComboStatus(status: QuoteComboStatus, allowed: QuoteComboStatus[], action: string) {
    if (!allowed.includes(status)) throw new BadRequestException(`Cannot ${action} combo from status ${status}`);
  }

  private validateTourDates(dto: Partial<CreateQuoteTourDto>) {
    this.assertDateOrder(dto.bookingDate, dto.paymentDate, 'Payment date must be after booking date');
    this.assertDateOrder(dto.departureDate, dto.returnDate, 'Return date must be after departure date');
  }

  private assertDateOrder(startValue: unknown, endValue: unknown, message: string) {
    const start = this.dateValue(startValue);
    const end = this.dateValue(endValue);
    if (start && end && end < start) throw new BadRequestException(message);
  }

  private optionalText(value?: string | null) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private optionalDate(value?: string | Date | null) {
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

  private positive(value: unknown, fallback = 1) {
    return Math.max(1, this.number(value, fallback));
  }
}

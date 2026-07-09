import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, QuoteComboStatus, QuoteStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { applyWriteDataScope, branchDepartmentScopeWhere, hasUnrestrictedDataScope, RequestUser } from '../auth/data-scope';
import { containsSearch, normalizeListSearch } from '../list-search';
import { DEFAULT_QUOTES_TAKE, ListQuotesQueryDto } from './dto/list-quotes-query.dto';
import { CreateQuoteComboDto, UpdateQuoteComboDto } from './dto/quote-combo.dto';
import { CreateQuoteTourDto, QuoteApprovalDto, UpdateQuoteTourDto } from './dto/quote-tour.dto';

type TourCostItemInput = NonNullable<CreateQuoteTourDto['costItems']>[number];
type TourItineraryInput = NonNullable<CreateQuoteTourDto['itineraries']>[number];
type ComboItemInput = NonNullable<CreateQuoteComboDto['items']>[number];

@Injectable()
export class QuotesService {
  constructor(private readonly prisma: PrismaService) {}

  listTourQuotes(query: ListQuotesQueryDto = {}, user?: RequestUser) {
    const searchText = normalizeListSearch(query.search);
    const contains = searchText ? containsSearch(searchText) : undefined;
    return this.prisma.tourQuote.findMany({
      where: this.tourQuoteScopeWhere(contains
        ? {
            OR: [
              { quoteCode: contains },
              { tourCode: contains },
              { tourName: contains },
              { customerName: contains },
              { customerPhone: contains },
            ],
          }
        : {}, user),
      include: { _count: { select: { costItems: true, itineraries: true } } },
      take: this.listTake(query.take),
      orderBy: [{ updatedAt: 'desc' }, { quoteCode: 'asc' }],
    });
  }

  private listTake(take?: number) {
    return take ?? DEFAULT_QUOTES_TAKE;
  }

  async getTourQuote(id: string, user?: RequestUser) {
    const quote = await this.prisma.tourQuote.findFirst({
      where: this.tourQuoteScopeWhere({ id }, user),
      include: {
        costItems: { orderBy: [{ costType: 'asc' }, { sortOrder: 'asc' }] },
        itineraries: { orderBy: [{ sortOrder: 'asc' }, { dayNo: 'asc' }] },
      },
    });
    if (!quote) throw new NotFoundException('Không tìm thấy báo giá tour.');
    return quote;
  }

  async createTourQuote(dto: CreateQuoteTourDto, user?: RequestUser) {
    const input = this.prepareTourQuoteDto(dto, true);
    this.validateTourDates(input);
    const customerId = await this.scopedTourQuoteCustomerId(input, user);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const totals = this.calculateTourQuote(input);
        const quote = await tx.tourQuote.create({
          data: {
            ...this.toTourQuoteData(input),
            ...totals,
            ...(customerId ? { customer: { connect: { id: customerId } } } : {}),
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
        throw new ConflictException('Mã báo giá tour đã tồn tại.');
      }
      throw error;
    }
  }

  async updateTourQuote(id: string, dto: UpdateQuoteTourDto, user?: RequestUser) {
    const currentQuote = await this.getTourQuote(id, user);
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
        throw new ConflictException('Mã báo giá tour đã tồn tại.');
      }
      throw error;
    }
  }

  async deleteTourQuote(id: string, user?: RequestUser) {
    const quote = await this.getTourQuote(id, user);
    this.assertTourQuoteEditable(quote.status);
    return this.prisma.tourQuote.delete({ where: { id } });
  }

  async approveTourQuote(id: string, dto: QuoteApprovalDto, user?: RequestUser) {
    const quote = await this.getTourQuote(id, user);
    if (quote.status === 'APPROVED') return quote;
    this.assertTourQuoteStatus(quote.status, ['DRAFT', 'PENDING', 'REJECTED'], 'approve');
    return this.prisma.tourQuote.update({
      where: { id },
      data: { status: 'APPROVED', approvedBy: this.actor(user), approvalNote: this.optionalText(dto.approvalNote) },
    });
  }

  async rejectTourQuote(id: string, dto: QuoteApprovalDto, user?: RequestUser) {
    const quote = await this.getTourQuote(id, user);
    if (quote.status === 'REJECTED') return quote;
    this.assertTourQuoteStatus(quote.status, ['DRAFT', 'PENDING'], 'reject');
    return this.prisma.tourQuote.update({
      where: { id },
      data: { status: 'REJECTED', approvedBy: this.actor(user), approvalNote: this.optionalText(dto.approvalNote) },
    });
  }

  async convertTourQuote(id: string, user?: RequestUser) {
    const quote = await this.getTourQuote(id, user);
    if (quote.status === 'CONVERTED') return quote;
    this.assertTourQuoteStatus(quote.status, ['APPROVED'], 'convert');
    return this.prisma.tourQuote.update({ where: { id }, data: { status: 'CONVERTED' } });
  }

  listComboQuotes(query: ListQuotesQueryDto = {}, user?: RequestUser) {
    const searchText = normalizeListSearch(query.search);
    const contains = searchText ? containsSearch(searchText) : undefined;
    return this.prisma.quoteCombo.findMany({
      where: this.quoteComboScopeWhere(contains
        ? {
            OR: [
              { comboCode: contains },
              { comboType: contains },
            ],
          }
        : {}, user),
      include: { _count: { select: { items: true } } },
      take: this.listTake(query.take),
      orderBy: [{ updatedAt: 'desc' }, { comboCode: 'asc' }],
    });
  }

  async getComboQuote(id: string, user?: RequestUser) {
    const combo = await this.prisma.quoteCombo.findFirst({
      where: this.quoteComboScopeWhere({ id }, user),
      include: { items: { include: { supplier: true, supplierService: true }, orderBy: { sortOrder: 'asc' } } },
    });
    if (!combo) throw new NotFoundException('Không tìm thấy báo giá combo.');
    return combo;
  }

  async createComboQuote(dto: CreateQuoteComboDto, user?: RequestUser) {
    const input = await this.prepareComboDto(dto, true);
    const scoped = applyWriteDataScope({} as { branch?: string | null; department?: string | null }, user);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const combo = await tx.quoteCombo.create({
          data: {
            ...this.toComboData(input),
            ...this.calculateCombo(input),
            createdBy: this.actor(user),
            branch: scoped.branch,
            department: scoped.department,
          } as Prisma.QuoteComboCreateInput,
        });
        await this.replaceComboItems(tx, combo.id, input);
        return tx.quoteCombo.findUniqueOrThrow({ where: { id: combo.id }, include: { items: true } });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Mã combo đã tồn tại.');
      }
      throw error;
    }
  }

  async updateComboQuote(id: string, dto: UpdateQuoteComboDto, user?: RequestUser) {
    const currentCombo = await this.getComboQuote(id, user);
    this.assertComboEditable(currentCombo.status);
    const input = await this.prepareComboDto(dto, false);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const current = await tx.quoteCombo.findFirstOrThrow({ where: this.quoteComboScopeWhere({ id }, user), include: { items: true } });
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
        throw new ConflictException('Mã combo đã tồn tại.');
      }
      throw error;
    }
  }

  async deleteComboQuote(id: string, user?: RequestUser) {
    const combo = await this.getComboQuote(id, user);
    this.assertComboEditable(combo.status);
    return this.prisma.quoteCombo.delete({ where: { id } });
  }

  async createQuoteFromCombo(id: string, user?: RequestUser) {
    const combo = await this.getComboQuote(id, user);
    if (combo.status === 'QUOTED') return combo;
    this.assertComboStatus(combo.status, ['DRAFT'], 'quote');
    return this.prisma.quoteCombo.update({ where: { id }, data: { status: 'QUOTED' }, include: { items: true } });
  }

  async createOrderFromCombo(id: string, user?: RequestUser) {
    const combo = await this.getComboQuote(id, user);
    if (combo.status === 'ORDER_CREATED') return combo;
    this.assertComboStatus(combo.status, ['QUOTED'], 'create order');
    return this.prisma.quoteCombo.update({ where: { id }, data: { status: 'ORDER_CREATED' }, include: { items: true } });
  }

  async recalculateCombo(id: string, user?: RequestUser) {
    const combo = await this.getComboQuote(id, user);
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
    if (requireOne && !rows.length) throw new BadRequestException('Cần ít nhất một dòng chi phí cho báo giá tour.');
    return rows.map((item, index) => {
      const serviceType = this.optionalText(item.serviceType);
      const description = this.optionalText(item.description);
      if (!serviceType && !description) throw new BadRequestException(`Dòng chi phí ${index + 1} cần loại dịch vụ hoặc mô tả.`);
      return {
        costType: item.costType,
        serviceType: serviceType ?? undefined,
        description: description ?? undefined,
        unit: this.optionalText(item.unit) ?? undefined,
        quantity: this.positiveInput(item.quantity ?? 1, `S? l??ng d?ng chi ph? tour ${index + 1}`),
        serviceCount: this.positiveInput(item.serviceCount ?? 1, `S? l?n d?ch v? d?ng chi ph? tour ${index + 1}`),
        paxPerRoom: this.positiveInput(item.paxPerRoom ?? 1, `S? kh?ch/ph?ng d?ng chi ph? tour ${index + 1}`),
        currency: this.optionalText(item.currency) || 'VND',
        exchangeRate: this.positiveInput(item.exchangeRate ?? 1, `T? gi? d?ng chi ph? tour ${index + 1}`),
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
    if (requireOne && !rows.length) throw new BadRequestException('Cần ít nhất một dòng dịch vụ cho combo.');
    const serviceIds = [...new Set(rows.map((item) => this.optionalText(item.serviceId)).filter((id): id is string => Boolean(id)))];
    const services = serviceIds.length
      ? await this.prisma.supplierService.findMany({ where: { id: { in: serviceIds } }, select: { id: true, supplierId: true, serviceName: true, netPrice: true } })
      : [];
    const serviceById = new Map(services.map((service) => [service.id, service]));

    return rows.map((item, index) => {
      const serviceId = this.optionalText(item.serviceId);
      const service = serviceId ? serviceById.get(serviceId) : undefined;
      if (serviceId && !service) throw new BadRequestException(`Dòng dịch vụ combo ${index + 1} tham chiếu dịch vụ không tồn tại.`);
      const supplierId = this.optionalText(item.supplierId);
      if (service?.supplierId && supplierId && supplierId !== service.supplierId) {
        throw new BadRequestException(`Dịch vụ ở dòng combo ${index + 1} không thuộc nhà cung cấp đã chọn.`);
      }
      const serviceName = this.optionalText(item.serviceName) || this.optionalText(service?.serviceName);
      if (!serviceName || serviceName.length < 2) throw new BadRequestException(`Dòng dịch vụ combo ${index + 1} cần tên dịch vụ tối thiểu 2 ký tự.`);
      return {
        supplierId: supplierId || service?.supplierId || undefined,
        serviceId: service?.id || undefined,
        serviceName,
        checkIn: this.optionalText(item.checkIn) ?? undefined,
        netPricePerService: this.nonNegative(item.netPricePerService, service ? Number(service.netPrice) : 0),
        nightCount: this.positiveInput(item.nightCount ?? 1, `Số đêm dòng combo ${index + 1}`),
        paxCount: this.positiveInput(item.paxCount ?? 1, `Số khách dòng combo ${index + 1}`),
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
      ...(dto.exchangeRate !== undefined ? { exchangeRate: this.positiveInput(dto.exchangeRate, 'Tỷ giá báo giá tour') } : {}),
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

  private tourQuoteScopeWhere(where: Prisma.TourQuoteWhereInput, user?: RequestUser): Prisma.TourQuoteWhereInput {
    if (!user || hasUnrestrictedDataScope(user)) return where;
    return {
      AND: [
        where,
        { customer: { is: branchDepartmentScopeWhere<Prisma.CustomerWhereInput>({ mergedIntoId: null }, user) } },
      ],
    };
  }

  private quoteComboScopeWhere(where: Prisma.QuoteComboWhereInput, user?: RequestUser): Prisma.QuoteComboWhereInput {
    if (!user || hasUnrestrictedDataScope(user)) return where;
    return branchDepartmentScopeWhere(where, user);
  }

  private async scopedTourQuoteCustomerId(dto: Partial<CreateQuoteTourDto>, user?: RequestUser) {
    const identity: Prisma.CustomerWhereInput[] = [];
    const phone = this.optionalText(dto.customerPhone);
    const email = this.optionalText(dto.customerEmail);
    const fullName = this.optionalText(dto.customerName);
    if (phone) identity.push({ phone });
    if (email) identity.push({ email });
    if (fullName) identity.push({ fullName });
    const unrestricted = !user || hasUnrestrictedDataScope(user);
    if (!identity.length) {
      if (unrestricted) return undefined;
      throw new BadRequestException('Báo giá tour theo phạm vi dữ liệu cần gắn với khách hàng thuộc phạm vi của bạn.');
    }
    const where: Prisma.CustomerWhereInput = { mergedIntoId: null, AND: identity };
    const customer = await this.prisma.customer.findFirst({
      where: unrestricted ? where : branchDepartmentScopeWhere(where, user),
      select: { id: true },
    });
    if (!customer && !unrestricted) throw new BadRequestException('Không thể tạo báo giá tour cho khách hàng ngoài phạm vi dữ liệu của bạn.');
    return customer?.id;
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
    if (!allowed.includes(status)) {
      throw new BadRequestException(`Không thể ${this.tourQuoteActionLabel(action)} báo giá tour từ trạng thái ${this.tourQuoteStatusLabel(status)}.`);
    }
  }

  private assertComboEditable(status: QuoteComboStatus) {
    this.assertComboStatus(status, ['DRAFT', 'QUOTED'], 'edit');
  }

  private assertComboStatus(status: QuoteComboStatus, allowed: QuoteComboStatus[], action: string) {
    if (!allowed.includes(status)) {
      throw new BadRequestException(`Không thể ${this.comboActionLabel(action)} combo từ trạng thái ${this.comboStatusLabel(status)}.`);
    }
  }

  private validateTourDates(dto: Partial<CreateQuoteTourDto>) {
    this.assertDateOrder(dto.bookingDate, dto.paymentDate, 'Ngày thanh toán phải sau ngày đặt dịch vụ.');
    this.assertDateOrder(dto.departureDate, dto.returnDate, 'Ngày kết thúc phải sau ngày khởi hành.');
  }

  private assertDateOrder(startValue: unknown, endValue: unknown, message: string) {
    const start = this.dateValue(startValue);
    const end = this.dateValue(endValue);
    if (start && end && end < start) throw new BadRequestException(message);
  }

  private actor(user?: RequestUser) {
    return user?.username || user?.email || user?.id || 'system';
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
    if (!(value instanceof Date)) {
      const raw = String(value).trim();
      const datePrefix = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(raw);
      if (datePrefix) {
        const year = Number(datePrefix[1]);
        const month = Number(datePrefix[2]);
        const day = Number(datePrefix[3]);
        const utc = new Date(Date.UTC(year, month - 1, day));
        if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) throw new BadRequestException('Ng?y kh?ng h?p l?.');
      }
    }
    const date = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(date.getTime())) throw new BadRequestException('Ngày không hợp lệ.');
    return date;
  }

  private tourQuoteActionLabel(action: string) {
    return ({
      approve: 'chốt',
      reject: 'từ chối',
      convert: 'chuyển thành đơn hàng',
      edit: 'chỉnh sửa',
      delete: 'xóa',
    } as Record<string, string>)[action] ?? action;
  }

  private tourQuoteStatusLabel(status: string) {
    return ({
      DRAFT: 'Nháp',
      PENDING: 'Chờ duyệt',
      APPROVED: 'Đã chốt',
      REJECTED: 'Từ chối',
      CONVERTED: 'Đã tạo đơn',
    } as Record<string, string>)[status] ?? status;
  }

  private comboActionLabel(action: string) {
    return ({
      quote: 'chốt báo giá',
      'create order': 'tạo đơn hàng',
      edit: 'chỉnh sửa',
      delete: 'xóa',
    } as Record<string, string>)[action] ?? action;
  }

  private comboStatusLabel(status: string) {
    return ({
      DRAFT: 'Nháp',
      QUOTED: 'Đã chốt báo giá',
      ORDER_CREATED: 'Đã tạo đơn hàng',
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

  private positive(value: unknown, fallback = 1) {
    return Math.max(1, this.number(value, fallback));
  }

  private positiveInput(value: unknown, label: string) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) throw new BadRequestException(`${label} phải lớn hơn 0`);
    return number;
  }
}

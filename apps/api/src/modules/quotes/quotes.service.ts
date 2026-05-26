import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateQuoteComboDto, UpdateQuoteComboDto } from './dto/quote-combo.dto';
import { CreateQuoteTourDto, QuoteApprovalDto, UpdateQuoteTourDto } from './dto/quote-tour.dto';

@Injectable()
export class QuotesService {
  constructor(private readonly prisma: PrismaService) {}

  listTourQuotes(search?: string) {
    return this.prisma.tourQuote.findMany({
      where: search
        ? {
            OR: [
              { quoteCode: { contains: search, mode: 'insensitive' } },
              { tourCode: { contains: search, mode: 'insensitive' } },
              { tourName: { contains: search, mode: 'insensitive' } },
              { customerName: { contains: search, mode: 'insensitive' } },
              { customerPhone: { contains: search, mode: 'insensitive' } },
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
    try {
      return await this.prisma.$transaction(async (tx) => {
        const totals = this.calculateTourQuote(dto);
        const quote = await tx.tourQuote.create({
          data: {
            ...this.toTourQuoteData(dto),
            ...totals,
          } as Prisma.TourQuoteCreateInput,
        });
        await this.replaceTourQuoteChildren(tx, quote.id, dto);
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
    await this.getTourQuote(id);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const current = await tx.tourQuote.findUniqueOrThrow({
          where: { id },
          include: { costItems: true, itineraries: true },
        });
        const merged = {
          ...current,
          ...dto,
          costItems: dto.costItems ?? current.costItems.map((item) => ({
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
        } as CreateQuoteTourDto;
        await tx.tourQuote.update({
          where: { id },
          data: {
            ...this.toTourQuoteData(dto),
            ...this.calculateTourQuote(merged),
          },
        });
        await this.replaceTourQuoteChildren(tx, id, dto);
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
    await this.getTourQuote(id);
    return this.prisma.tourQuote.delete({ where: { id } });
  }

  async approveTourQuote(id: string, dto: QuoteApprovalDto) {
    await this.getTourQuote(id);
    return this.prisma.tourQuote.update({
      where: { id },
      data: { status: 'APPROVED', approvedBy: this.optionalText(dto.approvedBy), approvalNote: this.optionalText(dto.approvalNote) },
    });
  }

  async rejectTourQuote(id: string, dto: QuoteApprovalDto) {
    await this.getTourQuote(id);
    return this.prisma.tourQuote.update({
      where: { id },
      data: { status: 'REJECTED', approvedBy: this.optionalText(dto.approvedBy), approvalNote: this.optionalText(dto.approvalNote) },
    });
  }

  async convertTourQuote(id: string) {
    await this.getTourQuote(id);
    return this.prisma.tourQuote.update({ where: { id }, data: { status: 'CONVERTED' } });
  }

  listComboQuotes(search?: string) {
    return this.prisma.quoteCombo.findMany({
      where: search
        ? {
            OR: [
              { comboCode: { contains: search, mode: 'insensitive' } },
              { comboType: { contains: search, mode: 'insensitive' } },
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
    try {
      return await this.prisma.$transaction(async (tx) => {
        const combo = await tx.quoteCombo.create({
          data: {
            ...this.toComboData(dto),
            ...this.calculateCombo(dto),
          } as Prisma.QuoteComboCreateInput,
        });
        await this.replaceComboItems(tx, combo.id, dto);
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
    await this.getComboQuote(id);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const current = await tx.quoteCombo.findUniqueOrThrow({ where: { id }, include: { items: true } });
        const merged = {
          ...current,
          ...dto,
          items: dto.items ?? current.items.map((item) => ({
            supplierId: item.supplierId ?? undefined,
            serviceId: item.serviceId ?? undefined,
            serviceName: item.serviceName,
            checkIn: item.checkIn?.toISOString(),
            netPricePerService: Number(item.netPricePerService),
            nightCount: Number(item.nightCount),
            paxCount: Number(item.paxCount),
          })),
        } as CreateQuoteComboDto;
        await tx.quoteCombo.update({
          where: { id },
          data: {
            ...this.toComboData(dto),
            ...this.calculateCombo(merged),
          },
        });
        await this.replaceComboItems(tx, id, dto);
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
    await this.getComboQuote(id);
    return this.prisma.quoteCombo.delete({ where: { id } });
  }

  async createQuoteFromCombo(id: string) {
    await this.getComboQuote(id);
    return this.prisma.quoteCombo.update({ where: { id }, data: { status: 'QUOTED' } });
  }

  async createOrderFromCombo(id: string) {
    await this.getComboQuote(id);
    return this.prisma.quoteCombo.update({ where: { id }, data: { status: 'ORDER_CREATED' } });
  }

  async recalculateCombo(id: string) {
    const combo = await this.getComboQuote(id);
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

  private optionalText(value?: string | null) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private optionalDate(value?: string | null) {
    return value ? new Date(value) : null;
  }
}

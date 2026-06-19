import { BadRequestException, Injectable } from '@nestjs/common';
import { FitServiceStatus, FitTourWorkflowStatus, Prisma } from '@prisma/client';
import { FIT_TOUR_DATE_PATTERN } from './dto/create-fit-tour.dto';
import { UpdateFitTourDto } from './dto/update-fit-tour.dto';
import { FIT_DEFAULT_HANDOVER_ITEMS, FIT_DEFAULT_SURVEY_QUESTIONS } from './fit-tour-defaults';

type Row = Record<string, unknown>;
type FitLegacyChildDelegate<T extends Row> = {
  deleteMany(args: { where: { fitTourId: string } }): Promise<unknown>;
  createMany(args: { data: T[] }): Promise<unknown>;
};

@Injectable()
export class FitTourLegacyCompatService {
  toFitTourData(dto: UpdateFitTourDto, creating: boolean): Prisma.FitTourUncheckedCreateInput | Prisma.FitTourUncheckedUpdateInput {
    const requiredCreate = creating
      ? {
          quoteCode: this.requiredText(dto.quoteCode, 'C\u1ea7n nh\u1eadp m\u00e3 b\u00e1o gi\u00e1').toUpperCase(),
          tourCode: this.requiredText(dto.tourCode, 'C\u1ea7n nh\u1eadp m\u00e3 tour').toUpperCase(),
          customerName: this.requiredText(dto.customerName, 'C\u1ea7n nh\u1eadp t\u00ean kh\u00e1ch h\u00e0ng'),
        }
      : {};

    return {
      ...requiredCreate,
      ...(dto.quoteCode !== undefined ? { quoteCode: dto.quoteCode.trim().toUpperCase() } : {}),
      ...(dto.tourCode !== undefined ? { tourCode: dto.tourCode.trim().toUpperCase() } : {}),
      ...(dto.customerName !== undefined ? { customerName: dto.customerName.trim() } : {}),
      ...(dto.tourName !== undefined ? { tourName: this.optionalText(dto.tourName) } : {}),
      ...(dto.marketGroup !== undefined ? { marketGroup: this.optionalText(dto.marketGroup) } : {}),
      ...(dto.bookingDate !== undefined ? { bookingDate: this.optionalDate(dto.bookingDate) } : {}),
      ...(dto.startDate !== undefined ? { startDate: this.optionalDate(dto.startDate) } : {}),
      ...(dto.endDate !== undefined ? { endDate: this.optionalDate(dto.endDate) } : {}),
      ...(dto.phone !== undefined ? { phone: this.optionalText(dto.phone) } : {}),
      ...(dto.email !== undefined ? { email: this.optionalText(dto.email) } : {}),
      ...(dto.notes !== undefined ? { notes: this.optionalText(dto.notes) } : {}),
      ...(dto.adultCount !== undefined ? { adultCount: this.number(dto.adultCount) } : creating ? { adultCount: 1 } : {}),
      ...(dto.childCount !== undefined ? { childCount: this.number(dto.childCount) } : {}),
      ...(dto.infantCount !== undefined ? { infantCount: this.number(dto.infantCount) } : {}),
      ...(dto.sellingPrice !== undefined ? { sellingPrice: this.number(dto.sellingPrice) } : {}),
      ...(dto.commissionPerGuest !== undefined ? { commissionPerGuest: this.number(dto.commissionPerGuest) } : {}),
      ...(dto.workflowStatus !== undefined ? { workflowStatus: dto.workflowStatus } : creating ? { workflowStatus: FitTourWorkflowStatus.DRAFT } : {}),
      ...(dto.allowOverbooking !== undefined ? { allowOverbooking: Boolean(dto.allowOverbooking) } : {}),
      ...this.pickOptionalText(dto as Record<string, unknown>, [
        'flightRoute',
        'tourType',
        'exchangeRateCode',
        'operatorOwner',
        'transportMode',
        'outboundRoute',
        'outboundCarrier',
        'returnRoute',
        'returnCarrier',
        'pickupPoint',
        'dropoffPoint',
        'handoverGuideRequest',
        'surveyDescription',
      ]),
      ...this.pickOptionalNumbers(dto as Record<string, unknown>, [
        'exchangeRate',
        'seatCount',
        'tourPrice',
        'discount',
        'adultPrice',
        'childPrice25',
        'childPrice611',
        'infantPrice',
        'surcharge',
      ]),
      ...this.pickOptionalDates(dto as Record<string, unknown>, ['visaDeadline', 'holdUntil', 'confirmedAt', 'closeAt']),
    };
  }

  toChildCreateData(dto: UpdateFitTourDto): Pick<
    Prisma.FitTourCreateInput,
    'commonCosts' | 'hotelCosts' | 'privateCosts' | 'budgetServices' | 'operationServices' | 'guides' | 'handoverItems' | 'surveyQuestions' | 'attachments'
  > {
    const totalPax = this.totalPax(dto);
    return {
      commonCosts: { create: this.mapCommonCosts(dto.commonCosts) },
      hotelCosts: { create: this.mapHotelCosts(dto.hotelCosts, totalPax) },
      privateCosts: { create: this.mapPrivateCosts(dto.privateCosts) },
      budgetServices: { create: this.mapBudgetServices(dto.budgetServices) },
      operationServices: { create: this.mapOperationServices(dto.operationServices) },
      guides: { create: this.mapGuides(dto.guides) },
      handoverItems: { create: this.mapHandoverItems(dto.handoverItems) },
      surveyQuestions: { create: this.mapSurveyQuestions(dto.surveyQuestions) },
      attachments: { create: this.mapAttachments(dto.attachments) },
    };
  }

  async syncChildren(tx: Prisma.TransactionClient, fitTourId: string, dto: UpdateFitTourDto, totalPax = this.totalPax(dto)) {
    if (this.hasChanges(dto, 'commonCosts')) await this.replaceFitChildren(tx.fitCommonCost, fitTourId, this.mapCommonCosts(dto.commonCosts));
    if (this.hasChanges(dto, 'hotelCosts')) await this.replaceFitChildren(tx.fitHotelCost, fitTourId, this.mapHotelCosts(dto.hotelCosts, totalPax));
    if (this.hasChanges(dto, 'privateCosts')) await this.replaceFitChildren(tx.fitPrivateCost, fitTourId, this.mapPrivateCosts(dto.privateCosts));
    if (this.hasChanges(dto, 'budgetServices')) await this.replaceBudgetServices(tx, fitTourId, this.mapBudgetServices(dto.budgetServices));
    if (this.hasChanges(dto, 'operationServices')) await this.replaceOperationServices(tx, fitTourId, this.mapOperationServices(dto.operationServices));
    if (this.hasChanges(dto, 'guides')) await this.replaceFitChildren(tx.fitTourGuide, fitTourId, this.mapGuides(dto.guides));
    if (this.hasChanges(dto, 'handoverItems')) await this.replaceFitChildren(tx.fitHandoverItem, fitTourId, this.mapHandoverItems(dto.handoverItems));
    if (this.hasChanges(dto, 'surveyQuestions')) await this.replaceFitChildren(tx.fitSurveyQuestion, fitTourId, this.mapSurveyQuestions(dto.surveyQuestions));
    if (this.hasChanges(dto, 'attachments')) await this.replaceFitChildren(tx.fitAttachment, fitTourId, this.mapAttachments(dto.attachments));
  }

  async replaceBudgetServices(tx: Prisma.TransactionClient, fitTourId: string, rows: ReturnType<FitTourLegacyCompatService['mapBudgetServices']>) {
    await this.replaceFitChildren(tx.fitBudgetService, fitTourId, rows);
  }

  async replaceOperationServices(tx: Prisma.TransactionClient, fitTourId: string, rows: unknown[]) {
    await this.replaceFitChildren(tx.fitOperationService, fitTourId, this.mapOperationServices(rows));
  }

  private hasChanges(dto: UpdateFitTourDto, key: keyof UpdateFitTourDto) {
    return Object.prototype.hasOwnProperty.call(dto as Row, key);
  }

  private async replaceFitChildren<T extends Row>(delegate: FitLegacyChildDelegate<T & { fitTourId: string }>, fitTourId: string, rows: T[]) {
    await delegate.deleteMany({ where: { fitTourId } });
    if (rows.length) await delegate.createMany({ data: rows.map((row) => ({ fitTourId, ...row })) as (T & { fitTourId: string })[] });
  }

  mapCommonCosts(rows?: unknown[]) {
    return this.rows(rows).map((row, index) => {
      const quantity = this.number(row.quantity);
      const times = this.number(row.times ?? 1);
      const exchangeRate = this.number(row.exchangeRate ?? 1);
      const unitPrice = this.number(row.unitPrice);
      const vat = this.number(row.vat);
      return {
        orderNo: this.number(row.orderNo || row.stt || index + 1),
        serviceType: this.text(row.serviceType || row.loaiDichVu || 'Dịch vụ'),
        description: this.optionalText(row.description),
        unit: this.optionalText(row.unit),
        quantity,
        times,
        currency: this.text(row.currency || 'VND'),
        exchangeRate,
        unitPrice,
        vat,
        amount: this.money(row.amount, quantity * times * exchangeRate * unitPrice, vat),
        notes: this.optionalText(row.notes),
      };
    });
  }

  mapHotelCosts(rows?: unknown[], totalPax = 1) {
    return this.rows(rows).map((row, index) => {
      const paxPerRoom = this.positiveNumber(row.paxPerRoom, 1);
      const rooms = Math.ceil(Math.max(1, totalPax) / paxPerRoom);
      const times = this.number(row.times ?? 1);
      const exchangeRate = this.number(row.exchangeRate ?? 1);
      const unitPrice = this.number(row.unitPrice);
      const vat = this.number(row.vat);
      return {
        orderNo: this.number(row.orderNo || row.stt || index + 1),
        serviceType: this.text(row.serviceType || 'Khách sạn'),
        description: this.optionalText(row.description),
        unit: this.optionalText(row.unit),
        paxPerRoom,
        times,
        currency: this.text(row.currency || 'VND'),
        exchangeRate,
        unitPrice,
        vat,
        amount: this.money(row.amount, rooms * times * exchangeRate * unitPrice, vat),
        notes: this.optionalText(row.notes),
      };
    });
  }

  mapPrivateCosts(rows?: unknown[]) {
    return this.mapCommonCosts(rows);
  }

  mapBudgetServices(rows?: unknown[]) {
    return this.rows(rows).map((row) => {
      const quantity = this.number(row.quantity);
      const unitPrice = this.number(row.unitPrice);
      const vat = this.number(row.vat);
      return {
        serviceType: this.text(row.serviceType || 'Dịch vụ'),
        supplierId: this.optionalText(row.supplierId),
        description: this.optionalText(row.description),
        quantity,
        unitPrice,
        vat,
        amount: this.money(row.amount, quantity * unitPrice, vat),
        notes: this.optionalText(row.notes),
      };
    });
  }

  mapOperationServices(rows?: unknown[]) {
    return this.rows(rows).map((row) => {
      const quantity = this.number(row.quantity);
      const confirmedUnitPrice = this.number(row.confirmedUnitPrice);
      const vat = this.number(row.vat);
      return {
        serviceType: this.text(row.serviceType || 'Dịch vụ'),
        supplierId: this.optionalText(row.supplierId),
        supplierServiceId: this.optionalText(row.supplierServiceId || row.serviceId),
        bookingCode: this.optionalText(row.bookingCode),
        quantity,
        confirmedUnitPrice,
        vat,
        amount: this.money(row.amount, quantity * confirmedUnitPrice, vat),
        status: this.toServiceStatus(row.status),
        notes: this.optionalText(row.notes),
      };
    });
  }

  mapGuides(rows?: unknown[]) {
    return this.rows(rows).map((row) => ({
      guideId: this.optionalText(row.guideId),
      name: this.text(row.name || row.ten || 'Guide'),
      phone: this.optionalText(row.phone),
      guideType: this.optionalText(row.guideType),
      notes: this.optionalText(row.notes),
    }));
  }

  mapHandoverItems(rows?: unknown[]) {
    const source = rows === undefined ? FIT_DEFAULT_HANDOVER_ITEMS.map((itemName, index) => ({ itemName, quantity: 1, orderNo: index + 1 })) : rows;
    return this.rows(source).map((row, index) => ({
      orderNo: this.number(row.orderNo || row.stt || index + 1),
      itemName: this.text(row.itemName || row.name || 'Tài liệu bàn giao'),
      quantity: this.number(row.quantity ?? 1),
      notes: this.optionalText(row.notes),
    }));
  }

  mapSurveyQuestions(rows?: unknown[]) {
    const source = rows === undefined ? FIT_DEFAULT_SURVEY_QUESTIONS.map((question, index) => ({ question, orderNo: index + 1 })) : rows;
    return this.rows(source).map((row, index) => ({
      orderNo: this.number(row.orderNo || row.stt || index + 1),
      question: this.text(row.question || 'Câu hỏi'),
      notes: this.optionalText(row.notes),
    }));
  }

  mapAttachments(rows?: unknown[]) {
    return this.rows(rows).map((row) => ({
      step: this.toAttachmentStep(row.step),
      fileName: this.text(row.fileName || row.name || 'attachment'),
      fileUrl: this.optionalText(row.fileUrl),
      mimeType: this.optionalText(row.mimeType),
      size: row.size === undefined || row.size === null ? null : this.number(row.size),
    }));
  }

  async addAttachment(tx: Prisma.TransactionClient, fitTourId: string, attachment: unknown) {
    const [row] = this.mapAttachments([attachment]);
    return tx.fitAttachment.create({ data: { ...row, fitTourId } });
  }

  async removeAttachment(tx: Prisma.TransactionClient, fitTourId: string, attachment: { legacyId?: string | null; fileName?: string | null; fileUrl?: string | null; step?: string | null }) {
    if (attachment.legacyId) {
      await tx.fitAttachment.deleteMany({ where: { id: attachment.legacyId, fitTourId } });
      return;
    }
    await tx.fitAttachment.deleteMany({
      where: {
        fitTourId,
        fileName: attachment.fileName || undefined,
        fileUrl: attachment.fileUrl || null,
        step: attachment.step || null,
      },
    });
  }

  toCopiedBudgetRows(rows: unknown[]) {
    return this.rows(rows).map((row) => ({
      serviceType: this.text(row.serviceType || 'Dịch vụ'),
      supplierId: this.optionalText(row.supplierId),
      description: this.optionalText(row.description),
      quantity: this.number(row.quantity),
      unitPrice: this.number(row.unitPrice),
      vat: this.number(row.vat),
      amount: this.number(row.amount),
      notes: this.optionalText(row.notes),
    }));
  }

  toCopiedOperationRows(rows: unknown[]) {
    return this.rows(rows).map((row) => ({
      serviceType: this.text(row.serviceType || 'Dịch vụ'),
      supplierId: this.optionalText(row.supplierId),
      supplierServiceId: this.optionalText(row.supplierServiceId || row.serviceId),
      description: this.optionalText(row.description),
      bookingCode: this.optionalText(row.bookingCode),
      quantity: this.number(row.quantity),
      confirmedUnitPrice: this.number(row.confirmedUnitPrice ?? row.unitPrice),
      vat: this.number(row.vat),
      amount: this.number(row.amount),
      status: this.toServiceStatus(row.status || FitServiceStatus.WAITING),
      notes: this.optionalText(row.notes),
    }));
  }

  private rows(rows?: unknown[]): Row[] {
    return (rows || []).filter((row): row is Row => Boolean(row) && typeof row === 'object');
  }

  private text(value: unknown) {
    return String(value || '').trim();
  }

  private requiredText(value: unknown, field: string) {
    const text = this.text(value);
    if (!text) throw new BadRequestException(field);
    return text;
  }

  private optionalText(value: unknown) {
    const text = this.text(value);
    return text ? text : null;
  }

  private optionalDate(value: unknown, field = 'date') {
    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) throw new BadRequestException(`${field} không hợp lệ`);
      return value;
    }
    const text = this.text(value);
    if (!text) return null;
    if (!FIT_TOUR_DATE_PATTERN.test(text)) throw new BadRequestException(`${field} phải có định dạng YYYY-MM-DD`);
    const [year, month, day] = text.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
      throw new BadRequestException(`${field} không hợp lệ`);
    }
    return date;
  }

  private number(value: unknown) {
    const number = Number(value || 0);
    return Number.isFinite(number) ? number : 0;
  }

  private positiveNumber(value: unknown, fallback = 1) {
    const number = this.number(value);
    return number > 0 ? number : fallback;
  }

  private totalPax(dto: UpdateFitTourDto) {
    return Math.max(1, this.number(dto.adultCount) + this.number(dto.childCount) + this.number(dto.infantCount));
  }

  private money(explicitAmount: unknown, subtotal: number, vat: number) {
    const hasExplicitAmount = explicitAmount !== undefined && explicitAmount !== null && String(explicitAmount).trim() !== '';
    return hasExplicitAmount ? this.number(explicitAmount) : subtotal * (1 + vat / 100);
  }

  private toAttachmentStep(step: unknown) {
    const value = this.text(step);
    if (!value) return null;
    if (Object.values(FitTourWorkflowStatus).includes(value as FitTourWorkflowStatus)) return value;
    throw new BadRequestException('Bước workflow của file đính kèm không hợp lệ');
  }

  private toServiceStatus(status: unknown) {
    const value = this.text(status);
    if (Object.values(FitServiceStatus).includes(value as FitServiceStatus)) return value as FitServiceStatus;
    return FitServiceStatus.WAITING;
  }

  private pickOptionalText(dto: Record<string, unknown>, fields: string[]) {
    return Object.fromEntries(fields.filter((field) => dto[field] !== undefined).map((field) => [field, this.optionalText(dto[field])]));
  }

  private pickOptionalNumbers(dto: Record<string, unknown>, fields: string[]) {
    return Object.fromEntries(fields.filter((field) => dto[field] !== undefined).map((field) => [field, this.number(dto[field])]));
  }

  private pickOptionalDates(dto: Record<string, unknown>, fields: string[]) {
    return Object.fromEntries(fields.filter((field) => dto[field] !== undefined).map((field) => [field, this.optionalDate(dto[field], field)]));
  }
}

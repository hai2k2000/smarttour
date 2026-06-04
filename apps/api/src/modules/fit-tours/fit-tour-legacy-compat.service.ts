import { BadRequestException, Injectable } from '@nestjs/common';
import { FitTourWorkflowStatus, Prisma } from '@prisma/client';
import { UpdateFitTourDto } from './dto/update-fit-tour.dto';

@Injectable()
export class FitTourLegacyCompatService {
  toFitTourData(dto: UpdateFitTourDto, creating: boolean): Prisma.FitTourUncheckedCreateInput | Prisma.FitTourUncheckedUpdateInput {
    const requiredCreate = creating
      ? {
          quoteCode: this.requiredText(dto.quoteCode, 'Cần nhập mã báo giá').toUpperCase(),
          tourCode: this.requiredText(dto.tourCode, 'Cần nhập mã tour').toUpperCase(),
          customerName: this.requiredText(dto.customerName, 'Cần nhập tên khách hàng'),
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

  private optionalDate(value: unknown) {
    if (value instanceof Date) return value;
    const text = this.text(value);
    return text ? new Date(text) : null;
  }

  private number(value: unknown) {
    const number = Number(value || 0);
    return Number.isFinite(number) ? number : 0;
  }

  private pickOptionalText(dto: Record<string, unknown>, fields: string[]) {
    return Object.fromEntries(fields.filter((field) => dto[field] !== undefined).map((field) => [field, this.optionalText(dto[field])]));
  }

  private pickOptionalNumbers(dto: Record<string, unknown>, fields: string[]) {
    return Object.fromEntries(fields.filter((field) => dto[field] !== undefined).map((field) => [field, this.number(dto[field])]));
  }

  private pickOptionalDates(dto: Record<string, unknown>, fields: string[]) {
    return Object.fromEntries(fields.filter((field) => dto[field] !== undefined).map((field) => [field, this.optionalDate(dto[field])]));
  }
}

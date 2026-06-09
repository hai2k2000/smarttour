import { ApiHideProperty, ApiProperty, ApiPropertyOptional, IntersectionType, PartialType, PickType } from '@nestjs/swagger';
import { BookingStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEmpty, IsEnum, IsNumber, Min, ValidateIf } from 'class-validator';
import { BOOKING_CREATE_FIELDS, CreateBookingDto } from './create-booking.dto';

const normalizeBookingStatus = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value);
const optionalUpdateNumber = ({ value }: { value: unknown }) => {
  if (value === undefined) return undefined;
  if (value === null) return Number.NaN;
  if (typeof value === 'string' && !value.trim()) return Number.NaN;
  return Number(value);
};

export const BOOKING_UPDATE_FIELDS = BOOKING_CREATE_FIELDS;
export const BOOKING_NON_NULLABLE_UPDATE_FIELDS = [
  'code',
  'tourProgramId',
  'customerName',
  'paxCount',
  'startDate',
  'endDate',
  'totalSellPrice',
] as const;
export const BOOKING_CLEARABLE_UPDATE_FIELDS = [
  'customerId',
  'orderId',
  'tourId',
  'customerPhone',
  'customerEmail',
  'saleOwner',
  'operatorOwner',
] as const;
export const BOOKING_OPERATIONAL_LOCKED_FIELDS = [
  'code',
  'tourProgramId',
  'customerId',
  'orderId',
  'tourId',
  'customerName',
  'customerPhone',
  'customerEmail',
  'paxCount',
  'startDate',
  'endDate',
  'totalSellPrice',
] as const;
export const BOOKING_OPERATIONAL_EDITABLE_FIELDS = ['saleOwner', 'operatorOwner'] as const;

class NonNullableBookingUpdateDto extends PartialType(
  PickType(CreateBookingDto, ['code', 'tourProgramId', 'customerName', 'paxCount', 'startDate', 'endDate'] as const),
  { skipNullProperties: false },
) {}

class ClearableBookingUpdateDto extends PartialType(PickType(CreateBookingDto, BOOKING_CLEARABLE_UPDATE_FIELDS)) {}

export class UpdateBookingDto extends IntersectionType(NonNullableBookingUpdateDto, ClearableBookingUpdateDto) {
  @ApiPropertyOptional({ example: 125000000 })
  @Transform(optionalUpdateNumber)
  @ValidateIf((_, value) => value !== undefined)
  @IsNumber({}, { message: 'Giá bán tổng phải là số hợp lệ' })
  @Min(0, { message: 'Giá bán tổng không được âm' })
  totalSellPrice?: number;

  @ApiHideProperty()
  @IsEmpty({ message: 'Dùng PATCH /api/bookings/:id/status để cập nhật trạng thái booking' })
  status?: never;
}

export class UpdateBookingStatusDto {
  @ApiProperty({ enum: BookingStatus })
  @Transform(normalizeBookingStatus)
  @IsEnum(BookingStatus, { message: 'Trạng thái booking không hợp lệ' })
  status!: BookingStatus;
}

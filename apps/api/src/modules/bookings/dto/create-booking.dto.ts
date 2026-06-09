import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsEmail, IsInt, IsNumber, IsOptional, IsString, Matches, MaxLength, Min, MinLength } from 'class-validator';

export const BOOKING_CODE_MAX_LENGTH = 64;
export const BOOKING_CUSTOMER_NAME_MIN_LENGTH = 2;
export const BOOKING_CUSTOMER_NAME_MAX_LENGTH = 180;
export const BOOKING_OWNER_MIN_LENGTH = 2;
export const BOOKING_OWNER_MAX_LENGTH = 120;
export const BOOKING_PHONE_MAX_LENGTH = 32;
export const BOOKING_PHONE_DIGIT_MIN_LENGTH = 6;
export const BOOKING_PHONE_DIGIT_MAX_LENGTH = 15;
export const BOOKING_EMAIL_MAX_LENGTH = 160;
export const BOOKING_ID_MAX_LENGTH = 80;
export const BOOKING_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]*$/;
export const BOOKING_TEXT_PATTERN = /^[^\u0000-\u001F\u007F<>]+$/;
export const BOOKING_PHONE_PATTERN = /^(?=(?:\D*\d){6,15}\D*$)[0-9+().\-\s]{6,32}$/;
export const BOOKING_EMAIL_PATTERN = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
export const BOOKING_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const BOOKING_CORE_FIELDS = [
  'code',
  'customerName',
  'customerPhone',
  'customerEmail',
  'paxCount',
  'startDate',
  'endDate',
  'saleOwner',
  'operatorOwner',
  'totalSellPrice',
] as const;

export const BOOKING_CROSS_REFERENCE_FIELDS = [
  'tourProgramId',
  'customerId',
  'orderId',
  'tourId',
] as const;

export const BOOKING_CREATE_FIELDS = [
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
  'saleOwner',
  'operatorOwner',
  'totalSellPrice',
] as const;

const trimRequired = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const normalizeCode = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value);
const trimOptional = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed || undefined;
};
const trimOptionalEmail = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed ? trimmed.toLowerCase() : undefined;
};

export class CreateBookingDto {
  @ApiProperty({ example: 'BK-2026-0001' })
  @Transform(normalizeCode)
  @IsString({ message: 'Mã booking phải là chuỗi' })
  @MinLength(2, { message: 'Mã booking phải có ít nhất 2 ký tự' })
  @MaxLength(BOOKING_CODE_MAX_LENGTH, { message: `Mã booking không được vượt quá ${BOOKING_CODE_MAX_LENGTH} ký tự` })
  @Matches(BOOKING_CODE_PATTERN, { message: 'Mã booking chỉ được dùng chữ cái không dấu, số, dấu gạch ngang hoặc gạch dưới, không có khoảng trắng' })
  code!: string;

  @ApiProperty()
  @Transform(trimRequired)
  @IsString({ message: 'Tour mẫu phải là chuỗi' })
  @MinLength(1, { message: 'Tour mẫu không được để trống' })
  @MaxLength(BOOKING_ID_MAX_LENGTH, { message: `Tour mẫu không được vượt quá ${BOOKING_ID_MAX_LENGTH} ký tự` })
  tourProgramId!: string;

  @ApiPropertyOptional()
  @Transform(trimOptional)
  @IsOptional()
  @IsString({ message: 'Khách hàng liên kết phải là chuỗi' })
  @MaxLength(BOOKING_ID_MAX_LENGTH, { message: `Khách hàng liên kết không được vượt quá ${BOOKING_ID_MAX_LENGTH} ký tự` })
  customerId?: string;

  @ApiPropertyOptional()
  @Transform(trimOptional)
  @IsOptional()
  @IsString({ message: 'Đơn hàng liên kết phải là chuỗi' })
  @MaxLength(BOOKING_ID_MAX_LENGTH, { message: `Đơn hàng liên kết không được vượt quá ${BOOKING_ID_MAX_LENGTH} ký tự` })
  orderId?: string;

  @ApiPropertyOptional()
  @Transform(trimOptional)
  @IsOptional()
  @IsString({ message: 'Tour vận hành liên kết phải là chuỗi' })
  @MaxLength(BOOKING_ID_MAX_LENGTH, { message: `Tour vận hành liên kết không được vượt quá ${BOOKING_ID_MAX_LENGTH} ký tự` })
  tourId?: string;

  @ApiProperty({ example: 'Đoàn khách Công ty ABC' })
  @Transform(trimRequired)
  @IsString({ message: 'Tên khách/đoàn phải là chuỗi' })
  @MinLength(BOOKING_CUSTOMER_NAME_MIN_LENGTH, { message: `Tên khách/đoàn phải có ít nhất ${BOOKING_CUSTOMER_NAME_MIN_LENGTH} ký tự` })
  @MaxLength(BOOKING_CUSTOMER_NAME_MAX_LENGTH, { message: `Tên khách/đoàn không được vượt quá ${BOOKING_CUSTOMER_NAME_MAX_LENGTH} ký tự` })
  @Matches(BOOKING_TEXT_PATTERN, { message: 'Tên khách/đoàn không được chứa ký tự điều khiển hoặc dấu < >' })
  customerName!: string;

  @ApiPropertyOptional()
  @Transform(trimOptional)
  @IsOptional()
  @IsString({ message: 'Điện thoại khách phải là chuỗi' })
  @MaxLength(BOOKING_PHONE_MAX_LENGTH, { message: `Điện thoại khách không được vượt quá ${BOOKING_PHONE_MAX_LENGTH} ký tự` })
  @Matches(BOOKING_PHONE_PATTERN, { message: 'Điện thoại khách phải có 6-15 chữ số và chỉ được dùng số, khoảng trắng, + ( ) . -' })
  customerPhone?: string;

  @ApiPropertyOptional()
  @Transform(trimOptionalEmail)
  @IsOptional()
  @IsEmail({}, { message: 'Email khách không hợp lệ' })
  @MaxLength(BOOKING_EMAIL_MAX_LENGTH, { message: `Email khách không được vượt quá ${BOOKING_EMAIL_MAX_LENGTH} ký tự` })
  @Matches(BOOKING_EMAIL_PATTERN, { message: 'Email khách không hợp lệ' })
  customerEmail?: string;

  @ApiProperty({ example: 18 })
  @Type(() => Number)
  @IsInt({ message: 'Số khách phải là số nguyên' })
  @Min(1, { message: 'Số khách phải lớn hơn 0' })
  paxCount!: number;

  @ApiProperty({ example: '2026-06-15' })
  @IsString({ message: 'Ngày khởi hành phải là chuỗi' })
  @Matches(BOOKING_DATE_PATTERN, { message: 'Ngày khởi hành phải có định dạng YYYY-MM-DD' })
  startDate!: string;

  @ApiProperty({ example: '2026-06-17' })
  @IsString({ message: 'Ngày kết thúc phải là chuỗi' })
  @Matches(BOOKING_DATE_PATTERN, { message: 'Ngày kết thúc phải có định dạng YYYY-MM-DD' })
  endDate!: string;

  @ApiPropertyOptional()
  @Transform(trimOptional)
  @IsOptional()
  @IsString({ message: 'Sale phụ trách phải là chuỗi' })
  @MinLength(BOOKING_OWNER_MIN_LENGTH, { message: `Sale phụ trách phải có ít nhất ${BOOKING_OWNER_MIN_LENGTH} ký tự` })
  @MaxLength(BOOKING_OWNER_MAX_LENGTH, { message: `Sale phụ trách không được vượt quá ${BOOKING_OWNER_MAX_LENGTH} ký tự` })
  @Matches(BOOKING_TEXT_PATTERN, { message: 'Sale phụ trách không được chứa ký tự điều khiển hoặc dấu < >' })
  saleOwner?: string;

  @ApiPropertyOptional()
  @Transform(trimOptional)
  @IsOptional()
  @IsString({ message: 'Điều hành phụ trách phải là chuỗi' })
  @MinLength(BOOKING_OWNER_MIN_LENGTH, { message: `Điều hành phụ trách phải có ít nhất ${BOOKING_OWNER_MIN_LENGTH} ký tự` })
  @MaxLength(BOOKING_OWNER_MAX_LENGTH, { message: `Điều hành phụ trách không được vượt quá ${BOOKING_OWNER_MAX_LENGTH} ký tự` })
  @Matches(BOOKING_TEXT_PATTERN, { message: 'Điều hành phụ trách không được chứa ký tự điều khiển hoặc dấu < >' })
  operatorOwner?: string;

  @ApiPropertyOptional({ example: 125000000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Giá bán tổng phải là số hợp lệ' })
  @Min(0, { message: 'Giá bán tổng không được âm' })
  totalSellPrice?: number;
}

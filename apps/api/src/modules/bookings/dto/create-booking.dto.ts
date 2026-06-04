import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsDateString, IsEmail, IsInt, IsNumber, IsOptional, IsString, Matches, MaxLength, Min, MinLength } from 'class-validator';

export const BOOKING_CODE_MAX_LENGTH = 64;
export const BOOKING_CUSTOMER_NAME_MAX_LENGTH = 180;
export const BOOKING_OWNER_MAX_LENGTH = 120;
export const BOOKING_PHONE_MAX_LENGTH = 32;
export const BOOKING_EMAIL_MAX_LENGTH = 160;
export const BOOKING_ID_MAX_LENGTH = 80;
export const BOOKING_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]*$/;
export const BOOKING_PHONE_PATTERN = /^[0-9+().\-\s]{6,32}$/;

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
  @IsString()
  @MinLength(2)
  @MaxLength(BOOKING_CODE_MAX_LENGTH)
  @Matches(BOOKING_CODE_PATTERN)
  code!: string;

  @ApiProperty()
  @Transform(trimRequired)
  @IsString()
  @MinLength(1)
  @MaxLength(BOOKING_ID_MAX_LENGTH)
  tourProgramId!: string;

  @ApiPropertyOptional()
  @Transform(trimOptional)
  @IsOptional()
  @IsString()
  @MaxLength(BOOKING_ID_MAX_LENGTH)
  customerId?: string;

  @ApiPropertyOptional()
  @Transform(trimOptional)
  @IsOptional()
  @IsString()
  @MaxLength(BOOKING_ID_MAX_LENGTH)
  orderId?: string;

  @ApiPropertyOptional()
  @Transform(trimOptional)
  @IsOptional()
  @IsString()
  @MaxLength(BOOKING_ID_MAX_LENGTH)
  tourId?: string;

  @ApiProperty({ example: 'Đoàn khách Công ty ABC' })
  @Transform(trimRequired)
  @IsString()
  @MinLength(2)
  @MaxLength(BOOKING_CUSTOMER_NAME_MAX_LENGTH)
  customerName!: string;

  @ApiPropertyOptional()
  @Transform(trimOptional)
  @IsOptional()
  @IsString()
  @MaxLength(BOOKING_PHONE_MAX_LENGTH)
  @Matches(BOOKING_PHONE_PATTERN)
  customerPhone?: string;

  @ApiPropertyOptional()
  @Transform(trimOptionalEmail)
  @IsOptional()
  @IsEmail()
  @MaxLength(BOOKING_EMAIL_MAX_LENGTH)
  customerEmail?: string;

  @ApiProperty({ example: 18 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  paxCount!: number;

  @ApiProperty({ example: '2026-06-15' })
  @IsDateString()
  startDate!: string;

  @ApiProperty({ example: '2026-06-17' })
  @IsDateString()
  endDate!: string;

  @ApiPropertyOptional()
  @Transform(trimOptional)
  @IsOptional()
  @IsString()
  @MaxLength(BOOKING_OWNER_MAX_LENGTH)
  saleOwner?: string;

  @ApiPropertyOptional()
  @Transform(trimOptional)
  @IsOptional()
  @IsString()
  @MaxLength(BOOKING_OWNER_MAX_LENGTH)
  operatorOwner?: string;

  @ApiPropertyOptional({ example: 125000000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  totalSellPrice?: number;
}

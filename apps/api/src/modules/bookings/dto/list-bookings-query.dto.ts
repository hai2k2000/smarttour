import { ApiPropertyOptional } from '@nestjs/swagger';
import { BookingStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { BOOKING_ID_MAX_LENGTH } from './create-booking.dto';

export const BOOKING_SEARCH_MIN_LENGTH = 2;
export const BOOKING_SEARCH_MAX_LENGTH = 80;
export const BOOKING_LIST_DEFAULT_TAKE = 100;
export const BOOKING_LIST_MAX_TAKE = 500;

const trimOptional = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed || undefined;
};

const normalizeStatus = ({ value }: { value: unknown }) => {
  const trimmed = trimOptional({ value });
  return typeof trimmed === 'string' ? trimmed.toUpperCase() : trimmed;
};

const optionalNumber = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'string' && !value.trim()) return undefined;
  return Number(value);
};

export class ListBookingsQueryDto {
  @ApiPropertyOptional({ minLength: BOOKING_SEARCH_MIN_LENGTH, maxLength: BOOKING_SEARCH_MAX_LENGTH })
  @Transform(trimOptional)
  @IsOptional()
  @IsString({ message: 'Từ khóa tìm kiếm booking phải là chuỗi' })
  @MinLength(BOOKING_SEARCH_MIN_LENGTH, { message: `Từ khóa tìm kiếm booking phải có ít nhất ${BOOKING_SEARCH_MIN_LENGTH} ký tự` })
  @MaxLength(BOOKING_SEARCH_MAX_LENGTH, { message: `Từ khóa tìm kiếm booking không được vượt quá ${BOOKING_SEARCH_MAX_LENGTH} ký tự` })
  search?: string;

  @ApiPropertyOptional({ enum: BookingStatus })
  @Transform(normalizeStatus)
  @IsOptional()
  @IsEnum(BookingStatus, { message: 'Trạng thái booking không hợp lệ' })
  status?: BookingStatus;

  @ApiPropertyOptional()
  @Transform(trimOptional)
  @IsOptional()
  @IsString({ message: 'Tour mẫu lọc booking phải là chuỗi' })
  @MaxLength(BOOKING_ID_MAX_LENGTH, { message: `Tour mẫu lọc booking không được vượt quá ${BOOKING_ID_MAX_LENGTH} ký tự` })
  tourProgramId?: string;

  @ApiPropertyOptional({ default: BOOKING_LIST_DEFAULT_TAKE, minimum: 1, maximum: BOOKING_LIST_MAX_TAKE })
  @Transform(optionalNumber)
  @IsOptional()
  @IsInt({ message: 'Số booking mỗi trang phải là số nguyên' })
  @Min(1, { message: 'Số booking mỗi trang phải lớn hơn 0' })
  @Max(BOOKING_LIST_MAX_TAKE, { message: `Số booking mỗi trang không được vượt quá ${BOOKING_LIST_MAX_TAKE}` })
  take?: number;

  @ApiPropertyOptional({ default: 0, minimum: 0 })
  @Transform(optionalNumber)
  @IsOptional()
  @IsInt({ message: 'Vị trí bắt đầu danh sách booking phải là số nguyên' })
  @Min(0, { message: 'Vị trí bắt đầu danh sách booking không được âm' })
  skip?: number;
}

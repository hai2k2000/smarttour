import { ApiPropertyOptional } from '@nestjs/swagger';
import { OperationStatus, SupplierPaymentStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { LIST_SEARCH_MAX_LENGTH } from '../../list-search';

export const OPERATIONS_LIST_MAX_TAKE = 500;

const trimOptional = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return trimmed || undefined;
};

const normalizeEnum = ({ value }: { value: unknown }) => {
  const trimmed = trimOptional({ value });
  return typeof trimmed === 'string' ? trimmed.toUpperCase() : trimmed;
};

const optionalInt = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'string' && !value.trim()) return undefined;
  return Number(value);
};

class OperationsListBaseQueryDto {
  @ApiPropertyOptional({
    maxLength: LIST_SEARCH_MAX_LENGTH,
    description: 'Từ khóa tìm kiếm đã được trim và gộp khoảng trắng trước khi truyền xuống service.',
  })
  @Transform(trimOptional)
  @IsOptional()
  @IsString({ message: 'Từ khóa tìm kiếm vận hành phải là chuỗi ký tự' })
  @MaxLength(LIST_SEARCH_MAX_LENGTH, { message: `Từ khóa tìm kiếm vận hành không được vượt quá ${LIST_SEARCH_MAX_LENGTH} ký tự` })
  search?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: OPERATIONS_LIST_MAX_TAKE, default: 100 })
  @Transform(optionalInt)
  @IsOptional()
  @IsInt({ message: 'Số dòng danh sách vận hành phải là số nguyên' })
  @Min(1, { message: 'Số dòng danh sách vận hành phải lớn hơn 0' })
  @Max(OPERATIONS_LIST_MAX_TAKE, { message: `Số dòng danh sách vận hành không được vượt quá ${OPERATIONS_LIST_MAX_TAKE}` })
  take?: number;
}

export class ListOperationFormsQueryDto extends OperationsListBaseQueryDto {
  @ApiPropertyOptional({ enum: OperationStatus, description: 'Lọc phiếu điều hành theo trạng thái.' })
  @Transform(normalizeEnum)
  @IsOptional()
  @IsEnum(OperationStatus, { message: 'Trạng thái phiếu điều hành không hợp lệ' })
  status?: OperationStatus;

  @ApiPropertyOptional({ description: 'Lọc theo booking liên kết.' })
  @Transform(trimOptional)
  @IsOptional()
  @IsString({ message: 'bookingId phải là chuỗi ký tự' })
  @MaxLength(80, { message: 'bookingId không được vượt quá 80 ký tự' })
  bookingId?: string;

  @ApiPropertyOptional({ description: 'Lọc theo đơn hàng liên kết.' })
  @Transform(trimOptional)
  @IsOptional()
  @IsString({ message: 'orderId phải là chuỗi ký tự' })
  @MaxLength(80, { message: 'orderId không được vượt quá 80 ký tự' })
  orderId?: string;

  @ApiPropertyOptional({ description: 'Lọc theo tour liên kết.' })
  @Transform(trimOptional)
  @IsOptional()
  @IsString({ message: 'tourId phải là chuỗi ký tự' })
  @MaxLength(80, { message: 'tourId không được vượt quá 80 ký tự' })
  tourId?: string;
}

export class ListSupplierPaymentRequestsQueryDto extends OperationsListBaseQueryDto {
  @ApiPropertyOptional({ enum: SupplierPaymentStatus, description: 'Lọc yêu cầu thanh toán NCC theo trạng thái.' })
  @Transform(normalizeEnum)
  @IsOptional()
  @IsEnum(SupplierPaymentStatus, { message: 'Trạng thái yêu cầu thanh toán nhà cung cấp không hợp lệ' })
  status?: SupplierPaymentStatus;

  @ApiPropertyOptional({ description: 'Lọc theo nhà cung cấp trong dòng thanh toán.' })
  @Transform(trimOptional)
  @IsOptional()
  @IsString({ message: 'supplierId phải là chuỗi ký tự' })
  @MaxLength(80, { message: 'supplierId không được vượt quá 80 ký tự' })
  supplierId?: string;

  @ApiPropertyOptional({ description: 'Lọc theo phiếu chi tài chính đã liên kết.' })
  @Transform(trimOptional)
  @IsOptional()
  @IsString({ message: 'financePaymentId phải là chuỗi ký tự' })
  @MaxLength(80, { message: 'financePaymentId không được vượt quá 80 ký tự' })
  financePaymentId?: string;
}

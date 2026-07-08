import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { OperationVoucherStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsArray, IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

export const OPERATION_VOUCHER_LIST_DEFAULT_TAKE = 100;
export const OPERATION_VOUCHER_LIST_MAX_TAKE = 500;

const trimOptional = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed || undefined;
};

const trimRequired = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const normalizeStatus = ({ value }: { value: unknown }) => {
  const trimmed = trimOptional({ value });
  return typeof trimmed === 'string' ? trimmed.toUpperCase() : trimmed;
};
const optionalNumber = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'string' && !value.trim()) return undefined;
  return Number(value);
};

export class OperationVoucherDetailDto {
  @ApiPropertyOptional() @Transform(trimOptional) @IsOptional() @IsString({ message: 'SKU dòng chi tiết phải là chuỗi' }) @MaxLength(80, { message: 'SKU dòng chi tiết không được vượt quá 80 ký tự' }) sku?: string;
  @ApiProperty() @Transform(trimRequired) @IsString({ message: 'Tên dịch vụ chi tiết phải là chuỗi' }) @MinLength(2, { message: 'Cần nhập tên dịch vụ chi tiết' }) @MaxLength(200, { message: 'Tên dịch vụ chi tiết không được vượt quá 200 ký tự' }) serviceName!: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber({}, { message: 'Số lượng chi tiết phải là số' }) @Min(0.01, { message: 'Số lượng chi tiết phải lớn hơn 0' }) quantity?: number;
  @ApiPropertyOptional() @Transform(trimOptional) @IsOptional() @IsString({ message: 'Đơn vị tính phải là chuỗi' }) @MaxLength(40, { message: 'Đơn vị tính không được vượt quá 40 ký tự' }) unit?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber({}, { message: 'Giá NET phải là số' }) @Min(0, { message: 'Giá NET không được âm' }) netPrice?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber({}, { message: 'VAT phải là số' }) @Min(0, { message: 'VAT không được âm' }) @Max(100, { message: 'VAT không được vượt quá 100%' }) vat?: number;
  @ApiPropertyOptional() @Transform(trimOptional) @IsOptional() @IsString({ message: 'Ghi chú chi tiết phải là chuỗi' }) @MaxLength(500, { message: 'Ghi chú chi tiết không được vượt quá 500 ký tự' }) note?: string;
}

export class ListOperationVouchersQueryDto {
  @ApiPropertyOptional({ maxLength: 80 })
  @Transform(trimOptional)
  @IsOptional()
  @IsString({ message: 'Từ khóa tìm kiếm phiếu điều hành phải là chuỗi' })
  @MaxLength(80, { message: 'Từ khóa tìm kiếm phiếu điều hành không được vượt quá 80 ký tự' })
  search?: string;

  @ApiPropertyOptional({ enum: OperationVoucherStatus })
  @Transform(normalizeStatus)
  @IsOptional()
  @IsEnum(OperationVoucherStatus, { message: 'Trạng thái phiếu điều hành không hợp lệ' })
  status?: OperationVoucherStatus;

  @ApiPropertyOptional({ default: OPERATION_VOUCHER_LIST_DEFAULT_TAKE, minimum: 1, maximum: OPERATION_VOUCHER_LIST_MAX_TAKE })
  @Transform(optionalNumber)
  @IsOptional()
  @IsInt({ message: 'Số phiếu mỗi trang phải là số nguyên' })
  @Min(1, { message: 'Số phiếu mỗi trang phải lớn hơn 0' })
  @Max(OPERATION_VOUCHER_LIST_MAX_TAKE, { message: `Số phiếu mỗi trang không được vượt quá ${OPERATION_VOUCHER_LIST_MAX_TAKE}` })
  take?: number;

  @ApiPropertyOptional({ default: OPERATION_VOUCHER_LIST_DEFAULT_TAKE, minimum: 1, maximum: OPERATION_VOUCHER_LIST_MAX_TAKE })
  @Transform(optionalNumber)
  @IsOptional()
  @IsInt({ message: 'So phieu moi trang phai la so nguyen' })
  @Min(1, { message: 'So phieu moi trang phai lon hon 0' })
  @Max(OPERATION_VOUCHER_LIST_MAX_TAKE, { message: `So phieu moi trang khong duoc vuot qua ${OPERATION_VOUCHER_LIST_MAX_TAKE}` })
  limit?: number;

  @ApiPropertyOptional({ default: 0, minimum: 0 })
  @Transform(optionalNumber)
  @IsOptional()
  @IsInt({ message: 'Vị trí bắt đầu danh sách phiếu phải là số nguyên' })
  @Min(0, { message: 'Vị trí bắt đầu danh sách phiếu không được âm' })
  skip?: number;

  @ApiPropertyOptional({ default: 0, minimum: 0 })
  @Transform(optionalNumber)
  @IsOptional()
  @IsInt({ message: 'Phieu offset phai la so nguyen' })
  @Min(0, { message: 'Phieu offset khong duoc am' })
  offset?: number;
}

export class CreateOperationVoucherDto {
  @ApiProperty() @Transform(trimRequired) @IsString({ message: 'Mã phiếu điều hành phải là chuỗi' }) @MinLength(2, { message: 'Mã phiếu điều hành phải có ít nhất 2 ký tự' }) @MaxLength(64, { message: 'Mã phiếu điều hành không được vượt quá 64 ký tự' }) voucherCode!: string;
  @ApiPropertyOptional() @Transform(trimOptional) @IsOptional() @IsString({ message: 'Tour liên kết phải là chuỗi' }) tourId?: string;
  @ApiPropertyOptional() @Transform(trimOptional) @IsOptional() @IsString({ message: 'Booking liên kết phải là chuỗi' }) bookingId?: string;
  @ApiPropertyOptional() @Transform(trimOptional) @IsOptional() @IsString({ message: 'Đơn hàng liên kết phải là chuỗi' }) orderId?: string;
  @ApiPropertyOptional() @Transform(trimOptional) @IsOptional() @IsString({ message: 'Nhà cung cấp liên kết phải là chuỗi' }) supplierId?: string;
  @ApiPropertyOptional() @Transform(trimOptional) @IsOptional() @IsString({ message: 'Tên nhà cung cấp phải là chuỗi' }) @MaxLength(200, { message: 'Tên nhà cung cấp không được vượt quá 200 ký tự' }) supplierName?: string;
  @ApiProperty() @Transform(trimRequired) @IsString({ message: 'Loại dịch vụ phải là chuỗi' }) @MinLength(2, { message: 'Cần nhập loại dịch vụ' }) @MaxLength(80, { message: 'Loại dịch vụ không được vượt quá 80 ký tự' }) serviceType!: string;
  @ApiProperty() @Transform(trimRequired) @IsString({ message: 'Tên dịch vụ phải là chuỗi' }) @MinLength(2, { message: 'Cần nhập tên dịch vụ' }) @MaxLength(200, { message: 'Tên dịch vụ không được vượt quá 200 ký tự' }) serviceName!: string;
  @ApiProperty() @IsDateString({}, { message: 'Ngày dịch vụ không hợp lệ' }) serviceDate!: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString({}, { message: 'Hạn thanh toán không hợp lệ' }) paymentDeadline?: string;
  @ApiPropertyOptional() @Transform(trimOptional) @IsOptional() @IsString({ message: 'Ghi chú phiếu điều hành phải là chuỗi' }) @MaxLength(1000, { message: 'Ghi chú phiếu điều hành không được vượt quá 1000 ký tự' }) note?: string;
  @ApiPropertyOptional() @Transform(trimOptional) @IsOptional() @IsString({ message: 'Người tạo phiếu phải là chuỗi' }) @MaxLength(120, { message: 'Người tạo phiếu không được vượt quá 120 ký tự' }) createdBy?: string;
  @ApiPropertyOptional({ type: [OperationVoucherDetailDto] }) @IsOptional() @IsArray({ message: 'Chi tiết dịch vụ phải là danh sách' }) @ValidateNested({ each: true }) @Type(() => OperationVoucherDetailDto) details?: OperationVoucherDetailDto[];
}

export class UpdateOperationVoucherDto extends PartialType(CreateOperationVoucherDto) {}

export class AddOperationVoucherPaymentDto {
  @ApiPropertyOptional() @Transform(trimOptional) @IsOptional() @IsString({ message: 'Phiếu chi tài chính liên kết phải là chuỗi' }) paymentVoucherId?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber({}, { message: 'Số tiền đã thanh toán phải là số' }) @Min(0.01, { message: 'Số tiền đã thanh toán phải lớn hơn 0' }) paidAmount?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber({}, { message: 'Số tiền thanh toán phải là số' }) @Min(0.01, { message: 'Số tiền thanh toán phải lớn hơn 0' }) paymentAmount?: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString({}, { message: 'Ngày thanh toán không hợp lệ' }) paymentDate?: string;
  @ApiPropertyOptional() @Transform(trimOptional) @IsOptional() @IsString({ message: 'Ghi chú thanh toán phải là chuỗi' }) @MaxLength(500, { message: 'Ghi chú thanh toán không được vượt quá 500 ký tự' }) note?: string;
}

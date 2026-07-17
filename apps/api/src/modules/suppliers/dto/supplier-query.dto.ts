import { ApiPropertyOptional } from '@nestjs/swagger';
import { SupplierStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';

export const DEFAULT_SUPPLIERS_TAKE = 100;
export const MAX_SUPPLIERS_TAKE = 200;

const trimOptional = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed || undefined;
};

const booleanOptional = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null || value === '') return undefined;
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return value;
};

export class SupplierCategoryListQueryDto {
  @Transform(trimOptional)
  @IsOptional()
  @IsString({ message: 'Từ khóa tìm kiếm loại nhà cung cấp phải là chuỗi ký tự' })
  @MaxLength(120, { message: 'Từ khóa tìm kiếm loại nhà cung cấp không được vượt quá 120 ký tự' })
  search?: string;

  @Transform(booleanOptional)
  @IsOptional()
  @IsBoolean({ message: 'Tùy chọn hiển thị loại nhà cung cấp rỗng không hợp lệ' })
  includeEmpty?: boolean;
}

export class SupplierListQueryDto {
  @ApiPropertyOptional({ enum: ['csv', 'xlsx'] })
  @Transform(trimOptional)
  @IsOptional()
  @IsIn(['csv', 'xlsx'])
  format?: string;

  @Transform(trimOptional)
  @IsOptional()
  @IsString({ message: 'Từ khóa tìm kiếm phải là chuỗi ký tự' })
  @MaxLength(200, { message: 'Từ khóa tìm kiếm không được vượt quá 200 ký tự' })
  search?: string;

  @Transform(trimOptional)
  @IsOptional()
  @IsUUID('4', { message: 'Mã loại nhà cung cấp không hợp lệ' })
  categoryId?: string;

  @Transform(trimOptional)
  @IsOptional()
  @IsEnum(SupplierStatus, { message: 'Trạng thái nhà cung cấp không hợp lệ' })
  status?: SupplierStatus;

  @Transform(trimOptional)
  @IsOptional()
  @IsString({ message: 'Tỉnh/thành phải là chuỗi ký tự' })
  @MaxLength(120, { message: 'Tỉnh/thành không được vượt quá 120 ký tự' })
  province?: string;

  @Transform(trimOptional)
  @IsOptional()
  @IsString({ message: 'Thị trường phải là chuỗi ký tự' })
  @MaxLength(120, { message: 'Thị trường không được vượt quá 120 ký tự' })
  market?: string;

  @Type(() => Number)
  @IsOptional()
  @IsInt({ message: 'Số lượng nhà cung cấp cần tải phải là số nguyên' })
  @Min(1, { message: 'Số lượng nhà cung cấp cần tải phải lớn hơn 0' })
  @Max(MAX_SUPPLIERS_TAKE, { message: `Số lượng nhà cung cấp cần tải không được vượt quá ${MAX_SUPPLIERS_TAKE}` })
  take?: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt({ message: 'So luong nha cung cap can tai phai la so nguyen' })
  @Min(1, { message: 'So luong nha cung cap can tai phai lon hon 0' })
  @Max(MAX_SUPPLIERS_TAKE, { message: `So luong nha cung cap can tai khong duoc vuot qua ${MAX_SUPPLIERS_TAKE}` })
  limit?: number;
}

export class HotelSupplierListQueryDto {
  @ApiPropertyOptional({ enum: ['csv', 'xlsx'] })
  @Transform(trimOptional)
  @IsOptional()
  @IsIn(['csv', 'xlsx'])
  format?: string;

  @Transform(trimOptional)
  @IsOptional()
  @IsString({ message: 'Từ khóa tìm kiếm phải là chuỗi ký tự' })
  @MaxLength(200, { message: 'Từ khóa tìm kiếm không được vượt quá 200 ký tự' })
  search?: string;

  @Transform(trimOptional)
  @IsOptional()
  @IsString({ message: 'Tỉnh/thành phải là chuỗi ký tự' })
  @MaxLength(120, { message: 'Tỉnh/thành không được vượt quá 120 ký tự' })
  province?: string;

  @Transform(trimOptional)
  @IsOptional()
  @IsString({ message: 'Dự án khách sạn phải là chuỗi ký tự' })
  @MaxLength(180, { message: 'Dự án khách sạn không được vượt quá 180 ký tự' })
  hotelProject?: string;

  @Transform(trimOptional)
  @IsOptional()
  @IsString({ message: 'Hạng khách sạn phải là chuỗi ký tự' })
  @MaxLength(80, { message: 'Hạng khách sạn không được vượt quá 80 ký tự' })
  classHotel?: string;

  @Transform(trimOptional)
  @IsOptional()
  @IsEnum(SupplierStatus, { message: 'Trạng thái nhà cung cấp không hợp lệ' })
  status?: SupplierStatus;

  @Transform(trimOptional)
  @IsOptional()
  @IsString({ message: 'Thị trường phải là chuỗi ký tự' })
  @MaxLength(120, { message: 'Thị trường không được vượt quá 120 ký tự' })
  market?: string;

  @Type(() => Number)
  @IsOptional()
  @IsInt({ message: 'So luong nha cung cap khach san can tai phai la so nguyen' })
  @Min(1, { message: 'So luong nha cung cap khach san can tai phai lon hon 0' })
  @Max(MAX_SUPPLIERS_TAKE, { message: `So luong nha cung cap khach san can tai khong duoc vuot qua ${MAX_SUPPLIERS_TAKE}` })
  take?: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt({ message: 'So luong nha cung cap can tai phai la so nguyen' })
  @Min(1, { message: 'So luong nha cung cap can tai phai lon hon 0' })
  @Max(MAX_SUPPLIERS_TAKE, { message: `So luong nha cung cap can tai khong duoc vuot qua ${MAX_SUPPLIERS_TAKE}` })
  limit?: number;
}

export class TypedSupplierListQueryDto {
  @ApiPropertyOptional({ enum: ['csv', 'xlsx'] })
  @Transform(trimOptional)
  @IsOptional()
  @IsIn(['csv', 'xlsx'])
  format?: string;

  @Transform(trimOptional)
  @IsOptional()
  @IsString({ message: 'Từ khóa tìm kiếm phải là chuỗi ký tự' })
  @MaxLength(200, { message: 'Từ khóa tìm kiếm không được vượt quá 200 ký tự' })
  search?: string;

  @Transform(trimOptional)
  @IsOptional()
  @IsString({ message: 'Tỉnh/thành phải là chuỗi ký tự' })
  @MaxLength(120, { message: 'Tỉnh/thành không được vượt quá 120 ký tự' })
  province?: string;

  @Transform(trimOptional)
  @IsOptional()
  @IsEnum(SupplierStatus, { message: 'Trạng thái nhà cung cấp không hợp lệ' })
  status?: SupplierStatus;

  @Transform(trimOptional)
  @IsOptional()
  @IsString({ message: 'Thị trường phải là chuỗi ký tự' })
  @MaxLength(120, { message: 'Thị trường không được vượt quá 120 ký tự' })
  market?: string;

  @Type(() => Number)
  @IsOptional()
  @IsInt({ message: 'So luong nha cung cap chuyen biet can tai phai la so nguyen' })
  @Min(1, { message: 'So luong nha cung cap chuyen biet can tai phai lon hon 0' })
  @Max(MAX_SUPPLIERS_TAKE, { message: `So luong nha cung cap chuyen biet can tai khong duoc vuot qua ${MAX_SUPPLIERS_TAKE}` })
  take?: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt({ message: 'So luong nha cung cap can tai phai la so nguyen' })
  @Min(1, { message: 'So luong nha cung cap can tai phai lon hon 0' })
  @Max(MAX_SUPPLIERS_TAKE, { message: `So luong nha cung cap can tai khong duoc vuot qua ${MAX_SUPPLIERS_TAKE}` })
  limit?: number;
}

export class AllotmentInventoryQueryDto {
  @Transform(trimOptional)
  @IsOptional()
  @IsUUID('4', { message: 'Mã nhà cung cấp không hợp lệ' })
  supplierId?: string;

  @Transform(trimOptional)
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Ngày bắt đầu phải có định dạng YYYY-MM-DD' })
  startDate?: string;

  @Transform(trimOptional)
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Ngày kết thúc phải có định dạng YYYY-MM-DD' })
  endDate?: string;
}

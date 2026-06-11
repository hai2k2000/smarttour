import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { SupplierStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsNumber,
  Matches,
  Max,
  MaxLength,
  IsObject,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const trimRequired = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const uppercaseRequired = ({ value }: { value: unknown }) => {
  const trimmed = trimRequired({ value });
  return typeof trimmed === 'string' ? trimmed.toUpperCase() : trimmed;
};
const trimOptional = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed || undefined;
};
const supplierPhonePattern = /^(?=(?:\D*\d){6,15}\D*$)[+\d\s().-]+$/;

class GenericSupplierContactDto {
  @ApiProperty()
  @Transform(trimRequired)
  @IsString({ message: 'Tên người liên hệ phải là chuỗi ký tự' })
  @MinLength(2, { message: 'Tên người liên hệ phải có ít nhất 2 ký tự' })
  @MaxLength(180, { message: 'Tên người liên hệ không được vượt quá 180 ký tự' })
  fullName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimOptional)
  @IsString({ message: 'Chức vụ người liên hệ phải là chuỗi ký tự' })
  @MaxLength(120, { message: 'Chức vụ người liên hệ không được vượt quá 120 ký tự' })
  position?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString({}, { message: 'Ngày sinh người liên hệ không hợp lệ' })
  birthday?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimOptional)
  @IsString({ message: 'Số điện thoại người liên hệ phải là chuỗi ký tự' })
  @Matches(supplierPhonePattern, { message: 'Số điện thoại người liên hệ không hợp lệ' })
  phone?: string;

  @ApiPropertyOptional()
  @Transform(trimOptional)
  @IsOptional()
  @IsEmail({}, { message: 'Email người liên hệ không hợp lệ' })
  @MaxLength(180, { message: 'Email người liên hệ không được vượt quá 180 ký tự' })
  email?: string;
}

class GenericSupplierServiceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimOptional)
  @IsString({ message: 'Mã dịch vụ phải là chuỗi ký tự' })
  @MaxLength(80, { message: 'Mã dịch vụ không được vượt quá 80 ký tự' })
  sku?: string;

  @ApiProperty()
  @Transform(trimRequired)
  @IsString({ message: 'Tên dịch vụ phải là chuỗi ký tự' })
  @MinLength(2, { message: 'Tên dịch vụ phải có ít nhất 2 ký tự' })
  serviceName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  quantity?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  accountingPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  netPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  sellingPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimOptional)
  @IsString({ message: 'Mô tả dịch vụ phải là chuỗi ký tự' })
  @MaxLength(2000, { message: 'Mô tả dịch vụ không được vượt quá 2.000 ký tự' })
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimOptional)
  @IsString({ message: 'Ghi chú dịch vụ phải là chuỗi ký tự' })
  @MaxLength(2000, { message: 'Ghi chú dịch vụ không được vượt quá 2.000 ký tự' })
  note?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class CreateGenericSupplierDto {
  @ApiProperty()
  @Transform(uppercaseRequired)
  @IsString({ message: 'Mã nhà cung cấp phải là chuỗi ký tự' })
  @MinLength(2, { message: 'Mã nhà cung cấp phải có ít nhất 2 ký tự' })
  @MaxLength(80, { message: 'Mã nhà cung cấp không được vượt quá 80 ký tự' })
  supplierCode!: string;

  @ApiProperty()
  @Transform(trimRequired)
  @IsString({ message: 'Tên nhà cung cấp phải là chuỗi ký tự' })
  @MinLength(2, { message: 'Tên nhà cung cấp phải có ít nhất 2 ký tự' })
  @MaxLength(180, { message: 'Tên nhà cung cấp không được vượt quá 180 ký tự' })
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimOptional)
  @IsString({ message: 'Mã số thuế phải là chuỗi ký tự' })
  @MaxLength(80, { message: 'Mã số thuế không được vượt quá 80 ký tự' })
  taxCode?: string;

  @ApiProperty()
  @Transform(trimRequired)
  @IsString({ message: 'Số điện thoại nhà cung cấp phải là chuỗi ký tự' })
  @Matches(supplierPhonePattern, { message: 'Số điện thoại nhà cung cấp không hợp lệ' })
  @MaxLength(40, { message: 'Số điện thoại nhà cung cấp không được vượt quá 40 ký tự' })
  phone!: string;

  @ApiPropertyOptional()
  @Transform(trimOptional)
  @IsOptional()
  @IsEmail({}, { message: 'Email nhà cung cấp không hợp lệ' })
  @MaxLength(180, { message: 'Email nhà cung cấp không được vượt quá 180 ký tự' })
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimOptional)
  @IsString({ message: 'Địa chỉ phải là chuỗi ký tự' })
  @MaxLength(500, { message: 'Địa chỉ không được vượt quá 500 ký tự' })
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimOptional)
  @IsString({ message: 'Tỉnh/thành phải là chuỗi ký tự' })
  @MaxLength(120, { message: 'Tỉnh/thành không được vượt quá 120 ký tự' })
  province?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimOptional)
  @IsString({ message: 'Website phải là chuỗi ký tự' })
  @MaxLength(500, { message: 'Website không được vượt quá 500 ký tự' })
  website?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimOptional)
  @IsString({ message: 'Liên kết phải là chuỗi ký tự' })
  @MaxLength(500, { message: 'Liên kết không được vượt quá 500 ký tự' })
  link?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Xếp hạng nhà cung cấp phải là số nguyên' })
  @Min(0, { message: 'Xếp hạng nhà cung cấp không được nhỏ hơn 0' })
  @Max(5, { message: 'Xếp hạng nhà cung cấp không được lớn hơn 5' })
  rating?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimOptional)
  @IsString({ message: 'Thị trường phải là chuỗi ký tự' })
  @MaxLength(120, { message: 'Thị trường không được vượt quá 120 ký tự' })
  market?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimOptional)
  @IsString({ message: 'Tên tài khoản ngân hàng phải là chuỗi ký tự' })
  @MaxLength(180, { message: 'Tên tài khoản ngân hàng không được vượt quá 180 ký tự' })
  bankAccountName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimOptional)
  @IsString({ message: 'Số tài khoản ngân hàng phải là chuỗi ký tự' })
  @MaxLength(80, { message: 'Số tài khoản ngân hàng không được vượt quá 80 ký tự' })
  bankAccountNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimOptional)
  @IsString({ message: 'Tên ngân hàng phải là chuỗi ký tự' })
  @MaxLength(180, { message: 'Tên ngân hàng không được vượt quá 180 ký tự' })
  bankName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimOptional)
  @IsString({ message: 'Ghi chú nhà cung cấp phải là chuỗi ký tự' })
  @MaxLength(2000, { message: 'Ghi chú nhà cung cấp không được vượt quá 2.000 ký tự' })
  notes?: string;

  @ApiPropertyOptional({ enum: SupplierStatus })
  @IsOptional()
  @IsEnum(SupplierStatus, { message: 'Trạng thái nhà cung cấp không hợp lệ' })
  status?: SupplierStatus;

  @ApiPropertyOptional({ type: [GenericSupplierContactDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GenericSupplierContactDto)
  contacts?: GenericSupplierContactDto[];

  @ApiPropertyOptional({ type: [GenericSupplierServiceDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GenericSupplierServiceDto)
  services?: GenericSupplierServiceDto[];
}

export class UpdateGenericSupplierDto extends PartialType(CreateGenericSupplierDto) {}

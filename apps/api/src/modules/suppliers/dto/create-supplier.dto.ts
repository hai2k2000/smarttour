import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';

const trimRequired = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const trimOptional = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed || undefined;
};
const uppercaseOptional = ({ value }: { value: unknown }) => {
  const trimmed = trimOptional({ value });
  return typeof trimmed === 'string' ? trimmed.toUpperCase() : trimmed;
};

export class CreateSupplierDto {
  @ApiPropertyOptional()
  @Transform(uppercaseOptional)
  @IsOptional()
  @IsString({ message: 'Mã nhà cung cấp phải là chuỗi ký tự' })
  @MinLength(2, { message: 'Mã nhà cung cấp phải có ít nhất 2 ký tự' })
  @MaxLength(80, { message: 'Mã nhà cung cấp không được vượt quá 80 ký tự' })
  supplierCode?: string;

  @ApiProperty()
  @Transform(trimRequired)
  @IsString({ message: 'Mã loại nhà cung cấp phải là chuỗi ký tự' })
  @IsUUID('4', { message: 'Mã loại nhà cung cấp không hợp lệ' })
  categoryId!: string;

  @ApiProperty({ example: 'Đối tác khách sạn Hạ Long Bay' })
  @Transform(trimRequired)
  @IsString({ message: 'Tên nhà cung cấp phải là chuỗi ký tự' })
  @MinLength(2, { message: 'Tên nhà cung cấp phải có ít nhất 2 ký tự' })
  @MaxLength(180, { message: 'Tên nhà cung cấp không được vượt quá 180 ký tự' })
  name!: string;

  @ApiPropertyOptional()
  @Transform(trimOptional)
  @IsOptional()
  @IsString({ message: 'Người liên hệ phải là chuỗi ký tự' })
  @MaxLength(120, { message: 'Người liên hệ không được vượt quá 120 ký tự' })
  contactPerson?: string;

  @ApiPropertyOptional()
  @Transform(trimOptional)
  @IsOptional()
  @IsString({ message: 'Số điện thoại nhà cung cấp phải là chuỗi ký tự' })
  @MaxLength(40, { message: 'Số điện thoại nhà cung cấp không được vượt quá 40 ký tự' })
  @Matches(/^(?=(?:\D*\d){6,15}\D*$)[+\d\s().-]+$/, { message: 'Số điện thoại nhà cung cấp không hợp lệ' })
  phone?: string;

  @ApiPropertyOptional()
  @Transform(trimOptional)
  @IsOptional()
  @IsEmail({}, { message: 'Email nhà cung cấp không hợp lệ' })
  @MaxLength(180, { message: 'Email nhà cung cấp không được vượt quá 180 ký tự' })
  email?: string;

  @ApiPropertyOptional()
  @Transform(trimOptional)
  @IsOptional()
  @IsString({ message: 'Địa chỉ nhà cung cấp phải là chuỗi ký tự' })
  @MaxLength(500, { message: 'Địa chỉ nhà cung cấp không được vượt quá 500 ký tự' })
  address?: string;

  @ApiPropertyOptional()
  @Transform(trimOptional)
  @IsOptional()
  @IsString({ message: 'Chính sách giá phải là chuỗi ký tự' })
  @MaxLength(2000, { message: 'Chính sách giá không được vượt quá 2.000 ký tự' })
  pricePolicy?: string;

  @ApiPropertyOptional()
  @Transform(trimOptional)
  @IsOptional()
  @IsString({ message: 'Ghi chú công nợ phải là chuỗi ký tự' })
  @MaxLength(2000, { message: 'Ghi chú công nợ không được vượt quá 2.000 ký tự' })
  debtNote?: string;

  @ApiPropertyOptional()
  @Transform(trimOptional)
  @IsOptional()
  @IsString({ message: 'Ghi chú nhà cung cấp phải là chuỗi ký tự' })
  @MaxLength(2000, { message: 'Ghi chú nhà cung cấp không được vượt quá 2.000 ký tự' })
  notes?: string;
}

import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { SupplierDayType, SupplierStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  Matches,
  MaxLength,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const trimRequired = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const trimOptional = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed || undefined;
};
const supplierPhonePattern = /^(?=(?:\D*\d){6,15}\D*$)[+\d\s().-]+$/;

class SupplierContactInputDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  fullName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  position?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  birthday?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;
}

class SupplierServiceInputDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sku?: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  serviceName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiPropertyOptional({ enum: SupplierDayType })
  @IsOptional()
  @IsEnum(SupplierDayType)
  dayType?: SupplierDayType;

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
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}

class SupplierAllotmentInputDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sku?: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  serviceName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiPropertyOptional({ enum: SupplierDayType })
  @IsOptional()
  @IsEnum(SupplierDayType)
  dayType?: SupplierDayType;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  allotmentQty?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  bookedQty?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  lockedQty?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  quantityLock?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  cutoffDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  netCostPerDay?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  sellingPricePerDay?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;
}

export class CreateHotelSupplierDto {
  @ApiProperty()
  @Transform(trimRequired)
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
  @IsString()
  taxCode?: string;

  @ApiProperty()
  @Transform(trimRequired)
  @IsString({ message: 'Số điện thoại nhà cung cấp phải là chuỗi ký tự' })
  @Matches(supplierPhonePattern, { message: 'Số điện thoại nhà cung cấp không hợp lệ' })
  phone!: string;

  @ApiPropertyOptional()
  @Transform(trimOptional)
  @IsOptional()
  @IsEmail({}, { message: 'Email nhà cung cấp không hợp lệ' })
  @MaxLength(180, { message: 'Email nhà cung cấp không được vượt quá 180 ký tự' })
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  province?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  website?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  builtYear?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  rating?: number;

  @ApiProperty()
  @Transform(trimRequired)
  @IsString({ message: 'Hạng khách sạn phải là chuỗi ký tự' })
  @MinLength(1, { message: 'Cần nhập hạng khách sạn' })
  classHotel!: string;

  @ApiProperty()
  @Transform(trimRequired)
  @IsString({ message: 'Dự án khách sạn phải là chuỗi ký tự' })
  @MinLength(1, { message: 'Cần nhập dự án khách sạn' })
  hotelProject!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bankAccountName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bankAccountNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bankName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  market?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  link?: string;

  @ApiPropertyOptional({ enum: SupplierStatus })
  @IsOptional()
  @IsEnum(SupplierStatus)
  status?: SupplierStatus;

  @ApiPropertyOptional({ type: [SupplierContactInputDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SupplierContactInputDto)
  contacts?: SupplierContactInputDto[];

  @ApiPropertyOptional({ type: [SupplierServiceInputDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SupplierServiceInputDto)
  services?: SupplierServiceInputDto[];

  @ApiPropertyOptional({ type: [SupplierAllotmentInputDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SupplierAllotmentInputDto)
  allotments?: SupplierAllotmentInputDto[];
}

export class UpdateHotelSupplierDto extends PartialType(CreateHotelSupplierDto) {}

export class UpdateSupplierStatusDto {
  @ApiProperty({ enum: SupplierStatus })
  @IsEnum(SupplierStatus)
  status!: SupplierStatus;
}

export class OverrideAllotmentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  allotmentQty?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  bookedQty?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  lockedQty?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  actor?: string;
}

export class LockAllotmentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  serviceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  orderId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bookingId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tourId?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  actor?: string;
}

export class ReleaseAllotmentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  actor?: string;
}

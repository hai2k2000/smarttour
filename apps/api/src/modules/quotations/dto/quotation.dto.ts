import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { QuotationProductType, QuotationStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEmail, IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { LIST_SEARCH_MAX_LENGTH } from '../../list-search';

export const DEFAULT_QUOTATIONS_TAKE = 100;
export const MAX_QUOTATIONS_TAKE = 200;

const trimOptional = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return trimmed || undefined;
};

const optionalNumber = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'string' && !value.trim()) return undefined;
  return Number(value);
};

export class ListQuotationsQueryDto {
  @ApiPropertyOptional({ maxLength: LIST_SEARCH_MAX_LENGTH, description: 'Tu khoa tim kiem bao gia hop nhat.' })
  @Transform(trimOptional)
  @IsOptional()
  @IsString({ message: 'Tu khoa tim kiem bao gia phai la chuoi' })
  @MaxLength(LIST_SEARCH_MAX_LENGTH, { message: `Tu khoa tim kiem bao gia khong duoc vuot qua ${LIST_SEARCH_MAX_LENGTH} ky tu` })
  search?: string;

  @ApiPropertyOptional({ enum: QuotationProductType })
  @Transform(trimOptional)
  @IsOptional()
  @IsEnum(QuotationProductType, { message: 'Loai san pham bao gia khong hop le' })
  productType?: QuotationProductType;

  @ApiPropertyOptional({ enum: QuotationStatus })
  @Transform(trimOptional)
  @IsOptional()
  @IsEnum(QuotationStatus, { message: 'Trang thai bao gia khong hop le' })
  status?: QuotationStatus;

  @ApiPropertyOptional({ maxLength: 120 })
  @Transform(trimOptional)
  @IsOptional()
  @IsString({ message: 'Nhan vien kinh doanh phai la chuoi' })
  @MaxLength(120, { message: 'Nhan vien kinh doanh khong duoc vuot qua 120 ky tu' })
  salesOwner?: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @Transform(trimOptional)
  @IsOptional()
  @IsString({ message: 'Chi nhanh phai la chuoi' })
  @MaxLength(120, { message: 'Chi nhanh khong duoc vuot qua 120 ky tu' })
  branch?: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @Transform(trimOptional)
  @IsOptional()
  @IsString({ message: 'Nhom thi truong phai la chuoi' })
  @MaxLength(120, { message: 'Nhom thi truong khong duoc vuot qua 120 ky tu' })
  marketGroup?: string;

  @ApiPropertyOptional({ default: DEFAULT_QUOTATIONS_TAKE, minimum: 1, maximum: MAX_QUOTATIONS_TAKE })
  @Transform(optionalNumber)
  @IsOptional()
  @IsInt({ message: 'So bao gia moi trang phai la so nguyen' })
  @Min(1, { message: 'So bao gia moi trang phai lon hon 0' })
  @Max(MAX_QUOTATIONS_TAKE, { message: `So bao gia moi trang khong duoc vuot qua ${MAX_QUOTATIONS_TAKE}` })
  take?: number;
}

class QuotationItemDto {
  @ApiProperty() @IsString() @MinLength(2) serviceType!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() supplierId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() serviceId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() supplierName?: string;
  @ApiProperty() @IsString() @MinLength(2) serviceName!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() unit?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) quantity?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) paxCount?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) nightCount?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) netPrice?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) vat?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() markupAmount?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() markupPercent?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

export class CreateQuotationDto {
  @ApiProperty() @IsString() @MinLength(2) quoteCode!: string;
  @ApiProperty({ enum: QuotationProductType }) @IsEnum(QuotationProductType) productType!: QuotationProductType;
  @ApiPropertyOptional() @IsOptional() @IsString() customerCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() customerName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() customerPhone?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() customerEmail?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() salesOwner?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() operatorOwner?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() branch?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() department?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() marketGroup?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() productCategory?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() route?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) paxAdult?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) paxChild?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) paxInfant?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() exchangeRate?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() createdDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() expiredDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() expectedPaymentDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() departureDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() returnDate?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) approvalLevel?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) childPricePercent?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) infantPricePercent?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() language?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() terms?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
  @ApiPropertyOptional({ type: [QuotationItemDto] }) @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => QuotationItemDto) items?: QuotationItemDto[];
}

export class UpdateQuotationDto extends PartialType(CreateQuotationDto) {}

export class QuotationActionDto {
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

export class QuotationSmartLinkDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

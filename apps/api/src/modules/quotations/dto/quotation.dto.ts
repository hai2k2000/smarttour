import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { QuotationProductType, QuotationStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEmail, IsEnum, IsNumber, IsOptional, IsString, Min, MinLength, ValidateNested } from 'class-validator';

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
  @ApiPropertyOptional({ enum: QuotationStatus }) @IsOptional() @IsEnum(QuotationStatus) status?: QuotationStatus;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) childPricePercent?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) infantPricePercent?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() smartLinkEnabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() language?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() terms?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
  @ApiPropertyOptional({ type: [QuotationItemDto] }) @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => QuotationItemDto) items?: QuotationItemDto[];
}

export class UpdateQuotationDto extends PartialType(CreateQuotationDto) {}

export class QuotationActionDto {
  @ApiPropertyOptional() @IsOptional() @IsString() actor?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

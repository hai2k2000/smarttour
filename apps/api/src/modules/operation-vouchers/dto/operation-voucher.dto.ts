import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsNumber, IsOptional, IsString, Max, Min, MinLength, ValidateNested } from 'class-validator';

class OperationVoucherDetailDto {
  @ApiPropertyOptional() @IsOptional() @IsString() sku?: string;
  @ApiProperty() @IsString() @MinLength(2) serviceName!: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0.01) quantity?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() unit?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) netPrice?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) vat?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

export class CreateOperationVoucherDto {
  @ApiProperty() @IsString() @MinLength(2) voucherCode!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() tourId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bookingId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() orderId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() supplierId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() supplierName?: string;
  @ApiProperty() @IsString() @MinLength(2) serviceType!: string;
  @ApiProperty() @IsString() @MinLength(2) serviceName!: string;
  @ApiProperty() @IsDateString() serviceDate!: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() paymentDeadline?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() createdBy?: string;
  @ApiPropertyOptional({ type: [OperationVoucherDetailDto] }) @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => OperationVoucherDetailDto) details?: OperationVoucherDetailDto[];
}

export class UpdateOperationVoucherDto extends PartialType(CreateOperationVoucherDto) {}

export class AddOperationVoucherPaymentDto {
  @ApiPropertyOptional() @IsOptional() @IsString() paymentVoucherId?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0.01) paidAmount?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0.01) paymentAmount?: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() paymentDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

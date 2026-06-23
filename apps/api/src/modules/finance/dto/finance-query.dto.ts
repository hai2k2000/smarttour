import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class FinanceQueryDto {
  [key: string]: string | undefined;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  receiptType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  voucherType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  invoiceType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  entryType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  supplierId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tourId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branch?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  department?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assignedStaff?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  staff?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  minAmount?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  maxAmount?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  to?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  take?: string;

  @ApiPropertyOptional({ enum: ['csv', 'xlsx'] })
  @IsOptional()
  @IsString()
  format?: string;
}

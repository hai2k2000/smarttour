import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentStatus, TourStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsEnum, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateLandTourDto {
  @ApiProperty({ example: 'LAND-2026-0001' })
  @IsString()
  @MinLength(2)
  systemCode!: string;

  @ApiProperty({ example: 'LAND-DN-COMBO-001' })
  @IsString()
  @MinLength(2)
  tourCode!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  orderId?: string;

  @ApiProperty({ example: 'Combo Da Nang land + hotel + car' })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiPropertyOptional({ enum: TourStatus })
  @IsOptional()
  @IsEnum(TourStatus)
  status?: TourStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  workflowStep?: string;

  @ApiPropertyOptional({ enum: PaymentStatus })
  @IsOptional()
  @IsEnum(PaymentStatus)
  paymentStatus?: PaymentStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  route?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  itinerarySummary?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  marketGroup?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  bookingDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  paymentDueDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  operatorOwner?: string;

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
  customerSource?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  guideName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comboType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  exchangeRateCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  exchangeRate?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  termsVi?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  termsEn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  autoTermsEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  smartLinkCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  confirmationNote?: string;

  @ApiPropertyOptional({ type: Array })
  @IsOptional()
  @IsArray()
  revenues?: unknown[];

  @ApiPropertyOptional({ type: Array })
  @IsOptional()
  @IsArray()
  costs?: unknown[];

  @ApiPropertyOptional({ type: Array })
  @IsOptional()
  @IsArray()
  salesServices?: unknown[];

  @ApiPropertyOptional({ type: Array })
  @IsOptional()
  @IsArray()
  operationServices?: unknown[];

  @ApiPropertyOptional({ type: Array })
  @IsOptional()
  @IsArray()
  guides?: unknown[];

  @ApiPropertyOptional({ type: Array })
  @IsOptional()
  @IsArray()
  attachments?: unknown[];

  @ApiPropertyOptional({ type: Array })
  @IsOptional()
  @IsArray()
  surveyQuestions?: unknown[];
}

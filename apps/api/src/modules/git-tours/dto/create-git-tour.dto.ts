import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentStatus, TourStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsEnum, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateGitTourDto {
  @ApiProperty({ example: 'GIT-2026-0001' })
  @IsString()
  @MinLength(2)
  systemCode!: string;

  @ApiProperty({ example: 'GIT-HN-DN-001' })
  @IsString()
  @MinLength(2)
  tourCode!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  orderId?: string;

  @ApiProperty({ example: 'Doan cong ty ABC Da Nang 4N3D' })
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
  holdCode?: string;

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
  agentName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  operatorOwner?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  collaborator?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  commissionRate?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  invoiceStatus?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  accountCode?: string;

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
  fileNote?: string;

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
  budgetServices?: unknown[];

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

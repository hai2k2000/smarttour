import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentStatus, TourStatus, TourType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, Matches, Min, MinLength } from 'class-validator';

export const TOUR_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class CreateTourDto {
  @ApiProperty({ enum: TourType })
  @IsEnum(TourType)
  type!: TourType;

  @ApiProperty({ example: 'TOUR-2026-0001' })
  @IsString()
  @MinLength(2)
  systemCode!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  orderId?: string;

  @ApiProperty({ example: 'FIT-HN-DN-001' })
  @IsString()
  @MinLength(2)
  tourCode!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ enum: TourStatus })
  @IsOptional()
  @IsEnum(TourStatus)
  status?: TourStatus;

  @ApiPropertyOptional({ enum: PaymentStatus })
  @IsOptional()
  @IsEnum(PaymentStatus)
  paymentStatus?: PaymentStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  workflowStep?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  marketGroup?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  productType?: string;

  @ApiPropertyOptional({ example: '2026-06-15' })
  @IsOptional()
  @IsString()
  @Matches(TOUR_DATE_PATTERN, { message: 'Ng\u00e0y booking tour ph\u1ea3i c\u00f3 \u0111\u1ecbnh d\u1ea1ng YYYY-MM-DD' })
  bookingDate?: string;

  @ApiPropertyOptional({ example: '2026-06-20' })
  @IsOptional()
  @IsString()
  @Matches(TOUR_DATE_PATTERN, { message: 'Ng\u00e0y h\u1ea1n thanh to\u00e1n tour ph\u1ea3i c\u00f3 \u0111\u1ecbnh d\u1ea1ng YYYY-MM-DD' })
  paymentDueDate?: string;

  @ApiPropertyOptional({ example: '2026-06-15' })
  @IsOptional()
  @IsString()
  @Matches(TOUR_DATE_PATTERN, { message: 'Ng\u00e0y kh\u1edfi h\u00e0nh tour ph\u1ea3i c\u00f3 \u0111\u1ecbnh d\u1ea1ng YYYY-MM-DD' })
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-06-18' })
  @IsOptional()
  @IsString()
  @Matches(TOUR_DATE_PATTERN, { message: 'Ng\u00e0y k\u1ebft th\u00fac tour ph\u1ea3i c\u00f3 \u0111\u1ecbnh d\u1ea1ng YYYY-MM-DD' })
  endDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  createdBy?: string;

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
  route?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  flightRoute?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  pickupPoint?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dropoffPoint?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

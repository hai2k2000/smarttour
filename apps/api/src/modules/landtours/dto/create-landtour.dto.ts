import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentStatus, TourStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, IsNumber, IsOptional, IsString, Matches, Min, MinLength } from 'class-validator';

export const LANDTOUR_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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

  @ApiPropertyOptional({ example: '2026-06-15' })
  @IsOptional()
  @IsString()
  @Matches(LANDTOUR_DATE_PATTERN, { message: 'Ng\u00e0y booking LandTour ph\u1ea3i c\u00f3 \u0111\u1ecbnh d\u1ea1ng YYYY-MM-DD' })
  bookingDate?: string;

  @ApiPropertyOptional({ example: '2026-06-20' })
  @IsOptional()
  @IsString()
  @Matches(LANDTOUR_DATE_PATTERN, { message: 'Ng\u00e0y h\u1ea1n thanh to\u00e1n LandTour ph\u1ea3i c\u00f3 \u0111\u1ecbnh d\u1ea1ng YYYY-MM-DD' })
  paymentDueDate?: string;

  @ApiPropertyOptional({ example: '2026-06-15' })
  @IsOptional()
  @IsString()
  @Matches(LANDTOUR_DATE_PATTERN, { message: 'Ng\u00e0y kh\u1edfi h\u00e0nh LandTour ph\u1ea3i c\u00f3 \u0111\u1ecbnh d\u1ea1ng YYYY-MM-DD' })
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-06-18' })
  @IsOptional()
  @IsString()
  @Matches(LANDTOUR_DATE_PATTERN, { message: 'Ng\u00e0y k\u1ebft th\u00fac LandTour ph\u1ea3i c\u00f3 \u0111\u1ecbnh d\u1ea1ng YYYY-MM-DD' })
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

export const LANDTOUR_ROOT_FIELDS = [
  'systemCode',
  'tourCode',
  'orderId',
  'name',
  'paymentStatus',
  'route',
  'marketGroup',
  'bookingDate',
  'paymentDueDate',
  'startDate',
  'endDate',
  'operatorOwner',
  'branch',
  'department',
  'customerSource',
  'exchangeRateCode',
  'exchangeRate',
  'notes',
] as const satisfies readonly (keyof CreateLandTourDto)[];

export const LANDTOUR_LIFECYCLE_FIELDS = [
  'status',
] as const satisfies readonly (keyof CreateLandTourDto)[];

export const LANDTOUR_WORKFLOW_FIELDS = [
  'workflowStep',
] as const satisfies readonly (keyof CreateLandTourDto)[];

export const LANDTOUR_LINK_AND_CUSTOMER_FIELDS = [
  'customerName',
] as const satisfies readonly (keyof CreateLandTourDto)[];

export const LANDTOUR_LEGACY_ALIAS_FIELDS = [
  'itinerarySummary',
] as const satisfies readonly (keyof CreateLandTourDto)[];

export const LANDTOUR_DETAIL_FIELDS = [
  'comboType',
  'autoTermsEnabled',
  'smartLinkCode',
  'confirmationNote',
  'termsVi',
  'termsEn',
] as const satisfies readonly (keyof CreateLandTourDto)[];

export const LANDTOUR_CHILD_FIELDS = [
  'guideName',
  'revenues',
  'costs',
  'salesServices',
  'operationServices',
  'guides',
  'attachments',
  'surveyQuestions',
] as const satisfies readonly (keyof CreateLandTourDto)[];

export const LANDTOUR_CREATE_FIELDS = [
  ...LANDTOUR_ROOT_FIELDS,
  ...LANDTOUR_LIFECYCLE_FIELDS,
  ...LANDTOUR_WORKFLOW_FIELDS,
  ...LANDTOUR_LINK_AND_CUSTOMER_FIELDS,
  ...LANDTOUR_LEGACY_ALIAS_FIELDS,
  ...LANDTOUR_DETAIL_FIELDS,
  ...LANDTOUR_CHILD_FIELDS,
] as const satisfies readonly (keyof CreateLandTourDto)[];

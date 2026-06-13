import { ApiPropertyOptional } from '@nestjs/swagger';
import { OrderCostStatus, OrderPaymentStatus, OrderStatus, OrderType, PaymentStatus, TourStatus, TourType } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBooleanString, IsDateString, IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { LIST_SEARCH_MAX_LENGTH } from '../../list-search';

const trimOptional = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return trimmed || undefined;
};

const upperOptional = ({ value }: { value: unknown }) => {
  const trimmed = trimOptional({ value });
  return typeof trimmed === 'string' ? trimmed.toUpperCase() : trimmed;
};

const enumValues = <T extends Record<string, string>>(value: T) => Object.values(value);
const uniqueValues = (...values: string[][]) => Array.from(new Set(values.flat()));

const REPORT_TYPE_VALUES = uniqueValues(enumValues(OrderType), enumValues(TourType));
const REPORT_STATUS_VALUES = uniqueValues(enumValues(OrderStatus), enumValues(TourStatus));
const REPORT_PAYMENT_STATUS_VALUES = uniqueValues(enumValues(OrderPaymentStatus), enumValues(PaymentStatus));
const REPORT_DATE_FIELDS = ['createdAt', 'bookingDate', 'startDate', 'endDate', 'paymentDate', 'settledAt', 'closedAt'] as const;
const REPORT_GROUPS = ['by-created-date', 'by-checkin-date', 'by-checkout-date', 'by-approved-date', 'by-employee', 'by-agency', 'by-branch', 'by-department', 'by-market', 'by-type'] as const;

export class ReportQueryDto {
  @ApiPropertyOptional({ maxLength: LIST_SEARCH_MAX_LENGTH })
  @Transform(trimOptional)
  @IsOptional()
  @IsString({ message: 'search must be a string' })
  @MaxLength(LIST_SEARCH_MAX_LENGTH, { message: `search must not exceed ${LIST_SEARCH_MAX_LENGTH} characters` })
  search?: string;

  @ApiPropertyOptional({ enum: REPORT_TYPE_VALUES })
  @Transform(upperOptional)
  @IsOptional()
  @IsIn(REPORT_TYPE_VALUES, { message: 'type is not valid' })
  type?: string;

  @ApiPropertyOptional({ enum: REPORT_STATUS_VALUES })
  @Transform(upperOptional)
  @IsOptional()
  @IsIn(REPORT_STATUS_VALUES, { message: 'status is not valid' })
  status?: string;

  @ApiPropertyOptional({ enum: REPORT_PAYMENT_STATUS_VALUES })
  @Transform(upperOptional)
  @IsOptional()
  @IsIn(REPORT_PAYMENT_STATUS_VALUES, { message: 'paymentStatus is not valid' })
  paymentStatus?: string;

  @ApiPropertyOptional({ enum: OrderCostStatus })
  @Transform(upperOptional)
  @IsOptional()
  @IsEnum(OrderCostStatus, { message: 'costStatus is not valid' })
  costStatus?: OrderCostStatus;

  @ApiPropertyOptional({ enum: REPORT_DATE_FIELDS })
  @Transform(trimOptional)
  @IsOptional()
  @IsIn(REPORT_DATE_FIELDS, { message: 'dateField is not valid' })
  dateField?: string;

  @ApiPropertyOptional({ enum: REPORT_GROUPS })
  @Transform(trimOptional)
  @IsOptional()
  @IsIn(REPORT_GROUPS, { message: 'groupBy is not valid' })
  groupBy?: string;

  @ApiPropertyOptional({ enum: ['true', 'false'] })
  @Transform(trimOptional)
  @IsOptional()
  @IsBooleanString({ message: 'settled must be true or false' })
  settled?: string;

  @Transform(trimOptional)
  @IsOptional()
  @IsDateString({}, { message: 'dateFrom must be an ISO date string' })
  dateFrom?: string;

  @Transform(trimOptional)
  @IsOptional()
  @IsDateString({}, { message: 'dateTo must be an ISO date string' })
  dateTo?: string;

  @Transform(trimOptional)
  @IsOptional()
  @IsDateString({}, { message: 'createdFrom must be an ISO date string' })
  createdFrom?: string;

  @Transform(trimOptional)
  @IsOptional()
  @IsDateString({}, { message: 'createdTo must be an ISO date string' })
  createdTo?: string;

  @Transform(trimOptional)
  @IsOptional()
  @IsDateString({}, { message: 'from must be an ISO date string' })
  from?: string;

  @Transform(trimOptional)
  @IsOptional()
  @IsDateString({}, { message: 'to must be an ISO date string' })
  to?: string;

  @Transform(trimOptional)
  @IsOptional()
  @IsString()
  @MaxLength(80)
  customerId?: string;

  @Transform(trimOptional)
  @IsOptional()
  @IsString()
  @MaxLength(80)
  supplierId?: string;

  @Transform(trimOptional)
  @IsOptional()
  @IsString()
  @MaxLength(80)
  tourId?: string;

  @Transform(trimOptional)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  employee?: string;

  @Transform(trimOptional)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  branch?: string;

  @Transform(trimOptional)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  department?: string;

  @Transform(trimOptional)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  marketGroup?: string;

  @Transform(trimOptional)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  agency?: string;

  @Transform(trimOptional)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  customerType?: string;

  @Transform(trimOptional)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  supplier?: string;
}

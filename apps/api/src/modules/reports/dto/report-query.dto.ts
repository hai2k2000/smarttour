import { ApiPropertyOptional } from '@nestjs/swagger';
import { OrderCostStatus, OrderPaymentStatus, OrderStatus, OrderType, PaymentStatus, TourStatus, TourType } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBooleanString, IsDateString, IsEmpty, IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
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
const ORDER_REPORT_DATE_FIELDS = ['createdAt', 'bookingDate', 'startDate', 'endDate', 'paymentDate', 'settledAt'] as const;
const TOUR_REPORT_DATE_FIELDS = ['createdAt', 'bookingDate', 'startDate', 'endDate', 'closedAt'] as const;
const DEBT_REPORT_DATE_FIELDS = ['documentDate'] as const;
const REPORT_DATE_FIELDS = uniqueValues([...ORDER_REPORT_DATE_FIELDS], [...TOUR_REPORT_DATE_FIELDS], [...DEBT_REPORT_DATE_FIELDS]);
const REPORT_GROUPS = ['by-created-date', 'by-checkin-date', 'by-checkout-date', 'by-approved-date', 'by-employee', 'by-agency', 'by-branch', 'by-department', 'by-market', 'by-type'] as const;

export class BaseReportQueryDto {
  @ApiPropertyOptional({ maxLength: LIST_SEARCH_MAX_LENGTH })
  @Transform(trimOptional)
  @IsOptional()
  @IsString({ message: 'search must be a string' })
  @MaxLength(LIST_SEARCH_MAX_LENGTH, { message: `search must not exceed ${LIST_SEARCH_MAX_LENGTH} characters` })
  search?: string;

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

export class OrderFilterReportQueryDto extends BaseReportQueryDto {
  @ApiPropertyOptional({ enum: OrderType })
  @Transform(upperOptional)
  @IsOptional()
  @IsEnum(OrderType, { message: 'type is not valid for Order reports' })
  type?: OrderType;

  @ApiPropertyOptional({ enum: OrderStatus })
  @Transform(upperOptional)
  @IsOptional()
  @IsEnum(OrderStatus, { message: 'status is not valid for Order reports' })
  status?: OrderStatus;

  @ApiPropertyOptional({ enum: OrderPaymentStatus })
  @Transform(upperOptional)
  @IsOptional()
  @IsEnum(OrderPaymentStatus, { message: 'paymentStatus is not valid for Order reports' })
  paymentStatus?: OrderPaymentStatus;

  @ApiPropertyOptional({ enum: OrderCostStatus })
  @Transform(upperOptional)
  @IsOptional()
  @IsEnum(OrderCostStatus, { message: 'costStatus is not valid for Order reports' })
  costStatus?: OrderCostStatus;

}

export class OrderReportQueryDto extends OrderFilterReportQueryDto {
  @ApiPropertyOptional({ enum: ORDER_REPORT_DATE_FIELDS })
  @Transform(trimOptional)
  @IsOptional()
  @IsIn(ORDER_REPORT_DATE_FIELDS, { message: 'dateField is not valid for Order reports' })
  dateField?: string;
}

export class DebtReportQueryDto extends OrderFilterReportQueryDto {
  @ApiPropertyOptional({ enum: DEBT_REPORT_DATE_FIELDS })
  @Transform(trimOptional)
  @IsOptional()
  @IsIn(DEBT_REPORT_DATE_FIELDS, { message: 'dateField is not valid for debt reports' })
  dateField?: string;
}

export class TourReportQueryDto extends BaseReportQueryDto {
  @ApiPropertyOptional({ enum: TourType })
  @Transform(upperOptional)
  @IsOptional()
  @IsEnum(TourType, { message: 'type is not valid for Tour reports' })
  type?: TourType;

  @ApiPropertyOptional({ enum: TourStatus })
  @Transform(upperOptional)
  @IsOptional()
  @IsEnum(TourStatus, { message: 'status is not valid for Tour reports' })
  status?: TourStatus;

  @ApiPropertyOptional({ enum: PaymentStatus })
  @Transform(upperOptional)
  @IsOptional()
  @IsEnum(PaymentStatus, { message: 'paymentStatus is not valid for Tour reports' })
  paymentStatus?: PaymentStatus;

  @ApiPropertyOptional({ enum: TOUR_REPORT_DATE_FIELDS })
  @Transform(trimOptional)
  @IsOptional()
  @IsIn(TOUR_REPORT_DATE_FIELDS, { message: 'dateField is not valid for Tour reports' })
  dateField?: string;

  @ApiPropertyOptional({ description: 'Order-only filter; not accepted for Tour reports' })
  @Transform(upperOptional)
  @IsEmpty({ message: 'costStatus is not valid for Tour reports' })
  costStatus?: never;
}

export class ReportQueryDto extends BaseReportQueryDto {
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
}

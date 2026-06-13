import { ApiPropertyOptional } from '@nestjs/swagger';
import { CommissionPaymentStatus, CommissionStatus, OrderType } from '@prisma/client';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { LIST_SEARCH_MAX_LENGTH } from '../../list-search';

const MAX_COMMISSION_ACTION_IDS = 100;

export enum CommissionReportGroupBy {
  SalesOwner = 'salesOwner',
  Department = 'department',
  Branch = 'branch',
  Market = 'market',
  Team = 'team',
}

export enum CommissionReportSortBy {
  MilestoneDate = 'milestoneDate',
  Revenue = 'revenue',
  Commission = 'commission',
  Employee = 'employee',
}

const trimOptional = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return trimmed || undefined;
};

const normalizeEnum = ({ value }: { value: unknown }) => {
  const trimmed = trimOptional({ value });
  return typeof trimmed === 'string' ? trimmed.toUpperCase() : trimmed;
};

const optionalInt = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'string' && !value.trim()) return undefined;
  return Number(value);
};

const optionalNumber = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'string' && !value.trim()) return undefined;
  return Number(value);
};

export class CommissionReportsQueryDto {
  @ApiPropertyOptional({ maxLength: LIST_SEARCH_MAX_LENGTH })
  @Transform(trimOptional)
  @IsOptional()
  @IsString({ message: 'search must be a string' })
  @MaxLength(LIST_SEARCH_MAX_LENGTH, { message: `search must not exceed ${LIST_SEARCH_MAX_LENGTH} characters` })
  search?: string;

  @ApiPropertyOptional({ enum: CommissionStatus })
  @Transform(normalizeEnum)
  @IsOptional()
  @IsEnum(CommissionStatus, { message: 'status is not valid' })
  status?: CommissionStatus;

  @ApiPropertyOptional({ enum: CommissionPaymentStatus })
  @Transform(normalizeEnum)
  @IsOptional()
  @IsEnum(CommissionPaymentStatus, { message: 'paymentStatus is not valid' })
  paymentStatus?: CommissionPaymentStatus;

  @ApiPropertyOptional({ enum: OrderType })
  @Transform(normalizeEnum)
  @IsOptional()
  @IsEnum(OrderType, { message: 'productType is not valid' })
  productType?: OrderType;

  @ApiPropertyOptional({ minimum: 1, maximum: 1000, default: 100 })
  @Transform(optionalInt)
  @IsOptional()
  @IsInt({ message: 'take must be an integer' })
  @Min(1, { message: 'take must be greater than 0' })
  @Max(1000, { message: 'take must not exceed 1000' })
  take?: number;

  @ApiPropertyOptional({ description: 'ISO date lower bound for milestoneDate' })
  @Transform(trimOptional)
  @IsOptional()
  @IsDateString({}, { message: 'from must be an ISO date string' })
  from?: string;

  @ApiPropertyOptional({ description: 'ISO date upper bound for milestoneDate' })
  @Transform(trimOptional)
  @IsOptional()
  @IsDateString({}, { message: 'to must be an ISO date string' })
  to?: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @Transform(trimOptional)
  @IsOptional()
  @IsString({ message: 'employee must be a string' })
  @MaxLength(120, { message: 'employee must not exceed 120 characters' })
  employee?: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @Transform(trimOptional)
  @IsOptional()
  @IsString({ message: 'salesOwner must be a string' })
  @MaxLength(120, { message: 'salesOwner must not exceed 120 characters' })
  salesOwner?: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @Transform(trimOptional)
  @IsOptional()
  @IsString({ message: 'department must be a string' })
  @MaxLength(120, { message: 'department must not exceed 120 characters' })
  department?: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @Transform(trimOptional)
  @IsOptional()
  @IsString({ message: 'branch must be a string' })
  @MaxLength(120, { message: 'branch must not exceed 120 characters' })
  branch?: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @Transform(trimOptional)
  @IsOptional()
  @IsString({ message: 'market must be a string' })
  @MaxLength(120, { message: 'market must not exceed 120 characters' })
  market?: string;

  @ApiPropertyOptional({ enum: CommissionReportGroupBy })
  @Transform(trimOptional)
  @IsOptional()
  @IsEnum(CommissionReportGroupBy, { message: 'groupBy is not valid' })
  groupBy?: CommissionReportGroupBy;

  @ApiPropertyOptional({ enum: CommissionReportSortBy })
  @Transform(trimOptional)
  @IsOptional()
  @IsEnum(CommissionReportSortBy, { message: 'sortBy is not valid' })
  sortBy?: CommissionReportSortBy;
}

export class CommissionReportActionDto {
  @ApiPropertyOptional({ maxLength: 80 })
  @Transform(trimOptional)
  @IsOptional()
  @IsString({ message: 'id must be a string' })
  @MaxLength(80, { message: 'id must not exceed 80 characters' })
  id?: string;

  @ApiPropertyOptional({ type: [String], maxItems: MAX_COMMISSION_ACTION_IDS })
  @IsOptional()
  @IsArray({ message: 'ids must be an array' })
  @ArrayMaxSize(MAX_COMMISSION_ACTION_IDS, { message: `ids must not contain more than ${MAX_COMMISSION_ACTION_IDS} items` })
  @IsString({ each: true, message: 'each ids item must be a string' })
  @MaxLength(80, { each: true, message: 'each ids item must not exceed 80 characters' })
  ids?: string[];

  @ApiPropertyOptional({ maxLength: 500 })
  @Transform(trimOptional)
  @IsOptional()
  @IsString({ message: 'note must be a string' })
  @MaxLength(500, { message: 'note must not exceed 500 characters' })
  note?: string;
}

export class PayCommissionReportDto extends CommissionReportActionDto {
  @ApiPropertyOptional({ minimum: 0.01 })
  @Transform(optionalNumber)
  @IsOptional()
  @IsNumber({ allowInfinity: false, allowNaN: false }, { message: 'amount must be a number' })
  @Min(0.01, { message: 'amount must be greater than 0' })
  amount?: number;

  @ApiPropertyOptional({ maxLength: 80 })
  @Transform(trimOptional)
  @IsOptional()
  @IsString({ message: 'voucherNo must be a string' })
  @MaxLength(80, { message: 'voucherNo must not exceed 80 characters' })
  voucherNo?: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @Transform(trimOptional)
  @IsOptional()
  @IsString({ message: 'receiver must be a string' })
  @MaxLength(120, { message: 'receiver must not exceed 120 characters' })
  receiver?: string;
}

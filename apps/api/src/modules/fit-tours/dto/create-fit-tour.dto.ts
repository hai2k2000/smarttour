import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FitTourWorkflowStatus, PaymentStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEmail, IsEnum, IsNumber, IsOptional, IsString, Matches, Min, MinLength } from 'class-validator';

export const FIT_TOUR_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class CreateFitTourDto {
  @ApiProperty({ example: 'FIT-Q-2026-0001' })
  @IsString()
  @MinLength(2)
  quoteCode!: string;

  @ApiProperty({ example: 'FIT-HN-DN-001' })
  @IsString()
  @MinLength(2)
  tourCode!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  orderId?: string;

  @ApiProperty({ example: 'Nguyen Van A' })
  @IsString()
  @MinLength(2)
  customerName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tourName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  marketGroup?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(FIT_TOUR_DATE_PATTERN, { message: 'Ngày FIT phải có định dạng YYYY-MM-DD' })
  bookingDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(FIT_TOUR_DATE_PATTERN, { message: 'Ngày FIT phải có định dạng YYYY-MM-DD' })
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(FIT_TOUR_DATE_PATTERN, { message: 'Ngày FIT phải có định dạng YYYY-MM-DD' })
  endDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  adultCount?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  childCount?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  infantCount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  sellingPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  commissionPerGuest?: number;

  @ApiPropertyOptional({ enum: FitTourWorkflowStatus })
  @IsOptional()
  @IsEnum(FitTourWorkflowStatus)
  workflowStatus?: FitTourWorkflowStatus;
  @ApiPropertyOptional({ enum: PaymentStatus })
  @IsOptional()
  @IsEnum(PaymentStatus)
  paymentStatus?: PaymentStatus;
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
  @IsBoolean()
  allowOverbooking?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  flightRoute?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tourType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  exchangeRateCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  exchangeRate?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  operatorOwner?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  seatCount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  tourPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  adultPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  childPrice25?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  childPrice611?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  infantPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  surcharge?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  transportMode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  outboundRoute?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  outboundCarrier?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  returnRoute?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  returnCarrier?: string;

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
  @Matches(FIT_TOUR_DATE_PATTERN, { message: 'Ngày FIT phải có định dạng YYYY-MM-DD' })
  visaDeadline?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(FIT_TOUR_DATE_PATTERN, { message: 'Ngày FIT phải có định dạng YYYY-MM-DD' })
  holdUntil?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(FIT_TOUR_DATE_PATTERN, { message: 'Ngày FIT phải có định dạng YYYY-MM-DD' })
  confirmedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(FIT_TOUR_DATE_PATTERN, { message: 'Ngày FIT phải có định dạng YYYY-MM-DD' })
  closeAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  handoverGuideRequest?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  surveyDescription?: string;

  @ApiPropertyOptional({ type: Array })
  @IsOptional()
  @IsArray()
  commonCosts?: unknown[];

  @ApiPropertyOptional({ type: Array })
  @IsOptional()
  @IsArray()
  hotelCosts?: unknown[];

  @ApiPropertyOptional({ type: Array })
  @IsOptional()
  @IsArray()
  privateCosts?: unknown[];

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
  handoverItems?: unknown[];

  @ApiPropertyOptional({ type: Array })
  @IsOptional()
  @IsArray()
  surveyQuestions?: unknown[];

  @ApiPropertyOptional({ type: Array })
  @IsOptional()
  @IsArray()
  attachments?: unknown[];
}

export const FIT_TOUR_ROOT_FIELDS = [
  'quoteCode',
  'tourCode',
  'tourName',
  'marketGroup',
  'bookingDate',
  'startDate',
  'endDate',
  'paymentStatus',
  'branch',
  'department',
  'customerSource',
  'flightRoute',
  'tourType',
  'exchangeRateCode',
  'exchangeRate',
  'operatorOwner',
  'pickupPoint',
  'dropoffPoint',
  'notes',
] as const satisfies readonly (keyof CreateFitTourDto)[];

export const FIT_TOUR_LINK_AND_CUSTOMER_FIELDS = [
  'customerId',
  'orderId',
  'customerName',
  'phone',
  'email',
] as const satisfies readonly (keyof CreateFitTourDto)[];

export const FIT_TOUR_WORKFLOW_FIELDS = [
  'workflowStatus',
] as const satisfies readonly (keyof CreateFitTourDto)[];

export const FIT_TOUR_DETAIL_FIELDS = [
  'adultCount',
  'childCount',
  'infantCount',
  'sellingPrice',
  'commissionPerGuest',
  'allowOverbooking',
  'seatCount',
  'tourPrice',
  'discount',
  'adultPrice',
  'childPrice25',
  'childPrice611',
  'infantPrice',
  'surcharge',
  'transportMode',
  'outboundRoute',
  'outboundCarrier',
  'returnRoute',
  'returnCarrier',
  'visaDeadline',
  'holdUntil',
  'confirmedAt',
  'closeAt',
  'handoverGuideRequest',
  'surveyDescription',
] as const satisfies readonly (keyof CreateFitTourDto)[];

export const FIT_TOUR_CHILD_FIELDS = [
  'commonCosts',
  'hotelCosts',
  'privateCosts',
  'revenues',
  'costs',
  'budgetServices',
  'operationServices',
  'guides',
  'handoverItems',
  'surveyQuestions',
  'attachments',
] as const satisfies readonly (keyof CreateFitTourDto)[];

export const FIT_TOUR_CREATE_FIELDS = [
  ...FIT_TOUR_ROOT_FIELDS,
  ...FIT_TOUR_LINK_AND_CUSTOMER_FIELDS,
  ...FIT_TOUR_WORKFLOW_FIELDS,
  ...FIT_TOUR_DETAIL_FIELDS,
  ...FIT_TOUR_CHILD_FIELDS,
] as const satisfies readonly (keyof CreateFitTourDto)[];

export const FIT_TOUR_REJECTED_ROOT_WORKFLOW_FIELDS = ['status', 'workflowStep'] as const;


export const FIT_TOUR_STEP_FIELDS = {
  [FitTourWorkflowStatus.PRICING]: [
    'quoteCode',
    'tourCode',
    'marketGroup',
    'bookingDate',
    'startDate',
    'endDate',
    'customerName',
    'phone',
    'email',
    'adultCount',
    'childCount',
    'infantCount',
    'sellingPrice',
    'commissionPerGuest',
    'notes',
    'commonCosts',
    'hotelCosts',
    'privateCosts',
    'attachments',
  ],
  [FitTourWorkflowStatus.TOUR_INFO]: [
    'tourCode',
    'tourName',
    'flightRoute',
    'marketGroup',
    'startDate',
    'endDate',
    'tourType',
    'exchangeRateCode',
    'exchangeRate',
    'operatorOwner',
    'seatCount',
    'tourPrice',
    'discount',
    'adultPrice',
    'childPrice25',
    'childPrice611',
    'infantPrice',
    'surcharge',
    'transportMode',
    'outboundRoute',
    'outboundCarrier',
    'returnRoute',
    'returnCarrier',
    'pickupPoint',
    'dropoffPoint',
    'visaDeadline',
    'holdUntil',
    'confirmedAt',
    'closeAt',
    'allowOverbooking',
    'guides',
  ],
  [FitTourWorkflowStatus.BUDGET]: ['budgetServices'],
  [FitTourWorkflowStatus.OPERATION]: ['operationServices'],
  [FitTourWorkflowStatus.HANDOVER]: ['handoverGuideRequest', 'handoverItems'],
  [FitTourWorkflowStatus.SURVEY]: ['surveyDescription', 'surveyQuestions'],
} as const satisfies Record<string, readonly (keyof CreateFitTourDto)[]>;

import { Allow, IsArray, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

const operationStatuses = ['PENDING', 'IN_PROGRESS', 'DONE', 'PROBLEM', 'CANCELLED'] as const;
const supplierPaymentStatuses = ['DRAFT', 'REQUESTED', 'APPROVED', 'PAID', 'REJECTED'] as const;
const financePaymentMethods = ['CASH', 'BANK_TRANSFER', 'CARD', 'QR', 'OFFSET', 'OTHER'] as const;

class OperationBodyDto {
  [key: string]: unknown;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  actor?: string;
}

class OperationFormBaseDto extends OperationBodyDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  bookingId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  orderId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  tourId?: string;

  @IsOptional()
  @IsIn(operationStatuses)
  status?: typeof operationStatuses[number];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsArray()
  @Allow()
  services?: unknown[];

  @IsOptional()
  @IsArray()
  @Allow()
  tasks?: unknown[];

  @IsOptional()
  @IsArray()
  @Allow()
  costs?: unknown[];
}

export class CreateOperationFormDto extends OperationFormBaseDto {}
export class UpdateOperationFormDto extends OperationFormBaseDto {}

export class OperationFormStatusDto extends OperationBodyDto {
  @IsOptional()
  @IsIn(operationStatuses)
  status?: typeof operationStatuses[number];
}

export class CancelOperationFormDto extends OperationBodyDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

class SupplierPaymentRequestBaseDto extends OperationBodyDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  code?: string;

  @IsOptional()
  @IsIn(supplierPaymentStatuses)
  status?: typeof supplierPaymentStatuses[number];

  @IsOptional()
  @IsString()
  @MaxLength(180)
  requestedBy?: string;

  @IsOptional()
  @IsArray()
  @Allow()
  items?: unknown[];
}

export class CreateSupplierPaymentRequestDto extends SupplierPaymentRequestBaseDto {}
export class UpdateSupplierPaymentRequestDto extends SupplierPaymentRequestBaseDto {}

export class SupplierPaymentRequestActionDto extends OperationBodyDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class CreateFinancePaymentForRequestDto extends OperationBodyDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  branch?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  department?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  paymentDate?: string;

  @IsOptional()
  @IsIn(financePaymentMethods)
  paymentMethod?: typeof financePaymentMethods[number];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  assignedStaff?: string;
}

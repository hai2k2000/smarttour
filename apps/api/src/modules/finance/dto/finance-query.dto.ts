import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { readonlyValues } from '../../query-validation';

const FINANCE_APPROVAL_STATUSES = ['DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const;
const FINANCE_RECEIPT_TYPES = ['DEPOSIT', 'TOUR_PAYMENT', 'CUSTOMER_DEBT', 'COLLECT_ON_BEHALF', 'SUPPLIER_FUND_REFUND', 'OTHER'] as const;
const FINANCE_PAYMENT_TYPES = ['SUPPLIER_PAYMENT', 'CUSTOMER_REFUND', 'COMMISSION', 'INTERNAL_EXPENSE', 'SUPPLIER_DEPOSIT', 'ADVANCE', 'OTHER'] as const;
const FINANCE_INVOICE_TYPES = ['VAT', 'NO_VAT', 'ADJUSTMENT', 'REPLACEMENT'] as const;
const FINANCE_CASHFLOW_ENTRY_TYPES = ['RECEIPT', 'PAYMENT'] as const;
const FINANCE_PAYMENT_METHODS = ['CASH', 'BANK_TRANSFER', 'CARD', 'QR', 'OFFSET', 'OTHER'] as const;

export class FinanceQueryDto {
  [key: string]: string | undefined;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: FINANCE_APPROVAL_STATUSES })
  @IsOptional()
  @IsIn(readonlyValues(FINANCE_APPROVAL_STATUSES))
  status?: string;

  @ApiPropertyOptional({ enum: FINANCE_RECEIPT_TYPES })
  @IsOptional()
  @IsIn(readonlyValues(FINANCE_RECEIPT_TYPES))
  receiptType?: string;

  @ApiPropertyOptional({ enum: FINANCE_PAYMENT_TYPES })
  @IsOptional()
  @IsIn(readonlyValues(FINANCE_PAYMENT_TYPES))
  voucherType?: string;

  @ApiPropertyOptional({ enum: FINANCE_INVOICE_TYPES })
  @IsOptional()
  @IsIn(readonlyValues(FINANCE_INVOICE_TYPES))
  invoiceType?: string;

  @ApiPropertyOptional({ enum: FINANCE_CASHFLOW_ENTRY_TYPES })
  @IsOptional()
  @IsIn(readonlyValues(FINANCE_CASHFLOW_ENTRY_TYPES))
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
  orderId?: string;

  @ApiPropertyOptional({ enum: FINANCE_PAYMENT_METHODS })
  @IsOptional()
  @IsIn(readonlyValues(FINANCE_PAYMENT_METHODS))
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  limit?: string;

  @ApiPropertyOptional({ enum: ['csv', 'xlsx'] })
  @IsOptional()
  @IsIn(['csv', 'xlsx'])
  format?: string;
}

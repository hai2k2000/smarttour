import { Allow, IsArray, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

const receiptTypes = ['DEPOSIT', 'TOUR_PAYMENT', 'CUSTOMER_DEBT', 'COLLECT_ON_BEHALF', 'SUPPLIER_FUND_REFUND', 'OTHER'] as const;
const paymentTypes = ['SUPPLIER_PAYMENT', 'CUSTOMER_REFUND', 'COMMISSION', 'INTERNAL_EXPENSE', 'SUPPLIER_DEPOSIT', 'ADVANCE', 'OTHER'] as const;
const paymentMethods = ['BANK_TRANSFER', 'CASH', 'CARD', 'QR', 'OFFSET', 'OTHER'] as const;
const invoiceTypes = ['VAT', 'NO_VAT', 'ADJUSTMENT', 'REPLACEMENT'] as const;
const adjustmentDirections = ['INCREASE', 'DECREASE'] as const;

class FinanceBodyDto {
  [key: string]: unknown;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  actor?: string;

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
  @MaxLength(180)
  assignedStaff?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  follower?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

class FinanceDocumentFieldsDto extends FinanceBodyDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  orderId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  tourId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  tourCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  tourName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  documentDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  transferDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  paymentDate?: string;

  @IsOptional()
  @IsIn(paymentMethods)
  paymentMethod?: typeof paymentMethods[number];

  @IsOptional()
  @Allow()
  totalAmount?: unknown;

  @IsOptional()
  @Allow()
  attachmentName?: unknown;

  @IsOptional()
  @Allow()
  attachmentUrl?: unknown;
}

export class FinanceReceiptBodyDto extends FinanceDocumentFieldsDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  receiptCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  receiptName?: string;

  @IsOptional()
  @IsIn(receiptTypes)
  receiptType?: typeof receiptTypes[number];

  @IsOptional()
  @IsString()
  @MaxLength(80)
  customerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  payerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  payerPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  payerEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  payerAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  partnerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  collectorSupplier?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  tourCreator?: string;

  @IsOptional()
  @Allow()
  paidBefore?: unknown;

  @IsOptional()
  @Allow()
  receiptAmount?: unknown;

  @IsOptional()
  @IsArray()
  @Allow()
  orders?: unknown[];
}

export class FinanceReceiptImportDto extends FinanceBodyDto {
  @IsOptional()
  @IsArray()
  @Allow()
  rows?: unknown[];

  @IsOptional()
  @IsString()
  csv?: string;
}

export class FinancePaymentBodyDto extends FinanceDocumentFieldsDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  voucherCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  voucherName?: string;

  @IsOptional()
  @IsIn(paymentTypes)
  voucherType?: typeof paymentTypes[number];

  @IsOptional()
  @IsString()
  @MaxLength(80)
  supplierId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  operationVoucherId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  receiverName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  receiverPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  receiverEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  receiverAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  partnerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  bankAccountName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  bankAccountNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  bankName?: string;

  @IsOptional()
  @Allow()
  paymentAmount?: unknown;

  @IsOptional()
  @Allow()
  isSupplierDeposit?: unknown;
}

export class FinancePaymentImportDto extends FinanceReceiptImportDto {}

export class FinanceInvoiceBodyDto extends FinanceBodyDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  invoiceCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  systemCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  orderId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  tourId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  receiptId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  customerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  customerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  customerPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  customerEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  citizenId?: string;

  @IsOptional()
  @IsIn(paymentMethods)
  paymentMethod?: typeof paymentMethods[number];

  @IsOptional()
  @IsString()
  @MaxLength(80)
  taxCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  companyName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  companyAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  bankAccountNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  bankName?: string;

  @IsOptional()
  @IsIn(invoiceTypes)
  invoiceType?: typeof invoiceTypes[number];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  taxAuthorityCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  invoiceNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  invoiceDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  issuedDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  emailSentDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  tourCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  tourName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  checkinDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  checkoutDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  amountInWords?: string;

  @IsOptional()
  @Allow()
  totalBeforeTax?: unknown;

  @IsOptional()
  @Allow()
  totalTax?: unknown;

  @IsOptional()
  @Allow()
  totalAfterTax?: unknown;

  @IsOptional()
  @IsArray()
  @Allow()
  items?: unknown[];
}

export class FinanceDocumentActionDto extends FinanceBodyDto {}

export class FinanceDebtAdjustmentDto extends FinanceBodyDto {
  @IsIn(adjustmentDirections)
  direction!: typeof adjustmentDirections[number];

  @Allow()
  amount!: unknown;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  orderId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  tourId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  documentCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  documentDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  dueDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

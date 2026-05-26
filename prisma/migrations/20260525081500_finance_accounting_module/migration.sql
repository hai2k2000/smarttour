CREATE TYPE "FinanceApprovalStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
CREATE TYPE "FinanceReceiptType" AS ENUM ('DEPOSIT', 'TOUR_PAYMENT', 'CUSTOMER_DEBT', 'COLLECT_ON_BEHALF', 'SUPPLIER_FUND_REFUND', 'OTHER');
CREATE TYPE "FinancePaymentType" AS ENUM ('SUPPLIER_PAYMENT', 'CUSTOMER_REFUND', 'COMMISSION', 'INTERNAL_EXPENSE', 'SUPPLIER_DEPOSIT', 'ADVANCE', 'OTHER');
CREATE TYPE "FinancePaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'CARD', 'QR', 'OFFSET', 'OTHER');
CREATE TYPE "FinanceCashflowEntryType" AS ENUM ('RECEIPT', 'PAYMENT');
CREATE TYPE "FinanceInvoiceStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
CREATE TYPE "FinanceInvoiceType" AS ENUM ('VAT', 'NO_VAT', 'ADJUSTMENT', 'REPLACEMENT');

CREATE TABLE "FinanceReceipt" (
  "id" TEXT NOT NULL,
  "receiptCode" TEXT NOT NULL,
  "receiptName" TEXT NOT NULL,
  "receiptType" "FinanceReceiptType" NOT NULL DEFAULT 'TOUR_PAYMENT',
  "documentDate" TIMESTAMP(3),
  "transferDate" TIMESTAMP(3),
  "paymentDate" TIMESTAMP(3),
  "paymentMethod" "FinancePaymentMethod" NOT NULL DEFAULT 'BANK_TRANSFER',
  "customerId" TEXT,
  "payerName" TEXT,
  "payerPhone" TEXT,
  "payerEmail" TEXT,
  "payerAddress" TEXT,
  "reason" TEXT,
  "partnerName" TEXT,
  "note" TEXT,
  "totalAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "paidBefore" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "receiptAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "remainingAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "approvalStatus" "FinanceApprovalStatus" NOT NULL DEFAULT 'DRAFT',
  "lockedAt" TIMESTAMP(3),
  "branch" TEXT,
  "department" TEXT,
  "assignedStaff" TEXT,
  "approvedBy" TEXT,
  "approvedAt" TIMESTAMP(3),
  "collectorSupplier" TEXT,
  "follower" TEXT,
  "tourCreator" TEXT,
  "attachmentName" TEXT,
  "attachmentUrl" TEXT,
  "deletedAt" TIMESTAMP(3),
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinanceReceipt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FinanceReceiptOrder" (
  "id" TEXT NOT NULL,
  "receiptId" TEXT NOT NULL,
  "orderId" TEXT,
  "orderCode" TEXT,
  "tourCode" TEXT,
  "tourName" TEXT,
  "amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceReceiptOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FinancePayment" (
  "id" TEXT NOT NULL,
  "voucherCode" TEXT NOT NULL,
  "voucherName" TEXT,
  "voucherType" "FinancePaymentType" NOT NULL DEFAULT 'SUPPLIER_PAYMENT',
  "documentDate" TIMESTAMP(3),
  "transferDate" TIMESTAMP(3),
  "paymentDate" TIMESTAMP(3),
  "paymentMethod" "FinancePaymentMethod" NOT NULL DEFAULT 'BANK_TRANSFER',
  "supplierId" TEXT,
  "operationVoucherId" TEXT,
  "orderId" TEXT,
  "receiverName" TEXT,
  "receiverPhone" TEXT,
  "receiverEmail" TEXT,
  "receiverAddress" TEXT,
  "reason" TEXT,
  "partnerName" TEXT,
  "note" TEXT,
  "totalAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "paymentAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "remainingAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "bankAccountName" TEXT,
  "bankAccountNumber" TEXT,
  "bankName" TEXT,
  "isSupplierDeposit" BOOLEAN NOT NULL DEFAULT false,
  "approvalStatus" "FinanceApprovalStatus" NOT NULL DEFAULT 'DRAFT',
  "lockedAt" TIMESTAMP(3),
  "branch" TEXT,
  "department" TEXT,
  "assignedStaff" TEXT,
  "approvedBy" TEXT,
  "approvedAt" TIMESTAMP(3),
  "follower" TEXT,
  "attachmentName" TEXT,
  "attachmentUrl" TEXT,
  "deletedAt" TIMESTAMP(3),
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinancePayment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FinanceInvoice" (
  "id" TEXT NOT NULL,
  "invoiceCode" TEXT NOT NULL,
  "systemCode" TEXT,
  "orderId" TEXT,
  "receiptId" TEXT,
  "customerId" TEXT,
  "customerName" TEXT,
  "customerPhone" TEXT,
  "customerEmail" TEXT,
  "citizenId" TEXT,
  "paymentMethod" "FinancePaymentMethod" NOT NULL DEFAULT 'BANK_TRANSFER',
  "taxCode" TEXT,
  "companyName" TEXT,
  "companyAddress" TEXT,
  "bankAccountNumber" TEXT,
  "bankName" TEXT,
  "invoiceType" "FinanceInvoiceType" NOT NULL DEFAULT 'VAT',
  "taxAuthorityCode" TEXT,
  "invoiceNumber" TEXT,
  "invoiceDate" TIMESTAMP(3),
  "issuedDate" TIMESTAMP(3),
  "emailSentDate" TIMESTAMP(3),
  "tourCode" TEXT,
  "tourName" TEXT,
  "checkinDate" TIMESTAMP(3),
  "checkoutDate" TIMESTAMP(3),
  "totalBeforeTax" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "totalTax" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "totalAfterTax" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "taxExemptTotal" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "taxUnreportedTotal" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "tax0Total" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "tax5Total" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "tax8Total" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "tax10Total" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "vat5Total" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "vat8Total" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "vat10Total" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "otherTaxTotal" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "amountInWords" TEXT,
  "status" "FinanceInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
  "approvalStatus" "FinanceApprovalStatus" NOT NULL DEFAULT 'DRAFT',
  "note" TEXT,
  "approvedBy" TEXT,
  "approvedAt" TIMESTAMP(3),
  "deletedAt" TIMESTAMP(3),
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinanceInvoice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FinanceInvoiceItem" (
  "id" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "itemName" TEXT NOT NULL,
  "unit" TEXT,
  "quantity" DECIMAL(65,30) NOT NULL DEFAULT 1,
  "unitPrice" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "amountBeforeTax" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "taxRate" DECIMAL(65,30) NOT NULL DEFAULT 10,
  "taxAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "amountAfterTax" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinanceInvoiceItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FinanceCashflowEntry" (
  "id" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "entryType" "FinanceCashflowEntryType" NOT NULL,
  "amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "paymentMethod" "FinancePaymentMethod" NOT NULL DEFAULT 'BANK_TRANSFER',
  "paymentDate" TIMESTAMP(3),
  "branch" TEXT,
  "department" TEXT,
  "staff" TEXT,
  "orderId" TEXT,
  "supplierId" TEXT,
  "customerId" TEXT,
  "note" TEXT,
  "receiptId" TEXT,
  "paymentId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceCashflowEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinanceReceipt_receiptCode_key" ON "FinanceReceipt"("receiptCode");
CREATE INDEX "FinanceReceipt_approvalStatus_idx" ON "FinanceReceipt"("approvalStatus");
CREATE INDEX "FinanceReceipt_paymentDate_idx" ON "FinanceReceipt"("paymentDate");
CREATE INDEX "FinanceReceipt_payerPhone_idx" ON "FinanceReceipt"("payerPhone");
CREATE INDEX "FinanceReceipt_branch_idx" ON "FinanceReceipt"("branch");
CREATE INDEX "FinanceReceipt_assignedStaff_idx" ON "FinanceReceipt"("assignedStaff");
CREATE INDEX "FinanceReceiptOrder_receiptId_idx" ON "FinanceReceiptOrder"("receiptId");
CREATE INDEX "FinanceReceiptOrder_orderId_idx" ON "FinanceReceiptOrder"("orderId");
CREATE INDEX "FinanceReceiptOrder_tourCode_idx" ON "FinanceReceiptOrder"("tourCode");
CREATE UNIQUE INDEX "FinancePayment_voucherCode_key" ON "FinancePayment"("voucherCode");
CREATE INDEX "FinancePayment_approvalStatus_idx" ON "FinancePayment"("approvalStatus");
CREATE INDEX "FinancePayment_paymentDate_idx" ON "FinancePayment"("paymentDate");
CREATE INDEX "FinancePayment_supplierId_idx" ON "FinancePayment"("supplierId");
CREATE INDEX "FinancePayment_branch_idx" ON "FinancePayment"("branch");
CREATE INDEX "FinancePayment_assignedStaff_idx" ON "FinancePayment"("assignedStaff");
CREATE UNIQUE INDEX "FinanceInvoice_invoiceCode_key" ON "FinanceInvoice"("invoiceCode");
CREATE INDEX "FinanceInvoice_status_idx" ON "FinanceInvoice"("status");
CREATE INDEX "FinanceInvoice_approvalStatus_idx" ON "FinanceInvoice"("approvalStatus");
CREATE INDEX "FinanceInvoice_issuedDate_idx" ON "FinanceInvoice"("issuedDate");
CREATE INDEX "FinanceInvoice_taxCode_idx" ON "FinanceInvoice"("taxCode");
CREATE INDEX "FinanceInvoice_customerPhone_idx" ON "FinanceInvoice"("customerPhone");
CREATE INDEX "FinanceInvoiceItem_invoiceId_idx" ON "FinanceInvoiceItem"("invoiceId");
CREATE UNIQUE INDEX "FinanceCashflowEntry_sourceType_sourceId_key" ON "FinanceCashflowEntry"("sourceType", "sourceId");
CREATE INDEX "FinanceCashflowEntry_entryType_idx" ON "FinanceCashflowEntry"("entryType");
CREATE INDEX "FinanceCashflowEntry_paymentDate_idx" ON "FinanceCashflowEntry"("paymentDate");
CREATE INDEX "FinanceCashflowEntry_branch_idx" ON "FinanceCashflowEntry"("branch");
CREATE INDEX "FinanceCashflowEntry_paymentMethod_idx" ON "FinanceCashflowEntry"("paymentMethod");

ALTER TABLE "FinanceReceiptOrder" ADD CONSTRAINT "FinanceReceiptOrder_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "FinanceReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinanceInvoiceItem" ADD CONSTRAINT "FinanceInvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "FinanceInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinanceCashflowEntry" ADD CONSTRAINT "FinanceCashflowEntry_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "FinanceReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinanceCashflowEntry" ADD CONSTRAINT "FinanceCashflowEntry_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "FinancePayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

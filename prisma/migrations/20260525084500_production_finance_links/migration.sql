-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('OPENING', 'DEBIT', 'CREDIT', 'ADJUSTMENT', 'REVERSAL');

-- CreateEnum
CREATE TYPE "LedgerPartyType" AS ENUM ('CUSTOMER', 'SUPPLIER');

-- CreateEnum
CREATE TYPE "LedgerSourceType" AS ENUM ('ORDER', 'OPERATION_VOUCHER', 'FINANCE_RECEIPT', 'FINANCE_PAYMENT', 'FINANCE_INVOICE', 'COMMISSION', 'MANUAL');

-- AlterTable
ALTER TABLE "FinanceInvoice" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledBy" TEXT,
ADD COLUMN     "reversalOfId" TEXT;

-- AlterTable
ALTER TABLE "FinancePayment" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledBy" TEXT,
ADD COLUMN     "reversalOfId" TEXT;

-- AlterTable
ALTER TABLE "FinanceReceipt" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledBy" TEXT,
ADD COLUMN     "reversalOfId" TEXT;

-- CreateTable
CREATE TABLE "CustomerLedgerEntry" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "orderId" TEXT,
    "receiptId" TEXT,
    "invoiceId" TEXT,
    "sourceType" "LedgerSourceType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "entryType" "LedgerEntryType" NOT NULL,
    "debitAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "creditAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "balanceAfter" DECIMAL(65,30),
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "exchangeRate" DECIMAL(65,30) NOT NULL DEFAULT 1,
    "documentCode" TEXT,
    "documentDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "branch" TEXT,
    "department" TEXT,
    "staff" TEXT,
    "description" TEXT,
    "reversedEntryId" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierLedgerEntry" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "orderId" TEXT,
    "operationVoucherId" TEXT,
    "paymentId" TEXT,
    "sourceType" "LedgerSourceType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "entryType" "LedgerEntryType" NOT NULL,
    "debitAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "creditAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "balanceAfter" DECIMAL(65,30),
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "exchangeRate" DECIMAL(65,30) NOT NULL DEFAULT 1,
    "documentCode" TEXT,
    "documentDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "branch" TEXT,
    "department" TEXT,
    "staff" TEXT,
    "description" TEXT,
    "reversedEntryId" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodeSequence" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER,
    "branch" TEXT,
    "currentNo" INTEGER NOT NULL DEFAULT 0,
    "padding" INTEGER NOT NULL DEFAULT 6,
    "pattern" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CodeSequence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerLedgerEntry_customerId_documentDate_idx" ON "CustomerLedgerEntry"("customerId", "documentDate");

-- CreateIndex
CREATE INDEX "CustomerLedgerEntry_orderId_idx" ON "CustomerLedgerEntry"("orderId");

-- CreateIndex
CREATE INDEX "CustomerLedgerEntry_receiptId_idx" ON "CustomerLedgerEntry"("receiptId");

-- CreateIndex
CREATE INDEX "CustomerLedgerEntry_invoiceId_idx" ON "CustomerLedgerEntry"("invoiceId");

-- CreateIndex
CREATE INDEX "CustomerLedgerEntry_reversedEntryId_idx" ON "CustomerLedgerEntry"("reversedEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerLedgerEntry_sourceType_sourceId_entryType_key" ON "CustomerLedgerEntry"("sourceType", "sourceId", "entryType");

-- CreateIndex
CREATE INDEX "SupplierLedgerEntry_supplierId_documentDate_idx" ON "SupplierLedgerEntry"("supplierId", "documentDate");

-- CreateIndex
CREATE INDEX "SupplierLedgerEntry_orderId_idx" ON "SupplierLedgerEntry"("orderId");

-- CreateIndex
CREATE INDEX "SupplierLedgerEntry_operationVoucherId_idx" ON "SupplierLedgerEntry"("operationVoucherId");

-- CreateIndex
CREATE INDEX "SupplierLedgerEntry_paymentId_idx" ON "SupplierLedgerEntry"("paymentId");

-- CreateIndex
CREATE INDEX "SupplierLedgerEntry_reversedEntryId_idx" ON "SupplierLedgerEntry"("reversedEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierLedgerEntry_sourceType_sourceId_entryType_key" ON "SupplierLedgerEntry"("sourceType", "sourceId", "entryType");

-- CreateIndex
CREATE INDEX "CodeSequence_scope_idx" ON "CodeSequence"("scope");

-- CreateIndex
CREATE UNIQUE INDEX "CodeSequence_scope_prefix_year_month_branch_key" ON "CodeSequence"("scope", "prefix", "year", "month", "branch");

-- CreateIndex
CREATE INDEX "FinanceCashflowEntry_orderId_idx" ON "FinanceCashflowEntry"("orderId");

-- CreateIndex
CREATE INDEX "FinanceCashflowEntry_supplierId_idx" ON "FinanceCashflowEntry"("supplierId");

-- CreateIndex
CREATE INDEX "FinanceCashflowEntry_customerId_idx" ON "FinanceCashflowEntry"("customerId");

-- CreateIndex
CREATE INDEX "FinanceInvoice_orderId_idx" ON "FinanceInvoice"("orderId");

-- CreateIndex
CREATE INDEX "FinanceInvoice_receiptId_idx" ON "FinanceInvoice"("receiptId");

-- CreateIndex
CREATE INDEX "FinanceInvoice_customerId_idx" ON "FinanceInvoice"("customerId");

-- CreateIndex
CREATE INDEX "FinanceInvoice_reversalOfId_idx" ON "FinanceInvoice"("reversalOfId");

-- CreateIndex
CREATE INDEX "FinancePayment_operationVoucherId_idx" ON "FinancePayment"("operationVoucherId");

-- CreateIndex
CREATE INDEX "FinancePayment_orderId_idx" ON "FinancePayment"("orderId");

-- CreateIndex
CREATE INDEX "FinancePayment_reversalOfId_idx" ON "FinancePayment"("reversalOfId");

-- CreateIndex
CREATE INDEX "FinanceReceipt_customerId_idx" ON "FinanceReceipt"("customerId");

-- CreateIndex
CREATE INDEX "FinanceReceipt_reversalOfId_idx" ON "FinanceReceipt"("reversalOfId");

-- CreateIndex
CREATE INDEX "Order_customerId_idx" ON "Order"("customerId");

-- AddForeignKey
ALTER TABLE "TourQuote" ADD CONSTRAINT "TourQuote_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceReceipt" ADD CONSTRAINT "FinanceReceipt_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceReceipt" ADD CONSTRAINT "FinanceReceipt_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "FinanceReceipt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceReceiptOrder" ADD CONSTRAINT "FinanceReceiptOrder_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancePayment" ADD CONSTRAINT "FinancePayment_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancePayment" ADD CONSTRAINT "FinancePayment_operationVoucherId_fkey" FOREIGN KEY ("operationVoucherId") REFERENCES "OperationVoucher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancePayment" ADD CONSTRAINT "FinancePayment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancePayment" ADD CONSTRAINT "FinancePayment_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "FinancePayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceInvoice" ADD CONSTRAINT "FinanceInvoice_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceInvoice" ADD CONSTRAINT "FinanceInvoice_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "FinanceReceipt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceInvoice" ADD CONSTRAINT "FinanceInvoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceInvoice" ADD CONSTRAINT "FinanceInvoice_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "FinanceInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCashflowEntry" ADD CONSTRAINT "FinanceCashflowEntry_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCashflowEntry" ADD CONSTRAINT "FinanceCashflowEntry_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCashflowEntry" ADD CONSTRAINT "FinanceCashflowEntry_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerLedgerEntry" ADD CONSTRAINT "CustomerLedgerEntry_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerLedgerEntry" ADD CONSTRAINT "CustomerLedgerEntry_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerLedgerEntry" ADD CONSTRAINT "CustomerLedgerEntry_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "FinanceReceipt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerLedgerEntry" ADD CONSTRAINT "CustomerLedgerEntry_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "FinanceInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerLedgerEntry" ADD CONSTRAINT "CustomerLedgerEntry_reversedEntryId_fkey" FOREIGN KEY ("reversedEntryId") REFERENCES "CustomerLedgerEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierLedgerEntry" ADD CONSTRAINT "SupplierLedgerEntry_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierLedgerEntry" ADD CONSTRAINT "SupplierLedgerEntry_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierLedgerEntry" ADD CONSTRAINT "SupplierLedgerEntry_operationVoucherId_fkey" FOREIGN KEY ("operationVoucherId") REFERENCES "OperationVoucher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierLedgerEntry" ADD CONSTRAINT "SupplierLedgerEntry_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "FinancePayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierLedgerEntry" ADD CONSTRAINT "SupplierLedgerEntry_reversedEntryId_fkey" FOREIGN KEY ("reversedEntryId") REFERENCES "SupplierLedgerEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Production safety constraints for accounting amounts.
ALTER TABLE "FinanceReceipt" ADD CONSTRAINT "FinanceReceipt_amounts_nonnegative_chk" CHECK ("totalAmount" >= 0 AND "paidBefore" >= 0 AND "receiptAmount" >= 0 AND "remainingAmount" >= 0);
ALTER TABLE "FinancePayment" ADD CONSTRAINT "FinancePayment_amounts_nonnegative_chk" CHECK ("totalAmount" >= 0 AND "paymentAmount" >= 0 AND "remainingAmount" >= 0);
ALTER TABLE "FinanceInvoice" ADD CONSTRAINT "FinanceInvoice_amounts_nonnegative_chk" CHECK ("totalBeforeTax" >= 0 AND "totalTax" >= 0 AND "totalAfterTax" >= 0);
ALTER TABLE "FinanceInvoiceItem" ADD CONSTRAINT "FinanceInvoiceItem_amounts_nonnegative_chk" CHECK ("quantity" >= 0 AND "unitPrice" >= 0 AND "amountBeforeTax" >= 0 AND "taxRate" >= 0 AND "taxAmount" >= 0 AND "amountAfterTax" >= 0);
ALTER TABLE "FinanceCashflowEntry" ADD CONSTRAINT "FinanceCashflowEntry_amount_nonnegative_chk" CHECK ("amount" >= 0);
ALTER TABLE "CustomerLedgerEntry" ADD CONSTRAINT "CustomerLedgerEntry_amounts_nonnegative_chk" CHECK ("debitAmount" >= 0 AND "creditAmount" >= 0 AND NOT ("debitAmount" > 0 AND "creditAmount" > 0));
ALTER TABLE "SupplierLedgerEntry" ADD CONSTRAINT "SupplierLedgerEntry_amounts_nonnegative_chk" CHECK ("debitAmount" >= 0 AND "creditAmount" >= 0 AND NOT ("debitAmount" > 0 AND "creditAmount" > 0));
ALTER TABLE "CodeSequence" ADD CONSTRAINT "CodeSequence_current_nonnegative_chk" CHECK ("currentNo" >= 0 AND "padding" >= 1);

-- PostgreSQL UNIQUE allows many NULLs; this expression index enforces real uniqueness for default monthly/global sequences.
CREATE UNIQUE INDEX "CodeSequence_scope_prefix_year_month_branch_expr_key" ON "CodeSequence"("scope", "prefix", "year", COALESCE("month", 0), COALESCE("branch", ''));

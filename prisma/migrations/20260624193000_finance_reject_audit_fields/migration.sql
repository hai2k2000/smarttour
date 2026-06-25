-- Add explicit reject audit fields for finance approval workflows.
ALTER TABLE "FinanceReceipt" ADD COLUMN IF NOT EXISTS "rejectedBy" TEXT;
ALTER TABLE "FinanceReceipt" ADD COLUMN IF NOT EXISTS "rejectedAt" TIMESTAMP(3);

ALTER TABLE "FinancePayment" ADD COLUMN IF NOT EXISTS "rejectedBy" TEXT;
ALTER TABLE "FinancePayment" ADD COLUMN IF NOT EXISTS "rejectedAt" TIMESTAMP(3);

ALTER TABLE "FinanceInvoice" ADD COLUMN IF NOT EXISTS "rejectedBy" TEXT;
ALTER TABLE "FinanceInvoice" ADD COLUMN IF NOT EXISTS "rejectedAt" TIMESTAMP(3);

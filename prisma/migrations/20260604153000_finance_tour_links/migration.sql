ALTER TABLE "FinanceReceipt" ADD COLUMN IF NOT EXISTS "tourId" TEXT;
ALTER TABLE "FinancePayment" ADD COLUMN IF NOT EXISTS "tourId" TEXT;
ALTER TABLE "FinanceInvoice" ADD COLUMN IF NOT EXISTS "tourId" TEXT;
ALTER TABLE "FinanceCashflowEntry" ADD COLUMN IF NOT EXISTS "tourId" TEXT;
ALTER TABLE "CustomerLedgerEntry" ADD COLUMN IF NOT EXISTS "tourId" TEXT;
ALTER TABLE "SupplierLedgerEntry" ADD COLUMN IF NOT EXISTS "tourId" TEXT;

UPDATE "FinanceReceipt" fr
SET "tourId" = t.id
FROM "FinanceReceiptOrder" fro
JOIN "Tour" t ON t."orderId" = fro."orderId" AND t."deletedAt" IS NULL
WHERE fro."receiptId" = fr.id
  AND fr."tourId" IS NULL;

UPDATE "FinancePayment" fp
SET "tourId" = t.id
FROM "Tour" t
WHERE fp."orderId" = t."orderId"
  AND t."deletedAt" IS NULL
  AND fp."tourId" IS NULL;

UPDATE "FinanceInvoice" fi
SET "tourId" = t.id
FROM "Tour" t
WHERE fi."orderId" = t."orderId"
  AND t."deletedAt" IS NULL
  AND fi."tourId" IS NULL;

UPDATE "FinanceInvoice" fi
SET "tourId" = fr."tourId"
FROM "FinanceReceipt" fr
WHERE fi."receiptId" = fr.id
  AND fi."tourId" IS NULL;

UPDATE "FinanceCashflowEntry" fce
SET "tourId" = t.id
FROM "Tour" t
WHERE fce."orderId" = t."orderId"
  AND t."deletedAt" IS NULL
  AND fce."tourId" IS NULL;

UPDATE "FinanceCashflowEntry" fce
SET "tourId" = fr."tourId"
FROM "FinanceReceipt" fr
WHERE fce."receiptId" = fr.id
  AND fce."tourId" IS NULL;

UPDATE "FinanceCashflowEntry" fce
SET "tourId" = fp."tourId"
FROM "FinancePayment" fp
WHERE fce."paymentId" = fp.id
  AND fce."tourId" IS NULL;

UPDATE "CustomerLedgerEntry" cle
SET "tourId" = t.id
FROM "Tour" t
WHERE cle."orderId" = t."orderId"
  AND t."deletedAt" IS NULL
  AND cle."tourId" IS NULL;

UPDATE "CustomerLedgerEntry" cle
SET "tourId" = fr."tourId"
FROM "FinanceReceipt" fr
WHERE cle."receiptId" = fr.id
  AND cle."tourId" IS NULL;

UPDATE "CustomerLedgerEntry" cle
SET "tourId" = fi."tourId"
FROM "FinanceInvoice" fi
WHERE cle."invoiceId" = fi.id
  AND cle."tourId" IS NULL;

UPDATE "SupplierLedgerEntry" sle
SET "tourId" = t.id
FROM "Tour" t
WHERE sle."orderId" = t."orderId"
  AND t."deletedAt" IS NULL
  AND sle."tourId" IS NULL;

UPDATE "SupplierLedgerEntry" sle
SET "tourId" = fp."tourId"
FROM "FinancePayment" fp
WHERE sle."paymentId" = fp.id
  AND sle."tourId" IS NULL;

CREATE INDEX IF NOT EXISTS "FinanceReceipt_tourId_idx" ON "FinanceReceipt"("tourId");
CREATE INDEX IF NOT EXISTS "FinancePayment_tourId_idx" ON "FinancePayment"("tourId");
CREATE INDEX IF NOT EXISTS "FinanceInvoice_tourId_idx" ON "FinanceInvoice"("tourId");
CREATE INDEX IF NOT EXISTS "FinanceCashflowEntry_tourId_idx" ON "FinanceCashflowEntry"("tourId");
CREATE INDEX IF NOT EXISTS "CustomerLedgerEntry_tourId_idx" ON "CustomerLedgerEntry"("tourId");
CREATE INDEX IF NOT EXISTS "SupplierLedgerEntry_tourId_idx" ON "SupplierLedgerEntry"("tourId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FinanceReceipt_tourId_fkey') THEN
    ALTER TABLE "FinanceReceipt" ADD CONSTRAINT "FinanceReceipt_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "Tour"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FinancePayment_tourId_fkey') THEN
    ALTER TABLE "FinancePayment" ADD CONSTRAINT "FinancePayment_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "Tour"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FinanceInvoice_tourId_fkey') THEN
    ALTER TABLE "FinanceInvoice" ADD CONSTRAINT "FinanceInvoice_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "Tour"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FinanceCashflowEntry_tourId_fkey') THEN
    ALTER TABLE "FinanceCashflowEntry" ADD CONSTRAINT "FinanceCashflowEntry_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "Tour"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustomerLedgerEntry_tourId_fkey') THEN
    ALTER TABLE "CustomerLedgerEntry" ADD CONSTRAINT "CustomerLedgerEntry_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "Tour"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SupplierLedgerEntry_tourId_fkey') THEN
    ALTER TABLE "SupplierLedgerEntry" ADD CONSTRAINT "SupplierLedgerEntry_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "Tour"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

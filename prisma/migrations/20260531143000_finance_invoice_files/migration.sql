CREATE TABLE "FinanceInvoiceFile" (
  "id" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "fileUrl" TEXT NOT NULL,
  "fileType" TEXT,
  "uploadedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FinanceInvoiceFile_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FinanceInvoiceFile_invoiceId_idx" ON "FinanceInvoiceFile"("invoiceId");

ALTER TABLE "FinanceInvoiceFile" ADD CONSTRAINT "FinanceInvoiceFile_invoiceId_fkey"
FOREIGN KEY ("invoiceId") REFERENCES "FinanceInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

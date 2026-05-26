-- CreateEnum
CREATE TYPE "QuotationProductType" AS ENUM ('FIT', 'GIT', 'LANDTOUR', 'COMBO', 'BOOKING', 'VISA', 'SERVICE');

-- CreateEnum
CREATE TYPE "QuotationStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'EXPIRED', 'CONVERTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Quotation" (
    "id" TEXT NOT NULL,
    "quoteCode" TEXT NOT NULL,
    "productType" "QuotationProductType" NOT NULL,
    "customerCode" TEXT,
    "customerName" TEXT,
    "customerPhone" TEXT,
    "customerEmail" TEXT,
    "salesOwner" TEXT,
    "operatorOwner" TEXT,
    "branch" TEXT,
    "department" TEXT,
    "marketGroup" TEXT,
    "productCategory" TEXT,
    "route" TEXT,
    "paxAdult" INTEGER NOT NULL DEFAULT 1,
    "paxChild" INTEGER NOT NULL DEFAULT 0,
    "paxInfant" INTEGER NOT NULL DEFAULT 0,
    "paxTotal" INTEGER NOT NULL DEFAULT 1,
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "exchangeRate" DECIMAL(65,30) NOT NULL DEFAULT 1,
    "createdDate" TIMESTAMP(3),
    "expiredDate" TIMESTAMP(3),
    "expectedPaymentDate" TIMESTAMP(3),
    "departureDate" TIMESTAMP(3),
    "returnDate" TIMESTAMP(3),
    "approvalLevel" INTEGER NOT NULL DEFAULT 0,
    "status" "QuotationStatus" NOT NULL DEFAULT 'DRAFT',
    "totalCost" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalMarkup" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalSelling" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "costPerPax" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "sellingPerPax" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "profitPerPax" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "marginRate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "adultPrice" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "childPrice" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "infantPrice" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "smartLinkToken" TEXT,
    "smartLinkEnabled" BOOLEAN NOT NULL DEFAULT false,
    "language" TEXT NOT NULL DEFAULT 'VI',
    "terms" TEXT,
    "note" TEXT,
    "convertedOrderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuotationItem" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "serviceType" TEXT NOT NULL,
    "supplierId" TEXT,
    "serviceId" TEXT,
    "supplierName" TEXT,
    "serviceName" TEXT NOT NULL,
    "unit" TEXT,
    "quantity" DECIMAL(65,30) NOT NULL DEFAULT 1,
    "paxCount" DECIMAL(65,30) NOT NULL DEFAULT 1,
    "nightCount" DECIMAL(65,30) NOT NULL DEFAULT 1,
    "netPrice" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "vat" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "markupAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "markupPercent" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "sellingPrice" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "QuotationItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuotationApprovalLog" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actor" TEXT,
    "note" TEXT,
    "oldStatus" TEXT,
    "newStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuotationApprovalLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Quotation_quoteCode_key" ON "Quotation"("quoteCode");

-- CreateIndex
CREATE UNIQUE INDEX "Quotation_smartLinkToken_key" ON "Quotation"("smartLinkToken");

-- CreateIndex
CREATE INDEX "Quotation_productType_status_idx" ON "Quotation"("productType", "status");

-- CreateIndex
CREATE INDEX "Quotation_expiredDate_idx" ON "Quotation"("expiredDate");

-- CreateIndex
CREATE INDEX "Quotation_salesOwner_idx" ON "Quotation"("salesOwner");

-- CreateIndex
CREATE INDEX "Quotation_branch_idx" ON "Quotation"("branch");

-- AddForeignKey
ALTER TABLE "QuotationItem" ADD CONSTRAINT "QuotationItem_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationItem" ADD CONSTRAINT "QuotationItem_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationItem" ADD CONSTRAINT "QuotationItem_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "SupplierService"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationApprovalLog" ADD CONSTRAINT "QuotationApprovalLog_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;


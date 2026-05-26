-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'CONVERTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "QuoteCostType" AS ENUM ('COMMON', 'HOTEL', 'PRIVATE');

-- CreateEnum
CREATE TYPE "QuoteComboStatus" AS ENUM ('DRAFT', 'QUOTED', 'ORDER_CREATED', 'CANCELLED');

-- CreateTable
CREATE TABLE "TourQuote" (
    "id" TEXT NOT NULL,
    "quoteCode" TEXT NOT NULL,
    "tourCode" TEXT NOT NULL,
    "tourName" TEXT,
    "route" TEXT,
    "marketGroup" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "exchangeRate" DECIMAL(65,30) NOT NULL DEFAULT 1,
    "bookingDate" TIMESTAMP(3),
    "paymentDate" TIMESTAMP(3),
    "departureDate" TIMESTAMP(3),
    "returnDate" TIMESTAMP(3),
    "customerName" TEXT,
    "customerPhone" TEXT,
    "customerEmail" TEXT,
    "customerAddress" TEXT,
    "customerNote" TEXT,
    "operatorOwner" TEXT,
    "collaborator" TEXT,
    "adultQty" INTEGER NOT NULL DEFAULT 1,
    "childQty" INTEGER NOT NULL DEFAULT 0,
    "infantQty" INTEGER NOT NULL DEFAULT 0,
    "totalPax" INTEGER NOT NULL DEFAULT 1,
    "commonCostTotal" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "privateCostTotal" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "netPrice" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "profit" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "commission" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "discount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "sellingPrice" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "childPricePercent" DECIMAL(65,30) NOT NULL DEFAULT 75,
    "childSellingPrice" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "infantPricePercent" DECIMAL(65,30) NOT NULL DEFAULT 20,
    "infantSellingPrice" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "profitRate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "status" "QuoteStatus" NOT NULL DEFAULT 'DRAFT',
    "approvedBy" TEXT,
    "approvalNote" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TourQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteCostItem" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "costType" "QuoteCostType" NOT NULL,
    "serviceType" TEXT,
    "description" TEXT,
    "unit" TEXT,
    "quantity" DECIMAL(65,30) NOT NULL DEFAULT 1,
    "serviceCount" DECIMAL(65,30) NOT NULL DEFAULT 1,
    "paxPerRoom" DECIMAL(65,30) NOT NULL DEFAULT 1,
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "exchangeRate" DECIMAL(65,30) NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "vat" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "QuoteCostItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteItinerary" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "dayNo" INTEGER NOT NULL,
    "title" TEXT,
    "content" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "QuoteItinerary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteCombo" (
    "id" TEXT NOT NULL,
    "comboCode" TEXT NOT NULL,
    "comboType" TEXT NOT NULL,
    "note" TEXT,
    "totalNetPricePerPax" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "profitPerPax" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "adultComboPrice" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "childPricePercent" DECIMAL(65,30) NOT NULL DEFAULT 75,
    "childComboPrice" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "status" "QuoteComboStatus" NOT NULL DEFAULT 'DRAFT',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuoteCombo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteComboItem" (
    "id" TEXT NOT NULL,
    "comboId" TEXT NOT NULL,
    "supplierId" TEXT,
    "serviceId" TEXT,
    "serviceName" TEXT NOT NULL,
    "checkIn" TIMESTAMP(3),
    "netPricePerService" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "nightCount" DECIMAL(65,30) NOT NULL DEFAULT 1,
    "paxCount" DECIMAL(65,30) NOT NULL DEFAULT 1,
    "netPricePerPax" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuoteComboItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TourQuote_quoteCode_key" ON "TourQuote"("quoteCode");

-- CreateIndex
CREATE INDEX "TourQuote_status_idx" ON "TourQuote"("status");

-- CreateIndex
CREATE INDEX "TourQuote_departureDate_idx" ON "TourQuote"("departureDate");

-- CreateIndex
CREATE UNIQUE INDEX "QuoteCombo_comboCode_key" ON "QuoteCombo"("comboCode");

-- CreateIndex
CREATE INDEX "QuoteCombo_status_idx" ON "QuoteCombo"("status");

-- AddForeignKey
ALTER TABLE "QuoteCostItem" ADD CONSTRAINT "QuoteCostItem_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "TourQuote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteItinerary" ADD CONSTRAINT "QuoteItinerary_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "TourQuote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteComboItem" ADD CONSTRAINT "QuoteComboItem_comboId_fkey" FOREIGN KEY ("comboId") REFERENCES "QuoteCombo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteComboItem" ADD CONSTRAINT "QuoteComboItem_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteComboItem" ADD CONSTRAINT "QuoteComboItem_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "SupplierService"("id") ON DELETE SET NULL ON UPDATE CASCADE;


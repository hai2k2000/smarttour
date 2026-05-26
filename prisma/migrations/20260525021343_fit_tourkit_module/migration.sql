-- CreateEnum
CREATE TYPE "FitTourWorkflowStatus" AS ENUM ('DRAFT', 'PRICING', 'TOUR_INFO', 'BUDGET', 'OPERATION', 'HANDOVER', 'SURVEY', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FitServiceStatus" AS ENUM ('WAITING', 'REQUESTED', 'CONFIRMED', 'OPERATING', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "FitTour" (
    "id" TEXT NOT NULL,
    "quoteCode" TEXT NOT NULL,
    "tourCode" TEXT NOT NULL,
    "tourName" TEXT,
    "marketGroup" TEXT,
    "bookingDate" TIMESTAMP(3),
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "customerName" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "adultCount" INTEGER NOT NULL DEFAULT 0,
    "childCount" INTEGER NOT NULL DEFAULT 0,
    "infantCount" INTEGER NOT NULL DEFAULT 0,
    "sellingPrice" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "commissionPerGuest" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "flightRoute" TEXT,
    "tourType" TEXT,
    "exchangeRateCode" TEXT,
    "exchangeRate" DECIMAL(65,30) NOT NULL DEFAULT 1,
    "operatorOwner" TEXT,
    "seatCount" INTEGER NOT NULL DEFAULT 0,
    "tourPrice" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "discount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "adultPrice" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "childPrice25" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "childPrice611" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "infantPrice" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "surcharge" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "transportMode" TEXT,
    "outboundRoute" TEXT,
    "outboundCarrier" TEXT,
    "returnRoute" TEXT,
    "returnCarrier" TEXT,
    "pickupPoint" TEXT,
    "dropoffPoint" TEXT,
    "visaDeadline" TIMESTAMP(3),
    "holdUntil" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "allowOverbooking" BOOLEAN NOT NULL DEFAULT false,
    "closeAt" TIMESTAMP(3),
    "handoverGuideRequest" TEXT,
    "surveyDescription" TEXT,
    "workflowStatus" "FitTourWorkflowStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FitTour_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FitCommonCost" (
    "id" TEXT NOT NULL,
    "fitTourId" TEXT NOT NULL,
    "orderNo" INTEGER NOT NULL DEFAULT 1,
    "serviceType" TEXT NOT NULL,
    "description" TEXT,
    "unit" TEXT,
    "quantity" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "times" DECIMAL(65,30) NOT NULL DEFAULT 1,
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "exchangeRate" DECIMAL(65,30) NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "vat" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "notes" TEXT,

    CONSTRAINT "FitCommonCost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FitHotelCost" (
    "id" TEXT NOT NULL,
    "fitTourId" TEXT NOT NULL,
    "orderNo" INTEGER NOT NULL DEFAULT 1,
    "serviceType" TEXT NOT NULL,
    "description" TEXT,
    "unit" TEXT,
    "paxPerRoom" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "times" DECIMAL(65,30) NOT NULL DEFAULT 1,
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "exchangeRate" DECIMAL(65,30) NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "vat" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "notes" TEXT,

    CONSTRAINT "FitHotelCost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FitPrivateCost" (
    "id" TEXT NOT NULL,
    "fitTourId" TEXT NOT NULL,
    "orderNo" INTEGER NOT NULL DEFAULT 1,
    "serviceType" TEXT NOT NULL,
    "description" TEXT,
    "unit" TEXT,
    "quantity" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "times" DECIMAL(65,30) NOT NULL DEFAULT 1,
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "exchangeRate" DECIMAL(65,30) NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "vat" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "notes" TEXT,

    CONSTRAINT "FitPrivateCost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FitBudgetService" (
    "id" TEXT NOT NULL,
    "fitTourId" TEXT NOT NULL,
    "serviceType" TEXT NOT NULL,
    "supplierId" TEXT,
    "description" TEXT,
    "quantity" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "unitPrice" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "vat" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "notes" TEXT,

    CONSTRAINT "FitBudgetService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FitOperationService" (
    "id" TEXT NOT NULL,
    "fitTourId" TEXT NOT NULL,
    "serviceType" TEXT NOT NULL,
    "supplierId" TEXT,
    "bookingCode" TEXT,
    "quantity" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "confirmedUnitPrice" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "vat" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "status" "FitServiceStatus" NOT NULL DEFAULT 'WAITING',
    "notes" TEXT,

    CONSTRAINT "FitOperationService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FitTourGuide" (
    "id" TEXT NOT NULL,
    "fitTourId" TEXT NOT NULL,
    "guideId" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "guideType" TEXT,
    "notes" TEXT,

    CONSTRAINT "FitTourGuide_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FitHandoverItem" (
    "id" TEXT NOT NULL,
    "fitTourId" TEXT NOT NULL,
    "orderNo" INTEGER NOT NULL DEFAULT 1,
    "itemName" TEXT NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "notes" TEXT,

    CONSTRAINT "FitHandoverItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FitSurveyQuestion" (
    "id" TEXT NOT NULL,
    "fitTourId" TEXT NOT NULL,
    "orderNo" INTEGER NOT NULL DEFAULT 1,
    "question" TEXT NOT NULL,
    "notes" TEXT,

    CONSTRAINT "FitSurveyQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FitAttachment" (
    "id" TEXT NOT NULL,
    "fitTourId" TEXT NOT NULL,
    "step" TEXT,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT,
    "mimeType" TEXT,
    "size" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FitAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FitTour_quoteCode_key" ON "FitTour"("quoteCode");

-- AddForeignKey
ALTER TABLE "FitCommonCost" ADD CONSTRAINT "FitCommonCost_fitTourId_fkey" FOREIGN KEY ("fitTourId") REFERENCES "FitTour"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FitHotelCost" ADD CONSTRAINT "FitHotelCost_fitTourId_fkey" FOREIGN KEY ("fitTourId") REFERENCES "FitTour"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FitPrivateCost" ADD CONSTRAINT "FitPrivateCost_fitTourId_fkey" FOREIGN KEY ("fitTourId") REFERENCES "FitTour"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FitBudgetService" ADD CONSTRAINT "FitBudgetService_fitTourId_fkey" FOREIGN KEY ("fitTourId") REFERENCES "FitTour"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FitBudgetService" ADD CONSTRAINT "FitBudgetService_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FitOperationService" ADD CONSTRAINT "FitOperationService_fitTourId_fkey" FOREIGN KEY ("fitTourId") REFERENCES "FitTour"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FitOperationService" ADD CONSTRAINT "FitOperationService_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FitTourGuide" ADD CONSTRAINT "FitTourGuide_fitTourId_fkey" FOREIGN KEY ("fitTourId") REFERENCES "FitTour"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FitHandoverItem" ADD CONSTRAINT "FitHandoverItem_fitTourId_fkey" FOREIGN KEY ("fitTourId") REFERENCES "FitTour"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FitSurveyQuestion" ADD CONSTRAINT "FitSurveyQuestion_fitTourId_fkey" FOREIGN KEY ("fitTourId") REFERENCES "FitTour"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FitAttachment" ADD CONSTRAINT "FitAttachment_fitTourId_fkey" FOREIGN KEY ("fitTourId") REFERENCES "FitTour"("id") ON DELETE CASCADE ON UPDATE CASCADE;

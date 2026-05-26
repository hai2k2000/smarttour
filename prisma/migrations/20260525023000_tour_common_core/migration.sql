-- CreateEnum
CREATE TYPE "TourType" AS ENUM ('FIT', 'GIT', 'LANDTOUR');

-- CreateEnum
CREATE TYPE "TourStatus" AS ENUM ('DRAFT', 'UPCOMING', 'RUNNING', 'COMPLETED', 'CANCELLED', 'SETTLED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'PARTIAL', 'PAID', 'REFUND');

-- CreateEnum
CREATE TYPE "TourServiceStatus" AS ENUM ('WAITING', 'REQUESTED', 'CONFIRMED', 'OPERATING', 'COMPLETED', 'CANCELLED');

-- AlterTable
ALTER TABLE "FitTour" ADD COLUMN     "tourId" TEXT;

-- CreateTable
CREATE TABLE "Tour" (
    "id" TEXT NOT NULL,
    "type" "TourType" NOT NULL,
    "status" "TourStatus" NOT NULL DEFAULT 'DRAFT',
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "workflowStep" TEXT,
    "systemCode" TEXT NOT NULL,
    "tourCode" TEXT NOT NULL,
    "name" TEXT,
    "marketGroup" TEXT,
    "productType" TEXT,
    "bookingDate" TIMESTAMP(3),
    "paymentDueDate" TIMESTAMP(3),
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "createdBy" TEXT,
    "operatorOwner" TEXT,
    "branch" TEXT,
    "department" TEXT,
    "customerSource" TEXT,
    "exchangeRateCode" TEXT,
    "exchangeRate" DECIMAL(65,30) NOT NULL DEFAULT 1,
    "route" TEXT,
    "flightRoute" TEXT,
    "pickupPoint" TEXT,
    "dropoffPoint" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tour_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TourCustomer" (
    "id" TEXT NOT NULL,
    "tourId" TEXT NOT NULL,
    "customerType" TEXT NOT NULL DEFAULT 'CUSTOMER',
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "passportNo" TEXT,
    "nationality" TEXT,
    "groupName" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TourCustomer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TourSupplier" (
    "id" TEXT NOT NULL,
    "tourId" TEXT NOT NULL,
    "supplierId" TEXT,
    "serviceType" TEXT NOT NULL,
    "role" TEXT,
    "status" "TourServiceStatus" NOT NULL DEFAULT 'WAITING',
    "notes" TEXT,

    CONSTRAINT "TourSupplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TourService" (
    "id" TEXT NOT NULL,
    "tourId" TEXT NOT NULL,
    "supplierId" TEXT,
    "serviceType" TEXT NOT NULL,
    "serviceDate" TIMESTAMP(3),
    "description" TEXT,
    "quantity" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "unit" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "exchangeRate" DECIMAL(65,30) NOT NULL DEFAULT 1,
    "salesUnitPrice" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "budgetUnitPrice" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "confirmedUnitPrice" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "vat" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "salesAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "budgetAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "confirmedAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "confirmationStatus" "TourServiceStatus" NOT NULL DEFAULT 'WAITING',
    "bookingCode" TEXT,
    "notes" TEXT,

    CONSTRAINT "TourService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TourRevenue" (
    "id" TEXT NOT NULL,
    "tourId" TEXT NOT NULL,
    "customerId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "unitPrice" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "exchangeRate" DECIMAL(65,30) NOT NULL DEFAULT 1,
    "vat" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "invoiceNo" TEXT,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "notes" TEXT,

    CONSTRAINT "TourRevenue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TourCost" (
    "id" TEXT NOT NULL,
    "tourId" TEXT NOT NULL,
    "serviceId" TEXT,
    "supplierId" TEXT,
    "costType" TEXT NOT NULL,
    "description" TEXT,
    "expectedAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "actualAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "exchangeRate" DECIMAL(65,30) NOT NULL DEFAULT 1,
    "vat" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "invoiceNo" TEXT,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "notes" TEXT,

    CONSTRAINT "TourCost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TourOperation" (
    "id" TEXT NOT NULL,
    "tourId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "assignee" TEXT,
    "dueDate" TIMESTAMP(3),
    "status" "OperationStatus" NOT NULL DEFAULT 'PENDING',
    "priority" TEXT,
    "notes" TEXT,

    CONSTRAINT "TourOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TourGuide" (
    "id" TEXT NOT NULL,
    "tourId" TEXT NOT NULL,
    "guideId" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "guideType" TEXT,
    "notes" TEXT,

    CONSTRAINT "TourGuide_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TourAttachment" (
    "id" TEXT NOT NULL,
    "tourId" TEXT NOT NULL,
    "step" TEXT,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT,
    "mimeType" TEXT,
    "size" INTEGER,
    "uploadedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TourAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TourNote" (
    "id" TEXT NOT NULL,
    "tourId" TEXT NOT NULL,
    "section" TEXT,
    "content" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TourNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TourTerm" (
    "id" TEXT NOT NULL,
    "tourId" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'VI',
    "termType" TEXT,
    "content" TEXT NOT NULL,

    CONSTRAINT "TourTerm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TourSurvey" (
    "id" TEXT NOT NULL,
    "tourId" TEXT NOT NULL,
    "orderNo" INTEGER NOT NULL DEFAULT 1,
    "question" TEXT NOT NULL,
    "notes" TEXT,

    CONSTRAINT "TourSurvey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TourPayment" (
    "id" TEXT NOT NULL,
    "tourId" TEXT NOT NULL,
    "costId" TEXT,
    "code" TEXT,
    "amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "paidAt" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "TourPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TourReceipt" (
    "id" TEXT NOT NULL,
    "tourId" TEXT NOT NULL,
    "customerId" TEXT,
    "revenueId" TEXT,
    "code" TEXT,
    "amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "receivedAt" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "TourReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TourExpense" (
    "id" TEXT NOT NULL,
    "tourId" TEXT NOT NULL,
    "costId" TEXT,
    "code" TEXT,
    "amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "spentAt" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "TourExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TourLog" (
    "id" TEXT NOT NULL,
    "tourId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT,
    "entityId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TourLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tour_systemCode_key" ON "Tour"("systemCode");

-- CreateIndex
CREATE INDEX "Tour_type_status_idx" ON "Tour"("type", "status");

-- CreateIndex
CREATE INDEX "Tour_startDate_idx" ON "Tour"("startDate");

-- CreateIndex
CREATE UNIQUE INDEX "FitTour_tourId_key" ON "FitTour"("tourId");

-- AddForeignKey
ALTER TABLE "TourCustomer" ADD CONSTRAINT "TourCustomer_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "Tour"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TourSupplier" ADD CONSTRAINT "TourSupplier_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "Tour"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TourSupplier" ADD CONSTRAINT "TourSupplier_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TourService" ADD CONSTRAINT "TourService_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "Tour"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TourService" ADD CONSTRAINT "TourService_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TourRevenue" ADD CONSTRAINT "TourRevenue_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "Tour"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TourRevenue" ADD CONSTRAINT "TourRevenue_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "TourCustomer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TourCost" ADD CONSTRAINT "TourCost_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "Tour"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TourCost" ADD CONSTRAINT "TourCost_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "TourService"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TourCost" ADD CONSTRAINT "TourCost_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TourOperation" ADD CONSTRAINT "TourOperation_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "Tour"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TourGuide" ADD CONSTRAINT "TourGuide_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "Tour"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TourAttachment" ADD CONSTRAINT "TourAttachment_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "Tour"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TourNote" ADD CONSTRAINT "TourNote_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "Tour"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TourTerm" ADD CONSTRAINT "TourTerm_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "Tour"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TourSurvey" ADD CONSTRAINT "TourSurvey_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "Tour"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TourPayment" ADD CONSTRAINT "TourPayment_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "Tour"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TourPayment" ADD CONSTRAINT "TourPayment_costId_fkey" FOREIGN KEY ("costId") REFERENCES "TourCost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TourReceipt" ADD CONSTRAINT "TourReceipt_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "Tour"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TourReceipt" ADD CONSTRAINT "TourReceipt_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "TourCustomer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TourReceipt" ADD CONSTRAINT "TourReceipt_revenueId_fkey" FOREIGN KEY ("revenueId") REFERENCES "TourRevenue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TourExpense" ADD CONSTRAINT "TourExpense_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "Tour"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TourExpense" ADD CONSTRAINT "TourExpense_costId_fkey" FOREIGN KEY ("costId") REFERENCES "TourCost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TourLog" ADD CONSTRAINT "TourLog_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "Tour"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FitTour" ADD CONSTRAINT "FitTour_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "Tour"("id") ON DELETE SET NULL ON UPDATE CASCADE;


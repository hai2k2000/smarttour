-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('FIT_TOUR', 'GIT_COMBO', 'LANDTOUR', 'SINGLE_SERVICE');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('DRAFT', 'UPCOMING', 'RUNNING', 'COMPLETED', 'CANCELLED', 'SETTLED');

-- CreateEnum
CREATE TYPE "OrderPaymentStatus" AS ENUM ('UNPAID', 'PARTIAL', 'PAID', 'REFUND');

-- CreateEnum
CREATE TYPE "OrderCostStatus" AS ENUM ('PENDING', 'PARTIAL', 'PAID', 'OVERDUE');

-- CreateEnum
CREATE TYPE "OrderServiceStatus" AS ENUM ('WAITING', 'REQUESTED', 'CONFIRMED', 'OPERATING', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "type" "OrderType" NOT NULL,
    "systemCode" TEXT NOT NULL,
    "tourCode" TEXT,
    "holdCode" TEXT,
    "name" TEXT NOT NULL,
    "route" TEXT,
    "marketGroup" TEXT,
    "bookingDate" TIMESTAMP(3),
    "paymentDate" TIMESTAMP(3),
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "status" "OrderStatus" NOT NULL DEFAULT 'UPCOMING',
    "paymentStatus" "OrderPaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "costStatus" "OrderCostStatus" NOT NULL DEFAULT 'PENDING',
    "tourCategory" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "exchangeRate" DECIMAL(65,30) NOT NULL DEFAULT 1,
    "createdBy" TEXT,
    "createdDate" TIMESTAMP(3),
    "accountCode" TEXT,
    "branch" TEXT,
    "department" TEXT,
    "customerName" TEXT,
    "customerType" TEXT,
    "customerPhone" TEXT,
    "customerEmail" TEXT,
    "customerAddress" TEXT,
    "agencyName" TEXT,
    "collaborator" TEXT,
    "operatorOwner" TEXT,
    "approver" TEXT,
    "adultQty" INTEGER NOT NULL DEFAULT 0,
    "childQty" INTEGER NOT NULL DEFAULT 0,
    "infantQty" INTEGER NOT NULL DEFAULT 0,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "roomClass" TEXT,
    "servicePackage" TEXT,
    "transportType" TEXT,
    "pickupPoint" TEXT,
    "dropoffPoint" TEXT,
    "visaDeadline" TEXT,
    "seatTotal" INTEGER NOT NULL DEFAULT 0,
    "seatHeld" INTEGER NOT NULL DEFAULT 0,
    "seatSold" INTEGER NOT NULL DEFAULT 0,
    "allowOverbooking" BOOLEAN NOT NULL DEFAULT false,
    "receiveDeadline" TIMESTAMP(3),
    "closeDeadline" TIMESTAMP(3),
    "totalRevenue" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "paidAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "remainingRevenue" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalCost" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "paidCost" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "remainingCost" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "profit" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "commission" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "commissionStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "handoverRequest" TEXT,
    "surveyDescription" TEXT,
    "settledAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderGuide" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "guideId" TEXT,
    "guideName" TEXT,
    "phone" TEXT,
    "language" TEXT,
    "note" TEXT,

    CONSTRAINT "OrderGuide_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderSalesItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "serviceType" TEXT,
    "supplierId" TEXT,
    "serviceId" TEXT,
    "description" TEXT,
    "quantity" DECIMAL(65,30) NOT NULL DEFAULT 1,
    "serviceCount" DECIMAL(65,30) NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "vat" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OrderSalesItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderOperationItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "serviceType" TEXT,
    "supplierId" TEXT,
    "serviceId" TEXT,
    "bookingCode" TEXT,
    "serviceDate" TIMESTAMP(3),
    "quantity" DECIMAL(65,30) NOT NULL DEFAULT 1,
    "netPrice" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "vat" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "status" "OrderServiceStatus" NOT NULL DEFAULT 'WAITING',
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OrderOperationItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderMember" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "gender" TEXT,
    "birthday" TIMESTAMP(3),
    "phone" TEXT,
    "email" TEXT,
    "identityNumber" TEXT,
    "issuedDate" TIMESTAMP(3),
    "nationality" TEXT,
    "passengerType" TEXT,
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OrderMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItinerary" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "dayNo" INTEGER NOT NULL,
    "title" TEXT,
    "content" TEXT,
    "period" TEXT,
    "destination" TEXT,
    "meals" TEXT,
    "hotel" TEXT,
    "restaurant" TEXT,
    "services" TEXT,
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OrderItinerary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderHandoverItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OrderHandoverItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderSurveyQuestion" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OrderSurveyQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderTerm" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'VN',
    "terms" TEXT,
    "notes" TEXT,

    CONSTRAINT "OrderTerm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderFile" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileType" TEXT,
    "uploadedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderLog" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "oldValue" JSONB,
    "newValue" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Order_systemCode_key" ON "Order"("systemCode");

-- CreateIndex
CREATE INDEX "Order_type_status_idx" ON "Order"("type", "status");

-- CreateIndex
CREATE INDEX "Order_startDate_idx" ON "Order"("startDate");

-- CreateIndex
CREATE INDEX "Order_customerPhone_idx" ON "Order"("customerPhone");

-- AddForeignKey
ALTER TABLE "OrderGuide" ADD CONSTRAINT "OrderGuide_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderSalesItem" ADD CONSTRAINT "OrderSalesItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderSalesItem" ADD CONSTRAINT "OrderSalesItem_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderSalesItem" ADD CONSTRAINT "OrderSalesItem_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "SupplierService"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderOperationItem" ADD CONSTRAINT "OrderOperationItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderOperationItem" ADD CONSTRAINT "OrderOperationItem_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderOperationItem" ADD CONSTRAINT "OrderOperationItem_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "SupplierService"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderMember" ADD CONSTRAINT "OrderMember_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItinerary" ADD CONSTRAINT "OrderItinerary_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderHandoverItem" ADD CONSTRAINT "OrderHandoverItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderSurveyQuestion" ADD CONSTRAINT "OrderSurveyQuestion_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderTerm" ADD CONSTRAINT "OrderTerm_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderFile" ADD CONSTRAINT "OrderFile_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLog" ADD CONSTRAINT "OrderLog_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;


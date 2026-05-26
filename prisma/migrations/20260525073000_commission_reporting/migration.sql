CREATE TYPE "CommissionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'REVOKED');
CREATE TYPE "CommissionPaymentStatus" AS ENUM ('UNPAID', 'PARTIAL', 'PAID');

CREATE TABLE "CommissionRule" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "productType" "OrderType",
  "basis" TEXT NOT NULL DEFAULT 'REVENUE',
  "milestoneType" TEXT NOT NULL DEFAULT 'CHECK_IN',
  "ratePercent" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "minRevenue" DECIMAL(65,30),
  "maxRevenue" DECIMAL(65,30),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CommissionRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CommissionEntry" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "orderCode" TEXT NOT NULL,
  "orderType" "OrderType" NOT NULL,
  "tourCode" TEXT,
  "customerName" TEXT,
  "salesOwner" TEXT,
  "team" TEXT,
  "department" TEXT,
  "branch" TEXT,
  "marketGroup" TEXT,
  "milestoneType" TEXT NOT NULL DEFAULT 'CHECK_IN',
  "milestoneDate" TIMESTAMP(3),
  "revenue" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "profit" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "basis" TEXT NOT NULL DEFAULT 'REVENUE',
  "ratePercent" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "commissionAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "status" "CommissionStatus" NOT NULL DEFAULT 'PENDING',
  "paymentStatus" "CommissionPaymentStatus" NOT NULL DEFAULT 'UNPAID',
  "approvedBy" TEXT,
  "approvedAt" TIMESTAMP(3),
  "rejectedBy" TEXT,
  "rejectedAt" TIMESTAMP(3),
  "paidAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "remainingAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "paymentVoucherNo" TEXT,
  "paidAt" TIMESTAMP(3),
  "receiver" TEXT,
  "formula" TEXT,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CommissionEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CommissionLog" (
  "id" TEXT NOT NULL,
  "commissionId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "actor" TEXT,
  "note" TEXT,
  "oldStatus" TEXT,
  "newStatus" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommissionLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CommissionPayment" (
  "id" TEXT NOT NULL,
  "commissionId" TEXT NOT NULL,
  "voucherNo" TEXT,
  "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "receiver" TEXT,
  "amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "note" TEXT,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommissionPayment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CommissionEntry_orderId_key" ON "CommissionEntry"("orderId");
CREATE INDEX "CommissionRule_productType_isActive_idx" ON "CommissionRule"("productType", "isActive");
CREATE INDEX "CommissionEntry_status_idx" ON "CommissionEntry"("status");
CREATE INDEX "CommissionEntry_paymentStatus_idx" ON "CommissionEntry"("paymentStatus");
CREATE INDEX "CommissionEntry_salesOwner_idx" ON "CommissionEntry"("salesOwner");
CREATE INDEX "CommissionEntry_department_idx" ON "CommissionEntry"("department");
CREATE INDEX "CommissionEntry_branch_idx" ON "CommissionEntry"("branch");
CREATE INDEX "CommissionEntry_marketGroup_idx" ON "CommissionEntry"("marketGroup");
CREATE INDEX "CommissionEntry_milestoneDate_idx" ON "CommissionEntry"("milestoneDate");
CREATE INDEX "CommissionLog_commissionId_idx" ON "CommissionLog"("commissionId");
CREATE INDEX "CommissionPayment_commissionId_idx" ON "CommissionPayment"("commissionId");

ALTER TABLE "CommissionEntry" ADD CONSTRAINT "CommissionEntry_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommissionLog" ADD CONSTRAINT "CommissionLog_commissionId_fkey" FOREIGN KEY ("commissionId") REFERENCES "CommissionEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommissionPayment" ADD CONSTRAINT "CommissionPayment_commissionId_fkey" FOREIGN KEY ("commissionId") REFERENCES "CommissionEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "CommissionRule" ("id", "name", "productType", "basis", "milestoneType", "ratePercent", "updatedAt") VALUES
  (gen_random_uuid()::text, 'FIT default', 'FIT_TOUR', 'REVENUE', 'CHECK_IN', 5, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'GIT default', 'GIT_COMBO', 'REVENUE', 'CHECK_IN', 4, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'LandTour default', 'LANDTOUR', 'REVENUE', 'CHECK_IN', 4, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Booking phong default', 'HOTEL_BOOKING', 'REVENUE', 'CHECK_IN', 3, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Ve may bay default', 'FLIGHT_ORDER', 'PROFIT', 'CHECK_IN', 2, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Dich vu le default', 'SINGLE_SERVICE', 'REVENUE', 'CHECK_IN', 5, CURRENT_TIMESTAMP);

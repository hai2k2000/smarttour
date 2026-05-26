-- Link booking, tour, supplier inventory, operation vouchers and finance payments.
-- Nullable columns preserve current production data; NOT VALID keeps legacy loose IDs from blocking deploy.

-- AlterTable
ALTER TABLE "Booking"
ADD COLUMN "customerId" TEXT,
ADD COLUMN "orderId" TEXT,
ADD COLUMN "tourId" TEXT,
ADD COLUMN "customerPhone" TEXT,
ADD COLUMN "customerEmail" TEXT;

-- AlterTable
ALTER TABLE "Tour"
ADD COLUMN "orderId" TEXT;

-- AlterTable
ALTER TABLE "TourCustomer"
ADD COLUMN "crmCustomerId" TEXT;

-- AlterTable
ALTER TABLE "TourService"
ADD COLUMN "supplierServiceId" TEXT;

-- AlterTable
ALTER TABLE "OperationService"
ADD COLUMN "supplierServiceId" TEXT;

-- AlterTable
ALTER TABLE "OperationVoucher"
ADD COLUMN "orderId" TEXT;

-- AlterTable
ALTER TABLE "Supplier"
ADD COLUMN "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "SupplierService"
ADD COLUMN "deletedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "SupplierAllotmentAllocation" (
    "id" TEXT NOT NULL,
    "allotmentId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "serviceId" TEXT,
    "orderId" TEXT,
    "bookingId" TEXT,
    "tourId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'LOCKED',
    "lockedAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierAllotmentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Booking_customerId_idx" ON "Booking"("customerId");
CREATE INDEX "Booking_orderId_idx" ON "Booking"("orderId");
CREATE INDEX "Booking_tourId_idx" ON "Booking"("tourId");
CREATE INDEX "Tour_orderId_idx" ON "Tour"("orderId");
CREATE INDEX "TourCustomer_crmCustomerId_idx" ON "TourCustomer"("crmCustomerId");
CREATE INDEX "TourService_supplierServiceId_idx" ON "TourService"("supplierServiceId");
CREATE INDEX "OperationService_supplierServiceId_idx" ON "OperationService"("supplierServiceId");
CREATE INDEX "OperationVoucher_bookingId_idx" ON "OperationVoucher"("bookingId");
CREATE INDEX "OperationVoucher_orderId_idx" ON "OperationVoucher"("orderId");
CREATE INDEX "OperationVoucherPayment_paymentVoucherId_idx" ON "OperationVoucherPayment"("paymentVoucherId");
CREATE INDEX "Supplier_deletedAt_idx" ON "Supplier"("deletedAt");
CREATE INDEX "SupplierService_deletedAt_idx" ON "SupplierService"("deletedAt");
CREATE INDEX "SupplierAllotmentAllocation_allotmentId_status_idx" ON "SupplierAllotmentAllocation"("allotmentId", "status");
CREATE INDEX "SupplierAllotmentAllocation_supplierId_idx" ON "SupplierAllotmentAllocation"("supplierId");
CREATE INDEX "SupplierAllotmentAllocation_serviceId_idx" ON "SupplierAllotmentAllocation"("serviceId");
CREATE INDEX "SupplierAllotmentAllocation_orderId_idx" ON "SupplierAllotmentAllocation"("orderId");
CREATE INDEX "SupplierAllotmentAllocation_bookingId_idx" ON "SupplierAllotmentAllocation"("bookingId");
CREATE INDEX "SupplierAllotmentAllocation_tourId_idx" ON "SupplierAllotmentAllocation"("tourId");

-- Keep service SKUs unique per supplier when a SKU is present.
CREATE UNIQUE INDEX "SupplierService_supplierId_sku_unique_not_null" ON "SupplierService"("supplierId", "sku") WHERE "sku" IS NOT NULL;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "Tour"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Tour" ADD CONSTRAINT "Tour_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TourCustomer" ADD CONSTRAINT "TourCustomer_crmCustomerId_fkey" FOREIGN KEY ("crmCustomerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TourService" ADD CONSTRAINT "TourService_supplierServiceId_fkey" FOREIGN KEY ("supplierServiceId") REFERENCES "SupplierService"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OperationService" ADD CONSTRAINT "OperationService_supplierServiceId_fkey" FOREIGN KEY ("supplierServiceId") REFERENCES "SupplierService"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OperationVoucher" ADD CONSTRAINT "OperationVoucher_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
ALTER TABLE "OperationVoucher" ADD CONSTRAINT "OperationVoucher_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OperationVoucherPayment" ADD CONSTRAINT "OperationVoucherPayment_paymentVoucherId_fkey" FOREIGN KEY ("paymentVoucherId") REFERENCES "FinancePayment"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
ALTER TABLE "SupplierAllotmentAllocation" ADD CONSTRAINT "SupplierAllotmentAllocation_allotmentId_fkey" FOREIGN KEY ("allotmentId") REFERENCES "SupplierAllotment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplierAllotmentAllocation" ADD CONSTRAINT "SupplierAllotmentAllocation_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplierAllotmentAllocation" ADD CONSTRAINT "SupplierAllotmentAllocation_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "SupplierService"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupplierAllotmentAllocation" ADD CONSTRAINT "SupplierAllotmentAllocation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupplierAllotmentAllocation" ADD CONSTRAINT "SupplierAllotmentAllocation_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupplierAllotmentAllocation" ADD CONSTRAINT "SupplierAllotmentAllocation_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "Tour"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Guardrails for long-term real data.
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_pax_total_non_negative_chk" CHECK ("paxCount" >= 0 AND "totalSellPrice" >= 0) NOT VALID;
ALTER TABLE "Order" ADD CONSTRAINT "Order_amounts_non_negative_chk" CHECK ("adultQty" >= 0 AND "childQty" >= 0 AND "infantQty" >= 0 AND "quantity" >= 0 AND "totalRevenue" >= 0 AND "paidAmount" >= 0 AND "remainingRevenue" >= 0 AND "totalCost" >= 0 AND "paidCost" >= 0 AND "remainingCost" >= 0) NOT VALID;
ALTER TABLE "SupplierService" ADD CONSTRAINT "SupplierService_amounts_non_negative_chk" CHECK ("quantity" >= 0 AND "accountingPrice" >= 0 AND "netPrice" >= 0 AND "sellingPrice" >= 0) NOT VALID;
ALTER TABLE "SupplierAllotment" ADD CONSTRAINT "SupplierAllotment_quantities_non_negative_chk" CHECK ("allotmentQty" >= 0 AND "bookedQty" >= 0 AND "lockedQty" >= 0 AND "quantityLock" >= 0 AND "cutoffDays" >= 0 AND "netCostPerDay" >= 0 AND "sellingPricePerDay" >= 0) NOT VALID;
ALTER TABLE "SupplierAllotmentAllocation" ADD CONSTRAINT "SupplierAllotmentAllocation_quantity_positive_chk" CHECK ("quantity" > 0) NOT VALID;
ALTER TABLE "TourService" ADD CONSTRAINT "TourService_amounts_non_negative_chk" CHECK ("quantity" >= 0 AND "exchangeRate" >= 0 AND "salesUnitPrice" >= 0 AND "budgetUnitPrice" >= 0 AND "confirmedUnitPrice" >= 0 AND "salesAmount" >= 0 AND "budgetAmount" >= 0 AND "confirmedAmount" >= 0) NOT VALID;
ALTER TABLE "OperationService" ADD CONSTRAINT "OperationService_amounts_non_negative_chk" CHECK ("expectedCost" >= 0 AND "actualCost" >= 0) NOT VALID;
ALTER TABLE "OperationVoucher" ADD CONSTRAINT "OperationVoucher_amounts_non_negative_chk" CHECK ("totalAmount" >= 0 AND "paidAmount" >= 0 AND "remainAmount" >= 0) NOT VALID;
ALTER TABLE "OperationVoucherDetail" ADD CONSTRAINT "OperationVoucherDetail_amounts_non_negative_chk" CHECK ("quantity" >= 0 AND "netPrice" >= 0 AND "amount" >= 0) NOT VALID;
ALTER TABLE "OperationVoucherPayment" ADD CONSTRAINT "OperationVoucherPayment_amount_non_negative_chk" CHECK ("paidAmount" >= 0) NOT VALID;

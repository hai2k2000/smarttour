-- Validate legacy constraints that were introduced as NOT VALID during the core booking/operation rollout.
-- Nullable FK cleanups follow each constraint's ON DELETE SET NULL semantics. Numeric guardrails fail fast
-- with a named blocker instead of silently rewriting financial or inventory amounts.

UPDATE "OperationVoucher" ov
SET "bookingId" = NULL
WHERE ov."bookingId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "Booking" b WHERE b.id = ov."bookingId");

UPDATE "OperationVoucherPayment" ovp
SET "paymentVoucherId" = NULL
WHERE ovp."paymentVoucherId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "FinancePayment" fp WHERE fp.id = ovp."paymentVoucherId");

UPDATE "GuideSchedule" gs
SET "tourId" = NULL
WHERE gs."tourId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "Tour" t WHERE t.id = gs."tourId");

UPDATE "GuideSchedule" gs
SET "orderId" = NULL
WHERE gs."orderId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "Order" o WHERE o.id = gs."orderId");

DO $$
DECLARE
  violation_count bigint;
BEGIN
  SELECT count(*) INTO violation_count FROM "Booking" WHERE "paxCount" < 0 OR "totalSellPrice" < 0;
  IF violation_count > 0 THEN RAISE EXCEPTION 'Booking_pax_total_non_negative_chk has % violating rows', violation_count; END IF;

  SELECT count(*) INTO violation_count FROM "Order" WHERE "adultQty" < 0 OR "childQty" < 0 OR "infantQty" < 0 OR "quantity" < 0 OR "totalRevenue" < 0 OR "paidAmount" < 0 OR "remainingRevenue" < 0 OR "totalCost" < 0 OR "paidCost" < 0 OR "remainingCost" < 0;
  IF violation_count > 0 THEN RAISE EXCEPTION 'Order_amounts_non_negative_chk has % violating rows', violation_count; END IF;

  SELECT count(*) INTO violation_count FROM "SupplierService" WHERE "quantity" < 0 OR "accountingPrice" < 0 OR "netPrice" < 0 OR "sellingPrice" < 0;
  IF violation_count > 0 THEN RAISE EXCEPTION 'SupplierService_amounts_non_negative_chk has % violating rows', violation_count; END IF;

  SELECT count(*) INTO violation_count FROM "SupplierAllotment" WHERE "allotmentQty" < 0 OR "bookedQty" < 0 OR "lockedQty" < 0 OR "quantityLock" < 0 OR "cutoffDays" < 0 OR "netCostPerDay" < 0 OR "sellingPricePerDay" < 0;
  IF violation_count > 0 THEN RAISE EXCEPTION 'SupplierAllotment_quantities_non_negative_chk has % violating rows', violation_count; END IF;

  SELECT count(*) INTO violation_count FROM "SupplierAllotmentAllocation" WHERE "quantity" <= 0;
  IF violation_count > 0 THEN RAISE EXCEPTION 'SupplierAllotmentAllocation_quantity_positive_chk has % violating rows', violation_count; END IF;

  SELECT count(*) INTO violation_count FROM "TourService" WHERE "quantity" < 0 OR "exchangeRate" < 0 OR "salesUnitPrice" < 0 OR "budgetUnitPrice" < 0 OR "confirmedUnitPrice" < 0 OR "salesAmount" < 0 OR "budgetAmount" < 0 OR "confirmedAmount" < 0;
  IF violation_count > 0 THEN RAISE EXCEPTION 'TourService_amounts_non_negative_chk has % violating rows', violation_count; END IF;

  SELECT count(*) INTO violation_count FROM "OperationService" WHERE "expectedCost" < 0 OR "actualCost" < 0;
  IF violation_count > 0 THEN RAISE EXCEPTION 'OperationService_amounts_non_negative_chk has % violating rows', violation_count; END IF;

  SELECT count(*) INTO violation_count FROM "OperationVoucher" WHERE "totalAmount" < 0 OR "paidAmount" < 0 OR "remainAmount" < 0;
  IF violation_count > 0 THEN RAISE EXCEPTION 'OperationVoucher_amounts_non_negative_chk has % violating rows', violation_count; END IF;

  SELECT count(*) INTO violation_count FROM "OperationVoucherDetail" WHERE "quantity" < 0 OR "netPrice" < 0 OR "amount" < 0;
  IF violation_count > 0 THEN RAISE EXCEPTION 'OperationVoucherDetail_amounts_non_negative_chk has % violating rows', violation_count; END IF;

  SELECT count(*) INTO violation_count FROM "OperationVoucherPayment" WHERE "paidAmount" < 0;
  IF violation_count > 0 THEN RAISE EXCEPTION 'OperationVoucherPayment_amount_non_negative_chk has % violating rows', violation_count; END IF;
END $$;

ALTER TABLE "OperationVoucher" VALIDATE CONSTRAINT "OperationVoucher_bookingId_fkey";
ALTER TABLE "OperationVoucherPayment" VALIDATE CONSTRAINT "OperationVoucherPayment_paymentVoucherId_fkey";
ALTER TABLE "GuideSchedule" VALIDATE CONSTRAINT "GuideSchedule_tourId_fkey";
ALTER TABLE "GuideSchedule" VALIDATE CONSTRAINT "GuideSchedule_orderId_fkey";

ALTER TABLE "Booking" VALIDATE CONSTRAINT "Booking_pax_total_non_negative_chk";
ALTER TABLE "Order" VALIDATE CONSTRAINT "Order_amounts_non_negative_chk";
ALTER TABLE "SupplierService" VALIDATE CONSTRAINT "SupplierService_amounts_non_negative_chk";
ALTER TABLE "SupplierAllotment" VALIDATE CONSTRAINT "SupplierAllotment_quantities_non_negative_chk";
ALTER TABLE "SupplierAllotmentAllocation" VALIDATE CONSTRAINT "SupplierAllotmentAllocation_quantity_positive_chk";
ALTER TABLE "TourService" VALIDATE CONSTRAINT "TourService_amounts_non_negative_chk";
ALTER TABLE "OperationService" VALIDATE CONSTRAINT "OperationService_amounts_non_negative_chk";
ALTER TABLE "OperationVoucher" VALIDATE CONSTRAINT "OperationVoucher_amounts_non_negative_chk";
ALTER TABLE "OperationVoucherDetail" VALIDATE CONSTRAINT "OperationVoucherDetail_amounts_non_negative_chk";
ALTER TABLE "OperationVoucherPayment" VALIDATE CONSTRAINT "OperationVoucherPayment_amount_non_negative_chk";
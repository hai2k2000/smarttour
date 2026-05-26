-- Trace automatic allotment locks back to the exact order operation item row.

ALTER TABLE "SupplierAllotmentAllocation"
ADD COLUMN "orderOperationItemId" TEXT;

CREATE INDEX "SupplierAllotmentAllocation_orderOperationItemId_idx"
ON "SupplierAllotmentAllocation"("orderOperationItemId");

ALTER TABLE "SupplierAllotmentAllocation"
ADD CONSTRAINT "SupplierAllotmentAllocation_orderOperationItemId_fkey"
FOREIGN KEY ("orderOperationItemId") REFERENCES "OrderOperationItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "SupplierAllotment" ADD COLUMN     "allotmentQty" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "bookedQty" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lockedQty" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'ACTIVE';

-- CreateTable
CREATE TABLE "SupplierAllotmentLog" (
    "id" TEXT NOT NULL,
    "allotmentId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "oldValue" JSONB,
    "newValue" JSONB,
    "note" TEXT,
    "actor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierAllotmentLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupplierAllotmentLog_allotmentId_idx" ON "SupplierAllotmentLog"("allotmentId");

-- CreateIndex
CREATE INDEX "SupplierAllotmentLog_supplierId_idx" ON "SupplierAllotmentLog"("supplierId");

-- CreateIndex
CREATE INDEX "SupplierAllotment_status_idx" ON "SupplierAllotment"("status");

-- CreateIndex
CREATE INDEX "SupplierAllotment_startDate_endDate_idx" ON "SupplierAllotment"("startDate", "endDate");

-- AddForeignKey
ALTER TABLE "SupplierAllotmentLog" ADD CONSTRAINT "SupplierAllotmentLog_allotmentId_fkey" FOREIGN KEY ("allotmentId") REFERENCES "SupplierAllotment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierAllotmentLog" ADD CONSTRAINT "SupplierAllotmentLog_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;


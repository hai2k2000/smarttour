-- CreateEnum
CREATE TYPE "SupplierStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "SupplierDayType" AS ENUM ('ALL_DAYS', 'WEEKDAY', 'WEEKEND', 'HOLIDAY', 'PEAK');

-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN     "country" TEXT,
ADD COLUMN     "createdBy" TEXT,
ADD COLUMN     "province" TEXT,
ADD COLUMN     "status" "SupplierStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "supplierCode" TEXT,
ADD COLUMN     "taxCode" TEXT,
ADD COLUMN     "website" TEXT;

-- CreateTable
CREATE TABLE "HotelSupplier" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "builtYear" INTEGER,
    "rating" INTEGER,
    "classHotel" TEXT NOT NULL,
    "hotelProject" TEXT NOT NULL,
    "bankAccountName" TEXT,
    "bankAccountNumber" TEXT,
    "bankName" TEXT,
    "market" TEXT,
    "link" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotelSupplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierContact" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "position" TEXT,
    "birthday" TIMESTAMP(3),
    "phone" TEXT,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierService" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "sku" TEXT,
    "serviceName" TEXT NOT NULL,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "dayType" "SupplierDayType" NOT NULL DEFAULT 'ALL_DAYS',
    "accountingPrice" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "netPrice" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "sellingPrice" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "description" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierAllotment" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "serviceId" TEXT,
    "sku" TEXT,
    "serviceName" TEXT NOT NULL,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "dayType" "SupplierDayType" NOT NULL DEFAULT 'ALL_DAYS',
    "quantityLock" INTEGER NOT NULL DEFAULT 0,
    "cutoffDays" INTEGER NOT NULL DEFAULT 0,
    "netCostPerDay" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "sellingPricePerDay" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "description" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierAllotment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierFile" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileType" TEXT,
    "uploadedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HotelSupplier_supplierId_key" ON "HotelSupplier"("supplierId");

-- CreateIndex
CREATE INDEX "HotelSupplier_classHotel_idx" ON "HotelSupplier"("classHotel");

-- CreateIndex
CREATE INDEX "HotelSupplier_hotelProject_idx" ON "HotelSupplier"("hotelProject");

-- CreateIndex
CREATE INDEX "HotelSupplier_market_idx" ON "HotelSupplier"("market");

-- CreateIndex
CREATE INDEX "SupplierService_supplierId_sku_idx" ON "SupplierService"("supplierId", "sku");

-- CreateIndex
CREATE INDEX "SupplierAllotment_supplierId_sku_idx" ON "SupplierAllotment"("supplierId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_supplierCode_key" ON "Supplier"("supplierCode");

-- CreateIndex
CREATE INDEX "Supplier_status_idx" ON "Supplier"("status");

-- CreateIndex
CREATE INDEX "Supplier_province_idx" ON "Supplier"("province");

-- AddForeignKey
ALTER TABLE "HotelSupplier" ADD CONSTRAINT "HotelSupplier_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierContact" ADD CONSTRAINT "SupplierContact_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierService" ADD CONSTRAINT "SupplierService_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierAllotment" ADD CONSTRAINT "SupplierAllotment_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierAllotment" ADD CONSTRAINT "SupplierAllotment_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "SupplierService"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierFile" ADD CONSTRAINT "SupplierFile_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- CreateEnum
CREATE TYPE "OperationVoucherStatus" AS ENUM ('PENDING', 'PARTIAL', 'PAID');

-- AlterEnum
ALTER TYPE "OrderType" ADD VALUE 'FLIGHT_ORDER';

-- CreateTable
CREATE TABLE "OperationVoucher" (
    "id" TEXT NOT NULL,
    "voucherCode" TEXT NOT NULL,
    "tourId" TEXT,
    "bookingId" TEXT,
    "supplierId" TEXT,
    "supplierName" TEXT,
    "serviceType" TEXT NOT NULL,
    "serviceName" TEXT NOT NULL,
    "serviceDate" TIMESTAMP(3) NOT NULL,
    "totalAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "paidAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "remainAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "paymentDeadline" TIMESTAMP(3),
    "status" "OperationVoucherStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "createdBy" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperationVoucher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationVoucherDetail" (
    "id" TEXT NOT NULL,
    "voucherId" TEXT NOT NULL,
    "sku" TEXT,
    "serviceName" TEXT NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL DEFAULT 1,
    "unit" TEXT,
    "netPrice" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "vat" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperationVoucherDetail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationVoucherPayment" (
    "id" TEXT NOT NULL,
    "voucherId" TEXT NOT NULL,
    "paymentVoucherId" TEXT,
    "paidAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "paymentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperationVoucherPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OperationVoucher_voucherCode_key" ON "OperationVoucher"("voucherCode");

-- CreateIndex
CREATE INDEX "OperationVoucher_status_idx" ON "OperationVoucher"("status");

-- CreateIndex
CREATE INDEX "OperationVoucher_serviceDate_idx" ON "OperationVoucher"("serviceDate");

-- CreateIndex
CREATE INDEX "OperationVoucher_paymentDeadline_idx" ON "OperationVoucher"("paymentDeadline");

-- CreateIndex
CREATE INDEX "OperationVoucher_supplierId_idx" ON "OperationVoucher"("supplierId");

-- AddForeignKey
ALTER TABLE "OperationVoucher" ADD CONSTRAINT "OperationVoucher_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "Tour"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationVoucher" ADD CONSTRAINT "OperationVoucher_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationVoucherDetail" ADD CONSTRAINT "OperationVoucherDetail_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "OperationVoucher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationVoucherPayment" ADD CONSTRAINT "OperationVoucherPayment_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "OperationVoucher"("id") ON DELETE CASCADE ON UPDATE CASCADE;


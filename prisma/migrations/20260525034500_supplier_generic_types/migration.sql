-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN     "bankAccountName" TEXT,
ADD COLUMN     "bankAccountNumber" TEXT,
ADD COLUMN     "bankName" TEXT,
ADD COLUMN     "link" TEXT,
ADD COLUMN     "market" TEXT,
ADD COLUMN     "rating" INTEGER;

-- AlterTable
ALTER TABLE "SupplierService" ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "quantity" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'ACTIVE';


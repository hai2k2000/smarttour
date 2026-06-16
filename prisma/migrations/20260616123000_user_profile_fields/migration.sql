ALTER TABLE "User" ADD COLUMN "phone" TEXT;
ALTER TABLE "User" ADD COLUMN "gender" TEXT;
ALTER TABLE "User" ADD COLUMN "dateOfBirth" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "address" TEXT;
ALTER TABLE "User" ADD COLUMN "identityNo" TEXT;
ALTER TABLE "User" ADD COLUMN "maritalStatus" TEXT;
ALTER TABLE "User" ADD COLUMN "nationality" TEXT;
ALTER TABLE "User" ADD COLUMN "ethnicity" TEXT;
ALTER TABLE "User" ADD COLUMN "religion" TEXT;
ALTER TABLE "User" ADD COLUMN "taxCode" TEXT;
ALTER TABLE "User" ADD COLUMN "rank" TEXT;
ALTER TABLE "User" ADD COLUMN "bankAccountNumber" TEXT;
ALTER TABLE "User" ADD COLUMN "bankAccountName" TEXT;
ALTER TABLE "User" ADD COLUMN "bankName" TEXT;

CREATE INDEX "User_phone_idx" ON "User"("phone");

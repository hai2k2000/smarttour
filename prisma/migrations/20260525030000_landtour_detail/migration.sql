-- CreateTable
CREATE TABLE "LandTourDetail" (
    "id" TEXT NOT NULL,
    "tourId" TEXT NOT NULL,
    "guideName" TEXT,
    "comboType" TEXT,
    "autoTermsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "smartLinkCode" TEXT,
    "confirmationNote" TEXT,
    "termsVi" TEXT,
    "termsEn" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LandTourDetail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LandTourDetail_tourId_key" ON "LandTourDetail"("tourId");

-- AddForeignKey
ALTER TABLE "LandTourDetail" ADD CONSTRAINT "LandTourDetail_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "Tour"("id") ON DELETE CASCADE ON UPDATE CASCADE;


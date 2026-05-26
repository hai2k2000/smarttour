-- CreateTable
CREATE TABLE "GitTourDetail" (
    "id" TEXT NOT NULL,
    "tourId" TEXT NOT NULL,
    "holdCode" TEXT,
    "itinerarySummary" TEXT,
    "agentName" TEXT,
    "collaborator" TEXT,
    "commissionRate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "invoiceStatus" TEXT,
    "accountCode" TEXT,
    "branch" TEXT,
    "department" TEXT,
    "customerSource" TEXT,
    "fileNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GitTourDetail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GitTourDetail_tourId_key" ON "GitTourDetail"("tourId");

-- AddForeignKey
ALTER TABLE "GitTourDetail" ADD CONSTRAINT "GitTourDetail_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "Tour"("id") ON DELETE CASCADE ON UPDATE CASCADE;


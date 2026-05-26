-- CreateTable
CREATE TABLE "GuideProfile" (
    "id" TEXT NOT NULL,
    "guideCode" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "taxCode" TEXT,
    "birthday" TIMESTAMP(3),
    "gender" TEXT,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "address" TEXT,
    "provinceId" TEXT,
    "bankAccountName" TEXT,
    "bankAccountNumber" TEXT,
    "bankName" TEXT,
    "link" TEXT,
    "description" TEXT,
    "guideType" TEXT,
    "languages" TEXT[],
    "markets" TEXT[],
    "skills" TEXT[],
    "frequency" TEXT,
    "avatarUrl" TEXT,
    "comment" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdBy" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuideProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuideCard" (
    "id" TEXT NOT NULL,
    "guideId" TEXT NOT NULL,
    "cardType" TEXT NOT NULL,
    "cardNumber" TEXT,
    "issueDate" TIMESTAMP(3),
    "expiredDate" TIMESTAMP(3),
    "issuePlace" TEXT,
    "fileUrl" TEXT,
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "GuideCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuideDocument" (
    "id" TEXT NOT NULL,
    "guideId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "documentNo" TEXT,
    "country" TEXT,
    "issueDate" TIMESTAMP(3),
    "expiredDate" TIMESTAMP(3),
    "issuePlace" TEXT,
    "fileUrl" TEXT,
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "GuideDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuideCostService" (
    "id" TEXT NOT NULL,
    "guideId" TEXT NOT NULL,
    "serviceType" TEXT,
    "serviceName" TEXT NOT NULL,
    "unit" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "netPrice" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "sellingPrice" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "GuideCostService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuideFile" (
    "id" TEXT NOT NULL,
    "guideId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileType" TEXT,
    "uploadedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuideFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuideSchedule" (
    "id" TEXT NOT NULL,
    "guideId" TEXT NOT NULL,
    "tourId" TEXT,
    "orderId" TEXT,
    "title" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'BUSY',
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "GuideSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GuideProfile_guideCode_key" ON "GuideProfile"("guideCode");

-- CreateIndex
CREATE INDEX "GuideProfile_status_idx" ON "GuideProfile"("status");

-- CreateIndex
CREATE INDEX "GuideProfile_phone_idx" ON "GuideProfile"("phone");

-- CreateIndex
CREATE INDEX "GuideProfile_guideType_idx" ON "GuideProfile"("guideType");

-- CreateIndex
CREATE INDEX "GuideSchedule_guideId_startDate_endDate_idx" ON "GuideSchedule"("guideId", "startDate", "endDate");

-- AddForeignKey
ALTER TABLE "GuideCard" ADD CONSTRAINT "GuideCard_guideId_fkey" FOREIGN KEY ("guideId") REFERENCES "GuideProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuideDocument" ADD CONSTRAINT "GuideDocument_guideId_fkey" FOREIGN KEY ("guideId") REFERENCES "GuideProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuideCostService" ADD CONSTRAINT "GuideCostService_guideId_fkey" FOREIGN KEY ("guideId") REFERENCES "GuideProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuideFile" ADD CONSTRAINT "GuideFile_guideId_fkey" FOREIGN KEY ("guideId") REFERENCES "GuideProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuideSchedule" ADD CONSTRAINT "GuideSchedule_guideId_fkey" FOREIGN KEY ("guideId") REFERENCES "GuideProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;


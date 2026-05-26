-- Customer CRM core
CREATE TYPE "CustomerStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'MERGED');

ALTER TABLE "Order" ADD COLUMN "customerId" TEXT;
ALTER TABLE "TourQuote" ADD COLUMN "customerId" TEXT;
ALTER TABLE "Quotation" ADD COLUMN "customerId" TEXT;

CREATE TABLE "CustomerTypeConfig" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerTypeConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomerTag" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "color" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerTag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomerCampaign" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "channel" TEXT,
  "startDate" TIMESTAMP(3),
  "endDate" TIMESTAMP(3),
  "budget" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerCampaign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Customer" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "status" "CustomerStatus" NOT NULL DEFAULT 'ACTIVE',
  "typeId" TEXT,
  "kind" TEXT NOT NULL DEFAULT 'INDIVIDUAL',
  "fullName" TEXT NOT NULL,
  "gender" TEXT,
  "dateOfBirth" TIMESTAMP(3),
  "phone" TEXT NOT NULL,
  "email" TEXT,
  "facebookUrl" TEXT,
  "zaloUrl" TEXT,
  "address" TEXT,
  "province" TEXT,
  "country" TEXT,
  "taxCode" TEXT,
  "companyName" TEXT,
  "tradingName" TEXT,
  "website" TEXT,
  "companyAddress" TEXT,
  "source" TEXT,
  "market" TEXT,
  "groupName" TEXT,
  "campaignId" TEXT,
  "createdBy" TEXT,
  "owner" TEXT,
  "branch" TEXT,
  "department" TEXT,
  "agencyType" TEXT,
  "collaborator" TEXT,
  "latestComment" TEXT,
  "mergedIntoId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomerTagMap" (
  "customerId" TEXT NOT NULL,
  "tagId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerTagMap_pkey" PRIMARY KEY ("customerId","tagId")
);

CREATE TABLE "CustomerContact" (
  "id" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "fullName" TEXT NOT NULL,
  "position" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "note" TEXT,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerContact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomerTimeline" (
  "id" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "content" TEXT,
  "actor" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerTimeline_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomerCareTask" (
  "id" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "result" TEXT,
  "scheduledAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "owner" TEXT,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerCareTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomerComment" (
  "id" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "fileName" TEXT,
  "fileUrl" TEXT,
  "mentions" TEXT[],
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerComment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomerCallLog" (
  "id" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "caller" TEXT,
  "calledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "durationSec" INTEGER NOT NULL DEFAULT 0,
  "note" TEXT,
  "externalRef" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerCallLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomerOpportunity" (
  "id" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "stage" TEXT NOT NULL DEFAULT 'NEW',
  "value" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "probability" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "expectedRevenue" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "expectedCloseAt" TIMESTAMP(3),
  "owner" TEXT,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerOpportunity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomerTypeConfig_code_key" ON "CustomerTypeConfig"("code");
CREATE UNIQUE INDEX "CustomerTag_name_key" ON "CustomerTag"("name");
CREATE UNIQUE INDEX "CustomerCampaign_code_key" ON "CustomerCampaign"("code");
CREATE UNIQUE INDEX "Customer_code_key" ON "Customer"("code");
CREATE UNIQUE INDEX "Customer_phone_key" ON "Customer"("phone");
CREATE INDEX "Customer_status_idx" ON "Customer"("status");
CREATE INDEX "Customer_typeId_idx" ON "Customer"("typeId");
CREATE INDEX "Customer_owner_idx" ON "Customer"("owner");
CREATE INDEX "Customer_branch_idx" ON "Customer"("branch");
CREATE INDEX "Customer_department_idx" ON "Customer"("department");
CREATE INDEX "Customer_market_idx" ON "Customer"("market");
CREATE INDEX "Customer_campaignId_idx" ON "Customer"("campaignId");
CREATE INDEX "Customer_createdAt_idx" ON "Customer"("createdAt");
CREATE INDEX "CustomerTimeline_customerId_createdAt_idx" ON "CustomerTimeline"("customerId", "createdAt");
CREATE INDEX "CustomerCareTask_status_idx" ON "CustomerCareTask"("status");
CREATE INDEX "CustomerCareTask_scheduledAt_idx" ON "CustomerCareTask"("scheduledAt");
CREATE INDEX "CustomerOpportunity_stage_idx" ON "CustomerOpportunity"("stage");
CREATE INDEX "CustomerOpportunity_owner_idx" ON "CustomerOpportunity"("owner");

ALTER TABLE "Customer" ADD CONSTRAINT "Customer_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "CustomerTypeConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "CustomerCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerTagMap" ADD CONSTRAINT "CustomerTagMap_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerTagMap" ADD CONSTRAINT "CustomerTagMap_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "CustomerTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerContact" ADD CONSTRAINT "CustomerContact_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerTimeline" ADD CONSTRAINT "CustomerTimeline_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerCareTask" ADD CONSTRAINT "CustomerCareTask_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerComment" ADD CONSTRAINT "CustomerComment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerCallLog" ADD CONSTRAINT "CustomerCallLog_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerOpportunity" ADD CONSTRAINT "CustomerOpportunity_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "CustomerTypeConfig" ("id", "code", "name", "sortOrder", "updatedAt") VALUES
  (gen_random_uuid()::text, 'INDIVIDUAL', 'Ca nhan', 1, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'BUSINESS', 'Doanh nghiep', 2, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'PARTNER', 'Doi tac', 3, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'COLLABORATOR', 'Cong tac vien', 4, CURRENT_TIMESTAMP);

INSERT INTO "CustomerTag" ("id", "name", "color", "updatedAt") VALUES
  (gen_random_uuid()::text, 'VIP', '#0f766e', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Tiem nang', '#2563eb', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Nhat Ban', '#dc2626', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Han Quoc', '#7c3aed', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'MICE', '#b45309', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Doanh nghiep', '#334155', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Gia dinh', '#16a34a', CURRENT_TIMESTAMP);

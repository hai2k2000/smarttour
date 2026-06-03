CREATE TABLE "CustomerFile" (
  "id" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "fileUrl" TEXT NOT NULL,
  "fileType" TEXT,
  "uploadedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CustomerFile_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CustomerFile_customerId_idx" ON "CustomerFile"("customerId");

ALTER TABLE "CustomerFile" ADD CONSTRAINT "CustomerFile_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

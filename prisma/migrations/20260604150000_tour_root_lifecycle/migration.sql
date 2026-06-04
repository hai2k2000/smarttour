ALTER TABLE "Tour" ADD COLUMN IF NOT EXISTS "closedAt" TIMESTAMP(3);
ALTER TABLE "Tour" ADD COLUMN IF NOT EXISTS "closedBy" TEXT;
ALTER TABLE "Tour" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Tour_deletedAt_idx" ON "Tour"("deletedAt");
CREATE INDEX IF NOT EXISTS "Tour_type_deletedAt_idx" ON "Tour"("type", "deletedAt");

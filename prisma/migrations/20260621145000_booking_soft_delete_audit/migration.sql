-- Add retention-safe soft delete support for Booking records.
ALTER TABLE "Booking" ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "Booking_deletedAt_idx" ON "Booking"("deletedAt");

CREATE INDEX "Booking_startDate_code_idx" ON "Booking"("startDate", "code");
CREATE INDEX "Booking_status_startDate_idx" ON "Booking"("status", "startDate");
CREATE INDEX "Booking_tourProgramId_startDate_idx" ON "Booking"("tourProgramId", "startDate");

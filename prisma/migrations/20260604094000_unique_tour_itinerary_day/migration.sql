-- Prevent duplicate itinerary day numbers inside the same tour program.
CREATE UNIQUE INDEX "TourItineraryDay_tourProgramId_dayNumber_key"
ON "TourItineraryDay"("tourProgramId", "dayNumber");

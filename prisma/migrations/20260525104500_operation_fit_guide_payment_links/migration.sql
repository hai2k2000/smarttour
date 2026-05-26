-- Add nullable long-term links for guide schedules, operation forms, FIT tours, and supplier payment requests.

ALTER TABLE "FitTour"
ADD COLUMN "customerId" TEXT,
ADD COLUMN "orderId" TEXT;

ALTER TABLE "FitOperationService"
ADD COLUMN "supplierServiceId" TEXT;

ALTER TABLE "OperationForm"
ADD COLUMN "orderId" TEXT,
ADD COLUMN "tourId" TEXT;

ALTER TABLE "SupplierPaymentRequest"
ADD COLUMN "financePaymentId" TEXT;

CREATE INDEX "FitTour_customerId_idx" ON "FitTour"("customerId");
CREATE INDEX "FitTour_orderId_idx" ON "FitTour"("orderId");
CREATE INDEX "FitOperationService_supplierServiceId_idx" ON "FitOperationService"("supplierServiceId");
CREATE INDEX "GuideSchedule_tourId_idx" ON "GuideSchedule"("tourId");
CREATE INDEX "GuideSchedule_orderId_idx" ON "GuideSchedule"("orderId");
CREATE INDEX "OperationForm_orderId_idx" ON "OperationForm"("orderId");
CREATE INDEX "OperationForm_tourId_idx" ON "OperationForm"("tourId");
CREATE INDEX "SupplierPaymentRequest_financePaymentId_idx" ON "SupplierPaymentRequest"("financePaymentId");

ALTER TABLE "FitTour" ADD CONSTRAINT "FitTour_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FitTour" ADD CONSTRAINT "FitTour_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FitOperationService" ADD CONSTRAINT "FitOperationService_supplierServiceId_fkey"
FOREIGN KEY ("supplierServiceId") REFERENCES "SupplierService"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GuideSchedule" ADD CONSTRAINT "GuideSchedule_tourId_fkey"
FOREIGN KEY ("tourId") REFERENCES "Tour"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;

ALTER TABLE "GuideSchedule" ADD CONSTRAINT "GuideSchedule_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;

ALTER TABLE "OperationForm" ADD CONSTRAINT "OperationForm_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OperationForm" ADD CONSTRAINT "OperationForm_tourId_fkey"
FOREIGN KEY ("tourId") REFERENCES "Tour"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SupplierPaymentRequest" ADD CONSTRAINT "SupplierPaymentRequest_financePaymentId_fkey"
FOREIGN KEY ("financePaymentId") REFERENCES "FinancePayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

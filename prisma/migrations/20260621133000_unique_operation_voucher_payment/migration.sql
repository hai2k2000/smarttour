-- Enforce one operation-voucher payment history row per approved finance payment.
DROP INDEX IF EXISTS "OperationVoucherPayment_paymentVoucherId_idx";
CREATE UNIQUE INDEX "OperationVoucherPayment_paymentVoucherId_key" ON "OperationVoucherPayment"("paymentVoucherId");
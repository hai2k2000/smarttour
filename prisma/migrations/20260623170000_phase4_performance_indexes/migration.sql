CREATE INDEX IF NOT EXISTS "idx_order_deleted_updated" ON "Order"("deletedAt", "updatedAt");
CREATE INDEX IF NOT EXISTS "idx_order_deleted_start" ON "Order"("deletedAt", "startDate");
CREATE INDEX IF NOT EXISTS "idx_order_deleted_status" ON "Order"("deletedAt", "status");

CREATE INDEX IF NOT EXISTS "idx_fin_receipt_deleted_updated" ON "FinanceReceipt"("deletedAt", "updatedAt");
CREATE INDEX IF NOT EXISTS "idx_fin_receipt_deleted_payment" ON "FinanceReceipt"("deletedAt", "paymentDate");
CREATE INDEX IF NOT EXISTS "idx_fin_receipt_deleted_status" ON "FinanceReceipt"("deletedAt", "approvalStatus");

CREATE INDEX IF NOT EXISTS "idx_fin_payment_deleted_updated" ON "FinancePayment"("deletedAt", "updatedAt");
CREATE INDEX IF NOT EXISTS "idx_fin_payment_deleted_payment" ON "FinancePayment"("deletedAt", "paymentDate");
CREATE INDEX IF NOT EXISTS "idx_fin_payment_deleted_status" ON "FinancePayment"("deletedAt", "approvalStatus");

CREATE INDEX IF NOT EXISTS "idx_fin_invoice_deleted_updated" ON "FinanceInvoice"("deletedAt", "updatedAt");
CREATE INDEX IF NOT EXISTS "idx_fin_invoice_deleted_issued" ON "FinanceInvoice"("deletedAt", "issuedDate");
CREATE INDEX IF NOT EXISTS "idx_fin_invoice_deleted_status" ON "FinanceInvoice"("deletedAt", "approvalStatus");

CREATE INDEX IF NOT EXISTS "idx_cashflow_payment_created" ON "FinanceCashflowEntry"("paymentDate", "createdAt");
CREATE INDEX IF NOT EXISTS "idx_cashflow_type_payment" ON "FinanceCashflowEntry"("entryType", "paymentDate");
CREATE INDEX IF NOT EXISTS "idx_cashflow_scope_payment" ON "FinanceCashflowEntry"("branch", "department", "paymentDate");

CREATE INDEX IF NOT EXISTS "idx_customer_ledger_doc_created" ON "CustomerLedgerEntry"("documentDate", "createdAt");
CREATE INDEX IF NOT EXISTS "idx_customer_ledger_scope_doc" ON "CustomerLedgerEntry"("branch", "department", "documentDate");
CREATE INDEX IF NOT EXISTS "idx_customer_ledger_customer_doc_created" ON "CustomerLedgerEntry"("customerId", "documentDate", "createdAt");

CREATE INDEX IF NOT EXISTS "idx_supplier_ledger_doc_created" ON "SupplierLedgerEntry"("documentDate", "createdAt");
CREATE INDEX IF NOT EXISTS "idx_supplier_ledger_scope_doc" ON "SupplierLedgerEntry"("branch", "department", "documentDate");
CREATE INDEX IF NOT EXISTS "idx_supplier_ledger_supplier_doc_created" ON "SupplierLedgerEntry"("supplierId", "documentDate", "createdAt");

CREATE INDEX IF NOT EXISTS "idx_tour_quote_updated" ON "TourQuote"("updatedAt");
CREATE INDEX IF NOT EXISTS "idx_tour_quote_status_updated" ON "TourQuote"("status", "updatedAt");

CREATE INDEX IF NOT EXISTS "idx_quotation_updated" ON "Quotation"("updatedAt");
CREATE INDEX IF NOT EXISTS "idx_quotation_product_status_updated" ON "Quotation"("productType", "status", "updatedAt");

CREATE INDEX IF NOT EXISTS "idx_operation_voucher_deleted_updated" ON "OperationVoucher"("deletedAt", "updatedAt");
CREATE INDEX IF NOT EXISTS "idx_operation_voucher_deleted_service" ON "OperationVoucher"("deletedAt", "serviceDate");
CREATE INDEX IF NOT EXISTS "idx_operation_voucher_deleted_status_service" ON "OperationVoucher"("deletedAt", "status", "serviceDate");
CREATE INDEX IF NOT EXISTS "idx_operation_voucher_supplier_service" ON "OperationVoucher"("supplierId", "serviceDate");

CREATE INDEX IF NOT EXISTS "idx_supplier_deleted_updated" ON "Supplier"("deletedAt", "updatedAt");
CREATE INDEX IF NOT EXISTS "idx_supplier_status_deleted_updated" ON "Supplier"("status", "deletedAt", "updatedAt");

CREATE INDEX IF NOT EXISTS "idx_customer_status_created" ON "Customer"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "idx_customer_scope_status_created" ON "Customer"("branch", "department", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "idx_customer_owner_created" ON "Customer"("owner", "createdAt");

CREATE INDEX IF NOT EXISTS "idx_customer_care_customer_scheduled" ON "CustomerCareTask"("customerId", "scheduledAt");
CREATE INDEX IF NOT EXISTS "idx_customer_care_customer_status_scheduled" ON "CustomerCareTask"("customerId", "status", "scheduledAt");
CREATE INDEX IF NOT EXISTS "idx_customer_comment_customer_created" ON "CustomerComment"("customerId", "createdAt");
CREATE INDEX IF NOT EXISTS "idx_customer_call_customer_called" ON "CustomerCallLog"("customerId", "calledAt");
CREATE INDEX IF NOT EXISTS "idx_customer_opportunity_customer_created" ON "CustomerOpportunity"("customerId", "createdAt");
CREATE INDEX IF NOT EXISTS "idx_customer_opportunity_customer_stage" ON "CustomerOpportunity"("customerId", "stage");

CREATE INDEX IF NOT EXISTS "idx_booking_deleted_start_code" ON "Booking"("deletedAt", "startDate", "code");
CREATE INDEX IF NOT EXISTS "idx_booking_deleted_status_start" ON "Booking"("deletedAt", "status", "startDate");

CREATE INDEX IF NOT EXISTS "idx_operation_form_status_updated" ON "OperationForm"("status", "updatedAt");
CREATE INDEX IF NOT EXISTS "idx_operation_form_updated_created" ON "OperationForm"("updatedAt", "createdAt");
CREATE INDEX IF NOT EXISTS "idx_operation_service_form" ON "OperationService"("operationFormId");
CREATE INDEX IF NOT EXISTS "idx_operation_service_form_confirm" ON "OperationService"("operationFormId", "confirmationStatus");
CREATE INDEX IF NOT EXISTS "idx_operation_task_form" ON "OperationTask"("operationFormId");
CREATE INDEX IF NOT EXISTS "idx_operation_task_form_status_due" ON "OperationTask"("operationFormId", "status", "dueDate");
CREATE INDEX IF NOT EXISTS "idx_operation_task_status_due" ON "OperationTask"("status", "dueDate");
CREATE INDEX IF NOT EXISTS "idx_operation_cost_form" ON "OperationCost"("operationFormId");
CREATE INDEX IF NOT EXISTS "idx_operation_cost_service" ON "OperationCost"("serviceId");

CREATE INDEX IF NOT EXISTS "idx_supplier_payment_request_status_requested" ON "SupplierPaymentRequest"("status", "requestedAt");
CREATE INDEX IF NOT EXISTS "idx_supplier_payment_request_requested_code" ON "SupplierPaymentRequest"("requestedAt", "code");
CREATE INDEX IF NOT EXISTS "idx_supplier_payment_item_request" ON "SupplierPaymentItem"("requestId");
CREATE INDEX IF NOT EXISTS "idx_supplier_payment_item_supplier" ON "SupplierPaymentItem"("supplierId");
CREATE INDEX IF NOT EXISTS "idx_supplier_payment_item_cost" ON "SupplierPaymentItem"("costId");

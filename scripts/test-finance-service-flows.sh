#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"
TEST_DB="${TEST_DB:-smarttour_finance_service_test}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-smarttour-postgres-1}"
POSTGRES_USER="${POSTGRES_USER:-smarttour}"

cd "$REPO_DIR"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$(grep -E '^POSTGRES_PASSWORD=' .env | tail -1 | cut -d= -f2-)}"
if [[ -z "$POSTGRES_PASSWORD" ]]; then
  echo "FAIL_FINANCE_SERVICE_TEST missing POSTGRES_PASSWORD"
  exit 1
fi

docker compose build api >/dev/null
docker exec "$POSTGRES_CONTAINER" dropdb -U "$POSTGRES_USER" --if-exists "$TEST_DB" >/dev/null 2>&1 || true
docker exec "$POSTGRES_CONTAINER" createdb -U "$POSTGRES_USER" "$TEST_DB"

cleanup() {
  docker exec "$POSTGRES_CONTAINER" dropdb -U "$POSTGRES_USER" --if-exists "$TEST_DB" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker compose run --rm \
  -v "$PWD:/workspace:ro" \
  -e DATABASE_URL="postgresql://smarttour:${POSTGRES_PASSWORD}@postgres:5432/${TEST_DB}?schema=public" \
  --entrypoint sh api -lc "cd /workspace && /app/node_modules/.bin/prisma db push --schema prisma/schema.prisma --skip-generate >/dev/null && cd /app && node" <<'NODE'
const { PrismaService } = require('./apps/api/dist/database/prisma.service');
const { FinanceController } = require('./apps/api/dist/modules/finance/finance.controller');
const { FinanceService } = require('./apps/api/dist/modules/finance/finance.service');

function assert(condition, label) {
  if (!condition) throw new Error(label);
}

async function rejects(action, label) {
  let rejected = false;
  try {
    await action();
  } catch {
    rejected = true;
  }
  assert(rejected, label);
}

function amount(value) {
  return Number(value);
}

async function sum(prisma, model, where, field) {
  const result = await prisma[model].aggregate({ where, _sum: { [field]: true } });
  return amount(result._sum[field] || 0);
}

async function cashflowNet(prisma, where) {
  const receipt = await sum(prisma, 'financeCashflowEntry', { ...where, entryType: 'RECEIPT' }, 'amount');
  const payment = await sum(prisma, 'financeCashflowEntry', { ...where, entryType: 'PAYMENT' }, 'amount');
  return receipt - payment;
}

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  await prisma.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "CodeSequence_scope_prefix_year_month_branch_expr_key" ON "CodeSequence"("scope", "prefix", "year", COALESCE("month", 0), COALESCE("branch", \'\'))');
  const finance = new FinanceService(prisma, {});
  const run = 'FIN-SVC-' + Date.now();

  const customer = await prisma.customer.create({
    data: {
      code: run + '-CUS',
      fullName: 'Finance Service Customer',
      phone: '091' + String(Date.now()).slice(-7),
      email: run.toLowerCase() + '@smarttour.local',
      branch: 'FIN-BR',
      department: 'FIN-DEP',
    },
  });
  const category = await prisma.supplierCategory.create({ data: { name: run + '-SUP-CAT' } });
  const supplier = await prisma.supplier.create({
    data: {
      categoryId: category.id,
      supplierCode: run + '-SUP',
      name: 'Finance Service Supplier',
      status: 'ACTIVE',
    },
  });
  const voucher = await prisma.operationVoucher.create({
    data: {
      voucherCode: run + '-OV',
      supplierId: supplier.id,
      supplierName: supplier.name,
      serviceType: 'HOTEL',
      serviceName: 'Hotel service',
      serviceDate: new Date('2026-11-01'),
      totalAmount: 1000,
      remainAmount: 1000,
      status: 'PENDING',
    },
  });
  const order = await prisma.order.create({
    data: {
      type: 'SINGLE_SERVICE',
      systemCode: run + '-ORD',
      name: 'Finance Linked Order',
      customerId: customer.id,
      totalRevenue: 1000,
      remainingRevenue: 1000,
      totalCost: 700,
      remainingCost: 700,
      branch: 'FIN-BR',
      department: 'FIN-DEP',
    },
  });

  const receipt = await finance.createReceipt({
    receiptCode: run + '-RCPT',
    receiptName: 'Receipt Flow',
    receiptType: 'TOUR_PAYMENT',
    paymentDate: '2026-11-02',
    paymentMethod: 'BANK_TRANSFER',
    customerId: customer.id,
    payerName: customer.fullName,
    totalAmount: 1000,
    paidBefore: 0,
    receiptAmount: 1000,
    reason: 'Receipt flow test',
    branch: 'FIN-BR',
    department: 'FIN-DEP',
    orders: [{ orderId: order.id, orderCode: order.systemCode, tourCode: order.tourCode, tourName: order.name, amount: 1000 }],
  });
  const approvedReceipt = await finance.approveReceipt(receipt.id, { actor: 'finance-test' });
  assert(approvedReceipt.approvalStatus === 'APPROVED', 'receipt should approve');
  assert(await prisma.financeCashflowEntry.count({ where: { sourceType: 'RECEIPT', sourceId: receipt.id } }) === 1, 'receipt approve should create cashflow');
  assert(await prisma.customerLedgerEntry.count({ where: { sourceType: 'FINANCE_RECEIPT', sourceId: receipt.id, entryType: 'CREDIT' } }) === 1, 'receipt approve should create customer ledger');
  assert(await sum(prisma, 'financeCashflowEntry', { sourceType: 'RECEIPT', sourceId: receipt.id, entryType: 'RECEIPT' }, 'amount') === 1000, 'receipt cashflow amount should match receipt amount');
  assert(await sum(prisma, 'customerLedgerEntry', { sourceType: 'FINANCE_RECEIPT', sourceId: receipt.id, entryType: 'CREDIT' }, 'creditAmount') === 1000, 'receipt customer ledger credit should match receipt amount');
  let orderAfter = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  assert(amount(orderAfter.paidAmount) === 1000 && amount(orderAfter.remainingRevenue) === 0 && orderAfter.paymentStatus === 'PAID', 'receipt approve should reconcile order revenue');
  await rejects(() => finance.approveReceipt(receipt.id, { actor: 'finance-test' }), 'double approve receipt should be blocked');
  const cancelledReceipt = await finance.cancelReceipt(receipt.id, { actor: 'finance-test', reason: 'cancel receipt' });
  assert(cancelledReceipt.approvalStatus === 'CANCELLED' && cancelledReceipt.reversals.length === 1, 'receipt should cancel with reversal');
  const receiptReversal = await prisma.financeReceipt.findUniqueOrThrow({ where: { id: cancelledReceipt.reversals[0].id }, include: { orders: true } });
  assert(receiptReversal.branch === 'FIN-BR' && receiptReversal.department === 'FIN-DEP' && receiptReversal.orders[0].orderId === order.id, 'receipt reversal should preserve scope and order links');
  assert(await cashflowNet(prisma, { receiptId: { in: [receipt.id, cancelledReceipt.reversals[0].id] } }) === 0, 'receipt cashflow should net to zero after cancellation');
  assert(await sum(prisma, 'customerLedgerEntry', { receiptId: { in: [receipt.id, cancelledReceipt.reversals[0].id] } }, 'creditAmount') === 1000, 'receipt original ledger credit should remain');
  assert(await sum(prisma, 'customerLedgerEntry', { receiptId: { in: [receipt.id, cancelledReceipt.reversals[0].id] } }, 'debitAmount') === 1000, 'receipt reversal ledger debit should match original credit');
  const receiptReversalLedger = await prisma.customerLedgerEntry.findFirstOrThrow({ where: { sourceType: 'FINANCE_RECEIPT', sourceId: receiptReversal.id, entryType: 'REVERSAL' } });
  assert(receiptReversalLedger.branch === 'FIN-BR' && receiptReversalLedger.department === 'FIN-DEP' && receiptReversalLedger.orderId === order.id, 'receipt reversal ledger should preserve scope and order link');
  orderAfter = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  assert(amount(orderAfter.paidAmount) === 0 && amount(orderAfter.remainingRevenue) === 1000 && orderAfter.paymentStatus === 'UNPAID', 'receipt cancel should undo order revenue reconcile');
  const cancelledReceiptAgain = await finance.cancelReceipt(receipt.id, { actor: 'finance-test', reason: 'again' });
  assert(cancelledReceiptAgain.reversals.length === 1, 'double cancel receipt should be idempotent without duplicate reversal');

  const rejectedReceiptDraft = await finance.createReceipt({
    receiptCode: run + '-RCPT-REJECT',
    receiptName: 'Receipt Reject Flow',
    receiptType: 'TOUR_PAYMENT',
    paymentDate: '2026-11-02',
    paymentMethod: 'BANK_TRANSFER',
    customerId: customer.id,
    payerName: customer.fullName,
    totalAmount: 100,
    paidBefore: 0,
    receiptAmount: 100,
    branch: 'FIN-BR',
    department: 'FIN-DEP',
  });
  const rejectedReceipt = await finance.rejectReceipt(rejectedReceiptDraft.id, { actor: 'finance-test', note: 'reject receipt' });
  assert(rejectedReceipt.approvalStatus === 'REJECTED', 'receipt should reject');
  await rejects(() => finance.approveReceipt(rejectedReceiptDraft.id, { actor: 'finance-test' }), 'rejected receipt should not approve');

  const payment = await finance.createPayment({
    voucherCode: run + '-PAY',
    voucherName: 'Payment Flow',
    voucherType: 'SUPPLIER_PAYMENT',
    paymentDate: '2026-11-03',
    paymentMethod: 'BANK_TRANSFER',
    supplierId: supplier.id,
    operationVoucherId: voucher.id,
    orderId: order.id,
    receiverName: supplier.name,
    totalAmount: 1000,
    paymentAmount: 600,
    reason: 'Payment flow test',
    branch: 'FIN-BR',
    department: 'FIN-DEP',
  });
  const approvedPayment = await finance.approvePayment(payment.id, { actor: 'finance-test' });
  assert(approvedPayment.approvalStatus === 'APPROVED', 'payment should approve');
  let voucherAfter = await prisma.operationVoucher.findUniqueOrThrow({ where: { id: voucher.id } });
  assert(amount(voucherAfter.paidAmount) === 600 && amount(voucherAfter.remainAmount) === 400 && voucherAfter.status === 'PARTIAL', 'payment approve should reconcile voucher');
  assert(await prisma.supplierLedgerEntry.count({ where: { sourceType: 'FINANCE_PAYMENT', sourceId: payment.id, entryType: 'DEBIT' } }) === 1, 'payment approve should create supplier ledger');
  assert(await sum(prisma, 'financeCashflowEntry', { sourceType: 'PAYMENT', sourceId: payment.id, entryType: 'PAYMENT' }, 'amount') === 600, 'payment cashflow amount should match payment amount');
  assert(await sum(prisma, 'supplierLedgerEntry', { sourceType: 'FINANCE_PAYMENT', sourceId: payment.id, entryType: 'DEBIT' }, 'debitAmount') === 600, 'payment supplier ledger debit should match payment amount');
  orderAfter = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  assert(amount(orderAfter.paidCost) === 600 && amount(orderAfter.remainingCost) === 100 && orderAfter.costStatus === 'PARTIAL', 'payment approve should reconcile order cost');
  await rejects(() => finance.approvePayment(payment.id, { actor: 'finance-test' }), 'double approve payment should be blocked');
  const cancelledPayment = await finance.cancelPayment(payment.id, { actor: 'finance-test', reason: 'cancel payment' });
  assert(cancelledPayment.approvalStatus === 'CANCELLED' && cancelledPayment.reversals.length === 1, 'payment should cancel with reversal');
  const paymentReversal = await prisma.financePayment.findUniqueOrThrow({ where: { id: cancelledPayment.reversals[0].id } });
  assert(paymentReversal.branch === 'FIN-BR' && paymentReversal.department === 'FIN-DEP' && paymentReversal.operationVoucherId === voucher.id && paymentReversal.orderId === order.id, 'payment reversal should preserve scope and links');
  assert(await cashflowNet(prisma, { paymentId: { in: [payment.id, cancelledPayment.reversals[0].id] } }) === 0, 'payment cashflow should net to zero after cancellation');
  assert(await sum(prisma, 'supplierLedgerEntry', { paymentId: { in: [payment.id, cancelledPayment.reversals[0].id] } }, 'debitAmount') === 600, 'payment original supplier ledger debit should remain');
  assert(await sum(prisma, 'supplierLedgerEntry', { paymentId: { in: [payment.id, cancelledPayment.reversals[0].id] } }, 'creditAmount') === 600, 'payment reversal supplier ledger credit should match original debit');
  const paymentReversalLedger = await prisma.supplierLedgerEntry.findFirstOrThrow({ where: { sourceType: 'FINANCE_PAYMENT', sourceId: paymentReversal.id, entryType: 'REVERSAL' } });
  assert(paymentReversalLedger.branch === 'FIN-BR' && paymentReversalLedger.department === 'FIN-DEP' && paymentReversalLedger.operationVoucherId === voucher.id && paymentReversalLedger.orderId === order.id, 'payment reversal ledger should preserve scope and links');
  voucherAfter = await prisma.operationVoucher.findUniqueOrThrow({ where: { id: voucher.id } });
  assert(amount(voucherAfter.paidAmount) === 0 && amount(voucherAfter.remainAmount) === 1000 && voucherAfter.status === 'PENDING', 'payment cancel should undo voucher reconcile');
  orderAfter = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  assert(amount(orderAfter.paidCost) === 0 && amount(orderAfter.remainingCost) === 700 && orderAfter.costStatus === 'PENDING', 'payment cancel should undo order cost reconcile');
  const cancelledPaymentAgain = await finance.cancelPayment(payment.id, { actor: 'finance-test', reason: 'again' });
  assert(cancelledPaymentAgain.reversals.length === 1, 'double cancel payment should be idempotent without duplicate reversal');

  const rejectedPaymentDraft = await finance.createPayment({
    voucherCode: run + '-PAY-REJECT',
    voucherName: 'Payment Reject Flow',
    voucherType: 'SUPPLIER_PAYMENT',
    paymentDate: '2026-11-03',
    paymentMethod: 'BANK_TRANSFER',
    supplierId: supplier.id,
    receiverName: supplier.name,
    totalAmount: 100,
    paymentAmount: 100,
    branch: 'FIN-BR',
    department: 'FIN-DEP',
  });
  const rejectedPayment = await finance.rejectPayment(rejectedPaymentDraft.id, { actor: 'finance-test', note: 'reject payment' });
  assert(rejectedPayment.approvalStatus === 'REJECTED', 'payment should reject');
  await rejects(() => finance.approvePayment(rejectedPaymentDraft.id, { actor: 'finance-test' }), 'rejected payment should not approve');

  const invoice = await finance.createInvoice({
    invoiceCode: run + '-INV',
    systemCode: run + '-SYS',
    customerId: customer.id,
    customerName: customer.fullName,
    customerPhone: customer.phone,
    invoiceType: 'VAT',
    issuedDate: '2026-11-04',
    items: [{ itemName: 'Tour service', unit: 'pax', quantity: 2, unitPrice: 500, taxRate: 10 }],
  });
  const approvedInvoice = await finance.approveInvoice(invoice.id, { actor: 'finance-test' });
  assert(approvedInvoice.approvalStatus === 'APPROVED', 'invoice should approve');
  assert(await prisma.customerLedgerEntry.count({ where: { sourceType: 'FINANCE_INVOICE', sourceId: invoice.id, entryType: 'DEBIT' } }) === 1, 'invoice approve should create customer ledger');
  assert(await sum(prisma, 'customerLedgerEntry', { sourceType: 'FINANCE_INVOICE', sourceId: invoice.id, entryType: 'DEBIT' }, 'debitAmount') === 1100, 'invoice customer ledger debit should match total after tax');
  const invoiceLedger = await prisma.customerLedgerEntry.findFirstOrThrow({ where: { sourceType: 'FINANCE_INVOICE', sourceId: invoice.id, entryType: 'DEBIT' } });
  assert(invoiceLedger.branch === 'FIN-BR' && invoiceLedger.department === 'FIN-DEP', 'invoice customer ledger should preserve resolved customer scope');
  await rejects(() => finance.approveInvoice(invoice.id, { actor: 'finance-test' }), 'double approve invoice should be blocked');
  const cancelledInvoice = await finance.cancelInvoice(invoice.id, { actor: 'finance-test', reason: 'cancel invoice' });
  assert(cancelledInvoice.approvalStatus === 'CANCELLED' && cancelledInvoice.reversals.length === 1, 'invoice should cancel with reversal');
  assert(await sum(prisma, 'customerLedgerEntry', { invoiceId: { in: [invoice.id, cancelledInvoice.reversals[0].id] } }, 'debitAmount') === 1100, 'invoice original ledger debit should remain');
  assert(await sum(prisma, 'customerLedgerEntry', { invoiceId: { in: [invoice.id, cancelledInvoice.reversals[0].id] } }, 'creditAmount') === 1100, 'invoice reversal ledger credit should match original debit');
  const invoiceReversalLedger = await prisma.customerLedgerEntry.findFirstOrThrow({ where: { sourceType: 'FINANCE_INVOICE', sourceId: cancelledInvoice.reversals[0].id, entryType: 'REVERSAL' } });
  assert(invoiceReversalLedger.branch === 'FIN-BR' && invoiceReversalLedger.department === 'FIN-DEP', 'invoice reversal ledger should preserve resolved customer scope');
  const cancelledInvoiceAgain = await finance.cancelInvoice(invoice.id, { actor: 'finance-test', reason: 'again' });
  assert(cancelledInvoiceAgain.reversals.length === 1, 'double cancel invoice should be idempotent without duplicate reversal');

  const rejectedInvoiceDraft = await finance.createInvoice({
    invoiceCode: run + '-INV-REJECT',
    systemCode: run + '-SYS-REJECT',
    customerId: customer.id,
    customerName: customer.fullName,
    invoiceType: 'VAT',
    issuedDate: '2026-11-04',
    items: [{ itemName: 'Reject invoice service', unit: 'pax', quantity: 1, unitPrice: 100, taxRate: 10 }],
  });
  const rejectedInvoice = await finance.rejectInvoice(rejectedInvoiceDraft.id, { actor: 'finance-test', note: 'reject invoice' });
  assert(rejectedInvoice.approvalStatus === 'REJECTED', 'invoice should reject');
  await rejects(() => finance.approveInvoice(rejectedInvoiceDraft.id, { actor: 'finance-test' }), 'rejected invoice should not approve');

  const receiptImportCsv = [
    'receiptCode,receiptName,receiptType,paymentMethod,paymentDate,totalAmount,paidBefore,receiptAmount,payerName,branch',
    `${run}-IMP-RCPT,"Import, Receipt",TOUR_PAYMENT,BANK_TRANSFER,2026-11-05,100,0,100,CSV Customer,FIN-BR`,
  ].join('\n');
  const receiptImport = await finance.importReceipts({ csv: receiptImportCsv });
  assert(receiptImport.imported === 1 && receiptImport.rows[0].receiptCode === `${run}-IMP-RCPT`, 'receipt CSV import should accept quoted commas');
  await rejects(() => finance.importReceipts({ csv: receiptImportCsv }), 'receipt CSV import should reject existing code');
  await rejects(() => finance.importReceipts({ csv: 'receiptCode,receiptName,totalAmount,receiptAmount\nBAD,Bad,-1,1' }), 'receipt CSV import should reject negative amount');

  const paymentImportCsv = [
    'voucherCode,voucherName,voucherType,paymentMethod,paymentDate,totalAmount,paymentAmount,receiverName',
    `${run}-IMP-PAY,Import Payment,SUPPLIER_PAYMENT,CASH,2026-11-06,200,150,Supplier CSV`,
  ].join('\n');
  const paymentImport = await finance.importPayments({ csv: paymentImportCsv });
  assert(paymentImport.imported === 1 && paymentImport.rows[0].voucherCode === `${run}-IMP-PAY`, 'payment CSV import should accept valid data');
  await rejects(() => finance.importPayments({ csv: 'voucherCode,voucherName,totalAmount,paymentAmount\nBAD,Bad,100,200' }), 'payment CSV import should reject amount over total');
  await rejects(() => finance.importPayments({ csv: 'voucherCode,voucherName,voucherName,totalAmount,paymentAmount\nA,B,C,1,1' }), 'payment CSV import should reject duplicate headers');

  const controller = new FinanceController(finance);
  const controllerReceiptImport = await controller.importReceipts({
    csv: [
      'receiptCode,receiptName,receiptType,paymentMethod,paymentDate,totalAmount,paidBefore,receiptAmount,payerName,branch,department',
      `${run}-IMP-RCPT-CTRL,Controller Receipt,TOUR_PAYMENT,CASH,2026-11-07,120,0,120,Controller Customer,FIN-BR,FIN-DEP`,
    ].join('\n'),
  }, { user: undefined });
  assert(controllerReceiptImport.imported === 1 && controllerReceiptImport.rows[0].department === 'FIN-DEP', 'receipt controller import should call real import flow');
  const controllerPaymentImport = await controller.importPayments({
    csv: [
      'voucherCode,voucherName,voucherType,paymentMethod,paymentDate,totalAmount,paymentAmount,receiverName,branch,department',
      `${run}-IMP-PAY-CTRL,Controller Payment,SUPPLIER_PAYMENT,CASH,2026-11-08,220,200,Controller Supplier,FIN-BR,FIN-DEP`,
    ].join('\n'),
  }, { user: undefined });
  assert(controllerPaymentImport.imported === 1 && controllerPaymentImport.rows[0].branch === 'FIN-BR', 'payment controller import should call real import flow');

  const receiptExport = await finance.exportReceipts({ search: run });
  assert(receiptExport.includes('receiptCode') && receiptExport.includes(`${run}-RCPT`), 'receipt export should include matching rows');
  const paymentExport = await finance.exportPayments({ search: run });
  assert(paymentExport.includes('voucherCode') && paymentExport.includes(`${run}-PAY`), 'payment export should include matching rows');
  const invoiceExport = await finance.exportInvoices({ search: run });
  assert(invoiceExport.includes('invoiceCode') && invoiceExport.includes(`${run}-INV`), 'invoice export should include matching rows');
  const cashflowExport = await finance.exportCashflow({ take: '1000' });
  assert(cashflowExport.includes('sourceType') && cashflowExport.includes('RECEIPT'), 'cashflow export should include posted entries');

  const customerAdjustmentIncrease = await finance.createCustomerDebtAdjustment(customer.id, { direction: 'INCREASE', amount: 250, branch: 'FIN-BR', department: 'FIN-DEP', actor: 'finance-test', description: 'increase customer debt' });
  const customerAdjustmentDecrease = await finance.createCustomerDebtAdjustment(customer.id, { direction: 'DECREASE', amount: 100, branch: 'FIN-BR', department: 'FIN-DEP', actor: 'finance-test', description: 'decrease customer debt' });
  assert(amount(customerAdjustmentIncrease.debitAmount) === 250 && amount(customerAdjustmentDecrease.creditAmount) === 100, 'customer debt adjustments should post debit/credit by direction');
  const customerDebt = await finance.customerDebt({ customerId: customer.id, take: '1000' });
  const customerDebtRow = customerDebt.rows.find((row) => row.id === customer.id);
  assert(customerDebtRow && customerDebtRow.balance === 150, 'customer debt report should include net manual adjustment balance');
  await rejects(() => finance.createCustomerDebtAdjustment(customer.id, { direction: 'SIDEWAYS', amount: 1 }), 'customer debt adjustment should reject invalid direction');

  const supplierAdjustmentIncrease = await finance.createSupplierDebtAdjustment(supplier.id, { direction: 'INCREASE', amount: 400, branch: 'FIN-BR', department: 'FIN-DEP', actor: 'finance-test', description: 'increase supplier debt' });
  const supplierAdjustmentDecrease = await finance.createSupplierDebtAdjustment(supplier.id, { direction: 'DECREASE', amount: 125, branch: 'FIN-BR', department: 'FIN-DEP', actor: 'finance-test', description: 'decrease supplier debt' });
  assert(amount(supplierAdjustmentIncrease.creditAmount) === 400 && amount(supplierAdjustmentDecrease.debitAmount) === 125, 'supplier debt adjustments should post payable/settlement by direction');
  const supplierDebt = await finance.supplierDebt({ supplierId: supplier.id, take: '1000' });
  const supplierDebtRow = supplierDebt.rows.find((row) => row.id === supplier.id);
  assert(supplierDebtRow && supplierDebtRow.balance === 275, 'supplier debt report should include net manual adjustment balance');
  await rejects(() => finance.createSupplierDebtAdjustment(supplier.id, { direction: 'INCREASE', amount: 0 }), 'supplier debt adjustment should reject non-positive amount');

  await prisma.$disconnect();
  console.log('TEST_FINANCE_SERVICE_FLOWS_OK');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
NODE

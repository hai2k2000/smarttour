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
const { FinanceCashflowService } = require('./apps/api/dist/modules/finance/finance-cashflow.service');
const { FinanceInvoiceService } = require('./apps/api/dist/modules/finance/finance-invoice.service');
const { FinanceLedgerService } = require('./apps/api/dist/modules/finance/finance-ledger.service');
const { FinancePaymentService } = require('./apps/api/dist/modules/finance/finance-payment.service');
const { FinanceReceiptService } = require('./apps/api/dist/modules/finance/finance-receipt.service');
const { FinanceService } = require('./apps/api/dist/modules/finance/finance.service');
const { OperationVouchersService } = require('./apps/api/dist/modules/operation-vouchers/operation-vouchers.service');

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

async function rejectsWithMessage(action, message, label) {
  try {
    await action();
  } catch (error) {
    const actual = String(error?.response?.message || error?.message || '');
    assert(actual.includes(message), `${label}: expected message containing ${message}, got ${actual}`);
    return;
  }
  assert(false, label);
}

async function rejectsWithStatus(action, status, label) {
  try {
    await action();
  } catch (error) {
    assert(error?.status === status, `${label}: expected status ${status}, got ${error?.status || '<none>'}`);
    return;
  }
  assert(false, label);
}

function amount(value) {
  return Number(value);
}

function role(...permissions) {
  return { role: { permissions: permissions.map((permission) => ({ permission })) } };
}

function scopedUser(branch, department, ...permissions) {
  return { id: 'user-' + branch + '-' + department, username: 'scope-user', branch, department, roles: [role(...permissions)] };
}

function uploadFile(name = 'finance-test.txt') {
  return { originalname: name, mimetype: 'text/plain', size: 12, buffer: Buffer.from('finance-test') };
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
  const fileStore = { uploaded: [], removed: [] };
  const filesService = {
    async upload(file, folder, actorId) {
      if (!file) throw new Error('missing file');
      const objectKey = `${folder}/${file.originalname}`;
      fileStore.uploaded.push({ objectKey, actorId });
      return { fileName: file.originalname, url: `/files/${objectKey}`, objectKey, mimeType: file.mimetype, size: file.size };
    },
    objectKeyFromUrl(url) {
      return url ? String(url).replace(/^\/files\//, '') : null;
    },
    async removeQuietly(objectKey) {
      if (objectKey) fileStore.removed.push(objectKey);
    },
    async removeIfPresent(objectKey) {
      if (objectKey) fileStore.removed.push(objectKey);
    },
  };
  const finance = new FinanceService(prisma, filesService);
  const operationVouchers = new OperationVouchersService(prisma);
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
  const otherCustomer = await prisma.customer.create({
    data: {
      code: run + '-OTHER-CUS',
      fullName: 'Other Finance Customer',
      phone: '092' + String(Date.now()).slice(-7),
      branch: 'OTHER-BR',
      department: 'OTHER-DEP',
    },
  });
  const otherSupplier = await prisma.supplier.create({
    data: {
      categoryId: category.id,
      supplierCode: run + '-OTHER-SUP',
      name: 'Other Finance Supplier',
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
  const otherOrder = await prisma.order.create({
    data: {
      type: 'SINGLE_SERVICE',
      systemCode: run + '-OTHER-ORD',
      name: 'Other Finance Order',
      customerId: otherCustomer.id,
      totalRevenue: 300,
      remainingRevenue: 300,
      totalCost: 200,
      remainingCost: 200,
      branch: 'OTHER-BR',
      department: 'OTHER-DEP',
    },
  });
  const tour = await prisma.tour.create({
    data: {
      type: 'FIT',
      systemCode: run + '-TOUR',
      tourCode: run + '-TOUR',
      name: 'Finance Linked Tour',
      orderId: order.id,
      branch: 'FIN-BR',
      department: 'FIN-DEP',
    },
  });
  await prisma.operationVoucher.update({ where: { id: voucher.id }, data: { orderId: order.id, tourId: tour.id } });

  const branchUser = scopedUser('FIN-BR', 'FIN-DEP', 'data.scope.branch');
  const outOfScopeUser = scopedUser('OTHER-BR', 'OTHER-DEP', 'data.scope.branch');
  await prisma.user.create({
    data: {
      id: branchUser.id,
      username: branchUser.username,
      email: 'finance-scope-user@smarttour.local',
      name: 'Finance Scope User',
      passwordHash: 'test-only',
      branch: branchUser.branch,
      department: branchUser.department,
    },
  });

  const pendingVoucher = await prisma.operationVoucher.create({
    data: {
      voucherCode: run + '-OV-PENDING',
      supplierId: supplier.id,
      supplierName: supplier.name,
      serviceType: 'HOTEL',
      serviceName: 'Approval boundary voucher',
      serviceDate: new Date('2026-11-01'),
      totalAmount: 300,
      remainAmount: 300,
      status: 'PENDING',
      orderId: order.id,
      tourId: tour.id,
    },
  });
  let pendingVoucherView = await operationVouchers.createPaymentVoucher(pendingVoucher.id, branchUser);
  let pendingFinancePayment = pendingVoucherView.financePayments[0];
  assert(pendingVoucherView.status === 'PENDING' && amount(pendingVoucherView.paidAmount) === 0 && amount(pendingVoucherView.remainAmount) === 300 && pendingVoucherView.payments.length === 0, 'pending finance payment must not settle operation voucher');
  assert(pendingFinancePayment.approvalStatus === 'PENDING' && pendingFinancePayment.createdBy === branchUser.username, 'operation voucher finance payment should start pending with server actor');
  await rejects(() => operationVouchers.addPayment(pendingVoucher.id, { paymentVoucherId: pendingFinancePayment.id, paymentAmount: 300 }, branchUser), 'pending finance payment must not be applied manually');
  await finance.rejectPayment(pendingFinancePayment.id, { actor: 'client-spoof' }, branchUser);
  pendingVoucherView = await operationVouchers.detail(pendingVoucher.id, branchUser);
  assert(pendingVoucherView.status === 'PENDING' && amount(pendingVoucherView.paidAmount) === 0 && amount(pendingVoucherView.remainAmount) === 300 && pendingVoucherView.payments.length === 0, 'rejected finance payment must not change operation voucher debt');
  pendingVoucherView = await operationVouchers.createPaymentVoucher(pendingVoucher.id, branchUser);
  pendingFinancePayment = pendingVoucherView.financePayments.find((row) => row.approvalStatus === 'PENDING');
  await finance.approvePayment(pendingFinancePayment.id, { actor: 'client-spoof' }, branchUser);
  pendingVoucherView = await operationVouchers.detail(pendingVoucher.id, branchUser);
  assert(pendingVoucherView.status === 'PAID' && amount(pendingVoucherView.paidAmount) === 300 && amount(pendingVoucherView.remainAmount) === 0 && pendingVoucherView.payments.length === 1, 'approved finance payment should settle operation voucher once');
  await finance.cancelPayment(pendingFinancePayment.id, { actor: 'client-spoof', reason: 'cancel approval boundary test' }, branchUser);
  pendingVoucherView = await operationVouchers.detail(pendingVoucher.id, branchUser);
  assert(pendingVoucherView.status === 'PENDING' && amount(pendingVoucherView.paidAmount) === 0 && amount(pendingVoucherView.remainAmount) === 300 && pendingVoucherView.payments.length === 0, 'cancelled approved finance payment should restore operation voucher debt');

  const spoofedAudit = {
    approvalStatus: 'APPROVED',
    approvedBy: 'client-spoof',
    approvedAt: '2026-01-01',
    cancelledBy: 'client-spoof',
    cancelledAt: '2026-01-01',
    createdBy: 'client-spoof',
    lockedAt: '2026-01-01',
  };
  const protectedReceipt = await finance.createReceipt({
    ...spoofedAudit,
    receiptCode: run + '-PROTECTED-RCPT',
    receiptName: 'Protected Receipt',
    receiptType: 'TOUR_PAYMENT',
    paymentMethod: 'CASH',
    customerId: customer.id,
    totalAmount: 50,
    receiptAmount: 50,
    tourId: tour.id,
    branch: 'FIN-BR',
    department: 'FIN-DEP',
  }, branchUser);
  assert(protectedReceipt.approvalStatus === 'DRAFT' && !protectedReceipt.approvedBy && !protectedReceipt.approvedAt && !protectedReceipt.cancelledBy && !protectedReceipt.cancelledAt, 'receipt create should ignore client approval and audit fields');
  assert(protectedReceipt.createdBy === branchUser.username, 'receipt create should derive createdBy from request user');
  const protectedReceiptUpdated = await finance.updateReceipt(protectedReceipt.id, spoofedAudit, branchUser);
  assert(protectedReceiptUpdated.approvalStatus === 'DRAFT' && !protectedReceiptUpdated.approvedBy && !protectedReceiptUpdated.approvedAt && !protectedReceiptUpdated.cancelledBy && !protectedReceiptUpdated.cancelledAt, 'receipt update should not change approval or audit fields');
  const protectedReceiptApproved = await finance.approveReceipt(protectedReceipt.id, { actor: 'client-spoof' }, branchUser);
  assert(protectedReceiptApproved.approvalStatus === 'APPROVED' && protectedReceiptApproved.approvedBy === branchUser.username, 'receipt approve should derive approvedBy from request user');
  const protectedReceiptCancelled = await finance.cancelReceipt(protectedReceipt.id, { actor: 'client-spoof', reason: 'Protected receipt cancel' }, branchUser);
  assert(protectedReceiptCancelled.approvalStatus === 'CANCELLED' && protectedReceiptCancelled.cancelledBy === branchUser.username, 'receipt cancel should derive cancelledBy from request user');

  const protectedPayment = await finance.createPayment({
    ...spoofedAudit,
    voucherCode: run + '-PROTECTED-PAY',
    voucherName: 'Protected Payment',
    voucherType: 'SUPPLIER_PAYMENT',
    paymentMethod: 'CASH',
    supplierId: supplier.id,
    totalAmount: 50,
    paymentAmount: 50,
    tourId: tour.id,
    branch: 'FIN-BR',
    department: 'FIN-DEP',
  }, branchUser);
  assert(protectedPayment.approvalStatus === 'DRAFT' && !protectedPayment.approvedBy && !protectedPayment.approvedAt && !protectedPayment.cancelledBy && !protectedPayment.cancelledAt, 'payment create should ignore client approval and audit fields');
  assert(protectedPayment.createdBy === branchUser.username, 'payment create should derive createdBy from request user');
  const protectedPaymentUpdated = await finance.updatePayment(protectedPayment.id, spoofedAudit, branchUser);
  assert(protectedPaymentUpdated.approvalStatus === 'DRAFT' && !protectedPaymentUpdated.approvedBy && !protectedPaymentUpdated.approvedAt && !protectedPaymentUpdated.cancelledBy && !protectedPaymentUpdated.cancelledAt, 'payment update should not change approval or audit fields');
  const protectedPaymentApproved = await finance.approvePayment(protectedPayment.id, { actor: 'client-spoof' }, branchUser);
  assert(protectedPaymentApproved.approvalStatus === 'APPROVED' && protectedPaymentApproved.approvedBy === branchUser.username, 'payment approve should derive approvedBy from request user');
  const protectedPaymentCancelled = await finance.cancelPayment(protectedPayment.id, { actor: 'client-spoof', reason: 'Protected payment cancel' }, branchUser);
  assert(protectedPaymentCancelled.approvalStatus === 'CANCELLED' && protectedPaymentCancelled.cancelledBy === branchUser.username, 'payment cancel should derive cancelledBy from request user');

  const protectedInvoice = await finance.createInvoice({
    ...spoofedAudit,
    status: 'APPROVED',
    invoiceCode: run + '-PROTECTED-INV',
    customerId: customer.id,
    customerName: customer.fullName,
    invoiceType: 'VAT',
    tourId: tour.id,
    branch: 'FIN-BR',
    department: 'FIN-DEP',
    items: [{ itemName: 'Protected Invoice', quantity: 1, unitPrice: 50, taxRate: 0 }],
  }, branchUser);
  assert(protectedInvoice.status === 'DRAFT' && protectedInvoice.approvalStatus === 'DRAFT' && !protectedInvoice.approvedBy && !protectedInvoice.approvedAt && !protectedInvoice.cancelledBy && !protectedInvoice.cancelledAt, 'invoice create should ignore client status, approval, and audit fields');
  assert(protectedInvoice.createdBy === branchUser.username, 'invoice create should derive createdBy from request user');
  const protectedInvoiceUpdated = await finance.updateInvoice(protectedInvoice.id, { ...spoofedAudit, status: 'APPROVED' }, branchUser);
  assert(protectedInvoiceUpdated.status === 'DRAFT' && protectedInvoiceUpdated.approvalStatus === 'DRAFT' && !protectedInvoiceUpdated.approvedBy && !protectedInvoiceUpdated.approvedAt && !protectedInvoiceUpdated.cancelledBy && !protectedInvoiceUpdated.cancelledAt, 'invoice update should not change status, approval, or audit fields');
  const protectedInvoiceApproved = await finance.approveInvoice(protectedInvoice.id, { actor: 'client-spoof' }, branchUser);
  assert(protectedInvoiceApproved.status === 'APPROVED' && protectedInvoiceApproved.approvalStatus === 'APPROVED' && protectedInvoiceApproved.approvedBy === branchUser.username, 'invoice approve should derive approvedBy from request user');
  const protectedInvoiceCancelled = await finance.cancelInvoice(protectedInvoice.id, { actor: 'client-spoof', reason: 'Protected invoice cancel' }, branchUser);
  assert(protectedInvoiceCancelled.status === 'CANCELLED' && protectedInvoiceCancelled.approvalStatus === 'CANCELLED' && protectedInvoiceCancelled.cancelledBy === branchUser.username, 'invoice cancel should derive cancelledBy from request user');

  await rejectsWithStatus(() => finance.createReceipt({ receiptCode: run + '-BAD-NEG-RCPT', receiptName: 'Negative Receipt', receiptType: 'TOUR_PAYMENT', totalAmount: 100, receiptAmount: -1, tourId: tour.id }), 400, 'receipt create should reject negative money values');
  await rejectsWithStatus(() => finance.createPayment({ voucherCode: run + '-BAD-NEG-PAY', voucherName: 'Negative Payment', voucherType: 'INTERNAL_EXPENSE', totalAmount: 100, paymentAmount: -1 }), 400, 'payment create should reject negative money values');
  await rejectsWithStatus(() => finance.createInvoice({ invoiceCode: run + '-BAD-NEG-INV', customerId: customer.id, invoiceType: 'VAT', tourId: tour.id, items: [{ itemName: 'Negative invoice item', quantity: 1, unitPrice: -1, taxRate: 0 }] }), 400, 'invoice create should reject negative item values');
  await rejectsWithStatus(() => finance.createInvoice({ invoiceCode: run + '-BAD-ZERO-QTY-INV', customerId: customer.id, invoiceType: 'VAT', tourId: tour.id, items: [{ itemName: 'Zero quantity invoice item', quantity: 0, unitPrice: 100, taxRate: 0 }] }), 400, 'invoice create should reject zero item quantity instead of defaulting it to one');
  await rejectsWithStatus(() => finance.createReceipt({ receiptCode: run + '-BAD-NAN-RCPT', receiptName: 'Invalid Receipt', receiptType: 'TOUR_PAYMENT', totalAmount: 'abc', receiptAmount: 1, tourId: tour.id }), 400, 'receipt create should reject non-numeric money values');
  await rejectsWithStatus(() => finance.createReceipt({ receiptCode: run + '-BAD-TYPE-RCPT', receiptName: 'Bad Type Receipt', receiptType: 'BAD_TYPE', totalAmount: 100, receiptAmount: 1, tourId: tour.id }), 400, 'receipt create should reject invalid receipt type');
  await rejectsWithStatus(() => finance.createPayment({ voucherCode: run + '-BAD-METHOD-PAY', voucherName: 'Bad Method Payment', voucherType: 'INTERNAL_EXPENSE', paymentMethod: 'WIRE', totalAmount: 100, paymentAmount: 1 }), 400, 'payment create should reject invalid payment method');
  await rejectsWithStatus(() => finance.createInvoice({ invoiceCode: run + '-BAD-DATE-INV', customerId: customer.id, invoiceType: 'VAT', issuedDate: 'bad-date', tourId: tour.id, items: [{ itemName: 'Bad date invoice', quantity: 1, unitPrice: 1, taxRate: 0 }] }), 400, 'invoice create should reject invalid dates');
  await rejectsWithStatus(() => finance.createReceipt({ receiptCode: run + '-BAD-ALLOC-RCPT', receiptName: 'Bad Allocation Receipt', receiptType: 'TOUR_PAYMENT', totalAmount: 1000, receiptAmount: 100, tourId: tour.id, orders: [{ orderId: order.id, orderCode: order.systemCode, tourCode: order.tourCode, tourName: order.name, amount: 1000 }] }), 400, 'receipt create should reject order allocation that differs from receipt amount');
  await rejectsWithStatus(() => finance.createReceipt({ receiptCode: run + '-BAD-TOTAL-RCPT', receiptName: 'Bad Total Receipt', receiptType: 'TOUR_PAYMENT', totalAmount: 100, paidBefore: 80, receiptAmount: 30, tourId: tour.id }), 400, 'receipt create should reject total below paidBefore plus receipt amount');
  await rejectsWithStatus(() => finance.createPayment({ voucherCode: run + '-BAD-TOTAL-PAY', voucherName: 'Bad Total Payment', voucherType: 'INTERNAL_EXPENSE', totalAmount: 100, paymentAmount: 120 }), 400, 'payment create should reject total below payment amount');

  const draftReceipt = await finance.createReceipt({
    receiptCode: run + '-CRUD-RCPT',
    receiptName: 'Receipt CRUD',
    receiptType: 'TOUR_PAYMENT',
    paymentMethod: 'CASH',
    paymentDate: '2026-10-01',
    customerId: customer.id,
    totalAmount: 500,
    paidBefore: 100,
    receiptAmount: 200,
    tourId: tour.id,
    branch: 'FIN-BR',
    department: 'FIN-DEP',
  });
  const updatedReceipt = await finance.updateReceipt(draftReceipt.id, { receiptName: 'Receipt CRUD Updated', totalAmount: 500, paidBefore: 150, receiptAmount: 250, branch: 'FIN-BR', department: 'FIN-DEP' });
  assert(updatedReceipt.receiptName === 'Receipt CRUD Updated' && amount(updatedReceipt.remainingAmount) === 100, 'receipt update should persist fields and recalculate remaining amount');
  const partialReceipt = await finance.updateReceipt(draftReceipt.id, { note: 'Receipt partial note' });
  assert(partialReceipt.note === 'Receipt partial note' && amount(partialReceipt.receiptAmount) === 250 && amount(partialReceipt.remainingAmount) === 100 && partialReceipt.paymentDate.toISOString().slice(0, 10) === '2026-10-01', 'receipt partial update should not reset amount or dates');
  const receiptUpload = await finance.uploadReceiptFile(draftReceipt.id, uploadFile('receipt.txt'), 'finance-test');
  assert(receiptUpload.attachmentName === 'receipt.txt' && receiptUpload.attachmentUrl.includes('/finance/receipts/'), 'receipt upload should attach file metadata');
  const receiptFileDeleted = await finance.deleteReceiptFile(draftReceipt.id);
  assert(!receiptFileDeleted.attachmentName && !receiptFileDeleted.attachmentUrl && fileStore.removed.some((key) => key.includes('receipt.txt')), 'receipt delete file should clear metadata and remove object');
  const receiptDetailScoped = await finance.receiptDetail(draftReceipt.id, branchUser);
  assert(receiptDetailScoped.id === draftReceipt.id, 'receipt detail should be visible in branch scope');
  await rejects(() => finance.receiptDetail(draftReceipt.id, outOfScopeUser), 'receipt detail should be hidden outside branch scope');
  const deletedReceipt = await finance.deleteReceipt(draftReceipt.id);
  assert(deletedReceipt.deletedAt, 'receipt delete should soft delete draft');

  const draftPayment = await finance.createPayment({
    voucherCode: run + '-CRUD-PAY',
    voucherName: 'Payment CRUD',
    voucherType: 'SUPPLIER_PAYMENT',
    paymentMethod: 'CASH',
    paymentDate: '2026-10-02',
    supplierId: supplier.id,
    totalAmount: 700,
    paymentAmount: 300,
    tourId: tour.id,
    branch: 'FIN-BR',
    department: 'FIN-DEP',
  });
  const updatedPayment = await finance.updatePayment(draftPayment.id, { voucherName: 'Payment CRUD Updated', totalAmount: 700, paymentAmount: 450, branch: 'FIN-BR', department: 'FIN-DEP' });
  assert(updatedPayment.voucherName === 'Payment CRUD Updated' && amount(updatedPayment.remainingAmount) === 250, 'payment update should persist fields and recalculate remaining amount');
  const partialPayment = await finance.updatePayment(draftPayment.id, { note: 'Payment partial note' });
  assert(partialPayment.note === 'Payment partial note' && amount(partialPayment.paymentAmount) === 450 && amount(partialPayment.remainingAmount) === 250 && partialPayment.paymentDate.toISOString().slice(0, 10) === '2026-10-02', 'payment partial update should not reset amount or dates');
  const paymentUpload = await finance.uploadPaymentFile(draftPayment.id, uploadFile('payment.txt'), 'finance-test');
  assert(paymentUpload.attachmentName === 'payment.txt' && paymentUpload.attachmentUrl.includes('/finance/payments/'), 'payment upload should attach file metadata');
  const paymentFileDeleted = await finance.deletePaymentFile(draftPayment.id);
  assert(!paymentFileDeleted.attachmentName && !paymentFileDeleted.attachmentUrl && fileStore.removed.some((key) => key.includes('payment.txt')), 'payment delete file should clear metadata and remove object');
  const paymentDetailScoped = await finance.paymentDetail(draftPayment.id, branchUser);
  assert(paymentDetailScoped.id === draftPayment.id, 'payment detail should be visible in branch scope');
  await rejects(() => finance.paymentDetail(draftPayment.id, outOfScopeUser), 'payment detail should be hidden outside branch scope');
  const deletedPayment = await finance.deletePayment(draftPayment.id);
  assert(deletedPayment.deletedAt, 'payment delete should soft delete draft');

  const draftInvoice = await finance.createInvoice({
    invoiceCode: run + '-CRUD-INV',
    customerId: customer.id,
    customerName: customer.fullName,
    invoiceType: 'VAT',
    issuedDate: '2026-10-03',
    tourId: tour.id,
    branch: 'FIN-BR',
    department: 'FIN-DEP',
    items: [{ itemName: 'Invoice CRUD', unit: 'pax', quantity: 1, unitPrice: 100, taxRate: 10 }],
  });
  const updatedInvoice = await finance.updateInvoice(draftInvoice.id, { customerName: customer.fullName, invoiceType: 'VAT', branch: 'FIN-BR', department: 'FIN-DEP', items: [{ itemName: 'Invoice CRUD Updated', unit: 'pax', quantity: 2, unitPrice: 100, taxRate: 8 }] });
  assert(amount(updatedInvoice.totalBeforeTax) === 200 && amount(updatedInvoice.totalTax) === 16 && amount(updatedInvoice.totalAfterTax) === 216, 'invoice update should recalculate item totals');
  const partialInvoice = await finance.updateInvoice(draftInvoice.id, { note: 'Invoice partial note' });
  assert(partialInvoice.note === 'Invoice partial note' && partialInvoice.items.length === 1 && amount(partialInvoice.totalAfterTax) === 216 && partialInvoice.issuedDate.toISOString().slice(0, 10) === '2026-10-03', 'invoice partial update should not reset items, totals, or dates');
  const invoiceFile = await finance.uploadInvoiceFile(draftInvoice.id, uploadFile('invoice.txt'), 'finance-test');
  assert(invoiceFile.fileName === 'invoice.txt' && invoiceFile.fileUrl.includes('/finance/invoices/'), 'invoice upload should create invoice file row');
  const invoiceFileDeleted = await finance.deleteInvoiceFile(draftInvoice.id, invoiceFile.id);
  assert(invoiceFileDeleted.fileName === 'invoice.txt' && fileStore.removed.some((key) => key.includes('invoice.txt')), 'invoice delete file should remove invoice file row and object');
  const invoiceDetailScoped = await finance.invoiceDetail(draftInvoice.id, branchUser);
  assert(invoiceDetailScoped.id === draftInvoice.id, 'invoice detail should be visible in branch scope');
  await rejects(() => finance.invoiceDetail(draftInvoice.id, outOfScopeUser), 'invoice detail should be hidden outside branch scope');
  const deletedInvoice = await finance.deleteInvoice(draftInvoice.id);
  assert(deletedInvoice.deletedAt, 'invoice delete should soft delete draft');

  const dateFilterReceipt = await finance.createReceipt({
    receiptCode: run + '-DATE-RCPT',
    receiptName: 'Date Filter Receipt',
    receiptType: 'TOUR_PAYMENT',
    paymentMethod: 'CASH',
    paymentDate: '2026-10-04T15:30:00.000Z',
    customerId: customer.id,
    totalAmount: 100,
    receiptAmount: 100,
    tourId: tour.id,
    branch: 'FIN-BR',
    department: 'FIN-DEP',
  });
  const dateFilterPayment = await finance.createPayment({
    voucherCode: run + '-DATE-PAY',
    voucherName: 'Date Filter Payment',
    voucherType: 'SUPPLIER_PAYMENT',
    paymentMethod: 'CASH',
    paymentDate: '2026-10-04T15:30:00.000Z',
    supplierId: supplier.id,
    totalAmount: 80,
    paymentAmount: 80,
    tourId: tour.id,
    branch: 'FIN-BR',
    department: 'FIN-DEP',
  });
  const dateFilterInvoice = await finance.createInvoice({
    invoiceCode: run + '-DATE-INV',
    customerId: customer.id,
    customerName: customer.fullName,
    invoiceType: 'VAT',
    issuedDate: '2026-10-04T15:30:00.000Z',
    tourId: tour.id,
    branch: 'FIN-BR',
    department: 'FIN-DEP',
    items: [{ itemName: 'Date Filter Invoice', quantity: 1, unitPrice: 100, taxRate: 0 }],
  });
  const dateFilterReceipts = await finance.listReceipts({ search: run + '-DATE-RCPT', from: '2026-10-04', to: '2026-10-04', take: '1000' });
  const dateFilterPayments = await finance.listPayments({ search: run + '-DATE-PAY', from: '2026-10-04', to: '2026-10-04', take: '1000' });
  const dateFilterInvoices = await finance.listInvoices({ search: run + '-DATE-INV', from: '2026-10-04', to: '2026-10-04', take: '1000' });
  assert(dateFilterReceipts.rows.some((row) => row.id === dateFilterReceipt.id), 'receipt date filter should include records throughout the to date');
  assert(dateFilterPayments.rows.some((row) => row.id === dateFilterPayment.id), 'payment date filter should include records throughout the to date');
  assert(dateFilterInvoices.rows.some((row) => row.id === dateFilterInvoice.id), 'invoice date filter should include records throughout the to date');
  await rejectsWithStatus(() => finance.listReceipts({ from: 'bad-date' }), 400, 'receipt list should reject invalid from date');
  await rejectsWithStatus(() => finance.listPayments({ to: 'bad-date' }), 400, 'payment list should reject invalid to date');
  await rejectsWithStatus(() => finance.listInvoices({ take: '0' }), 400, 'invoice list should reject non-positive take');

  await rejects(() => finance.createReceipt({
    receiptCode: run + '-BAD-RCPT-LINK',
    receiptName: 'Bad Receipt Link',
    receiptType: 'TOUR_PAYMENT',
    paymentMethod: 'BANK_TRANSFER',
    customerId: customer.id,
    totalAmount: 300,
    receiptAmount: 300,
    orders: [{ orderId: otherOrder.id, amount: 300 }],
  }), 'receipt should reject mismatched customer/order links');
  await rejects(() => finance.createPayment({
    voucherCode: run + '-BAD-PAY-LINK',
    voucherName: 'Bad Payment Link',
    voucherType: 'SUPPLIER_PAYMENT',
    paymentMethod: 'BANK_TRANSFER',
    supplierId: otherSupplier.id,
    operationVoucherId: voucher.id,
    totalAmount: 100,
    paymentAmount: 100,
  }), 'payment should reject mismatched supplier/voucher links');
  await rejects(() => finance.createInvoice({
    invoiceCode: run + '-BAD-INV-LINK',
    customerId: customer.id,
    orderId: otherOrder.id,
    customerName: customer.fullName,
    invoiceType: 'VAT',
    items: [{ itemName: 'Bad invoice link', quantity: 1, unitPrice: 100, taxRate: 10 }],
  }), 'invoice should reject mismatched customer/order links');
  await rejects(() => finance.createReceipt({ receiptCode: run + '-NO-TOUR-RCPT', receiptName: 'No Tour Receipt', receiptType: 'TOUR_PAYMENT', receiptAmount: 1 }), 'receipt should require a tour link');
  for (const companyExpenseType of ['INTERNAL_EXPENSE', 'OTHER']) {
    const companyExpensePayment = await finance.createPayment({
      voucherCode: run + '-' + companyExpenseType,
      voucherName: 'Company Expense ' + companyExpenseType,
      voucherType: companyExpenseType,
      paymentMethod: 'CASH',
      totalAmount: 120,
      paymentAmount: 120,
      reason: 'Company expense not linked to a tour',
      branch: 'FIN-BR',
      department: 'FIN-DEP',
    }, branchUser);
    assert(!companyExpensePayment.tourId && !companyExpensePayment.orderId && !companyExpensePayment.operationVoucherId, companyExpenseType + ' payment should be allowed without tour/order/voucher links');
    const approvedCompanyExpensePayment = await finance.approvePayment(companyExpensePayment.id, { actor: 'client-spoof' }, branchUser);
    assert(approvedCompanyExpensePayment.approvalStatus === 'APPROVED' && approvedCompanyExpensePayment.approvedBy === branchUser.username, companyExpenseType + ' payment should approve without a tour link');
    assert(await prisma.financeCashflowEntry.count({ where: { sourceType: 'PAYMENT', sourceId: companyExpensePayment.id, tourId: null, supplierId: null } }) === 1, companyExpenseType + ' payment should create company cashflow without tour or supplier ledger link');
    assert(await prisma.supplierLedgerEntry.count({ where: { sourceType: 'FINANCE_PAYMENT', sourceId: companyExpensePayment.id } }) === 0, companyExpenseType + ' payment should not create supplier ledger when no supplier is linked');
    const cancelledCompanyExpensePayment = await finance.cancelPayment(companyExpensePayment.id, { actor: 'client-spoof', reason: 'cancel company expense test' }, branchUser);
    assert(cancelledCompanyExpensePayment.approvalStatus === 'CANCELLED' && cancelledCompanyExpensePayment.reversals.length === 1, companyExpenseType + ' payment should cancel with reversal without a tour link');
    assert(await cashflowNet(prisma, { paymentId: { in: [companyExpensePayment.id, cancelledCompanyExpensePayment.reversals[0].id] } }) === 0, companyExpenseType + ' payment cashflow should net to zero after cancellation');
  }
  await rejects(() => finance.createPayment({ voucherCode: run + '-NO-TOUR-PAY', voucherName: 'No Tour Supplier Payment', voucherType: 'SUPPLIER_PAYMENT', paymentAmount: 1 }), 'supplier payment should require a tour link');
  await rejects(() => finance.createInvoice({ invoiceCode: run + '-NO-TOUR-INV', invoiceType: 'VAT', items: [{ itemName: 'No tour invoice', quantity: 1, unitPrice: 1 }] }), 'invoice should require a tour link');

  const receiptByTourCode = await finance.createReceipt({ receiptCode: run + '-TOURCODE-RCPT', receiptName: 'Receipt by tour code', receiptType: 'TOUR_PAYMENT', paymentMethod: 'CASH', totalAmount: 40, receiptAmount: 40, tourCode: tour.tourCode, orders: [{ tourCode: tour.tourCode, tourName: tour.name, amount: 40 }] });
  assert(receiptByTourCode.tourId === tour.id, 'receipt create should resolve tourCode to a tour link');
  await rejects(() => finance.createPayment({ voucherCode: run + '-SUPPLIER-NO-PARTY', voucherName: 'Supplier payment without supplier', voucherType: 'SUPPLIER_PAYMENT', paymentMethod: 'CASH', totalAmount: 30, paymentAmount: 30, tourCode: tour.tourCode }), 'supplier payment should require a supplier or operation voucher link');
  const orphanSupplierPayment = await prisma.financePayment.create({ data: { voucherCode: run + '-SUPPLIER-ORPHAN-DRAFT', voucherName: 'Legacy supplier payment without party', voucherType: 'SUPPLIER_PAYMENT', paymentMethod: 'CASH', totalAmount: 30, paymentAmount: 30, tourId: tour.id, approvalStatus: 'DRAFT' } });
  await rejectsWithMessage(() => finance.approvePayment(orphanSupplierPayment.id, {}), 'li\u00ean k\u1ebft nh\u00e0 cung c\u1ea5p ho\u1eb7c phi\u1ebfu \u0111i\u1ec1u h\u00e0nh', 'supplier payment approve should require a supplier or operation voucher link');
  const paymentByTourCode = await finance.createPayment({ voucherCode: run + '-TOURCODE-PAY', voucherName: 'Payment by tour code', voucherType: 'SUPPLIER_PAYMENT', paymentMethod: 'CASH', supplierId: supplier.id, totalAmount: 30, paymentAmount: 30, tourCode: tour.tourCode });
  assert(paymentByTourCode.tourId === tour.id && paymentByTourCode.supplierId === supplier.id, 'payment create should resolve tourCode to a tour link while preserving supplier link');
  const invoiceByTourCode = await finance.createInvoice({ invoiceCode: run + '-TOURCODE-INV', customerId: customer.id, customerName: customer.fullName, invoiceType: 'VAT', tourCode: tour.tourCode, items: [{ itemName: 'Invoice by tour code', quantity: 1, unitPrice: 20, taxRate: 0 }] });
  assert(invoiceByTourCode.tourId === tour.id, 'invoice create should resolve tourCode to a tour link');

  await rejects(() => finance.createReceipt({
    receiptCode: run + '-SCOPE-RCPT', receiptName: 'Out of scope receipt', receiptType: 'TOUR_PAYMENT',
    customerId: customer.id, receiptAmount: 1, totalAmount: 1, tourId: tour.id,
  }, outOfScopeUser), 'receipt create should reject customer/tour links outside data scope');
  await rejects(() => finance.createPayment({
    voucherCode: run + '-SCOPE-PAY', voucherName: 'Out of scope payment', voucherType: 'SUPPLIER_PAYMENT',
    supplierId: supplier.id, orderId: order.id, paymentAmount: 1, totalAmount: 1, tourId: tour.id,
  }, outOfScopeUser), 'payment create should reject order/tour links outside data scope');
  await rejects(() => finance.createInvoice({
    invoiceCode: run + '-SCOPE-INV', customerId: customer.id, tourId: tour.id, invoiceType: 'VAT',
    items: [{ itemName: 'Out of scope invoice', quantity: 1, unitPrice: 1 }],
  }, outOfScopeUser), 'invoice create should reject customer/tour links outside data scope');

  const zeroReceipt = await finance.createReceipt({ receiptCode: run + '-ZERO-RCPT', receiptName: 'Zero receipt', receiptType: 'TOUR_PAYMENT', totalAmount: 0, receiptAmount: 0, tourId: tour.id });
  await rejects(() => finance.approveReceipt(zeroReceipt.id, { actor: 'finance-test' }), 'zero receipt should not create cashflow or ledger postings');
  await finance.deleteReceipt(zeroReceipt.id);
  const zeroPayment = await finance.createPayment({ voucherCode: run + '-ZERO-PAY', voucherName: 'Zero payment', voucherType: 'INTERNAL_EXPENSE', totalAmount: 0, paymentAmount: 0, tourId: tour.id });
  await rejects(() => finance.approvePayment(zeroPayment.id, { actor: 'finance-test' }), 'zero payment should not create cashflow or ledger postings');
  await finance.deletePayment(zeroPayment.id);
  const zeroInvoice = await finance.createInvoice({ invoiceCode: run + '-ZERO-INV', customerId: customer.id, invoiceType: 'VAT', tourId: tour.id, items: [{ itemName: 'Zero invoice', quantity: 1, unitPrice: 0 }] });
  await rejects(() => finance.approveInvoice(zeroInvoice.id, { actor: 'finance-test' }), 'zero invoice should not create customer ledger postings');
  await finance.deleteInvoice(zeroInvoice.id);

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
  assert(amount(receipt.totalAmount) === 1000 && amount(receipt.paidBefore) === 0 && amount(receipt.receiptAmount) === 1000 && amount(receipt.remainingAmount) === 0, 'receipt create should calculate remaining amount');
  const approvedReceipt = await finance.approveReceipt(receipt.id, { actor: 'finance-test' });
  assert(approvedReceipt.approvalStatus === 'APPROVED', 'receipt should approve');
  const branchReceiptList = await finance.listReceipts({ search: run, take: '1000' }, branchUser);
  const outReceiptList = await finance.listReceipts({ search: run, take: '1000' }, outOfScopeUser);
  assert(branchReceiptList.rows.some((row) => row.id === receipt.id), 'receipt list should include branch scoped rows');
  assert(!outReceiptList.rows.some((row) => row.id === receipt.id), 'receipt list should exclude out-of-scope rows');
  const branchReceiptExport = await finance.exportReceipts({ search: run }, branchUser);
  const outReceiptExport = await finance.exportReceipts({ search: run }, outOfScopeUser);
  assert(branchReceiptExport.includes(receipt.receiptCode), 'receipt export should include branch scoped rows');
  assert(!outReceiptExport.includes(receipt.receiptCode), 'receipt export should exclude out-of-scope rows');
  assert(await prisma.financeCashflowEntry.count({ where: { sourceType: 'RECEIPT', sourceId: receipt.id } }) === 1, 'receipt approve should create cashflow');
  assert(await prisma.customerLedgerEntry.count({ where: { sourceType: 'FINANCE_RECEIPT', sourceId: receipt.id, entryType: 'CREDIT' } }) === 1, 'receipt approve should create customer ledger');
  assert(await sum(prisma, 'financeCashflowEntry', { sourceType: 'RECEIPT', sourceId: receipt.id, entryType: 'RECEIPT' }, 'amount') === 1000, 'receipt cashflow amount should match receipt amount');
  assert(await sum(prisma, 'customerLedgerEntry', { sourceType: 'FINANCE_RECEIPT', sourceId: receipt.id, entryType: 'CREDIT' }, 'creditAmount') === 1000, 'receipt customer ledger credit should match receipt amount');
  let orderAfter = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  assert(amount(orderAfter.paidAmount) === 1000 && amount(orderAfter.remainingRevenue) === 0 && orderAfter.paymentStatus === 'PAID', 'receipt approve should reconcile order revenue');
  await rejects(() => finance.approveReceipt(receipt.id, { actor: 'finance-test' }), 'double approve receipt should be rejected as a final-state transition');
  await rejects(() => finance.rejectReceipt(receipt.id, { actor: 'finance-test', note: 'reject approved receipt' }), 'approved receipt should not be rejected');
  await rejects(() => finance.updateReceipt(receipt.id, { receiptAmount: 900 }), 'approved receipt amount should not be editable');
  await rejects(() => finance.updateReceipt(receipt.id, { note: 'edited after approval' }), 'approved receipt should not be editable after posting');
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
  let customerDebtReport = await finance.customerDebt({ customerId: customer.id, take: '1000' });
  assert(customerDebtReport.summary.balance === 0 && !customerDebtReport.rows.find((row) => row.id === customer.id), 'receipt cancel should net customer debt report back to zero');
  await rejects(() => finance.cancelReceipt(receipt.id, { actor: 'finance-test', reason: 'again' }), 'double cancel receipt should be rejected as a final-state transition');

  const rollbackReceipt = await finance.createReceipt({
    receiptCode: run + '-RCPT-ROLLBACK',
    receiptName: 'Receipt rollback guard',
    receiptType: 'TOUR_PAYMENT',
    paymentMethod: 'BANK_TRANSFER',
    customerId: customer.id,
    totalAmount: 40,
    receiptAmount: 40,
    tourId: tour.id,
    branch: 'FIN-BR',
    department: 'FIN-DEP',
    orders: [{ orderId: order.id, orderCode: order.systemCode, tourCode: order.tourCode, tourName: order.name, amount: 40 }],
  });
  await finance.approveReceipt(rollbackReceipt.id, { actor: 'finance-test' });
  await prisma.customerLedgerEntry.deleteMany({ where: { sourceType: 'FINANCE_RECEIPT', sourceId: rollbackReceipt.id } });
  await rejects(() => finance.cancelReceipt(rollbackReceipt.id, { actor: 'finance-test', reason: 'missing receipt ledger' }), 'receipt cancel should roll back when original ledger is missing');
  const rollbackReceiptAfter = await prisma.financeReceipt.findUniqueOrThrow({ where: { id: rollbackReceipt.id } });
  assert(rollbackReceiptAfter.approvalStatus === 'APPROVED' && !rollbackReceiptAfter.cancelledAt, 'failed receipt cancel should preserve approved status');
  assert(await prisma.financeReceipt.count({ where: { reversalOfId: rollbackReceipt.id } }) === 0, 'failed receipt cancel should not leave a reversal document');
  assert(await prisma.financeCashflowEntry.count({ where: { sourceType: 'RECEIPT_REVERSAL', receipt: { reversalOfId: rollbackReceipt.id } } }) === 0, 'failed receipt cancel should not leave reversal cashflow');
  assert(await prisma.customerLedgerEntry.count({ where: { entryType: 'REVERSAL', receipt: { reversalOfId: rollbackReceipt.id } } }) === 0, 'failed receipt cancel should not leave reversal customer ledger');
  await prisma.customerLedgerEntry.create({
    data: {
      customerId: customer.id,
      receiptId: rollbackReceipt.id,
      orderId: order.id,
      tourId: tour.id,
      sourceType: 'FINANCE_RECEIPT',
      sourceId: rollbackReceipt.id,
      entryType: 'CREDIT',
      creditAmount: 40,
      documentCode: rollbackReceipt.receiptCode,
      documentDate: new Date(),
      branch: 'FIN-BR',
      department: 'FIN-DEP',
      createdBy: 'finance-test',
    },
  });
  await finance.cancelReceipt(rollbackReceipt.id, { actor: 'finance-test', reason: 'cleanup receipt rollback guard' });

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
    tourId: tour.id,
    branch: 'FIN-BR',
    department: 'FIN-DEP',
  });
  const rejectedReceipt = await finance.rejectReceipt(rejectedReceiptDraft.id, { actor: 'finance-test', note: 'reject receipt' });
  assert(rejectedReceipt.approvalStatus === 'REJECTED', 'receipt should reject');
  assert(rejectedReceipt.rejectedBy === 'system' && rejectedReceipt.rejectedAt instanceof Date && !rejectedReceipt.approvedBy && !rejectedReceipt.approvedAt, 'receipt reject should write reject audit fields only');
  await rejects(() => finance.approveReceipt(rejectedReceiptDraft.id, { actor: 'finance-test' }), 'rejected receipt should not approve');
  await rejects(() => finance.rejectReceipt(rejectedReceiptDraft.id, { actor: 'finance-test' }), 'rejected receipt should not reject again');
  await rejects(() => finance.deleteReceipt(rejectedReceiptDraft.id), 'rejected receipt should not be deleted');

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
  assert(amount(payment.totalAmount) === 1000 && amount(payment.paymentAmount) === 600 && amount(payment.remainingAmount) === 400, 'payment create should calculate remaining amount');
  const approvedPayment = await finance.approvePayment(payment.id, { actor: 'finance-test' });
  assert(approvedPayment.approvalStatus === 'APPROVED', 'payment should approve');
  const branchPaymentList = await finance.listPayments({ search: run, take: '1000' }, branchUser);
  const outPaymentList = await finance.listPayments({ search: run, take: '1000' }, outOfScopeUser);
  assert(branchPaymentList.rows.some((row) => row.id === payment.id), 'payment list should include branch scoped rows');
  assert(!outPaymentList.rows.some((row) => row.id === payment.id), 'payment list should exclude out-of-scope rows');
  const branchPaymentExport = await finance.exportPayments({ search: run }, branchUser);
  const outPaymentExport = await finance.exportPayments({ search: run }, outOfScopeUser);
  assert(branchPaymentExport.includes(payment.voucherCode), 'payment export should include branch scoped rows');
  assert(!outPaymentExport.includes(payment.voucherCode), 'payment export should exclude out-of-scope rows');
  let voucherAfter = await prisma.operationVoucher.findUniqueOrThrow({ where: { id: voucher.id } });
  assert(amount(voucherAfter.paidAmount) === 600 && amount(voucherAfter.remainAmount) === 400 && voucherAfter.status === 'PARTIAL', 'payment approve should reconcile voucher');
  assert(await prisma.supplierLedgerEntry.count({ where: { sourceType: 'FINANCE_PAYMENT', sourceId: payment.id, entryType: 'DEBIT' } }) === 1, 'payment approve should create supplier ledger');
  assert(await sum(prisma, 'financeCashflowEntry', { sourceType: 'PAYMENT', sourceId: payment.id, entryType: 'PAYMENT' }, 'amount') === 600, 'payment cashflow amount should match payment amount');
  assert(await sum(prisma, 'supplierLedgerEntry', { sourceType: 'FINANCE_PAYMENT', sourceId: payment.id, entryType: 'DEBIT' }, 'debitAmount') === 600, 'payment supplier ledger debit should match payment amount');
  orderAfter = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  assert(amount(orderAfter.paidCost) === 600 && amount(orderAfter.remainingCost) === 100 && orderAfter.costStatus === 'PARTIAL', 'payment approve should reconcile order cost');
  await rejects(() => finance.approvePayment(payment.id, { actor: 'finance-test' }), 'double approve payment should be rejected as a final-state transition');
  await rejects(() => finance.rejectPayment(payment.id, { actor: 'finance-test', note: 'reject approved payment' }), 'approved payment should not be rejected');
  await rejects(() => finance.updatePayment(payment.id, { paymentAmount: 500 }), 'approved payment amount should not be editable');
  await rejects(() => finance.updatePayment(payment.id, { note: 'edited after approval' }), 'approved payment should not be editable after posting');
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
  const supplierDebtAfterPaymentCancel = await finance.supplierDebt({ supplierId: supplier.id, take: '1000' });
  assert(supplierDebtAfterPaymentCancel.summary.balance === 0 && !supplierDebtAfterPaymentCancel.rows.find((row) => row.id === supplier.id), 'payment cancel should net supplier debt report back to zero');
  const cashflowAfterCancels = await finance.cashflow({ take: '1000' });
  assert(cashflowAfterCancels.summary.netCashflow === 0 && cashflowAfterCancels.summary.totalReceipt === cashflowAfterCancels.summary.totalPayment, 'receipt/payment cancel should net cashflow summary to zero');
  const branchCashflow = await finance.cashflow({ take: '1000' }, branchUser);
  const outCashflow = await finance.cashflow({ take: '1000' }, outOfScopeUser);
  assert(branchCashflow.rows.some((row) => row.sourceId === receipt.id || row.sourceId === payment.id), 'cashflow list should include branch scoped rows');
  assert(!outCashflow.rows.some((row) => row.sourceId === receipt.id || row.sourceId === payment.id), 'cashflow list should exclude out-of-scope rows');
  const paginationBranch = run + '-PAGE-BR';
  await prisma.financeCashflowEntry.createMany({
    data: [
      { sourceType: 'PAGINATION_RECEIPT_1', sourceId: run + '-CF-1', entryType: 'RECEIPT', amount: 100, paymentMethod: 'CASH', paymentDate: new Date('2026-11-09'), branch: paginationBranch, department: 'FIN-PAGE' },
      { sourceType: 'PAGINATION_RECEIPT_2', sourceId: run + '-CF-2', entryType: 'RECEIPT', amount: 50, paymentMethod: 'BANK_TRANSFER', paymentDate: new Date('2026-11-08'), branch: paginationBranch, department: 'FIN-PAGE' },
      { sourceType: 'PAGINATION_PAYMENT_1', sourceId: run + '-CF-3', entryType: 'PAYMENT', amount: 25, paymentMethod: 'CASH', paymentDate: new Date('2026-11-07'), branch: paginationBranch, department: 'FIN-PAGE' },
    ],
  });
  const pagedCashflow = await finance.cashflow({ branch: paginationBranch, take: '1' });
  assert(pagedCashflow.rows.length === 1, 'cashflow pagination guard should limit returned rows');
  assert(pagedCashflow.summary.totalReceipt === 150 && pagedCashflow.summary.totalPayment === 25 && pagedCashflow.summary.netCashflow === 125, 'cashflow summary should include all matching rows regardless of take');
  await rejects(() => finance.cancelPayment(payment.id, { actor: 'finance-test', reason: 'again' }), 'double cancel payment should be rejected as a final-state transition');

  const rollbackPayment = await finance.createPayment({
    voucherCode: run + '-PAY-ROLLBACK',
    voucherName: 'Payment rollback guard',
    voucherType: 'SUPPLIER_PAYMENT',
    supplierId: supplier.id,
    operationVoucherId: voucher.id,
    orderId: order.id,
    totalAmount: 50,
    paymentAmount: 50,
    tourId: tour.id,
    branch: 'FIN-BR',
    department: 'FIN-DEP',
  });
  await finance.approvePayment(rollbackPayment.id, { actor: 'finance-test' });
  await prisma.operationVoucherPayment.deleteMany({ where: { paymentVoucherId: rollbackPayment.id } });
  await rejects(() => finance.cancelPayment(rollbackPayment.id, { actor: 'finance-test', reason: 'missing reconcile row' }), 'payment cancel should roll back when reconciliation data is missing');
  const rollbackPaymentAfter = await prisma.financePayment.findUniqueOrThrow({ where: { id: rollbackPayment.id } });
  assert(rollbackPaymentAfter.approvalStatus === 'APPROVED' && !rollbackPaymentAfter.cancelledAt, 'failed payment cancel should preserve approved status');
  assert(await prisma.financePayment.count({ where: { reversalOfId: rollbackPayment.id } }) === 0, 'failed payment cancel should not leave a reversal document');
  assert(await prisma.financeCashflowEntry.count({ where: { sourceType: 'PAYMENT_REVERSAL', paymentId: { not: null }, payment: { reversalOfId: rollbackPayment.id } } }) === 0, 'failed payment cancel should not leave reversal cashflow');
  assert(await prisma.supplierLedgerEntry.count({ where: { entryType: 'REVERSAL', payment: { reversalOfId: rollbackPayment.id } } }) === 0, 'failed payment cancel should not leave reversal supplier ledger');

  await prisma.operationVoucherPayment.create({
    data: { voucherId: voucher.id, paymentVoucherId: rollbackPayment.id, paidAmount: 50, paymentDate: new Date(), note: 'Restore rollback test reconciliation' },
  });
  await finance.cancelPayment(rollbackPayment.id, { actor: 'finance-test', reason: 'cleanup rollback guard' });

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
    tourId: tour.id,
    branch: 'FIN-BR',
    department: 'FIN-DEP',
  });
  const rejectedPayment = await finance.rejectPayment(rejectedPaymentDraft.id, { actor: 'finance-test', note: 'reject payment' });
  assert(rejectedPayment.approvalStatus === 'REJECTED', 'payment should reject');
  assert(rejectedPayment.rejectedBy === 'system' && rejectedPayment.rejectedAt instanceof Date && !rejectedPayment.approvedBy && !rejectedPayment.approvedAt, 'payment reject should write reject audit fields only');
  await rejects(() => finance.approvePayment(rejectedPaymentDraft.id, { actor: 'finance-test' }), 'rejected payment should not approve');
  await rejects(() => finance.rejectPayment(rejectedPaymentDraft.id, { actor: 'finance-test' }), 'rejected payment should not reject again');
  await rejects(() => finance.deletePayment(rejectedPaymentDraft.id), 'rejected payment should not be deleted');

  const invoice = await finance.createInvoice({
    invoiceCode: run + '-INV',
    systemCode: run + '-SYS',
    customerId: customer.id,
    customerName: customer.fullName,
    customerPhone: customer.phone,
    invoiceType: 'VAT',
    issuedDate: '2026-11-04',
    tourId: tour.id,
    items: [{ itemName: 'Tour service', unit: 'pax', quantity: 2, unitPrice: 500, taxRate: 10 }],
  });
  const approvedInvoice = await finance.approveInvoice(invoice.id, { actor: 'finance-test' });
  assert(approvedInvoice.approvalStatus === 'APPROVED', 'invoice should approve');
  const branchInvoiceList = await finance.listInvoices({ search: run, take: '1000' }, branchUser);
  const outInvoiceList = await finance.listInvoices({ search: run, take: '1000' }, outOfScopeUser);
  assert(branchInvoiceList.rows.some((row) => row.id === invoice.id), 'invoice list should include branch scoped rows');
  assert(!outInvoiceList.rows.some((row) => row.id === invoice.id), 'invoice list should exclude out-of-scope rows');
  const branchInvoiceExport = await finance.exportInvoices({ search: run }, branchUser);
  const outInvoiceExport = await finance.exportInvoices({ search: run }, outOfScopeUser);
  assert(branchInvoiceExport.includes(invoice.invoiceCode), 'invoice export should include branch scoped rows');
  assert(!outInvoiceExport.includes(invoice.invoiceCode), 'invoice export should exclude out-of-scope rows');
  assert(await prisma.customerLedgerEntry.count({ where: { sourceType: 'FINANCE_INVOICE', sourceId: invoice.id, entryType: 'DEBIT' } }) === 1, 'invoice approve should create customer ledger');
  assert(await sum(prisma, 'customerLedgerEntry', { sourceType: 'FINANCE_INVOICE', sourceId: invoice.id, entryType: 'DEBIT' }, 'debitAmount') === 1100, 'invoice customer ledger debit should match total after tax');
  const invoiceLedger = await prisma.customerLedgerEntry.findFirstOrThrow({ where: { sourceType: 'FINANCE_INVOICE', sourceId: invoice.id, entryType: 'DEBIT' } });
  assert(invoiceLedger.branch === 'FIN-BR' && invoiceLedger.department === 'FIN-DEP', 'invoice customer ledger should preserve resolved customer scope');
  await rejects(() => finance.approveInvoice(invoice.id, { actor: 'finance-test' }), 'double approve invoice should be rejected as a final-state transition');
  await rejects(() => finance.rejectInvoice(invoice.id, { actor: 'finance-test', note: 'reject approved invoice' }), 'approved invoice should not be rejected');
  await rejects(() => finance.updateInvoice(invoice.id, { items: [{ itemName: 'Blocked edit', quantity: 1, unitPrice: 1, taxRate: 0 }] }), 'approved invoice amount should not be editable');
  await rejects(() => finance.updateInvoice(invoice.id, { note: 'edited after approval' }), 'approved invoice should not be editable after posting');
  const cancelledInvoice = await finance.cancelInvoice(invoice.id, { actor: 'finance-test', reason: 'cancel invoice' });
  assert(cancelledInvoice.approvalStatus === 'CANCELLED' && cancelledInvoice.reversals.length === 1, 'invoice should cancel with reversal');
  assert(await sum(prisma, 'customerLedgerEntry', { invoiceId: { in: [invoice.id, cancelledInvoice.reversals[0].id] } }, 'debitAmount') === 1100, 'invoice original ledger debit should remain');
  assert(await sum(prisma, 'customerLedgerEntry', { invoiceId: { in: [invoice.id, cancelledInvoice.reversals[0].id] } }, 'creditAmount') === 1100, 'invoice reversal ledger credit should match original debit');
  const invoiceReversalLedger = await prisma.customerLedgerEntry.findFirstOrThrow({ where: { sourceType: 'FINANCE_INVOICE', sourceId: cancelledInvoice.reversals[0].id, entryType: 'REVERSAL' } });
  assert(invoiceReversalLedger.branch === 'FIN-BR' && invoiceReversalLedger.department === 'FIN-DEP', 'invoice reversal ledger should preserve resolved customer scope');
  customerDebtReport = await finance.customerDebt({ customerId: customer.id, take: '1000' });
  assert(customerDebtReport.summary.balance === 0 && !customerDebtReport.rows.find((row) => row.id === customer.id), 'invoice cancel should net customer debt report back to zero');
  await rejects(() => finance.cancelInvoice(invoice.id, { actor: 'finance-test', reason: 'again' }), 'double cancel invoice should be rejected as a final-state transition');

  const rollbackInvoice = await finance.createInvoice({
    invoiceCode: run + '-INV-ROLLBACK',
    systemCode: run + '-SYS-ROLLBACK',
    customerId: customer.id,
    customerName: customer.fullName,
    invoiceType: 'VAT',
    issuedDate: '2026-11-04',
    tourId: tour.id,
    items: [{ itemName: 'Invoice rollback service', unit: 'pax', quantity: 1, unitPrice: 30, taxRate: 10 }],
  });
  await finance.approveInvoice(rollbackInvoice.id, { actor: 'finance-test' });
  await prisma.customerLedgerEntry.deleteMany({ where: { sourceType: 'FINANCE_INVOICE', sourceId: rollbackInvoice.id } });
  await rejects(() => finance.cancelInvoice(rollbackInvoice.id, { actor: 'finance-test', reason: 'missing invoice ledger' }), 'invoice cancel should roll back when original ledger is missing');
  const rollbackInvoiceAfter = await prisma.financeInvoice.findUniqueOrThrow({ where: { id: rollbackInvoice.id } });
  assert(rollbackInvoiceAfter.approvalStatus === 'APPROVED' && !rollbackInvoiceAfter.cancelledAt, 'failed invoice cancel should preserve approved status');
  assert(await prisma.financeInvoice.count({ where: { reversalOfId: rollbackInvoice.id } }) === 0, 'failed invoice cancel should not leave a reversal document');
  assert(await prisma.customerLedgerEntry.count({ where: { entryType: 'REVERSAL', invoice: { reversalOfId: rollbackInvoice.id } } }) === 0, 'failed invoice cancel should not leave reversal customer ledger');
  await prisma.customerLedgerEntry.create({
    data: {
      customerId: customer.id,
      invoiceId: rollbackInvoice.id,
      tourId: tour.id,
      sourceType: 'FINANCE_INVOICE',
      sourceId: rollbackInvoice.id,
      entryType: 'DEBIT',
      debitAmount: rollbackInvoice.totalAfterTax,
      documentCode: rollbackInvoice.invoiceCode,
      documentDate: new Date(),
      branch: 'FIN-BR',
      department: 'FIN-DEP',
      createdBy: 'finance-test',
    },
  });
  await finance.cancelInvoice(rollbackInvoice.id, { actor: 'finance-test', reason: 'cleanup invoice rollback guard' });

  const rejectedInvoiceDraft = await finance.createInvoice({
    invoiceCode: run + '-INV-REJECT',
    systemCode: run + '-SYS-REJECT',
    customerId: customer.id,
    customerName: customer.fullName,
    invoiceType: 'VAT',
    issuedDate: '2026-11-04',
    tourId: tour.id,
    items: [{ itemName: 'Reject invoice service', unit: 'pax', quantity: 1, unitPrice: 100, taxRate: 10 }],
  });
  const rejectedInvoice = await finance.rejectInvoice(rejectedInvoiceDraft.id, { actor: 'finance-test', note: 'reject invoice' });
  assert(rejectedInvoice.approvalStatus === 'REJECTED', 'invoice should reject');
  assert(rejectedInvoice.rejectedBy === 'system' && rejectedInvoice.rejectedAt instanceof Date && !rejectedInvoice.approvedBy && !rejectedInvoice.approvedAt, 'invoice reject should write reject audit fields only');
  await rejects(() => finance.approveInvoice(rejectedInvoiceDraft.id, { actor: 'finance-test' }), 'rejected invoice should not approve');
  await rejects(() => finance.rejectInvoice(rejectedInvoiceDraft.id, { actor: 'finance-test' }), 'rejected invoice should not reject again');
  await rejects(() => finance.deleteInvoice(rejectedInvoiceDraft.id), 'rejected invoice should not be deleted');

  const receiptImportCsv = [
    'receiptCode,receiptName,receiptType,paymentMethod,paymentDate,totalAmount,paidBefore,receiptAmount,payerName,branch,department,tourId',
    `${run}-IMP-RCPT,"Import, Receipt",TOUR_PAYMENT,BANK_TRANSFER,2026-11-05,100,25,50,CSV Customer,FIN-BR,FIN-DEP,${tour.id}`,
  ].join('\n');
  const receiptImport = await finance.importReceipts({ csv: receiptImportCsv });
  assert(receiptImport.imported === 1 && receiptImport.rows[0].receiptCode === `${run}-IMP-RCPT`, 'receipt CSV import should accept quoted commas');
  assert(receiptImport.rows[0].receiptName === 'Import, Receipt' && receiptImport.rows[0].paymentDate.toISOString().slice(0, 10) === '2026-11-05', 'receipt CSV import should map quoted text and payment date');
  assert(amount(receiptImport.rows[0].totalAmount) === 100 && amount(receiptImport.rows[0].paidBefore) === 25 && amount(receiptImport.rows[0].receiptAmount) === 50 && amount(receiptImport.rows[0].remainingAmount) === 25, 'receipt CSV import should map amounts and remaining amount');
  assert(receiptImport.rows[0].branch === 'FIN-BR' && receiptImport.rows[0].department === 'FIN-DEP', 'receipt CSV import should map branch and department');
  await rejects(() => finance.importReceipts({ csv: receiptImportCsv }), 'receipt CSV import should reject existing code');
  await rejects(() => finance.importReceipts({ csv: 'receiptCode,receiptName,totalAmount,receiptAmount\nBAD,Bad,-1,1' }), 'receipt CSV import should reject negative amount');

  const paymentImportCsv = [
    'voucherCode,voucherName,voucherType,paymentMethod,paymentDate,totalAmount,paymentAmount,receiverName,branch,department,tourId,supplierId',
    `${run}-IMP-PAY,Import Payment,SUPPLIER_PAYMENT,CASH,2026-11-06,200,150,Supplier CSV,FIN-BR,FIN-DEP,${tour.id},${supplier.id}`,
  ].join('\n');
  const paymentImport = await finance.importPayments({ csv: paymentImportCsv });
  assert(paymentImport.imported === 1 && paymentImport.rows[0].voucherCode === `${run}-IMP-PAY`, 'payment CSV import should accept valid data');
  assert(paymentImport.rows[0].paymentMethod === 'CASH' && paymentImport.rows[0].paymentDate.toISOString().slice(0, 10) === '2026-11-06', 'payment CSV import should map method and payment date');
  assert(amount(paymentImport.rows[0].totalAmount) === 200 && amount(paymentImport.rows[0].paymentAmount) === 150 && amount(paymentImport.rows[0].remainingAmount) === 50, 'payment CSV import should map amounts and remaining amount');
  assert(paymentImport.rows[0].branch === 'FIN-BR' && paymentImport.rows[0].department === 'FIN-DEP', 'payment CSV import should map branch and department');
  await rejects(() => finance.importReceipts({ csv: 'x'.repeat(5 * 1024 * 1024 + 1) }), 'receipt CSV import should reject payloads over 5 MB');
  await rejects(() => finance.importPayments({ csv: 'voucherCode,voucherName,totalAmount,paymentAmount\nBAD,Bad,100,200' }), 'payment CSV import should reject amount over total');
  await rejects(() => finance.importPayments({ csv: 'voucherCode,voucherName,voucherName,totalAmount,paymentAmount\nA,B,C,1,1' }), 'payment CSV import should reject duplicate headers');

  const controller = new FinanceController(
    new FinanceReceiptService(finance),
    new FinancePaymentService(finance),
    new FinanceInvoiceService(finance),
    new FinanceLedgerService(finance),
    new FinanceCashflowService(finance),
  );
  const controllerReceiptImport = await controller.importReceipts({
    csv: [
      'receiptCode,receiptName,receiptType,paymentMethod,paymentDate,totalAmount,paidBefore,receiptAmount,payerName,branch,department,tourId',
      `${run}-IMP-RCPT-CTRL,Controller Receipt,TOUR_PAYMENT,CASH,2026-11-07,120,0,120,Controller Customer,FIN-BR,FIN-DEP,${tour.id}`,
    ].join('\n'),
  }, undefined, { user: undefined });
  assert(controllerReceiptImport.imported === 1 && controllerReceiptImport.rows[0].department === 'FIN-DEP', 'receipt controller import should call real import flow');
  const controllerPaymentImport = await controller.importPayments({
    csv: [
      'voucherCode,voucherName,voucherType,paymentMethod,paymentDate,totalAmount,paymentAmount,receiverName,branch,department,tourId,supplierId',
      `${run}-IMP-PAY-CTRL,Controller Payment,SUPPLIER_PAYMENT,CASH,2026-11-08,220,200,Controller Supplier,FIN-BR,FIN-DEP,${tour.id},${supplier.id}`,
    ].join('\n'),
  }, undefined, { user: undefined });
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
  const paginationCustomer = await prisma.customer.create({
    data: {
      code: run + '-CUS-PAGE',
      fullName: 'Finance Pagination Customer',
      phone: '092' + String(Date.now()).slice(-7),
      branch: 'FIN-BR',
      department: 'FIN-DEP',
    },
  });
  await finance.createCustomerDebtAdjustment(paginationCustomer.id, { direction: 'INCREASE', amount: 250, branch: 'FIN-BR', department: 'FIN-DEP', actor: 'finance-test', description: 'pagination customer increase' });
  await finance.createCustomerDebtAdjustment(paginationCustomer.id, { direction: 'DECREASE', amount: 100, branch: 'FIN-BR', department: 'FIN-DEP', actor: 'finance-test', description: 'pagination customer decrease' });
  const pagedCustomerDebt = await finance.customerDebt({ customerId: paginationCustomer.id, take: '1' });
  const pagedCustomerDebtRow = pagedCustomerDebt.rows.find((row) => row.id === paginationCustomer.id);
  assert(pagedCustomerDebt.entries.length === 1, 'customer debt pagination guard should limit returned entries');
  assert(pagedCustomerDebt.summary.debit === 250 && pagedCustomerDebt.summary.credit === 100 && pagedCustomerDebt.summary.balance === 150 && pagedCustomerDebt.summary.count === 2, 'customer debt summary should include all matching entries regardless of take');
  assert(pagedCustomerDebtRow && pagedCustomerDebtRow.balance === 150, 'customer debt grouped rows should include all matching entries regardless of take');
  const dateFilterCustomerAdjustment = await finance.createCustomerDebtAdjustment(paginationCustomer.id, { direction: 'INCREASE', amount: 75, documentDate: '2026-10-05T15:30:00.000Z', branch: 'FIN-BR', department: 'FIN-DEP', actor: 'finance-test', description: 'date filter customer increase' });
  const dateFilterCustomerDebt = await finance.customerDebt({ customerId: paginationCustomer.id, from: '2026-10-05', to: '2026-10-05', take: '1000' });
  assert(dateFilterCustomerDebt.entries.some((entry) => entry.id === dateFilterCustomerAdjustment.id), 'customer debt date filter should include entries throughout the to date');
  await rejectsWithStatus(() => finance.customerDebt({ customerId: paginationCustomer.id, from: 'bad-date' }), 400, 'customer debt should reject invalid from date');
  await rejectsWithStatus(() => finance.customerDebt({ customerId: paginationCustomer.id, from: '2026-02-31' }), 400, 'customer debt should reject impossible calendar from date');
  const searchedCustomerDebt = await finance.customerDebt({ search: 'Pagination Customer', take: '1000' });
  assert(searchedCustomerDebt.rows.some((row) => row.id === paginationCustomer.id) && !searchedCustomerDebt.rows.some((row) => row.id === customer.id), 'customer debt search should filter by customer name/code/phone');
  const branchCustomerDebt = await finance.customerDebt({ customerId: customer.id, take: '1000' }, branchUser);
  const outCustomerDebt = await finance.customerDebt({ customerId: customer.id, take: '1000' }, outOfScopeUser);
  assert(branchCustomerDebt.rows.find((row) => row.id === customer.id), 'customer debt should include branch scoped entries');
  assert(!outCustomerDebt.rows.find((row) => row.id === customer.id), 'customer debt should exclude out-of-scope entries');
  await rejects(() => finance.createCustomerDebtAdjustment(customer.id, { direction: 'SIDEWAYS', amount: 1 }), 'customer debt adjustment should reject invalid direction');
  await rejectsWithStatus(() => finance.createCustomerDebtAdjustment(customer.id, { direction: 'INCREASE', amount: 1, orderId: otherOrder.id }), 400, 'customer debt adjustment should reject order belonging to a different customer');

  const supplierAdjustmentIncrease = await finance.createSupplierDebtAdjustment(supplier.id, { direction: 'INCREASE', amount: 400, branch: 'FIN-BR', department: 'FIN-DEP', actor: 'finance-test', description: 'increase supplier debt' });
  const supplierAdjustmentDecrease = await finance.createSupplierDebtAdjustment(supplier.id, { direction: 'DECREASE', amount: 125, branch: 'FIN-BR', department: 'FIN-DEP', actor: 'finance-test', description: 'decrease supplier debt' });
  assert(amount(supplierAdjustmentIncrease.creditAmount) === 400 && amount(supplierAdjustmentDecrease.debitAmount) === 125, 'supplier debt adjustments should post payable/settlement by direction');
  const supplierDebt = await finance.supplierDebt({ supplierId: supplier.id, take: '1000' });
  const supplierDebtRow = supplierDebt.rows.find((row) => row.id === supplier.id);
  assert(supplierDebtRow && supplierDebtRow.balance === 275, 'supplier debt report should include net manual adjustment balance');
  const paginationSupplier = await prisma.supplier.create({
    data: {
      categoryId: category.id,
      supplierCode: run + '-SUP-PAGE',
      name: 'Finance Pagination Supplier',
      phone: '093' + String(Date.now()).slice(-7),
    },
  });
  await finance.createSupplierDebtAdjustment(paginationSupplier.id, { direction: 'INCREASE', amount: 400, branch: 'FIN-BR', department: 'FIN-DEP', actor: 'finance-test', description: 'pagination supplier increase' });
  await finance.createSupplierDebtAdjustment(paginationSupplier.id, { direction: 'DECREASE', amount: 125, branch: 'FIN-BR', department: 'FIN-DEP', actor: 'finance-test', description: 'pagination supplier decrease' });
  const pagedSupplierDebt = await finance.supplierDebt({ supplierId: paginationSupplier.id, take: '1' });
  const pagedSupplierDebtRow = pagedSupplierDebt.rows.find((row) => row.id === paginationSupplier.id);
  assert(pagedSupplierDebt.entries.length === 1, 'supplier debt pagination guard should limit returned entries');
  assert(pagedSupplierDebt.summary.debit === 400 && pagedSupplierDebt.summary.credit === 125 && pagedSupplierDebt.summary.balance === 275 && pagedSupplierDebt.summary.count === 2, 'supplier debt summary should include all matching entries regardless of take');
  assert(pagedSupplierDebtRow && pagedSupplierDebtRow.balance === 275, 'supplier debt grouped rows should include all matching entries regardless of take');
  const dateFilterSupplierAdjustment = await finance.createSupplierDebtAdjustment(paginationSupplier.id, { direction: 'INCREASE', amount: 60, documentDate: '2026-10-05T15:30:00.000Z', branch: 'FIN-BR', department: 'FIN-DEP', actor: 'finance-test', description: 'date filter supplier increase' });
  const dateFilterSupplierDebt = await finance.supplierDebt({ supplierId: paginationSupplier.id, from: '2026-10-05', to: '2026-10-05', take: '1000' });
  assert(dateFilterSupplierDebt.entries.some((entry) => entry.id === dateFilterSupplierAdjustment.id), 'supplier debt date filter should include entries throughout the to date');
  await rejectsWithStatus(() => finance.supplierDebt({ supplierId: paginationSupplier.id, to: 'bad-date' }), 400, 'supplier debt should reject invalid to date');
  await rejectsWithStatus(() => finance.cashflow({ take: '-1' }), 400, 'cashflow should reject negative take');
  const searchedSupplierDebt = await finance.supplierDebt({ search: 'Pagination Supplier', take: '1000' });
  assert(searchedSupplierDebt.rows.some((row) => row.id === paginationSupplier.id) && !searchedSupplierDebt.rows.some((row) => row.id === supplier.id), 'supplier debt search should filter by supplier name/code/phone');
  const branchSupplierDebt = await finance.supplierDebt({ supplierId: supplier.id, take: '1000' }, branchUser);
  const outSupplierDebt = await finance.supplierDebt({ supplierId: supplier.id, take: '1000' }, outOfScopeUser);
  assert(branchSupplierDebt.rows.find((row) => row.id === supplier.id), 'supplier debt should include branch scoped entries');
  assert(!outSupplierDebt.rows.find((row) => row.id === supplier.id), 'supplier debt should exclude out-of-scope entries');
  await rejects(() => finance.createSupplierDebtAdjustment(supplier.id, { direction: 'INCREASE', amount: 0 }), 'supplier debt adjustment should reject non-positive amount');
  await rejectsWithStatus(() => finance.createSupplierDebtAdjustment(otherSupplier.id, { direction: 'INCREASE', amount: 1, orderId: order.id }), 400, 'supplier debt adjustment should reject order without a supplier link');

  await prisma.$disconnect();
  console.log('TEST_FINANCE_SERVICE_FLOWS_OK');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
NODE

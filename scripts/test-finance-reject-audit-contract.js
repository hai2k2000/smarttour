#!/usr/bin/env node
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const repoDir = process.env.REPO_DIR || path.resolve(__dirname, '..');
const testDb = process.env.TEST_DB || 'smarttour_finance_reject_audit_test';
const postgresContainer = process.env.POSTGRES_CONTAINER || 'smarttour-postgres-1';
const postgresUser = process.env.POSTGRES_USER || 'smarttour';

function envValue(name) {
  const envPath = path.join(repoDir, '.env');
  if (!fs.existsSync(envPath)) return '';
  const line = fs.readFileSync(envPath, 'utf8').split(/\r?\n/).reverse().find((row) => row.startsWith(name + '='));
  return line ? line.slice(name.length + 1) : '';
}

const postgresPassword = process.env.POSTGRES_PASSWORD || envValue('POSTGRES_PASSWORD');
if (!postgresPassword) {
  console.error('FAIL_FINANCE_REJECT_AUDIT_TEST missing POSTGRES_PASSWORD');
  process.exit(1);
}

function run(command, args, options = {}) {
  execFileSync(command, args, { cwd: repoDir, stdio: options.stdio || 'inherit', ...options });
}

function cleanup() {
  try {
    run('docker', ['exec', postgresContainer, 'dropdb', '-U', postgresUser, '--if-exists', testDb], { stdio: 'ignore' });
  } catch {
    // best-effort cleanup for local contract database
  }
}

const nodeContract = String.raw`
const { PrismaService } = require('./apps/api/dist/database/prisma.service');
const { FinanceService } = require('./apps/api/dist/modules/finance/finance.service');

function assert(condition, label) {
  if (!condition) throw new Error(label);
}

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  const finance = new FinanceService(prisma, {
    async upload() { throw new Error('file upload is not used in this contract'); },
    objectKeyFromUrl() { return null; },
    async removeQuietly() {},
    async removeIfPresent() {},
  });
  const run = 'FIN-REJECT-AUDIT-' + Date.now();
  const actor = {
    id: 'user-finance-reject-audit',
    username: 'finance-auditor',
    email: 'finance-auditor@smarttour.local',
    branch: 'FIN-AUDIT-BR',
    department: 'FIN-AUDIT-DEP',
    roles: [{ role: { permissions: [{ permission: 'data.scope.branch' }] } }],
  };
  await prisma.user.create({
    data: {
      id: actor.id,
      username: actor.username,
      email: actor.email,
      name: 'Finance Auditor',
      passwordHash: 'test-only',
      branch: actor.branch,
      department: actor.department,
    },
  });
  const customer = await prisma.customer.create({
    data: {
      code: run + '-CUS',
      fullName: 'Reject Audit Customer',
      phone: '093' + String(Date.now()).slice(-7),
      branch: actor.branch,
      department: actor.department,
    },
  });
  const category = await prisma.supplierCategory.create({ data: { name: run + '-SUP-CAT' } });
  const supplier = await prisma.supplier.create({
    data: {
      categoryId: category.id,
      supplierCode: run + '-SUP',
      name: 'Reject Audit Supplier',
      status: 'ACTIVE',
    },
  });
  const order = await prisma.order.create({
    data: {
      type: 'SINGLE_SERVICE',
      systemCode: run + '-ORD',
      name: 'Reject Audit Order',
      customerId: customer.id,
      totalRevenue: 1000,
      remainingRevenue: 1000,
      totalCost: 700,
      remainingCost: 700,
      branch: actor.branch,
      department: actor.department,
    },
  });
  const tour = await prisma.tour.create({
    data: {
      type: 'FIT',
      systemCode: run + '-TOUR',
      tourCode: run + '-TOUR',
      name: 'Reject Audit Tour',
      orderId: order.id,
      branch: actor.branch,
      department: actor.department,
    },
  });

  const receiptDraft = await finance.createReceipt({
    receiptCode: run + '-RCPT',
    receiptName: 'Reject Audit Receipt',
    receiptType: 'TOUR_PAYMENT',
    paymentDate: '2026-11-02',
    paymentMethod: 'BANK_TRANSFER',
    customerId: customer.id,
    payerName: customer.fullName,
    totalAmount: 100,
    paidBefore: 0,
    receiptAmount: 100,
    tourId: tour.id,
    branch: actor.branch,
    department: actor.department,
  }, actor);
  const receipt = await finance.rejectReceipt(receiptDraft.id, { actor: 'client-spoof', note: 'reject receipt' }, actor);
  assert(receipt.approvalStatus === 'REJECTED', 'receipt should reject');
  assert(receipt.rejectedBy === actor.username, 'receipt reject must derive rejectedBy from request user');
  assert(receipt.rejectedAt instanceof Date, 'receipt reject must set rejectedAt');
  assert(!receipt.approvedBy && !receipt.approvedAt, 'receipt reject must not write approved audit fields');

  const paymentDraft = await finance.createPayment({
    voucherCode: run + '-PAY',
    voucherName: 'Reject Audit Payment',
    voucherType: 'SUPPLIER_PAYMENT',
    paymentDate: '2026-11-03',
    paymentMethod: 'BANK_TRANSFER',
    supplierId: supplier.id,
    receiverName: supplier.name,
    totalAmount: 100,
    paymentAmount: 100,
    tourId: tour.id,
    branch: actor.branch,
    department: actor.department,
  }, actor);
  const payment = await finance.rejectPayment(paymentDraft.id, { actor: 'client-spoof', note: 'reject payment' }, actor);
  assert(payment.approvalStatus === 'REJECTED', 'payment should reject');
  assert(payment.rejectedBy === actor.username, 'payment reject must derive rejectedBy from request user');
  assert(payment.rejectedAt instanceof Date, 'payment reject must set rejectedAt');
  assert(!payment.approvedBy && !payment.approvedAt, 'payment reject must not write approved audit fields');

  const invoiceDraft = await finance.createInvoice({
    invoiceCode: run + '-INV',
    systemCode: run + '-SYS',
    customerId: customer.id,
    customerName: customer.fullName,
    invoiceType: 'VAT',
    issuedDate: '2026-11-04',
    tourId: tour.id,
    items: [{ itemName: 'Reject Audit Invoice Service', unit: 'pax', quantity: 1, unitPrice: 100, taxRate: 10 }],
  }, actor);
  const invoice = await finance.rejectInvoice(invoiceDraft.id, { actor: 'client-spoof', note: 'reject invoice' }, actor);
  assert(invoice.status === 'REJECTED' && invoice.approvalStatus === 'REJECTED', 'invoice should reject');
  assert(invoice.rejectedBy === actor.username, 'invoice reject must derive rejectedBy from request user');
  assert(invoice.rejectedAt instanceof Date, 'invoice reject must set rejectedAt');
  assert(!invoice.approvedBy && !invoice.approvedAt, 'invoice reject must not write approved audit fields');

  await prisma.$disconnect();
  console.log('TEST_FINANCE_REJECT_AUDIT_CONTRACT_OK');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
`;

cleanup();
run('docker', ['compose', 'build', 'api']);
run('docker', ['exec', postgresContainer, 'createdb', '-U', postgresUser, testDb]);

try {
  const databaseUrl = 'postgresql://' + postgresUser + ':' + postgresPassword + '@postgres:5432/' + testDb + '?schema=public';
  const command = "cd /workspace && /app/node_modules/.bin/prisma db push --schema prisma/schema.prisma --skip-generate >/dev/null && cd /app && node <<'NODE'\n" + nodeContract + "\nNODE";
  const result = spawnSync('docker', ['compose', 'run', '--rm', '-v', repoDir + ':/workspace:ro', '-e', 'DATABASE_URL=' + databaseUrl, '--entrypoint', 'sh', 'api', '-lc', command], {
    cwd: repoDir,
    stdio: 'inherit',
  });
  if (result.status !== 0) process.exit(result.status || 1);
} finally {
  cleanup();
}
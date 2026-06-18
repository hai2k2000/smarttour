#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

function loadDotEnv(file = path.join(process.cwd(), '.env')) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[match[1]] = value;
  }
}

function prismaModule() {
  try {
    return require('@prisma/client');
  } catch (error) {
    if (process.env.NODE_PATH) {
      for (const base of process.env.NODE_PATH.split(path.delimiter)) {
        try {
          return require(path.join(base, '@prisma/client'));
        } catch {
          // Try the next NODE_PATH entry.
        }
      }
    }
    throw error;
  }
}

function ensureDatabaseUrl() {
  if (process.env.DATABASE_URL) return;
  if (!process.env.POSTGRES_PASSWORD) return;
  const host = process.env.POSTGRES_HOST || '127.0.0.1';
  const port = process.env.POSTGRES_PORT || '5433';
  const user = process.env.POSTGRES_USER || 'smarttour';
  const db = process.env.POSTGRES_DB || 'smarttour';
  process.env.DATABASE_URL = `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(process.env.POSTGRES_PASSWORD)}@${host}:${port}/${db}?schema=public`;
}

function parseArgs(argv) {
  const args = { mode: 'audit', output: undefined, dryRun: true };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--mode') args.mode = argv[++index];
    else if (arg.startsWith('--mode=')) args.mode = arg.slice('--mode='.length);
    else if (arg === '--output') args.output = argv[++index];
    else if (arg.startsWith('--output=')) args.output = arg.slice('--output='.length);
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--apply') args.dryRun = false;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!['audit', 'guard', 'backfill'].includes(args.mode)) throw new Error(`Unsupported mode: ${args.mode}`);
  return args;
}

function positive(value) {
  return Number(value) > 0;
}

function actorFrom(row) {
  return row.approvedBy || row.createdBy || 'finance-side-effect-backfill';
}

function compactRows(rows, codeKey) {
  return rows.map((row) => ({
    id: row.id,
    code: row[codeKey],
    amount: String(row.receiptAmount ?? row.paymentAmount),
    paymentDate: row.paymentDate,
    branch: row.branch,
    department: row.department,
    orderId: row.orderId || row.orders?.find((line) => line.orderId)?.orderId || null,
    tourId: row.tourId || null,
    supplierId: row.supplierId || null,
    customerId: row.customerId || null,
  }));
}

async function auditFinanceSideEffects(prisma) {
  const approvedOriginal = { approvalStatus: 'APPROVED', deletedAt: null, reversalOfId: null };
  const receiptSelect = {
    id: true,
    receiptCode: true,
    receiptName: true,
    receiptAmount: true,
    paymentMethod: true,
    paymentDate: true,
    reason: true,
    branch: true,
    department: true,
    assignedStaff: true,
    customerId: true,
    tourId: true,
    approvedBy: true,
    createdBy: true,
    orders: { select: { orderId: true }, orderBy: { createdAt: 'asc' } },
  };
  const paymentSelect = {
    id: true,
    voucherCode: true,
    voucherName: true,
    paymentAmount: true,
    paymentMethod: true,
    paymentDate: true,
    reason: true,
    branch: true,
    department: true,
    assignedStaff: true,
    supplierId: true,
    operationVoucherId: true,
    orderId: true,
    tourId: true,
    approvedBy: true,
    createdBy: true,
  };

  const [missingReceiptCashflow, missingPaymentCashflow, missingCustomerLedger, missingSupplierLedger] = await Promise.all([
    prisma.financeReceipt.findMany({
      where: { ...approvedOriginal, cashflowEntries: { none: { sourceType: 'RECEIPT', entryType: 'RECEIPT' } } },
      select: receiptSelect,
      orderBy: [{ paymentDate: 'asc' }, { receiptCode: 'asc' }],
    }),
    prisma.financePayment.findMany({
      where: { ...approvedOriginal, cashflowEntries: { none: { sourceType: 'PAYMENT', entryType: 'PAYMENT' } } },
      select: paymentSelect,
      orderBy: [{ paymentDate: 'asc' }, { voucherCode: 'asc' }],
    }),
    prisma.financeReceipt.findMany({
      where: { ...approvedOriginal, customerId: { not: null }, customerLedger: { none: { sourceType: 'FINANCE_RECEIPT', entryType: 'CREDIT' } } },
      select: receiptSelect,
      orderBy: [{ paymentDate: 'asc' }, { receiptCode: 'asc' }],
    }),
    prisma.financePayment.findMany({
      where: { ...approvedOriginal, supplierId: { not: null }, supplierLedger: { none: { sourceType: 'FINANCE_PAYMENT', entryType: 'DEBIT' } } },
      select: paymentSelect,
      orderBy: [{ paymentDate: 'asc' }, { voucherCode: 'asc' }],
    }),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    counts: {
      missingReceiptCashflow: missingReceiptCashflow.length,
      missingPaymentCashflow: missingPaymentCashflow.length,
      missingCustomerLedger: missingCustomerLedger.length,
      missingSupplierLedger: missingSupplierLedger.length,
    },
    missingReceiptCashflow,
    missingPaymentCashflow,
    missingCustomerLedger,
    missingSupplierLedger,
    samples: {
      missingReceiptCashflow: compactRows(missingReceiptCashflow.slice(0, 20), 'receiptCode'),
      missingPaymentCashflow: compactRows(missingPaymentCashflow.slice(0, 20), 'voucherCode'),
      missingCustomerLedger: compactRows(missingCustomerLedger.slice(0, 20), 'receiptCode'),
      missingSupplierLedger: compactRows(missingSupplierLedger.slice(0, 20), 'voucherCode'),
    },
  };
}

async function upsertReceiptCashflow(prisma, receipt) {
  await prisma.financeCashflowEntry.upsert({
    where: { sourceType_sourceId: { sourceType: 'RECEIPT', sourceId: receipt.id } },
    create: {
      sourceType: 'RECEIPT',
      sourceId: receipt.id,
      entryType: 'RECEIPT',
      amount: receipt.receiptAmount,
      paymentMethod: receipt.paymentMethod,
      paymentDate: receipt.paymentDate || new Date(),
      branch: receipt.branch,
      department: receipt.department,
      staff: receipt.assignedStaff,
      customerId: receipt.customerId,
      tourId: receipt.tourId,
      receiptId: receipt.id,
      note: receipt.reason,
    },
    update: {},
  });
}

async function upsertPaymentCashflow(prisma, payment) {
  await prisma.financeCashflowEntry.upsert({
    where: { sourceType_sourceId: { sourceType: 'PAYMENT', sourceId: payment.id } },
    create: {
      sourceType: 'PAYMENT',
      sourceId: payment.id,
      entryType: 'PAYMENT',
      amount: payment.paymentAmount,
      paymentMethod: payment.paymentMethod,
      paymentDate: payment.paymentDate || new Date(),
      branch: payment.branch,
      department: payment.department,
      staff: payment.assignedStaff,
      orderId: payment.orderId,
      tourId: payment.tourId,
      supplierId: payment.supplierId,
      paymentId: payment.id,
      note: payment.reason,
    },
    update: {},
  });
}

async function upsertCustomerLedger(prisma, receipt) {
  const orderId = receipt.orders.find((line) => line.orderId)?.orderId || null;
  await prisma.customerLedgerEntry.upsert({
    where: { sourceType_sourceId_entryType: { sourceType: 'FINANCE_RECEIPT', sourceId: receipt.id, entryType: 'CREDIT' } },
    create: {
      customerId: receipt.customerId,
      receiptId: receipt.id,
      orderId,
      tourId: receipt.tourId,
      sourceType: 'FINANCE_RECEIPT',
      sourceId: receipt.id,
      entryType: 'CREDIT',
      creditAmount: receipt.receiptAmount,
      documentCode: receipt.receiptCode,
      documentDate: receipt.paymentDate || new Date(),
      branch: receipt.branch,
      department: receipt.department,
      staff: receipt.assignedStaff,
      description: receipt.reason || receipt.receiptName,
      createdBy: actorFrom(receipt),
    },
    update: {},
  });
}

async function upsertSupplierLedger(prisma, payment) {
  await prisma.supplierLedgerEntry.upsert({
    where: { sourceType_sourceId_entryType: { sourceType: 'FINANCE_PAYMENT', sourceId: payment.id, entryType: 'DEBIT' } },
    create: {
      supplierId: payment.supplierId,
      paymentId: payment.id,
      orderId: payment.orderId,
      tourId: payment.tourId,
      operationVoucherId: payment.operationVoucherId,
      sourceType: 'FINANCE_PAYMENT',
      sourceId: payment.id,
      entryType: 'DEBIT',
      debitAmount: payment.paymentAmount,
      documentCode: payment.voucherCode,
      documentDate: payment.paymentDate || new Date(),
      branch: payment.branch,
      department: payment.department,
      staff: payment.assignedStaff,
      description: payment.reason || payment.voucherName,
      createdBy: actorFrom(payment),
    },
    update: {},
  });
}

async function applyRows(rows, created, skipped, key, amountKey, dryRun, applyOne) {
  for (const row of rows) {
    if (!positive(row[amountKey])) {
      skipped[key] += 1;
      continue;
    }
    created[key] += 1;
    if (!dryRun) await applyOne(row);
  }
}

async function backfillFinanceSideEffects(prisma, options = {}) {
  const dryRun = options.dryRun !== false;
  const before = await auditFinanceSideEffects(prisma);
  const created = { receiptCashflow: 0, paymentCashflow: 0, customerLedger: 0, supplierLedger: 0 };
  const skipped = { receiptCashflow: 0, paymentCashflow: 0, customerLedger: 0, supplierLedger: 0 };

  await applyRows(before.missingReceiptCashflow, created, skipped, 'receiptCashflow', 'receiptAmount', dryRun, (row) => upsertReceiptCashflow(prisma, row));
  await applyRows(before.missingPaymentCashflow, created, skipped, 'paymentCashflow', 'paymentAmount', dryRun, (row) => upsertPaymentCashflow(prisma, row));
  await applyRows(before.missingCustomerLedger, created, skipped, 'customerLedger', 'receiptAmount', dryRun, (row) => upsertCustomerLedger(prisma, row));
  await applyRows(before.missingSupplierLedger, created, skipped, 'supplierLedger', 'paymentAmount', dryRun, (row) => upsertSupplierLedger(prisma, row));

  return {
    generatedAt: new Date().toISOString(),
    dryRun,
    created,
    skipped,
    before,
    after: dryRun ? undefined : await auditFinanceSideEffects(prisma),
  };
}

function missingTotal(report) {
  return Object.values(report.counts).reduce((sum, count) => sum + count, 0);
}

function writeReport(report, output) {
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (!output) {
    process.stdout.write(json);
    return;
  }
  fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
  fs.writeFileSync(output, json);
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  loadDotEnv(process.env.ENV_FILE || path.join(process.cwd(), '.env'));
  ensureDatabaseUrl();
  const { PrismaClient } = prismaModule();
  const prisma = new PrismaClient();
  await prisma.$connect();
  try {
    if (args.mode === 'backfill') {
      const report = await backfillFinanceSideEffects(prisma, { dryRun: args.dryRun });
      writeReport(report, args.output);
      console.log(`FINANCE_SIDE_EFFECT_BACKFILL_${args.dryRun ? 'DRY_RUN' : 'APPLIED'} receiptCashflow=${report.created.receiptCashflow} paymentCashflow=${report.created.paymentCashflow} customerLedger=${report.created.customerLedger} supplierLedger=${report.created.supplierLedger}`);
      return;
    }

    const report = await auditFinanceSideEffects(prisma);
    if (args.output) writeReport(report, args.output);
    if (args.mode === 'guard' && missingTotal(report) > 0) {
      console.error(`FINANCE_SIDE_EFFECT_GUARD_FAILED missing=${missingTotal(report)}`);
      console.error(JSON.stringify(report.counts));
      process.exitCode = 1;
      return;
    }
    if (!args.output) writeReport(report, undefined);
    console.log(`FINANCE_SIDE_EFFECT_AUDIT_OK missing=${missingTotal(report)}`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  auditFinanceSideEffects,
  backfillFinanceSideEffects,
  ensureDatabaseUrl,
  loadDotEnv,
  main,
  parseArgs,
};

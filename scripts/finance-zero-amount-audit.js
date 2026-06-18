#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const CLEANUP_MARKER = '[finance-zero-amount-cleanup]';

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

function amount(value) {
  return Number(value || 0);
}

function paymentBlockedReasons(row) {
  const reasons = [];
  if (row.cashflowEntries.length) reasons.push('cashflow');
  if (row.supplierLedger.length) reasons.push('supplierLedger');
  if (row.operationVoucherPayments.length) reasons.push('operationVoucherPayments');
  if (row.supplierPaymentRequests.length) reasons.push('supplierPaymentRequests');
  if (row.reversals.length) reasons.push('reversals');
  return reasons;
}

function receiptBlockedReasons(row) {
  const reasons = [];
  if (row.cashflowEntries.length) reasons.push('cashflow');
  if (row.customerLedger.length) reasons.push('customerLedger');
  if (row.invoices.length) reasons.push('invoices');
  if (row.reversals.length) reasons.push('reversals');
  return reasons;
}

function compactPayment(row, reasons = []) {
  return {
    id: row.id,
    voucherCode: row.voucherCode,
    voucherType: row.voucherType,
    paymentAmount: String(row.paymentAmount),
    totalAmount: String(row.totalAmount),
    paymentDate: row.paymentDate,
    supplierId: row.supplierId,
    orderId: row.orderId,
    tourId: row.tourId,
    createdBy: row.createdBy,
    approvedBy: row.approvedBy,
    blockedReasons: reasons,
  };
}

function compactReceipt(row, reasons = []) {
  return {
    id: row.id,
    receiptCode: row.receiptCode,
    receiptType: row.receiptType,
    receiptAmount: String(row.receiptAmount),
    totalAmount: String(row.totalAmount),
    paymentDate: row.paymentDate,
    customerId: row.customerId,
    tourId: row.tourId,
    createdBy: row.createdBy,
    approvedBy: row.approvedBy,
    blockedReasons: reasons,
  };
}

async function auditFinanceZeroAmounts(prisma) {
  const [payments, receipts] = await Promise.all([
    prisma.financePayment.findMany({
      where: { approvalStatus: 'APPROVED', deletedAt: null, reversalOfId: null },
      include: { cashflowEntries: true, supplierLedger: true, operationVoucherPayments: true, supplierPaymentRequests: true, reversals: true },
      orderBy: [{ paymentDate: 'asc' }, { voucherCode: 'asc' }],
    }),
    prisma.financeReceipt.findMany({
      where: { approvalStatus: 'APPROVED', deletedAt: null, reversalOfId: null },
      include: { cashflowEntries: true, customerLedger: true, invoices: true, reversals: true },
      orderBy: [{ paymentDate: 'asc' }, { receiptCode: 'asc' }],
    }),
  ]);

  const actionablePayments = [];
  const blockedPayments = [];
  for (const row of payments.filter((payment) => amount(payment.paymentAmount) <= 0)) {
    const reasons = paymentBlockedReasons(row);
    if (reasons.length) blockedPayments.push(compactPayment(row, reasons));
    else actionablePayments.push(compactPayment(row));
  }

  const actionableReceipts = [];
  const blockedReceipts = [];
  for (const row of receipts.filter((receipt) => amount(receipt.receiptAmount) <= 0)) {
    const reasons = receiptBlockedReasons(row);
    if (reasons.length) blockedReceipts.push(compactReceipt(row, reasons));
    else actionableReceipts.push(compactReceipt(row));
  }

  return {
    generatedAt: new Date().toISOString(),
    counts: {
      actionablePayments: actionablePayments.length,
      blockedPayments: blockedPayments.length,
      actionableReceipts: actionableReceipts.length,
      blockedReceipts: blockedReceipts.length,
    },
    actionablePayments,
    blockedPayments,
    actionableReceipts,
    blockedReceipts,
  };
}

async function backfillFinanceZeroAmounts(prisma, options = {}) {
  const dryRun = options.dryRun !== false;
  const before = await auditFinanceZeroAmounts(prisma);
  const paymentIds = before.actionablePayments.map((row) => row.id);
  const receiptIds = before.actionableReceipts.map((row) => row.id);
  const deleted = { receipts: receiptIds.length, payments: paymentIds.length };

  if (!dryRun && (paymentIds.length || receiptIds.length)) {
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      if (receiptIds.length) await tx.financeReceipt.updateMany({ where: { id: { in: receiptIds }, deletedAt: null }, data: { deletedAt: now, note: CLEANUP_MARKER } });
      if (paymentIds.length) await tx.financePayment.updateMany({ where: { id: { in: paymentIds }, deletedAt: null }, data: { deletedAt: now, note: CLEANUP_MARKER } });
    });
  }

  return { generatedAt: new Date().toISOString(), dryRun, deleted, before, after: dryRun ? undefined : await auditFinanceZeroAmounts(prisma) };
}

function issueTotal(report) {
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
      const report = await backfillFinanceZeroAmounts(prisma, { dryRun: args.dryRun });
      writeReport(report, args.output);
      console.log(`FINANCE_ZERO_AMOUNT_BACKFILL_${args.dryRun ? 'DRY_RUN' : 'APPLIED'} receipts=${report.deleted.receipts} payments=${report.deleted.payments}`);
      return;
    }

    const report = await auditFinanceZeroAmounts(prisma);
    if (args.output) writeReport(report, args.output);
    if (args.mode === 'guard' && issueTotal(report) > 0) {
      console.error(`FINANCE_ZERO_AMOUNT_GUARD_FAILED issues=${issueTotal(report)}`);
      console.error(JSON.stringify(report.counts));
      process.exitCode = 1;
      return;
    }
    if (!args.output) writeReport(report, undefined);
    console.log(`FINANCE_ZERO_AMOUNT_AUDIT_OK issues=${issueTotal(report)}`);
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
  auditFinanceZeroAmounts,
  backfillFinanceZeroAmounts,
  main,
};

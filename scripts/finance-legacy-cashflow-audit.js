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

function compactEntry(row, codeField) {
  return {
    id: row.id,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    amount: String(row.amount),
    code: row.receipt?.[codeField] || row.payment?.[codeField] || null,
    receiptId: row.receiptId,
    paymentId: row.paymentId,
    orderId: row.orderId,
    tourId: row.tourId,
    createdAt: row.createdAt,
  };
}

async function auditFinanceLegacyCashflow(prisma) {
  const [legacyReceipts, legacyPayments] = await Promise.all([
    prisma.financeCashflowEntry.findMany({
      where: { sourceType: 'FINANCE_RECEIPT', receipt: { approvalStatus: 'APPROVED', deletedAt: null, reversalOfId: null } },
      include: { receipt: { select: { id: true, receiptCode: true, cashflowEntries: { select: { id: true, sourceType: true } } } } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.financeCashflowEntry.findMany({
      where: { sourceType: 'FINANCE_PAYMENT', payment: { approvalStatus: 'APPROVED', deletedAt: null, reversalOfId: null } },
      include: { payment: { select: { id: true, voucherCode: true, cashflowEntries: { select: { id: true, sourceType: true } } } } },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  const duplicateLegacyReceiptCashflow = legacyReceipts.filter((row) => row.receipt?.cashflowEntries.some((entry) => entry.sourceType === 'RECEIPT'));
  const duplicateLegacyPaymentCashflow = legacyPayments.filter((row) => row.payment?.cashflowEntries.some((entry) => entry.sourceType === 'PAYMENT'));
  const duplicateReceiptIds = new Set(duplicateLegacyReceiptCashflow.map((row) => row.id));
  const duplicatePaymentIds = new Set(duplicateLegacyPaymentCashflow.map((row) => row.id));

  return {
    generatedAt: new Date().toISOString(),
    counts: {
      duplicateLegacyReceiptCashflow: duplicateLegacyReceiptCashflow.length,
      duplicateLegacyPaymentCashflow: duplicateLegacyPaymentCashflow.length,
      legacyOnlyReceiptCashflow: legacyReceipts.filter((row) => !duplicateReceiptIds.has(row.id)).length,
      legacyOnlyPaymentCashflow: legacyPayments.filter((row) => !duplicatePaymentIds.has(row.id)).length,
    },
    duplicateLegacyReceiptCashflow: duplicateLegacyReceiptCashflow.map((row) => compactEntry(row, 'receiptCode')),
    duplicateLegacyPaymentCashflow: duplicateLegacyPaymentCashflow.map((row) => compactEntry(row, 'voucherCode')),
    legacyOnlyReceiptCashflow: legacyReceipts.filter((row) => !duplicateReceiptIds.has(row.id)).map((row) => compactEntry(row, 'receiptCode')),
    legacyOnlyPaymentCashflow: legacyPayments.filter((row) => !duplicatePaymentIds.has(row.id)).map((row) => compactEntry(row, 'voucherCode')),
  };
}

async function backfillFinanceLegacyCashflow(prisma, options = {}) {
  const dryRun = options.dryRun !== false;
  const before = await auditFinanceLegacyCashflow(prisma);
  const receiptIds = before.duplicateLegacyReceiptCashflow.map((row) => row.id);
  const paymentIds = before.duplicateLegacyPaymentCashflow.map((row) => row.id);
  const deleted = { receiptCashflow: receiptIds.length, paymentCashflow: paymentIds.length };

  if (!dryRun && (receiptIds.length || paymentIds.length)) {
    await prisma.financeCashflowEntry.deleteMany({ where: { id: { in: [...receiptIds, ...paymentIds] } } });
  }

  return { generatedAt: new Date().toISOString(), dryRun, deleted, before, after: dryRun ? undefined : await auditFinanceLegacyCashflow(prisma) };
}

function duplicateTotal(report) {
  return report.counts.duplicateLegacyReceiptCashflow + report.counts.duplicateLegacyPaymentCashflow;
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
      const report = await backfillFinanceLegacyCashflow(prisma, { dryRun: args.dryRun });
      writeReport(report, args.output);
      console.log(`FINANCE_LEGACY_CASHFLOW_BACKFILL_${args.dryRun ? 'DRY_RUN' : 'APPLIED'} receiptCashflow=${report.deleted.receiptCashflow} paymentCashflow=${report.deleted.paymentCashflow}`);
      return;
    }

    const report = await auditFinanceLegacyCashflow(prisma);
    if (args.output) writeReport(report, args.output);
    if (args.mode === 'guard' && duplicateTotal(report) > 0) {
      console.error(`FINANCE_LEGACY_CASHFLOW_GUARD_FAILED duplicates=${duplicateTotal(report)}`);
      console.error(JSON.stringify(report.counts));
      process.exitCode = 1;
      return;
    }
    if (!args.output) writeReport(report, undefined);
    console.log(`FINANCE_LEGACY_CASHFLOW_AUDIT_OK duplicates=${duplicateTotal(report)}`);
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
  auditFinanceLegacyCashflow,
  backfillFinanceLegacyCashflow,
  main,
};

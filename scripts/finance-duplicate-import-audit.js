#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const CLEANUP_MARKER = '[finance-duplicate-import-cleanup]';

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

function canonicalDocumentCode(value) {
  return String(value || '').trim().replace(/\s+/g, '').toUpperCase();
}

function money(value) {
  return Math.round(Number(value || 0));
}

function rowSort(a, b) {
  return new Date(a.createdAt || a.approvedAt || 0) - new Date(b.createdAt || b.approvedAt || 0)
    || new Date(a.approvedAt || 0) - new Date(b.approvedAt || 0)
    || String(a.id).localeCompare(String(b.id));
}

function receiptKey(row) {
  const orderId = row.orders.find((line) => line.orderId)?.orderId || '';
  return [canonicalDocumentCode(row.receiptCode), orderId, row.customerId || '', money(row.receiptAmount)].join('|');
}

function paymentKey(row) {
  return [canonicalDocumentCode(row.voucherCode), row.orderId || '', money(row.paymentAmount)].join('|');
}

function splitDuplicateGroups(rows, keyFn, codeField, canDeleteRow) {
  const groups = new Map();
  for (const row of rows) {
    const canonicalCode = canonicalDocumentCode(row[codeField]);
    if (!canonicalCode) continue;
    const key = keyFn(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ ...row, canonicalCode });
  }
  const eligible = [];
  const skipped = [];
  for (const group of Array.from(groups.values())
    .filter((group) => group.length > 1)
    .map((group) => [...group].sort(rowSort))) {
    const duplicateRows = group.slice(1);
    const deletable = duplicateRows.filter(canDeleteRow);
    const blocked = duplicateRows.filter((row) => !canDeleteRow(row));
    if (deletable.length) eligible.push({ canonicalCode: group[0].canonicalCode, keep: compactRow(group[0], codeField), duplicates: deletable.map((row) => compactRow(row, codeField)) });
    if (blocked.length) skipped.push({ canonicalCode: group[0].canonicalCode, keep: compactRow(group[0], codeField), duplicates: blocked.map((row) => compactRow(row, codeField)) });
  }
  return { eligible, skipped };
}

function compactRow(row, codeField) {
  return {
    id: row.id,
    code: row[codeField],
    canonicalCode: row.canonicalCode || canonicalDocumentCode(row[codeField]),
    amount: String(row.receiptAmount ?? row.paymentAmount),
    paymentDate: row.paymentDate,
    createdAt: row.createdAt,
    approvedAt: row.approvedAt,
    orderId: row.orderId || row.orders?.find((line) => line.orderId)?.orderId || null,
    customerId: row.customerId || null,
    supplierId: row.supplierId || null,
  };
}

async function auditFinanceDuplicateImports(prisma) {
  const receiptRows = await prisma.financeReceipt.findMany({
    where: { approvalStatus: 'APPROVED', deletedAt: null, reversalOfId: null },
    select: {
      id: true,
      receiptCode: true,
      receiptAmount: true,
      paymentDate: true,
      customerId: true,
      createdAt: true,
      approvedAt: true,
      orders: { select: { orderId: true }, orderBy: { createdAt: 'asc' } },
      invoices: { select: { id: true }, take: 1 },
    },
  });
  const paymentRows = await prisma.financePayment.findMany({
    where: { approvalStatus: 'APPROVED', deletedAt: null, reversalOfId: null },
    select: {
      id: true,
      voucherCode: true,
      paymentAmount: true,
      paymentDate: true,
      supplierId: true,
      orderId: true,
      createdAt: true,
      approvedAt: true,
      operationVoucherPayments: { select: { id: true }, take: 1 },
      supplierPaymentRequests: { select: { id: true }, take: 1 },
    },
  });

  const receiptGroups = splitDuplicateGroups(receiptRows, receiptKey, 'receiptCode', (row) => !row.invoices.length);
  const paymentGroups = splitDuplicateGroups(paymentRows, paymentKey, 'voucherCode', (row) => !row.operationVoucherPayments.length && !row.supplierPaymentRequests.length);
  const duplicateReceipts = receiptGroups.eligible;
  const duplicatePayments = paymentGroups.eligible;
  const skippedReceipts = receiptGroups.skipped;
  const skippedPayments = paymentGroups.skipped;

  return {
    generatedAt: new Date().toISOString(),
    counts: {
      duplicateReceiptGroups: duplicateReceipts.length,
      duplicatePaymentGroups: duplicatePayments.length,
      duplicateReceipts: duplicateReceipts.reduce((sum, group) => sum + group.duplicates.length, 0),
      duplicatePayments: duplicatePayments.reduce((sum, group) => sum + group.duplicates.length, 0),
      skippedReceiptGroups: skippedReceipts.length,
      skippedPaymentGroups: skippedPayments.length,
    },
    duplicateReceipts,
    duplicatePayments,
    skippedReceipts,
    skippedPayments,
  };
}

function duplicateIds(groups) {
  return groups.flatMap((group) => group.duplicates.map((row) => row.id));
}

async function countCleanupRows(prisma, receiptIds, paymentIds) {
  const [cashflow, customerLedger, supplierLedger] = await Promise.all([
    prisma.financeCashflowEntry.count({
      where: {
        OR: [
          receiptIds.length ? { receiptId: { in: receiptIds } } : undefined,
          paymentIds.length ? { paymentId: { in: paymentIds } } : undefined,
          [...receiptIds, ...paymentIds].length ? { sourceId: { in: [...receiptIds, ...paymentIds] } } : undefined,
        ].filter(Boolean),
      },
    }),
    receiptIds.length ? prisma.customerLedgerEntry.count({ where: { OR: [{ receiptId: { in: receiptIds } }, { sourceId: { in: receiptIds } }] } }) : 0,
    paymentIds.length ? prisma.supplierLedgerEntry.count({ where: { OR: [{ paymentId: { in: paymentIds } }, { sourceId: { in: paymentIds } }] } }) : 0,
  ]);
  return { cashflow, customerLedger, supplierLedger };
}

async function backfillFinanceDuplicateImports(prisma, options = {}) {
  const dryRun = options.dryRun !== false;
  const before = await auditFinanceDuplicateImports(prisma);
  const receiptIds = duplicateIds(before.duplicateReceipts);
  const paymentIds = duplicateIds(before.duplicatePayments);
  const sideEffects = await countCleanupRows(prisma, receiptIds, paymentIds);
  const deleted = {
    receipts: receiptIds.length,
    payments: paymentIds.length,
    cashflow: sideEffects.cashflow,
    customerLedger: sideEffects.customerLedger,
    supplierLedger: sideEffects.supplierLedger,
  };

  if (!dryRun && (receiptIds.length || paymentIds.length)) {
    await prisma.$transaction(async (tx) => {
      if (receiptIds.length || paymentIds.length) {
        await tx.financeCashflowEntry.deleteMany({
          where: {
            OR: [
              receiptIds.length ? { receiptId: { in: receiptIds } } : undefined,
              paymentIds.length ? { paymentId: { in: paymentIds } } : undefined,
              [...receiptIds, ...paymentIds].length ? { sourceId: { in: [...receiptIds, ...paymentIds] } } : undefined,
            ].filter(Boolean),
          },
        });
      }
      if (receiptIds.length) {
        await tx.customerLedgerEntry.deleteMany({ where: { OR: [{ receiptId: { in: receiptIds } }, { sourceId: { in: receiptIds } }] } });
        await tx.financeReceipt.updateMany({
          where: { id: { in: receiptIds }, deletedAt: null },
          data: { deletedAt: new Date(), note: CLEANUP_MARKER },
        });
      }
      if (paymentIds.length) {
        await tx.supplierLedgerEntry.deleteMany({ where: { OR: [{ paymentId: { in: paymentIds } }, { sourceId: { in: paymentIds } }] } });
        await tx.financePayment.updateMany({
          where: { id: { in: paymentIds }, deletedAt: null },
          data: { deletedAt: new Date(), note: CLEANUP_MARKER },
        });
      }
    });
  }

  return { generatedAt: new Date().toISOString(), dryRun, deleted, before, after: dryRun ? undefined : await auditFinanceDuplicateImports(prisma) };
}

function issueTotal(report) {
  return report.counts.duplicateReceipts + report.counts.duplicatePayments + report.counts.skippedReceiptGroups + report.counts.skippedPaymentGroups;
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
      const report = await backfillFinanceDuplicateImports(prisma, { dryRun: args.dryRun });
      writeReport(report, args.output);
      console.log(`FINANCE_DUPLICATE_IMPORT_BACKFILL_${args.dryRun ? 'DRY_RUN' : 'APPLIED'} receipts=${report.deleted.receipts} payments=${report.deleted.payments} cashflow=${report.deleted.cashflow} customerLedger=${report.deleted.customerLedger} supplierLedger=${report.deleted.supplierLedger}`);
      return;
    }

    const report = await auditFinanceDuplicateImports(prisma);
    if (args.output) writeReport(report, args.output);
    if (args.mode === 'guard' && issueTotal(report) > 0) {
      console.error(`FINANCE_DUPLICATE_IMPORT_GUARD_FAILED duplicates=${report.counts.duplicateReceipts + report.counts.duplicatePayments} skippedGroups=${report.counts.skippedReceiptGroups + report.counts.skippedPaymentGroups}`);
      console.error(JSON.stringify(report.counts));
      process.exitCode = 1;
      return;
    }
    if (!args.output) writeReport(report, undefined);
    console.log(`FINANCE_DUPLICATE_IMPORT_AUDIT_OK duplicates=${report.counts.duplicateReceipts + report.counts.duplicatePayments}`);
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
  auditFinanceDuplicateImports,
  backfillFinanceDuplicateImports,
  canonicalDocumentCode,
  main,
};

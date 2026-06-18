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
  const args = { mode: 'audit', output: undefined, systemCodePrefix: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--mode') args.mode = argv[++index];
    else if (arg.startsWith('--mode=')) args.mode = arg.slice('--mode='.length);
    else if (arg === '--output') args.output = argv[++index];
    else if (arg.startsWith('--output=')) args.output = arg.slice('--output='.length);
    else if (arg === '--system-code-prefix') args.systemCodePrefix = argv[++index];
    else if (arg.startsWith('--system-code-prefix=')) args.systemCodePrefix = arg.slice('--system-code-prefix='.length);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!['audit', 'guard'].includes(args.mode)) throw new Error(`Unsupported mode: ${args.mode}`);
  return args;
}

function numberValue(value) {
  return Number(value || 0);
}

function differs(left, right) {
  return Math.abs(numberValue(left) - numberValue(right)) > 0.0001;
}

function hasTourKitImportMarker(order) {
  return /TOURKIT_(ORDER|BOOKING)_IMPORT_/i.test(order.note || '') || /TourKit (order|booking) export/i.test(order.note || '');
}

function compactOrder(order, kind, documentSum, documentCount) {
  const snapshot = kind === 'receipt' ? numberValue(order.paidAmount) : numberValue(order.paidCost);
  const total = kind === 'receipt' ? numberValue(order.totalRevenue) : numberValue(order.totalCost);
  const remaining = kind === 'receipt' ? numberValue(order.remainingRevenue) : numberValue(order.remainingCost);
  return {
    id: order.id,
    systemCode: order.systemCode,
    tourCode: order.tourCode,
    holdCode: order.holdCode,
    name: order.name,
    type: order.type,
    status: order.status,
    total,
    snapshot,
    documentSum,
    delta: snapshot - documentSum,
    remaining,
    documentCount,
    createdBy: order.createdBy,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    source: hasTourKitImportMarker(order) ? 'tourkit_import_snapshot' : 'unclassified',
  };
}

function activeReceiptLinks(order) {
  return order.financeReceipts.filter((line) => line.receipt && line.receipt.approvalStatus === 'APPROVED' && !line.receipt.deletedAt && !line.receipt.reversalOfId);
}

function activePayments(order) {
  return order.financePayments.filter((payment) => payment.approvalStatus === 'APPROVED' && !payment.deletedAt && !payment.reversalOfId);
}

async function auditFinanceOrderSnapshots(prisma, options = {}) {
  const where = { deletedAt: null };
  if (options.systemCodePrefix) where.systemCode = { startsWith: options.systemCodePrefix };

  const orders = await prisma.order.findMany({
    where,
    include: {
      financeReceipts: { include: { receipt: true } },
      financePayments: true,
    },
    orderBy: [{ systemCode: 'asc' }],
  });

  const receiptMismatches = [];
  const paymentMismatches = [];
  const receiptImportSnapshots = [];
  const paymentImportSnapshots = [];

  for (const order of orders) {
    const receiptLinks = activeReceiptLinks(order);
    const receiptSum = receiptLinks.reduce((sum, line) => sum + numberValue(line.receipt.receiptAmount), 0);
    if (differs(order.paidAmount, receiptSum)) {
      const row = compactOrder(order, 'receipt', receiptSum, receiptLinks.length);
      if (receiptLinks.length === 0 && numberValue(order.paidAmount) > 0 && hasTourKitImportMarker(order)) receiptImportSnapshots.push(row);
      else receiptMismatches.push(row);
    }

    const payments = activePayments(order);
    const paymentSum = payments.reduce((sum, payment) => sum + numberValue(payment.paymentAmount), 0);
    if (differs(order.paidCost, paymentSum)) {
      const row = compactOrder(order, 'payment', paymentSum, payments.length);
      if (payments.length === 0 && numberValue(order.paidCost) > 0 && hasTourKitImportMarker(order)) paymentImportSnapshots.push(row);
      else paymentMismatches.push(row);
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    counts: {
      receiptMismatches: receiptMismatches.length,
      paymentMismatches: paymentMismatches.length,
      receiptImportSnapshots: receiptImportSnapshots.length,
      paymentImportSnapshots: paymentImportSnapshots.length,
    },
    receiptMismatches,
    paymentMismatches,
    receiptImportSnapshots,
    paymentImportSnapshots,
  };
}

function actionableTotal(report) {
  return report.counts.receiptMismatches + report.counts.paymentMismatches;
}

function importSnapshotTotal(report) {
  return report.counts.receiptImportSnapshots + report.counts.paymentImportSnapshots;
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
    const report = await auditFinanceOrderSnapshots(prisma, { systemCodePrefix: args.systemCodePrefix });
    if (args.output) writeReport(report, args.output);
    if (args.mode === 'guard' && actionableTotal(report) > 0) {
      console.error(`FINANCE_ORDER_SNAPSHOT_GUARD_FAILED actionable=${actionableTotal(report)} importSnapshots=${importSnapshotTotal(report)}`);
      console.error(JSON.stringify(report.counts));
      process.exitCode = 1;
      return;
    }
    if (!args.output) writeReport(report, undefined);
    console.log(`FINANCE_ORDER_SNAPSHOT_AUDIT_OK actionable=${actionableTotal(report)} importSnapshots=${importSnapshotTotal(report)}`);
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
  auditFinanceOrderSnapshots,
  main,
};

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

function canonicalCode(value) {
  return String(value || '').trim().replace(/\s+/g, '').toUpperCase();
}

function receiptPrefixTarget(receiptCode, orders) {
  const receiptCanonical = canonicalCode(receiptCode);
  return orders
    .filter((order) => order.canonical && (receiptCanonical === order.canonical || receiptCanonical.startsWith(`${order.canonical}_`)))
    .sort((a, b) => b.canonical.length - a.canonical.length)[0] || null;
}

function compactOrder(order) {
  if (!order) return null;
  return { id: order.id, systemCode: order.systemCode, name: order.name, customerId: order.customerId, tourId: order.tour?.id || null, tourCode: order.tour?.tourCode || null, tourName: order.tour?.name || null };
}

function compactReceipt(receipt) {
  return { id: receipt.id, receiptCode: receipt.receiptCode, receiptAmount: String(receipt.receiptAmount), customerId: receipt.customerId, tourId: receipt.tourId };
}

async function auditFinanceReceiptLinks(prisma) {
  const [orders, receipts] = await Promise.all([
    prisma.order.findMany({
      where: { deletedAt: null },
      select: { id: true, systemCode: true, name: true, customerId: true },
    }),
    prisma.financeReceipt.findMany({
      where: { approvalStatus: 'APPROVED', deletedAt: null, reversalOfId: null },
      select: {
        id: true,
        receiptCode: true,
        receiptAmount: true,
        customerId: true,
        tourId: true,
        orders: { select: { id: true, orderId: true, orderCode: true, tourCode: true, tourName: true, amount: true }, orderBy: { createdAt: 'asc' } },
      },
      orderBy: [{ paymentDate: 'asc' }, { receiptCode: 'asc' }],
    }),
  ]);

  const tours = await prisma.tour.findMany({
    where: { orderId: { in: orders.map((order) => order.id) }, deletedAt: null },
    select: { id: true, orderId: true, tourCode: true, name: true },
    orderBy: { createdAt: 'asc' },
  });
  const firstTourByOrder = new Map();
  for (const tour of tours) if (!firstTourByOrder.has(tour.orderId)) firstTourByOrder.set(tour.orderId, tour);
  const orderCandidates = orders
    .map((order) => ({ ...order, canonical: canonicalCode(order.systemCode), tour: firstTourByOrder.get(order.id) || null }))
    .filter((order) => order.canonical);

  const mislinkedReceipts = [];
  const skippedReceipts = [];
  for (const receipt of receipts) {
    if (receipt.orders.length !== 1 || !receipt.orders[0].orderId) continue;
    const currentOrder = orderCandidates.find((order) => order.id === receipt.orders[0].orderId) || null;
    const targetOrder = receiptPrefixTarget(receipt.receiptCode, orderCandidates);
    if (!targetOrder || !currentOrder || targetOrder.id === currentOrder.id) continue;
    const payload = { receipt: compactReceipt(receipt), currentOrder: compactOrder(currentOrder), targetOrder: compactOrder(targetOrder), receiptOrderId: receipt.orders[0].id, amount: String(receipt.orders[0].amount) };
    if (!targetOrder.customerId || targetOrder.customerId !== receipt.customerId || !targetOrder.tour?.id) skippedReceipts.push({ ...payload, reason: !targetOrder.tour?.id ? 'TARGET_TOUR_MISSING' : 'CUSTOMER_MISMATCH' });
    else mislinkedReceipts.push(payload);
  }

  return {
    generatedAt: new Date().toISOString(),
    counts: { mislinkedReceipts: mislinkedReceipts.length, skippedReceipts: skippedReceipts.length },
    mislinkedReceipts,
    skippedReceipts,
  };
}

async function backfillFinanceReceiptLinks(prisma, options = {}) {
  const dryRun = options.dryRun !== false;
  const before = await auditFinanceReceiptLinks(prisma);
  const updated = { receipts: before.mislinkedReceipts.length, receiptOrders: before.mislinkedReceipts.length, cashflow: 0, customerLedger: 0 };

  for (const row of before.mislinkedReceipts) {
    const [cashflowCount, ledgerCount] = await Promise.all([
      prisma.financeCashflowEntry.count({ where: { receiptId: row.receipt.id } }),
      prisma.customerLedgerEntry.count({ where: { OR: [{ receiptId: row.receipt.id }, { sourceType: 'FINANCE_RECEIPT', sourceId: row.receipt.id }] } }),
    ]);
    updated.cashflow += cashflowCount;
    updated.customerLedger += ledgerCount;
  }

  if (!dryRun && before.mislinkedReceipts.length) {
    await prisma.$transaction(async (tx) => {
      for (const row of before.mislinkedReceipts) {
        await tx.financeReceipt.update({ where: { id: row.receipt.id }, data: { tourId: row.targetOrder.tourId } });
        await tx.financeReceiptOrder.update({
          where: { id: row.receiptOrderId },
          data: { orderId: row.targetOrder.id, orderCode: row.targetOrder.systemCode, tourCode: row.targetOrder.tourCode, tourName: row.targetOrder.tourName },
        });
        await tx.financeCashflowEntry.updateMany({ where: { receiptId: row.receipt.id }, data: { tourId: row.targetOrder.tourId } });
        await tx.customerLedgerEntry.updateMany({
          where: { OR: [{ receiptId: row.receipt.id }, { sourceType: 'FINANCE_RECEIPT', sourceId: row.receipt.id }] },
          data: { orderId: row.targetOrder.id, tourId: row.targetOrder.tourId },
        });
      }
    });
  }

  return { generatedAt: new Date().toISOString(), dryRun, updated, before, after: dryRun ? undefined : await auditFinanceReceiptLinks(prisma) };
}

function issueTotal(report) {
  return report.counts.mislinkedReceipts + report.counts.skippedReceipts;
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
      const report = await backfillFinanceReceiptLinks(prisma, { dryRun: args.dryRun });
      writeReport(report, args.output);
      console.log(`FINANCE_RECEIPT_LINK_BACKFILL_${args.dryRun ? 'DRY_RUN' : 'APPLIED'} receipts=${report.updated.receipts} receiptOrders=${report.updated.receiptOrders} cashflow=${report.updated.cashflow} customerLedger=${report.updated.customerLedger}`);
      return;
    }

    const report = await auditFinanceReceiptLinks(prisma);
    if (args.output) writeReport(report, args.output);
    if (args.mode === 'guard' && issueTotal(report) > 0) {
      console.error(`FINANCE_RECEIPT_LINK_GUARD_FAILED issues=${issueTotal(report)}`);
      console.error(JSON.stringify(report.counts));
      process.exitCode = 1;
      return;
    }
    if (!args.output) writeReport(report, undefined);
    console.log(`FINANCE_RECEIPT_LINK_AUDIT_OK issues=${issueTotal(report)}`);
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
  auditFinanceReceiptLinks,
  backfillFinanceReceiptLinks,
  canonicalCode,
  main,
};

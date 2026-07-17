#!/usr/bin/env node
const fs = require('fs');
const { execFileSync } = require('child_process');

const controller = fs.readFileSync('apps/api/src/modules/suppliers/suppliers.controller.ts', 'utf8');
const service = fs.readFileSync('apps/api/src/modules/suppliers/suppliers.service.ts', 'utf8');
const page = fs.readFileSync('apps/web/app/suppliers/page.tsx', 'utf8');
const failures = [];

function includes(source, token, message) {
  if (!source.includes(token)) failures.push(message);
}

function before(source, left, right, message) {
  const leftIndex = source.indexOf(left);
  const rightIndex = source.indexOf(right);
  if (leftIndex === -1 || rightIndex === -1 || leftIndex > rightIndex) failures.push(message);
}

includes(controller, "@Get('finance-summaries')", 'Batch supplier finance route must exist.');
includes(controller, "@Get(':id/finance-summary')", 'Detail supplier finance route must exist.');
includes(controller, "@RequirePermissions('supplier.view', 'finance.payment.view')", 'Supplier finance routes must require supplier.view and finance.payment.view.');
before(controller, "@Get('finance-summaries')", "@Get(':routeKey')", 'Batch route must be before dynamic supplier route.');
before(controller, "@Get(':id/finance-summary')", "@Get(':type/:id')", 'Detail finance route must be before typed dynamic detail route.');

for (const token of [
  'listSupplierFinanceSummaries(ids',
  'supplierFinanceSummary(id',
  'canViewSupplierFinancialFields(user)',
  'branchDepartmentScopeWhere<Prisma.SupplierLedgerEntryWhereInput>',
  'branchDepartmentScopeWhere<Prisma.FinancePaymentWhereInput>',
  'operationVoucherScopeWhere',
  'supplierPaymentRequestScopeWhere',
  'supplierLedgerEntry.groupBy',
  'financePayment.groupBy',
  'operationVoucher.groupBy',
  'supplierPaymentItem.groupBy',
  'financeLinksForSupplier',
]) {
  includes(service, token, `Supplier service missing ${token}`);
}

const summaryStart = service.indexOf('async listSupplierFinanceSummaries');
const summaryEnd = summaryStart === -1 ? -1 : service.indexOf('async createSupplier', summaryStart);
const summarySection = summaryStart === -1 ? '' : service.slice(summaryStart, summaryEnd === -1 ? undefined : summaryEnd);
for (const unsafe of ['supplier.update({', 'financePayment.create({', 'supplierLedgerEntry.create({', 'supplierPaymentRequest.create({']) {
  if (summarySection.includes(unsafe)) failures.push(`Supplier finance summary must be read-only and not call ${unsafe}`);
}

includes(page, 'type SupplierFinanceSummary', 'Common Supplier page must type supplier finance summaries.');
includes(page, '/suppliers/finance-summaries?ids=', 'Common Supplier page must fetch batch finance summaries.');
includes(page, 'supplierFinanceSummaryById', 'Common Supplier page must map summaries by supplier id.');
includes(page, 'formatMoney(', 'Common Supplier page must render finance totals.');
includes(page, 'finance.payment.view', 'Common Supplier page must keep finance permission gating.');
includes(page, 'summary.links.financeDebt', 'Common Supplier page must link to Finance supplier debt.');
includes(page, 'summary.links.financePayments', 'Common Supplier page must link to Finance payments.');
includes(page, 'summary.links.operationVouchers', 'Common Supplier page must link to Operation vouchers.');
includes(page, 'summary.links.supplierPaymentRequests', 'Common Supplier page must link to Supplier payment requests.');

if (failures.length) {
  console.error('FAIL_SUPPLIERS_FINANCE_LINKS_CONTRACT');
  for (const failure of failures) console.error(failure);
  process.exit(1);
}

execFileSync('npm', ['run', 'build', '--workspace', '@smarttour/api'], { stdio: 'inherit' });
const { SuppliersService } = require('../apps/api/dist/modules/suppliers/suppliers.service.js');

const calls = [];
const prisma = {
  supplier: {
    findMany: async (args) => {
      calls.push(['suppliers', args.where]);
      const ids = Array.isArray(args.where?.id?.in) ? args.where.id.in : [];
      return ids.map((id) => ({ id }));
    },
    findFirst: async (args) => {
      calls.push(['supplierFirst', args.where]);
      return { id: args.where.id };
    },
  },
  supplierLedgerEntry: {
    groupBy: async (args) => {
      calls.push(['ledger', args.where]);
      return [{ supplierId: 'supplier-a', _sum: { creditAmount: 1000, debitAmount: 250 }, _count: { _all: 2 } }];
    },
    findMany: async (args) => {
      calls.push(['ledgerRows', args.where]);
      return [];
    },
  },
  financePayment: {
    groupBy: async (args) => {
      calls.push(['payments', args.where]);
      return [{ supplierId: 'supplier-a', approvalStatus: 'APPROVED', _sum: { paymentAmount: 250, totalAmount: 250, remainingAmount: 0 }, _count: { _all: 1 } }];
    },
    findMany: async (args) => {
      calls.push(['paymentRows', args.where]);
      return [];
    },
  },
  operationVoucher: {
    groupBy: async (args) => {
      calls.push(['vouchers', args.where]);
      return [{ supplierId: 'supplier-a', _sum: { totalAmount: 1000, paidAmount: 250, remainAmount: 750 }, _count: { _all: 1 } }];
    },
    findMany: async (args) => {
      calls.push(['voucherRows', args.where]);
      return [];
    },
  },
  supplierPaymentItem: {
    groupBy: async (args) => {
      calls.push(['requestItems', args.where]);
      return [{ supplierId: 'supplier-a', _sum: { amount: 400 }, _count: { _all: 1 } }];
    },
  },
  supplierPaymentRequest: {
    findMany: async (args) => {
      calls.push(['requestRows', args.where]);
      return [];
    },
  },
};

function userWith(permissions) {
  return {
    id: 'user-a',
    branch: 'HN',
    department: 'OPS',
    roles: [{ role: { status: 'ACTIVE', permissions: permissions.map((permission) => ({ permission })) } }],
  };
}

(async () => {
  const serviceInstance = new SuppliersService(prisma, {});
  const scopedFinanceUser = userWith(['supplier.view', 'finance.payment.view', 'data.scope.branch', 'data.scope.department']);
  const rows = await serviceInstance.listSupplierFinanceSummaries(['supplier-a'], scopedFinanceUser);
  const row = rows[0];
  if (!row || row.supplierId !== 'supplier-a') throw new Error('Supplier finance summary must return one row for supplier-a.');
  if (row.summary.payable !== 1000 || row.summary.paid !== 250 || row.summary.balance !== 750 || row.summary.ledgerCount !== 2) {
    throw new Error(`Supplier summary must derive ledger totals from SupplierLedgerEntry sums, got ${JSON.stringify(row.summary)}`);
  }
  if (row.vouchers.remainingAmount !== 750 || row.vouchers.count !== 1) {
    throw new Error('Supplier summary must include operation voucher remaining totals.');
  }
  if (row.paymentRequests.amount !== 400 || row.paymentRequests.count !== 1) {
    throw new Error('Supplier summary must include supplier payment request totals.');
  }
  if (!row.links?.financeDebt || !row.links?.financePayments || !row.links?.operationVouchers || !row.links?.supplierPaymentRequests) {
    throw new Error('Supplier finance summary must include navigation links.');
  }
  for (const label of ['ledger', 'payments']) {
    const where = JSON.stringify(calls.find((call) => call[0] === label)?.[1] || {});
    if (!where.includes('HN') || !where.includes('OPS')) {
      throw new Error(`Supplier finance ${label} query must apply branch/department scope, got ${where}`);
    }
  }
  try {
    await serviceInstance.listSupplierFinanceSummaries(['supplier-a'], userWith(['supplier.view']));
    throw new Error('Expected missing finance permission to fail.');
  } catch (error) {
    if ((error?.status ?? error?.response?.statusCode) !== 403) throw error;
  }
  console.log('TEST_SUPPLIERS_FINANCE_LINKS_CONTRACT_OK');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

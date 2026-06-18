#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"

cd "$REPO_DIR"
docker run --rm -i -v "$PWD:/workspace:ro" -w /workspace node:22-alpine node <<'NODE'
const fs = require('fs');

const service = fs.readFileSync('apps/api/src/modules/reports/reports.service.ts', 'utf8');
const controller = fs.readFileSync('apps/api/src/modules/reports/reports.controller.ts', 'utf8');
const dto = fs.readFileSync('apps/api/src/modules/reports/dto/report-query.dto.ts', 'utf8');
const client = fs.readFileSync('apps/web/app/reports/ReportsClient.tsx', 'utf8');
const css = fs.readFileSync('apps/web/app/globals.css', 'utf8');

const failures = [];
function requireText(source, text, label) {
  if (!source.includes(text)) failures.push(label || `missing text: ${text}`);
}

requireText(controller, 'finance(@Query() query: FinanceReportQueryDto', 'reports finance endpoint must use FinanceReportQueryDto so hotel/order/document finance data is reportable');
requireText(dto, "const FINANCE_REPORT_DATE_FIELDS = ['createdAt', 'bookingDate', 'startDate', 'endDate', 'paymentDate', 'settledAt', 'documentDate']", 'finance reports need order and document date fields');
requireText(dto, 'export class FinanceReportQueryDto', 'FinanceReportQueryDto must exist');
requireText(service, 'financeOrderRows', 'ReportsService must expose order/tour financial rows');
requireText(service, 'financeReconciliationRows', 'ReportsService must expose reconciliation rows');
requireText(service, 'receiptRows', 'ReportsService finance response must include receiptRows');
requireText(service, 'paymentRows', 'ReportsService finance response must include paymentRows');
requireText(service, 'customerDebtRows', 'ReportsService finance response must include customerDebtRows');
requireText(service, 'supplierDebtRows', 'ReportsService finance response must include supplierDebtRows');
requireText(service, 'issueCount', 'finance summary must include issueCount');
requireText(service, 'orphanReceiptRows', 'finance reconciliation must include orphan receipts');
requireText(service, 'orphanPaymentRows', 'finance reconciliation must include orphan payments');

for (const label of [
  'Tổng quan tài chính',
  'Theo đơn / tour',
  'Phiếu thu',
  'Phiếu chi',
  'Công nợ khách hàng',
  'Công nợ nhà cung cấp',
  'Đối soát',
]) {
  requireText(client, label, `ReportsClient missing finance sub-tab label: ${label}`);
}
for (const key of ['financeView', 'orderRows', 'receiptRows', 'paymentRows', 'customerDebtRows', 'supplierDebtRows', 'reconciliationRows']) {
  requireText(client, key, `ReportsClient must render hybrid finance data key: ${key}`);
}
requireText(client, "active === 'finance' ? renderFinanceHybrid()", 'finance tab must use dedicated hybrid renderer');
requireText(client, "query.dateField = 'documentDate'", 'receipt/payment/debt sub views must be able to use documentDate filtering');
requireText(client, 'Theo ch\\u1ee9ng t\\u1eeb', 'finance order rows must label evidence-based receipt/payment amounts clearly');
requireText(client, 'Snapshot TourKit', 'finance order rows must expose historical TourKit snapshot amounts separately');
requireText(client, 'financeSource', 'finance order rows must render financeSource classification');
requireText(client, 'tourkit_import_snapshot', 'finance order rows must identify TourKit import snapshot rows');
requireText(client, 'snapshotPaidAmount', 'finance order rows must render snapshotPaidAmount');
requireText(client, 'snapshotPaidCost', 'finance order rows must render snapshotPaidCost');
requireText(css, '.financeReportTabs', 'missing finance report tab styles');
requireText(css, '.financeReportTable', 'missing finance report table styles');
requireText(css, '.financeIssueBadge', 'missing finance issue badge styles');

if (failures.length) {
  console.error('FAIL_REPORTS_FINANCE_HYBRID_CONTRACT');
  failures.forEach((failure) => console.error(failure));
  process.exit(1);
}
console.log('TEST_REPORTS_FINANCE_HYBRID_CONTRACT_OK');
NODE

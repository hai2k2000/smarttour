const fs = require('fs');
const path = require('path');

const root = process.cwd();

const globals = fs.readFileSync(path.join(root, 'apps/web/app/globals.css'), 'utf8');
const popup = fs.readFileSync(path.join(root, 'apps/web/app/TableRowDetailPopup.tsx'), 'utf8');

const listTables = [
  'orderListTable',
  'hotelListTable',
  'tourProgramTable',
  'fitTourListTable',
  'quoteListTable',
  'quoteComboListTable',
  'quotationListTable',
  'reportTable',
  'customerTable',
  'commissionTable',
  'financeTable',
  'operationsTable',
  'securityTable',
  'hotelInventoryTable',
  'reconciliationItemTable',
];

const failures = [];

for (const tableClass of listTables) {
  const compactSelector = `table.${tableClass}`;
  if (!globals.includes(`:has(> ${compactSelector})`)) {
    failures.push(`globals.css: missing compact selector for ${tableClass}`);
  }
  if (!popup.includes(`table.${tableClass}`)) {
    failures.push(`TableRowDetailPopup.tsx: missing row detail selector for ${tableClass}`);
  }
}

if (!globals.includes('--list-visible-rows: 10')) {
  failures.push('globals.css: compact list viewport must show 10 rows');
}

if (failures.length) {
  console.error(['LIST_TABLE_COMPACT_AUDIT_FAILED', ...failures].join('\n'));
  process.exit(1);
}

console.log('LIST_TABLE_COMPACT_AUDIT_OK');

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

function blockAfter(anchor, token) {
  const anchorIndex = globals.indexOf(anchor);
  const tokenIndex = anchorIndex >= 0 ? globals.indexOf(token, anchorIndex) : -1;
  if (tokenIndex < 0) return '';
  const previousRuleEnd = globals.lastIndexOf('}', tokenIndex);
  const blockEnd = globals.indexOf('}', tokenIndex);
  if (blockEnd < 0) return '';
  return globals.slice(previousRuleEnd >= 0 ? previousRuleEnd + 1 : 0, blockEnd + 1);
}

function ruleBlock(selector) {
  const selectorIndex = globals.indexOf(selector);
  if (selectorIndex < 0) return '';
  const blockEnd = globals.indexOf('}', selectorIndex);
  if (blockEnd < 0) return '';
  return globals.slice(selectorIndex, blockEnd + 1);
}

const fixedLayoutBlock = blockAfter('Compact list tables', 'table-layout: fixed;');
const cellClamp2Block = ruleBlock('.cellClamp2');
const bindTitleStart = popup.indexOf('function bindTableCellTitles');
const bindTitleEnd = popup.indexOf('function detailFromRow', bindTitleStart);
const bindTitleBlock = bindTitleStart >= 0 && bindTitleEnd > bindTitleStart ? popup.slice(bindTitleStart, bindTitleEnd) : '';

for (const tableClass of listTables) {
  const compactSelector = `table.${tableClass}`;
  if (!globals.includes(`:has(> ${compactSelector})`)) {
    failures.push(`globals.css: missing compact selector for ${tableClass}`);
  }
  if (!popup.includes(`table.${tableClass}`)) {
    failures.push(`TableRowDetailPopup.tsx: missing row detail selector for ${tableClass}`);
  }
  if (!fixedLayoutBlock.includes(`.${tableClass}`)) {
    failures.push(`globals.css: missing fixed table layout for ${tableClass}`);
  }
}

if (!globals.includes('--list-visible-rows: 10')) {
  failures.push('globals.css: compact list viewport must show 10 rows');
}

if (!cellClamp2Block) {
  failures.push('globals.css: missing .cellClamp2 rule');
} else {
  if (cellClamp2Block.includes('-webkit-line-clamp: 2')) {
    failures.push('globals.css: .cellClamp2 must not clamp to 2 lines');
  }
  for (const token of ['white-space: nowrap', 'text-overflow: ellipsis', 'overflow: hidden']) {
    if (!cellClamp2Block.includes(token)) failures.push(`globals.css: .cellClamp2 missing ${token}`);
  }
}

if (!bindTitleBlock) {
  failures.push('TableRowDetailPopup.tsx: missing bindTableCellTitles');
} else if (!bindTitleBlock.includes("cell.hasAttribute('title')")) {
  failures.push('TableRowDetailPopup.tsx: bindTableCellTitles must preserve existing business tooltips');
}

if (failures.length) {
  console.error(['LIST_TABLE_COMPACT_AUDIT_FAILED', ...failures].join('\n'));
  process.exit(1);
}

console.log('LIST_TABLE_COMPACT_AUDIT_OK');

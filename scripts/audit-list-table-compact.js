const fs = require('fs');
const path = require('path');

const root = process.cwd();

const globals = fs.readFileSync(path.join(root, 'apps/web/app/globals.css'), 'utf8');
const popup = fs.readFileSync(path.join(root, 'apps/web/app/TableRowDetailPopup.tsx'), 'utf8');
const reportsClient = fs.readFileSync(path.join(root, 'apps/web/app/reports/ReportsClient.tsx'), 'utf8');
const securityClient = fs.readFileSync(path.join(root, 'apps/web/app/security/SecurityClient.tsx'), 'utf8');

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
const bindRowsStart = popup.indexOf('function bindTableRows');
const bindRowsEnd = popup.indexOf('function detailFromRow', bindRowsStart);
const bindRowsBlock = bindRowsStart >= 0 && bindRowsEnd > bindRowsStart ? popup.slice(bindRowsStart, bindRowsEnd) : '';
const keydownStart = popup.indexOf('const onKeyDown');
const keydownEnd = popup.indexOf('document.addEventListener', keydownStart);
const keydownBlock = keydownStart >= 0 && keydownEnd > keydownStart ? popup.slice(keydownStart, keydownEnd) : '';

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

if (!bindRowsBlock) {
  failures.push('TableRowDetailPopup.tsx: missing bindTableRows for keyboard row focus');
} else {
  for (const token of ['tabIndex = 0', "aria-label", "aria-haspopup"]) {
    if (!bindRowsBlock.includes(token)) failures.push(`TableRowDetailPopup.tsx: bindTableRows missing ${token}`);
  }
}

for (const token of ['bindTableRows();', 'bindTableRows(node)']) {
  if (!popup.includes(token)) failures.push(`TableRowDetailPopup.tsx: missing ${token}`);
}

if (!keydownBlock) {
  failures.push('TableRowDetailPopup.tsx: missing row detail keydown handler');
} else {
  for (const token of ["event.key === 'Enter'", "event.key === ' '", 'preventDefault()', 'openRowDetail']) {
    if (!keydownBlock.includes(token)) failures.push(`TableRowDetailPopup.tsx: keydown handler missing ${token}`);
  }
}

if (reportsClient.includes(') : <div className="tableEmptyState"')) {
  failures.push('ReportsClient.tsx: empty state must render inside reportTable tbody');
}
if (!reportsClient.includes('td colSpan={table.getAllLeafColumns().length} className="tableEmptyState"')) {
  failures.push('ReportsClient.tsx: reportTable empty state must reserve compact table height');
}
if (securityClient.includes('</div>\n        {!users.length ? <div className="tableEmptyState"')) {
  failures.push('SecurityClient.tsx: user empty state must render inside securityTable tbody');
}
if (securityClient.includes('</div>\n        {!roles.length ? <div className="tableEmptyState"')) {
  failures.push('SecurityClient.tsx: role empty state must render inside securityTable tbody');
}
for (const token of [
  'users.length === 0 ? <tr><td colSpan={6} className="tableEmptyState"',
  'roles.length === 0 ? <tr><td colSpan={7} className="tableEmptyState"',
]) {
  if (!securityClient.includes(token)) failures.push(`SecurityClient.tsx: missing ${token}`);
}

if (failures.length) {
  console.error(['LIST_TABLE_COMPACT_AUDIT_FAILED', ...failures].join('\n'));
  process.exit(1);
}

console.log('LIST_TABLE_COMPACT_AUDIT_OK');

#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"
cd "$REPO_DIR"

node <<'NODE'
const fs = require('fs');

const source = fs.readFileSync('apps/web/app/AppShell.tsx', 'utf8');
const css = fs.readFileSync('apps/web/app/globals.css', 'utf8');
const failures = [];

const expectedGroupOrder = [
  'Workspace',
  'Nhà cung cấp',
  'CRM',
  'Báo Giá',
  'Đơn hàng/LKH',
  'Booking Phòng/Khách sạn',
  'Vé Máy Bay',
  'Hướng dẫn viên',
  'Quản lý xe',
  'Điều hành Tour',
  'Tài chính/Kế toán',
  'KPIs',
  'Hoa Hồng',
  'Dự án & Công việc',
  'HRM',
  'Marketing',
  'Báo cáo',
  'Cài đặt hệ thống',
];

const groupsBlock = source.slice(source.indexOf('const groups = ['), source.indexOf('const shortcuts'));
let previousIndex = -1;
for (const title of expectedGroupOrder) {
  const token = `title: '${title}'`;
  const index = groupsBlock.indexOf(token);
  if (index < 0) failures.push(`missing menu group: ${title}`);
  if (index >= 0 && index <= previousIndex) failures.push(`menu group out of order: ${title}`);
  if (index >= 0) previousIndex = index;
}

for (const token of [
  'openNavGroups',
  'toggleNavGroup',
  'smarttour.sidebar.navGroups',
  'navGroupHeader',
  'aria-expanded={groupOpen}',
  'aria-controls={`nav-group-${group.key}`}',
  'navGroupItems',
  'navGroupToggleIcon',
]) {
  if (!source.includes(token)) failures.push(`AppShell missing collapsible menu token: ${token}`);
}

for (const token of [
  '.navGroupHeader',
  '.navGroupHeader:hover',
  '.navGroupToggleIcon',
  '.navGroup.collapsed .navGroupItems',
  '.sidebarCollapsed .navGroupHeader span',
]) {
  if (!css.includes(token)) failures.push(`globals.css missing submenu style: ${token}`);
}

if (failures.length) {
  console.error('FAIL_APP_SHELL_MENU_CONTRACT');
  failures.forEach((failure) => console.error(failure));
  process.exit(1);
}

console.log('TEST_APP_SHELL_MENU_CONTRACT_OK');
NODE

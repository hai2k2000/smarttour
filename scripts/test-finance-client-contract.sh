#!/usr/bin/env bash
set -euo pipefail
REPO_DIR="${REPO_DIR:-/opt/smarttour}"
cd "$REPO_DIR"
docker run --rm -i -v "$PWD:/workspace:ro" -w /workspace node:22-alpine node <<'NODE'
const fs = require('fs');
const source = fs.readFileSync('apps/web/app/finance/FinanceClient.tsx', 'utf8');
const css = fs.readFileSync('apps/web/app/globals.css', 'utf8');
const controller = fs.readFileSync('apps/api/src/modules/finance/finance.controller.ts', 'utf8');
const appShell = fs.readFileSync('apps/web/app/AppShell.tsx', 'utf8');
const i18n = fs.readFileSync('apps/web/app/i18n.ts', 'utf8');
const failures = [];
const requiredTabs = ['Phiếu thu chờ', 'Phiếu thu', 'Phiếu chi', 'Hóa đơn VAT', 'Dòng tiền', 'Công nợ'];
for (const label of requiredTabs) if (!source.includes(label)) failures.push(`missing finance tab label: ${label}`);
if (!source.includes('Promise.allSettled') || !source.includes("label: 'Công nợ khách hàng'") || !source.includes('Không tải được ${failed.join')) failures.push('load() must report each failed API branch');
for (const action of ["approve: 'Đã duyệt chứng từ'", "cancel: 'Đã hủy chứng từ'", "reject: 'Đã từ chối chứng từ'"]) if (!source.includes(action)) failures.push(`missing action-specific notice: ${action}`);
if (!source.includes('Đã tải ${uploaded.length}/${files.length} tệp hóa đơn') || !source.includes('Tệp lỗi:')) failures.push('multi-file upload must report partial failures');
if (!source.includes('Đã nhập thành công ${imported} dòng CSV') || !source.includes('File CSV không được vượt quá 5 MB')) failures.push('CSV import result and validation messages are incomplete');
if (!source.includes("tab === 'cashflow' ? 'cashflow' : null")) failures.push('debt tab must not export receipt CSV');
if (!source.includes('Phiếu thu chờ duyệt') || !source.includes("receipts.filter((row) => row.approvalStatus === 'PENDING')")) failures.push('pending receipts must be a derived view, not a separate mixed load flow');
if (!source.includes('Dữ liệu chưa lưu sẽ bị mất') || !source.includes("event.key === 'Escape'")) failures.push('FinanceModal must protect dirty form state');
if (!source.includes('Thao tác này sẽ tạo bút toán đảo') || !source.includes('Chứng từ sẽ được ghi nhận vào sổ tài chính')) failures.push('row actions need consequence-aware confirmation');
if (!source.includes('agingTitle(row.aging)') || !source.includes('quá hạn</span>')) failures.push('debt tables must expose overdue counts and aging detail');
if (!css.includes('.financeNotice-error') || !css.includes('.status-overdue') || !css.includes('.financeModalPanel') || !css.includes('.financeFilterLabel')) failures.push('finance notice/status/modal/filter styles are incomplete');
if (!source.includes('className="financeFilterLabel"')) failures.push('finance search label must not collapse the input grid');
if (!appShell.includes("label: 'Phi\u1ebfu thu ch\u1edd'") || !appShell.includes("label: 'H\u00f3a \u0111\u01a1n VAT'")) failures.push('finance sidebar labels must use full Vietnamese wording');
for (const label of ["QR: 'Thanh to\u00e1n QR'", "OFFSET: 'B\u00f9 tr\u1eeb'", "OTHER: 'Kh\u00e1c'"]) if (!i18n.includes(label)) failures.push(`missing Vietnamese payment method label: ${label}`);
if ((controller.match(/financeImportInterceptorOptions\(\)/g) || []).length !== 2) failures.push('frontend multipart CSV import requires backend file interceptors');
if (failures.length) {
  console.error('FAIL_FINANCE_CLIENT_CONTRACT');
  failures.forEach((failure) => console.error(failure));
  process.exit(1);
}
console.log('TEST_FINANCE_CLIENT_CONTRACT_OK');
NODE

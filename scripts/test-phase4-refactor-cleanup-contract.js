#!/usr/bin/env node
const fs = require('fs');

const failures = [];
function read(path) {
  if (!fs.existsSync(path)) {
    failures.push(`${path} is missing`);
    return '';
  }
  return fs.readFileSync(path, 'utf8');
}
function requireToken(source, token, label) {
  if (!source.includes(token)) failures.push(label || `missing ${token}`);
}
function forbidToken(source, token, label) {
  if (source.includes(token)) failures.push(label || `forbidden ${token}`);
}

const queryHelper = read('apps/api/src/modules/query-validation.ts');
requireToken(queryHelper, 'export const trimOptional', 'query helper must export trimOptional');
requireToken(queryHelper, 'export const upperOptional', 'query helper must export upperOptional');
requireToken(queryHelper, 'export const enumValues', 'query helper must export enumValues');
requireToken(queryHelper, 'export const uniqueValues', 'query helper must export uniqueValues');
requireToken(queryHelper, 'export const readonlyValues', 'query helper must export readonlyValues for @IsIn arrays');

const financeDto = read('apps/api/src/modules/finance/dto/finance-query.dto.ts');
requireToken(financeDto, "from '../../query-validation'", 'finance query DTO must use shared query validation helper');
requireToken(financeDto, '@IsIn(readonlyValues(FINANCE_APPROVAL_STATUSES))', 'finance status must use helper-backed enum validation');

const reportDto = read('apps/api/src/modules/reports/dto/report-query.dto.ts');
requireToken(reportDto, "from '../../query-validation'", 'report query DTO must use shared query validation helper');
forbidToken(reportDto, 'const trimOptional =', 'report query DTO must not keep a duplicate trimOptional helper');
forbidToken(reportDto, 'const upperOptional =', 'report query DTO must not keep a duplicate upperOptional helper');
forbidToken(reportDto, 'const enumValues =', 'report query DTO must not keep a duplicate enumValues helper');
forbidToken(reportDto, 'const uniqueValues =', 'report query DTO must not keep a duplicate uniqueValues helper');

const projection = read('apps/api/src/modules/suppliers/supplier-projection.ts');
requireToken(projection, 'SUPPLIER_FINANCIAL_VIEW_PERMISSION', 'supplier projection helper must own the financial view permission constant');
requireToken(projection, 'maskSupplierFinancialFields', 'supplier projection helper must export maskSupplierFinancialFields');
requireToken(projection, 'canViewSupplierFinancialFields', 'supplier projection helper must export canViewSupplierFinancialFields');
requireToken(projection, 'HOTEL_PROFILE_SENSITIVE_FIELDS', 'supplier projection helper must mask hotel profile sensitive fields');

const suppliersService = read('apps/api/src/modules/suppliers/suppliers.service.ts');
requireToken(suppliersService, "from './supplier-projection'", 'suppliers service must import supplier projection helper');
forbidToken(suppliersService, 'const SUPPLIER_SENSITIVE_FIELDS', 'suppliers service must not keep sensitive field constants inline');
forbidToken(suppliersService, 'private maskSupplierFinancialFields', 'suppliers service must not keep projection implementation inline');

const filesService = read('apps/api/src/modules/files/files.service.ts');
const assertObjectAccessStart = filesService.indexOf('async assertObjectAccess(');
const assertObjectAccessEnd = filesService.indexOf('\n  async removeIfPresent', assertObjectAccessStart);
const assertObjectAccessBlock = assertObjectAccessStart === -1 ? '' : filesService.slice(assertObjectAccessStart, assertObjectAccessEnd === -1 ? filesService.length : assertObjectAccessEnd);
requireToken(filesService, 'type FileAccessRootHandler', 'files service must define root-specific access handler type');
requireToken(filesService, 'const FILE_ACCESS_ROOT_HANDLERS', 'files service must dispatch object access by root map');
requireToken(assertObjectAccessBlock, 'FILE_ACCESS_ROOT_HANDLERS[root]', 'assertObjectAccess must use root handler dispatch map');
for (const token of ["if (root === 'customers')", "if (root === 'suppliers')", "if (root === 'tour-guides')", "if (root === 'fit-tours')", "if (root === 'finance')"]) {
  forbidToken(assertObjectAccessBlock, token, `assertObjectAccess must not use root if-chain token ${token}`);
}

const orphanScript = read('scripts/audit-orphan-files.js');
requireToken(orphanScript, 'DRY RUN', 'orphan audit must be dry-run oriented');
requireToken(orphanScript, '--delete', 'orphan audit must require explicit --delete for deletion');
requireToken(orphanScript, 'listObjectsV2', 'orphan audit must list MinIO objects');
requireToken(orphanScript, 'removeObject', 'orphan audit must support explicit deletion');
requireToken(orphanScript, 'inferObjectScope', 'orphan audit must infer object root/entity from key');
requireToken(orphanScript, 'reason', 'orphan audit output must include orphan reason');
requireToken(orphanScript, 'process.exitCode = 1', 'orphan audit must fail safely on unexpected errors');


const opsRunbook = read('docs/smarttour-ops-runbook.md');
requireToken(opsRunbook, '## Storage Orphan Audit', 'ops runbook must document storage orphan audit');
requireToken(opsRunbook, 'node scripts/audit-orphan-files.js --dry-run', 'ops runbook must document dry-run orphan audit command');
requireToken(opsRunbook, 'node scripts/audit-orphan-files.js --delete', 'ops runbook must document explicit delete command');
requireToken(opsRunbook, 'Never run `--delete` from an automated healthcheck or backup job.', 'ops runbook must warn against automated deletion');

const readinessTracker = read('docs/production-readiness-tracker.md');
requireToken(readinessTracker, 'MinIO orphan cleanup now has a dry-run-first audit script', 'readiness tracker must mention orphan audit cleanup path');

if (failures.length) {
  console.error('FAIL_PHASE4_REFACTOR_CLEANUP_CONTRACT');
  for (const failure of failures) console.error(failure);
  process.exit(1);
}
console.log('TEST_PHASE4_REFACTOR_CLEANUP_CONTRACT_OK');

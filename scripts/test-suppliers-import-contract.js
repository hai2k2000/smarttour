const fs = require('fs');
const path = require('path');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function includes(source, text, message) {
  if (!source.includes(text)) throw new Error(message);
}

function excludes(source, text, message) {
  if (source.includes(text)) throw new Error(message);
}

function before(source, left, right, message) {
  const leftIndex = source.indexOf(left);
  const rightIndex = source.indexOf(right);
  if (leftIndex < 0) throw new Error(`${message}: missing ${left}`);
  if (rightIndex < 0) throw new Error(`${message}: missing ${right}`);
  if (leftIndex > rightIndex) throw new Error(message);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertThrows(fn, expectedText, label) {
  try {
    fn();
  } catch (error) {
    assert(String(error.message || error).includes(expectedText), `${label} should include ${expectedText}, got ${error.message || error}`);
    return;
  }
  throw new Error(`${label} should throw`);
}

async function runtimeHelperContract() {
  const helperPath = path.resolve('apps/api/dist/modules/suppliers/supplier-import.js');
  if (!fs.existsSync(helperPath)) throw new Error('Build apps/api before running supplier import runtime contract.');
  const helper = require(helperPath);

  const csvRows = helper.supplierImportRows({ csv: 'supplierCode,category,name,phone\nSUP-1,Hotel,CSV Supplier,0900000000' });
  assert(csvRows.length === 1, 'supplierImportRows must parse inline CSV rows');
  assert(csvRows[0].category === 'Hotel', 'supplierImportRows must keep exported category column');

  const normalized = helper.normalizeSupplierImportRows(csvRows, { canWriteFinancialFields: true });
  assert(normalized.totalRows === 1, 'normalizeSupplierImportRows must report totalRows');
  assert(normalized.validRows === 1, 'normalizeSupplierImportRows must accept a valid root supplier row');
  assert(normalized.rows[0].categoryName === 'Hotel', 'normalizeSupplierImportRows must map category to categoryName');
  assert(normalized.rows[0].dto.supplierCode === 'SUP-1', 'normalizeSupplierImportRows must keep supplierCode');
  assert(normalized.rows[0].dto.name === 'CSV Supplier', 'normalizeSupplierImportRows must keep name');

  const unknownField = helper.normalizeSupplierImportRows([
    { supplierCode: 'SUP-2', category: 'Hotel', name: 'Unknown Field Supplier', unexpectedColumn: 'nope' },
  ], { canWriteFinancialFields: true });
  assert(unknownField.failedRows === 1, 'unknown import columns must fail preview');
  assert(unknownField.errors.some((error) => error.field === 'unexpectedColumn'), 'unknown import column error must name the field');

  const financeBlocked = helper.normalizeSupplierImportRows([
    { supplierCode: 'SUP-3', category: 'Hotel', name: 'Finance Supplier', bankAccountNumber: '123456' },
  ], { canWriteFinancialFields: false });
  assert(financeBlocked.failedRows === 1, 'finance-sensitive supplier import fields must fail without finance permission');
  assert(financeBlocked.errors.some((error) => error.field === 'bankAccountNumber'), 'finance-sensitive import error must name bankAccountNumber');

  assertThrows(
    () => helper.supplierImportRows({ rows: Array.from({ length: 501 }, (_, index) => ({ supplierCode: `SUP-${index}`, category: 'Hotel', name: `Supplier ${index}` })) }),
    'tối đa 500 dòng',
    'row cap',
  );
}

async function main() {
  const controller = read('apps/api/src/modules/suppliers/suppliers.controller.ts');
  const service = read('apps/api/src/modules/suppliers/suppliers.service.ts');
  const helper = read('apps/api/src/modules/suppliers/supplier-import.ts');
  const dto = read('apps/api/src/modules/suppliers/dto/supplier-import.dto.ts');
  const smoke = read('scripts/smoke-suppliers.sh');
  const dependencies = JSON.stringify({
    root: JSON.parse(read('package.json')).dependencies || {},
    rootDev: JSON.parse(read('package.json')).devDependencies || {},
    api: JSON.parse(read('apps/api/package.json')).dependencies || {},
    apiDev: JSON.parse(read('apps/api/package.json')).devDependencies || {},
  }).toLowerCase();

  includes(controller, "@Post('import/preview')", 'Supplier import preview route must exist.');
  includes(controller, "@Post('import')", 'Supplier import write route must exist.');
  includes(controller, "previewSupplierImport(dto, file, request.user)", 'Supplier preview route must pass dto, file, and user.');
  includes(controller, "importSuppliers(dto, file, request.user)", 'Supplier import route must pass dto, file, and user.');
  includes(controller, "FileInterceptor('file', supplierImportInterceptorOptions())", 'Supplier import must accept CSV/XLSX files.');
  includes(controller, '@UseFilters(SupplierImportSizeExceptionFilter)', 'Supplier import must translate file-size errors.');
  includes(controller, "@RequirePermissions('supplier.manage')", 'Supplier import routes must require supplier.manage.');
  before(controller, "@Post('import/preview')", "@Post(':type')", 'Supplier import preview must be declared before typed dynamic route.');
  before(controller, "@Post('import')", "@Post(':type')", 'Supplier import write must be declared before typed dynamic route.');

  includes(service, 'previewSupplierImport(dto', 'Supplier preview service method must exist.');
  includes(service, 'importSuppliers(dto', 'Supplier import service method must exist.');
  includes(service, 'normalizeSupplierImportRows(rows', 'Supplier service must use import normalization helper.');
  includes(service, 'this.prisma.$transaction', 'Supplier import write must be transactional.');
  includes(service, 'failedRows > 0', 'Supplier import write must reject when preview has blocking errors.');
  includes(service, "addSupplierImportError(errors, row.line, 'payload', error)", 'Supplier preview payload validation errors must not be reported as category errors.');

  includes(helper, 'parseXlsxRows(file.buffer)', 'Supplier import must use the shared native XLSX parser.');
  includes(helper, 'MAX_SUPPLIER_IMPORT_BYTES = 5 * 1024 * 1024', 'Supplier import must cap file size at 5 MB.');
  includes(helper, 'MAX_SUPPLIER_IMPORT_ROWS = 500', 'Supplier import must cap rows.');
  includes(helper, 'supplierCode', 'Supplier import must understand supplierCode.');
  includes(helper, 'categoryName', 'Supplier import must support categoryName from exports.');
  includes(helper, 'bankAccountNumber', 'Supplier import must classify finance-sensitive fields.');
  includes(helper, 'unsupportedFields', 'Supplier import must reject unknown columns.');
  excludes(helper, 'exceljs', 'Supplier import must not add external XLSX dependencies.');
  excludes(helper, 'sheetjs', 'Supplier import must not add external XLSX dependencies.');
  excludes(dependencies, 'exceljs', 'Supplier import must not add exceljs dependency.');
  excludes(dependencies, 'sheetjs', 'Supplier import must not add sheetjs dependency.');
  excludes(dependencies, 'xlsx', 'Supplier import must not add xlsx dependency.');

  includes(dto, 'export class SupplierImportDto', 'Supplier import DTO must exist.');
  includes(dto, 'rows?: unknown[];', 'Supplier import DTO must accept JSON rows.');
  includes(dto, 'csv?: string;', 'Supplier import DTO must accept inline CSV.');
  includes(dto, "@IsIn(['create'])", 'Supplier import DTO must lock mode to create for this foundation.');

  includes(smoke, '/suppliers/import/preview', 'Supplier smoke must cover import preview.');
  includes(smoke, '/suppliers/import', 'Supplier smoke must cover import write.');
  includes(smoke, 'FAIL_SUPPLIER_IMPORT_PARTIAL_WRITE', 'Supplier smoke must guard all-or-nothing import behavior.');

  await runtimeHelperContract();
  console.log('TEST_SUPPLIERS_IMPORT_CONTRACT_OK');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
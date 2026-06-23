const fs = require('fs');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function includes(source, text, message) {
  if (!source.includes(text)) throw new Error(message);
}

function excludes(source, text, message) {
  if (source.includes(text)) throw new Error(message);
}

const rootPackage = JSON.parse(read('package.json'));
const apiPackage = JSON.parse(read('apps/api/package.json'));
const dependencies = JSON.stringify({
  rootDependencies: rootPackage.dependencies || {},
  rootDevDependencies: rootPackage.devDependencies || {},
  apiDependencies: apiPackage.dependencies || {},
  apiDevDependencies: apiPackage.devDependencies || {},
}).toLowerCase();
for (const dependency of ['exceljs', 'xlsx', 'sheetjs']) {
  excludes(dependencies, dependency, `Native XLSX exports must not add ${dependency}.`);
}

const helper = read('apps/api/src/common/xlsx-workbook.ts');
includes(helper, 'export function toXlsxWorkbook', 'Common XLSX helper must expose record workbook generation.');
includes(helper, 'export function csvToXlsxWorkbook', 'Common XLSX helper must convert existing CSV exports to native XLSX.');
includes(helper, 'export function parseXlsxRows', 'Common XLSX helper must preserve XLSX import parsing.');
includes(helper, 'zlib.inflateRawSync', 'Common XLSX parser must support deflated workbook entries.');
includes(helper, 'Buffer.from', 'Common XLSX writer must build workbook buffers without external packages.');

for (const [file, methods] of [
  ['apps/api/src/modules/finance/finance.controller.ts', ['receipts/export', 'payments/export', 'invoices/export', 'cashflow/export']],
  ['apps/api/src/modules/reports/reports.controller.ts', ['export/:report']],
  ['apps/api/src/modules/commission-reports/commission-reports.controller.ts', ['export']],
  ['apps/api/src/modules/order-center/order-center.controller.ts', ['export']],
  ['apps/api/src/modules/customers/customers.controller.ts', ['export']],
  ['apps/api/src/modules/fit-tours/fit-tours.controller.ts', ["Post('export')", ':id/export']],
]) {
  const source = read(file);
  includes(source, "from '../../common/xlsx-workbook'", `${file} must use the shared native XLSX helper.`);
  includes(source, '@Res({ passthrough: true }) response: ServerResponse', `${file} export route must set dynamic response headers.`);
  includes(source, "query.format === 'xlsx'", `${file} must switch GET exports to XLSX with format=xlsx.`);
  includes(source, 'new StreamableFile(csvToXlsxWorkbook(', `${file} must stream native XLSX buffers.`);
  for (const method of methods) includes(source, method, `${file} must still expose ${method}.`);
}

const financeController = read('apps/api/src/modules/finance/finance.controller.ts');
includes(financeController, 'smarttour-finance-invoices.xlsx', 'Finance invoices must support XLSX filename.');
includes(financeController, 'smarttour-finance-cashflow.xlsx', 'Finance cashflow must support XLSX filename.');

for (const dto of [
  'apps/api/src/modules/finance/dto/finance-query.dto.ts',
  'apps/api/src/modules/reports/dto/report-query.dto.ts',
  'apps/api/src/modules/commission-reports/dto/commission-report.dto.ts',
  'apps/api/src/modules/order-center/dto/order-center-query.dto.ts',
  'apps/api/src/modules/customers/dto/customer-query.dto.ts',
  'apps/api/src/modules/fit-tours/dto/fit-tour-action.dto.ts',
]) {
  includes(read(dto), 'format?: string;', `${dto} must allow export format selection.`);
}

const smoke = read('scripts/smoke-exports.sh');
includes(smoke, 'curl_with_retry()', 'smoke-exports must retry curl calls across API restart windows.');
includes(smoke, 'curl_with_retry -fsS', 'smoke-exports must use retry wrapper for HTTP probes.');
for (const item of [
  'finance-invoices-xlsx:/finance/invoices/export?format=xlsx',
  'finance-cashflow-xlsx:/finance/cashflow/export?format=xlsx',
  'report-customer-debt-xlsx:/reports/export/customer-debt?format=xlsx',
  'report-supplier-debt-xlsx:/reports/export/supplier-debt?format=xlsx',
  'report-finance-xlsx:/reports/export/finance?format=xlsx',
  'report-employees-xlsx:/reports/export/employees?format=xlsx',
  'report-profit-xlsx:/reports/export/profit?format=xlsx',
  'commission-report-xlsx:/commission-reports/export?format=xlsx',
  'order-center-xlsx:/order-center/export?format=xlsx',
  'customers-xlsx:/customers/export?format=xlsx',
]) {
  includes(smoke, item, `smoke-exports must cover ${item}.`);
}

console.log('TEST_NATIVE_XLSX_EXPORT_CONTRACT_OK');

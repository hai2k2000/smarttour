const fs = require('fs');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function includes(source, text, message) {
  if (!source.includes(text)) {
    throw new Error(message);
  }
}

function excludes(source, text, message) {
  if (source.includes(text)) {
    throw new Error(message);
  }
}

const rootPackage = JSON.parse(read('package.json'));
const apiPackage = JSON.parse(read('apps/api/package.json'));
const allDependencies = JSON.stringify({
  rootDependencies: rootPackage.dependencies || {},
  rootDevDependencies: rootPackage.devDependencies || {},
  apiDependencies: apiPackage.dependencies || {},
  apiDevDependencies: apiPackage.devDependencies || {},
});
for (const dependency of ['exceljs', 'xlsx', 'sheetjs']) {
  excludes(allDependencies.toLowerCase(), dependency, `Native XLSX support must not reintroduce audit-risk dependency ${dependency}.`);
}

const xlsxHelper = read('apps/api/src/common/xlsx-workbook.ts');
includes(xlsxHelper, 'export function toXlsxWorkbook', 'Finance XLSX helper must create native workbook buffers.');
includes(xlsxHelper, 'export function parseXlsxRows', 'Finance XLSX helper must parse workbook rows for imports.');
includes(xlsxHelper, 'zlib.inflateRawSync', 'Finance XLSX parser must support deflated workbook entries.');
includes(xlsxHelper, 'Buffer.from', 'Finance XLSX writer must build workbook buffers without external packages.');

const financeXlsxShim = read('apps/api/src/modules/finance/finance-xlsx.ts');
includes(financeXlsxShim, "from '../../common/xlsx-workbook'", 'Finance XLSX module path must remain as a compatibility re-export.');

const financeImport = read('apps/api/src/modules/finance/finance-import.ts');
includes(financeImport, "from '../../common/xlsx-workbook'", 'Finance import must use the shared native XLSX helper.');
includes(financeImport, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", 'Finance import must accept XLSX MIME type.');
includes(financeImport, 'parseXlsxRows(file.buffer)', 'Finance import must parse XLSX upload buffers.');
excludes(financeImport, 'XLSX cần được xuất thành CSV', 'Finance import must no longer tell users to convert XLSX to CSV.');

const financeService = read('apps/api/src/modules/finance/finance.service.ts');
includes(financeService, "from '../../common/xlsx-workbook'", 'Finance service must use the shared native XLSX export helper.');
includes(financeService, 'exportReceiptsXlsx(', 'Finance service must expose receipt XLSX export.');
includes(financeService, 'exportPaymentsXlsx(', 'Finance service must expose payment XLSX export.');
includes(financeService, "toXlsxWorkbook('finance-receipts'", 'Receipt XLSX export must use a stable worksheet name.');
includes(financeService, "toXlsxWorkbook('finance-payments'", 'Payment XLSX export must use a stable worksheet name.');

const receiptWrapper = read('apps/api/src/modules/finance/finance-receipt.service.ts');
const paymentWrapper = read('apps/api/src/modules/finance/finance-payment.service.ts');
includes(receiptWrapper, 'exportXlsx(query: Record<string, string>, user?: RequestUser)', 'Receipt wrapper must expose XLSX export.');
includes(paymentWrapper, 'exportXlsx(query: Record<string, string>, user?: RequestUser)', 'Payment wrapper must expose XLSX export.');

const financeController = read('apps/api/src/modules/finance/finance.controller.ts');
includes(financeController, "import { ServerResponse } from 'node:http';", 'Finance controller must type passthrough responses with ServerResponse.');
includes(financeController, '@Res({ passthrough: true }) response: ServerResponse', 'Finance export routes must receive a passthrough response object.');
includes(financeController, "query.format === 'xlsx'", 'Finance controller must switch receipt/payment export to XLSX with format=xlsx.');
includes(financeController, 'XLSX_MIME', 'Finance controller must set XLSX content type through the shared MIME constant.');
includes(financeController, 'smarttour-finance-receipts.xlsx', 'Receipt XLSX export must use .xlsx filename.');
includes(financeController, 'smarttour-finance-payments.xlsx', 'Payment XLSX export must use .xlsx filename.');

const financeQueryDto = read('apps/api/src/modules/finance/dto/finance-query.dto.ts');
includes(financeQueryDto, 'format?: string;', 'Finance query DTO must allow export format selection.');

console.log('TEST_FINANCE_XLSX_CONTRACT_OK');

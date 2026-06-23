const fs = require('fs');

const helperPath = 'apps/api/src/modules/reports/report-csv.ts';
const service = fs.readFileSync('apps/api/src/modules/reports/reports.service.ts', 'utf8');
const failures = [];

if (!fs.existsSync(helperPath)) {
  failures.push('report CSV helper file is missing');
} else {
  const helper = fs.readFileSync(helperPath, 'utf8');
  for (const token of [
    'export function toReportCsv',
    'function reportCsvValue',
    "if (!rows.length) return '\\uFEFF'",
    'value instanceof Date',
    'toISOString()',
    'replaceAll(\'"\', \'""\')',
  ]) {
    if (!helper.includes(token)) failures.push(`report CSV helper missing ${token}`);
  }
}

if (!service.includes("import { toReportCsv } from './report-csv';")) {
  failures.push('ReportsService must import toReportCsv');
}
if (!service.includes('return toReportCsv(')) {
  failures.push('ReportsService exportCsv must delegate to toReportCsv');
}
for (const forbidden of ['private toCsv(', 'private csv(']) {
  if (service.includes(forbidden)) failures.push(`ReportsService must not keep CSV helper method ${forbidden}`);
}

if (failures.length) {
  console.error('FAIL_REPORTS_CSV_HELPER_CONTRACT');
  for (const failure of failures) console.error(failure);
  process.exit(1);
}

console.log('TEST_REPORTS_CSV_HELPER_CONTRACT_OK');

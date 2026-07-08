const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');

function read(file) {
  return fs.readFileSync(path.join(repoRoot, file), 'utf8');
}

function csvQuoted(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function assertEscaped(csv, rawValue, label) {
  assert(!csv.includes(csvQuoted(rawValue)), `${label} must not emit raw spreadsheet formula cell ${JSON.stringify(rawValue)}`);
  assert(csv.includes(csvQuoted(`'${rawValue}`)), `${label} must prefix spreadsheet formula cell ${JSON.stringify(rawValue)} with apostrophe`);
}

function assertSourceUsesCommonHelper(failures) {
  const targets = [
    'apps/api/src/modules/finance/finance.service.ts',
    'apps/api/src/modules/customers/customers.service.ts',
    'apps/api/src/modules/commission-reports/commission-reports.service.ts',
    'apps/api/src/modules/order-center/order-center.service.ts',
    'apps/api/src/modules/reports/report-csv.ts',
    'apps/api/src/modules/fit-tours/fit-tours.service.ts',
  ];
  for (const file of targets) {
    const source = read(file);
    if (!source.includes("from '../../common/csv-export'")) failures.push(`${file} must use the shared CSV export helper`);
    for (const unsafe of ['private csvCell(', 'private csv(value', 'const escape = (value: unknown)', 'replaceAll(\'"\', \'""\')', 'replace(/"/g, \'""\')']) {
      if (source.includes(unsafe)) failures.push(`${file} must not keep local quote-only CSV escaping: ${unsafe}`);
    }
  }
}

async function financeReceiptCsv() {
  const { FinanceService } = require(path.join(repoRoot, 'apps/api/dist/modules/finance/finance.service.js'));
  const prisma = {
    financeReceipt: {
      findMany: async () => [{
        receiptCode: '=2+3',
        tourId: '+TOUR-CODE',
        receiptName: '@HYPERLINK("https://example.invalid")',
        receiptType: 'OTHER',
        paymentDate: new Date('2026-07-08T00:00:00.000Z'),
        paymentMethod: 'BANK_TRANSFER',
        payerName: '-SUM(1,2)',
        payerPhone: '\t=CMD',
        totalAmount: 100,
        paidBefore: 0,
        receiptAmount: 100,
        remainingAmount: 0,
        approvalStatus: 'DRAFT',
        branch: 'HN',
        assignedStaff: 'Normal',
      }],
    },
  };
  return new FinanceService(prisma, {}).exportReceipts({}, undefined);
}

async function main() {
  const failures = [];
  try {
    const helper = require(path.join(repoRoot, 'apps/api/dist/common/csv-export.js'));
    assert.strictEqual(helper.csvCell('=1+1'), csvQuoted("'=1+1"), 'common helper must neutralize = formulas');
    assert.strictEqual(helper.csvCell('+1+1'), csvQuoted("'+1+1"), 'common helper must neutralize + formulas');
    assert.strictEqual(helper.csvCell('-1+1'), csvQuoted("'-1+1"), 'common helper must neutralize - formulas');
    assert.strictEqual(helper.csvCell('@cmd'), csvQuoted("'@cmd"), 'common helper must neutralize @ formulas');
    assert.strictEqual(helper.csvCell('\t=cmd'), csvQuoted("'\t=cmd"), 'common helper must neutralize tab-prefixed formulas');
    assert.strictEqual(helper.csvCell('safe "quote"'), csvQuoted('safe "quote"'), 'common helper must preserve CSV quoting');
  } catch (error) {
    failures.push(`common CSV export helper behavior failed: ${error.message}`);
  }

  try {
    const csv = await financeReceiptCsv();
    for (const raw of ['=2+3', '+TOUR-CODE', '@HYPERLINK("https://example.invalid")', '-SUM(1,2)', '\t=CMD']) {
      assertEscaped(csv, raw, 'finance receipt CSV export');
    }
  } catch (error) {
    failures.push(`finance CSV export formula guard failed: ${error.message}`);
  }

  assertSourceUsesCommonHelper(failures);

  if (failures.length) {
    console.error('FAIL_CSV_EXPORT_FORMULA_GUARD_CONTRACT');
    failures.forEach((failure) => console.error(failure));
    process.exit(1);
  }
  console.log('TEST_CSV_EXPORT_FORMULA_GUARD_CONTRACT_OK');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

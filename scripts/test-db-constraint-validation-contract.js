#!/usr/bin/env node
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const repoDir = process.env.REPO_DIR || path.resolve(__dirname, '..');
const postgresContainer = process.env.POSTGRES_CONTAINER || 'smarttour-postgres-1';
const postgresUser = process.env.POSTGRES_USER || 'smarttour';
const postgresDb = process.env.POSTGRES_DB || 'smarttour';

function envValue(name) {
  const envPath = path.join(repoDir, '.env');
  if (!fs.existsSync(envPath)) return '';
  const line = fs.readFileSync(envPath, 'utf8').split(/\r?\n/).reverse().find((row) => row.startsWith(name + '='));
  return line ? line.slice(name.length + 1) : '';
}

const postgresPassword = process.env.POSTGRES_PASSWORD || envValue('POSTGRES_PASSWORD');
if (!postgresPassword) {
  console.error('FAIL_DB_CONSTRAINT_VALIDATION_TEST missing POSTGRES_PASSWORD');
  process.exit(1);
}

const expectedValidated = [
  'Booking_pax_total_non_negative_chk',
  'Order_amounts_non_negative_chk',
  'SupplierService_amounts_non_negative_chk',
  'SupplierAllotment_quantities_non_negative_chk',
  'SupplierAllotmentAllocation_quantity_positive_chk',
  'TourService_amounts_non_negative_chk',
  'OperationService_amounts_non_negative_chk',
  'OperationVoucher_amounts_non_negative_chk',
  'OperationVoucherDetail_amounts_non_negative_chk',
  'OperationVoucherPayment_amount_non_negative_chk',
  'OperationVoucher_bookingId_fkey',
  'OperationVoucherPayment_paymentVoucherId_fkey',
  'GuideSchedule_tourId_fkey',
  'GuideSchedule_orderId_fkey',
];

const sql = `
SELECT conrelid::regclass::text || '|' || conname || '|' || contype::text
FROM pg_constraint
WHERE convalidated = false
  AND conname = ANY (ARRAY[${expectedValidated.map((name) => `'${name}'`).join(', ')}])
ORDER BY conrelid::regclass::text, conname;
`;

const output = execFileSync('docker', [
  'exec',
  '-e',
  'PGPASSWORD=' + postgresPassword,
  postgresContainer,
  'psql',
  '-U',
  postgresUser,
  '-d',
  postgresDb,
  '-v',
  'ON_ERROR_STOP=1',
  '-Atc',
  sql,
], { cwd: repoDir, encoding: 'utf8' }).trim();

if (output) {
  console.error('FAIL_DB_CONSTRAINT_VALIDATION_TEST unvalidated constraints remain:');
  console.error(output);
  process.exit(1);
}

console.log('TEST_DB_CONSTRAINT_VALIDATION_CONTRACT_OK');
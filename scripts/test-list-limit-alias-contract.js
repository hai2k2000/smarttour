const fs = require('fs');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function includes(source, needle, message) {
  assert(source.includes(needle), `${message}\nMissing: ${needle}`);
}

const suppliersDto = read('apps/api/src/modules/suppliers/dto/supplier-query.dto.ts');
const suppliersService = read('apps/api/src/modules/suppliers/suppliers.service.ts');
const vouchersDto = read('apps/api/src/modules/operation-vouchers/dto/operation-voucher.dto.ts');
const vouchersController = read('apps/api/src/modules/operation-vouchers/operation-vouchers.controller.ts');
const bookingsDto = read('apps/api/src/modules/bookings/dto/list-bookings-query.dto.ts');
const bookingsController = read('apps/api/src/modules/bookings/bookings.controller.ts');
const customersDto = read('apps/api/src/modules/customers/dto/customer-query.dto.ts');
const customersService = read('apps/api/src/modules/customers/customers.service.ts');
const financeDto = read('apps/api/src/modules/finance/dto/finance-query.dto.ts');
const financeService = read('apps/api/src/modules/finance/finance.service.ts');

for (const dtoName of ['SupplierListQueryDto', 'HotelSupplierListQueryDto', 'TypedSupplierListQueryDto']) {
  const start = suppliersDto.indexOf(`export class ${dtoName}`);
  assert(start !== -1, `${dtoName} should exist`);
  const next = suppliersDto.indexOf('export class ', start + 1);
  const block = suppliersDto.slice(start, next === -1 ? undefined : next);
  includes(block, 'limit?: number;', `${dtoName} should accept limit as an alias for take.`);
}
for (const needle of [
  'this.listTake(query.take ?? query.limit)',
]) {
  includes(suppliersService, needle, 'Supplier list endpoints should bound rows using take first, then limit alias.');
}

includes(vouchersDto, 'limit?: number;', 'Operation voucher list query should accept limit alias.');
includes(vouchersController, 'query.take ?? query.limit', 'Operation voucher controller should pass take first, then limit alias.');
includes(bookingsDto, 'limit?: number;', 'Booking list query should accept limit alias.');
includes(bookingsController, 'query.take ?? query.limit', 'Booking controller should pass take first, then limit alias.');

includes(customersDto, 'limit?: string;', 'Customer list query should accept limit alias.');
includes(customersService, 'this.take(query.take ?? query.limit)', 'Customer list should bound rows using take first, then limit alias.');

includes(financeDto, 'limit?: string;', 'Finance list query should accept limit alias.');
for (const needle of [
  'take: this.take(query.take ?? query.limit)',
  'this.customerDebtRowsFromDb(where, this.take(query.take ?? query.limit))',
  'this.supplierDebtRowsFromDb(where, this.take(query.take ?? query.limit))',
]) {
  includes(financeService, needle, 'Finance list endpoints should bound rows using take first, then limit alias.');
}

console.log('TEST_LIST_LIMIT_ALIAS_CONTRACT_OK');

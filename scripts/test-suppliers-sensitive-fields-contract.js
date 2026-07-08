#!/usr/bin/env node
const { ForbiddenException } = require('@nestjs/common');
const { SuppliersService } = require('../apps/api/dist/modules/suppliers/suppliers.service');

function assert(condition, label) {
  if (!condition) throw new Error(label);
}

function userWith(permissions) {
  return {
    id: 'user-supplier-sensitive-contract',
    username: 'supplier-sensitive-contract',
    email: 'supplier-sensitive-contract@smarttour.local',
    roles: [{ role: { permissions: permissions.map((permission) => ({ permission })) } }],
  };
}

function supplierRow() {
  return {
    id: 'supplier-sensitive-row',
    supplierCode: 'SUP-SENSITIVE',
    name: 'Sensitive Supplier',
    status: 'ACTIVE',
    taxCode: 'TAX-SECRET',
    bankAccountName: 'Secret Account Name',
    bankAccountNumber: '1234567890',
    bankName: 'Secret Bank',
    debtNote: 'Secret debt note',
    pricePolicy: 'Secret price policy',
    category: { id: 'category-1', name: 'Khách sạn' },
    hotelProfile: {
      id: 'hotel-profile-1',
      hotelProject: 'Hotel Project',
      classHotel: '5 sao',
      bankAccountName: 'Hotel Secret Account',
      bankAccountNumber: '999999999',
      bankName: 'Hotel Secret Bank',
    },
  };
}

function assertSensitiveAbsent(row, label) {
  for (const key of ['taxCode', 'bankAccountName', 'bankAccountNumber', 'bankName', 'debtNote', 'pricePolicy']) {
    assert(!(key in row), `${label} must omit supplier.${key} without finance.payment.view`);
  }
  for (const key of ['bankAccountName', 'bankAccountNumber', 'bankName']) {
    assert(!(key in row.hotelProfile), `${label} must omit hotelProfile.${key} without finance.payment.view`);
  }
}

function assertSensitivePresent(row, label) {
  for (const key of ['taxCode', 'bankAccountName', 'bankAccountNumber', 'bankName', 'debtNote', 'pricePolicy']) {
    assert(key in row, `${label} must include supplier.${key} with finance.payment.view`);
  }
  for (const key of ['bankAccountName', 'bankAccountNumber', 'bankName']) {
    assert(key in row.hotelProfile, `${label} must include hotelProfile.${key} with finance.payment.view`);
  }
}

function sensitiveSearchTokens(value) {
  const text = JSON.stringify(value || {});
  return ['taxCode', 'bankAccountName', 'bankAccountNumber', 'bankName', 'debtNote', 'pricePolicy'].filter((token) => text.includes(token));
}

function assertNoSensitiveSearch(where, label) {
  const tokens = sensitiveSearchTokens(where);
  assert(tokens.length === 0, label + ' must not search sensitive supplier fields without finance.payment.view: ' + tokens.join(', '));
}

function assertSensitiveSearch(where, label) {
  assert(sensitiveSearchTokens(where).length > 0, label + ' should include sensitive supplier search fields with finance.payment.view');
}

function fakePrisma(calls = []) {
  return {
    supplier: {
      findMany: async (args = {}) => { calls.push(args); return [supplierRow()]; },
      findUnique: async () => supplierRow(),
      findFirst: async () => supplierRow(),
    },
  };
}

function fakePrismaForWrites(calls = []) {
  const supplier = {
    findMany: async (args = {}) => { calls.push({ model: 'supplier', action: 'findMany', args }); return [supplierRow()]; },
    findUnique: async (args = {}) => { calls.push({ model: 'supplier', action: 'findUnique', args }); return supplierRow(); },
    findFirst: async (args = {}) => { calls.push({ model: 'supplier', action: 'findFirst', args }); return supplierRow(); },
    update: async (args = {}) => { calls.push({ model: 'supplier', action: 'update', args }); return { ...supplierRow(), ...(args.data || {}) }; },
  };
  return {
    supplier,
    $transaction: async (callback) => callback({ supplier }),
  };
}

async function assertForbidden(operation, label) {
  try {
    await operation();
    throw new Error(`${label} should reject`);
  } catch (error) {
    assert(error instanceof ForbiddenException, `${label} must reject with ForbiddenException`);
  }
}

async function main() {
  const calls = [];
  const service = new SuppliersService(fakePrisma(calls), {});
  const viewOnly = userWith(['supplier.view']);
  const manageOnly = userWith(['supplier.view', 'supplier.manage']);
  const financeViewer = userWith(['supplier.view', 'finance.payment.view']);

  assertSensitiveAbsent((await service.listSuppliers({}, viewOnly))[0], 'listSuppliers supplier.view');
  assertSensitiveAbsent(await service.getSupplier('supplier-sensitive-row', viewOnly), 'getSupplier supplier.view');
  assertSensitiveAbsent((await service.listHotelSuppliers({}, manageOnly))[0], 'listHotelSuppliers supplier.manage');
  assertSensitiveAbsent(await service.getHotelSupplier('supplier-sensitive-row', manageOnly), 'getHotelSupplier supplier.manage');

  assertSensitivePresent((await service.listSuppliers({}, financeViewer))[0], 'listSuppliers finance.payment.view');
  assertSensitivePresent(await service.getHotelSupplier('supplier-sensitive-row', financeViewer), 'getHotelSupplier finance.payment.view');

  calls.length = 0;
  await service.listSuppliers({ search: 'TAX-SECRET' }, viewOnly);
  assertNoSensitiveSearch(calls.at(-1).where, 'listSuppliers supplier.view');
  await service.listTypedSuppliers('restaurants', { search: 'TAX-SECRET' }, viewOnly);
  assertNoSensitiveSearch(calls.at(-1).where, 'listTypedSuppliers supplier.view');
  await service.listHotelSuppliers({ search: '999999999' }, viewOnly);
  assertNoSensitiveSearch(calls.at(-1).where, 'listHotelSuppliers supplier.view');

  await service.listSuppliers({ search: 'TAX-SECRET' }, financeViewer);
  assertSensitiveSearch(calls.at(-1).where, 'listSuppliers finance.payment.view');
  await service.listHotelSuppliers({ search: '999999999' }, financeViewer);
  assertSensitiveSearch(calls.at(-1).where, 'listHotelSuppliers finance.payment.view');

  const writeCalls = [];
  const writeService = new SuppliersService(fakePrismaForWrites(writeCalls), {});
  assertSensitiveAbsent(await writeService.updateSupplier('supplier-sensitive-row', { name: 'Changed Supplier' }, manageOnly), 'updateSupplier mutation supplier.manage');
  await assertForbidden(
    () => writeService.updateSupplier('supplier-sensitive-row', { taxCode: 'FORBIDDEN-TAX' }, manageOnly),
    'updateSupplier sensitive write without finance.payment.view',
  );
  assert(!writeCalls.some((call) => call.action === 'update' && call.args?.data?.taxCode === 'FORBIDDEN-TAX'), 'forbidden sensitive write must not reach Prisma update');

  console.log('TEST_SUPPLIERS_SENSITIVE_FIELDS_CONTRACT_OK');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

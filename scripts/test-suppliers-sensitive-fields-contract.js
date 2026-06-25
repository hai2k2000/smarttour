#!/usr/bin/env node
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

function fakePrisma() {
  return {
    supplier: {
      findMany: async () => [supplierRow()],
      findUnique: async () => supplierRow(),
      findFirst: async () => supplierRow(),
    },
  };
}

async function main() {
  const service = new SuppliersService(fakePrisma(), {});
  const viewOnly = userWith(['supplier.view']);
  const manageOnly = userWith(['supplier.view', 'supplier.manage']);
  const financeViewer = userWith(['supplier.view', 'finance.payment.view']);

  assertSensitiveAbsent((await service.listSuppliers({}, viewOnly))[0], 'listSuppliers supplier.view');
  assertSensitiveAbsent(await service.getSupplier('supplier-sensitive-row', viewOnly), 'getSupplier supplier.view');
  assertSensitiveAbsent((await service.listHotelSuppliers({}, manageOnly))[0], 'listHotelSuppliers supplier.manage');
  assertSensitiveAbsent(await service.getHotelSupplier('supplier-sensitive-row', manageOnly), 'getHotelSupplier supplier.manage');

  assertSensitivePresent((await service.listSuppliers({}, financeViewer))[0], 'listSuppliers finance.payment.view');
  assertSensitivePresent(await service.getHotelSupplier('supplier-sensitive-row', financeViewer), 'getHotelSupplier finance.payment.view');

  console.log('TEST_SUPPLIERS_SENSITIVE_FIELDS_CONTRACT_OK');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

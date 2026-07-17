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

function userWith(permissions) {
  return {
    id: 'supplier-export-contract-user',
    username: 'supplier-export-contract',
    email: 'supplier-export-contract@smarttour.local',
    roles: [{ role: { permissions: permissions.map((permission) => ({ permission })) } }],
  };
}

function supplierRow() {
  return {
    id: 'supplier-export-row',
    supplierCode: 'SUP-EXPORT',
    name: 'Export Supplier',
    status: 'ACTIVE',
    contactPerson: 'Primary Contact',
    phone: '0900000000',
    email: 'supplier@example.test',
    province: 'Ha Noi',
    market: 'Inbound',
    taxCode: 'FINANCE_SECRET_TAX',
    bankAccountName: 'FINANCE_SECRET_ACCOUNT_NAME',
    bankAccountNumber: 'FINANCE_SECRET_ACCOUNT_NUMBER',
    bankName: 'FINANCE_SECRET_BANK',
    debtNote: 'FINANCE_SECRET_DEBT',
    pricePolicy: 'FINANCE_SECRET_PRICE',
    updatedAt: new Date('2026-07-16T00:00:00.000Z'),
    category: { id: 'category-1', name: 'Khach san' },
    hotelProfile: {
      hotelProject: 'Hotel Project',
      classHotel: '5 sao',
      bankAccountName: 'FINANCE_SECRET_HOTEL_ACCOUNT_NAME',
      bankAccountNumber: 'FINANCE_SECRET_HOTEL_ACCOUNT_NUMBER',
      bankName: 'FINANCE_SECRET_HOTEL_BANK',
    },
    contacts: [{ fullName: 'Contact A', position: 'Sales', phone: '0911111111', email: 'contact@example.test' }],
    supplierServices: [{ sku: 'ROOM', serviceName: 'Room night', sellingPrice: 1200000 }],
  };
}

async function runtimeMaskCheck() {
  const servicePath = path.resolve('apps/api/dist/modules/suppliers/suppliers.service.js');
  if (!fs.existsSync(servicePath)) throw new Error('Build apps/api before running supplier export runtime contract.');
  const { SuppliersService } = require(servicePath);
  const service = new SuppliersService({ supplier: { findMany: async () => [supplierRow()] } }, {});
  const viewOnlyCsv = await service.exportSuppliersCsv({}, userWith(['supplier.view']));
  if (viewOnlyCsv.includes('FINANCE_SECRET')) {
    throw new Error('Supplier export must mask finance-only values without finance.payment.view.');
  }
  const financeCsv = await service.exportSuppliersCsv({}, userWith(['supplier.view', 'finance.payment.view']));
  if (!financeCsv.includes('FINANCE_SECRET_TAX') || !financeCsv.includes('FINANCE_SECRET_BANK')) {
    throw new Error('Supplier export must include finance-only values with finance.payment.view.');
  }
}

async function main() {
  const controller = read('apps/api/src/modules/suppliers/suppliers.controller.ts');
  const service = read('apps/api/src/modules/suppliers/suppliers.service.ts');
  const dto = read('apps/api/src/modules/suppliers/dto/supplier-query.dto.ts');
  const helper = read('apps/api/src/modules/suppliers/supplier-export.ts');
  const smoke = read('scripts/smoke-exports.sh');

  includes(controller, "from '../../common/xlsx-workbook'", 'Supplier controller must use the shared native XLSX helper.');
  includes(controller, 'StreamableFile', 'Supplier export must stream XLSX buffers.');
  includes(controller, "@Get('export')", 'Common supplier export route must exist.');
  includes(controller, "@Get('hotels/export')", 'Hotel supplier export route must exist.');
  includes(controller, "@Get(':type/export')", 'Typed supplier export route must exist.');
  includes(controller, "query.format === 'xlsx'", 'Supplier export must switch to XLSX by format=xlsx.');
  includes(controller, 'new StreamableFile(csvToXlsxWorkbook(', 'Supplier export must stream native XLSX buffers.');
  includes(controller, "setExportHeaders(response, XLSX_MIME, 'smarttour-suppliers.xlsx')", 'Common supplier XLSX filename must be stable.');
  before(controller, "@Get('export')", "@Get(':routeKey')", 'Common supplier export must be declared before dynamic route dispatch.');
  before(controller, "@Get('hotels/export')", "@Get('hotels/:id')", 'Hotel supplier export must be declared before hotel detail.');
  before(controller, "@Get(':type/export')", "@Get(':routeKey')", 'Typed supplier export must be declared before dynamic route dispatch.');

  includes(dto, 'format?: string;', 'Supplier query DTOs must allow export format selection.');
  includes(dto, "@IsIn(['csv', 'xlsx'])", 'Supplier query DTOs must validate supported export formats.');

  includes(service, 'exportSuppliersCsv(query', 'Common supplier export service method must exist.');
  includes(service, 'exportHotelSuppliersCsv(query', 'Hotel supplier export service method must exist.');
  includes(service, 'exportTypedSuppliersCsv(type', 'Typed supplier export service method must exist.');
  includes(service, 'toSupplierExportCsvRows(', 'Supplier service must delegate row shaping to the export helper.');
  includes(service, 'csvRows(SUPPLIER_EXPORT_HEADERS', 'Supplier service must use shared CSV escaping.');

  includes(helper, 'maskSupplierFinancialFields(rows, user)', 'Supplier export helper must apply supplier financial masking before row selection.');
  for (const field of ['taxCode', 'bankAccountName', 'bankAccountNumber', 'bankName', 'debtNote', 'pricePolicy']) {
    includes(helper, field, `Supplier export helper must define sensitive column behavior for ${field}.`);
  }
  includes(helper, 'contacts', 'Supplier export helper must flatten contacts.');
  includes(helper, 'supplierServices', 'Supplier export helper must flatten supplier services.');
  excludes(helper, 'exceljs', 'Supplier export must not add external XLSX dependencies.');
  excludes(helper, 'sheetjs', 'Supplier export must not add external XLSX dependencies.');

  for (const item of [
    'suppliers:/suppliers/export',
    'suppliers-hotels:/suppliers/hotels/export',
    'suppliers-restaurants:/suppliers/restaurants/export',
    'suppliers-xlsx:/suppliers/export?format=xlsx',
    'suppliers-hotels-xlsx:/suppliers/hotels/export?format=xlsx',
    'suppliers-restaurants-xlsx:/suppliers/restaurants/export?format=xlsx',
  ]) {
    includes(smoke, item, `smoke-exports must cover ${item}.`);
  }

  await runtimeMaskCheck();
  console.log('TEST_SUPPLIERS_EXPORT_CONTRACT_OK');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
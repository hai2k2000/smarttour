const fs = require('fs');

const failures = [];

function read(path) {
  return fs.existsSync(path) ? fs.readFileSync(path, 'utf8') : '';
}

function requireFile(path, label) {
  if (!fs.existsSync(path)) {
    failures.push(`${label} file is missing: ${path}`);
    return '';
  }
  return read(path);
}

function requireText(source, text, label) {
  if (!source.includes(text)) failures.push(label || `missing ${text}`);
}

const customersController = read('apps/api/src/modules/customers/customers.controller.ts');
const financeController = read('apps/api/src/modules/finance/finance.controller.ts');
const orderCenterController = read('apps/api/src/modules/order-center/order-center.controller.ts');

const customersQueryDto = requireFile('apps/api/src/modules/customers/dto/customer-query.dto.ts', 'Customers query DTO');
const financeQueryDto = requireFile('apps/api/src/modules/finance/dto/finance-query.dto.ts', 'Finance query DTO');
const orderCenterQueryDto = requireFile('apps/api/src/modules/order-center/dto/order-center-query.dto.ts', 'Order Center query DTO');

for (const token of [
  'export class CustomerListQueryDto',
  'export class CustomerActivityQueryDto',
  '[key: string]: string | undefined',
  '@IsOptional()',
  '@IsString()',
  'search?: string',
  'status?: string',
  'take?: string',
  'skip?: string',
]) requireText(customersQueryDto, token, `customer query DTO missing ${token}`);

for (const token of [
  'export class FinanceQueryDto',
  '[key: string]: string | undefined',
  '@IsOptional()',
  '@IsString()',
  'search?: string',
  'status?: string',
  'from?: string',
  'to?: string',
  'take?: string',
  'entryType?: string',
]) requireText(financeQueryDto, token, `finance query DTO missing ${token}`);

for (const token of [
  'export class OrderCenterQueryDto',
  '[key: string]: string | number | boolean | undefined',
  '@IsOptional()',
  '@IsString()',
  'search?: string',
  'type?: OrderType',
  'status?: OrderStatus',
  'take?: string | number',
  'compact?: string | boolean',
]) requireText(orderCenterQueryDto, token, `order center query DTO missing ${token}`);

for (const token of [
  "import { CustomerActivityQueryDto, CustomerListQueryDto } from './dto/customer-query.dto';",
  'list(@Query() query: CustomerListQueryDto',
  'dashboard(@Query() query: CustomerListQueryDto',
  'export(@Query() query: CustomerListQueryDto',
  'timeline(@Param(\'id\') id: string, @Query() query: CustomerActivityQueryDto',
  'careHistory(@Param(\'id\') id: string, @Query() query: CustomerActivityQueryDto',
  'opportunities(@Param(\'id\') id: string, @Query() query: CustomerActivityQueryDto',
]) requireText(customersController, token, `CustomersController missing ${token}`);

for (const token of [
  "import { FinanceQueryDto } from './dto/finance-query.dto';",
  'receipts(@Query() query: FinanceQueryDto',
  'exportReceipts(@Query() query: FinanceQueryDto',
  'payments(@Query() query: FinanceQueryDto',
  'exportPayments(@Query() query: FinanceQueryDto',
  'invoices(@Query() query: FinanceQueryDto',
  'exportInvoices(@Query() query: FinanceQueryDto',
  'customerDebt(@Query() query: FinanceQueryDto',
  'supplierDebt(@Query() query: FinanceQueryDto',
  'cashflow(@Query() query: FinanceQueryDto',
  'exportCashflow(@Query() query: FinanceQueryDto',
]) requireText(financeController, token, `FinanceController missing ${token}`);

for (const token of [
  "import { OrderCenterQueryDto } from './dto/order-center-query.dto';",
  'dashboard(@Query() query: OrderCenterQueryDto',
  'list(@Query() query: OrderCenterQueryDto',
  'export(@Query() query: OrderCenterQueryDto',
]) requireText(orderCenterController, token, `OrderCenterController missing ${token}`);

for (const [label, source] of [
  ['CustomersController', customersController],
  ['FinanceController', financeController],
  ['OrderCenterController', orderCenterController],
]) {
  if (source.includes('@Query() query: Record<string, string>')) {
    failures.push(`${label} still uses loose @Query() Record<string, string>`);
  }
}

if (failures.length) {
  console.error('FAIL_QUERY_DTO_CONTRACT');
  for (const failure of failures) console.error(failure);
  process.exit(1);
}

console.log('TEST_QUERY_DTO_CONTRACT_OK');

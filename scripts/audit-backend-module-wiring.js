const fs = require('fs');
const path = require('path');

const root = process.cwd();
const modulesRoot = path.join(root, 'apps/api/src/modules');
const appModule = fs.readFileSync(path.join(root, 'apps/api/src/app.module.ts'), 'utf8');
const failures = [];

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function classes(source, suffix) {
  return Array.from(source.matchAll(new RegExp(`export class (\\w+${suffix})`, 'g'))).map((match) => match[1]);
}

function tsFiles(dir, suffix) {
  return fs.readdirSync(dir).filter((file) => file.endsWith(suffix)).map((file) => path.join(dir, file));
}

const moduleDirs = fs.readdirSync(modulesRoot)
  .map((name) => path.join(modulesRoot, name))
  .filter((entry) => fs.statSync(entry).isDirectory());

for (const dir of moduleDirs) {
  const moduleFile = tsFiles(dir, '.module.ts')[0];
  if (!moduleFile) {
    failures.push(`${path.relative(root, dir)}: missing module file`);
    continue;
  }

  const moduleSource = read(moduleFile);
  const moduleNames = classes(moduleSource, 'Module');
  for (const moduleName of moduleNames) {
    if (!appModule.includes(moduleName)) failures.push(`AppModule missing ${moduleName}`);
  }

  for (const controllerFile of tsFiles(dir, '.controller.ts')) {
    for (const controllerName of classes(read(controllerFile), 'Controller')) {
      if (!moduleSource.includes(controllerName)) failures.push(`${path.relative(root, moduleFile)} missing controller ${controllerName}`);
    }
  }

  for (const serviceFile of tsFiles(dir, '.service.ts')) {
    for (const serviceName of classes(read(serviceFile), 'Service')) {
      if (!moduleSource.includes(serviceName)) failures.push(`${path.relative(root, moduleFile)} missing provider ${serviceName}`);
    }
  }
}

const routeChecks = [
  ['apps/api/src/modules/customers/customers.controller.ts', ["@Post(':id/files')", "@Delete(':id/files/:fileId')"]],
  ['apps/api/src/modules/finance/finance.controller.ts', ["@Post('receipts/:id/file')", "@Delete('receipts/:id/file')", "@Post('payments/:id/file')", "@Delete('payments/:id/file')", "@Post('invoices/:id/files')", "@Delete('invoices/:id/files/:fileId')"]],
  ['apps/api/src/modules/suppliers/suppliers.controller.ts', ["@Post(':id/files')", "@Delete(':id/files/:fileId')"]],
  ['apps/api/src/modules/tour-guides/tour-guides.controller.ts', ["@Post(':id/files')", "@Delete(':id/files/:fileId')"]],
];

for (const [file, tokens] of routeChecks) {
  const source = read(path.join(root, file));
  for (const token of tokens) {
    if (!source.includes(token)) failures.push(`${file} missing route ${token}`);
  }
}

const financeModule = read(path.join(root, 'apps/api/src/modules/finance/finance.module.ts'));
for (const serviceName of ['FinanceReceiptService', 'FinancePaymentService', 'FinanceInvoiceService', 'FinanceLedgerService', 'FinanceCashflowService']) {
  if (!financeModule.includes(`provide: ${serviceName}`)) failures.push(`FinanceModule missing domain provider ${serviceName}`);
}

if (failures.length) {
  console.error(['BACKEND_MODULE_WIRING_AUDIT_FAILED', ...failures].join('\n'));
  process.exit(1);
}

console.log('BACKEND_MODULE_WIRING_AUDIT_OK');

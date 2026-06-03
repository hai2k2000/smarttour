const fs = require('fs');
const path = require('path');

const root = process.cwd();
const checks = [
  {
    file: 'apps/api/src/modules/tours/tours.service.ts',
    sectionStart: 'list(search?: string',
    sectionEnd: 'async detail',
    must: ['private listSelect()', 'select: this.listSelect()'],
    forbidden: ['include: {\n        order: true', 'fitTour: true,'],
  },
  {
    file: 'apps/api/src/modules/tour-programs/tour-programs.service.ts',
    sectionStart: 'list(search?: string',
    sectionEnd: 'async detail',
    must: ['private listSelect()', 'select: this.listSelect()'],
    forbidden: ['itineraryDays: { orderBy: { dayNumber: \'asc\' } }'],
  },
  {
    file: 'apps/api/src/modules/customers/customers.service.ts',
    sectionStart: 'async list(query',
    sectionEnd: 'async dashboard',
    must: ['private listSelect()', 'select: this.listSelect()'],
    forbidden: ['include: customerInclude'],
  },
  {
    file: 'apps/api/src/modules/bookings/bookings.service.ts',
    sectionStart: 'list(search?: string',
    sectionEnd: 'async detail',
    must: ['private listSelect()', 'select: this.listSelect()'],
    forbidden: ['include: { tourProgram: true, customer: true, order: true, tour: true, operationForm: true }'],
  },
  {
    file: 'apps/api/src/modules/operation-vouchers/operation-vouchers.service.ts',
    sectionStart: 'list(search?: string',
    sectionEnd: 'async detail',
    must: ['private listSelect()', 'select: this.listSelect()'],
    forbidden: ['include: { supplier: true, booking: true, order: true, tour: true'],
  },
  {
    file: 'apps/api/src/modules/orders/orders.service.ts',
    sectionStart: 'list(typePath: string',
    sectionEnd: 'async detail',
    must: ['private listSelect()', 'select: this.listSelect()'],
    forbidden: ['include: { customer: true'],
  },
  {
    file: 'apps/api/src/modules/finance/finance.service.ts',
    sectionStart: 'async listInvoices',
    sectionEnd: 'async invoiceDetail',
    must: ['private invoiceListSelect()', 'select: this.invoiceListSelect()'],
    forbidden: ['include: { items: true, files: true }, orderBy'],
  },
  {
    file: 'apps/api/src/modules/commission-reports/commission-reports.service.ts',
    sectionStart: 'async list(query',
    sectionEnd: 'async summary',
    must: ['private listInclude()', 'include: this.listInclude()'],
    forbidden: ['logs: { orderBy: { createdAt: \'desc\' }, take: 3', 'payments: { orderBy: { paidAt: \'desc\' }, take: 3'],
  },
];

const failures = [];
for (const check of checks) {
  const fullPath = path.join(root, check.file);
  const source = fs.readFileSync(fullPath, 'utf8');
  for (const token of check.must) {
    if (!source.includes(token)) failures.push(`${check.file}: missing ${token}`);
  }
  const start = source.indexOf(check.sectionStart);
  const end = source.indexOf(check.sectionEnd, start);
  const section = start >= 0 && end > start ? source.slice(start, end) : source;
  for (const token of check.forbidden) {
    if (section.includes(token)) failures.push(`${check.file}: forbidden deep list include ${token}`);
  }
}

if (failures.length) {
  console.error(['LIST_VIEW_INCLUDE_AUDIT_FAILED', ...failures].join('\n'));
  process.exit(1);
}

console.log('LIST_VIEW_INCLUDE_AUDIT_OK');

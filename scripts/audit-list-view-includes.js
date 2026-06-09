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
    sectionStart: '  list(\n',
    sectionEnd: 'async detail',
    must: ['private listSelect()', 'select: this.listSelect()'],
    forbidden: ['include: { tourProgram: true, customer: true, order: true, tour: true, operationForm: true }'],
  },
  {
    file: 'apps/api/src/modules/bookings/bookings.service.ts',
    sectionStart: 'private listSelect()',
    sectionEnd: 'private detailSelect()',
    must: ['tourProgram: { select: { id: true, code: true, name: true } }', 'operationForm: { select: { id: true, status: true } }'],
    forbidden: ['customerId: true', 'customerPhone: true', 'createdAt: true', 'itineraryDays:'],
  },
  {
    file: 'apps/api/src/modules/bookings/bookings.service.ts',
    sectionStart: 'private detailSelect()',
    sectionEnd: 'private mutationSelect()',
    must: ['operationVouchers: { orderBy:', 'take: 20', 'operationForm: { select: { id: true, status: true } }'],
    forbidden: ['tasks:', 'services:', 'costs:'],
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
    sectionStart: 'async listReceipts(query',
    sectionEnd: 'async receiptDetail',
    must: ['orders: { select: { id: true, orderId: true, orderCode: true, tourCode: true, tourName: true, amount: true } }'],
    forbidden: ['include: { orders: true }', 'cashflowEntries: true', 'customerLedger: true'],
  },
  {
    file: 'apps/api/src/modules/finance/finance.service.ts',
    sectionStart: 'async listPayments(query',
    sectionEnd: 'async paymentDetail',
    must: ['operationVoucher: { select: { voucherCode: true, status: true } }', 'supplierPaymentRequests: { select: { code: true, status: true } }'],
    forbidden: ['operationVoucher: true', 'supplierPaymentRequests: true', 'cashflowEntries: true', 'supplierLedger: true', 'operationVoucherPayments: true'],
  },
  {
    file: 'apps/api/src/modules/finance/finance.service.ts',
    sectionStart: 'async listInvoices',
    sectionEnd: 'async invoiceDetail',
    must: ['financeInvoice.findMany({ where, orderBy:'],
    forbidden: ['include: { items: true, files: true }, orderBy'],
  },
  {
    file: 'apps/api/src/modules/finance/finance.service.ts',
    sectionStart: 'async cashflow(query',
    sectionEnd: 'async exportReceipts',
    must: ['financeCashflowEntry.findMany({ where, orderBy:'],
    forbidden: ['include:', 'order: true', 'supplier: true', 'customer: true'],
  },
  {
    file: 'apps/api/src/modules/operations/operations.service.ts',
    sectionStart: 'async listForms(query',
    sectionEnd: 'async formDetail',
    must: ['private formListSelect()', 'select: this.formListSelect()'],
    forbidden: ['include: this.formDetailInclude()', 'include: this.formInclude()', 'paymentItems: true', 'supplier: true, supplierService: true'],
  },
  {
    file: 'apps/api/src/modules/operations/operations.service.ts',
    sectionStart: 'async listPaymentRequests(query',
    sectionEnd: 'async paymentRequestDetail',
    must: ['private paymentRequestListSelect()', 'select: this.paymentRequestListSelect()'],
    forbidden: ['include: this.paymentRequestDetailInclude()', 'include: this.paymentRequestInclude()', 'financePayment: true', 'supplier: true, cost: { include:'],
  },
  {
    file: 'apps/api/src/modules/suppliers/suppliers.service.ts',
    sectionStart: 'async listTypedSuppliers',
    sectionEnd: 'async getTypedSupplier',
    must: ['private genericListInclude()', 'include: this.genericListInclude()'],
    forbidden: ['include: this.genericInclude()', 'files: { orderBy: { createdAt: \'desc\' }', 'category: true'],
  },
  {
    file: 'apps/api/src/modules/suppliers/suppliers.service.ts',
    sectionStart: 'async listHotelSuppliers',
    sectionEnd: 'async getHotelSupplier',
    must: ['private hotelListInclude()', 'include: this.hotelListInclude()'],
    forbidden: ['include: this.hotelInclude()', 'allocations: { orderBy: { createdAt: \'desc\' }', 'logs: { orderBy: { createdAt: \'desc\' }', 'files: { orderBy: { createdAt: \'desc\' }'],
  },
  {
    file: 'apps/api/src/modules/tour-programs/tour-programs.service.ts',
    sectionStart: 'async detail',
    sectionEnd: 'async create',
    must: ['bookings: { orderBy: { startDate: \'desc\' }, select: { id: true, code: true, customerName: true } }'],
    forbidden: ['bookings: { orderBy: { startDate: \'desc\' } }'],
  },
  {
    file: 'apps/api/src/modules/commission-reports/commission-reports.service.ts',
    sectionStart: 'async list(query',
    sectionEnd: 'async summary',
    must: ['private listInclude()', 'include: this.listInclude()'],
    forbidden: ['logs: { orderBy: { createdAt: \'desc\' }, take: 3', 'payments: { orderBy: { paidAt: \'desc\' }, take: 3'],
  },
  {
    file: 'apps/api/src/modules/order-center/order-center.service.ts',
    sectionStart: 'async list(query',
    sectionEnd: 'async exportCsv',
    must: ['operationItems: {', 'select: {'],
    forbidden: ['operationItems: { include: { supplier: true }', 'supplier: true'],
  },
  {
    file: 'apps/api/src/modules/quotes/quotes.service.ts',
    sectionStart: 'listTourQuotes(search',
    sectionEnd: 'async getTourQuote',
    must: ['include: { _count: { select: { costItems: true, itineraries: true } } }'],
    forbidden: ['costItems: {', 'itineraries: {'],
  },
  {
    file: 'apps/api/src/modules/quotes/quotes.service.ts',
    sectionStart: 'listComboQuotes(search',
    sectionEnd: 'async getComboQuote',
    must: ['include: { _count: { select: { items: true } } }'],
    forbidden: ['items: {'],
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
  if (start < 0) failures.push(`${check.file}: missing section start ${check.sectionStart}`);
  if (start >= 0 && end <= start) failures.push(`${check.file}: missing section end ${check.sectionEnd}`);
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

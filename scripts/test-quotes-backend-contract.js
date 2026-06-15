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

function excludes(source, needle, message) {
  assert(!source.includes(needle), `${message}\nFound: ${needle}`);
}

const quotesController = read('apps/api/src/modules/quotes/quotes.controller.ts');
const quotesService = read('apps/api/src/modules/quotes/quotes.service.ts');
const quotationsService = read('apps/api/src/modules/quotations/quotations.service.ts');
const validationFactory = read('apps/api/src/validation-exception.factory.ts');

for (const permission of [
  "@RequirePermissions('quote.view')",
  "@RequirePermissions('quote.manage')",
]) {
  includes(quotesController, permission, 'Quotes routes must keep explicit view/manage permissions.');
}

for (const permission of [
  "@RequirePermissions('quotation.view')",
  "@RequirePermissions('quotation.manage')",
]) {
  includes(read('apps/api/src/modules/quotations/quotations.controller.ts'), permission, 'Quotation routes must keep explicit view/manage permissions.');
}

for (const label of [
  'quoteCode',
  'tourCode',
  'comboCode',
  'comboType',
  'costType',
  'serviceType',
  'unitPrice',
  'netPricePerService',
  'productType',
  'paxAdult',
  'paxChild',
  'paxInfant',
  'markupAmount',
  'markupPercent',
]) {
  includes(validationFactory, `${label}:`, `Validation factory must expose a Vietnamese label for ${label}.`);
}

for (const needle of [
  'Tour quote not found',
  'Quote code already exists',
  'At least one cost item is required',
  'requires service type or description',
  'Combo quote not found',
  'Combo code already exists',
  'At least one combo item is required',
  'references an unknown service',
  'service does not belong to selected supplier',
  'Cannot ',
  'Payment date must be after booking date',
  'Return date must be after departure date',
  'Invalid date',
]) {
  excludes(quotesService, needle, 'Quotes backend messages must be Vietnamese and business-readable.');
}

for (const needle of [
  'Quotation not found',
  'Quotation smartlink not found',
  'Quotation code already exists',
  'At least one quotation item is required',
  'requires service type',
  'requires service name',
  'Only approved quotations can be converted',
  'Cannot ',
  'Expired date must be after created date',
  'Expected payment date must be after created date',
  'Return date must be after departure date',
  'Invalid date',
]) {
  excludes(quotationsService, needle, 'Quotations backend messages must be Vietnamese and business-readable.');
}

includes(quotationsService, 'this.assertWritableQuotationStatus(dto.status);', 'Create quotation must reject direct non-DRAFT status writes.');
includes(quotationsService, 'this.assertWritableQuotationStatus(dto.status, current.status);', 'Update quotation must reject direct status transitions; actions own the workflow.');
includes(quotationsService, "this.assertStatus(current.status, ['DRAFT', 'REJECTED'], 'submit')", 'Submit must only run from DRAFT/REJECTED.');
includes(quotationsService, "this.assertStatus(current.status, ['PENDING_APPROVAL'], 'approve')", 'Approve must only run from PENDING_APPROVAL.');
includes(quotationsService, "if (quote.status !== 'APPROVED')", 'Convert must only run from APPROVED.');

includes(quotationsService, 'return this.number(item.quantity, 1) * this.number(item.nightCount, 1) * this.number(item.netPrice) * exchangeRate * (1 + this.number(item.vat) / 100);', 'Quotation backend itemCost must match frontend quantity * nightCount * netPrice * exchangeRate * VAT percent.');
includes(quotationsService, 'return this.number(item.markupAmount) + cost * (this.number(item.markupPercent) / 100);', 'Quotation backend itemMarkup must match frontend fixed markup plus percent of cost.');
includes(quotesService, '(item.quantity ?? 1) * (item.serviceCount ?? 1) * (item.unitPrice ?? 0) * (item.exchangeRate ?? 1) + (item.vat ?? 0)', 'Quote tour backend amount must match frontend VAT/phụ thu as absolute add-on.');
includes(quotesService, 'return sum + ((item.netPricePerService ?? 0) * nights) / pax;', 'Quote combo backend net per pax must match frontend.');

console.log('TEST_QUOTES_BACKEND_CONTRACT_OK');

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

const pkg = JSON.parse(read('package.json'));
const smoke = read('scripts/smoke-quotes-quotations.sh');
const backendContract = read('scripts/test-quotes-backend-contract.js');
const tourClientContract = read('scripts/test-quote-tours-client-contract.js');
const comboClientContract = read('scripts/test-quote-combos-client-contract.js');
const quotationClientContract = read('scripts/test-quotations-client-contract.js');

for (const script of [
  'smoke:quotes',
  'test:quotes:backend',
  'test:quotes:coverage',
  'test:quotes:tour-client',
  'test:quotes:combo-client',
  'test:quotations:client',
]) {
  assert(pkg.scripts?.[script], `package.json must expose ${script}.`);
}

for (const needle of [
  "await request(admin, 'POST', '/quotes/tours', tourPayload())",
  "await request(admin, 'PUT', `/quotes/tours/${tour.id}`",
  "await request(view, 'GET', `/quotes/tours/${tour.id}`)",
  "await request(admin, 'GET', `/quotes/tours?search=${encodeURIComponent(run)}`)",
  "await request(admin, 'POST', `/quotes/tours/${tour.id}/approve`",
  "await request(admin, 'POST', `/quotes/tours/${tour.id}/convert`",
  "await request(admin, 'POST', '/quotes/tours', { ...tourPayload(`${run}-TOUR-BAD-MISSING`)",
  "await request(admin, 'POST', '/quotes/tours', { ...tourPayload(`${run}-TOUR-BAD-NUM`)",
  "assert(updatedTour.costItems?.length === 3, 'tour update lost cost items')",
  "assert(updatedTour.itineraries?.length === 1, 'tour update did not replace itineraries')",
]) {
  includes(smoke, needle, 'Quote tour create/update/load/search/validation/action coverage is incomplete.');
}

for (const needle of [
  "await request(admin, 'POST', '/quotes/combos', comboPayload())",
  "await request(admin, 'PUT', `/quotes/combos/${combo.id}`",
  "await request(view, 'GET', `/quotes/combos/${combo.id}`)",
  "await request(admin, 'GET', `/quotes/combos?search=${encodeURIComponent(run)}`)",
  "await request(admin, 'POST', `/quotes/combos/${combo.id}/create-quote`",
  "await request(admin, 'POST', `/quotes/combos/${combo.id}/create-order`",
  "await request(admin, 'POST', '/quotes/combos', { ...comboPayload(`${run}-COMBO-BAD-MISSING`)",
  "await request(admin, 'POST', '/quotes/combos', { ...comboPayload(`${run}-COMBO-BAD-NUM`)",
  "await request(admin, 'POST', '/quotes/combos', { ...comboPayload(`${run}-COMBO-BAD-ITEMS`)",
  "assert(updatedCombo.items?.length === 2, 'combo update lost items')",
  "almost(updatedCombo.items[0].netPricePerPax, 1000, 'combo first item netPricePerPax')",
]) {
  includes(smoke, needle, 'Quote combo create/update/load/search/validation/action coverage is incomplete.');
}

for (const needle of [
  "await request(admin, 'POST', '/quotations', quotationPayload())",
  "await request(admin, 'PUT', `/quotations/${quotation.id}`",
  "await request(view, 'GET', `/quotations/${quotation.id}`)",
  "await request(admin, 'GET', `/quotations?search=${encodeURIComponent(run)}`)",
  "await request(admin, 'PATCH', `/quotations/${quotation.id}/smartlink`",
  "await request(admin, 'POST', `/quotations/${quotation.id}/submit`",
  "await request(admin, 'POST', `/quotations/${quotation.id}/approve`",
  "await request(admin, 'POST', `/quotations/${quotation.id}/convert`",
  "await request(admin, 'POST', '/quotations', { ...quotationPayload(`${run}-QTE-BAD-MISSING`)",
  "await request(admin, 'POST', '/quotations', { ...quotationPayload(`${run}-QTE-BAD-NUM`)",
  "await request(admin, 'POST', '/quotations', { ...quotationPayload(`${run}-QTE-BAD-ITEMS`)",
  "const ignoredStatusQuote = await request(admin, 'POST', '/quotations', {",
  "assert(updatedQuotation.items?.length === 2, 'quotation update lost items')",
  "assert(updatedQuotation.status === 'DRAFT', 'quotation update changed status unexpectedly')",
  "assert(Array.isArray(updatedQuotation.logs) && updatedQuotation.logs.some((log) => log.action === 'UPDATE'), 'quotation update log missing')",
  "assert(ignoredStatusQuote.status === 'DRAFT' && ignoredStatusQuote.smartLinkEnabled === false, 'quotation create should ignore client workflow fields and start as DRAFT with SmartLink off')",
]) {
  includes(smoke, needle, 'Quotation create/update/load/search/validation/action coverage is incomplete.');
}

for (const needle of [
  'assertTourTotals(tour);',
  'assertTourTotals(updatedTour',
  'assertComboTotals(combo);',
  'assertComboTotals(updatedCombo',
  'assertQuotationTotals(quotation, 2);',
  'assertQuotationTotals(updatedQuotation, 3);',
  'almost(order.totalRevenue, expectedRate3.totalSelling',
  'almost(order.totalCost, expectedRate3.totalCost',
  'almost(order.salesItems[0].amount, expectedRate3.sell1',
  'almost(order.operationItems[0].amount, expectedRate3.cost1',
]) {
  includes(smoke, needle, 'Totals and price engine runtime coverage is incomplete.');
}

for (const needle of [
  'assertLoadableTour(tourDetail);',
  'assertLoadableCombo(comboDetail);',
  'assertLoadableQuotation(quotationDetail);',
  'loadQuote must reject missing costItems',
  'loadCombo must reject missing items',
  'loadQuotation must reject missing items',
]) {
  const source = needle.startsWith('assertLoadable') ? smoke : `${tourClientContract}\n${comboClientContract}\n${quotationClientContract}`;
  includes(source, needle, 'Load-form coverage is incomplete.');
}

for (const needle of [
  "await request(null, 'GET', '/quotes/tours'",
  "await request(noPerm, 'GET', '/quotes/tours'",
  "await request(view, 'POST', '/quotes/tours'",
  "await request(null, 'GET', '/quotes/combos'",
  "await request(noPerm, 'GET', '/quotes/combos'",
  "await request(view, 'POST', `/quotes/combos/${combo.id}/create-quote`",
  "await request(null, 'GET', '/quotations'",
  "await request(noPerm, 'GET', '/quotations'",
  "await request(view, 'POST', '/quotations'",
  "await request(view, 'PUT', `/quotations/${quotation.id}`",
  "const ignoredUpdateStatus = await request(admin, 'PUT', `/quotations/${stateQuote.id}`, { status: 'APPROVED', smartLinkEnabled: true })",
  "assert(ignoredUpdateStatus.status === 'DRAFT' && ignoredUpdateStatus.smartLinkEnabled === false, 'quotation update should ignore client workflow fields')",
]) {
  includes(smoke, needle, 'Permission and invalid status/action coverage is incomplete.');
}

for (const needle of [
  'Quote tour frontend lineAmount must match backend',
  'Quote combo frontend net per pax must match backend',
  'Quotation backend itemCost must match frontend',
  'Quotation convert unit cost must preserve net price',
]) {
  includes(backendContract, needle, 'Static price parity coverage is incomplete.');
}

console.log('TEST_QUOTES_TEST_COVERAGE_OK');

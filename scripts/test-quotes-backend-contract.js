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
const quoteListQueryDto = read('apps/api/src/modules/quotes/dto/list-quotes-query.dto.ts');
const quotationsService = read('apps/api/src/modules/quotations/quotations.service.ts');
const quotationsController = read('apps/api/src/modules/quotations/quotations.controller.ts');
const quotationDto = read('apps/api/src/modules/quotations/dto/quotation.dto.ts');
const validationFactory = read('apps/api/src/validation-exception.factory.ts');
const quoteToursClient = read('apps/web/app/quotes/tours/QuoteToursClient.tsx');
const quoteCombosClient = read('apps/web/app/quotes/combos/QuoteCombosClient.tsx');
const quotationsClient = read('apps/web/app/quotations/QuotationsClient.tsx');

for (const permission of [
  "@RequirePermissions('quote.view')",
  "@RequirePermissions('quote.manage')",
  "@RequirePermissions('quote.approve')",
]) {
  includes(quotesController, permission, 'Quotes routes must keep explicit view/manage permissions.');
}

includes(quoteListQueryDto, 'class ListQuotesQueryDto', 'Quotes list query DTO must exist.');
includes(quoteListQueryDto, 'take?: number', 'Quotes list query DTO must accept bounded take.');
includes(quoteListQueryDto, 'MAX_QUOTES_TAKE', 'Quotes list query DTO must cap take.');
includes(quotesController, 'listTours(@Query() query: ListQuotesQueryDto', 'Quote tour list route must use the validated list query DTO.');
includes(quotesController, 'this.quotesService.listTourQuotes(query, request?.user)', 'Quote tour controller must pass the full validated list query.');
includes(quotesController, 'listCombos(@Query() query: ListQuotesQueryDto', 'Quote combo list route must use the validated list query DTO.');
includes(quotesController, 'this.quotesService.listComboQuotes(query)', 'Quote combo controller must pass the full validated list query.');
includes(quotesService, 'take: this.listTake(query.take)', 'Quotes list services must apply bounded take.');

for (const permission of [
  "@RequirePermissions('quotation.view')",
  "@RequirePermissions('quotation.manage')",
  "@RequirePermissions('quotation.approve')",
]) {
  includes(quotationsController, permission, 'Quotation routes must keep explicit view/manage permissions.');
}

includes(quotationDto, 'class ListQuotationsQueryDto', 'Quotations list query DTO must exist.');
includes(quotationDto, 'take?: number', 'Quotations list query DTO must accept bounded take.');
includes(quotationDto, 'MAX_QUOTATIONS_TAKE', 'Quotations list query DTO must cap take.');
includes(quotationsController, 'list(@Query() query: ListQuotationsQueryDto', 'Quotation list route must use the validated list query DTO.');
includes(quotationsService, 'take: this.listTake(query.take)', 'Quotation list service must apply bounded take.');
{
  const createDtoStart = quotationDto.indexOf('export class CreateQuotationDto');
  const updateDtoStart = quotationDto.indexOf('export class UpdateQuotationDto', createDtoStart);
  const actionDtoStart = quotationDto.indexOf('export class QuotationActionDto', updateDtoStart);
  const smartLinkDtoStart = quotationDto.indexOf('export class QuotationSmartLinkDto', actionDtoStart);
  const createDtoBlock = createDtoStart === -1 || updateDtoStart === -1 ? '' : quotationDto.slice(createDtoStart, updateDtoStart);
  const actionDtoBlock = actionDtoStart === -1 || smartLinkDtoStart === -1 ? '' : quotationDto.slice(actionDtoStart, smartLinkDtoStart);
  excludes(createDtoBlock, 'status?:', 'CreateQuotationDto must not accept direct status writes.');
  excludes(createDtoBlock, 'smartLinkEnabled?:', 'CreateQuotationDto must not accept direct SmartLink toggles.');
  excludes(actionDtoBlock, 'actor?:', 'QuotationActionDto must not accept client-supplied actor values.');
}
excludes(quotationsService, 'this.assertWritableQuotationStatus(dto.status);', 'Create quotation should not inspect client-supplied status.');
excludes(quotationsService, 'this.assertWritableQuotationStatus(dto.status, current.status);', 'Update quotation should not inspect client-supplied status.');
excludes(quotationsService, '...(dto.status !== undefined ? { status: dto.status } : {})', 'Quotation toData must not write status from client DTOs.');
excludes(quotationsService, '...(dto.smartLinkEnabled !== undefined ? { smartLinkEnabled: dto.smartLinkEnabled } : {})', 'Quotation toData must not toggle SmartLink from create/update DTOs.');
excludes(quotationsService, 'actor: this.text(dto.actor)', 'Quotation workflow logs must not trust actor from request body.');
includes(quotationsService, 'actor: this.actor(user)', 'Quotation workflow logs should derive actor from request.user.');
const quotationDashboardStart = quotationsService.indexOf('async dashboard(');
const quotationListStart = quotationsService.indexOf('list(query: ListQuotationsQueryDto', quotationDashboardStart);
const quotationDashboardBlock = quotationDashboardStart === -1 || quotationListStart === -1 ? '' : quotationsService.slice(quotationDashboardStart, quotationListStart);
includes(quotationDashboardBlock, 'this.prisma.quotation.count', 'Quotation dashboard should count in the database instead of loading every quotation.');
includes(quotationDashboardBlock, 'this.prisma.quotation.aggregate', 'Quotation dashboard should sum quotation value in the database.');
excludes(quotationDashboardBlock, 'findMany', 'Quotation dashboard must not load all matching quotations with findMany.');
excludes(quotationDashboardBlock, '.reduce(', 'Quotation dashboard must not reduce all matching quotations in Node.');

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

includes(quotationsService, "status: 'DRAFT'", 'Create quotation must force DRAFT status.');
includes(quotationsService, 'smartLinkEnabled: false', 'Create quotation must force SmartLink off by default.');
includes(quotationsService, "this.assertStatus(current.status, ['DRAFT', 'REJECTED'], 'submit')", 'Submit must only run from DRAFT/REJECTED.');
includes(quotationsService, "this.assertStatus(current.status, ['PENDING_APPROVAL'], 'approve')", 'Approve must only run from PENDING_APPROVAL.');
includes(quotationsService, "if (quote.status !== 'APPROVED')", 'Convert must only run from APPROVED.');

includes(quotationsService, 'return this.number(item.quantity, 1) * this.number(item.nightCount, 1) * this.number(item.netPrice) * exchangeRate * (1 + this.number(item.vat) / 100);', 'Quotation backend itemCost must match frontend quantity * nightCount * netPrice * exchangeRate * VAT percent.');
includes(quotationsService, 'return this.number(item.markupAmount) + cost * (this.number(item.markupPercent) / 100);', 'Quotation backend itemMarkup must match frontend fixed markup plus percent of cost.');
includes(quotesService, '(item.quantity ?? 1) * (item.serviceCount ?? 1) * (item.unitPrice ?? 0) * (item.exchangeRate ?? 1) + (item.vat ?? 0)', 'Quote tour backend amount must match frontend VAT/phụ thu as absolute add-on.');
includes(quotesService, 'return sum + ((item.netPricePerService ?? 0) * nights) / pax;', 'Quote combo backend net per pax must match frontend.');

includes(quoteToursClient, 'return quantity * serviceCount * unitPrice * exchangeRate + vat;', 'Quote tour frontend lineAmount must match backend VAT/phụ thu as absolute add-on.');
includes(quoteToursClient, "const common = items.filter((item) => item.costType === 'COMMON').reduce((sum, item) => sum + lineAmount(item), 0);", 'Quote tour frontend must split common costs like backend.');
includes(quoteToursClient, "const privateTotal = items.filter((item) => item.costType === 'HOTEL' || item.costType === 'PRIVATE').reduce((sum, item) => sum + lineAmount(item), 0);", 'Quote tour frontend must split hotel/private costs like backend.');
includes(quoteToursClient, 'const pax = Math.max(1, safeNumber(values.adultQty) + safeNumber(values.childQty) + safeNumber(values.infantQty));', 'Quote tour frontend total pax must include adult/child/infant like backend.');
includes(quoteToursClient, 'const net = common / pax + privateTotal;', 'Quote tour frontend net price must match backend common-per-pax plus private total.');
includes(quoteToursClient, 'const selling = Math.max(0, net + profit + commission - discount);', 'Quote tour frontend selling price must match backend profit/commission/discount rule.');
includes(quoteToursClient, 'child: selling * childPercent / 100,', 'Quote tour frontend child price must be percentage of selling price.');
includes(quoteToursClient, 'infant: selling * infantPercent / 100,', 'Quote tour frontend infant price must be percentage of selling price.');
includes(quoteToursClient, 'profitRate: selling > 0 ? profit / selling * 100 : 0,', 'Quote tour frontend profit rate must match backend.');

includes(quoteCombosClient, 'return safeNumber(item.netPricePerService) * nights / pax;', 'Quote combo frontend net per pax must match backend.');
includes(quoteCombosClient, 'const totalNet = normalizedItems.reduce((sum, item) => sum + itemNetPerPax(item), 0);', 'Quote combo frontend total net must sum item net per pax.');
includes(quoteCombosClient, 'const adult = totalNet + profit;', 'Quote combo frontend adult price must match backend total net plus profit.');
includes(quoteCombosClient, 'return { totalNet, adult, child: adult * childPercent / 100 };', 'Quote combo frontend child price must be percentage of adult price.');

includes(quotationsClient, 'const totalCost = rows.reduce((sum, item) => sum + itemCost(item, exchangeRate), 0);', 'Quotation frontend total cost must sum itemCost like backend.');
includes(quotationsClient, 'const totalMarkup = rows.reduce((sum, item) => sum + itemMarkup(item, exchangeRate), 0);', 'Quotation frontend total markup must sum itemMarkup like backend.');
includes(quotationsClient, 'const totalSelling = totalCost + totalMarkup;', 'Quotation frontend total selling must equal cost plus markup like backend.');
includes(quotationsClient, 'profitPerPax: sellingPerPax - costPerPax,', 'Quotation frontend profit per pax must match backend.');
includes(quotationsClient, 'marginRate: totalSelling ? totalMarkup / totalSelling * 100 : 0,', 'Quotation frontend margin rate must match backend.');
includes(quotationsService, 'childPrice: sellingPerPax * childPercent / 100, infantPrice: sellingPerPax * infantPercent / 100', 'Quotation backend child/infant price must be percentage of selling per pax.');
includes(quotationsService, 'return nightCount * netPrice * exchangeRate * (1 + vat / 100);', 'Quotation convert unit cost must preserve net price, exchange rate, VAT percent and night count.');
includes(quotationsService, 'return this.itemSelling(item, exchangeRate) / denominator;', 'Quotation convert unit selling must distribute item selling over quantity and nights.');

console.log('TEST_QUOTES_BACKEND_CONTRACT_OK');

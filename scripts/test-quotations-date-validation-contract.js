#!/usr/bin/env node
const { BadRequestException } = require('@nestjs/common');
const { QuotationsService } = require('../apps/api/dist/modules/quotations/quotations.service');

function assert(condition, label) {
  if (!condition) throw new Error(label);
}

function quotationDto(overrides = {}) {
  return {
    quoteCode: 'Q-DATE-CONTRACT',
    productType: 'FIT',
    customerName: 'Date Validation Customer',
    createdDate: '2026-02-01',
    expiredDate: '2026-02-28',
    departureDate: '2026-07-01',
    returnDate: '2026-07-02',
    paxAdult: 1,
    paxChild: 0,
    paxInfant: 0,
    currency: 'VND',
    exchangeRate: 1,
    items: [
      { serviceType: 'Hotel', serviceName: 'Hotel room', quantity: 1, paxCount: 1, nightCount: 1, netPrice: 100, vat: 0 },
    ],
    ...overrides,
  };
}

async function expectCreateDateRejected(field, value) {
  let transactionCalled = false;
  const service = new QuotationsService({
    $transaction: async () => {
      transactionCalled = true;
      throw new Error('create transaction should not run for invalid quotation dates');
    },
  });
  try {
    await service.create(quotationDto({ [field]: value }));
    throw new Error(`${field}=${value} should be rejected`);
  } catch (error) {
    assert(error instanceof BadRequestException, `${field}=${value} must reject with BadRequestException, got ${error?.constructor?.name || error}`);
    assert(!transactionCalled, `${field}=${value} must be rejected before opening the create transaction`);
  }
}

async function main() {
  await expectCreateDateRejected('createdDate', '2026-02-31');
  await expectCreateDateRejected('expiredDate', '2026-02-31');
  await expectCreateDateRejected('departureDate', '2026-02-31');
  await expectCreateDateRejected('returnDate', '2026-02-31');
  await expectCreateDateRejected('expectedPaymentDate', '2026-02-31');
  console.log('TEST_QUOTATIONS_DATE_VALIDATION_CONTRACT_OK');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

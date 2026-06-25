#!/usr/bin/env node
const { NotFoundException } = require('@nestjs/common');
const { QuotationsService } = require('../apps/api/dist/modules/quotations/quotations.service');

function assert(condition, label) {
  if (!condition) throw new Error(label);
}

const publicQuote = {
  quoteCode: 'Q-SMARTLINK-CONTRACT',
  productType: 'TOUR',
  customerName: 'SmartLink Customer',
  productCategory: 'Tour',
  route: 'HAN-SGN',
  paxAdult: 2,
  paxChild: 0,
  paxInfant: 0,
  paxTotal: 2,
  currency: 'VND',
  createdDate: new Date('2026-06-01T00:00:00.000Z'),
  expiredDate: new Date('2099-01-01T00:00:00.000Z'),
  departureDate: new Date('2026-07-01T00:00:00.000Z'),
  returnDate: new Date('2026-07-05T00:00:00.000Z'),
  totalSelling: 1000,
  sellingPerPax: 500,
  adultPrice: 500,
  childPrice: 375,
  infantPrice: 100,
  language: 'VI',
  terms: 'Terms',
  items: [],
};

async function main() {
  let capturedWhere;
  const service = new QuotationsService({
    quotation: {
      findFirst: async (args) => {
        capturedWhere = args.where;
        return publicQuote;
      },
    },
  });

  const token = 'A'.repeat(43);
  const quote = await service.publicDetail(token);
  assert(quote.quoteCode === publicQuote.quoteCode, 'valid enabled approved non-expired SmartLink should return public payload');
  assert(capturedWhere.smartLinkToken === token, 'public SmartLink must filter by token');
  assert(capturedWhere.smartLinkEnabled === true, 'public SmartLink must require enabled links');
  assert(capturedWhere.status === 'APPROVED', 'public SmartLink must require APPROVED status');
  assert(capturedWhere.expiredDate && capturedWhere.expiredDate.gt instanceof Date, 'public SmartLink must require expiredDate greater than now');

  const missingService = new QuotationsService({ quotation: { findFirst: async () => null } });
  for (const badToken of ['bad-token', 'B'.repeat(42), 'B'.repeat(44)]) {
    try {
      await missingService.publicDetail(badToken);
      throw new Error('invalid token should not resolve');
    } catch (error) {
      assert(error instanceof NotFoundException, 'invalid token must return a generic 404');
    }
  }

  console.log('TEST_QUOTATIONS_SMARTLINK_EXPIRY_CONTRACT_OK');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

require('reflect-metadata');

const { plainToInstance } = require('class-transformer');
const { validate } = require('class-validator');
const {
  CreateHotelSupplierDto,
  OverrideAllotmentDto,
  UpdateHotelSupplierDto,
} = require('../apps/api/dist/modules/suppliers/dto/hotel-supplier.dto');

const currentYear = new Date().getFullYear();
const validCreatePayload = {
  supplierCode: 'HTL-DTO-001',
  name: 'Khach san DTO',
  phone: '0901234567',
  classHotel: '4 sao',
  hotelProject: 'Du an DTO',
};

function flattenValidationMessages(errors) {
  return errors.flatMap((error) => {
    const ownMessages = Object.values(error.constraints || {});
    return [...ownMessages, ...flattenValidationMessages(error.children || [])];
  });
}

async function messagesFor(dtoClass, payload) {
  const instance = plainToInstance(dtoClass, payload);
  const errors = await validate(instance, {
    whitelist: true,
    forbidUnknownValues: false,
  });
  return flattenValidationMessages(errors);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertIncludes(messages, fragment, context) {
  assert(
    messages.some((message) => message.includes(fragment)),
    `${context} must include "${fragment}". Actual messages: ${JSON.stringify(messages)}`,
  );
}

async function expectValid(dtoClass, payload, context) {
  const messages = await messagesFor(dtoClass, payload);
  assert(messages.length === 0, `${context} should be valid. Actual messages: ${JSON.stringify(messages)}`);
}

async function expectInvalid(dtoClass, payload, expectedFragments, context) {
  const messages = await messagesFor(dtoClass, payload);
  assert(messages.length > 0, `${context} should be invalid`);
  for (const fragment of expectedFragments) assertIncludes(messages, fragment, context);
}

async function main() {
  await expectValid(CreateHotelSupplierDto, validCreatePayload, 'minimal hotel supplier create payload');

  await expectInvalid(CreateHotelSupplierDto, {}, [
    'Cần nhập mã nhà cung cấp',
    'Cần nhập tên khách sạn',
    'Cần nhập số điện thoại nhà cung cấp',
    'Cần chọn hoặc nhập hạng khách sạn',
    'Cần nhập dòng sản phẩm hoặc dự án khách sạn',
  ], 'required hotel supplier fields');

  await expectInvalid(CreateHotelSupplierDto, {
    supplierCode: ' ',
    name: ' ',
    phone: ' ',
    classHotel: ' ',
    hotelProject: ' ',
  }, [
    'Cần nhập mã nhà cung cấp',
    'Cần nhập tên khách sạn',
    'Cần nhập số điện thoại nhà cung cấp',
    'Cần chọn hoặc nhập hạng khách sạn',
    'Cần nhập dòng sản phẩm hoặc dự án khách sạn',
  ], 'blank required hotel supplier fields');

  await expectInvalid(CreateHotelSupplierDto, {
    ...validCreatePayload,
    email: 'bad-email',
    website: 'smarttour.local',
    link: 'ftp://smarttour.local/hotel',
  }, [
    'Email nhà cung cấp không hợp lệ',
    'Website nhà cung cấp phải là URL hợp lệ',
    'Liên kết tham khảo phải là URL hợp lệ',
  ], 'hotel supplier contact and URL format');

  await expectInvalid(CreateHotelSupplierDto, {
    ...validCreatePayload,
    builtYear: 1799,
    rating: -1,
    allotments: [{ serviceName: 'Phong Deluxe', allotmentQty: 1, cutoffDays: 366 }],
  }, [
    'Năm xây dựng không được nhỏ hơn 1800',
    'Xếp hạng khách sạn không được nhỏ hơn 0',
    'Số ngày chốt quỹ phòng không được vượt quá 365 ngày',
  ], 'hotel supplier min bounds');

  await expectInvalid(CreateHotelSupplierDto, {
    ...validCreatePayload,
    builtYear: currentYear + 1,
    rating: 6,
  }, [
    'Năm xây dựng không được lớn hơn',
    'Xếp hạng khách sạn không được lớn hơn 5',
  ], 'hotel supplier max bounds');

  await expectInvalid(CreateHotelSupplierDto, {
    ...validCreatePayload,
    contacts: [{}],
    services: [{}],
    allotments: [{}],
  }, [
    'Cần nhập tên người liên hệ',
    'Cần nhập tên dịch vụ',
    'Cần nhập tên quỹ phòng',
  ], 'empty nested hotel supplier rows');

  await expectInvalid(CreateHotelSupplierDto, {
    ...validCreatePayload,
    contacts: {},
    services: {},
    allotments: {},
  }, [
    'Danh sách người liên hệ phải là danh sách hợp lệ',
    'Danh sách dịch vụ khách sạn phải là danh sách hợp lệ',
    'Danh sách quỹ phòng phải là danh sách hợp lệ',
  ], 'invalid nested hotel supplier collection types');

  await expectValid(UpdateHotelSupplierDto, { name: 'Khach san DTO da cap nhat' }, 'partial hotel supplier update');
  const clearOptionalFields = plainToInstance(UpdateHotelSupplierDto, {
    market: '   ',
    link: '',
    rating: null,
    builtYear: '',
  });
  await expectValid(UpdateHotelSupplierDto, clearOptionalFields, 'partial hotel supplier update clearing optional profile fields');
  assert(
    clearOptionalFields.market === null
      && clearOptionalFields.link === null
      && clearOptionalFields.rating === null
      && clearOptionalFields.builtYear === null,
    'blank optional hotel profile fields should transform to null so updates can clear persisted values',
  );
  await expectInvalid(UpdateHotelSupplierDto, { contacts: [{}] }, [
    'Cần nhập tên người liên hệ',
  ], 'partial hotel supplier update with invalid contact row');
  await expectInvalid(UpdateHotelSupplierDto, { services: {} }, [
    'Danh sách dịch vụ khách sạn phải là danh sách hợp lệ',
  ], 'partial hotel supplier update with invalid services type');

  await expectValid(OverrideAllotmentDto, {
    note: 'Dieu chinh quy phong',
    allotmentQty: 5,
    bookedQty: 1,
    lockedQty: 2,
    status: 'STOP_SELL',
  }, 'valid allotment override payload');
  await expectInvalid(OverrideAllotmentDto, {
    note: 'Dieu chinh quy phong',
    status: 'UNKNOWN',
    allotmentQty: -1,
    bookedQty: 1.5,
    lockedQty: -1,
  }, [
    'Trạng thái quỹ phòng không hợp lệ',
    'Tổng quỹ phòng không được âm',
    'Số phòng đã đặt phải là số nguyên',
    'Số phòng đang giữ không được âm',
  ], 'invalid allotment override status and quantities');
}

main()
  .then(() => {
    console.log('TEST_SUPPLIERS_HOTEL_DTO_VALIDATION_OK');
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

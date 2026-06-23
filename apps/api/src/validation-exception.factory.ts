import { BadRequestException } from '@nestjs/common';
import type { ValidationError } from 'class-validator';

const DEFAULT_ERROR_PATTERNS = [
  'must ',
  'should ',
  'each value in ',
  'property ',
  'an unknown value ',
];

function isDefaultClassValidatorMessage(message: string) {
  const normalized = message.toLowerCase();
  return DEFAULT_ERROR_PATTERNS.some((pattern) => normalized.includes(pattern));
}

const FIELD_LABELS: Record<string, string> = {
  actor: 'Người thực hiện',
  address: 'Địa chỉ',
  allotments: 'Danh sách quỹ phòng',
  bankAccountName: 'Tên tài khoản ngân hàng',
  bankAccountNumber: 'Số tài khoản ngân hàng',
  bankName: 'Tên ngân hàng',
  birthday: 'Ngày sinh',
  bookedQty: 'Số phòng đã đặt',
  categoryId: 'Mã loại nhà cung cấp',
  classHotel: 'Hạng khách sạn',
  comboCode: 'Mã combo',
  comboType: 'Loại combo',
  contacts: 'Danh sách người liên hệ',
  content: 'Nội dung',
  cutoffDays: 'Số ngày chốt quỹ phòng',
  costItems: 'Danh sách chi phí',
  costType: 'Loại chi phí',
  createdDate: 'Ngày tạo',
  currency: 'Tiền tệ',
  customerAddress: 'Địa chỉ khách hàng',
  customerCode: 'Mã khách hàng',
  customerEmail: 'Email khách hàng',
  customerName: 'Tên khách hàng',
  customerNote: 'Ghi chú khách hàng',
  customerPhone: 'Số điện thoại khách hàng',
  dayNo: 'Ngày lịch trình',
  department: 'Phòng ban',
  departureDate: 'Ngày khởi hành',
  description: 'Mô tả',
  email: 'Email',
  endDate: 'Ngày kết thúc',
  exchangeRate: 'Tỷ giá',
  expectedPaymentDate: 'Ngày dự kiến thanh toán',
  expiredDate: 'Ngày hết hạn',
  file: 'File',
  fullName: 'Tên người liên hệ',
  hotelProject: 'Dự án khách sạn',
  infantPricePercent: '% giá em bé',
  infantQty: 'Số em bé',
  itineraries: 'Danh sách lịch trình',
  language: 'Ngôn ngữ',
  link: 'Liên kết',
  lockedQty: 'Số phòng đang giữ',
  marketGroup: 'Nhóm thị trường',
  markupAmount: 'Lãi cố định',
  markupPercent: 'Lãi %',
  market: 'Thị trường',
  metadata: 'Metadata',
  name: 'Tên nhà cung cấp',
  netPrice: 'Giá NET',
  netPricePerService: 'Giá NET/dịch vụ',
  nightCount: 'Số đêm',
  note: 'Ghi chú',
  notes: 'Ghi chú',
  operatorOwner: 'Điều hành phụ trách',
  paxAdult: 'Số người lớn',
  paxChild: 'Số trẻ em',
  paxCount: 'Số khách',
  paxInfant: 'Số em bé',
  paxPerRoom: 'Số khách/phòng',
  phone: 'Số điện thoại',
  position: 'Chức vụ',
  province: 'Tỉnh/thành',
  productCategory: 'Loại hình sản phẩm',
  productType: 'Loại sản phẩm',
  quantity: 'Số lượng',
  quoteCode: 'Mã báo giá',
  rating: 'Xếp hạng',
  returnDate: 'Ngày kết thúc',
  route: 'Hành trình',
  salesOwner: 'Sales phụ trách',
  serviceCount: 'Số lượt dịch vụ',
  serviceName: 'Tên dịch vụ',
  services: 'Danh sách dịch vụ',
  serviceType: 'Loại dịch vụ',
  sku: 'Mã dịch vụ',
  smartLinkEnabled: 'Trạng thái SmartLink',
  startDate: 'Ngày bắt đầu',
  status: 'Trạng thái',
  supplierCode: 'Mã nhà cung cấp',
  supplierId: 'Mã nhà cung cấp',
  taxCode: 'Mã số thuế',
  terms: 'Điều khoản',
  tourCode: 'Mã tour',
  tourName: 'Tên tour',
  unit: 'Đơn vị tính',
  unitPrice: 'Đơn giá',
  vat: 'VAT/phụ thu',
  website: 'Website',
};

function label(property: string) {
  if (!property) return 'Trường dữ liệu';
  const parts = property.split('.');
  const lastNamedPart = [...parts].reverse().find((part) => Number.isNaN(Number(part)));
  return FIELD_LABELS[lastNamedPart ?? property] ?? property;
}

function messageForConstraint(property: string, constraint: string, message: string) {
  if (message && !isDefaultClassValidatorMessage(message)) return message;

  const field = label(property);
  switch (constraint) {
    case 'whitelistValidation':
      return `${field} không được phép gửi lên`;
    case 'isDefined':
    case 'isNotEmpty':
      return `${field} là bắt buộc`;
    case 'isString':
      return `${field} phải là chuỗi ký tự`;
    case 'isInt':
      return `${field} phải là số nguyên hợp lệ`;
    case 'isNumber':
      return `${field} phải là số hợp lệ`;
    case 'isBoolean':
      return `${field} phải là giá trị đúng/sai`;
    case 'isArray':
      return `${field} phải là danh sách`;
    case 'isEmail':
      return `${field} phải là email hợp lệ`;
    case 'isEnum':
      return `${field} không thuộc danh sách giá trị hợp lệ`;
    case 'isDateString':
      return `${field} phải là ngày hợp lệ`;
    case 'isUUID':
      return `${field} phải là UUID hợp lệ`;
    case 'isUrl':
      return `${field} phải là URL hợp lệ`;
    case 'isObject':
      return `${field} phải là object hợp lệ`;
    case 'matches':
      return `${field} không đúng định dạng`;
    case 'nestedValidation':
    case 'unknownValue':
      return `${field} không hợp lệ`;
    case 'min':
      return `${field} nhỏ hơn giá trị tối thiểu cho phép`;
    case 'max':
      return `${field} lớn hơn giá trị tối đa cho phép`;
    case 'minLength':
      return `${field} ngắn hơn độ dài tối thiểu cho phép`;
    case 'maxLength':
      return `${field} dài hơn độ dài tối đa cho phép`;
    case 'arrayMinSize':
      return `${field} chưa đủ số lượng tối thiểu`;
    default:
      return `${field} không hợp lệ`;
  }
}

function collectValidationMessages(errors: ValidationError[], parent = ''): string[] {
  return errors.flatMap((error) => {
    const property = parent ? `${parent}.${error.property}` : error.property;
    const ownMessages = Object.entries(error.constraints ?? {}).map(([constraint, message]) => (
      messageForConstraint(property, constraint, message)
    ));
    return [...ownMessages, ...collectValidationMessages(error.children ?? [], property)];
  });
}

export function validationExceptionFactory(errors: ValidationError[]) {
  const messages = collectValidationMessages(errors);
  const responseMessages = messages.length ? messages : ['Dữ liệu không hợp lệ'];
  return new BadRequestException({
    statusCode: 400,
    messages: responseMessages,
    code: 'VALIDATION_ERROR',
    message: messages.length ? messages : ['Dữ liệu không hợp lệ'],
    error: 'Dữ liệu không hợp lệ',
  });
}

import { BadRequestException } from '@nestjs/common';
import type { ValidationError } from 'class-validator';

const DEFAULT_ERROR_PATTERNS = [
  'must ',
  'should ',
  'each value in ',
  'property ',
];

function isDefaultClassValidatorMessage(message: string) {
  const normalized = message.toLowerCase();
  return DEFAULT_ERROR_PATTERNS.some((pattern) => normalized.includes(pattern));
}

function label(property: string) {
  return property || 'Trường dữ liệu';
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
      return message || `${field} không hợp lệ`;
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
  return new BadRequestException({
    statusCode: 400,
    message: messages.length ? messages : ['Dữ liệu không hợp lệ'],
    error: 'Dữ liệu không hợp lệ',
  });
}

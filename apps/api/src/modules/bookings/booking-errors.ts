export const BOOKING_NOT_FOUND_MESSAGES = {
  booking: 'Không tìm thấy booking',
  tourProgram: 'Không tìm thấy chương trình tour',
  customer: 'Không tìm thấy khách hàng',
  order: 'Không tìm thấy đơn hàng',
  tour: 'Không tìm thấy tour',
} as const;

export type BookingNotFoundEntity = keyof typeof BOOKING_NOT_FOUND_MESSAGES;

export function bookingNotFoundMessage(entity: BookingNotFoundEntity) {
  return BOOKING_NOT_FOUND_MESSAGES[entity];
}

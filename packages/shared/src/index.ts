export const operationStatuses = ['PENDING', 'IN_PROGRESS', 'DONE', 'PROBLEM', 'CANCELLED'] as const;
export const bookingStatuses = ['DRAFT', 'CONFIRMED', 'OPERATING', 'COMPLETED', 'CANCELLED'] as const;
export const supplierPaymentStatuses = ['DRAFT', 'REQUESTED', 'APPROVED', 'PAID', 'REJECTED'] as const;

export type OperationStatus = (typeof operationStatuses)[number];
export type BookingStatus = (typeof bookingStatuses)[number];
export type SupplierPaymentStatus = (typeof supplierPaymentStatuses)[number];

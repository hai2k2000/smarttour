export const SUPPLIER_ALLOTMENT_STATUSES = ['ACTIVE', 'INACTIVE', 'STOP_SELL'] as const;

export type SupplierAllotmentStatus = (typeof SUPPLIER_ALLOTMENT_STATUSES)[number];


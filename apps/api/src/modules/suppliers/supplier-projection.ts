import { RequestUser, userPermissions } from '../auth/data-scope';

export const SUPPLIER_FINANCIAL_VIEW_PERMISSION = 'finance.payment.view';
const SUPPLIER_SENSITIVE_FIELDS = ['taxCode', 'bankAccountName', 'bankAccountNumber', 'bankName', 'debtNote', 'pricePolicy'] as const;
const HOTEL_PROFILE_SENSITIVE_FIELDS = ['bankAccountName', 'bankAccountNumber', 'bankName'] as const;

export function canViewSupplierFinancialFields(user?: RequestUser) {
  const permissions = userPermissions(user);
  return permissions.has('*') || permissions.has(SUPPLIER_FINANCIAL_VIEW_PERMISSION);
}

export function maskSupplierFinancialFields<T>(value: T, user?: RequestUser): T {
  if (canViewSupplierFinancialFields(user)) return value;
  if (Array.isArray(value)) return value.map((item) => maskSupplierFinancialFields(item, user)) as T;
  if (!value || typeof value !== 'object') return value;

  const supplier = { ...(value as Record<string, unknown>) };
  for (const field of SUPPLIER_SENSITIVE_FIELDS) delete supplier[field];

  if (supplier.hotelProfile && typeof supplier.hotelProfile === 'object') {
    const hotelProfile = { ...(supplier.hotelProfile as Record<string, unknown>) };
    for (const field of HOTEL_PROFILE_SENSITIVE_FIELDS) delete hotelProfile[field];
    supplier.hotelProfile = hotelProfile;
  }

  return supplier as T;
}

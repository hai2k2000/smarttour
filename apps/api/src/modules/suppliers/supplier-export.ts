import { RequestUser } from '../auth/data-scope';
import { maskSupplierFinancialFields } from './supplier-projection';

export const SUPPLIER_EXPORT_HEADERS = [
  'supplierCode',
  'name',
  'category',
  'status',
  'contactPerson',
  'phone',
  'email',
  'country',
  'province',
  'address',
  'website',
  'market',
  'taxCode',
  'bankAccountName',
  'bankAccountNumber',
  'bankName',
  'debtNote',
  'pricePolicy',
  'hotelProject',
  'classHotel',
  'hotelMarket',
  'hotelBankAccountName',
  'hotelBankAccountNumber',
  'hotelBankName',
  'contacts',
  'services',
  'notes',
  'updatedAt',
] as const;

type SupplierExportHeader = typeof SUPPLIER_EXPORT_HEADERS[number];

type NamedRelation = { name?: string | null };
type SupplierExportContact = { fullName?: string | null; position?: string | null; phone?: string | null; email?: string | null };
type SupplierExportService = { sku?: string | null; serviceName?: string | null };
type SupplierExportHotelProfile = {
  hotelProject?: string | null;
  classHotel?: string | null;
  market?: string | null;
  bankAccountName?: string | null;
  bankAccountNumber?: string | null;
  bankName?: string | null;
};

export type SupplierExportRow = {
  supplierCode?: string | null;
  name?: string | null;
  category?: NamedRelation | null;
  status?: string | null;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
  country?: string | null;
  province?: string | null;
  address?: string | null;
  website?: string | null;
  market?: string | null;
  taxCode?: string | null;
  bankAccountName?: string | null;
  bankAccountNumber?: string | null;
  bankName?: string | null;
  debtNote?: string | null;
  pricePolicy?: string | null;
  hotelProfile?: SupplierExportHotelProfile | null;
  contacts?: SupplierExportContact[] | null;
  supplierServices?: SupplierExportService[] | null;
  services?: SupplierExportService[] | null;
  notes?: string | null;
  updatedAt?: Date | string | null;
};

export function toSupplierExportCsvRows(rows: SupplierExportRow[], user?: RequestUser): Array<Record<SupplierExportHeader, unknown>> {
  const maskedRows = maskSupplierFinancialFields(rows, user) as SupplierExportRow[];
  return maskedRows.map((row) => {
    const hotelProfile = row.hotelProfile || {};
    return {
      supplierCode: text(row.supplierCode),
      name: text(row.name),
      category: text(row.category?.name),
      status: text(row.status),
      contactPerson: text(row.contactPerson),
      phone: text(row.phone),
      email: text(row.email),
      country: text(row.country),
      province: text(row.province),
      address: text(row.address),
      website: text(row.website),
      market: text(row.market),
      taxCode: text(row.taxCode),
      bankAccountName: text(row.bankAccountName),
      bankAccountNumber: text(row.bankAccountNumber),
      bankName: text(row.bankName),
      debtNote: text(row.debtNote),
      pricePolicy: text(row.pricePolicy),
      hotelProject: text(hotelProfile.hotelProject),
      classHotel: text(hotelProfile.classHotel),
      hotelMarket: text(hotelProfile.market),
      hotelBankAccountName: text(hotelProfile.bankAccountName),
      hotelBankAccountNumber: text(hotelProfile.bankAccountNumber),
      hotelBankName: text(hotelProfile.bankName),
      contacts: contactsText(row.contacts),
      services: servicesText(row.supplierServices || row.services),
      notes: text(row.notes),
      updatedAt: text(row.updatedAt),
    };
  });
}

function contactsText(contacts?: SupplierExportContact[] | null) {
  return (contacts || [])
    .map((contact) => [contact.fullName, contact.position, contact.phone, contact.email].map(text).filter(Boolean).join(' | '))
    .filter(Boolean)
    .join('; ');
}

function servicesText(services?: SupplierExportService[] | null) {
  return (services || [])
    .map((service) => [service.sku, service.serviceName].map(text).filter(Boolean).join(' - '))
    .filter(Boolean)
    .join('; ');
}

function text(value: unknown) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

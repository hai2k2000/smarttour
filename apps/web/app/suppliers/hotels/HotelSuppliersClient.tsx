'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { BedDouble, CheckCircle2, FileUp, LockKeyhole, Pencil, Plus, RefreshCcw, Save, Search, Settings2, Trash2, Undo2, X } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { FieldArrayWithId, useFieldArray, useForm, UseFieldArrayReturn, UseFormRegister } from 'react-hook-form';
import { z } from 'zod';
import { PermissionNotice, usePermissions } from '../../usePermissions';
import {
  SupplierFiles,
  SupplierNotice,
  SupplierNoticeBanner,
  SupplierStatus,
  dayTypeLabel,
  supplierLifecycleStatusOptions,
  supplierLifecycleStatuses,
  supplierApi,
  type SupplierLifecycleStatus,
  uploadSupplierFiles,
} from '../SupplierClientUi';
import { SupplierFile } from '../uploadSupplierFiles';

type ContactLine = { fullName: string; position?: string; birthday?: string; phone?: string; email?: string };
type ServiceLine = {
  id?: string;
  sku?: string;
  serviceName: string;
  startDate?: string;
  endDate?: string;
  dayType?: string;
  accountingPrice?: number;
  netPrice?: number;
  sellingPrice?: number;
  description?: string;
  note?: string;
};
type Allocation = {
  id: string;
  quantity: number;
  status: string;
  bookingId?: string | null;
  orderId?: string | null;
  tourId?: string | null;
  note?: string | null;
  createdAt?: string;
};
type AllotmentLine = {
  id?: string;
  serviceId?: string | null;
  sku?: string;
  serviceName: string;
  startDate?: string;
  endDate?: string;
  dayType?: string;
  allotmentQty?: number;
  bookedQty?: number;
  lockedQty?: number;
  quantityLock?: number;
  cutoffDays?: number;
  netCostPerDay?: number;
  sellingPricePerDay?: number;
  status?: string;
  computedStatus?: string;
  remainingQty?: number;
  overbookedQty?: number;
  occupancyRate?: number;
  sellThroughRate?: number;
  isCodLocked?: boolean;
  description?: string;
  note?: string;
  allocations?: Allocation[];
};
type HotelSupplier = {
  id: string;
  supplierCode: string | null;
  name: string;
  taxCode: string | null;
  phone: string | null;
  email: string | null;
  country?: string | null;
  province: string | null;
  address: string | null;
  website: string | null;
  notes?: string | null;
  status: SupplierLifecycleStatus;
  hotelProfile: {
    builtYear: number | null;
    rating: number | null;
    classHotel: string;
    hotelProject: string;
    bankAccountName: string | null;
    bankAccountNumber: string | null;
    bankName: string | null;
    market: string | null;
    link: string | null;
  } | null;
  contacts?: ContactLine[];
  supplierServices?: ServiceLine[];
  allotments?: AllotmentLine[];
  files?: SupplierFile[];
};
type Booking = { id: string; code: string; customerName?: string; startDate?: string };
type Filters = { search: string; status: string; province: string; market: string; hotelProject: string; classHotel: string };
type InventoryFilters = { supplierId: string; startDate: string; endDate: string };
type AllotmentInventoryLine = AllotmentLine & {
  supplier?: { id: string; name: string; supplierCode?: string | null } | null;
  overbookedQty?: number;
  occupancyRate?: number;
  sellThroughRate?: number;
  isCodLocked?: boolean;
  allocationSummary?: { locked: number; confirmed: number; released: number };
  activeAllocationCount?: number;
};
type AllotmentAction =
  | { type: 'override'; allotment: AllotmentLine }
  | { type: 'lock'; allotment: AllotmentLine }
  | null;

const dayTypes = ['ALL_DAYS', 'WEEKDAY', 'WEEKEND', 'HOLIDAY', 'PEAK'] as const;
const allotmentStatuses = ['ACTIVE', 'INACTIVE', 'STOP_SELL'] as const;
const currentYear = new Date().getFullYear();
const maxSupplierMoney = 999_999_999_999;
const maxSupplierAllotmentCutoffDays = 365;
const hotelListQueryKeys = ['search', 'status', 'province', 'market', 'hotelProject', 'classHotel'] as const;
const hotelFilterMaxLengths = { search: 200, province: 120, market: 120, hotelProject: 180, classHotel: 80 } as const;
const hotelFilterLabels = {
  search: 'Từ khóa tìm kiếm',
  province: 'Tỉnh/thành',
  market: 'Thị trường',
  hotelProject: 'Dự án khách sạn',
  classHotel: 'Hạng khách sạn',
} as const;
const supplierPhonePattern = /^(?=(?:\D*\d){6,15}\D*$)[+\d\s().-]+$/;
const isOptionalHttpUrl = (value: string) => {
  if (!value) return true;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && Boolean(url.hostname);
  } catch {
    return false;
  }
};
const isOptionalDateOnly = (value: string) => {
  if (!value) return true;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};
const optionalBuiltYear = z.preprocess(
  (value) => value === '' || value === undefined ? undefined : value,
  z.coerce.number().int('Năm xây dựng phải là số nguyên').min(1800, 'Năm xây dựng không được nhỏ hơn 1800').max(currentYear, `Năm xây dựng không được lớn hơn ${currentYear}`).optional(),
);
const nonNegativeMoney = z.coerce.number().min(0, 'Giá trị không được âm').max(maxSupplierMoney, 'Giá trị không được vượt quá 999.999.999.999').default(0);
const requiredPhone = z.string().trim().min(1, 'Cần nhập số điện thoại').regex(supplierPhonePattern, 'Số điện thoại phải có từ 6 đến 15 chữ số và chỉ dùng số, khoảng trắng hoặc ký tự +().-');
const optionalPhone = z.string().trim().refine((value) => !value || supplierPhonePattern.test(value), 'Số điện thoại không hợp lệ').default('');
const optionalUrl = (label: string) => z.string().trim().refine(isOptionalHttpUrl, `${label} phải là URL hợp lệ bắt đầu bằng http:// hoặc https://`).default('');
const optionalDateOnly = (label: string) => z.string().trim().refine(isOptionalDateOnly, `${label} không hợp lệ`).default('');
const optionalText = (maxLength: number, label: string) => z.string().trim().max(maxLength, `${label} không được vượt quá ${maxLength.toLocaleString('vi-VN')} ký tự`).default('');
const optionalInternalNotes = z.string().trim().max(2000, 'Ghi chú nội bộ không được vượt quá 2.000 ký tự').default('');
const contactSchema = z.object({
  fullName: z.string().default(''),
  position: z.string().default(''),
  birthday: z.string().trim().refine(isOptionalDateOnly, 'Ngày sinh người liên hệ không hợp lệ').default(''),
  phone: optionalPhone,
  email: z.string().email('Email người liên hệ không hợp lệ').or(z.literal('')).default(''),
});
const serviceSchema = z.object({
  sku: z.string().trim().max(80, 'Mã dịch vụ không được vượt quá 80 ký tự').default(''),
  serviceName: z.string().trim().max(180, 'Tên dịch vụ không được vượt quá 180 ký tự').default(''),
  startDate: optionalDateOnly('Ngày bắt đầu dịch vụ'),
  endDate: optionalDateOnly('Ngày kết thúc dịch vụ'),
  dayType: z.enum(dayTypes).default('ALL_DAYS'),
  accountingPrice: nonNegativeMoney,
  netPrice: nonNegativeMoney,
  sellingPrice: nonNegativeMoney,
  description: z.string().max(2000, 'Mô tả dịch vụ không được vượt quá 2.000 ký tự').default(''),
  note: z.string().max(2000, 'Ghi chú dịch vụ không được vượt quá 2.000 ký tự').default(''),
});
type ServiceFormRow = z.infer<typeof serviceSchema>;
function hasServiceRowData(item: ServiceFormRow) {
  return Boolean(
    item.sku.trim()
    || item.serviceName.trim()
    || item.startDate.trim()
    || item.endDate.trim()
    || item.description.trim()
    || item.note.trim()
    || item.dayType !== 'ALL_DAYS'
    || Number(item.accountingPrice || 0) > 0
    || Number(item.netPrice || 0) > 0
    || Number(item.sellingPrice || 0) > 0,
  );
}
const allotmentSchema = z.object({
  sku: z.string().trim().max(80, 'Mã quỹ phòng không được vượt quá 80 ký tự').default(''),
  serviceName: z.string().trim().max(180, 'Tên quỹ phòng không được vượt quá 180 ký tự').default(''),
  startDate: optionalDateOnly('Ngày bắt đầu quỹ phòng'),
  endDate: optionalDateOnly('Ngày kết thúc quỹ phòng'),
  dayType: z.enum(dayTypes).default('ALL_DAYS'),
  allotmentQty: z.coerce.number().int('Tổng quỹ phòng phải là số nguyên').min(0, 'Tổng quỹ phòng không được âm').default(0),
  bookedQty: z.coerce.number().int('Số phòng đã đặt phải là số nguyên').min(0, 'Số phòng đã đặt không được âm').default(0),
  lockedQty: z.coerce.number().int('Số phòng đang giữ phải là số nguyên').min(0, 'Số phòng đang giữ không được âm').default(0),
  cutoffDays: z.coerce.number().int('Số ngày chốt quỹ phòng phải là số nguyên').min(0, 'Số ngày chốt quỹ phòng không được âm').max(maxSupplierAllotmentCutoffDays, 'Số ngày chốt quỹ phòng không được vượt quá 365 ngày').default(0),
  netCostPerDay: nonNegativeMoney,
  sellingPricePerDay: nonNegativeMoney,
  status: z.enum(allotmentStatuses).default('ACTIVE'),
  description: z.string().max(2000, 'Mô tả quỹ phòng không được vượt quá 2.000 ký tự').default(''),
  note: z.string().max(2000, 'Ghi chú quỹ phòng không được vượt quá 2.000 ký tự').default(''),
});
type AllotmentFormRow = z.infer<typeof allotmentSchema>;
function hasAllotmentRowData(item: AllotmentFormRow) {
  return Boolean(
    item.sku.trim()
    || item.serviceName.trim()
    || item.startDate.trim()
    || item.endDate.trim()
    || item.description.trim()
    || item.note.trim()
    || item.dayType !== 'ALL_DAYS'
    || item.status !== 'ACTIVE'
    || Number(item.allotmentQty || 0) > 0
    || Number(item.bookedQty || 0) > 0
    || Number(item.lockedQty || 0) > 0
    || Number(item.cutoffDays || 0) > 0
    || Number(item.netCostPerDay || 0) > 0
    || Number(item.sellingPricePerDay || 0) > 0,
  );
}
const hotelSchema = z.object({
  supplierCode: z.string().trim().min(2, 'Mã nhà cung cấp phải có ít nhất 2 ký tự').max(80, 'Mã nhà cung cấp không được vượt quá 80 ký tự'),
  name: z.string().trim().min(2, 'Tên nhà cung cấp phải có ít nhất 2 ký tự').max(180, 'Tên nhà cung cấp không được vượt quá 180 ký tự'),
  taxCode: optionalText(80, 'Mã số thuế'),
  builtYear: optionalBuiltYear,
  phone: requiredPhone,
  email: z.string().email('Email nhà cung cấp không hợp lệ').or(z.literal('')).default(''),
  country: optionalText(120, 'Quốc gia'),
  province: optionalText(120, 'Tỉnh/thành'),
  address: optionalText(500, 'Địa chỉ'),
  notes: optionalInternalNotes,
  rating: z.coerce.number().int('Xếp hạng khách sạn phải là số nguyên').min(0, 'Xếp hạng khách sạn không được nhỏ hơn 0').max(5, 'Xếp hạng khách sạn không được lớn hơn 5').default(0),
  website: optionalUrl('Website nhà cung cấp'),
  classHotel: z.string().trim().min(2, 'Hạng khách sạn phải có ít nhất 2 ký tự').max(80, 'Hạng khách sạn không được vượt quá 80 ký tự'),
  hotelProject: z.string().trim().min(2, 'Dự án khách sạn phải có ít nhất 2 ký tự').max(180, 'Dự án khách sạn không được vượt quá 180 ký tự'),
  bankAccountName: optionalText(180, 'Tên tài khoản ngân hàng'),
  bankAccountNumber: optionalText(80, 'Số tài khoản ngân hàng'),
  bankName: optionalText(180, 'Tên ngân hàng'),
  market: optionalText(120, 'Thị trường'),
  link: optionalUrl('Liên kết tham khảo'),
  status: z.enum(supplierLifecycleStatuses).default('ACTIVE'),
  contacts: z.array(contactSchema).default([]),
  services: z.array(serviceSchema).default([]),
  allotments: z.array(allotmentSchema).default([]),
}).superRefine((value, context) => {
  value.contacts.forEach((item, index) => {
    const hasContactData = [item.fullName, item.position, item.birthday, item.phone, item.email].some((field) => field.trim());
    if (hasContactData && item.fullName.trim().length < 2) {
      context.addIssue({ code: 'custom', path: ['contacts', index, 'fullName'], message: 'Họ tên người liên hệ phải có ít nhất 2 ký tự' });
    }
  });
  value.services.forEach((item, index) => {
    const hasData = hasServiceRowData(item);
    if (hasData && item.serviceName.trim().length < 2) {
      context.addIssue({ code: 'custom', path: ['services', index, 'serviceName'], message: 'Tên dịch vụ phải có ít nhất 2 ký tự' });
    }
    if (item.startDate && item.endDate && item.startDate > item.endDate) {
      context.addIssue({ code: 'custom', path: ['services', index, 'endDate'], message: 'Ngày bắt đầu dịch vụ không được sau ngày kết thúc dịch vụ' });
    }
  });
  const serviceSkuMap = new Map<string, number>();
  value.services.forEach((item, index) => {
    const sku = item.sku.trim().toUpperCase();
    if (!sku) return;
    const firstIndex = serviceSkuMap.get(sku);
    if (firstIndex !== undefined) {
      context.addIssue({ code: 'custom', path: ['services', index, 'sku'], message: 'Mã dịch vụ không được trùng trong cùng nhà cung cấp' });
      return;
    }
    serviceSkuMap.set(sku, index);
  });
  value.allotments.forEach((item, index) => {
    const hasData = hasAllotmentRowData(item);
    if (hasData && item.serviceName.trim().length < 2) {
      context.addIssue({ code: 'custom', path: ['allotments', index, 'serviceName'], message: 'Tên quỹ phòng phải có ít nhất 2 ký tự' });
    }
    if (item.startDate && item.endDate && item.startDate > item.endDate) {
      context.addIssue({ code: 'custom', path: ['allotments', index, 'endDate'], message: 'Ngày bắt đầu quỹ phòng không được sau ngày kết thúc quỹ phòng' });
    }
    if (item.bookedQty + item.lockedQty > item.allotmentQty) {
      context.addIssue({ code: 'custom', path: ['allotments', index, 'allotmentQty'], message: 'Tổng quỹ phòng phải lớn hơn hoặc bằng số phòng đã đặt cộng số phòng đang giữ' });
    }
  });
});

type HotelForm = z.infer<typeof hotelSchema>;
type ArrayName = 'contacts' | 'services' | 'allotments';
type ColumnSpec = { key: string; label: string; type?: 'text' | 'number' | 'date' | 'time' | 'email' | 'tel' | 'select' | 'textarea'; readOnly?: boolean };
type DirtyCollections = Partial<Record<ArrayName, unknown>>;

const emptyContact = { fullName: '', position: '', birthday: '', phone: '', email: '' };
const emptyService = { sku: '', serviceName: '', startDate: '', endDate: '', dayType: 'ALL_DAYS' as const, accountingPrice: 0, netPrice: 0, sellingPrice: 0, description: '', note: '' };
const emptyAllotment = { sku: '', serviceName: '', startDate: '', endDate: '', dayType: 'ALL_DAYS' as const, allotmentQty: 0, bookedQty: 0, lockedQty: 0, cutoffDays: 0, netCostPerDay: 0, sellingPricePerDay: 0, status: 'ACTIVE' as const, description: '', note: '' };
const defaultValues: HotelForm = {
  supplierCode: '',
  name: '',
  taxCode: '',
  builtYear: undefined,
  phone: '',
  email: '',
  country: 'Việt Nam',
  province: '',
  address: '',
  notes: '',
  rating: 0,
  website: '',
  classHotel: '',
  hotelProject: '',
  bankAccountName: '',
  bankAccountNumber: '',
  bankName: '',
  market: '',
  link: '',
  status: 'ACTIVE',
  contacts: [emptyContact],
  services: [emptyService],
  allotments: [emptyAllotment],
};
const defaultFilters: Filters = { search: '', status: '', province: '', market: '', hotelProject: '', classHotel: '' };
const defaultInventoryFilters: InventoryFilters = { supplierId: '', startDate: '', endDate: '' };

function createFieldArrayRow(row: Record<string, unknown>) {
  return { ...row };
}

function validateHotelFilters(filters: Filters) {
  for (const key of Object.keys(hotelFilterMaxLengths) as Array<keyof typeof hotelFilterMaxLengths>) {
    const value = filters[key].trim();
    const maxLength = hotelFilterMaxLengths[key];
    if (value.length > maxLength) return `${hotelFilterLabels[key]} không được vượt quá ${maxLength.toLocaleString('vi-VN')} ký tự.`;
  }
  if (filters.status.trim() && !supplierLifecycleStatuses.includes(filters.status.trim() as SupplierLifecycleStatus)) {
    return 'Trạng thái nhà cung cấp không hợp lệ.';
  }
  return '';
}

function buildHotelListSearchParams(filters: Filters) {
  const params = new URLSearchParams();
  hotelListQueryKeys.forEach((key) => {
    const value = filters[key].trim();
    if (value) params.set(key, value);
  });
  return params;
}

function shouldSendCollection(mode: 'create' | 'update', dirtyFields: DirtyCollections, name: ArrayName) {
  return mode === 'create' || dirtyFields[name] !== undefined;
}

function hotelSupplierPayload(values: HotelForm, mode: 'create' | 'update', dirtyFields: DirtyCollections) {
  return {
    ...values,
    builtYear: values.builtYear ?? undefined,
    rating: values.rating ?? undefined,
    ...(shouldSendCollection(mode, dirtyFields, 'contacts') ? { contacts: values.contacts.filter((item) => item.fullName.trim()) } : {}),
    ...(shouldSendCollection(mode, dirtyFields, 'services') ? { services: values.services.filter(hasServiceRowData) } : {}),
    ...(mode === 'create' ? { allotments: values.allotments.filter(hasAllotmentRowData) } : {}),
  };
}

function textValue(value: unknown, fallback = '') {
  if (value === undefined || value === null) return fallback;
  return String(value);
}

function numberValue(value: unknown, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function formatNumber(value: unknown) {
  return numberValue(value).toLocaleString('vi-VN');
}

function optionalNumberValue(value: unknown) {
  if (value === undefined || value === null || value === '') return undefined;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function dateOnly(value?: unknown) {
  if (value === undefined || value === null || value === '') return '';
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString().slice(0, 10);
  const text = String(value).trim();
  const dateOnlyMatch = /^(\d{4}-\d{2}-\d{2})/.exec(text);
  if (dateOnlyMatch) return dateOnlyMatch[1];
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
}

function asDayType(value: unknown): HotelForm['services'][number]['dayType'] {
  return dayTypes.includes(value as HotelForm['services'][number]['dayType'])
    ? value as HotelForm['services'][number]['dayType']
    : 'ALL_DAYS';
}

function asAllotmentStatus(value: unknown): HotelForm['allotments'][number]['status'] {
  return allotmentStatuses.includes(value as HotelForm['allotments'][number]['status'])
    ? value as HotelForm['allotments'][number]['status']
    : 'ACTIVE';
}

function asSupplierLifecycleStatus(value: unknown): SupplierLifecycleStatus {
  return supplierLifecycleStatuses.includes(value as SupplierLifecycleStatus) ? value as SupplierLifecycleStatus : 'ACTIVE';
}

function allotmentDisplayMetrics(allotment: AllotmentLine) {
  const total = numberValue(allotment.allotmentQty ?? allotment.quantityLock);
  const booked = numberValue(allotment.bookedQty);
  const locked = numberValue(allotment.lockedQty ?? allotment.quantityLock);
  const remaining = numberValue(allotment.remainingQty, Math.max(0, total - booked - locked));
  const overbooked = numberValue(allotment.overbookedQty, Math.max(0, booked + locked - total));
  return { total, booked, locked, remaining, overbooked };
}

function toForm(hotel: HotelSupplier): HotelForm {
  const hotelProfile = hotel.hotelProfile;
  return {
    supplierCode: textValue(hotel.supplierCode),
    name: textValue(hotel.name),
    taxCode: textValue(hotel.taxCode),
    builtYear: optionalNumberValue(hotelProfile?.builtYear),
    phone: textValue(hotel.phone),
    email: textValue(hotel.email),
    country: textValue(hotel.country, 'Việt Nam') || 'Việt Nam',
    province: textValue(hotel.province),
    address: textValue(hotel.address),
    notes: textValue(hotel.notes),
    rating: numberValue(hotelProfile?.rating),
    website: textValue(hotel.website),
    classHotel: textValue(hotelProfile?.classHotel),
    hotelProject: textValue(hotelProfile?.hotelProject),
    bankAccountName: textValue(hotelProfile?.bankAccountName),
    bankAccountNumber: textValue(hotelProfile?.bankAccountNumber),
    bankName: textValue(hotelProfile?.bankName),
    market: textValue(hotelProfile?.market),
    link: textValue(hotelProfile?.link),
    status: asSupplierLifecycleStatus(hotel.status),
    contacts: hotel.contacts?.length ? hotel.contacts.map((item) => ({
      fullName: textValue(item.fullName),
      position: textValue(item.position),
      birthday: dateOnly(item.birthday),
      phone: textValue(item.phone),
      email: textValue(item.email),
    })) : [emptyContact],
    services: hotel.supplierServices?.length ? hotel.supplierServices.map((item) => ({
      sku: textValue(item.sku),
      serviceName: textValue(item.serviceName),
      startDate: dateOnly(item.startDate),
      endDate: dateOnly(item.endDate),
      dayType: asDayType(item.dayType),
      accountingPrice: numberValue(item.accountingPrice),
      netPrice: numberValue(item.netPrice),
      sellingPrice: numberValue(item.sellingPrice),
      description: textValue(item.description),
      note: textValue(item.note),
    })) : [emptyService],
    allotments: hotel.allotments?.length ? hotel.allotments.map((item) => {
      const lockedQty = numberValue(item.lockedQty ?? item.quantityLock);
      return {
        sku: textValue(item.sku),
        serviceName: textValue(item.serviceName),
        startDate: dateOnly(item.startDate),
        endDate: dateOnly(item.endDate),
        dayType: asDayType(item.dayType),
        allotmentQty: numberValue(item.allotmentQty ?? item.quantityLock),
        bookedQty: numberValue(item.bookedQty),
        lockedQty,
        cutoffDays: numberValue(item.cutoffDays),
        netCostPerDay: numberValue(item.netCostPerDay),
        sellingPricePerDay: numberValue(item.sellingPricePerDay),
        status: asAllotmentStatus(item.status),
        description: textValue(item.description),
        note: textValue(item.note),
      };
    }) : [emptyAllotment],
  };
}

export default function HotelSuppliersClient({
  initialHotels,
  initialError = '',
}: {
  initialHotels: HotelSupplier[];
  initialError?: string;
}) {
  const { can } = usePermissions();
  const canManage = can('supplier.manage');
  const canView = can('supplier.view');
  const [hotels, setHotels] = useState<HotelSupplier[]>(initialHotels);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filters, setFilters] = useState(defaultFilters);
  const [notice, setNotice] = useState<SupplierNotice | null>(initialError ? { type: 'error', text: initialError } : null);
  const [listError, setListError] = useState(initialError);
  const [formOpen, setFormOpen] = useState(false);
  const [files, setFiles] = useState<SupplierFile[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [busyAction, setBusyAction] = useState('');
  const [selectedHotel, setSelectedHotel] = useState<HotelSupplier | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [allotmentAction, setAllotmentAction] = useState<AllotmentAction>(null);
  const [inventoryFilters, setInventoryFilters] = useState(defaultInventoryFilters);
  const [inventoryRows, setInventoryRows] = useState<AllotmentInventoryLine[]>([]);
  const [isInventoryLoading, setIsInventoryLoading] = useState(false);
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, dirtyFields },
  } = useForm<HotelForm>({ resolver: zodResolver(hotelSchema) as any, defaultValues });
  const contacts = useFieldArray({ control, name: 'contacts' });
  const services = useFieldArray({ control, name: 'services' });
  const allotments = useFieldArray({ control, name: 'allotments' });

  useEffect(() => setHotels(initialHotels), [initialHotels]);
  useEffect(() => {
    if (canView) void loadInventory(defaultInventoryFilters);
  }, [canView]);

  const allotmentSummary = useMemo(() => hotels.flatMap((hotel) => hotel.allotments || []).reduce((acc, item) => {
    const total = numberValue(item.allotmentQty ?? item.quantityLock);
    const booked = numberValue(item.bookedQty);
    const locked = numberValue(item.lockedQty ?? item.quantityLock);
    acc.total += total;
    acc.booked += booked;
    acc.locked += locked;
    acc.remaining += Math.max(0, total - booked - locked);
    return acc;
  }, { total: 0, booked: 0, locked: 0, remaining: 0 }), [hotels]);

  const columns = useMemo(() => {
    const helper = createColumnHelper<HotelSupplier>();
    return [
      helper.display({
        id: 'hotel',
        header: 'Khách sạn',
        cell: ({ row }) => <div className="supplierPrimaryCell"><strong title={row.original.name}>{row.original.name}</strong><span title={row.original.supplierCode || 'Chưa có mã'}>{row.original.supplierCode || 'Chưa có mã'}</span></div>,
      }),
      helper.display({
        id: 'project',
        header: 'Hạng và dự án',
        cell: ({ row }) => <div className="supplierPrimaryCell"><span title={row.original.hotelProfile?.classHotel || '—'}>{row.original.hotelProfile?.classHotel || '—'}</span><span title={row.original.hotelProfile?.hotelProject || '—'}>{row.original.hotelProfile?.hotelProject || '—'}</span></div>,
      }),
      helper.display({
        id: 'contact',
        header: 'Liên hệ',
        cell: ({ row }) => <div className="supplierPrimaryCell"><span title={row.original.phone || 'Chưa có số điện thoại'}>{row.original.phone || 'Chưa có số điện thoại'}</span><span title={row.original.province || 'Chưa có tỉnh/thành'}>{row.original.province || 'Chưa có tỉnh/thành'}</span></div>,
      }),
      helper.display({
        id: 'allotment',
        header: 'Quỹ phòng',
        cell: ({ row }) => {
          const rows = row.original.allotments || [];
          const total = rows.reduce((sum, item) => sum + numberValue(item.allotmentQty ?? item.quantityLock), 0);
          return `${rows.length} gói / ${total.toLocaleString('vi-VN')} phòng`;
        },
      }),
      helper.accessor('status', { header: 'Trạng thái', cell: (info) => <SupplierStatus status={info.getValue()} /> }),
      helper.display({
        id: 'actions',
        header: 'Thao tác',
        cell: ({ row }) => (
          <div className="rowActions">
            <button type="button" className="secondaryButton iconButton" disabled={!canManage || Boolean(busyAction)} onClick={() => void startEdit(row.original)} title="Sửa khách sạn" aria-label="Sửa khách sạn"><Pencil size={15} /></button>
            <button type="button" className="secondaryButton iconButton" disabled={!canManage || Boolean(busyAction)} onClick={() => void openAllotments(row.original)} title="Quản lý quỹ phòng" aria-label="Quản lý quỹ phòng"><BedDouble size={15} /></button>
            <button type="button" className="dangerButton iconButton" disabled={!canManage || Boolean(busyAction)} onClick={() => void deleteSupplier(row.original)} title="Xóa nhà cung cấp" aria-label="Xóa nhà cung cấp"><Trash2 size={15} /></button>
          </div>
        ),
      }),
    ];
  }, [busyAction, canManage]);
  const table = useReactTable({ data: hotels, columns, getCoreRowModel: getCoreRowModel() });

  async function load(nextFilters = filters, emitSuccess = false) {
    const validationError = validateHotelFilters(nextFilters);
    if (validationError) {
      setListError(validationError);
      setNotice({ type: 'error', text: validationError });
      return false;
    }
    setIsLoading(true);
    setListError('');
    try {
      const params = buildHotelListSearchParams(nextFilters);
      const rows = await supplierApi<HotelSupplier[]>(`/api/suppliers/hotels${params.size ? `?${params}` : ''}`, {}, 'Tải danh sách nhà cung cấp khách sạn');
      setHotels(rows);
      if (emitSuccess) setNotice({ type: 'success', text: 'Đã tải lại danh sách nhà cung cấp khách sạn.' });
      return true;
    } catch (error) {
      const message = errorText(error, 'Không tải được danh sách nhà cung cấp khách sạn.');
      setListError(message);
      setNotice({ type: 'error', text: message });
      return false;
    } finally {
      setIsLoading(false);
    }
  }

  async function loadInventory(nextFilters = inventoryFilters, emitSuccess = false) {
    const startDate = nextFilters.startDate.trim();
    const endDate = nextFilters.endDate.trim();
    if (startDate && endDate && startDate > endDate) {
      setNotice({ type: 'error', text: 'Ngày bắt đầu tồn quỹ không được sau ngày kết thúc.' });
      return false;
    }
    setIsInventoryLoading(true);
    try {
      const params = new URLSearchParams();
      if (nextFilters.supplierId.trim()) params.set('supplierId', nextFilters.supplierId.trim());
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      const rows = await supplierApi<AllotmentInventoryLine[]>(`/api/suppliers/hotel-allotments/inventory${params.size ? `?${params}` : ''}`, {}, 'Tải tồn quỹ phòng khách sạn');
      setInventoryRows(rows);
      if (emitSuccess) setNotice({ type: 'success', text: 'Đã tải lại tồn quỹ phòng khách sạn.' });
      return true;
    } catch (error) {
      setInventoryRows([]);
      setNotice({ type: 'error', text: errorText(error, 'Không tải được tồn quỹ phòng khách sạn.') });
      return false;
    } finally {
      setIsInventoryLoading(false);
    }
  }

  function submitFilters(event: FormEvent) {
    event.preventDefault();
    setNotice(null);
    void load(filters);
  }

  function submitInventoryFilters(event: FormEvent) {
    event.preventDefault();
    setNotice(null);
    void loadInventory(inventoryFilters);
  }

  function resetInventoryFilters() {
    setInventoryFilters(defaultInventoryFilters);
    setNotice(null);
    void loadInventory(defaultInventoryFilters);
  }

  function resetFilters() {
    setFilters(defaultFilters);
    setNotice(null);
    void load(defaultFilters);
  }

  async function onSubmit(values: HotelForm) {
    setNotice(null);
    const payload = hotelSupplierPayload(values, editingId ? 'update' : 'create', dirtyFields as DirtyCollections);
    let saved: HotelSupplier;
    try {
      saved = await supplierApi<HotelSupplier>(
        `/api/suppliers/hotels${editingId ? `/${editingId}` : ''}`,
        { method: editingId ? 'PUT' : 'POST', body: JSON.stringify(payload) },
        editingId ? 'Cập nhật nhà cung cấp khách sạn' : 'Tạo nhà cung cấp khách sạn',
      );
    } catch (error) {
      setNotice({ type: 'error', text: errorText(error, 'Không lưu được nhà cung cấp khách sạn.') });
      return;
    }
    if (pendingFiles.length) {
      try {
        await uploadSupplierFiles(saved.id, pendingFiles);
      } catch (error) {
        setEditingId(saved.id);
        setFiles(saved.files || []);
        setNotice({ type: 'error', text: `Đã lưu nhà cung cấp nhưng ${errorText(error, 'không tải được file đính kèm')}` });
        return;
      }
    }
    const action = editingId ? 'cập nhật' : 'tạo';
    closeForm(false);
    await load(filters);
    await loadInventory(inventoryFilters);
    setNotice({ type: 'success', text: `Đã ${action} nhà cung cấp khách sạn${pendingFiles.length ? ` và tải lên ${pendingFiles.length} file` : ''}.` });
  }

  async function startEdit(hotel: HotelSupplier) {
    setBusyAction(`edit:${hotel.id}`);
    setNotice(null);
    try {
      const detail = await supplierApi<HotelSupplier>(`/api/suppliers/hotels/${hotel.id}`, {}, 'Tải thông tin nhà cung cấp khách sạn');
      setEditingId(detail.id);
      setFiles(detail.files || []);
      setPendingFiles([]);
      reset(toForm(detail));
      setFormOpen(true);
    } catch (error) {
      setNotice({ type: 'error', text: errorText(error, 'Không tải được thông tin nhà cung cấp khách sạn.') });
    } finally {
      setBusyAction('');
    }
  }

  async function deleteSupplier(hotel: HotelSupplier) {
    if (!window.confirm(`Xóa nhà cung cấp khách sạn "${hotel.name}"? Hệ thống sẽ chặn nếu còn quỹ phòng, dịch vụ, file hoặc giao dịch liên quan.`)) return;
    setBusyAction(`delete:${hotel.id}`);
    setNotice(null);
    try {
      await supplierApi(`/api/suppliers/${hotel.id}`, { method: 'DELETE' }, 'Xóa nhà cung cấp khách sạn');
      await load(filters);
      await loadInventory(inventoryFilters);
      setNotice({ type: 'success', text: `Đã xóa nhà cung cấp khách sạn "${hotel.name}".` });
    } catch (error) {
      setNotice({ type: 'error', text: errorText(error, 'Không xóa được nhà cung cấp khách sạn.') });
    } finally {
      setBusyAction('');
    }
  }

  async function deleteFile(file: SupplierFile) {
    if (!editingId || !window.confirm(`Xóa file "${file.fileName}" khỏi nhà cung cấp? Thao tác này không thể hoàn tác.`)) return;
    setBusyAction(`file:${file.id}`);
    setNotice(null);
    try {
      await supplierApi(`/api/suppliers/${editingId}/files/${file.id}`, { method: 'DELETE' }, 'Xóa file nhà cung cấp');
      setFiles((current) => current.filter((item) => item.id !== file.id));
      setNotice({ type: 'success', text: `Đã xóa file "${file.fileName}".` });
    } catch (error) {
      setNotice({ type: 'error', text: errorText(error, 'Không xóa được file nhà cung cấp.') });
    } finally {
      setBusyAction('');
    }
  }

  async function openAllotments(hotel: HotelSupplier) {
    setBusyAction(`allotments:${hotel.id}`);
    setNotice(null);
    try {
      const [detail, bookingRows] = await Promise.all([
        supplierApi<HotelSupplier>(`/api/suppliers/hotels/${hotel.id}`, {}, 'Tải quỹ phòng khách sạn'),
        supplierApi<Booking[]>('/api/bookings', {}, 'Tải danh sách booking').catch(() => []),
      ]);
      setSelectedHotel(detail);
      setBookings(bookingRows);
    } catch (error) {
      setNotice({ type: 'error', text: errorText(error, 'Không tải được quỹ phòng khách sạn.') });
    } finally {
      setBusyAction('');
    }
  }

  async function refreshAllotments() {
    if (!selectedHotel) return;
    const detail = await supplierApi<HotelSupplier>(`/api/suppliers/hotels/${selectedHotel.id}`, {}, 'Tải lại quỹ phòng khách sạn');
    setSelectedHotel(detail);
    await load(filters);
    await loadInventory(inventoryFilters);
  }

  async function submitAllotmentAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!allotmentAction?.allotment.id) return;
    const form = new FormData(event.currentTarget);
    const allotment = allotmentAction.allotment;
    const actionLabel = allotmentAction.type === 'override' ? 'Điều chỉnh quỹ phòng' : 'Giữ chỗ quỹ phòng';
    const path = allotmentAction.type === 'override'
      ? `/api/suppliers/hotel-allotments/${allotment.id}/override`
      : `/api/suppliers/hotel-allotments/${allotment.id}/lock`;
    const currentTotal = numberValue(allotment.allotmentQty ?? allotment.quantityLock);
    const currentBooked = numberValue(allotment.bookedQty);
    const currentLocked = numberValue(allotment.lockedQty ?? allotment.quantityLock);
    const currentRemaining = numberValue(allotment.remainingQty, Math.max(0, currentTotal - currentBooked - currentLocked));
    let payload: Record<string, unknown>;
    if (allotmentAction.type === 'override') {
      const nextAllotmentQty = Number(form.get('allotmentQty'));
      const nextStatus = String(form.get('status') || 'ACTIVE');
      const note = String(form.get('note') || '').trim();
      if (!Number.isInteger(nextAllotmentQty) || nextAllotmentQty < 0) {
        setNotice({ type: 'error', text: 'Tổng quỹ phòng phải là số nguyên không âm.' });
        return;
      }
      if (nextAllotmentQty < currentBooked + currentLocked) {
        setNotice({ type: 'error', text: 'Tổng quỹ phòng không được nhỏ hơn số phòng đã xác nhận và đang giữ.' });
        return;
      }
      if (!allotmentStatuses.includes(nextStatus as HotelForm['allotments'][number]['status'])) {
        setNotice({ type: 'error', text: 'Trạng thái quỹ phòng không hợp lệ.' });
        return;
      }
      if (!note) {
        setNotice({ type: 'error', text: 'Cần nhập lý do điều chỉnh quỹ phòng.' });
        return;
      }
      if (!window.confirm(`Xác nhận điều chỉnh quỹ phòng "${allotment.serviceName}"? Thay đổi sẽ được ghi vào lịch sử.`)) return;
      payload = { allotmentQty: nextAllotmentQty, status: nextStatus, note };
    } else {
      const quantity = Number(form.get('quantity') || 1);
      const computedStatus = allotment.computedStatus || allotment.status || 'ACTIVE';
      if (computedStatus !== 'ACTIVE') {
        setNotice({ type: 'error', text: 'Chỉ có thể giữ chỗ khi quỹ phòng đang hoạt động và còn trong hạn chốt.' });
        return;
      }
      if (!Number.isInteger(quantity) || quantity <= 0) {
        setNotice({ type: 'error', text: 'Số phòng giữ chỗ phải là số nguyên lớn hơn 0.' });
        return;
      }
      if (quantity > currentRemaining) {
        setNotice({ type: 'error', text: 'Số phòng giữ chỗ không được vượt quá số phòng còn khả dụng.' });
        return;
      }
      if (!window.confirm(`Xác nhận giữ ${quantity.toLocaleString('vi-VN')} phòng cho "${allotment.serviceName}"?`)) return;
      payload = {
        serviceId: allotment.serviceId || undefined,
        bookingId: String(form.get('bookingId') || '') || undefined,
        quantity,
        note: String(form.get('note') || '').trim() || undefined,
      };
    }
    setBusyAction(`allotment:${allotment.id}`);
    setNotice(null);
    try {
      await supplierApi(path, { method: allotmentAction.type === 'override' ? 'PATCH' : 'POST', body: JSON.stringify(payload) }, actionLabel);
      setAllotmentAction(null);
      await refreshAllotments();
      setNotice({ type: 'success', text: `${actionLabel} thành công.` });
    } catch (error) {
      setNotice({ type: 'error', text: errorText(error, `${actionLabel} thất bại.`) });
    } finally {
      setBusyAction('');
    }
  }

  async function changeAllocation(allocation: Allocation, action: 'confirm' | 'release') {
    const label = action === 'confirm' ? 'Xác nhận phân bổ quỹ phòng' : 'Giải phóng phân bổ quỹ phòng';
    let note = '';
    if (action === 'release') {
      const value = window.prompt('Nhập lý do giải phóng phân bổ quỹ phòng:');
      if (value === null) return;
      note = value.trim();
      if (!note) {
        setNotice({ type: 'error', text: 'Cần nhập lý do giải phóng phân bổ quỹ phòng.' });
        return;
      }
    }
    if (!window.confirm(`${label}? Hành động này sẽ cập nhật số lượng quỹ phòng và được lưu vào lịch sử.`)) return;
    setBusyAction(`allocation:${allocation.id}`);
    setNotice(null);
    try {
      await supplierApi(`/api/suppliers/hotel-allotment-allocations/${allocation.id}/${action}`, { method: 'POST', body: JSON.stringify({ note: note || undefined }) }, label);
      await refreshAllotments();
      setNotice({ type: 'success', text: `${label} thành công.` });
    } catch (error) {
      setNotice({ type: 'error', text: errorText(error, `${label} thất bại.`) });
    } finally {
      setBusyAction('');
    }
  }

  function closeForm(clearNotice = true) {
    setEditingId(null);
    setFormOpen(false);
    setFiles([]);
    setPendingFiles([]);
    reset(defaultValues);
    if (clearNotice) setNotice(null);
  }

  function openCreate() {
    setEditingId(null);
    setFiles([]);
    setPendingFiles([]);
    setNotice(null);
    reset(defaultValues);
    setFormOpen(true);
  }

  return (
    <div className="hotelSupplierPage">
      <PermissionNotice allowed={canView} label="xem nhà cung cấp khách sạn" missingPermissions={['supplier.view']} />
      {canView ? (
        <>
          <SupplierNoticeBanner notice={notice} />

          <section className="metrics supplierMetrics">
            <article className="metric"><span>Tổng quỹ phòng</span><strong>{allotmentSummary.total.toLocaleString('vi-VN')}</strong></article>
            <article className="metric"><span>Đã xác nhận</span><strong>{allotmentSummary.booked.toLocaleString('vi-VN')}</strong></article>
            <article className="metric"><span>Đang giữ chỗ</span><strong>{allotmentSummary.locked.toLocaleString('vi-VN')}</strong></article>
            <article className="metric"><span>Còn khả dụng</span><strong>{allotmentSummary.remaining.toLocaleString('vi-VN')}</strong></article>
          </section>

          <section className="panel allotmentInventoryPanel">
            <div className="sectionHeader">
              <div><h2>Tồn quỹ phòng theo ngày</h2><span>{isInventoryLoading ? 'Đang tải tồn quỹ...' : `${inventoryRows.length} dòng quỹ phòng`}</span></div>
              <button type="button" className="secondaryButton iconButton" onClick={() => void loadInventory(inventoryFilters, true)} disabled={isInventoryLoading} title="Tải lại tồn quỹ phòng" aria-label="Tải lại tồn quỹ phòng"><RefreshCcw size={16} /></button>
            </div>
            <form className="supplierFilters supplierHotelFilters" onSubmit={submitInventoryFilters}>
              <label>Khách sạn<select value={inventoryFilters.supplierId} onChange={(event) => setInventoryFilters((current) => ({ ...current, supplierId: event.target.value }))}><option value="">Tất cả khách sạn</option>{hotels.map((hotel) => <option key={hotel.id} value={hotel.id}>{hotel.name}</option>)}</select></label>
              <label>Từ ngày<input type="date" value={inventoryFilters.startDate} onChange={(event) => setInventoryFilters((current) => ({ ...current, startDate: event.target.value }))} /></label>
              <label>Đến ngày<input type="date" value={inventoryFilters.endDate} onChange={(event) => setInventoryFilters((current) => ({ ...current, endDate: event.target.value }))} /></label>
              <button type="submit" disabled={isInventoryLoading}><Search size={16} /> Lọc tồn quỹ</button>
              <button type="button" className="secondaryButton iconButton" onClick={resetInventoryFilters} disabled={isInventoryLoading} title="Xóa bộ lọc tồn quỹ" aria-label="Xóa bộ lọc tồn quỹ"><RefreshCcw size={16} /></button>
            </form>
            <div className="fitTableWrap">
              <table className="fitTable hotelInventoryTable">
                <thead>
                  <tr>
                    <th>Khách sạn</th>
                    <th>Quỹ phòng</th>
                    <th>Giai đoạn</th>
                    <th>Số lượng</th>
                    <th>Giá và hạn chốt</th>
                    <th>Trạng thái</th>
                    <th>Cảnh báo</th>
                  </tr>
                </thead>
                <tbody>
                  {inventoryRows.map((item) => {
                    const total = numberValue(item.allotmentQty ?? item.quantityLock);
                    const booked = numberValue(item.bookedQty);
                    const locked = numberValue(item.lockedQty ?? item.quantityLock);
                    const remaining = numberValue(item.remainingQty, Math.max(0, total - booked - locked));
                    const overbooked = numberValue(item.overbookedQty, Math.max(0, booked + locked - total));
                    const status = item.computedStatus || item.status || 'ACTIVE';
                    const warnings = [
                      ...(overbooked > 0 ? [`Vượt tồn ${formatNumber(overbooked)} phòng`] : []),
                      ...(remaining <= 0 ? ['Hết phòng khả dụng'] : []),
                      ...(item.isCodLocked ? ['Đã tới hạn chốt'] : []),
                      ...(status === 'STOP_SELL' ? ['Đang dừng bán'] : []),
                      ...(status === 'INACTIVE' ? ['Ngừng hoạt động'] : []),
                    ];
                    return (
                      <tr key={item.id || `${item.supplier?.id || 'supplier'}-${item.serviceName}`}>
                        <td><div className="supplierPrimaryCell"><strong title={item.supplier?.name || 'Chưa rõ khách sạn'}>{item.supplier?.name || 'Chưa rõ khách sạn'}</strong><span>{item.supplier?.supplierCode || 'Chưa có mã'}</span></div></td>
                        <td><div className="supplierPrimaryCell"><strong title={item.serviceName}>{item.serviceName}</strong><span>{item.sku || dayTypeLabel(item.dayType || 'ALL_DAYS')}</span></div></td>
                        <td><span>{dateOnly(item.startDate) || 'Không giới hạn'}</span><br /><span>{dateOnly(item.endDate) || 'Không giới hạn'}</span></td>
                        <td><div className="inventoryQuantities"><span>Tổng: <strong>{formatNumber(total)}</strong></span><span>Đã xác nhận: <strong>{formatNumber(booked)}</strong></span><span>Đang giữ: <strong>{formatNumber(locked)}</strong></span><span>Còn: <strong>{formatNumber(remaining)}</strong></span></div></td>
                        <td><div className="inventoryQuantities"><span>NET: <strong>{formatNumber(item.netCostPerDay)}</strong></span><span>Bán: <strong>{formatNumber(item.sellingPricePerDay)}</strong></span><span>Chốt trước: <strong>{formatNumber(item.cutoffDays)} ngày</strong></span><span>Đã bán/giữ: <strong>{formatNumber(item.sellThroughRate)}%</strong></span></div></td>
                        <td><SupplierStatus status={status} /></td>
                        <td><div className={`inventoryWarnings ${warnings.length ? 'inventoryWarningsAttention' : ''}`}>{warnings.length ? warnings.map((warning) => <span key={warning}>{warning}</span>) : <span>Ổn định</span>}</div></td>
                      </tr>
                    );
                  })}
                  {!isInventoryLoading && inventoryRows.length === 0 ? <tr><td colSpan={7} className="tableEmptyState">Không có dòng tồn quỹ phòng phù hợp với bộ lọc hiện tại.</td></tr> : null}
                  {isInventoryLoading ? <tr><td colSpan={7} className="tableEmptyState">Đang tải tồn quỹ phòng khách sạn...</td></tr> : null}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel supplierFilterPanel">
            <form className="supplierFilters supplierHotelFilters" onSubmit={submitFilters}>
              <label className="searchBox"><Search size={16} /><input value={filters.search} maxLength={hotelFilterMaxLengths.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} placeholder="Tìm mã, tên, số điện thoại, email, dự án hoặc hạng khách sạn..." /></label>
              <label>Trạng thái<select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}><option value="">Tất cả trạng thái</option>{supplierLifecycleStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
              <label>Tỉnh/thành<input value={filters.province} maxLength={hotelFilterMaxLengths.province} placeholder="Ví dụ: Hà Nội" onChange={(event) => setFilters((current) => ({ ...current, province: event.target.value }))} /></label>
              <label>Thị trường<input value={filters.market} maxLength={hotelFilterMaxLengths.market} placeholder="Ví dụ: Nội địa" onChange={(event) => setFilters((current) => ({ ...current, market: event.target.value }))} /></label>
              <label>Dự án khách sạn<input value={filters.hotelProject} maxLength={hotelFilterMaxLengths.hotelProject} placeholder="Dòng sản phẩm hoặc dự án" onChange={(event) => setFilters((current) => ({ ...current, hotelProject: event.target.value }))} /></label>
              <label>Hạng khách sạn<input value={filters.classHotel} maxLength={hotelFilterMaxLengths.classHotel} placeholder="Ví dụ: 4 sao" onChange={(event) => setFilters((current) => ({ ...current, classHotel: event.target.value }))} /></label>
              <button type="submit" disabled={isLoading}><Search size={16} /> Lọc danh sách</button>
              <button type="button" className="secondaryButton iconButton" onClick={resetFilters} disabled={isLoading} title="Xóa bộ lọc" aria-label="Xóa bộ lọc"><RefreshCcw size={16} /></button>
            </form>
          </section>

          <section className="panel listPanel">
            <div className="sectionHeader">
              <div><h2>Danh sách nhà cung cấp khách sạn</h2><span>{isLoading ? 'Đang tải dữ liệu...' : `${hotels.length} nhà cung cấp`}</span></div>
              <div className="sectionActions">
                <a className="secondaryButton iconTextButton" href="/suppliers">Quản lý loại nhà cung cấp</a>
                <button type="button" className="secondaryButton iconButton" onClick={() => void load(filters, true)} disabled={isLoading} title="Tải lại" aria-label="Tải lại"><RefreshCcw size={16} /></button>
                <button type="button" className="iconTextButton" onClick={openCreate} disabled={!canManage}><Plus size={16} /> Thêm nhà cung cấp khách sạn</button>
              </div>
            </div>
            <div className="fitTableWrap">
              <table className="fitTable hotelListTable">
                <thead>{table.getHeaderGroups().map((group) => <tr key={group.id}>{group.headers.map((header) => <th key={header.id}>{flexRender(header.column.columnDef.header, header.getContext())}</th>)}</tr>)}</thead>
                <tbody>
                  {isLoading ? <HotelListLoadingRows /> : null}
                  {!isLoading && listError ? (
                    <tr><td colSpan={6} className="tableEmptyState"><div className="tableEmptyStateContent"><strong>Không tải được danh sách nhà cung cấp khách sạn.</strong><span>{listError}</span><button type="button" className="secondaryButton iconTextButton" onClick={() => void load(filters, true)}><RefreshCcw size={16} /> Tải lại</button></div></td></tr>
                  ) : null}
                  {!isLoading && !listError ? table.getRowModel().rows.map((row) => <tr key={row.id}>{row.getVisibleCells().map((cell) => <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>) : null}
                  {!isLoading && !listError && hotels.length === 0 ? (
                    <tr><td colSpan={6} className="tableEmptyState"><div className="tableEmptyStateContent"><strong>Chưa tìm thấy nhà cung cấp khách sạn phù hợp.</strong><span>Hãy điều chỉnh từ khóa hoặc bộ lọc. Nếu đây là khách sạn mới, dùng nút tạo nhà cung cấp khách sạn để thêm hồ sơ.</span>{canManage ? <button type="button" className="iconTextButton" onClick={openCreate}><Plus size={16} /> Tạo nhà cung cấp khách sạn</button> : null}</div></td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          {formOpen ? (
            <div className="modalOverlay" role="dialog" aria-modal="true" aria-label={editingId ? 'Cập nhật nhà cung cấp khách sạn' : 'Tạo nhà cung cấp khách sạn'}>
              <div className="modalPanel modalPanelWide">
                <form onSubmit={handleSubmit(onSubmit)} className="hotelSupplierForm">
                  <header><h2>{editingId ? 'Cập nhật nhà cung cấp khách sạn' : 'Thêm nhà cung cấp khách sạn'}</h2><button type="button" className="secondaryButton iconButton" onClick={() => closeForm()} aria-label="Đóng"><X size={16} /></button></header>
                  <fieldset>
                    <legend>Thông tin khách sạn</legend>
                    <div className="hotelFormGrid">
                      <label>Mã nhà cung cấp *<input required {...register('supplierCode')} /></label>
                      <label>Tên khách sạn *<input required {...register('name')} /></label>
                      <label>Mã số thuế<input {...register('taxCode')} /></label>
                      <label>Năm xây dựng<input type="number" min="1800" max={currentYear} placeholder="Có thể bỏ trống" {...register('builtYear')} /></label>
                      <label>Số điện thoại *<input required inputMode="tel" placeholder="0901234567" {...register('phone')} /></label>
                      <label>Email<input type="email" placeholder="Có thể bỏ trống" {...register('email')} /></label>
                      <label>Quốc gia<input placeholder="Việt Nam" {...register('country')} /></label>
                      <label>Tỉnh/thành<input placeholder="Ví dụ: Hà Nội, Quảng Ninh" {...register('province')} /></label>
                      <label>Hạng khách sạn *<input required placeholder="3 sao, 4 sao, khu nghỉ dưỡng..." {...register('classHotel')} /></label>
                      <label>Dòng sản phẩm / dự án *<input required placeholder="Ví dụ: Hạ Long, nghỉ dưỡng biển" {...register('hotelProject')} /></label>
                      <label>Thị trường<input placeholder="Ví dụ: Nội địa, inbound" {...register('market')} /></label>
                      <label>Xếp hạng<input type="number" min="0" max="5" step="1" {...register('rating')} /></label>
                      <label>Trạng thái<select {...register('status')}>{supplierLifecycleStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                      <label>Website<input type="url" placeholder="https://example.com" {...register('website')} /></label>
                      <label>Liên kết tham khảo<input type="url" placeholder="https://example.com/tham-khao" {...register('link')} /></label>
                      <label className="span2">Địa chỉ<input placeholder="Nhập địa chỉ khách sạn" {...register('address')} /></label>
                    </div>
                  </fieldset>

                  <fieldset>
                    <legend>Thanh toán và ghi chú</legend>
                    <div className="hotelFormGrid">
                      <label>Tên tài khoản ngân hàng<input {...register('bankAccountName')} /></label>
                      <label>Số tài khoản<input {...register('bankAccountNumber')} /></label>
                      <label>Tên ngân hàng<input {...register('bankName')} /></label>
                      <label className="span2">Ghi chú nội bộ<textarea rows={3} placeholder="Ghi chú chính sách, công nợ hoặc lưu ý vận hành" {...register('notes')} /></label>
                    </div>
                  </fieldset>

                  <DynamicRows title="Người liên hệ" name="contacts" register={register} fieldArray={contacts} columns={[
                    { key: 'fullName', label: 'Họ tên' },
                    { key: 'position', label: 'Chức vụ' },
                    { key: 'birthday', label: 'Ngày sinh', type: 'date' },
                    { key: 'phone', label: 'Điện thoại', type: 'tel' },
                    { key: 'email', label: 'Email', type: 'email' },
                  ]} emptyRow={emptyContact} />

                  <DynamicRows title="Dịch vụ và sản phẩm" name="services" register={register} fieldArray={services} columns={[
                    { key: 'sku', label: 'Mã dịch vụ' },
                    { key: 'serviceName', label: 'Tên dịch vụ *' },
                    { key: 'startDate', label: 'Từ ngày', type: 'date' },
                    { key: 'endDate', label: 'Đến ngày', type: 'date' },
                    { key: 'dayType', label: 'Loại ngày', type: 'select' },
                    { key: 'accountingPrice', label: 'Giá kế toán', type: 'number' },
                    { key: 'netPrice', label: 'Giá thuần (NET)', type: 'number' },
                    { key: 'sellingPrice', label: 'Giá bán', type: 'number' },
                    { key: 'description', label: 'Diễn giải', type: 'textarea' },
                    { key: 'note', label: 'Ghi chú', type: 'textarea' },
                  ]} emptyRow={emptyService} />

                  {!editingId ? <DynamicRows title="Quỹ phòng ban đầu" name="allotments" register={register} fieldArray={allotments} columns={[
                    { key: 'sku', label: 'Mã quỹ phòng' },
                    { key: 'serviceName', label: 'Tên hạng phòng *' },
                    { key: 'startDate', label: 'Từ ngày', type: 'date' },
                    { key: 'endDate', label: 'Đến ngày', type: 'date' },
                    { key: 'dayType', label: 'Loại ngày', type: 'select' },
                    { key: 'allotmentQty', label: 'Tổng quỹ phòng', type: 'number' },
                    { key: 'cutoffDays', label: 'Số ngày chốt quỹ', type: 'number' },
                    { key: 'netCostPerDay', label: 'Giá thuần mỗi ngày', type: 'number' },
                    { key: 'sellingPricePerDay', label: 'Giá bán mỗi ngày', type: 'number' },
                    { key: 'status', label: 'Trạng thái', type: 'select' },
                    { key: 'description', label: 'Diễn giải', type: 'textarea' },
                    { key: 'note', label: 'Ghi chú', type: 'textarea' },
                  ]} emptyRow={emptyAllotment} /> : (
                    <section className="panel supplierInlineInfo">
                      <strong>Quỹ phòng được quản lý riêng</strong>
                    <span>Dùng nút quản lý quỹ phòng ở danh sách để điều chỉnh số lượng, giữ chỗ, xác nhận hoặc giải phóng mà không ảnh hưởng dữ liệu liên hệ và dịch vụ.</span>
                    </section>
                  )}

                  <fieldset>
                    <legend>File đính kèm</legend>
                    {editingId ? <SupplierFiles files={files} busy={Boolean(busyAction)} canManage={canManage} onDelete={(file) => void deleteFile(file)} /> : <p className="mutedText">File sẽ được tải lên sau khi nhà cung cấp được tạo thành công.</p>}
                    <label className="fileDrop"><FileUp size={18} /> Chọn file cần tải lên<input type="file" multiple onChange={(event) => setPendingFiles(Array.from(event.target.files || []))} /></label>
                    {pendingFiles.length ? <p className="mutedText">Đã chọn {pendingFiles.length} file: {pendingFiles.map((file) => file.name).join(', ')}</p> : null}
                  </fieldset>

                  <ErrorLine errors={[
                    errors.supplierCode?.message,
                    errors.name?.message,
                    errors.phone?.message,
                    errors.email?.message,
                    errors.builtYear?.message,
                    errors.classHotel?.message,
                    errors.hotelProject?.message,
                    errors.rating?.message,
                    errors.website?.message,
                    errors.link?.message,
                    ...nestedErrorMessages(errors.contacts),
                    ...nestedErrorMessages(errors.services),
                    ...nestedErrorMessages(errors.allotments),
                  ]} />
                  <div className="modalActions">
                    <button type="button" className="secondaryButton" onClick={() => closeForm()}>Hủy</button>
                    <button type="submit" disabled={!canManage || isSubmitting || Boolean(busyAction)}><Save size={17} /> {isSubmitting ? 'Đang lưu...' : editingId ? 'Lưu thay đổi' : 'Tạo nhà cung cấp khách sạn'}</button>
                  </div>
                </form>
              </div>
            </div>
          ) : null}

          {selectedHotel ? (
            <div className="modalOverlay" role="dialog" aria-modal="true" aria-label="Quản lý quỹ phòng">
              <div className="modalPanel modalPanelWide">
                <header><div><h2>Quỹ phòng: {selectedHotel.name}</h2><span>{selectedHotel.allotments?.length || 0} gói quỹ phòng</span></div><button type="button" className="secondaryButton iconButton" onClick={() => setSelectedHotel(null)} aria-label="Đóng"><X size={16} /></button></header>
                <div className="allotmentCards">
                  {(selectedHotel.allotments || []).map((allotment) => {
                    const total = numberValue(allotment.allotmentQty ?? allotment.quantityLock);
                    const booked = numberValue(allotment.bookedQty);
                    const locked = numberValue(allotment.lockedQty ?? allotment.quantityLock);
                    const remaining = allotment.remainingQty ?? Math.max(0, total - booked - locked);
                    const overbooked = numberValue(allotment.overbookedQty, Math.max(0, booked + locked - total));
                    const status = allotment.computedStatus || allotment.status || 'ACTIVE';
                    const canLock = canManage && Boolean(allotment.id) && status === 'ACTIVE' && remaining > 0 && !busyAction;
                    const cardWarnings = [
                      ...(overbooked > 0 ? [`Vượt tồn ${formatNumber(overbooked)} phòng`] : []),
                      ...(remaining <= 0 ? ['Không còn phòng khả dụng'] : []),
                      ...(allotment.isCodLocked || status === 'COD_LOCKED' ? ['Đã tới hạn chốt quỹ'] : []),
                      ...(status === 'STOP_SELL' ? ['Quỹ phòng đang dừng bán'] : []),
                      ...(status === 'INACTIVE' ? ['Quỹ phòng ngừng hoạt động'] : []),
                    ];
                    return (
                      <article className="allotmentCard" key={allotment.id || allotment.serviceName}>
                        <div className="allotmentCardHeader">
                          <div><strong>{allotment.serviceName}</strong><span>{dateOnly(allotment.startDate) || 'Không giới hạn'} - {dateOnly(allotment.endDate) || 'Không giới hạn'}</span></div>
                          <SupplierStatus status={status} />
                        </div>
                        <div className="allotmentNumbers">
                          <span>Tổng quỹ<strong>{formatNumber(total)}</strong></span>
                          <span>Đã xác nhận<strong>{formatNumber(booked)}</strong></span>
                          <span>Đang giữ<strong>{formatNumber(locked)}</strong></span>
                          <span>Còn lại<strong>{formatNumber(remaining)}</strong></span>
                        </div>
                        <div className="allotmentNumbers allotmentNumbersSecondary">
                          <span>NET/ngày<strong>{formatNumber(allotment.netCostPerDay)}</strong></span>
                          <span>Bán/ngày<strong>{formatNumber(allotment.sellingPricePerDay)}</strong></span>
                          <span>Chốt trước<strong>{formatNumber(allotment.cutoffDays)} ngày</strong></span>
                          <span>Bán/giữ<strong>{formatNumber(allotment.sellThroughRate)}%</strong></span>
                        </div>
                        {cardWarnings.length ? <div className="inventoryWarnings inventoryWarningsAttention">{cardWarnings.map((warning) => <span key={warning}>{warning}</span>)}</div> : null}
                        <div className="rowActions">
                          <button type="button" className="secondaryButton iconTextButton" disabled={!canManage || !allotment.id || Boolean(busyAction)} onClick={() => setAllotmentAction({ type: 'override', allotment })} title="Điều chỉnh tổng quỹ và trạng thái"><Settings2 size={15} /> Điều chỉnh</button>
                          <button type="button" className="secondaryButton iconTextButton" disabled={!canLock} onClick={() => setAllotmentAction({ type: 'lock', allotment })} title={canLock ? 'Giữ chỗ từ tồn còn khả dụng' : 'Chỉ giữ chỗ khi quỹ phòng đang hoạt động và còn tồn'}><LockKeyhole size={15} /> Giữ chỗ</button>
                        </div>
                        <div className="allocationList">
                          {(allotment.allocations || []).map((allocation) => (
                            <div className="allocationRow" key={allocation.id}>
                              <span><strong>{allocation.quantity} phòng</strong> · {allocation.bookingId ? 'Có liên kết booking' : 'Chưa liên kết booking'}</span>
                              <SupplierStatus status={allocation.status} />
                              <div className="rowActions">
                                {allocation.status === 'LOCKED' ? <button type="button" className="secondaryButton iconButton" disabled={Boolean(busyAction)} onClick={() => void changeAllocation(allocation, 'confirm')} title="Xác nhận giữ chỗ"><CheckCircle2 size={15} /></button> : null}
                                {['LOCKED', 'CONFIRMED'].includes(allocation.status) ? <button type="button" className="dangerButton iconButton" disabled={Boolean(busyAction)} onClick={() => void changeAllocation(allocation, 'release')} title="Giải phóng"><Undo2 size={15} /></button> : null}
                              </div>
                            </div>
                          ))}
                          {!allotment.allocations?.length ? <span className="mutedText">Chưa có lượt giữ chỗ.</span> : null}
                        </div>
                      </article>
                    );
                  })}
                  {!selectedHotel.allotments?.length ? <div className="tableEmptyState">Khách sạn chưa có quỹ phòng. Có thể khai báo quỹ phòng khi tạo nhà cung cấp mới.</div> : null}
                </div>
              </div>
            </div>
          ) : null}

          {allotmentAction ? (
            <div className="modalOverlay" role="dialog" aria-modal="true" aria-label={allotmentAction.type === 'override' ? 'Điều chỉnh quỹ phòng' : 'Giữ chỗ quỹ phòng'}>
              <div className="modalPanel">
                <form onSubmit={submitAllotmentAction} className="modalFormStack">
                  <header><h2>{allotmentAction.type === 'override' ? 'Điều chỉnh quỹ phòng' : 'Giữ chỗ quỹ phòng'}</h2><button type="button" className="secondaryButton iconButton" onClick={() => setAllotmentAction(null)} aria-label="Đóng"><X size={16} /></button></header>
                  <p><strong>{allotmentAction.allotment.serviceName}</strong></p>
                  <AllotmentActionSummary allotment={allotmentAction.allotment} />
                  {allotmentAction.type === 'override' ? (
                    <div className="modalFormGrid">
                      <label>Tổng quỹ phòng<input name="allotmentQty" type="number" min="0" defaultValue={numberValue(allotmentAction.allotment.allotmentQty ?? allotmentAction.allotment.quantityLock)} required /></label>
                      <label>Trạng thái<select name="status" defaultValue={allotmentAction.allotment.status || 'ACTIVE'}><option value="ACTIVE">Đang hoạt động</option><option value="STOP_SELL">Dừng bán</option><option value="INACTIVE">Ngừng hoạt động</option></select></label>
                      <label className="span2">Lý do điều chỉnh<textarea name="note" rows={3} required minLength={3} /></label>
                    </div>
                  ) : (
                    <div className="modalFormGrid">
                      <label>Số phòng giữ chỗ<input name="quantity" type="number" min="1" max={allotmentDisplayMetrics(allotmentAction.allotment).remaining} defaultValue={1} required /></label>
                      <label>Booking liên quan<select name="bookingId" defaultValue=""><option value="">Chọn booking nếu có</option>{bookings.map((booking) => <option value={booking.id} key={booking.id}>{booking.code} - {booking.customerName || 'Chưa có tên khách'}</option>)}</select></label>
                      <label className="span2">Ghi chú<textarea name="note" rows={3} /></label>
                    </div>
                  )}
                  <div className="modalActions"><button type="button" className="secondaryButton" onClick={() => setAllotmentAction(null)}>Hủy</button><button type="submit" disabled={Boolean(busyAction)}>{allotmentAction.type === 'override' ? 'Xác nhận điều chỉnh' : 'Giữ chỗ'}</button></div>
                </form>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function DynamicRows<T extends ArrayName>({
  title,
  name,
  register,
  fieldArray,
  columns,
  emptyRow,
}: {
  title: string;
  name: T;
  register: UseFormRegister<HotelForm>;
  fieldArray: UseFieldArrayReturn<HotelForm, T, 'id'>;
  columns: ColumnSpec[];
  emptyRow: Record<string, unknown>;
}) {
  const table = useReactTable({
    data: fieldArray.fields,
    getRowId: (row) => row.id,
    columns: useMemo(() => {
      const helper = createColumnHelper<FieldArrayWithId<HotelForm, T, 'id'>>();
      return [
        helper.display({ id: 'stt', header: 'Thứ tự', cell: ({ row }) => row.index + 1 }),
        ...columns.map((column) => helper.display({ id: column.key, header: column.label, cell: ({ row }) => <RowInput name={name} index={row.index} column={column} register={register} /> })),
        helper.display({ id: 'actions', header: '', cell: ({ row }) => <button type="button" className="dangerButton iconButton" onClick={() => fieldArray.remove(row.index)} aria-label="Xóa dòng" title="Xóa dòng"><Trash2 size={15} /></button> }),
      ];
    }, [columns, fieldArray, name, register]),
    getCoreRowModel: getCoreRowModel(),
  });
  return (
    <section className="fitTableBlock">
      <div className="sectionHeader"><h2>{title}</h2><button type="button" className="secondaryButton iconTextButton" onClick={() => fieldArray.append(createFieldArrayRow(emptyRow) as any)}><Plus size={16} /> Thêm dòng</button></div>
      <div className="fitTableWrap">
        <table className="fitTable hotelDynamicTable">
          <thead>{table.getHeaderGroups().map((group) => <tr key={group.id}>{group.headers.map((header) => <th key={header.id}>{flexRender(header.column.columnDef.header, header.getContext())}</th>)}</tr>)}</thead>
          <tbody>
            {table.getRowModel().rows.map((row) => <tr key={row.id}>{row.getVisibleCells().map((cell) => <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}
            {!fieldArray.fields.length ? <tr><td colSpan={columns.length + 2} className="tableEmptyState">Chưa có dòng dữ liệu.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function HotelListLoadingRows() {
  return (
    <>
      {Array.from({ length: 4 }).map((_, rowIndex) => (
        <tr key={`hotel-list-loading-${rowIndex}`}>
          {Array.from({ length: 6 }).map((__, cellIndex) => (
            <td key={`hotel-list-loading-${rowIndex}-${cellIndex}`}><span className="tableSkeletonLine" /></td>
          ))}
        </tr>
      ))}
    </>
  );
}

function RowInput<T extends ArrayName>({ name, index, column, register }: { name: T; index: number; column: ColumnSpec; register: UseFormRegister<HotelForm> }) {
  const fieldName = `${name}.${index}.${column.key}` as const;
  if (column.key === 'dayType') {
    return <select {...register(fieldName as any)}>{dayTypes.map((item) => <option key={item} value={item}>{dayTypeLabel(item)}</option>)}</select>;
  }
  if (column.key === 'status') {
    return <select {...register(fieldName as any)}><option value="ACTIVE">Đang hoạt động</option><option value="STOP_SELL">Dừng bán</option><option value="INACTIVE">Ngừng hoạt động</option></select>;
  }
  if (column.type === 'textarea') return <textarea rows={2} {...register(fieldName as any)} />;
  if (column.type === 'number') return <input type="number" min="0" step="1" readOnly={column.readOnly} {...register(fieldName as any)} />;
  if (column.type === 'email') return <input type="email" readOnly={column.readOnly} {...register(fieldName as any)} />;
  if (column.type === 'tel') return <input type="tel" inputMode="tel" readOnly={column.readOnly} {...register(fieldName as any)} />;
  return <input type={column.type || 'text'} readOnly={column.readOnly} {...register(fieldName as any)} />;
}

function AllotmentActionSummary({ allotment }: { allotment: AllotmentLine }) {
  const metrics = allotmentDisplayMetrics(allotment);
  return (
    <div className="allotmentActionSummary">
      <span>Tổng quỹ: <strong>{formatNumber(metrics.total)}</strong></span>
      <span>Đã xác nhận: <strong>{formatNumber(metrics.booked)}</strong></span>
      <span>Đang giữ: <strong>{formatNumber(metrics.locked)}</strong></span>
      <span>Còn khả dụng: <strong>{formatNumber(metrics.remaining)}</strong></span>
    </div>
  );
}

function ErrorLine({ errors }: { errors: Array<string | undefined> }) {
  const messages = errors.filter(Boolean);
  return messages.length ? <p className="formErrors">{messages.join(' | ')}</p> : null;
}

function nestedErrorMessages(value: unknown) {
  const messages: string[] = [];
  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    const message = (node as { message?: unknown }).message;
    if (typeof message === 'string' && !messages.includes(message)) messages.push(message);
    Object.values(node as Record<string, unknown>).forEach(visit);
  };
  visit(value);
  return messages;
}

function errorText(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

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
  supplierApi,
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
  status: 'ACTIVE' | 'INACTIVE';
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
type AllotmentAction =
  | { type: 'override'; allotment: AllotmentLine }
  | { type: 'lock'; allotment: AllotmentLine }
  | null;

const dayTypes = ['ALL_DAYS', 'WEEKDAY', 'WEEKEND', 'HOLIDAY', 'PEAK'] as const;
const currentYear = new Date().getFullYear();
const maxSupplierMoney = 999_999_999_999;
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
const requiredPhone = z.string().trim().regex(supplierPhonePattern, 'Số điện thoại phải có từ 6 đến 15 chữ số và chỉ dùng số, khoảng trắng hoặc ký tự +().-');
const optionalPhone = z.string().trim().refine((value) => !value || supplierPhonePattern.test(value), 'Số điện thoại không hợp lệ').default('');
const optionalUrl = (label: string) => z.string().trim().refine(isOptionalHttpUrl, `${label} phải là URL hợp lệ bắt đầu bằng http:// hoặc https://`).default('');
const optionalDateOnly = (label: string) => z.string().trim().refine(isOptionalDateOnly, `${label} không hợp lệ`).default('');
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
  sku: z.string().default(''),
  serviceName: z.string().default(''),
  startDate: z.string().default(''),
  endDate: z.string().default(''),
  dayType: z.enum(dayTypes).default('ALL_DAYS'),
  allotmentQty: z.coerce.number().int().min(0, 'Tổng quỹ phòng không được âm').default(0),
  bookedQty: z.coerce.number().int().min(0).default(0),
  lockedQty: z.coerce.number().int().min(0).default(0),
  quantityLock: z.coerce.number().int().min(0).default(0),
  cutoffDays: z.coerce.number().int().min(0, 'Số ngày chốt không được âm').default(0),
  netCostPerDay: nonNegativeMoney,
  sellingPricePerDay: nonNegativeMoney,
  status: z.enum(['ACTIVE', 'INACTIVE', 'STOP_SELL']).default('ACTIVE'),
  description: z.string().default(''),
  note: z.string().default(''),
});
const hotelSchema = z.object({
  supplierCode: z.string().min(2, 'Mã nhà cung cấp phải có ít nhất 2 ký tự'),
  name: z.string().min(2, 'Tên nhà cung cấp phải có ít nhất 2 ký tự'),
  taxCode: z.string().default(''),
  builtYear: optionalBuiltYear,
  phone: requiredPhone,
  email: z.string().email('Email nhà cung cấp không hợp lệ').or(z.literal('')).default(''),
  country: z.string().default('Việt Nam'),
  province: z.string().default(''),
  address: z.string().default(''),
  notes: z.string().default(''),
  rating: z.coerce.number().int('Xếp hạng khách sạn phải là số nguyên').min(0, 'Xếp hạng khách sạn không được nhỏ hơn 0').max(5, 'Xếp hạng khách sạn không được lớn hơn 5').default(0),
  website: optionalUrl('Website nhà cung cấp'),
  classHotel: z.string().min(2, 'Hạng khách sạn phải có ít nhất 2 ký tự'),
  hotelProject: z.string().min(2, 'Dự án khách sạn phải có ít nhất 2 ký tự'),
  bankAccountName: z.string().default(''),
  bankAccountNumber: z.string().default(''),
  bankName: z.string().default(''),
  market: z.string().default(''),
  link: optionalUrl('Liên kết tham khảo'),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
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
    if (item.startDate && item.endDate && item.startDate > item.endDate) {
      context.addIssue({ code: 'custom', path: ['allotments', index, 'endDate'], message: 'Ngày kết thúc không được trước ngày bắt đầu' });
    }
  });
});

type HotelForm = z.infer<typeof hotelSchema>;
type ArrayName = 'contacts' | 'services' | 'allotments';
type ColumnSpec = { key: string; label: string; type?: 'text' | 'number' | 'date' | 'select' | 'textarea'; readOnly?: boolean };

const emptyContact = { fullName: '', position: '', birthday: '', phone: '', email: '' };
const emptyService = { sku: '', serviceName: '', startDate: '', endDate: '', dayType: 'ALL_DAYS' as const, accountingPrice: 0, netPrice: 0, sellingPrice: 0, description: '', note: '' };
const emptyAllotment = { sku: '', serviceName: '', startDate: '', endDate: '', dayType: 'ALL_DAYS' as const, allotmentQty: 0, bookedQty: 0, lockedQty: 0, quantityLock: 0, cutoffDays: 0, netCostPerDay: 0, sellingPricePerDay: 0, status: 'ACTIVE' as const, description: '', note: '' };
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

function dateOnly(value?: string | null) {
  return value ? value.slice(0, 10) : '';
}

function toForm(hotel: HotelSupplier): HotelForm {
  return {
    supplierCode: hotel.supplierCode || '',
    name: hotel.name || '',
    taxCode: hotel.taxCode || '',
    builtYear: hotel.hotelProfile?.builtYear || undefined,
    phone: hotel.phone || '',
    email: hotel.email || '',
    country: hotel.country || 'Việt Nam',
    province: hotel.province || '',
    address: hotel.address || '',
    notes: hotel.notes || '',
    rating: hotel.hotelProfile?.rating || 0,
    website: hotel.website || '',
    classHotel: hotel.hotelProfile?.classHotel || '',
    hotelProject: hotel.hotelProfile?.hotelProject || '',
    bankAccountName: hotel.hotelProfile?.bankAccountName || '',
    bankAccountNumber: hotel.hotelProfile?.bankAccountNumber || '',
    bankName: hotel.hotelProfile?.bankName || '',
    market: hotel.hotelProfile?.market || '',
    link: hotel.hotelProfile?.link || '',
    status: hotel.status,
    contacts: hotel.contacts?.length ? hotel.contacts.map((item) => ({
      fullName: item.fullName || '',
      position: item.position || '',
      birthday: dateOnly(item.birthday),
      phone: item.phone || '',
      email: item.email || '',
    })) : [emptyContact],
    services: hotel.supplierServices?.length ? hotel.supplierServices.map((item) => ({
      sku: item.sku || '',
      serviceName: item.serviceName || '',
      startDate: dateOnly(item.startDate),
      endDate: dateOnly(item.endDate),
      dayType: (item.dayType || 'ALL_DAYS') as HotelForm['services'][number]['dayType'],
      accountingPrice: Number(item.accountingPrice || 0),
      netPrice: Number(item.netPrice || 0),
      sellingPrice: Number(item.sellingPrice || 0),
      description: item.description || '',
      note: item.note || '',
    })) : [emptyService],
    allotments: hotel.allotments?.length ? hotel.allotments.map((item) => ({
      sku: item.sku || '',
      serviceName: item.serviceName || '',
      startDate: dateOnly(item.startDate),
      endDate: dateOnly(item.endDate),
      dayType: (item.dayType || 'ALL_DAYS') as HotelForm['allotments'][number]['dayType'],
      allotmentQty: Number(item.allotmentQty || item.quantityLock || 0),
      bookedQty: Number(item.bookedQty || 0),
      lockedQty: Number(item.lockedQty || item.quantityLock || 0),
      quantityLock: Number(item.quantityLock || 0),
      cutoffDays: Number(item.cutoffDays || 0),
      netCostPerDay: Number(item.netCostPerDay || 0),
      sellingPricePerDay: Number(item.sellingPricePerDay || 0),
      status: (item.status || 'ACTIVE') as HotelForm['allotments'][number]['status'],
      description: item.description || '',
      note: item.note || '',
    })) : [emptyAllotment],
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
  const [formOpen, setFormOpen] = useState(false);
  const [files, setFiles] = useState<SupplierFile[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [busyAction, setBusyAction] = useState('');
  const [selectedHotel, setSelectedHotel] = useState<HotelSupplier | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [allotmentAction, setAllotmentAction] = useState<AllotmentAction>(null);
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<HotelForm>({ resolver: zodResolver(hotelSchema) as any, defaultValues });
  const contacts = useFieldArray({ control, name: 'contacts' });
  const services = useFieldArray({ control, name: 'services' });
  const allotments = useFieldArray({ control, name: 'allotments' });

  useEffect(() => setHotels(initialHotels), [initialHotels]);

  const allotmentSummary = useMemo(() => hotels.flatMap((hotel) => hotel.allotments || []).reduce((acc, item) => {
    const total = Number(item.allotmentQty || item.quantityLock || 0);
    const booked = Number(item.bookedQty || 0);
    const locked = Number(item.lockedQty || item.quantityLock || 0);
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
        cell: ({ row }) => <div className="supplierPrimaryCell"><strong>{row.original.name}</strong><span>{row.original.supplierCode || 'Chưa có mã'}</span></div>,
      }),
      helper.display({
        id: 'project',
        header: 'Hạng và dự án',
        cell: ({ row }) => <div className="supplierPrimaryCell"><span>{row.original.hotelProfile?.classHotel || '—'}</span><span>{row.original.hotelProfile?.hotelProject || '—'}</span></div>,
      }),
      helper.display({
        id: 'contact',
        header: 'Liên hệ',
        cell: ({ row }) => <div className="supplierPrimaryCell"><span>{row.original.phone || 'Chưa có số điện thoại'}</span><span>{row.original.province || 'Chưa có tỉnh/thành'}</span></div>,
      }),
      helper.display({
        id: 'allotment',
        header: 'Quỹ phòng',
        cell: ({ row }) => {
          const rows = row.original.allotments || [];
          const total = rows.reduce((sum, item) => sum + Number(item.allotmentQty || item.quantityLock || 0), 0);
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
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      Object.entries(nextFilters).forEach(([key, value]) => { if (value.trim()) params.set(key, value.trim()); });
      const rows = await supplierApi<HotelSupplier[]>(`/api/suppliers/hotels${params.size ? `?${params}` : ''}`, {}, 'Tải danh sách nhà cung cấp khách sạn');
      setHotels(rows);
      if (emitSuccess) setNotice({ type: 'success', text: 'Đã tải lại danh sách nhà cung cấp khách sạn.' });
      return true;
    } catch (error) {
      setNotice({ type: 'error', text: errorText(error, 'Không tải được danh sách nhà cung cấp khách sạn.') });
      return false;
    } finally {
      setIsLoading(false);
    }
  }

  function submitFilters(event: FormEvent) {
    event.preventDefault();
    setNotice(null);
    void load(filters);
  }

  function resetFilters() {
    setFilters(defaultFilters);
    setNotice(null);
    void load(defaultFilters);
  }

  async function onSubmit(values: HotelForm) {
    setNotice(null);
    const payload = {
      ...values,
      builtYear: values.builtYear ?? undefined,
      rating: values.rating ?? undefined,
      contacts: values.contacts.filter((item) => item.fullName.trim()),
      services: values.services.filter(hasServiceRowData),
      ...(editingId ? {} : { allotments: values.allotments.filter((item) => item.serviceName.trim()) }),
    };
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
    const payload = allotmentAction.type === 'override'
      ? {
          allotmentQty: Number(form.get('allotmentQty')),
          status: String(form.get('status') || 'ACTIVE'),
          note: String(form.get('note') || '').trim(),
        }
      : {
          serviceId: allotment.serviceId || undefined,
          bookingId: String(form.get('bookingId') || '') || undefined,
          quantity: Number(form.get('quantity') || 1),
          note: String(form.get('note') || '').trim() || undefined,
        };
    if (allotmentAction.type === 'override' && !payload.note) {
      setNotice({ type: 'error', text: 'Cần nhập lý do điều chỉnh quỹ phòng.' });
      return;
    }
    if (allotmentAction.type === 'override' && !window.confirm(`Xác nhận điều chỉnh quỹ phòng "${allotment.serviceName}"? Thay đổi sẽ được ghi vào lịch sử.`)) return;
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

          <section className="panel supplierFilterPanel">
            <form className="supplierFilters supplierHotelFilters" onSubmit={submitFilters}>
              <label className="searchBox"><Search size={16} /><input value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} placeholder="Tìm mã, tên, điện thoại, dự án hoặc hạng khách sạn..." /></label>
              <label>Trạng thái<select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}><option value="">Tất cả trạng thái</option><option value="ACTIVE">Đang hoạt động</option><option value="INACTIVE">Ngừng hoạt động</option></select></label>
              <label>Tỉnh/thành<input value={filters.province} onChange={(event) => setFilters((current) => ({ ...current, province: event.target.value }))} /></label>
              <label>Thị trường<input value={filters.market} onChange={(event) => setFilters((current) => ({ ...current, market: event.target.value }))} /></label>
              <label>Dự án<input value={filters.hotelProject} onChange={(event) => setFilters((current) => ({ ...current, hotelProject: event.target.value }))} /></label>
              <label>Hạng khách sạn<input value={filters.classHotel} onChange={(event) => setFilters((current) => ({ ...current, classHotel: event.target.value }))} /></label>
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
                <button type="button" className="iconTextButton" onClick={openCreate} disabled={!canManage}><Plus size={16} /> Thêm khách sạn</button>
              </div>
            </div>
            <div className="fitTableWrap">
              <table className="fitTable hotelListTable">
                <thead>{table.getHeaderGroups().map((group) => <tr key={group.id}>{group.headers.map((header) => <th key={header.id}>{flexRender(header.column.columnDef.header, header.getContext())}</th>)}</tr>)}</thead>
                <tbody>
                  {table.getRowModel().rows.map((row) => <tr key={row.id}>{row.getVisibleCells().map((cell) => <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}
                  {!isLoading && hotels.length === 0 ? <tr><td colSpan={6} className="tableEmptyState">Không tìm thấy nhà cung cấp khách sạn phù hợp với bộ lọc hiện tại.</td></tr> : null}
                  {isLoading ? <tr><td colSpan={6} className="tableEmptyState">Đang tải danh sách nhà cung cấp khách sạn...</td></tr> : null}
                </tbody>
              </table>
            </div>
          </section>

          {formOpen ? (
            <div className="modalOverlay" role="dialog" aria-modal="true" aria-label={editingId ? 'Cập nhật khách sạn' : 'Tạo khách sạn'}>
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
                      <label>Quốc gia<input {...register('country')} /></label>
                      <label>Tỉnh/thành<input {...register('province')} /></label>
                      <label>Hạng khách sạn *<input required placeholder="3 sao, 4 sao, khu nghỉ dưỡng..." {...register('classHotel')} /></label>
                      <label>Dòng sản phẩm/Dự án *<input required {...register('hotelProject')} /></label>
                      <label>Thị trường<input {...register('market')} /></label>
                      <label>Xếp hạng<input type="number" min="0" max="5" step="1" {...register('rating')} /></label>
                      <label>Trạng thái<select {...register('status')}><option value="ACTIVE">Đang hoạt động</option><option value="INACTIVE">Ngừng hoạt động</option></select></label>
                      <label>Website<input type="url" placeholder="https://example.com" {...register('website')} /></label>
                      <label>Liên kết tham khảo<input type="url" placeholder="https://example.com/tham-khao" {...register('link')} /></label>
                      <label className="span2">Địa chỉ<input {...register('address')} /></label>
                    </div>
                  </fieldset>

                  <fieldset>
                    <legend>Thanh toán và ghi chú</legend>
                    <div className="hotelFormGrid">
                      <label>Tên tài khoản<input {...register('bankAccountName')} /></label>
                      <label>Số tài khoản<input {...register('bankAccountNumber')} /></label>
                      <label>Ngân hàng<input {...register('bankName')} /></label>
                      <label className="span2">Ghi chú nội bộ<textarea rows={3} {...register('notes')} /></label>
                    </div>
                  </fieldset>

                  <DynamicRows title="Người liên hệ" name="contacts" register={register} fieldArray={contacts} columns={[
                    { key: 'fullName', label: 'Họ tên' },
                    { key: 'position', label: 'Chức vụ' },
                    { key: 'birthday', label: 'Ngày sinh', type: 'date' },
                    { key: 'phone', label: 'Điện thoại' },
                    { key: 'email', label: 'Email' },
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
                    { key: 'note', label: 'Ghi chú' },
                  ]} emptyRow={emptyService} />

                  {!editingId ? <DynamicRows title="Quỹ phòng ban đầu" name="allotments" register={register} fieldArray={allotments} columns={[
                    { key: 'sku', label: 'Mã quỹ phòng' },
                    { key: 'serviceName', label: 'Tên hạng phòng' },
                    { key: 'startDate', label: 'Từ ngày', type: 'date' },
                    { key: 'endDate', label: 'Đến ngày', type: 'date' },
                    { key: 'dayType', label: 'Loại ngày', type: 'select' },
                    { key: 'allotmentQty', label: 'Tổng quỹ', type: 'number' },
                    { key: 'cutoffDays', label: 'Số ngày chốt', type: 'number' },
                    { key: 'netCostPerDay', label: 'Giá thuần/ngày', type: 'number' },
                    { key: 'sellingPricePerDay', label: 'Giá bán/ngày', type: 'number' },
                    { key: 'status', label: 'Trạng thái' },
                    { key: 'description', label: 'Diễn giải', type: 'textarea' },
                    { key: 'note', label: 'Ghi chú' },
                  ]} emptyRow={emptyAllotment} /> : (
                    <section className="panel supplierInlineInfo">
                      <strong>Quỹ phòng được quản lý riêng</strong>
                      <span>Dùng nút Quỹ phòng ở danh sách để điều chỉnh số lượng, giữ chỗ, xác nhận hoặc giải phóng mà không ảnh hưởng dữ liệu liên hệ và dịch vụ.</span>
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
                    <button type="submit" disabled={!canManage || isSubmitting || Boolean(busyAction)}><Save size={17} /> {isSubmitting ? 'Đang lưu...' : editingId ? 'Lưu thay đổi' : 'Tạo nhà cung cấp'}</button>
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
                    const total = Number(allotment.allotmentQty || allotment.quantityLock || 0);
                    const booked = Number(allotment.bookedQty || 0);
                    const locked = Number(allotment.lockedQty || allotment.quantityLock || 0);
                    const remaining = allotment.remainingQty ?? Math.max(0, total - booked - locked);
                    return (
                      <article className="allotmentCard" key={allotment.id || allotment.serviceName}>
                        <div className="allotmentCardHeader">
                          <div><strong>{allotment.serviceName}</strong><span>{dateOnly(allotment.startDate) || 'Không giới hạn'} - {dateOnly(allotment.endDate) || 'Không giới hạn'}</span></div>
                          <SupplierStatus status={allotment.computedStatus || allotment.status || 'ACTIVE'} />
                        </div>
                        <div className="allotmentNumbers">
                          <span>Tổng quỹ<strong>{total}</strong></span>
                          <span>Đã xác nhận<strong>{booked}</strong></span>
                          <span>Đang giữ<strong>{locked}</strong></span>
                          <span>Còn lại<strong>{remaining}</strong></span>
                        </div>
                        <div className="rowActions">
                          <button type="button" className="secondaryButton iconTextButton" onClick={() => setAllotmentAction({ type: 'override', allotment })}><Settings2 size={15} /> Điều chỉnh</button>
                          <button type="button" className="secondaryButton iconTextButton" disabled={remaining <= 0 || allotment.status !== 'ACTIVE'} onClick={() => setAllotmentAction({ type: 'lock', allotment })}><LockKeyhole size={15} /> Giữ chỗ</button>
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
                  {allotmentAction.type === 'override' ? (
                    <div className="modalFormGrid">
                      <label>Tổng quỹ phòng<input name="allotmentQty" type="number" min="0" defaultValue={allotmentAction.allotment.allotmentQty || 0} required /></label>
                      <label>Trạng thái<select name="status" defaultValue={allotmentAction.allotment.status || 'ACTIVE'}><option value="ACTIVE">Đang hoạt động</option><option value="STOP_SELL">Dừng bán</option><option value="INACTIVE">Ngừng hoạt động</option></select></label>
                      <label className="span2">Lý do điều chỉnh<textarea name="note" rows={3} required minLength={3} /></label>
                    </div>
                  ) : (
                    <div className="modalFormGrid">
                      <label>Số phòng giữ<input name="quantity" type="number" min="1" defaultValue={1} required /></label>
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
    columns: useMemo(() => {
      const helper = createColumnHelper<FieldArrayWithId<HotelForm, T, 'id'>>();
      return [
        helper.display({ id: 'stt', header: 'STT', cell: ({ row }) => row.index + 1 }),
        ...columns.map((column) => helper.display({ id: column.key, header: column.label, cell: ({ row }) => <RowInput name={name} index={row.index} column={column} register={register} /> })),
        helper.display({ id: 'actions', header: '', cell: ({ row }) => <button type="button" className="dangerButton iconButton" onClick={() => fieldArray.remove(row.index)} aria-label="Xóa dòng" title="Xóa dòng"><Trash2 size={15} /></button> }),
      ];
    }, [columns, fieldArray, name, register]),
    getCoreRowModel: getCoreRowModel(),
  });
  return (
    <section className="fitTableBlock">
      <div className="sectionHeader"><h2>{title}</h2><button type="button" className="secondaryButton iconTextButton" onClick={() => fieldArray.append({ ...emptyRow } as any)}><Plus size={16} /> Thêm dòng</button></div>
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

function RowInput<T extends ArrayName>({ name, index, column, register }: { name: T; index: number; column: ColumnSpec; register: UseFormRegister<HotelForm> }) {
  const fieldName = `${name}.${index}.${column.key}` as const;
  if (column.type === 'select') {
    return <select {...register(fieldName as any)}>{dayTypes.map((item) => <option key={item} value={item}>{dayTypeLabel(item)}</option>)}</select>;
  }
  if (column.key === 'status') {
    return <select {...register(fieldName as any)}><option value="ACTIVE">Đang hoạt động</option><option value="STOP_SELL">Dừng bán</option><option value="INACTIVE">Ngừng hoạt động</option></select>;
  }
  if (column.type === 'textarea') return <textarea rows={2} {...register(fieldName as any)} />;
  return <input type={column.type || 'text'} readOnly={column.readOnly} {...register(fieldName as any)} />;
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

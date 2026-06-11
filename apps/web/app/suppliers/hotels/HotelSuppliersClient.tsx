'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { FileUp, Pencil, Plus, RotateCcw, Save, Search, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { FieldArrayWithId, useFieldArray, useForm, UseFieldArrayReturn, UseFormRegister } from 'react-hook-form';
import { z } from 'zod';

type HotelSupplier = {
  id: string;
  supplierCode: string | null;
  name: string;
  taxCode: string | null;
  phone: string | null;
  email: string | null;
  province: string | null;
  address: string | null;
  website: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
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
};

type ContactLine = {
  fullName: string;
  position?: string;
  birthday?: string;
  phone?: string;
  email?: string;
};

type ServiceLine = {
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

type AllotmentLine = {
  id?: string;
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
  description?: string;
  note?: string;
};

const apiBase = process.env.NEXT_PUBLIC_API_URL || '';
const dayTypes = ['ALL_DAYS', 'WEEKDAY', 'WEEKEND', 'HOLIDAY', 'PEAK'];

const contactSchema = z.object({
  fullName: z.string().default(''),
  position: z.string().default(''),
  birthday: z.string().default(''),
  phone: z.string().default(''),
  email: z.string().default(''),
});

const serviceSchema = z.object({
  sku: z.string().default(''),
  serviceName: z.string().default(''),
  startDate: z.string().default(''),
  endDate: z.string().default(''),
  dayType: z.string().default('ALL_DAYS'),
  accountingPrice: z.coerce.number().default(0),
  netPrice: z.coerce.number().default(0),
  sellingPrice: z.coerce.number().default(0),
  description: z.string().default(''),
  note: z.string().default(''),
});

const allotmentSchema = z.object({
  sku: z.string().default(''),
  serviceName: z.string().default(''),
  startDate: z.string().default(''),
  endDate: z.string().default(''),
  dayType: z.string().default('ALL_DAYS'),
  allotmentQty: z.coerce.number().default(0),
  bookedQty: z.coerce.number().default(0),
  lockedQty: z.coerce.number().default(0),
  quantityLock: z.coerce.number().default(0),
  cutoffDays: z.coerce.number().default(0),
  netCostPerDay: z.coerce.number().default(0),
  sellingPricePerDay: z.coerce.number().default(0),
  status: z.string().default('ACTIVE'),
  description: z.string().default(''),
  note: z.string().default(''),
});

const hotelSchema = z.object({
  supplierCode: z.string().min(2, 'Nhập mã nhà cung cấp'),
  name: z.string().min(2, 'Nhập tên nhà cung cấp'),
  taxCode: z.string().default(''),
  builtYear: z.coerce.number().optional(),
  phone: z.string().min(6, 'Nhập số điện thoại'),
  email: z.string().email('Email không hợp lệ').or(z.literal('')).default(''),
  country: z.string().default('Viet Nam'),
  province: z.string().default(''),
  address: z.string().default(''),
  notes: z.string().default(''),
  rating: z.coerce.number().default(0),
  website: z.string().default(''),
  classHotel: z.string().min(1, 'Chọn hạng khách sạn'),
  hotelProject: z.string().min(1, 'Nhập dự án/line khách sạn'),
  bankAccountName: z.string().default(''),
  bankAccountNumber: z.string().default(''),
  bankName: z.string().default(''),
  market: z.string().default(''),
  link: z.string().default(''),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
  contacts: z.array(contactSchema).default([]),
  services: z.array(serviceSchema).default([]),
  allotments: z.array(allotmentSchema).default([]),
});

type HotelForm = z.infer<typeof hotelSchema>;
type ArrayName = 'contacts' | 'services' | 'allotments';
type ColumnSpec = { key: string; label: string; type?: 'text' | 'number' | 'date' | 'select' | 'textarea' };

const emptyContact = { fullName: '', position: '', birthday: '', phone: '', email: '' };
const emptyService = { sku: '', serviceName: '', startDate: '', endDate: '', dayType: 'ALL_DAYS', accountingPrice: 0, netPrice: 0, sellingPrice: 0, description: '', note: '' };
const emptyAllotment = { sku: '', serviceName: '', startDate: '', endDate: '', dayType: 'ALL_DAYS', allotmentQty: 0, bookedQty: 0, lockedQty: 0, quantityLock: 0, cutoffDays: 0, netCostPerDay: 0, sellingPricePerDay: 0, status: 'ACTIVE', description: '', note: '' };

const defaultValues: HotelForm = {
  supplierCode: '',
  name: '',
  taxCode: '',
  builtYear: undefined,
  phone: '',
  email: '',
  country: 'Viet Nam',
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

function browserApiBase() {
  if (typeof window === 'undefined') return apiBase;
  if (apiBase.includes('smarttour-api-1')) return `http://${window.location.hostname}:4000`;
  return apiBase;
}

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
    country: 'Viet Nam',
    province: hotel.province || '',
    address: hotel.address || '',
    notes: '',
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
    contacts: hotel.contacts?.length
      ? hotel.contacts.map((item) => ({
          fullName: item.fullName || '',
          position: item.position || '',
          birthday: dateOnly(item.birthday),
          phone: item.phone || '',
          email: item.email || '',
        }))
      : [emptyContact],
    services: hotel.supplierServices?.length
      ? hotel.supplierServices.map((item) => ({
          sku: item.sku || '',
          serviceName: item.serviceName || '',
          startDate: dateOnly(item.startDate),
          endDate: dateOnly(item.endDate),
          dayType: item.dayType || 'ALL_DAYS',
          accountingPrice: Number(item.accountingPrice || 0),
          netPrice: Number(item.netPrice || 0),
          sellingPrice: Number(item.sellingPrice || 0),
          description: item.description || '',
          note: item.note || '',
        }))
      : [emptyService],
    allotments: hotel.allotments?.length
      ? hotel.allotments.map((item) => ({
          sku: item.sku || '',
          serviceName: item.serviceName || '',
          startDate: dateOnly(item.startDate),
          endDate: dateOnly(item.endDate),
          dayType: item.dayType || 'ALL_DAYS',
          allotmentQty: Number(item.allotmentQty || item.quantityLock || 0),
          bookedQty: Number(item.bookedQty || 0),
          lockedQty: Number(item.lockedQty || item.quantityLock || 0),
          quantityLock: Number(item.quantityLock || 0),
          cutoffDays: Number(item.cutoffDays || 0),
          netCostPerDay: Number(item.netCostPerDay || 0),
          sellingPricePerDay: Number(item.sellingPricePerDay || 0),
          status: item.status || 'ACTIVE',
          description: item.description || '',
          note: item.note || '',
        }))
      : [emptyAllotment],
  };
}

export default function HotelSuppliersClient({ initialHotels }: { initialHotels: HotelSupplier[] }) {
  const [hotels, setHotels] = useState<HotelSupplier[]>(initialHotels);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const [formOpen, setFormOpen] = useState(false);

  const { register, control, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<HotelForm>({
    resolver: zodResolver(hotelSchema) as any,
    defaultValues,
  });
  const contacts = useFieldArray({ control, name: 'contacts' });
  const services = useFieldArray({ control, name: 'services' });
  const allotments = useFieldArray({ control, name: 'allotments' });

  const filteredHotels = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return hotels;
    return hotels.filter((item) =>
      [item.supplierCode, item.name, item.taxCode, item.phone, item.email, item.province, item.hotelProfile?.hotelProject]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    );
  }, [hotels, query]);

  const allotmentSummary = useMemo(() => {
    return hotels.flatMap((hotel) => hotel.allotments || []).reduce((acc, item) => {
      const allotmentQty = Number(item.allotmentQty || item.quantityLock || 0);
      const bookedQty = Number(item.bookedQty || 0);
      const lockedQty = Number(item.lockedQty || item.quantityLock || 0);
      const remainingQty = Math.max(0, allotmentQty - bookedQty - lockedQty);
      acc.allotmentQty += allotmentQty;
      acc.bookedQty += bookedQty;
      acc.lockedQty += lockedQty;
      acc.remainingQty += remainingQty;
      acc.revenue += bookedQty * Number(item.sellingPricePerDay || 0);
      return acc;
    }, { allotmentQty: 0, bookedQty: 0, lockedQty: 0, remainingQty: 0, revenue: 0 });
  }, [hotels]);

  const listColumns = useMemo(() => {
    const helper = createColumnHelper<HotelSupplier>();
    return [
      helper.display({ id: 'check', header: '', cell: () => <input type="checkbox" aria-label="select supplier" /> }),
      helper.accessor('supplierCode', { header: 'Mã nhà cung cấp', cell: (info) => info.getValue() || '-' }),
      helper.accessor('name', { header: 'Tên nhà cung cấp' }),
      helper.accessor('taxCode', { header: 'Mã số thuế', cell: (info) => info.getValue() || '-' }),
      helper.accessor('phone', { header: 'Điện thoại', cell: (info) => info.getValue() || '-' }),
      helper.accessor((row) => row.hotelProfile?.classHotel || '-', { id: 'classHotel', header: 'Hạng khách sạn' }),
      helper.accessor((row) => row.hotelProfile?.hotelProject || '-', { id: 'hotelProject', header: 'Dự án' }),
      helper.accessor('status', { header: 'Trạng thái', cell: (info) => <span className="statusPill">{info.getValue()}</span> }),
      helper.display({
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <button type="button" className="secondaryButton iconTextButton" onClick={() => startEdit(row.original)}>
            <Pencil size={15} /> Sửa
          </button>
        ),
      }),
    ];
  }, []);

  const table = useReactTable({ data: filteredHotels, columns: listColumns, getCoreRowModel: getCoreRowModel() });

  async function reload() {
    const response = await fetch(`${browserApiBase()}/api/suppliers/hotels`, { cache: 'no-store' });
    if (response.ok) setHotels(await response.json());
  }

  async function onSubmit(values: HotelForm) {
    const payload = {
      ...values,
      builtYear: values.builtYear || undefined,
      rating: values.rating || undefined,
      contacts: values.contacts.filter((item) => item.fullName.trim()),
      services: values.services.filter((item) => item.serviceName.trim()),
      allotments: values.allotments.filter((item) => item.serviceName.trim()),
    };
    const response = await fetch(`${browserApiBase()}/api/suppliers/hotels${editingId ? `/${editingId}` : ''}`, {
      method: editingId ? 'PUT' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      setMessage('Không lưu được nhà cung cấp khách sạn. Kiểm tra mã nhà cung cấp hoặc các trường bắt buộc.');
      return;
    }
    setMessage(editingId ? 'Đã cập nhật nhà cung cấp khách sạn.' : 'Đã tạo nhà cung cấp khách sạn.');
    reset(defaultValues);
    setEditingId(null);
    setFormOpen(false);
    await reload();
  }

  function startEdit(hotel: HotelSupplier) {
    setEditingId(hotel.id);
    reset(toForm(hotel));
    setFormOpen(true);
  }

  function clearForm() {
    reset(defaultValues);
    setEditingId(null);
    setFormOpen(false);
    setMessage('');
  }

  function openCreate() {
    reset(defaultValues);
    setEditingId(null);
    setMessage('');
    setFormOpen(true);
  }

  useEffect(() => {
    setHotels(initialHotels);
  }, [initialHotels]);

  return (
    <div className="hotelSupplierPage">
      <section className="metrics">
        <article className="metric"><span>Tổng quỹ phòng</span><strong>{allotmentSummary.allotmentQty.toLocaleString('vi-VN')}</strong></article>
        <article className="metric"><span>Đã bán</span><strong>{allotmentSummary.bookedQty.toLocaleString('vi-VN')}</strong></article>
        <article className="metric"><span>Đang khóa</span><strong>{allotmentSummary.lockedQty.toLocaleString('vi-VN')}</strong></article>
        <article className="metric"><span>Còn lại</span><strong>{allotmentSummary.remainingQty.toLocaleString('vi-VN')}</strong></article>
        <article className="metric"><span>Doanh thu phòng</span><strong>{allotmentSummary.revenue.toLocaleString('vi-VN')}</strong></article>
      </section>
      {formOpen ? <div className="modalOverlay" role="dialog" aria-modal="true"><div className="modalPanel modalPanelWide"><form onSubmit={handleSubmit(onSubmit)} className="hotelSupplierForm">
        <section className="panel">
          <div className="sectionHeader">
            <h2>{editingId ? 'Cập nhật nhà cung cấp khách sạn' : 'Tạo nhà cung cấp khách sạn'}</h2>
            <span>{message || 'Bắt đầu với thông tin bắt buộc'}</span>
          </div>
          <div className="hotelFormGrid">
            <label>Mã nhà cung cấp<input {...register('supplierCode')} /></label>
            <label>Tên nhà cung cấp<input {...register('name')} /></label>
            <label>Mã số thuế<input {...register('taxCode')} /></label>
            <label>Năm xây dựng<input type="number" {...register('builtYear')} /></label>
            <label>Điện thoại<input {...register('phone')} /></label>
            <label>Email<input type="email" {...register('email')} /></label>
            <label>Quốc gia<input {...register('country')} /></label>
            <label>Tỉnh/Thành<input {...register('province')} /></label>
            <label className="span2">Địa chỉ<input {...register('address')} /></label>
            <label>Rating<input type="number" min="0" max="5" {...register('rating')} /></label>
            <label>Website<input {...register('website')} /></label>
            <label>Hạng khách sạn<input placeholder="3 sao, 4 sao, resort..." {...register('classHotel')} /></label>
            <label>Line/Dự án khách sạn<input {...register('hotelProject')} /></label>
            <label>Thị trường<input {...register('market')} /></label>
            <label>Trạng thái<select {...register('status')}><option value="ACTIVE">ACTIVE</option><option value="INACTIVE">INACTIVE</option></select></label>
            <label>Chủ tài khoản<input {...register('bankAccountName')} /></label>
            <label>Số tài khoản<input {...register('bankAccountNumber')} /></label>
            <label>Ngân hàng<input {...register('bankName')} /></label>
            <label>Link nhà cung cấp<input {...register('link')} /></label>
            <label className="span2">Ghi chú<textarea rows={3} {...register('notes')} /></label>
            <label className="fileDrop"><FileUp size={18} /> File đính kèm sẽ được nối tiếp vào module upload<input type="file" multiple /></label>
          </div>
          <ErrorLine errors={[errors.supplierCode?.message, errors.name?.message, errors.phone?.message, errors.classHotel?.message, errors.hotelProject?.message]} />
        </section>

        <DynamicRows title="Liên hệ nhà cung cấp" name="contacts" register={register} fieldArray={contacts} columns={[
          { key: 'fullName', label: 'Họ tên' },
          { key: 'position', label: 'Chức vụ' },
          { key: 'birthday', label: 'Sinh nhật', type: 'date' },
          { key: 'phone', label: 'Điện thoại' },
          { key: 'email', label: 'Email' },
        ]} emptyRow={emptyContact} />

        <DynamicRows title="Dịch vụ / Sản phẩm" name="services" register={register} fieldArray={services} columns={[
          { key: 'sku', label: 'SKU' },
          { key: 'serviceName', label: 'Tên dịch vụ' },
          { key: 'startDate', label: 'Từ ngày', type: 'date' },
          { key: 'endDate', label: 'Đến ngày', type: 'date' },
          { key: 'dayType', label: 'Loại ngày', type: 'select' },
          { key: 'accountingPrice', label: 'Giá kế toán', type: 'number' },
          { key: 'netPrice', label: 'Giá NET', type: 'number' },
          { key: 'sellingPrice', label: 'Giá bán', type: 'number' },
          { key: 'description', label: 'Diễn giải', type: 'textarea' },
          { key: 'note', label: 'Ghi chú' },
        ]} emptyRow={emptyService} />

        <DynamicRows title="Allotment / Giữ phòng" name="allotments" register={register} fieldArray={allotments} columns={[
          { key: 'sku', label: 'SKU' },
          { key: 'serviceName', label: 'Tên dịch vụ' },
          { key: 'startDate', label: 'Từ ngày', type: 'date' },
          { key: 'endDate', label: 'Đến ngày', type: 'date' },
          { key: 'dayType', label: 'Loại ngày', type: 'select' },
          { key: 'allotmentQty', label: 'Tổng quỹ', type: 'number' },
          { key: 'bookedQty', label: 'Đã bán', type: 'number' },
          { key: 'lockedQty', label: 'Đang khóa', type: 'number' },
          { key: 'cutoffDays', label: 'Cutoff ngày', type: 'number' },
          { key: 'netCostPerDay', label: 'NET/ngay', type: 'number' },
          { key: 'sellingPricePerDay', label: 'Gia ban/ngay', type: 'number' },
          { key: 'status', label: 'Trạng thái' },
          { key: 'description', label: 'Diễn giải', type: 'textarea' },
          { key: 'note', label: 'Ghi chú' },
        ]} emptyRow={emptyAllotment} />

        <div className="hotelFormActions">
          <button type="submit" disabled={isSubmitting}><Save size={17} /> {editingId ? 'Lưu cập nhật' : 'Lưu nhà cung cấp'}</button>
          <button type="button" className="dangerButton" onClick={clearForm}><X size={17} /> Đóng</button>
        </div>
      </form></div></div> : null}

      <section className="panel listPanel">
        <div className="sectionHeader">
          <h2>Danh sách nhà cung cấp khách sạn</h2><button type="button" className="secondaryButton iconTextButton" onClick={openCreate}><Plus size={16} /> Thêm mới</button><label className="searchBox"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm mã, tên, số điện thoại, dự án..." /></label>
        </div>
        <div className="fitTableWrap">
          <table className="fitTable hotelListTable">
            <thead>
              {table.getHeaderGroups().map((group) => (
                <tr key={group.id}>
                  {group.headers.map((header) => (
                    <th key={header.id}>{flexRender(header.column.columnDef.header, header.getContext())}</th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                  ))}
                </tr>
              ))}
              {filteredHotels.length === 0 ? <tr><td colSpan={9}>Chưa có nhà cung cấp khách sạn.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
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
        ...columns.map((column) =>
          helper.display({
            id: column.key,
            header: column.label,
            cell: ({ row }) => <RowInput name={name} index={row.index} column={column} register={register} />,
          }),
        ),
        helper.display({
          id: 'actions',
          header: '',
          cell: ({ row }) => (
            <button type="button" className="dangerButton iconButton" onClick={() => fieldArray.remove(row.index)} aria-label="Xóa dòng">
              <Trash2 size={15} />
            </button>
          ),
        }),
      ];
    }, [columns, fieldArray, name, register]),
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <section className="fitTableBlock">
      <div className="sectionHeader">
        <h2>{title}</h2>
        <button type="button" className="secondaryButton" onClick={() => fieldArray.append({ ...emptyRow } as any)}><Plus size={16} /> Thêm dòng</button>
      </div>
      <div className="fitTableWrap">
        <table className="fitTable hotelDynamicTable">
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => (
                  <th key={header.id}>{flexRender(header.column.columnDef.header, header.getContext())}</th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RowInput<T extends ArrayName>({
  name,
  index,
  column,
  register,
}: {
  name: T;
  index: number;
  column: ColumnSpec;
  register: UseFormRegister<HotelForm>;
}) {
  const fieldName = `${name}.${index}.${column.key}` as const;
  if (column.type === 'select') {
    return (
      <select {...register(fieldName as any)}>
        {dayTypes.map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
    );
  }
  if (column.type === 'textarea') return <textarea rows={2} {...register(fieldName as any)} />;
  return <input type={column.type || 'text'} {...register(fieldName as any)} />;
}

function ErrorLine({ errors }: { errors: Array<string | undefined> }) {
  const messages = errors.filter(Boolean);
  if (!messages.length) return null;
  return <p className="formErrors"><RotateCcw size={15} /> {messages.join(' | ')}</p>;
}

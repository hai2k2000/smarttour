'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { FileUp, Pencil, Plus, Save, Search, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { FieldArrayWithId, useFieldArray, useForm, UseFieldArrayReturn, UseFormRegister } from 'react-hook-form';
import { z } from 'zod';
import { authHeaders, authJsonHeaders } from '../../authFetch';
import { PermissionNotice, usePermissions } from '../../usePermissions';

export type SupplierType =
  | 'restaurants'
  | 'flights'
  | 'attraction-tickets'
  | 'landtour-suppliers'
  | 'water'
  | 'transport'
  | 'bus'
  | 'other'
  | 'villas'
  | 'passport'
  | 'guides'
  | 'series-tickets';

type ServiceField = { key: string; label: string; type?: 'text' | 'number' | 'date' | 'time' | 'datetime-local' | 'textarea' };
type SupplierConfig = { title: string; shortTitle: string; serviceTitle: string; serviceNameLabel: string; serviceFields: ServiceField[] };

export const supplierConfigs: Record<SupplierType, SupplierConfig> = {
  restaurants: {
    title: 'Nha cung cap nha hang',
    shortTitle: 'Nha hang',
    serviceTitle: 'Danh muc thuc don',
    serviceNameLabel: 'Ten menu',
    serviceFields: [
      { key: 'quantity', label: 'So luong', type: 'number' },
      { key: 'accountingPrice', label: 'Gia KT', type: 'number' },
      { key: 'netPrice', label: 'Gia NET', type: 'number' },
      { key: 'sellingPrice', label: 'Gia ban', type: 'number' },
      { key: 'description', label: 'Mo ta', type: 'textarea' },
    ],
  },
  flights: {
    title: 'Nha cung cap ve may bay',
    shortTitle: 'Ve may bay',
    serviceTitle: 'Chang bay / ma ve',
    serviceNameLabel: 'Code ve',
    serviceFields: [
      { key: 'ticketType', label: 'Loai ve' },
      { key: 'route', label: 'Hanh trinh' },
      { key: 'departureAirport', label: 'SHCB di' },
      { key: 'departureDate', label: 'Ngay di', type: 'date' },
      { key: 'departureTime', label: 'Gio di', type: 'time' },
      { key: 'arrivalAirport', label: 'SHCB ve' },
      { key: 'returnDate', label: 'Ngay ve', type: 'date' },
      { key: 'returnTime', label: 'Gio ve', type: 'time' },
      { key: 'depositDeadline', label: 'Han coc', type: 'datetime-local' },
      { key: 'nameDeadline', label: 'Han vao ten', type: 'datetime-local' },
      { key: 'fullpayDeadline', label: 'Han FullPay', type: 'datetime-local' },
      { key: 'netPrice', label: 'Gia NET', type: 'number' },
      { key: 'taxPrice', label: 'Thue', type: 'number' },
      { key: 'airportFee', label: 'Phi san bay', type: 'number' },
      { key: 'issueFee', label: 'Phi xuat ve', type: 'number' },
      { key: 'sellingPrice', label: 'Gia ban', type: 'number' },
      { key: 'commission', label: 'Hoa hong', type: 'number' },
    ],
  },
  'attraction-tickets': {
    title: 'Nha cung cap ve tham quan',
    shortTitle: 'Ve tham quan',
    serviceTitle: 'Dich vu / ve tham quan',
    serviceNameLabel: 'Ten dich vu',
    serviceFields: [
      { key: 'quantity', label: 'So luong', type: 'number' },
      { key: 'accountingPrice', label: 'Gia KT', type: 'number' },
      { key: 'netPrice', label: 'Gia NET', type: 'number' },
      { key: 'sellingPrice', label: 'Gia ban', type: 'number' },
      { key: 'description', label: 'Mo ta', type: 'textarea' },
    ],
  },
  'landtour-suppliers': {
    title: 'Nha cung cap Landtour',
    shortTitle: 'Landtour',
    serviceTitle: 'Chuong trinh Landtour',
    serviceNameLabel: 'Ten tour',
    serviceFields: [
      { key: 'supplierTourCode', label: 'Ma tour NCC' },
      { key: 'duration', label: 'So ngay' },
      { key: 'departurePlace', label: 'Diem di' },
      { key: 'destinationPlace', label: 'Diem den' },
      { key: 'tourType', label: 'Loai tour' },
      { key: 'departureSchedule', label: 'Khoi hanh' },
      { key: 'quantity', label: 'SL toi thieu', type: 'number' },
      { key: 'capacity', label: 'Suc chua', type: 'number' },
      { key: 'accountingPrice', label: 'Gia KT', type: 'number' },
      { key: 'netPrice', label: 'Gia NET', type: 'number' },
      { key: 'sellingPrice', label: 'Gia ban', type: 'number' },
      { key: 'childPolicy', label: 'CS tre em', type: 'textarea' },
      { key: 'cancelPolicy', label: 'CS huy', type: 'textarea' },
      { key: 'paymentPolicy', label: 'Thanh toan', type: 'textarea' },
    ],
  },
  water: {
    title: 'Nha cung cap nuoc suoi',
    shortTitle: 'Nuoc suoi',
    serviceTitle: 'San pham nuoc',
    serviceNameLabel: 'Ten san pham',
    serviceFields: [
      { key: 'packageSize', label: 'Quy cach' },
      { key: 'unit', label: 'Don vi' },
      { key: 'netPrice', label: 'Gia NET', type: 'number' },
      { key: 'sellingPrice', label: 'Gia ban', type: 'number' },
      { key: 'description', label: 'Mo ta', type: 'textarea' },
    ],
  },
  transport: {
    title: 'Nha cung cap van chuyen',
    shortTitle: 'Van chuyen',
    serviceTitle: 'Dich vu xe',
    serviceNameLabel: 'Loai xe',
    serviceFields: [
      { key: 'licensePlate', label: 'Bien so' },
      { key: 'seatCapacity', label: 'So cho', type: 'number' },
      { key: 'driverName', label: 'Tai xe' },
      { key: 'driverPhone', label: 'SDT tai xe' },
      { key: 'dailyPrice', label: 'Gia ngay', type: 'number' },
      { key: 'kmPrice', label: 'Gia KM', type: 'number' },
      { key: 'overtimePrice', label: 'Qua gio', type: 'number' },
      { key: 'fuelIncluded', label: 'Gom xang' },
    ],
  },
  bus: {
    title: 'Nha xe tuyen co dinh',
    shortTitle: 'Nha xe',
    serviceTitle: 'Tuyen xe',
    serviceNameLabel: 'Ten tuyen',
    serviceFields: [
      { key: 'routeCode', label: 'Ma tuyen' },
      { key: 'departureStation', label: 'Ben di' },
      { key: 'arrivalStation', label: 'Ben den' },
      { key: 'departureTime', label: 'Gio di', type: 'time' },
      { key: 'arrivalTime', label: 'Gio den', type: 'time' },
      { key: 'seatType', label: 'Loai ghe' },
      { key: 'netPrice', label: 'Gia NET', type: 'number' },
      { key: 'sellingPrice', label: 'Gia ban', type: 'number' },
    ],
  },
  other: {
    title: 'Nha cung cap chi phi khac',
    shortTitle: 'Chi phi khac',
    serviceTitle: 'Dich vu phat sinh',
    serviceNameLabel: 'Ten dich vu',
    serviceFields: [
      { key: 'unit', label: 'Don vi' },
      { key: 'netPrice', label: 'Gia NET', type: 'number' },
      { key: 'sellingPrice', label: 'Gia ban', type: 'number' },
      { key: 'description', label: 'Mo ta', type: 'textarea' },
    ],
  },
  villas: {
    title: 'Nha cung cap villas',
    shortTitle: 'Villas',
    serviceTitle: 'Villa / gia',
    serviceNameLabel: 'Ten villa',
    serviceFields: [
      { key: 'bedroomCount', label: 'So phong ngu', type: 'number' },
      { key: 'capacity', label: 'Suc chua', type: 'number' },
      { key: 'hasPool', label: 'Ho boi' },
      { key: 'hasBbq', label: 'BBQ' },
      { key: 'hasKitchen', label: 'Bep' },
      { key: 'checkinTime', label: 'Checkin', type: 'time' },
      { key: 'checkoutTime', label: 'Checkout', type: 'time' },
      { key: 'netPrice', label: 'Gia NET', type: 'number' },
      { key: 'sellingPrice', label: 'Gia ban', type: 'number' },
    ],
  },
  passport: {
    title: 'Nha cung cap visa / ho chieu',
    shortTitle: 'Visa',
    serviceTitle: 'Dich vu visa',
    serviceNameLabel: 'Loai ho so',
    serviceFields: [
      { key: 'country', label: 'Quoc gia' },
      { key: 'documentType', label: 'Loai dich vu' },
      { key: 'processingTime', label: 'Thoi gian xu ly' },
      { key: 'requiredDocuments', label: 'Ho so can co', type: 'textarea' },
      { key: 'netPrice', label: 'Gia NET', type: 'number' },
      { key: 'sellingPrice', label: 'Gia ban', type: 'number' },
    ],
  },
  guides: {
    title: 'Huong dan vien',
    shortTitle: 'Tour Guide',
    serviceTitle: 'Thong tin HDV',
    serviceNameLabel: 'Ho ten HDV',
    serviceFields: [
      { key: 'birthday', label: 'Ngay sinh', type: 'date' },
      { key: 'phone', label: 'Dien thoai' },
      { key: 'email', label: 'Email' },
      { key: 'idNumber', label: 'CCCD' },
      { key: 'guideCardNumber', label: 'The HDV' },
      { key: 'languages', label: 'Ngon ngu' },
      { key: 'regions', label: 'Khu vuc' },
      { key: 'dailyRate', label: 'Gia ngay', type: 'number' },
    ],
  },
  'series-tickets': {
    title: 'Series ve giu cho',
    shortTitle: 'Series ve',
    serviceTitle: 'Series ve',
    serviceNameLabel: 'Loai ve',
    serviceFields: [
      { key: 'seriesCode', label: 'Ma series' },
      { key: 'route', label: 'Hanh trinh' },
      { key: 'quantity', label: 'So luong', type: 'number' },
      { key: 'netPrice', label: 'Gia NET', type: 'number' },
      { key: 'depositDeadline', label: 'Han coc', type: 'date' },
      { key: 'nameDeadline', label: 'Han vao ten', type: 'date' },
      { key: 'fullPaymentDeadline', label: 'Han thanh toan', type: 'date' },
    ],
  },
};

type Contact = { fullName: string; position: string; birthday: string; phone: string; email: string };
type Service = { sku: string; serviceName: string; quantity: number; accountingPrice: number; netPrice: number; sellingPrice: number; description: string; note: string; metadata: Record<string, string | number> };
type Supplier = {
  id: string;
  supplierCode: string | null;
  name: string;
  taxCode: string | null;
  phone: string | null;
  email: string | null;
  province: string | null;
  address: string | null;
  website: string | null;
  link: string | null;
  rating: number | null;
  market: string | null;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  bankName: string | null;
  notes: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  contacts?: Contact[];
  supplierServices?: Array<Omit<Service, 'metadata'> & { metadata?: Record<string, string | number> | null }>;
};

const contactSchema = z.object({ fullName: z.string().default(''), position: z.string().default(''), birthday: z.string().default(''), phone: z.string().default(''), email: z.string().default('') });
const serviceSchema = z.object({
  sku: z.string().default(''),
  serviceName: z.string().default(''),
  quantity: z.coerce.number().default(1),
  accountingPrice: z.coerce.number().default(0),
  netPrice: z.coerce.number().default(0),
  sellingPrice: z.coerce.number().default(0),
  description: z.string().default(''),
  note: z.string().default(''),
  metadata: z.record(z.string(), z.union([z.string(), z.number()])).default({}),
});
const supplierSchema = z.object({
  supplierCode: z.string().min(2),
  name: z.string().min(2),
  taxCode: z.string().default(''),
  phone: z.string().min(6),
  email: z.string().email().or(z.literal('')).default(''),
  address: z.string().default(''),
  province: z.string().default(''),
  website: z.string().default(''),
  link: z.string().default(''),
  rating: z.coerce.number().default(0),
  market: z.string().default(''),
  bankAccountName: z.string().default(''),
  bankAccountNumber: z.string().default(''),
  bankName: z.string().default(''),
  notes: z.string().default(''),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
  contacts: z.array(contactSchema).default([]),
  services: z.array(serviceSchema).default([]),
});
type SupplierForm = z.infer<typeof supplierSchema>;
type ArrayName = 'contacts' | 'services';

const emptyContact: Contact = { fullName: '', position: '', birthday: '', phone: '', email: '' };
const emptyService: Service = { sku: '', serviceName: '', quantity: 1, accountingPrice: 0, netPrice: 0, sellingPrice: 0, description: '', note: '', metadata: {} };
const defaultValues: SupplierForm = {
  supplierCode: '',
  name: '',
  taxCode: '',
  phone: '',
  email: '',
  address: '',
  province: '',
  website: '',
  link: '',
  rating: 0,
  market: '',
  bankAccountName: '',
  bankAccountNumber: '',
  bankName: '',
  notes: '',
  status: 'ACTIVE',
  contacts: [emptyContact],
  services: [emptyService],
};

function browserApiBase() {
  const apiBase = process.env.NEXT_PUBLIC_API_URL || '';
  if (typeof window === 'undefined') return apiBase;
  if (apiBase.includes('smarttour-api-1')) return `http://${window.location.hostname}:4000`;
  return apiBase;
}

function dateOnly(value?: string | null) {
  return value ? value.slice(0, 10) : '';
}

function toForm(supplier: Supplier): SupplierForm {
  return {
    supplierCode: supplier.supplierCode || '',
    name: supplier.name || '',
    taxCode: supplier.taxCode || '',
    phone: supplier.phone || '',
    email: supplier.email || '',
    address: supplier.address || '',
    province: supplier.province || '',
    website: supplier.website || '',
    link: supplier.link || '',
    rating: supplier.rating || 0,
    market: supplier.market || '',
    bankAccountName: supplier.bankAccountName || '',
    bankAccountNumber: supplier.bankAccountNumber || '',
    bankName: supplier.bankName || '',
    notes: supplier.notes || '',
    status: supplier.status,
    contacts: supplier.contacts?.length
      ? supplier.contacts.map((item) => ({ fullName: item.fullName || '', position: item.position || '', birthday: dateOnly(item.birthday), phone: item.phone || '', email: item.email || '' }))
      : [emptyContact],
    services: supplier.supplierServices?.length
      ? supplier.supplierServices.map((item) => ({
          sku: item.sku || '',
          serviceName: item.serviceName || '',
          quantity: Number(item.quantity || 1),
          accountingPrice: Number(item.accountingPrice || 0),
          netPrice: Number(item.netPrice || 0),
          sellingPrice: Number(item.sellingPrice || 0),
          description: item.description || '',
          note: item.note || '',
          metadata: item.metadata || {},
        }))
      : [emptyService],
  };
}

export default function GenericSupplierClient({ type, config, initialSuppliers }: { type: SupplierType; config: SupplierConfig; initialSuppliers: Supplier[] }) {
  const { can, canAny } = usePermissions();
  const [suppliers, setSuppliers] = useState(initialSuppliers);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const { register, control, handleSubmit, reset, formState: { isSubmitting } } = useForm<SupplierForm>({
    resolver: zodResolver(supplierSchema) as any,
    defaultValues,
  });
  const contacts = useFieldArray({ control, name: 'contacts' });
  const services = useFieldArray({ control, name: 'services' });

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return suppliers;
    return suppliers.filter((item) => [item.supplierCode, item.name, item.taxCode, item.phone, item.email, item.province].filter(Boolean).some((value) => String(value).toLowerCase().includes(term)));
  }, [query, suppliers]);

  const columns = useMemo(() => {
    const helper = createColumnHelper<Supplier>();
    return [
      helper.display({ id: 'check', header: '', cell: () => <input type="checkbox" aria-label="select supplier" /> }),
      helper.display({ id: 'info', header: 'Thong tin', cell: ({ row }) => <div><strong>{row.original.supplierCode || '-'}</strong><br />{row.original.name}<br /><span className="mutedText">{row.original.taxCode || '-'}</span></div> }),
      helper.accessor('phone', { header: 'Dien thoai', cell: (info) => info.getValue() || '-' }),
      helper.accessor('email', { header: 'Email', cell: (info) => info.getValue() || '-' }),
      helper.accessor('province', { header: 'Tinh thanh', cell: (info) => info.getValue() || '-' }),
      helper.display({ id: 'count', header: 'So luong', cell: ({ row }) => row.original.supplierServices?.length || 0 }),
      helper.display({ id: 'debt', header: 'Cong no', cell: () => '0' }),
      helper.accessor('status', { header: 'Tinh trang', cell: (info) => <span className="statusPill">{info.getValue()}</span> }),
      helper.display({ id: 'actions', header: '', cell: ({ row }) => <button type="button" className="secondaryButton iconTextButton" onClick={() => startEdit(row.original)}><Pencil size={15} /> Sua</button> }),
    ];
  }, []);
  const table = useReactTable({ data: filtered, columns, getCoreRowModel: getCoreRowModel() });

  async function reload() {
    const response = await fetch(`${browserApiBase()}/api/suppliers/${type}`, { cache: 'no-store', headers: authHeaders() });
    if (response.ok) setSuppliers(await response.json());
  }

  async function onSubmit(values: SupplierForm) {
    const payload = {
      ...values,
      rating: values.rating || undefined,
      contacts: values.contacts.filter((item) => item.fullName.trim()),
      services: values.services.filter((item) => item.serviceName.trim()),
    };
    const response = await fetch(`${browserApiBase()}/api/suppliers/${type}${editingId ? `/${editingId}` : ''}`, {
      method: editingId ? 'PUT' : 'POST',
      headers: authJsonHeaders(),
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      setMessage('Khong luu duoc NCC. Kiem tra ma NCC va truong bat buoc.');
      return;
    }
    setMessage(editingId ? 'Da cap nhat NCC.' : 'Da tao NCC.');
    setEditingId(null);
    reset(defaultValues);
    await reload();
  }

  function startEdit(supplier: Supplier) {
    setEditingId(supplier.id);
    reset(toForm(supplier));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function closeForm() {
    setEditingId(null);
    setMessage('');
    reset(defaultValues);
  }

  return (
    <div className="hotelSupplierPage">
      <PermissionNotice allowed={canAny(['supplier.view', 'supplier.manage'])} label="xem va quan ly nha cung cap" />
      <form onSubmit={handleSubmit(onSubmit)} className="hotelSupplierForm">
        <section className="panel">
          <div className="sectionHeader">
            <h2>{editingId ? `Cap nhat ${config.shortTitle}` : `Tao ${config.shortTitle}`}</h2>
            <span>{message || 'Thong tin nha cung cap'}</span>
          </div>
          <div className="hotelFormGrid">
            <label>Ma NCC<input {...register('supplierCode')} /></label>
            <label>Ten NCC<input {...register('name')} /></label>
            <label>Ma so thue<input {...register('taxCode')} /></label>
            <label>Dien thoai<input {...register('phone')} /></label>
            <label>Email<input type="email" {...register('email')} /></label>
            <label>Tinh/Thanh<input {...register('province')} /></label>
            <label>Website<input {...register('website')} /></label>
            <label>Link<input {...register('link')} /></label>
            <label>Rating<input type="number" min="0" max="5" {...register('rating')} /></label>
            <label>Thi truong<input {...register('market')} /></label>
            <label>Trang thai<select {...register('status')}><option value="ACTIVE">ACTIVE</option><option value="INACTIVE">INACTIVE</option></select></label>
            <label>Ten tai khoan<input {...register('bankAccountName')} /></label>
            <label>So tai khoan<input {...register('bankAccountNumber')} /></label>
            <label>Ngan hang<input {...register('bankName')} /></label>
            <label className="span2">Dia chi<input {...register('address')} /></label>
            <label className="span2">Ghi chu<textarea rows={3} {...register('notes')} /></label>
            <label className="fileDrop"><FileUp size={18} /> File dinh kem se noi tiep vao module upload<input type="file" multiple /></label>
          </div>
        </section>

        <ContactRows register={register} fieldArray={contacts} />
        <ServiceRows config={config} register={register} fieldArray={services} />

        <div className="hotelFormActions">
          <button type="submit" disabled={isSubmitting || !can('supplier.manage')}><Save size={17} /> Luu</button>
          <button type="button" className="dangerButton" onClick={closeForm}><X size={17} /> Dong</button>
        </div>
      </form>

      <section className="panel listPanel">
        <div className="sectionHeader">
          <h2>Danh sach {config.shortTitle}</h2>
          <label className="searchBox"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tim ma, ten, SDT, email..." /></label>
        </div>
        <div className="fitTableWrap">
          <table className="fitTable hotelListTable">
            <thead>{table.getHeaderGroups().map((group) => <tr key={group.id}>{group.headers.map((header) => <th key={header.id}>{flexRender(header.column.columnDef.header, header.getContext())}</th>)}</tr>)}</thead>
            <tbody>
              {table.getRowModel().rows.map((row) => <tr key={row.id}>{row.getVisibleCells().map((cell) => <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}
              {filtered.length === 0 ? <tr><td colSpan={9}>Chua co du lieu.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function ContactRows({ register, fieldArray }: { register: UseFormRegister<SupplierForm>; fieldArray: UseFieldArrayReturn<SupplierForm, 'contacts', 'id'> }) {
  return (
    <DynamicRows
      title="Thong tin lien he"
      name="contacts"
      register={register}
      fieldArray={fieldArray}
      columns={[
        { key: 'fullName', label: 'Ho ten' },
        { key: 'position', label: 'Chuc vu' },
        { key: 'birthday', label: 'Ngay sinh', type: 'date' },
        { key: 'phone', label: 'Dien thoai' },
        { key: 'email', label: 'Email' },
      ]}
      emptyRow={emptyContact}
    />
  );
}

function ServiceRows({ config, register, fieldArray }: { config: SupplierConfig; register: UseFormRegister<SupplierForm>; fieldArray: UseFieldArrayReturn<SupplierForm, 'services', 'id'> }) {
  return (
    <DynamicRows
      title={config.serviceTitle}
      name="services"
      register={register}
      fieldArray={fieldArray}
      columns={[
        { key: 'sku', label: 'SKU' },
        { key: 'serviceName', label: config.serviceNameLabel },
        ...config.serviceFields,
        { key: 'note', label: 'Ghi chu' },
      ]}
      emptyRow={emptyService}
    />
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
  register: UseFormRegister<SupplierForm>;
  fieldArray: UseFieldArrayReturn<SupplierForm, T, 'id'>;
  columns: ServiceField[];
  emptyRow: Record<string, unknown>;
}) {
  const table = useReactTable({
    data: fieldArray.fields,
    columns: useMemo(() => {
      const helper = createColumnHelper<FieldArrayWithId<SupplierForm, T, 'id'>>();
      return [
        helper.display({ id: 'stt', header: 'STT', cell: ({ row }) => row.index + 1 }),
        ...columns.map((column) => helper.display({ id: column.key, header: column.label, cell: ({ row }) => <RowInput name={name} index={row.index} column={column} register={register} /> })),
        helper.display({ id: 'actions', header: '', cell: ({ row }) => <button type="button" className="dangerButton iconButton" onClick={() => fieldArray.remove(row.index)}><Trash2 size={15} /></button> }),
      ];
    }, [columns, fieldArray, name, register]),
    getCoreRowModel: getCoreRowModel(),
  });
  return (
    <section className="fitTableBlock">
      <div className="sectionHeader">
        <h2>{title}</h2>
        <button type="button" className="secondaryButton" onClick={() => fieldArray.append({ ...emptyRow } as any)}><Plus size={16} /> Them dong</button>
      </div>
      <div className="fitTableWrap">
        <table className="fitTable hotelDynamicTable">
          <thead>{table.getHeaderGroups().map((group) => <tr key={group.id}>{group.headers.map((header) => <th key={header.id}>{flexRender(header.column.columnDef.header, header.getContext())}</th>)}</tr>)}</thead>
          <tbody>{table.getRowModel().rows.map((row) => <tr key={row.id}>{row.getVisibleCells().map((cell) => <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </section>
  );
}

function RowInput<T extends ArrayName>({ name, index, column, register }: { name: T; index: number; column: ServiceField; register: UseFormRegister<SupplierForm> }) {
  const base = name === 'services' && !['sku', 'serviceName', 'quantity', 'accountingPrice', 'netPrice', 'sellingPrice', 'description', 'note'].includes(column.key)
    ? `services.${index}.metadata.${column.key}`
    : `${name}.${index}.${column.key}`;
  if (column.type === 'textarea') return <textarea rows={2} {...register(base as any)} />;
  return <input type={column.type || 'text'} {...register(base as any)} />;
}

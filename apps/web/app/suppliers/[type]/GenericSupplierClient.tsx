'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { FileUp, Pencil, Plus, Save, Search, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { FieldArrayWithId, useFieldArray, useForm, UseFieldArrayReturn, UseFormRegister } from 'react-hook-form';
import { z } from 'zod';

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
    title: 'Nhà cung cấp nhà hàng',
    shortTitle: 'Nhà hàng',
    serviceTitle: 'Danh mục thực đơn',
    serviceNameLabel: 'Tên menu',
    serviceFields: [
      { key: 'quantity', label: 'Số lượng', type: 'number' },
      { key: 'accountingPrice', label: 'Giá kế toán', type: 'number' },
      { key: 'netPrice', label: 'Giá NET', type: 'number' },
      { key: 'sellingPrice', label: 'Giá bán', type: 'number' },
      { key: 'description', label: 'Mô tả', type: 'textarea' },
    ],
  },
  flights: {
    title: 'Nhà cung cấp vé máy bay',
    shortTitle: 'Vé máy bay',
    serviceTitle: 'Chặng bay / mã vé',
    serviceNameLabel: 'Code vé',
    serviceFields: [
      { key: 'ticketType', label: 'Loại vé' },
      { key: 'route', label: 'Hành trình' },
      { key: 'departureAirport', label: 'Số hiệu chuyến bay đi' },
      { key: 'departureDate', label: 'Ngày đi', type: 'date' },
      { key: 'departureTime', label: 'Giờ đi', type: 'time' },
      { key: 'arrivalAirport', label: 'Số hiệu chuyến bay về' },
      { key: 'returnDate', label: 'Ngày về', type: 'date' },
      { key: 'returnTime', label: 'Giờ về', type: 'time' },
      { key: 'depositDeadline', label: 'Hạn cọc', type: 'datetime-local' },
      { key: 'nameDeadline', label: 'Hạn vào tên', type: 'datetime-local' },
      { key: 'fullpayDeadline', label: 'Hạn thanh toán đủ', type: 'datetime-local' },
      { key: 'netPrice', label: 'Giá NET', type: 'number' },
      { key: 'taxPrice', label: 'Thuế', type: 'number' },
      { key: 'airportFee', label: 'Phí sân bay', type: 'number' },
      { key: 'issueFee', label: 'Phí xuất vé', type: 'number' },
      { key: 'sellingPrice', label: 'Giá bán', type: 'number' },
      { key: 'commission', label: 'Hoa hồng', type: 'number' },
    ],
  },
  'attraction-tickets': {
    title: 'Nhà cung cấp vé tham quan',
    shortTitle: 'Vé tham quan',
    serviceTitle: 'Dịch vụ / vé tham quan',
    serviceNameLabel: 'Tên dịch vụ',
    serviceFields: [
      { key: 'quantity', label: 'Số lượng', type: 'number' },
      { key: 'accountingPrice', label: 'Giá kế toán', type: 'number' },
      { key: 'netPrice', label: 'Giá NET', type: 'number' },
      { key: 'sellingPrice', label: 'Giá bán', type: 'number' },
      { key: 'description', label: 'Mô tả', type: 'textarea' },
    ],
  },
  'landtour-suppliers': {
    title: 'Nhà cung cấp Landtour',
    shortTitle: 'Landtour',
    serviceTitle: 'Chương trình Landtour',
    serviceNameLabel: 'Tên tour',
    serviceFields: [
      { key: 'supplierTourCode', label: 'Mã tour nhà cung cấp' },
      { key: 'duration', label: 'Số ngày' },
      { key: 'departurePlace', label: 'Điểm đi' },
      { key: 'destinationPlace', label: 'Điểm đến' },
      { key: 'tourType', label: 'Loại tour' },
      { key: 'departureSchedule', label: 'Khởi hành' },
      { key: 'quantity', label: 'Số lượng tối thiểu', type: 'number' },
      { key: 'capacity', label: 'Sức chứa', type: 'number' },
      { key: 'accountingPrice', label: 'Giá kế toán', type: 'number' },
      { key: 'netPrice', label: 'Giá NET', type: 'number' },
      { key: 'sellingPrice', label: 'Giá bán', type: 'number' },
      { key: 'childPolicy', label: 'Chính sách trẻ em', type: 'textarea' },
      { key: 'cancelPolicy', label: 'Chính sách hủy', type: 'textarea' },
      { key: 'paymentPolicy', label: 'Thanh toán', type: 'textarea' },
    ],
  },
  water: {
    title: 'Nhà cung cấp nước suối',
    shortTitle: 'Nước suối',
    serviceTitle: 'Sản phẩm nước',
    serviceNameLabel: 'Tên sản phẩm',
    serviceFields: [
      { key: 'packageSize', label: 'Quy cách' },
      { key: 'unit', label: 'Đơn vị' },
      { key: 'netPrice', label: 'Giá NET', type: 'number' },
      { key: 'sellingPrice', label: 'Giá bán', type: 'number' },
      { key: 'description', label: 'Mô tả', type: 'textarea' },
    ],
  },
  transport: {
    title: 'Nhà cung cấp vận chuyển',
    shortTitle: 'Vận chuyển',
    serviceTitle: 'Dịch vụ xe',
    serviceNameLabel: 'Loại xe',
    serviceFields: [
      { key: 'licensePlate', label: 'Biển số' },
      { key: 'seatCapacity', label: 'Số chỗ', type: 'number' },
      { key: 'driverName', label: 'Tài xế' },
      { key: 'driverPhone', label: 'Số điện thoại tài xế' },
      { key: 'dailyPrice', label: 'Giá ngày', type: 'number' },
      { key: 'kmPrice', label: 'Giá km', type: 'number' },
      { key: 'overtimePrice', label: 'Quá giờ', type: 'number' },
      { key: 'fuelIncluded', label: 'Gồm xăng' },
    ],
  },
  bus: {
    title: 'Nhà xe tuyến cố định',
    shortTitle: 'Nhà xe',
    serviceTitle: 'Tuyến xe',
    serviceNameLabel: 'Tên tuyến',
    serviceFields: [
      { key: 'routeCode', label: 'Mã tuyến' },
      { key: 'departureStation', label: 'Bến đi' },
      { key: 'arrivalStation', label: 'Bến đến' },
      { key: 'departureTime', label: 'Giờ đi', type: 'time' },
      { key: 'arrivalTime', label: 'Giờ đến', type: 'time' },
      { key: 'seatType', label: 'Loại ghế' },
      { key: 'netPrice', label: 'Giá NET', type: 'number' },
      { key: 'sellingPrice', label: 'Giá bán', type: 'number' },
    ],
  },
  other: {
    title: 'Nhà cung cấp chi phí khác',
    shortTitle: 'Chi phí khác',
    serviceTitle: 'Dịch vụ phát sinh',
    serviceNameLabel: 'Tên dịch vụ',
    serviceFields: [
      { key: 'unit', label: 'Đơn vị' },
      { key: 'netPrice', label: 'Giá NET', type: 'number' },
      { key: 'sellingPrice', label: 'Giá bán', type: 'number' },
      { key: 'description', label: 'Mô tả', type: 'textarea' },
    ],
  },
  villas: {
    title: 'Nhà cung cấp villas',
    shortTitle: 'Villas',
    serviceTitle: 'Villa / giá',
    serviceNameLabel: 'Tên villa',
    serviceFields: [
      { key: 'bedroomCount', label: 'Số phòng ngủ', type: 'number' },
      { key: 'capacity', label: 'Sức chứa', type: 'number' },
      { key: 'hasPool', label: 'Hồ bơi' },
      { key: 'hasBbq', label: 'BBQ' },
      { key: 'hasKitchen', label: 'Bếp' },
      { key: 'checkinTime', label: 'Checkin', type: 'time' },
      { key: 'checkoutTime', label: 'Checkout', type: 'time' },
      { key: 'netPrice', label: 'Giá NET', type: 'number' },
      { key: 'sellingPrice', label: 'Giá bán', type: 'number' },
    ],
  },
  passport: {
    title: 'Nhà cung cấp visa / hộ chiếu',
    shortTitle: 'Visa',
    serviceTitle: 'Dịch vụ visa',
    serviceNameLabel: 'Loại hồ sơ',
    serviceFields: [
      { key: 'country', label: 'Quốc gia' },
      { key: 'documentType', label: 'Loại dịch vụ' },
      { key: 'processingTime', label: 'Thời gian xử lý' },
      { key: 'requiredDocuments', label: 'Hồ sơ cần có', type: 'textarea' },
      { key: 'netPrice', label: 'Giá NET', type: 'number' },
      { key: 'sellingPrice', label: 'Giá bán', type: 'number' },
    ],
  },
  guides: {
    title: 'Hướng dẫn viên',
    shortTitle: 'Tour Guide',
    serviceTitle: 'Thông tin hướng dẫn viên',
    serviceNameLabel: 'Họ tên hướng dẫn viên',
    serviceFields: [
      { key: 'birthday', label: 'Ngày sinh', type: 'date' },
      { key: 'phone', label: 'Điện thoại' },
      { key: 'email', label: 'Email' },
      { key: 'idNumber', label: 'CCCD' },
      { key: 'guideCardNumber', label: 'Thẻ hướng dẫn viên' },
      { key: 'languages', label: 'Ngôn ngữ' },
      { key: 'regions', label: 'Khu vực' },
      { key: 'dailyRate', label: 'Giá ngày', type: 'number' },
    ],
  },
  'series-tickets': {
    title: 'Series vé giữ chỗ',
    shortTitle: 'Series vé',
    serviceTitle: 'Series vé',
    serviceNameLabel: 'Loại vé',
    serviceFields: [
      { key: 'seriesCode', label: 'Mã series' },
      { key: 'route', label: 'Hành trình' },
      { key: 'quantity', label: 'Số lượng', type: 'number' },
      { key: 'netPrice', label: 'Giá NET', type: 'number' },
      { key: 'depositDeadline', label: 'Hạn cọc', type: 'date' },
      { key: 'nameDeadline', label: 'Hạn vào tên', type: 'date' },
      { key: 'fullPaymentDeadline', label: 'Hạn thanh toán', type: 'date' },
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
  const [suppliers, setSuppliers] = useState(initialSuppliers);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const [formOpen, setFormOpen] = useState(false);
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
      helper.display({ id: 'info', header: 'Thông tin', cell: ({ row }) => <div><strong>{row.original.supplierCode || '-'}</strong><br />{row.original.name}<br /><span className="mutedText">{row.original.taxCode || '-'}</span></div> }),
      helper.accessor('phone', { header: 'Điện thoại', cell: (info) => info.getValue() || '-' }),
      helper.accessor('email', { header: 'Email', cell: (info) => info.getValue() || '-' }),
      helper.accessor('province', { header: 'Tỉnh thành', cell: (info) => info.getValue() || '-' }),
      helper.display({ id: 'count', header: 'Số lượng', cell: ({ row }) => row.original.supplierServices?.length || 0 }),
      helper.display({ id: 'debt', header: 'Công nợ', cell: () => '0' }),
      helper.accessor('status', { header: 'Tình trạng', cell: (info) => <span className="statusPill">{info.getValue()}</span> }),
      helper.display({ id: 'actions', header: '', cell: ({ row }) => <button type="button" className="secondaryButton iconTextButton" onClick={() => startEdit(row.original)}><Pencil size={15} /> Sửa</button> }),
    ];
  }, []);
  const table = useReactTable({ data: filtered, columns, getCoreRowModel: getCoreRowModel() });

  async function reload() {
    const response = await fetch(`${browserApiBase()}/api/suppliers/${type}`, { cache: 'no-store' });
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
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      setMessage('Không lưu được nhà cung cấp. Kiểm tra mã nhà cung cấp và các trường bắt buộc.');
      return;
    }
    setMessage(editingId ? 'Đã cập nhật nhà cung cấp.' : 'Đã tạo nhà cung cấp.');
    setEditingId(null);
    setFormOpen(false);
    reset(defaultValues);
    await reload();
  }

  function startEdit(supplier: Supplier) {
    setEditingId(supplier.id);
    reset(toForm(supplier));
    setFormOpen(true);
  }

  function closeForm() {
    setEditingId(null);
    setFormOpen(false);
    setMessage('');
    reset(defaultValues);
  }

  function openCreate() {
    setEditingId(null);
    setMessage('');
    reset(defaultValues);
    setFormOpen(true);
  }

  return (
    <div className="hotelSupplierPage">
      {formOpen ? <div className="modalOverlay" role="dialog" aria-modal="true"><div className="modalPanel modalPanelWide"><form onSubmit={handleSubmit(onSubmit)} className="hotelSupplierForm">
        <section className="panel">
          <div className="sectionHeader">
            <h2>{editingId ? `Cập nhật ${config.shortTitle}` : `Tạo ${config.shortTitle}`}</h2>
            <span>{message || 'Thông tin nhà cung cấp'}</span>
          </div>
          <div className="hotelFormGrid">
            <label>Mã nhà cung cấp<input {...register('supplierCode')} /></label>
            <label>Tên nhà cung cấp<input {...register('name')} /></label>
            <label>Mã số thuế<input {...register('taxCode')} /></label>
            <label>Điện thoại<input {...register('phone')} /></label>
            <label>Email<input type="email" {...register('email')} /></label>
            <label>Tỉnh/Thành<input {...register('province')} /></label>
            <label>Website<input {...register('website')} /></label>
            <label>Link<input {...register('link')} /></label>
            <label>Rating<input type="number" min="0" max="5" {...register('rating')} /></label>
            <label>Thị trường<input {...register('market')} /></label>
            <label>Trạng thái<select {...register('status')}><option value="ACTIVE">ACTIVE</option><option value="INACTIVE">INACTIVE</option></select></label>
            <label>Tên tài khoản<input {...register('bankAccountName')} /></label>
            <label>Số tài khoản<input {...register('bankAccountNumber')} /></label>
            <label>Ngân hàng<input {...register('bankName')} /></label>
            <label className="span2">Địa chỉ<input {...register('address')} /></label>
            <label className="span2">Ghi chú<textarea rows={3} {...register('notes')} /></label>
            <label className="fileDrop"><FileUp size={18} /> File đính kèm sẽ nối tiếp vào module upload<input type="file" multiple /></label>
          </div>
        </section>

        <ContactRows register={register} fieldArray={contacts} />
        <ServiceRows config={config} register={register} fieldArray={services} />

        <div className="hotelFormActions">
          <button type="submit" disabled={isSubmitting}><Save size={17} /> Lưu</button>
          <button type="button" className="dangerButton" onClick={closeForm}><X size={17} /> Đóng</button>
        </div>
      </form></div></div> : null}

      <section className="panel listPanel">
        <div className="sectionHeader">
          <h2>Danh sách {config.shortTitle}</h2>
          <button type="button" className="secondaryButton iconTextButton" onClick={openCreate}><Plus size={16} /> Thêm mới</button>
          <label className="searchBox"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm mã, tên, số điện thoại, email..." /></label>
        </div>
        <div className="fitTableWrap">
          <table className="fitTable hotelListTable">
            <thead>{table.getHeaderGroups().map((group) => <tr key={group.id}>{group.headers.map((header) => <th key={header.id}>{flexRender(header.column.columnDef.header, header.getContext())}</th>)}</tr>)}</thead>
            <tbody>
              {table.getRowModel().rows.map((row) => <tr key={row.id}>{row.getVisibleCells().map((cell) => <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}
              {filtered.length === 0 ? <tr><td colSpan={9}>Chưa có dữ liệu.</td></tr> : null}
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
      title="Thông tin liên hệ"
      name="contacts"
      register={register}
      fieldArray={fieldArray}
      columns={[
        { key: 'fullName', label: 'Họ tên' },
        { key: 'position', label: 'Chức vụ' },
        { key: 'birthday', label: 'Ngày sinh', type: 'date' },
        { key: 'phone', label: 'Điện thoại' },
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
        { key: 'note', label: 'Ghi chú' },
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
        <button type="button" className="secondaryButton" onClick={() => fieldArray.append({ ...emptyRow } as any)}><Plus size={16} /> Thêm dòng</button>
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

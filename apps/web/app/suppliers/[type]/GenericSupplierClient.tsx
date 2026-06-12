'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { FileUp, Pencil, Plus, RefreshCcw, Save, Search, Trash2, X } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { FieldArrayWithId, useFieldArray, useForm, UseFieldArrayReturn, UseFormRegister } from 'react-hook-form';
import { z } from 'zod';
import { PermissionNotice, usePermissions } from '../../usePermissions';
import {
  SupplierFiles,
  SupplierNotice,
  SupplierNoticeBanner,
  SupplierStatus,
  supplierApi,
  uploadSupplierFiles,
} from '../SupplierClientUi';
import { SupplierFile } from '../uploadSupplierFiles';

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
export type SupplierConfig = { title: string; shortTitle: string; serviceTitle: string; serviceNameLabel: string; serviceFields: ServiceField[] };

const priceFields: ServiceField[] = [
  { key: 'accountingPrice', label: 'Giá kế toán', type: 'number' },
  { key: 'netPrice', label: 'Giá thuần (NET)', type: 'number' },
  { key: 'sellingPrice', label: 'Giá bán', type: 'number' },
];

export const supplierConfigs: Record<SupplierType, SupplierConfig> = {
  restaurants: {
    title: 'Nhà cung cấp nhà hàng',
    shortTitle: 'Nhà hàng',
    serviceTitle: 'Thực đơn và dịch vụ',
    serviceNameLabel: 'Tên thực đơn',
    serviceFields: [{ key: 'quantity', label: 'Số lượng', type: 'number' }, ...priceFields, { key: 'description', label: 'Mô tả', type: 'textarea' }],
  },
  flights: {
    title: 'Nhà cung cấp vé máy bay',
    shortTitle: 'Vé máy bay',
    serviceTitle: 'Chặng bay và mã vé',
    serviceNameLabel: 'Mã vé',
    serviceFields: [
      { key: 'ticketType', label: 'Loại vé' },
      { key: 'route', label: 'Hành trình' },
      { key: 'departureAirport', label: 'Chuyến bay đi' },
      { key: 'departureDate', label: 'Ngày đi', type: 'date' },
      { key: 'departureTime', label: 'Giờ đi', type: 'time' },
      { key: 'arrivalAirport', label: 'Chuyến bay về' },
      { key: 'returnDate', label: 'Ngày về', type: 'date' },
      { key: 'returnTime', label: 'Giờ về', type: 'time' },
      { key: 'depositDeadline', label: 'Hạn đặt cọc', type: 'datetime-local' },
      { key: 'nameDeadline', label: 'Hạn nhập tên', type: 'datetime-local' },
      { key: 'fullpayDeadline', label: 'Hạn thanh toán đủ', type: 'datetime-local' },
      { key: 'netPrice', label: 'Giá thuần (NET)', type: 'number' },
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
    serviceTitle: 'Dịch vụ và vé tham quan',
    serviceNameLabel: 'Tên dịch vụ',
    serviceFields: [{ key: 'quantity', label: 'Số lượng', type: 'number' }, ...priceFields, { key: 'description', label: 'Mô tả', type: 'textarea' }],
  },
  'landtour-suppliers': {
    title: 'Nhà cung cấp Land Tour',
    shortTitle: 'Land Tour',
    serviceTitle: 'Chương trình Land Tour',
    serviceNameLabel: 'Tên tour',
    serviceFields: [
      { key: 'supplierTourCode', label: 'Mã tour nhà cung cấp' },
      { key: 'duration', label: 'Thời lượng' },
      { key: 'departurePlace', label: 'Điểm đi' },
      { key: 'destinationPlace', label: 'Điểm đến' },
      { key: 'tourType', label: 'Loại tour' },
      { key: 'departureSchedule', label: 'Lịch khởi hành' },
      { key: 'quantity', label: 'Số lượng tối thiểu', type: 'number' },
      { key: 'capacity', label: 'Sức chứa', type: 'number' },
      ...priceFields,
      { key: 'childPolicy', label: 'Chính sách trẻ em', type: 'textarea' },
      { key: 'cancelPolicy', label: 'Chính sách hủy', type: 'textarea' },
      { key: 'paymentPolicy', label: 'Chính sách thanh toán', type: 'textarea' },
    ],
  },
  water: {
    title: 'Nhà cung cấp nước uống',
    shortTitle: 'Nước uống',
    serviceTitle: 'Sản phẩm nước uống',
    serviceNameLabel: 'Tên sản phẩm',
    serviceFields: [
      { key: 'packageSize', label: 'Quy cách đóng gói' },
      { key: 'unit', label: 'Đơn vị tính' },
      { key: 'netPrice', label: 'Giá thuần (NET)', type: 'number' },
      { key: 'sellingPrice', label: 'Giá bán', type: 'number' },
      { key: 'description', label: 'Mô tả', type: 'textarea' },
    ],
  },
  transport: {
    title: 'Nhà cung cấp vận chuyển',
    shortTitle: 'Vận chuyển',
    serviceTitle: 'Phương tiện và dịch vụ',
    serviceNameLabel: 'Loại xe',
    serviceFields: [
      { key: 'licensePlate', label: 'Biển số xe' },
      { key: 'seatCapacity', label: 'Số chỗ', type: 'number' },
      { key: 'driverName', label: 'Tài xế' },
      { key: 'driverPhone', label: 'Điện thoại tài xế' },
      { key: 'dailyPrice', label: 'Giá theo ngày', type: 'number' },
      { key: 'kmPrice', label: 'Giá theo km', type: 'number' },
      { key: 'overtimePrice', label: 'Phí quá giờ', type: 'number' },
      { key: 'fuelIncluded', label: 'Đã gồm nhiên liệu' },
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
      { key: 'netPrice', label: 'Giá thuần (NET)', type: 'number' },
      { key: 'sellingPrice', label: 'Giá bán', type: 'number' },
    ],
  },
  other: {
    title: 'Nhà cung cấp chi phí khác',
    shortTitle: 'Chi phí khác',
    serviceTitle: 'Dịch vụ phát sinh',
    serviceNameLabel: 'Tên dịch vụ',
    serviceFields: [
      { key: 'unit', label: 'Đơn vị tính' },
      { key: 'netPrice', label: 'Giá thuần (NET)', type: 'number' },
      { key: 'sellingPrice', label: 'Giá bán', type: 'number' },
      { key: 'description', label: 'Mô tả', type: 'textarea' },
    ],
  },
  villas: {
    title: 'Nhà cung cấp biệt thự',
    shortTitle: 'Biệt thự',
    serviceTitle: 'Biệt thự và giá',
    serviceNameLabel: 'Tên biệt thự',
    serviceFields: [
      { key: 'bedroomCount', label: 'Số phòng ngủ', type: 'number' },
      { key: 'capacity', label: 'Sức chứa', type: 'number' },
      { key: 'hasPool', label: 'Hồ bơi' },
      { key: 'hasBbq', label: 'Khu nướng BBQ' },
      { key: 'hasKitchen', label: 'Bếp' },
      { key: 'checkinTime', label: 'Giờ nhận phòng', type: 'time' },
      { key: 'checkoutTime', label: 'Giờ trả phòng', type: 'time' },
      { key: 'netPrice', label: 'Giá thuần (NET)', type: 'number' },
      { key: 'sellingPrice', label: 'Giá bán', type: 'number' },
    ],
  },
  passport: {
    title: 'Nhà cung cấp visa và hộ chiếu',
    shortTitle: 'Visa và hộ chiếu',
    serviceTitle: 'Dịch vụ visa và hộ chiếu',
    serviceNameLabel: 'Loại hồ sơ',
    serviceFields: [
      { key: 'country', label: 'Quốc gia' },
      { key: 'documentType', label: 'Loại dịch vụ' },
      { key: 'processingTime', label: 'Thời gian xử lý' },
      { key: 'requiredDocuments', label: 'Hồ sơ cần chuẩn bị', type: 'textarea' },
      { key: 'netPrice', label: 'Giá thuần (NET)', type: 'number' },
      { key: 'sellingPrice', label: 'Giá bán', type: 'number' },
    ],
  },
  guides: {
    title: 'Hướng dẫn viên',
    shortTitle: 'Hướng dẫn viên',
    serviceTitle: 'Thông tin hướng dẫn viên',
    serviceNameLabel: 'Họ tên hướng dẫn viên',
    serviceFields: [
      { key: 'birthday', label: 'Ngày sinh', type: 'date' },
      { key: 'phone', label: 'Điện thoại' },
      { key: 'email', label: 'Email' },
      { key: 'idNumber', label: 'Căn cước công dân' },
      { key: 'guideCardNumber', label: 'Số thẻ hướng dẫn viên' },
      { key: 'languages', label: 'Ngôn ngữ' },
      { key: 'regions', label: 'Khu vực hoạt động' },
      { key: 'dailyRate', label: 'Giá theo ngày', type: 'number' },
    ],
  },
  'series-tickets': {
    title: 'Vé series giữ chỗ',
    shortTitle: 'Vé series',
    serviceTitle: 'Danh sách vé series',
    serviceNameLabel: 'Loại vé',
    serviceFields: [
      { key: 'seriesCode', label: 'Mã series' },
      { key: 'route', label: 'Hành trình' },
      { key: 'quantity', label: 'Số lượng', type: 'number' },
      { key: 'netPrice', label: 'Giá thuần (NET)', type: 'number' },
      { key: 'depositDeadline', label: 'Hạn đặt cọc', type: 'date' },
      { key: 'nameDeadline', label: 'Hạn nhập tên', type: 'date' },
      { key: 'fullPaymentDeadline', label: 'Hạn thanh toán', type: 'date' },
    ],
  },
};

type Contact = { fullName: string; position: string; birthday: string; phone: string; email: string };
type Service = {
  sku: string;
  serviceName: string;
  quantity: number;
  accountingPrice: number;
  netPrice: number;
  sellingPrice: number;
  description: string;
  note: string;
  metadata: Record<string, string | number>;
};
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
  files?: SupplierFile[];
};
type Filters = { search: string; status: string; province: string; market: string };

const contactSchema = z.object({
  fullName: z.string().default(''),
  position: z.string().default(''),
  birthday: z.string().default(''),
  phone: z.string().default(''),
  email: z.string().email('Email người liên hệ không hợp lệ').or(z.literal('')).default(''),
});
const serviceSchema = z.object({
  sku: z.string().default(''),
  serviceName: z.string().default(''),
  quantity: z.coerce.number().min(0, 'Số lượng không được âm').default(1),
  accountingPrice: z.coerce.number().min(0, 'Giá kế toán không được âm').default(0),
  netPrice: z.coerce.number().min(0, 'Giá thuần không được âm').default(0),
  sellingPrice: z.coerce.number().min(0, 'Giá bán không được âm').default(0),
  description: z.string().default(''),
  note: z.string().default(''),
  metadata: z.record(z.string(), z.union([z.string(), z.number()])).default({}),
});
const supplierSchema = z.object({
  supplierCode: z.string().min(2, 'Mã nhà cung cấp phải có ít nhất 2 ký tự'),
  name: z.string().min(2, 'Tên nhà cung cấp phải có ít nhất 2 ký tự'),
  taxCode: z.string().default(''),
  phone: z.string().min(6, 'Số điện thoại phải có ít nhất 6 chữ số'),
  email: z.string().email('Email nhà cung cấp không hợp lệ').or(z.literal('')).default(''),
  address: z.string().default(''),
  province: z.string().default(''),
  website: z.string().default(''),
  link: z.string().default(''),
  rating: z.coerce.number().min(0).max(5).default(0),
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
const defaultFilters: Filters = { search: '', status: '', province: '', market: '' };

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

export default function GenericSupplierClient({
  type,
  initialSuppliers,
  initialError = '',
}: {
  type: SupplierType;
  initialSuppliers: Supplier[];
  initialError?: string;
}) {
  const config = supplierConfigs[type];
  const { can } = usePermissions();
  const canManage = can('supplier.manage');
  const canView = can('supplier.view');
  const [suppliers, setSuppliers] = useState(initialSuppliers);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filters, setFilters] = useState(defaultFilters);
  const [notice, setNotice] = useState<SupplierNotice | null>(initialError ? { type: 'error', text: initialError } : null);
  const [formOpen, setFormOpen] = useState(false);
  const [files, setFiles] = useState<SupplierFile[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [busyAction, setBusyAction] = useState('');
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SupplierForm>({ resolver: zodResolver(supplierSchema) as any, defaultValues });
  const contacts = useFieldArray({ control, name: 'contacts' });
  const services = useFieldArray({ control, name: 'services' });

  useEffect(() => setSuppliers(initialSuppliers), [initialSuppliers]);

  const columns = useMemo(() => {
    const helper = createColumnHelper<Supplier>();
    return [
      helper.display({
        id: 'supplier',
        header: 'Nhà cung cấp',
        cell: ({ row }) => <div className="supplierPrimaryCell"><strong>{row.original.name}</strong><span>{row.original.supplierCode || 'Chưa có mã'}</span></div>,
      }),
      helper.display({
        id: 'contact',
        header: 'Liên hệ',
        cell: ({ row }) => <div className="supplierPrimaryCell"><span>{row.original.phone || 'Chưa có số điện thoại'}</span><span>{row.original.email || 'Chưa có email'}</span></div>,
      }),
      helper.accessor('province', { header: 'Tỉnh/thành', cell: (info) => info.getValue() || '—' }),
      helper.display({ id: 'market', header: 'Thị trường', cell: ({ row }) => row.original.market || '—' }),
      helper.display({ id: 'services', header: 'Dịch vụ', cell: ({ row }) => row.original.supplierServices?.length || 0 }),
      helper.accessor('status', { header: 'Trạng thái', cell: (info) => <SupplierStatus status={info.getValue()} /> }),
      helper.display({
        id: 'actions',
        header: 'Thao tác',
        cell: ({ row }) => (
          <div className="rowActions">
            <button type="button" className="secondaryButton iconButton" disabled={!canManage || Boolean(busyAction)} onClick={() => void startEdit(row.original)} title="Sửa nhà cung cấp" aria-label="Sửa nhà cung cấp">
              <Pencil size={15} />
            </button>
            <button type="button" className="dangerButton iconButton" disabled={!canManage || Boolean(busyAction)} onClick={() => void deleteSupplier(row.original)} title="Xóa nhà cung cấp" aria-label="Xóa nhà cung cấp">
              <Trash2 size={15} />
            </button>
          </div>
        ),
      }),
    ];
  }, [busyAction, canManage]);
  const table = useReactTable({ data: suppliers, columns, getCoreRowModel: getCoreRowModel() });

  async function load(nextFilters = filters, emitSuccess = false) {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (nextFilters.search.trim()) params.set('search', nextFilters.search.trim());
      if (nextFilters.status) params.set('status', nextFilters.status);
      if (nextFilters.province.trim()) params.set('province', nextFilters.province.trim());
      if (nextFilters.market.trim()) params.set('market', nextFilters.market.trim());
      const rows = await supplierApi<Supplier[]>(`/api/suppliers/${type}${params.size ? `?${params}` : ''}`, {}, `Tải danh sách ${config.shortTitle.toLowerCase()}`);
      setSuppliers(rows);
      if (emitSuccess) setNotice({ type: 'success', text: 'Đã tải lại danh sách nhà cung cấp.' });
      return true;
    } catch (error) {
      setNotice({ type: 'error', text: errorText(error, 'Không tải được danh sách nhà cung cấp.') });
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

  async function onSubmit(values: SupplierForm) {
    setNotice(null);
    const payload = {
      ...values,
      rating: values.rating || undefined,
      contacts: values.contacts.filter((item) => item.fullName.trim()),
      services: values.services.filter((item) => item.serviceName.trim()),
    };
    let saved: Supplier;
    try {
      saved = await supplierApi<Supplier>(
        `/api/suppliers/${type}${editingId ? `/${editingId}` : ''}`,
        { method: editingId ? 'PUT' : 'POST', body: JSON.stringify(payload) },
        editingId ? 'Cập nhật nhà cung cấp' : 'Tạo nhà cung cấp',
      );
    } catch (error) {
      setNotice({ type: 'error', text: errorText(error, 'Không lưu được nhà cung cấp.') });
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
    setNotice({ type: 'success', text: `Đã ${action} ${config.shortTitle.toLowerCase()}${pendingFiles.length ? ` và tải lên ${pendingFiles.length} file` : ''}.` });
  }

  async function startEdit(supplier: Supplier) {
    setBusyAction(`edit:${supplier.id}`);
    setNotice(null);
    try {
      const detail = await supplierApi<Supplier>(`/api/suppliers/${type}/${supplier.id}`, {}, 'Tải thông tin nhà cung cấp');
      setEditingId(detail.id);
      setFiles(detail.files || []);
      setPendingFiles([]);
      reset(toForm(detail));
      setFormOpen(true);
    } catch (error) {
      setNotice({ type: 'error', text: errorText(error, 'Không tải được thông tin nhà cung cấp.') });
    } finally {
      setBusyAction('');
    }
  }

  async function deleteSupplier(supplier: Supplier) {
    if (!window.confirm(`Xóa nhà cung cấp "${supplier.name}"? Hệ thống sẽ từ chối nếu nhà cung cấp đang được dùng trong đơn hàng, điều hành, tài chính hoặc yêu cầu thanh toán.`)) return;
    setBusyAction(`delete:${supplier.id}`);
    setNotice(null);
    try {
      await supplierApi(`/api/suppliers/${type}/${supplier.id}`, { method: 'DELETE' }, 'Xóa nhà cung cấp');
      await load(filters);
      setNotice({ type: 'success', text: `Đã xóa nhà cung cấp "${supplier.name}".` });
    } catch (error) {
      setNotice({ type: 'error', text: errorText(error, 'Không xóa được nhà cung cấp.') });
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
      <PermissionNotice allowed={canView} label="xem nhà cung cấp" missingPermissions={['supplier.view']} />
      {canView ? (
        <>
          <SupplierNoticeBanner notice={notice} />

          <section className="panel supplierFilterPanel">
            <form className="supplierFilters" onSubmit={submitFilters}>
              <label className="searchBox">
                <Search size={16} />
                <input value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} placeholder="Tìm theo mã, tên, mã số thuế, điện thoại hoặc email..." />
              </label>
              <label>Trạng thái
                <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
                  <option value="">Tất cả trạng thái</option>
                  <option value="ACTIVE">Đang hoạt động</option>
                  <option value="INACTIVE">Ngừng hoạt động</option>
                </select>
              </label>
              <label>Tỉnh/thành<input value={filters.province} onChange={(event) => setFilters((current) => ({ ...current, province: event.target.value }))} /></label>
              <label>Thị trường<input value={filters.market} onChange={(event) => setFilters((current) => ({ ...current, market: event.target.value }))} /></label>
              <button type="submit" disabled={isLoading}><Search size={16} /> Lọc danh sách</button>
              <button type="button" className="secondaryButton iconButton" onClick={resetFilters} disabled={isLoading} title="Xóa bộ lọc" aria-label="Xóa bộ lọc"><RefreshCcw size={16} /></button>
            </form>
          </section>

          <section className="panel listPanel">
            <div className="sectionHeader">
              <div><h2>Danh sách {config.shortTitle.toLowerCase()}</h2><span>{isLoading ? 'Đang tải dữ liệu...' : `${suppliers.length} nhà cung cấp`}</span></div>
              <div className="sectionActions">
                <a className="secondaryButton iconTextButton" href="/suppliers">Quản lý loại nhà cung cấp</a>
                <button type="button" className="secondaryButton iconButton" onClick={() => void load(filters, true)} disabled={isLoading} title="Tải lại" aria-label="Tải lại"><RefreshCcw size={16} /></button>
                <button type="button" className="iconTextButton" onClick={openCreate} disabled={!canManage}><Plus size={16} /> Thêm nhà cung cấp</button>
              </div>
            </div>
            <div className="fitTableWrap">
              <table className="fitTable hotelListTable">
                <thead>{table.getHeaderGroups().map((group) => <tr key={group.id}>{group.headers.map((header) => <th key={header.id}>{flexRender(header.column.columnDef.header, header.getContext())}</th>)}</tr>)}</thead>
                <tbody>
                  {table.getRowModel().rows.map((row) => <tr key={row.id}>{row.getVisibleCells().map((cell) => <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}
                  {!isLoading && suppliers.length === 0 ? <tr><td colSpan={7} className="tableEmptyState">Không tìm thấy nhà cung cấp phù hợp với bộ lọc hiện tại.</td></tr> : null}
                  {isLoading ? <tr><td colSpan={7} className="tableEmptyState">Đang tải danh sách nhà cung cấp...</td></tr> : null}
                </tbody>
              </table>
            </div>
          </section>

          {formOpen ? (
            <div className="modalOverlay" role="dialog" aria-modal="true" aria-label={editingId ? 'Cập nhật nhà cung cấp' : 'Tạo nhà cung cấp'}>
              <div className="modalPanel modalPanelWide">
                <form onSubmit={handleSubmit(onSubmit)} className="hotelSupplierForm">
                  <header><h2>{editingId ? `Cập nhật ${config.shortTitle.toLowerCase()}` : `Thêm ${config.shortTitle.toLowerCase()}`}</h2><button type="button" className="secondaryButton iconButton" onClick={() => closeForm()} aria-label="Đóng"><X size={16} /></button></header>
                  <fieldset>
                    <legend>Thông tin nhà cung cấp</legend>
                    <div className="hotelFormGrid">
                      <label>Mã nhà cung cấp<input {...register('supplierCode')} /></label>
                      <label>Tên nhà cung cấp<input {...register('name')} /></label>
                      <label>Mã số thuế<input {...register('taxCode')} /></label>
                      <label>Số điện thoại<input {...register('phone')} /></label>
                      <label>Email<input type="email" {...register('email')} /></label>
                      <label>Tỉnh/thành<input {...register('province')} /></label>
                      <label>Thị trường<input {...register('market')} /></label>
                      <label>Xếp hạng<input type="number" min="0" max="5" {...register('rating')} /></label>
                      <label>Trạng thái<select {...register('status')}><option value="ACTIVE">Đang hoạt động</option><option value="INACTIVE">Ngừng hoạt động</option></select></label>
                      <label>Website<input {...register('website')} /></label>
                      <label>Liên kết tham khảo<input {...register('link')} /></label>
                      <label className="span2">Địa chỉ<input {...register('address')} /></label>
                    </div>
                  </fieldset>

                  <fieldset>
                    <legend>Thông tin thanh toán và ghi chú</legend>
                    <div className="hotelFormGrid">
                      <label>Tên tài khoản<input {...register('bankAccountName')} /></label>
                      <label>Số tài khoản<input {...register('bankAccountNumber')} /></label>
                      <label>Ngân hàng<input {...register('bankName')} /></label>
                      <label className="span2">Ghi chú nội bộ<textarea rows={3} {...register('notes')} /></label>
                    </div>
                  </fieldset>

                  <ContactRows register={register} fieldArray={contacts} />
                  <ServiceRows config={config} register={register} fieldArray={services} />

                  <fieldset>
                    <legend>File đính kèm</legend>
                    {editingId ? <SupplierFiles files={files} busy={Boolean(busyAction)} canManage={canManage} onDelete={(file) => void deleteFile(file)} /> : <p className="mutedText">File sẽ được tải lên sau khi nhà cung cấp được tạo thành công.</p>}
                    <label className="fileDrop"><FileUp size={18} /> Chọn file cần tải lên<input type="file" multiple onChange={(event) => setPendingFiles(Array.from(event.target.files || []))} /></label>
                    {pendingFiles.length ? <p className="mutedText">Đã chọn {pendingFiles.length} file: {pendingFiles.map((file) => file.name).join(', ')}</p> : null}
                  </fieldset>

                  <ErrorLine errors={[errors.supplierCode?.message, errors.name?.message, errors.phone?.message, errors.email?.message, errors.rating?.message]} />
                  <div className="modalActions">
                    <button type="button" className="secondaryButton" onClick={() => closeForm()}>Hủy</button>
                    <button type="submit" disabled={!canManage || isSubmitting || Boolean(busyAction)}><Save size={17} /> {isSubmitting ? 'Đang lưu...' : editingId ? 'Lưu thay đổi' : 'Tạo nhà cung cấp'}</button>
                  </div>
                </form>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function ContactRows({ register, fieldArray }: { register: UseFormRegister<SupplierForm>; fieldArray: UseFieldArrayReturn<SupplierForm, 'contacts', 'id'> }) {
  return (
    <DynamicRows
      title="Người liên hệ"
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
        { key: 'sku', label: 'Mã dịch vụ' },
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
        helper.display({
          id: 'actions',
          header: '',
          cell: ({ row }) => <button type="button" className="dangerButton iconButton" onClick={() => fieldArray.remove(row.index)} aria-label="Xóa dòng" title="Xóa dòng"><Trash2 size={15} /></button>,
        }),
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

function RowInput<T extends ArrayName>({ name, index, column, register }: { name: T; index: number; column: ServiceField; register: UseFormRegister<SupplierForm> }) {
  const base = name === 'services' && !['sku', 'serviceName', 'quantity', 'accountingPrice', 'netPrice', 'sellingPrice', 'description', 'note'].includes(column.key)
    ? `services.${index}.metadata.${column.key}`
    : `${name}.${index}.${column.key}`;
  if (column.type === 'textarea') return <textarea rows={2} {...register(base as any)} />;
  return <input type={column.type || 'text'} {...register(base as any)} />;
}

function ErrorLine({ errors }: { errors: Array<string | undefined> }) {
  const messages = errors.filter(Boolean);
  return messages.length ? <p className="formErrors">{messages.join(' | ')}</p> : null;
}

function errorText(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

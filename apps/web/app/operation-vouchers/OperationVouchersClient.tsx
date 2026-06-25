'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { CreditCard, Loader2, Pencil, Plus, RefreshCcw, Save, Search, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { PermissionNotice, usePermissions } from '../usePermissions';

type VoucherSummary = {
  id: string;
  voucherCode: string;
  supplierName: string | null;
  serviceType: string;
  serviceName: string;
  serviceDate: string;
  totalAmount: string;
  paidAmount: string;
  remainAmount: string;
  paymentDeadline: string | null;
  status: string;
};

type Message = { kind: 'success' | 'error' | 'info'; text: string };

const detailSchema = z.object({
  sku: z.string().default(''),
  serviceName: z.string().default(''),
  quantity: z.coerce.number().min(0.01, 'S\u1ed1 l\u01b0\u1ee3ng ph\u1ea3i l\u1edbn h\u01a1n 0').default(1),
  unit: z.string().default(''),
  netPrice: z.coerce.number().min(0, 'Gi\u00e1 NET kh\u00f4ng \u0111\u01b0\u1ee3c \u00e2m').default(0),
  vat: z.coerce.number().min(0, 'VAT kh\u00f4ng \u0111\u01b0\u1ee3c \u00e2m').max(100, 'VAT kh\u00f4ng \u0111\u01b0\u1ee3c v\u01b0\u1ee3t qu\u00e1 100%').default(0),
  note: z.string().default(''),
});

const voucherSchema = z.object({
  voucherCode: z.string().min(2),
  tourId: z.string().default(''),
  bookingId: z.string().default(''),
  orderId: z.string().default(''),
  supplierId: z.string().default(''),
  supplierName: z.string().default(''),
  serviceType: z.string().min(2),
  serviceName: z.string().min(2),
  serviceDate: z.string().min(1),
  paymentDeadline: z.string().default(''),
  note: z.string().default(''),
  createdBy: z.string().default('Operator'),
  details: z.array(detailSchema).default([]),
  paymentAmount: z.coerce.number().min(0, 'S\u1ed1 ti\u1ec1n thanh to\u00e1n kh\u00f4ng \u0111\u01b0\u1ee3c \u00e2m').default(0),
});

type VoucherForm = z.infer<typeof voucherSchema>;
type DetailRow = VoucherForm['details'][number];

const emptyDetail: DetailRow = { sku: '', serviceName: '', quantity: 1, unit: '', netPrice: 0, vat: 0, note: '' };

function browserApiBase() {
  const apiBase = process.env.NEXT_PUBLIC_API_URL || '';
  if (typeof window === 'undefined') return apiBase;
  if (apiBase.includes('smarttour-api-1')) return `http://${window.location.hostname}:4000`;
  return apiBase;
}

function newVoucherCode() {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 4).toUpperCase()
      : Math.random().toString(36).slice(2, 6).toUpperCase();
  return `PDH-${timestamp}-${random}`;
}

function newVoucherDefaults(): VoucherForm {
  return {
    voucherCode: newVoucherCode(),
    tourId: '',
    bookingId: '',
    orderId: '',
    supplierId: '',
    supplierName: '',
    serviceType: 'Khách sạn',
    serviceName: '',
    serviceDate: '',
    paymentDeadline: '',
    note: '',
    createdBy: 'Operator',
    details: [{ ...emptyDetail }],
    paymentAmount: 0,
  };
}

function text(value: unknown) {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function cleanText(value: unknown) {
  return text(value).trim();
}

function optionalText(value: unknown) {
  const cleaned = cleanText(value);
  return cleaned || undefined;
}

function numberOrZero(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function numberOrDefault(value: unknown, fallback: number) {
  if (value === '' || value == null) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function money(value: unknown) {
  return Number(value || 0).toLocaleString('vi-VN');
}

function dateOnly(value?: string | null) {
  return value ? value.slice(0, 10) : '';
}

function normalizeSearch(value: unknown) {
  return text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase();
}

function hasDetailValue(item: Partial<DetailRow>) {
  return ['sku', 'serviceName', 'unit', 'note'].some((key) => cleanText((item as any)[key])) || numberOrZero(item.netPrice) > 0 || numberOrZero(item.vat) > 0;
}

function lineAmount(item: Partial<DetailRow>) {
  const quantity = numberOrDefault(item.quantity, 1);
  const netPrice = numberOrZero(item.netPrice);
  const vatPercent = numberOrZero(item.vat);
  return quantity * netPrice * (1 + vatPercent / 100);
}

async function responseMessage(response: Response, fallback: string) {
  try {
    const body = await response.json();
    const raw = Array.isArray(body?.message) ? body.message.join('; ') : body?.message || body?.error;
    return raw ? `${fallback}: ${raw}` : fallback;
  } catch {
    return fallback;
  }
}

function voucherStatusLabel(status: string) {
  if (status === 'PENDING') return 'Chờ thanh toán';
  if (status === 'PARTIAL') return 'Thanh toán một phần';
  if (status === 'PAID') return 'Đã thanh toán';
  if (status === 'CANCELLED') return 'Đã hủy';
  return status || 'Chưa rõ';
}

function statusClass(status: string) {
  if (status === 'PAID') return 'statusPill statusPillSuccess';
  if (status === 'PARTIAL') return 'statusPill statusPillWarning';
  if (status === 'CANCELLED') return 'statusPill statusPillNeutral';
  return 'statusPill';
}

function messageClass(message: Message) {
  if (message.kind === 'success') return 'statusPill statusPillSuccess';
  if (message.kind === 'error') return 'statusPill statusPillWarning';
  return 'statusPill statusPillNeutral';
}

function confirmVoucherPayment(amount: number) {
  if (typeof window === 'undefined') return true;
  return window.confirm(`X\u00e1c nh\u1eadn ghi nh\u1eadn thanh to\u00e1n ${money(amount)} cho phi\u1ebfu \u0111i\u1ec1u h\u00e0nh? H\u00e0nh \u0111\u1ed9ng n\u00e0y s\u1ebd c\u1eadp nh\u1eadt c\u00f4ng n\u1ee3 nh\u00e0 cung c\u1ea5p.`);
}

function mapVoucherToForm(voucher: any): VoucherForm {
  const details = Array.isArray(voucher?.details)
    ? voucher.details.map((item: any) => ({
      sku: text(item?.sku),
      serviceName: text(item?.serviceName),
      quantity: numberOrDefault(item?.quantity, 1),
      unit: text(item?.unit),
      netPrice: numberOrZero(item?.netPrice),
      vat: numberOrZero(item?.vat),
      note: text(item?.note),
    })).filter(hasDetailValue)
    : [];

  return {
    ...newVoucherDefaults(),
    voucherCode: text(voucher?.voucherCode) || newVoucherCode(),
    tourId: text(voucher?.tourId),
    bookingId: text(voucher?.bookingId),
    orderId: text(voucher?.orderId),
    supplierId: text(voucher?.supplierId),
    supplierName: text(voucher?.supplierName),
    serviceType: text(voucher?.serviceType) || 'Khách sạn',
    serviceName: text(voucher?.serviceName),
    serviceDate: dateOnly(voucher?.serviceDate),
    paymentDeadline: dateOnly(voucher?.paymentDeadline),
    note: text(voucher?.note),
    createdBy: text(voucher?.createdBy) || 'Operator',
    details: details.length ? details : [{ ...emptyDetail }],
    paymentAmount: 0,
  };
}

function mapVoucherToSummary(voucher: any): VoucherSummary {
  return {
    id: text(voucher?.id),
    voucherCode: text(voucher?.voucherCode),
    supplierName: text(voucher?.supplierName) || null,
    serviceType: text(voucher?.serviceType),
    serviceName: text(voucher?.serviceName),
    serviceDate: text(voucher?.serviceDate),
    totalAmount: text(voucher?.totalAmount || 0),
    paidAmount: text(voucher?.paidAmount || 0),
    remainAmount: text(voucher?.remainAmount || 0),
    paymentDeadline: text(voucher?.paymentDeadline) || null,
    status: text(voucher?.status),
  };
}

function validateDetails(details: DetailRow[]) {
  const rows = details.filter(hasDetailValue);
  if (!rows.length) return 'Phiếu điều hành phải có ít nhất một dòng chi tiết dịch vụ.';
  const missingName = rows.some((row) => !cleanText(row.serviceName));
  if (missingName) return 'Có dòng chi tiết đã nhập dữ liệu nhưng thiếu tên dịch vụ.';
  const invalidAmount = rows.some((row) => lineAmount(row) <= 0);
  if (invalidAmount) return 'Thành tiền của từng dòng chi tiết phải lớn hơn 0.';
  return '';
}

function buildPayload(data: VoucherForm) {
  const details = data.details.filter(hasDetailValue).map((item) => ({
    sku: cleanText(item.sku),
    serviceName: cleanText(item.serviceName),
    quantity: numberOrDefault(item.quantity, 1),
    unit: cleanText(item.unit),
    netPrice: numberOrZero(item.netPrice),
    vat: numberOrZero(item.vat),
    note: cleanText(item.note),
  }));

  return {
    voucherCode: cleanText(data.voucherCode),
    tourId: optionalText(data.tourId),
    bookingId: optionalText(data.bookingId),
    orderId: optionalText(data.orderId),
    supplierId: optionalText(data.supplierId),
    supplierName: optionalText(data.supplierName),
    serviceType: cleanText(data.serviceType),
    serviceName: cleanText(data.serviceName),
    serviceDate: cleanText(data.serviceDate),
    paymentDeadline: optionalText(data.paymentDeadline),
    note: cleanText(data.note),
    createdBy: cleanText(data.createdBy) || 'Operator',
    details,
  };
}

export default function OperationVouchersClient({ initialVouchers }: { initialVouchers: VoucherSummary[] }) {
  const { can, canAny, permissionsReady } = usePermissions();
  const [vouchers, setVouchers] = useState(() => Array.isArray(initialVouchers) ? initialVouchers : []);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedVoucherSummary, setSelectedVoucherSummary] = useState<VoucherSummary | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [message, setMessage] = useState<Message | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [loadingVoucherId, setLoadingVoucherId] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const { register, control, handleSubmit, reset, setValue, formState: { isSubmitting } } = useForm<VoucherForm>({ resolver: zodResolver(voucherSchema) as any, defaultValues: newVoucherDefaults() });
  const detailArray = useFieldArray({ control, name: 'details' });
  const values = useWatch({ control });
  const total = useMemo(() => (values.details || []).filter(hasDetailValue).reduce((sum, item) => sum + lineAmount(item), 0), [values.details]);
  const currentVoucher = selectedVoucherSummary || (editingId ? vouchers.find((item) => item.id === editingId) : null);
  const currentRemainAmount = numberOrZero(currentVoucher?.remainAmount);
  const canViewVouchers = canAny(['operation.form.view', 'operation.form.manage']);
  const canManageVouchers = can('operation.form.manage');
  const canCreateVoucherPayment = can('operation.payment-request.create');
  const filtered = useMemo(() => {
    const term = normalizeSearch(query.trim());
    return vouchers.filter((item) => {
      const statusMatches = !statusFilter || item.status === statusFilter;
      if (!statusMatches) return false;
      if (!term) return true;
      return [item.voucherCode, item.supplierName, item.serviceName, item.serviceType, voucherStatusLabel(item.status)].some((value) => normalizeSearch(value).includes(term));
    });
  }, [query, statusFilter, vouchers]);
  const table = useReactTable({
    data: filtered,
    columns: useMemo(() => {
      const helper = createColumnHelper<VoucherSummary>();
      return [
        helper.display({ id: 'code', header: 'Mã phiếu', cell: ({ row }) => <div><strong>{row.original.voucherCode}</strong><br /><span className="mutedText">{row.original.serviceType}</span></div> }),
        helper.display({ id: 'supplier', header: 'NCC / Dịch vụ', cell: ({ row }) => <span>{row.original.supplierName || '-'}<br />{row.original.serviceName}</span> }),
        helper.display({ id: 'dates', header: 'Ngày DV / hạn chi', cell: ({ row }) => <span>{dateOnly(row.original.serviceDate)}<br />{dateOnly(row.original.paymentDeadline) || '-'}</span> }),
        helper.display({ id: 'money', header: 'Công nợ', cell: ({ row }) => <span>Tổng: {money(row.original.totalAmount)}<br />Còn: {money(row.original.remainAmount)}</span> }),
        helper.accessor('status', { header: 'Trạng thái', cell: (info) => <span className={statusClass(info.getValue())}>{voucherStatusLabel(info.getValue())}</span> }),
        helper.display({
          id: 'actions',
          header: 'Thao tác',
          cell: ({ row }) => (
            <button type="button" className="secondaryButton iconTextButton" disabled={!canViewVouchers || loadingVoucherId === row.original.id} onClick={() => loadVoucher(row.original.id)}>
              {loadingVoucherId === row.original.id ? <Loader2 size={15} /> : <Pencil size={15} />} {loadingVoucherId === row.original.id ? 'Đang tải' : 'Sửa'}
            </button>
          ),
        }),
      ];
    }, [loadingVoucherId, canViewVouchers]),
    getCoreRowModel: getCoreRowModel(),
  });

  useEffect(() => {
    if (!permissionsReady || canViewVouchers) return;
    setVouchers([]);
    setEditingId(null);
    setSelectedVoucherSummary(null);
    setQuery('');
    setStatusFilter('');
    setMessage(null);
    setFormOpen(false);
    setLoadingVoucherId(null);
    setPaying(false);
    reset(newVoucherDefaults());
  }, [permissionsReady, canViewVouchers, reset]);

  async function reload(announce = true, nextQuery = query, nextStatus = statusFilter) {
    if (!permissionsReady || !canViewVouchers) {
      setVouchers([]);
      setMessage({ kind: 'error', text: 'B\u1ea1n kh\u00f4ng c\u00f3 quy\u1ec1n xem phi\u1ebfu \u0111i\u1ec1u h\u00e0nh.' });
      return;
    }
    setReloading(true);
    if (announce) setMessage({ kind: 'info', text: 'Đang tải lại danh sách phiếu điều hành...' });
    try {
      const params = new URLSearchParams();
      params.set('take', '100');
      if (cleanText(nextQuery)) params.set('search', cleanText(nextQuery));
      if (cleanText(nextStatus)) params.set('status', cleanText(nextStatus));
      const response = await fetch(`${browserApiBase()}/api/operation-vouchers${params.toString() ? `?${params.toString()}` : ''}`, { cache: 'no-store', credentials: 'include' });
      if (!response.ok) throw new Error(await responseMessage(response, 'Không tải được danh sách phiếu điều hành từ API /operation-vouchers'));
      const data = await response.json();
      setVouchers(Array.isArray(data) ? data : []);
      if (editingId && Array.isArray(data)) {
        setSelectedVoucherSummary((current) => data.find((item: VoucherSummary) => item.id === editingId) || current);
      }
      if (announce) setMessage({ kind: 'success', text: 'Đã tải lại danh sách phiếu điều hành.' });
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Không tải được danh sách phiếu điều hành từ API /operation-vouchers.' });
    } finally {
      setReloading(false);
    }
  }

  async function loadVoucher(id: string, keepMessage = false) {
    if (!permissionsReady || !canViewVouchers) {
      setMessage({ kind: 'error', text: 'B\u1ea1n kh\u00f4ng c\u00f3 quy\u1ec1n xem chi ti\u1ebft phi\u1ebfu \u0111i\u1ec1u h\u00e0nh.' });
      return;
    }
    setEditingId(id);
    setSelectedVoucherSummary(vouchers.find((item) => item.id === id) || null);
    setFormOpen(true);
    setLoadingVoucherId(id);
    if (!keepMessage) setMessage({ kind: 'info', text: 'Đang tải thông tin phiếu điều hành...' });
    reset(newVoucherDefaults());
    try {
      const response = await fetch(`${browserApiBase()}/api/operation-vouchers/${id}`, { cache: 'no-store', credentials: 'include' });
      if (!response.ok) throw new Error(await responseMessage(response, 'Không tải được thông tin phiếu điều hành'));
      const voucher = await response.json();
      setSelectedVoucherSummary(mapVoucherToSummary(voucher));
      reset(mapVoucherToForm(voucher));
      if (!keepMessage) setMessage(null);
    } catch (error) {
      setEditingId(null);
      setSelectedVoucherSummary(null);
      setFormOpen(false);
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Không tải được thông tin phiếu điều hành.' });
    } finally {
      setLoadingVoucherId(null);
    }
  }

  async function onSubmit(data: VoucherForm) {
    if (!canManageVouchers) {
      setMessage({ kind: 'error', text: 'B\u1ea1n kh\u00f4ng c\u00f3 quy\u1ec1n l\u01b0u phi\u1ebfu \u0111i\u1ec1u h\u00e0nh.' });
      return;
    }
    const detailError = validateDetails(data.details);
    if (detailError) {
      setMessage({ kind: 'error', text: detailError });
      return;
    }
    const payload = buildPayload(data);
    try {
      const response = await fetch(`${browserApiBase()}/api/operation-vouchers${editingId ? `/${editingId}` : ''}`, {
        method: editingId ? 'PUT' : 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(await responseMessage(response, 'Không lưu được phiếu điều hành'));
      const savedMessage = editingId ? 'Đã cập nhật phiếu điều hành.' : 'Đã tạo phiếu điều hành.';
      setEditingId(null);
      setSelectedVoucherSummary(null);
      setFormOpen(false);
      reset(newVoucherDefaults());
      await reload(false);
      setMessage({ kind: 'success', text: savedMessage });
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Không lưu được phiếu điều hành. Kiểm tra mã phiếu, ngày dịch vụ và chi tiết dịch vụ.' });
    }
  }

  async function addPayment() {
    if (!canCreateVoucherPayment) {
      setMessage({ kind: 'error', text: 'B\u1ea1n kh\u00f4ng c\u00f3 quy\u1ec1n ghi nh\u1eadn thanh to\u00e1n phi\u1ebfu \u0111i\u1ec1u h\u00e0nh.' });
      return;
    }
    if (!editingId) {
      setMessage({ kind: 'error', text: 'Chỉ có thể ghi nhận thanh toán sau khi mở một phiếu đã lưu.' });
      return;
    }
    const amount = numberOrZero(values.paymentAmount);
    if (amount <= 0) {
      setMessage({ kind: 'error', text: 'Số tiền thanh toán phải lớn hơn 0.' });
      return;
    }
    if (currentRemainAmount > 0 && amount > currentRemainAmount) {
      setMessage({ kind: 'error', text: `Số tiền thanh toán không được vượt quá công nợ còn lại (${money(currentRemainAmount)}).` });
      return;
    }
    if (!confirmVoucherPayment(amount)) return;
    setPaying(true);
    try {
      const response = await fetch(`${browserApiBase()}/api/operation-vouchers/${editingId}/payment`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ paidAmount: amount, paymentDate: new Date().toISOString(), note: 'Cập nhật thanh toán từ màn hình điều hành' }),
      });
      if (!response.ok) throw new Error(await responseMessage(response, 'Không ghi nhận được thanh toán'));
      setMessage({ kind: 'success', text: 'Đã ghi nhận thanh toán.' });
      await reload(false);
      await loadVoucher(editingId, true);
      setValue('paymentAmount', 0);
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Không ghi nhận được thanh toán cho phiếu điều hành.' });
    } finally {
      setPaying(false);
    }
  }

  function closeForm() {
    setEditingId(null);
    setSelectedVoucherSummary(null);
    setFormOpen(false);
    setLoadingVoucherId(null);
    setPaying(false);
    setMessage(null);
    reset(newVoucherDefaults());
  }

  function openCreate() {
    if (!canManageVouchers) {
      setMessage({ kind: 'error', text: 'B\u1ea1n kh\u00f4ng c\u00f3 quy\u1ec1n t\u1ea1o phi\u1ebfu \u0111i\u1ec1u h\u00e0nh.' });
      return;
    }
    setEditingId(null);
    setSelectedVoucherSummary(null);
    setLoadingVoucherId(null);
    setPaying(false);
    setMessage(null);
    reset(newVoucherDefaults());
    setFormOpen(true);
  }

  const formBusy = isSubmitting || Boolean(loadingVoucherId);

  return (
    <div className="orderPage">
      <PermissionNotice allowed={!permissionsReady || canViewVouchers} label={'xem phi\u1ebfu \u0111i\u1ec1u h\u00e0nh d\u1ecbch v\u1ee5'} />
      {canViewVouchers ? (
        <>
      {formOpen ? (
        <div className="modalOverlay" role="dialog" aria-modal="true">
          <div className="modalPanel modalPanelWide">
            <form onSubmit={handleSubmit(onSubmit)} className="orderForm">
              <section className="orderWorkArea">
                <div className="orderMain">
                  <section className="panel">
                    <div className="sectionHeader">
                      <h2>{editingId ? 'Cập nhật phiếu điều hành' : 'Thông tin phiếu điều hành'}</h2>
                      <span>{loadingVoucherId ? 'Đang tải dữ liệu...' : 'Theo dõi chi phí dịch vụ và công nợ NCC'}</span>
                    </div>
                    {loadingVoucherId ? <div className="loadingBar" /> : null}
                    <div className="sectionHeader"><h2>Thông tin chung</h2><span>Nhà cung cấp, dịch vụ và ngày thanh toán</span></div>
                    <div className="quoteFormGrid">
                      <label>Mã phiếu<input required {...register('voucherCode')} disabled={formBusy} /></label>
                      <label>Nhà cung cấp<input {...register('supplierName')} disabled={formBusy} /></label>
                      <label>Loại dịch vụ<input required {...register('serviceType')} disabled={formBusy} /></label>
                      <label>Tên dịch vụ<input required {...register('serviceName')} disabled={formBusy} /></label>
                      <label>Ngày dịch vụ<input type="date" required {...register('serviceDate')} disabled={formBusy} /></label>
                      <label>Hạn thanh toán<input type="date" {...register('paymentDeadline')} disabled={formBusy} /></label>
                      <label>Tour ID<input {...register('tourId')} disabled={formBusy} /></label>
                      <label>Booking ID<input {...register('bookingId')} disabled={formBusy} /></label>
                      <label>Order ID<input {...register('orderId')} disabled={formBusy} /></label>
                      <label className="span2">Ghi chú<textarea rows={2} {...register('note')} disabled={formBusy} /></label>
                    </div>
                  </section>
                  <section className="fitTableBlock">
                    <div className="sectionHeader">
                      <h2>Dịch vụ điều hành</h2>
                      <button type="button" className="secondaryButton" disabled={formBusy} onClick={() => detailArray.append({ ...emptyDetail }, { shouldFocus: false })}><Plus size={16} /> Thêm dòng</button>
                    </div>
                    <div className="fitTableWrap">
                      <table className="fitTable orderDynamicTable">
                        <thead><tr><th>STT</th><th>SKU</th><th>Dịch vụ</th><th>SL</th><th>ĐVT</th><th>Giá NET</th><th>VAT %</th><th>Thành tiền</th><th>Ghi chú</th><th /></tr></thead>
                        <tbody>
                          {detailArray.fields.map((field, index) => (
                            <tr key={field.id}>
                              <td>{index + 1}</td>
                              <td><input {...register(`details.${index}.sku`)} disabled={formBusy} /></td>
                              <td><input {...register(`details.${index}.serviceName`)} disabled={formBusy} /></td>
                              <td><input type="number" min={0.01} step="0.01" {...register(`details.${index}.quantity`)} disabled={formBusy} /></td>
                              <td><input {...register(`details.${index}.unit`)} disabled={formBusy} /></td>
                              <td><input type="number" min={0} step="0.01" {...register(`details.${index}.netPrice`)} disabled={formBusy} /></td>
                              <td><input type="number" min={0} max={100} step="0.01" {...register(`details.${index}.vat`)} disabled={formBusy} /></td>
                              <td>{money(lineAmount(values.details?.[index] || {}))}</td>
                              <td><input {...register(`details.${index}.note`)} disabled={formBusy} /></td>
                              <td><button type="button" className="dangerButton iconButton" disabled={formBusy} onClick={() => detailArray.remove(index)}><Trash2 size={15} /></button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </div>
                <aside className="panel quoteSummaryBox">
                  <h2>Tổng hợp chi phí</h2>
                  <div className="summaryRows">
                    <div><span>Tổng chi</span><strong>{money(total)}</strong></div>
                    <div><span>Đã thanh toán</span><strong>{money(currentVoucher?.paidAmount)}</strong></div>
                    <div><span>Công nợ còn lại</span><strong>{money(currentRemainAmount)}</strong></div>
                  </div>
                  <h2>Thanh toán</h2>
                  <div className="summaryRows">
                    <div><span>Thanh toán thêm</span><input type="number" min={0.01} step="0.01" {...register('paymentAmount')} disabled={!canCreateVoucherPayment || !editingId || paying} placeholder="Nhập số tiền" /></div>
                  </div>
                  <button type="button" className="secondaryButton iconTextButton" disabled={!canCreateVoucherPayment || !editingId || paying || formBusy} onClick={addPayment}>
                    {paying ? <Loader2 size={16} /> : <CreditCard size={16} />} {paying ? 'Đang ghi nhận' : 'Ghi nhận thanh toán'}
                  </button>
                </aside>
              </section>
              {message ? <span className={messageClass(message)} role={message.kind === 'error' ? 'alert' : 'status'}>{message.text}</span> : null}
              <div className="hotelFormActions">
                <button type="submit" disabled={!canManageVouchers || formBusy}>{isSubmitting ? <Loader2 size={17} /> : <Save size={17} />} {isSubmitting ? 'Đang lưu' : 'Lưu phiếu'}</button>
                <button type="button" className="dangerButton" onClick={closeForm} disabled={isSubmitting}><X size={17} /> Đóng</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
      <section className="panel listPanel">
        <div className="sectionHeader">
          <div>
            <h2>Danh sách phiếu điều hành dịch vụ</h2>
            <span>{reloading ? 'Đang tải dữ liệu...' : `${filtered.length} / ${vouchers.length} phiếu`}</span>
          </div>
          <div className="pageHeaderActions">
            <button type="button" className="secondaryButton iconTextButton" disabled={!canViewVouchers || reloading} onClick={() => void reload()}><RefreshCcw size={16} /> {reloading ? 'Đang tải' : 'Tải lại'}</button>
            <button type="button" className="secondaryButton iconTextButton" disabled={!canManageVouchers || reloading} onClick={openCreate}><Plus size={16} /> Thêm mới</button>
            <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); void reload(false, query, event.target.value); }} disabled={!canViewVouchers || reloading}>
              <option value="">Tất cả trạng thái</option>
              <option value="PENDING">Chờ thanh toán</option>
              <option value="PARTIAL">Thanh toán một phần</option>
              <option value="PAID">Đã thanh toán</option>
            </select>
            <label className="searchBox"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm mã phiếu, NCC, dịch vụ..." /></label>
          </div>
        </div>
        {message && !formOpen ? <span className={messageClass(message)} role={message.kind === 'error' ? 'alert' : 'status'}>{message.text}</span> : null}
        {reloading ? <div className="loadingBar" /> : null}
        <div className="fitTableWrap compactListTableWrap">
          <table className="fitTable orderListTable compactListTable">
            <thead>{table.getHeaderGroups().map((group) => <tr key={group.id}>{group.headers.map((header) => <th key={header.id}>{flexRender(header.column.columnDef.header, header.getContext())}</th>)}</tr>)}</thead>
            <tbody>
              {table.getRowModel().rows.map((row) => <tr key={row.id}>{row.getVisibleCells().map((cell) => <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}
              {!table.getRowModel().rows.length ? <tr><td colSpan={6}><div className="tableEmptyState">{reloading ? 'Đang tải danh sách phiếu điều hành...' : 'Chưa có phiếu điều hành phù hợp bộ lọc.'}</div></td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
        </>
      ) : null}
    </div>
  );
}

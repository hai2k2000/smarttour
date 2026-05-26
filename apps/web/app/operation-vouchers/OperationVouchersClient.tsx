'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { CreditCard, Pencil, Plus, Save, Search, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { authHeaders, authJsonHeaders } from '../authFetch';
import { PermissionNotice, usePermissions } from '../usePermissions';

import { viStatus } from '../i18n';
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

const detailSchema = z.object({
  sku: z.string().default(''),
  serviceName: z.string().min(2),
  quantity: z.coerce.number().default(1),
  unit: z.string().default(''),
  netPrice: z.coerce.number().default(0),
  vat: z.coerce.number().default(0),
  note: z.string().default(''),
});

const voucherSchema = z.object({
  voucherCode: z.string().min(2),
  tourId: z.string().default(''),
  bookingId: z.string().default(''),
  supplierId: z.string().default(''),
  supplierName: z.string().default(''),
  serviceType: z.string().min(2),
  serviceName: z.string().min(2),
  serviceDate: z.string().min(1),
  paymentDeadline: z.string().default(''),
  note: z.string().default(''),
  createdBy: z.string().default('Nhân sự vận hành'),
  details: z.array(detailSchema).default([]),
  paymentAmount: z.coerce.number().default(0),
});

type VoucherForm = z.infer<typeof voucherSchema>;
const emptyDetail = { sku: '', serviceName: '', quantity: 1, unit: '', netPrice: 0, vat: 0, note: '' };
const defaultValues: VoucherForm = {
  voucherCode: `PDH${Date.now().toString().slice(-6)}`,
  tourId: '',
  bookingId: '',
  supplierId: '',
  supplierName: '',
  serviceType: 'Khach san',
  serviceName: '',
  serviceDate: '',
  paymentDeadline: '',
  note: '',
  createdBy: 'Nhân sự vận hành',
  details: [{ ...emptyDetail }],
  paymentAmount: 0,
};

function browserApiBase() {
  const apiBase = process.env.NEXT_PUBLIC_API_URL || '';
  if (typeof window === 'undefined') return apiBase;
  if (apiBase.includes('smarttour-api-1')) return `http://${window.location.hostname}:4000`;
  return apiBase;
}

function money(value: unknown) { return Number(value || 0).toLocaleString('vi-VN'); }
function dateOnly(value?: string | null) { return value ? value.slice(0, 10) : ''; }
function lineAmount(item: { quantity?: number; netPrice?: number; vat?: number }) {
  return Number(item.quantity || 0) * Number(item.netPrice || 0) * (1 + Number(item.vat || 0) / 100);
}

export default function OperationVouchersClient({ initialVouchers }: { initialVouchers: VoucherSummary[] }) {
  const { can, canAny } = usePermissions();
  const [vouchers, setVouchers] = useState(initialVouchers);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const { register, control, handleSubmit, reset, formState: { isSubmitting } } = useForm<VoucherForm>({ resolver: zodResolver(voucherSchema) as any, defaultValues });
  const detailArray = useFieldArray({ control, name: 'details' });
  const values = useWatch({ control });
  const total = useMemo(() => (values.details || []).reduce((sum, item) => sum + lineAmount(item), 0), [values.details]);
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return vouchers;
    return vouchers.filter((item) => [item.voucherCode, item.supplierName, item.serviceName, item.serviceType].filter(Boolean).some((value) => String(value).toLowerCase().includes(term)));
  }, [query, vouchers]);
  const table = useReactTable({
    data: filtered,
    columns: useMemo(() => {
      const helper = createColumnHelper<VoucherSummary>();
      return [
        helper.display({ id: 'code', header: 'Ma phieu', cell: ({ row }) => <div><strong>{row.original.voucherCode}</strong><br /><span className="mutedText">{row.original.serviceType}</span></div> }),
        helper.display({ id: 'supplier', header: 'NCC / Dich vu', cell: ({ row }) => <span>{row.original.supplierName || '-'}<br />{row.original.serviceName}</span> }),
        helper.display({ id: 'dates', header: 'Ngay DV / han chi', cell: ({ row }) => <span>{dateOnly(row.original.serviceDate)}<br />{dateOnly(row.original.paymentDeadline) || '-'}</span> }),
        helper.display({ id: 'money', header: 'Cong no', cell: ({ row }) => <span>Tong: {money(row.original.totalAmount)}<br />Con: {money(row.original.remainAmount)}</span> }),
        helper.accessor('status', { header: 'Trạng thái', cell: (info) => <span className="statusPill">{viStatus(info.getValue())}</span> }),
        helper.display({ id: 'actions', header: '', cell: ({ row }) => <button type="button" className="secondaryButton iconTextButton" onClick={() => loadVoucher(row.original.id)}><Pencil size={15}/> Sửa</button> }),
      ];
    }, []),
    getCoreRowModel: getCoreRowModel(),
  });

  async function reload() {
    const response = await fetch(`${browserApiBase()}/api/operation-vouchers`, { cache: 'no-store', headers: authHeaders() });
    if (response.ok) setVouchers(await response.json());
  }

  async function loadVoucher(id: string) {
    const response = await fetch(`${browserApiBase()}/api/operation-vouchers/${id}`, { headers: authHeaders() });
    if (!response.ok) return;
    const voucher = await response.json();
    setEditingId(id);
    reset({
      ...defaultValues,
      ...voucher,
      serviceDate: dateOnly(voucher.serviceDate),
      paymentDeadline: dateOnly(voucher.paymentDeadline),
      details: voucher.details?.length ? voucher.details.map((item: any) => ({ ...item, quantity: Number(item.quantity), netPrice: Number(item.netPrice), vat: Number(item.vat) })) : [{ ...emptyDetail }],
      paymentAmount: Number(voucher.remainAmount || 0),
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function onSubmit(data: VoucherForm) {
    const payload = { ...data, details: data.details.filter((item) => item.serviceName || item.netPrice > 0) };
    const response = await fetch(`${browserApiBase()}/api/operation-vouchers${editingId ? `/${editingId}` : ''}`, {
      method: editingId ? 'PUT' : 'POST',
      headers: authJsonHeaders(),
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      setMessage('Khong luu duoc phieu. Kiem tra ma phieu, ngay dich vu va tong tien.');
      return;
    }
    setMessage(editingId ? 'Đã cập nhật phiếu điều hành.' : 'Đã tạo phiếu điều hành.');
    setEditingId(null);
    reset({ ...defaultValues, voucherCode: `PDH${Date.now().toString().slice(-6)}` });
    await reload();
  }

  async function addPayment() {
    if (!editingId || !values.paymentAmount) return;
    const response = await fetch(`${browserApiBase()}/api/operation-vouchers/${editingId}/payment`, {
      method: 'POST',
      headers: authJsonHeaders(),
      body: JSON.stringify({ paidAmount: Number(values.paymentAmount), paymentDate: new Date().toISOString(), note: 'Cap nhat thanh toán tu man hinh dieu hanh' }),
    });
    if (response.ok) {
      setMessage('Đã ghi nhận thanh toán.');
      await loadVoucher(editingId);
      await reload();
    }
  }

  function closeForm() {
    setEditingId(null);
    setMessage('');
    reset({ ...defaultValues, voucherCode: `PDH${Date.now().toString().slice(-6)}` });
  }

  return (
    <div className="orderPage">
      <PermissionNotice allowed={canAny(['operation.form.view', 'operation.form.manage'])} label="xem phiếu điều hành dich vu" />
      <form onSubmit={handleSubmit(onSubmit)} className="orderForm">
        <section className="orderWorkArea">
          <div className="orderMain">
            <section className="panel">
              <div className="sectionHeader"><h2>Thong tin phiếu điều hành</h2><span>{message || 'Theo doi chi phi dich vu va cong no NCC'}</span></div>
              <div className="quoteFormGrid">
                <label>Ma phieu<input {...register('voucherCode')} /></label>
                <label>Nhà cung cấp<input {...register('supplierName')} /></label>
                <label>Loai dich vu<input {...register('serviceType')} /></label>
                <label>Tên dịch vụ<input {...register('serviceName')} /></label>
                <label>Ngay dich vu<input type="date" {...register('serviceDate')} /></label>
                <label>Han thanh toán<input type="date" {...register('paymentDeadline')} /></label>
                <label>Tour ID<input {...register('tourId')} /></label>
                <label>Booking ID<input {...register('bookingId')} /></label>
                <label className="span2">Ghi chú<textarea rows={2} {...register('note')} /></label>
              </div>
            </section>
            <section className="fitTableBlock">
              <div className="sectionHeader"><h2>Chi tiet dich vu</h2><button type="button" className="secondaryButton" onClick={() => detailArray.append({ ...emptyDetail })}><Plus size={16}/> Thêm dòng</button></div>
              <div className="fitTableWrap">
                <table className="fitTable orderDynamicTable">
                  <thead><tr><th>STT</th><th>SKU</th><th>Dich vu</th><th>SL</th><th>DVT</th><th>Gia NET</th><th>VAT %</th><th>Thanh tien</th><th>Ghi chú</th><th /></tr></thead>
                  <tbody>
                    {detailArray.fields.map((field, index) => (
                      <tr key={field.id}>
                        <td>{index + 1}</td>
                        <td><input {...register(`details.${index}.sku`)} /></td>
                        <td><input {...register(`details.${index}.serviceName`)} /></td>
                        <td><input type="number" {...register(`details.${index}.quantity`)} /></td>
                        <td><input {...register(`details.${index}.unit`)} /></td>
                        <td><input type="number" {...register(`details.${index}.netPrice`)} /></td>
                        <td><input type="number" {...register(`details.${index}.vat`)} /></td>
                        <td>{money(lineAmount(values.details?.[index] || {}))}</td>
                        <td><input {...register(`details.${index}.note`)} /></td>
                        <td><button type="button" className="dangerButton iconButton" onClick={() => detailArray.remove(index)}><Trash2 size={15}/></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
          <aside className="panel quoteSummaryBox">
            <h2>Tong hop chi</h2>
            <div className="summaryRows">
              <div><span>Tổng chi</span><strong>{money(total)}</strong></div>
              <div><span>Thanh toán them</span><input type="number" {...register('paymentAmount')} /></div>
            </div>
            <button type="button" className="secondaryButton iconTextButton" disabled={!editingId} onClick={addPayment}><CreditCard size={16}/> Ghi nhan thanh toán</button>
          </aside>
        </section>
        <div className="hotelFormActions"><button type="submit" disabled={isSubmitting || !can('operation.form.manage')}><Save size={17}/> Lưu phieu</button><button type="button" className="dangerButton" onClick={closeForm}><X size={17}/> Đóng</button></div>
      </form>
      <section className="panel listPanel">
        <div className="sectionHeader"><h2>Danh sách phiếu điều hành dịch vụ</h2><label className="searchBox"><Search size={16}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm mã phiếu, NCC, dịch vụ..." /></label></div>
        <div className="fitTableWrap"><table className="fitTable orderListTable"><thead>{table.getHeaderGroups().map((group) => <tr key={group.id}>{group.headers.map((header) => <th key={header.id}>{flexRender(header.column.columnDef.header, header.getContext())}</th>)}</tr>)}</thead><tbody>{table.getRowModel().rows.map((row) => <tr key={row.id}>{row.getVisibleCells().map((cell) => <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}</tbody></table></div>
      </section>
    </div>
  );
}

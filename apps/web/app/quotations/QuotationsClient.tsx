'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { Check, Copy, Link as LinkIcon, Pencil, Plus, Save, Search, Send, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { authHeaders, authJsonHeaders } from '../authFetch';
import { PermissionNotice, usePermissions } from '../usePermissions';

import { viStatus } from '../i18n';
type Dashboard = { total: number; totalValue: number; pending: number; approved: number; converted: number; expired: number };
type QuotationSummary = { id: string; quoteCode: string; productType: string; customerName: string | null; customerPhone: string | null; route: string | null; totalSelling: string; sellingPerPax: string; status: string; smartLinkToken: string | null; _count?: { items: number; logs: number } };

const productTypes = ['FIT', 'GIT', 'LANDTOUR', 'COMBO', 'BOOKING', 'VISA', 'SERVICE'];
const statuses = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'EXPIRED', 'CONVERTED', 'CANCELLED'];
const services = ['Ve may bay', 'Khach san', 'Xe', 'Nha hang', 'HDV', 'Ve tham quan', 'Visa', 'Bao hiem', 'Sim', 'Dich vu khac'];

const itemSchema = z.object({
  serviceType: z.string().default('Khach san'),
  supplierId: z.string().default(''),
  serviceId: z.string().default(''),
  supplierName: z.string().default(''),
  serviceName: z.string().default(''),
  unit: z.string().default(''),
  quantity: z.coerce.number().default(1),
  paxCount: z.coerce.number().default(1),
  nightCount: z.coerce.number().default(1),
  netPrice: z.coerce.number().default(0),
  vat: z.coerce.number().default(0),
  markupAmount: z.coerce.number().default(0),
  markupPercent: z.coerce.number().default(0),
  note: z.string().default(''),
});

const quotationSchema = z.object({
  quoteCode: z.string().min(2),
  productType: z.string().default('FIT'),
  customerCode: z.string().default(''),
  customerName: z.string().default(''),
  customerPhone: z.string().default(''),
  customerEmail: z.string().email().or(z.literal('')).default(''),
  salesOwner: z.string().default(''),
  operatorOwner: z.string().default(''),
  branch: z.string().default(''),
  department: z.string().default(''),
  marketGroup: z.string().default(''),
  productCategory: z.string().default(''),
  route: z.string().default(''),
  paxAdult: z.coerce.number().default(1),
  paxChild: z.coerce.number().default(0),
  paxInfant: z.coerce.number().default(0),
  currency: z.string().default('VND'),
  exchangeRate: z.coerce.number().default(1),
  createdDate: z.string().default(''),
  expiredDate: z.string().default(''),
  expectedPaymentDate: z.string().default(''),
  departureDate: z.string().default(''),
  returnDate: z.string().default(''),
  approvalLevel: z.coerce.number().default(1),
  status: z.string().default('DRAFT'),
  childPricePercent: z.coerce.number().default(75),
  infantPricePercent: z.coerce.number().default(20),
  smartLinkEnabled: z.boolean().default(false),
  language: z.string().default('VI'),
  terms: z.string().default(''),
  note: z.string().default(''),
  items: z.array(itemSchema).default([]),
});

type QuotationForm = z.infer<typeof quotationSchema>;
const emptyItem = { serviceType: 'Khach san', supplierId: '', serviceId: '', supplierName: '', serviceName: '', unit: '', quantity: 1, paxCount: 1, nightCount: 1, netPrice: 0, vat: 0, markupAmount: 0, markupPercent: 0, note: '' };
const defaultValues: QuotationForm = { quoteCode: `QTE${Date.now().toString().slice(-6)}`, productType: 'FIT', customerCode: '', customerName: '', customerPhone: '', customerEmail: '', salesOwner: 'Sales', operatorOwner: 'Nhân sự vận hành', branch: '', department: '', marketGroup: '', productCategory: '', route: '', paxAdult: 1, paxChild: 0, paxInfant: 0, currency: 'VND', exchangeRate: 1, createdDate: '', expiredDate: '', expectedPaymentDate: '', departureDate: '', returnDate: '', approvalLevel: 1, status: 'DRAFT', childPricePercent: 75, infantPricePercent: 20, smartLinkEnabled: false, language: 'VI', terms: '', note: '', items: [{ ...emptyItem }] };

function browserApiBase() {
  const apiBase = process.env.NEXT_PUBLIC_API_URL || '';
  if (typeof window === 'undefined') return apiBase;
  if (apiBase.includes('smarttour-api-1')) return `http://${window.location.hostname}:4000`;
  return apiBase;
}
function money(value: unknown) { return Number(value || 0).toLocaleString('vi-VN'); }
function dateOnly(value?: string | null) { return value ? value.slice(0, 10) : ''; }
function itemCost(item: any) { return Number(item.quantity || 0) * Number(item.nightCount || 0) * Number(item.netPrice || 0) * (1 + Number(item.vat || 0) / 100); }
function itemMarkup(item: any) { const cost = itemCost(item); return Number(item.markupAmount || 0) + cost * Number(item.markupPercent || 0) / 100; }

export default function QuotationsClient({ initialDashboard, initialQuotations }: { initialDashboard: Dashboard; initialQuotations: QuotationSummary[] }) {
  const { can, canAny } = usePermissions();
  const [dashboard, setDashboard] = useState(initialDashboard);
  const [quotations, setQuotations] = useState(initialQuotations);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const { register, control, handleSubmit, reset, formState: { isSubmitting } } = useForm<QuotationForm>({ resolver: zodResolver(quotationSchema) as any, defaultValues });
  const items = useFieldArray({ control, name: 'items' });
  const values = useWatch({ control });
  const totals = useMemo(() => {
    const totalCost = (values.items || []).reduce((sum, item) => sum + itemCost(item), 0);
    const totalMarkup = (values.items || []).reduce((sum, item) => sum + itemMarkup(item), 0);
    const totalSelling = totalCost + totalMarkup;
    const pax = Math.max(1, Number(values.paxAdult || 0) + Number(values.paxChild || 0) + Number(values.paxInfant || 0));
    return { totalCost, totalMarkup, totalSelling, pax, costPerPax: totalCost / pax, sellingPerPax: totalSelling / pax, margin: totalSelling ? totalMarkup / totalSelling * 100 : 0 };
  }, [values]);
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return quotations;
    return quotations.filter((item) => [item.quoteCode, item.productType, item.customerName, item.customerPhone, item.route].filter(Boolean).some((value) => String(value).toLowerCase().includes(term)));
  }, [query, quotations]);
  const table = useReactTable({
    data: filtered,
    columns: useMemo(() => {
      const helper = createColumnHelper<QuotationSummary>();
      return [
        helper.display({ id: 'code', header: 'Ma BG', cell: ({ row }) => <div><strong>{row.original.quoteCode}</strong><br /><span className="mutedText">{row.original.productType}</span></div> }),
        helper.display({ id: 'customer', header: 'Khach', cell: ({ row }) => <span>{row.original.customerName || '-'}<br />{row.original.customerPhone || '-'}</span> }),
        helper.accessor('route', { header: 'San pham / Hanh trinh', cell: (info) => info.getValue() || '-' }),
        helper.accessor('totalSelling', { header: 'Tong gia tri', cell: (info) => money(info.getValue()) }),
        helper.accessor('sellingPerPax', { header: 'Gia/khach', cell: (info) => money(info.getValue()) }),
        helper.accessor('status', { header: 'Trạng thái', cell: (info) => <span className="statusPill">{viStatus(info.getValue())}</span> }),
        helper.display({ id: 'actions', header: '', cell: ({ row }) => <button type="button" className="secondaryButton iconTextButton" onClick={() => loadQuotation(row.original.id)}><Pencil size={15}/> Sửa</button> }),
      ];
    }, []),
    getCoreRowModel: getCoreRowModel(),
  });

  async function reload() {
    const [dashResponse, listResponse] = await Promise.all([fetch(`${browserApiBase()}/api/quotations/dashboard`, { cache: 'no-store', headers: authHeaders() }), fetch(`${browserApiBase()}/api/quotations`, { cache: 'no-store', headers: authHeaders() })]);
    if (dashResponse.ok) setDashboard(await dashResponse.json());
    if (listResponse.ok) setQuotations(await listResponse.json());
  }
  async function loadQuotation(id: string) {
    const response = await fetch(`${browserApiBase()}/api/quotations/${id}`, { headers: authHeaders() });
    if (!response.ok) return;
    const q = await response.json();
    setEditingId(id);
    reset({ ...defaultValues, ...q, createdDate: dateOnly(q.createdDate), expiredDate: dateOnly(q.expiredDate), expectedPaymentDate: dateOnly(q.expectedPaymentDate), departureDate: dateOnly(q.departureDate), returnDate: dateOnly(q.returnDate), items: q.items?.length ? q.items.map((i: any) => ({ ...i, quantity: Number(i.quantity), paxCount: Number(i.paxCount), nightCount: Number(i.nightCount), netPrice: Number(i.netPrice), vat: Number(i.vat), markupAmount: Number(i.markupAmount), markupPercent: Number(i.markupPercent) })) : [{ ...emptyItem }] });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  async function onSubmit(data: QuotationForm) {
    const payload = { ...data, items: data.items.filter((item) => item.serviceName || item.netPrice > 0) };
    const response = await fetch(`${browserApiBase()}/api/quotations${editingId ? `/${editingId}` : ''}`, { method: editingId ? 'PUT' : 'POST', headers: authJsonHeaders(), body: JSON.stringify(payload) });
    if (!response.ok) { setMessage('Khong luu duoc báo giá hop nhat. Kiem tra ma báo giá va dong dich vu.'); return; }
    setMessage(editingId ? 'Đã cập nhật báo giá.' : 'Đã tạo báo giá.');
    setEditingId(null); reset({ ...defaultValues, quoteCode: `QTE${Date.now().toString().slice(-6)}` }); await reload();
  }
  async function action(path: string, method = 'POST', body: Record<string, unknown> = { actor: 'Nhân sự vận hành' }) {
    if (!editingId) return;
    const response = await fetch(`${browserApiBase()}/api/quotations/${editingId}/${path}`, { method, headers: authJsonHeaders(), body: JSON.stringify(body) });
    if (response.ok) { setMessage(`Đã thực hiện ${path}`); await loadQuotation(editingId); await reload(); }
  }
  function closeForm() { setEditingId(null); setMessage(''); reset({ ...defaultValues, quoteCode: `QTE${Date.now().toString().slice(-6)}` }); }

  return (
    <div className="orderPage">
      <PermissionNotice allowed={canAny(['quotation.view', 'quotation.manage'])} label="xem va quan ly quotation" />
      <section className="metrics">
        <article className="metric"><span>Tong báo giá</span><strong>{dashboard.total}</strong></article>
        <article className="metric"><span>Tong gia tri</span><strong>{money(dashboard.totalValue)}</strong></article>
        <article className="metric"><span>Chờ duyệt</span><strong>{dashboard.pending}</strong></article>
        <article className="metric"><span>Đã duyệt</span><strong>{dashboard.approved}</strong></article>
        <article className="metric"><span>Đã chủyển đơn</span><strong>{dashboard.converted}</strong></article>
        <article className="metric"><span>Het han</span><strong>{dashboard.expired}</strong></article>
      </section>
      <form onSubmit={handleSubmit(onSubmit)} className="orderForm">
        <section className="orderWorkArea">
          <div className="orderMain">
            <section className="panel">
              <div className="sectionHeader"><h2>Công cụ báo giá</h2><span>{message || 'Bao gia hop nhat cho FIT/GIT/LandTour/Combo/Booking/Visa/Service'}</span></div>
              <div className="quoteFormGrid">
                <label>Ma báo giá<input {...register('quoteCode')} /></label><label>Loai san pham<select {...register('productType')}>{productTypes.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label>Ma khach<input {...register('customerCode')} /></label><label>Ten khach<input {...register('customerName')} /></label><label>Điện thoại<input {...register('customerPhone')} /></label>
                <label>Email<input type="email" {...register('customerEmail')} /></label><label>Sales<input {...register('salesOwner')} /></label><label>Dieu hanh<input {...register('operatorOwner')} /></label><label>Chi nhanh<input {...register('branch')} /></label><label>Phong ban<input {...register('department')} /></label>
                <label>Thị trường<input {...register('marketGroup')} /></label><label>Loai hinh<input {...register('productCategory')} /></label><label>Hanh trinh / San pham<input {...register('route')} /></label><label>Ngày tạo<input type="date" {...register('createdDate')} /></label><label>Het han<input type="date" {...register('expiredDate')} /></label>
                <label>Ngay thanh toán DK<input type="date" {...register('expectedPaymentDate')} /></label><label>Ngay di<input type="date" {...register('departureDate')} /></label><label>Ngay ve<input type="date" {...register('returnDate')} /></label><label>Người lớn<input type="number" {...register('paxAdult')} /></label><label>Trẻ em<input type="number" {...register('paxChild')} /></label>
                <label>Em be<input type="number" {...register('paxInfant')} /></label><label>Duyet cap<select {...register('approvalLevel')}><option value="0">Khong duyệt</option><option value="1">1 cap</option><option value="2">2 cap</option></select></label><label>Ngon ngu<select {...register('language')}><option value="VI">VI</option><option value="EN">EN</option></select></label><label className="span2">Dieu khoan<textarea rows={2} {...register('terms')} /></label>
              </div>
            </section>
            <section className="fitTableBlock">
              <div className="sectionHeader"><h2>Dich vu báo giá</h2><button type="button" className="secondaryButton" onClick={() => items.append({ ...emptyItem })}><Plus size={16}/> Thêm dòng</button></div>
              <div className="fitTableWrap"><table className="fitTable orderDynamicTable"><thead><tr><th>STT</th><th>Loai DV</th><th>NCC</th><th>Dich vu</th><th>DVT</th><th>SL</th><th>Dem</th><th>NET</th><th>VAT%</th><th>Markup</th><th>Markup%</th><th>Thanh tien</th><th /></tr></thead><tbody>{items.fields.map((field, index) => <tr key={field.id}><td>{index + 1}</td><td><select {...register(`items.${index}.serviceType`)}>{services.map((s) => <option key={s} value={s}>{s}</option>)}</select></td><td><input {...register(`items.${index}.supplierName`)} /></td><td><input {...register(`items.${index}.serviceName`)} /></td><td><input {...register(`items.${index}.unit`)} /></td><td><input type="number" {...register(`items.${index}.quantity`)} /></td><td><input type="number" {...register(`items.${index}.nightCount`)} /></td><td><input type="number" {...register(`items.${index}.netPrice`)} /></td><td><input type="number" {...register(`items.${index}.vat`)} /></td><td><input type="number" {...register(`items.${index}.markupAmount`)} /></td><td><input type="number" {...register(`items.${index}.markupPercent`)} /></td><td>{money(itemCost(values.items?.[index] || {}) + itemMarkup(values.items?.[index] || {}))}</td><td><button type="button" className="dangerButton iconButton" onClick={() => items.remove(index)}><Trash2 size={15}/></button></td></tr>)}</tbody></table></div>
            </section>
          </div>
          <aside className="panel quoteSummaryBox">
            <h2>Công cụ giá</h2>
            <div className="summaryRows"><div><span>Total cost</span><strong>{money(totals.totalCost)}</strong></div><div><span>Markup</span><strong>{money(totals.totalMarkup)}</strong></div><div><span>Total selling</span><strong>{money(totals.totalSelling)}</strong></div><div><span>Pax</span><strong>{totals.pax}</strong></div><div><span>Cost/pax</span><strong>{money(totals.costPerPax)}</strong></div><div><span>Selling/pax</span><strong>{money(totals.sellingPerPax)}</strong></div><div><span>Margin</span><strong>{totals.margin.toFixed(1)}%</strong></div></div>
          </aside>
        </section>
        <div className="hotelFormActions"><button type="submit" disabled={isSubmitting || !can('quotation.manage')}><Save size={17}/> Lưu</button><button type="button" className="secondaryButton" disabled={!editingId || !can('quotation.manage')} onClick={() => action('submit')}><Send size={17}/> Gui duyệt</button><button type="button" className="secondaryButton" disabled={!editingId || !can('quotation.manage')} onClick={() => action('approve')}><Check size={17}/> Duyet</button><button type="button" className="secondaryButton" disabled={!editingId || !can('quotation.manage')} onClick={() => action('smartlink', 'PATCH', { enabled: true })}><LinkIcon size={17}/> SmartLink</button><button type="button" className="secondaryButton" disabled={!editingId || !can('quotation.manage')} onClick={() => action('convert')}><Copy size={17}/> Chủyen don</button><button type="button" className="dangerButton" onClick={closeForm}><X size={17}/> Đóng</button></div>
      </form>
      <section className="panel listPanel"><div className="sectionHeader"><h2>Danh sach báo giá hop nhat</h2><label className="searchBox"><Search size={16}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tim ma, khach, san pham..." /></label></div><div className="fitTableWrap"><table className="fitTable orderListTable"><thead>{table.getHeaderGroups().map((group) => <tr key={group.id}>{group.headers.map((header) => <th key={header.id}>{flexRender(header.column.columnDef.header, header.getContext())}</th>)}</tr>)}</thead><tbody>{table.getRowModel().rows.map((row) => <tr key={row.id}>{row.getVisibleCells().map((cell) => <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}</tbody></table></div></section>
    </div>
  );
}

'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { Check, Copy, Pencil, Plus, Save, Search, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { FieldArrayWithId, useFieldArray, useForm, UseFieldArrayReturn, UseFormRegister, useWatch } from 'react-hook-form';
import { z } from 'zod';

type QuoteSummary = {
  id: string;
  quoteCode: string;
  tourCode: string;
  tourName: string | null;
  customerName: string | null;
  bookingDate: string | null;
  route: string | null;
  sellingPrice: string;
  status: string;
};

const costSchema = z.object({
  costType: z.enum(['COMMON', 'HOTEL', 'PRIVATE']),
  serviceType: z.string().default(''),
  description: z.string().default(''),
  unit: z.string().default(''),
  quantity: z.coerce.number().default(1),
  serviceCount: z.coerce.number().default(1),
  paxPerRoom: z.coerce.number().default(1),
  currency: z.string().default('VND'),
  exchangeRate: z.coerce.number().default(1),
  unitPrice: z.coerce.number().default(0),
  vat: z.coerce.number().default(0),
  note: z.string().default(''),
});

const quoteSchema = z.object({
  id: z.string().optional(),
  quoteCode: z.string().min(2),
  tourCode: z.string().min(2),
  tourName: z.string().default(''),
  route: z.string().default(''),
  marketGroup: z.string().default(''),
  currency: z.string().default('VND'),
  exchangeRate: z.coerce.number().default(1),
  bookingDate: z.string().default(''),
  paymentDate: z.string().default(''),
  departureDate: z.string().default(''),
  returnDate: z.string().default(''),
  customerName: z.string().default(''),
  customerPhone: z.string().default(''),
  customerEmail: z.string().email().or(z.literal('')).default(''),
  customerAddress: z.string().default(''),
  customerNote: z.string().default(''),
  operatorOwner: z.string().default(''),
  collaborator: z.string().default(''),
  adultQty: z.coerce.number().default(1),
  childQty: z.coerce.number().default(0),
  infantQty: z.coerce.number().default(0),
  profit: z.coerce.number().default(0),
  commission: z.coerce.number().default(0),
  discount: z.coerce.number().default(0),
  childPricePercent: z.coerce.number().default(75),
  infantPricePercent: z.coerce.number().default(20),
  costItems: z.array(costSchema).default([]),
  itineraries: z.array(z.object({ dayNo: z.coerce.number().default(1), title: z.string().default(''), content: z.string().default('') })).default([]),
});

type QuoteForm = z.infer<typeof quoteSchema>;
type ArrayName = 'costItems' | 'itineraries';

const emptyCost = { costType: 'COMMON' as const, serviceType: '', description: '', unit: '', quantity: 1, serviceCount: 1, paxPerRoom: 1, currency: 'VND', exchangeRate: 1, unitPrice: 0, vat: 0, note: '' };
const emptyItinerary = { dayNo: 1, title: '', content: '' };
const defaultValues: QuoteForm = {
  quoteCode: `BG${Date.now().toString().slice(-6)}`,
  tourCode: '',
  tourName: '',
  route: '',
  marketGroup: '',
  currency: 'VND',
  exchangeRate: 1,
  bookingDate: '',
  paymentDate: '',
  departureDate: '',
  returnDate: '',
  customerName: '',
  customerPhone: '',
  customerEmail: '',
  customerAddress: '',
  customerNote: '',
  operatorOwner: '',
  collaborator: '',
  adultQty: 1,
  childQty: 0,
  infantQty: 0,
  profit: 0,
  commission: 0,
  discount: 0,
  childPricePercent: 75,
  infantPricePercent: 20,
  costItems: [{ ...emptyCost }],
  itineraries: [{ ...emptyItinerary }],
};

function browserApiBase() {
  const apiBase = process.env.NEXT_PUBLIC_API_URL || '';
  if (typeof window === 'undefined') return apiBase;
  if (apiBase.includes('smarttour-api-1')) return `http://${window.location.hostname}:4000`;
  return apiBase;
}

function money(value: unknown) {
  return Number(value || 0).toLocaleString('vi-VN');
}

function lineAmount(item: Partial<QuoteForm['costItems'][number]>) {
  return Number(item.quantity || 0) * Number(item.serviceCount || 0) * Number(item.unitPrice || 0) * Number(item.exchangeRate || 1) + Number(item.vat || 0);
}

export default function QuoteToursClient({ initialQuotes }: { initialQuotes: QuoteSummary[] }) {
  const [quotes, setQuotes] = useState(initialQuotes);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const { register, control, handleSubmit, reset, setValue, formState: { isSubmitting } } = useForm<QuoteForm>({
    resolver: zodResolver(quoteSchema) as any,
    defaultValues,
  });
  const costItems = useFieldArray({ control, name: 'costItems' });
  const itineraries = useFieldArray({ control, name: 'itineraries' });
  const values = useWatch({ control });

  const totals = useMemo(() => {
    const items = values.costItems || [];
    const common = items.filter((item) => item.costType === 'COMMON').reduce((sum, item) => sum + lineAmount(item), 0);
    const privateTotal = items.filter((item) => item.costType === 'HOTEL' || item.costType === 'PRIVATE').reduce((sum, item) => sum + lineAmount(item), 0);
    const pax = Math.max(1, Number(values.adultQty || 0) + Number(values.childQty || 0) + Number(values.infantQty || 0));
    const net = common / pax + privateTotal;
    const selling = Math.max(0, net + Number(values.profit || 0) + Number(values.commission || 0) - Number(values.discount || 0));
    return { common, privateTotal, pax, net, selling, child: selling * Number(values.childPricePercent || 0) / 100, infant: selling * Number(values.infantPricePercent || 0) / 100, profitRate: selling > 0 ? Number(values.profit || 0) / selling * 100 : 0 };
  }, [values]);

  const filteredQuotes = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return quotes;
    return quotes.filter((item) => [item.quoteCode, item.tourCode, item.tourName, item.customerName].filter(Boolean).some((value) => String(value).toLowerCase().includes(term)));
  }, [query, quotes]);

  const quoteTable = useReactTable({
    data: filteredQuotes,
    columns: useMemo(() => {
      const helper = createColumnHelper<QuoteSummary>();
      return [
        helper.accessor('quoteCode', { header: 'Ma bao gia' }),
        helper.accessor('tourCode', { header: 'Ma tour' }),
        helper.accessor('route', { header: 'Hanh trinh', cell: (info) => info.getValue() || '-' }),
        helper.accessor('customerName', { header: 'Nguoi dat', cell: (info) => info.getValue() || '-' }),
        helper.accessor('sellingPrice', { header: 'Gia/khach', cell: (info) => money(info.getValue()) }),
        helper.accessor('status', { header: 'Trang thai', cell: (info) => <span className="statusPill">{info.getValue()}</span> }),
        helper.display({ id: 'actions', header: '', cell: ({ row }) => <button type="button" className="secondaryButton iconTextButton" onClick={() => loadQuote(row.original.id)}><Pencil size={15} /> Sua</button> }),
      ];
    }, []),
    getCoreRowModel: getCoreRowModel(),
  });

  async function reload() {
    const response = await fetch(`${browserApiBase()}/api/quotes/tours`, { cache: 'no-store' });
    if (response.ok) setQuotes(await response.json());
  }

  async function loadQuote(id: string) {
    const response = await fetch(`${browserApiBase()}/api/quotes/tours/${id}`);
    if (!response.ok) return;
    const quote = await response.json();
    setEditingId(id);
    setFormOpen(true);
    reset({
      ...defaultValues,
      ...quote,
      bookingDate: quote.bookingDate?.slice(0, 10) || '',
      paymentDate: quote.paymentDate?.slice(0, 10) || '',
      departureDate: quote.departureDate?.slice(0, 10) || '',
      returnDate: quote.returnDate?.slice(0, 10) || '',
      costItems: quote.costItems?.length ? quote.costItems.map((item: any) => ({ ...item, quantity: Number(item.quantity), serviceCount: Number(item.serviceCount), paxPerRoom: Number(item.paxPerRoom), exchangeRate: Number(item.exchangeRate), unitPrice: Number(item.unitPrice), vat: Number(item.vat) })) : [{ ...emptyCost }],
      itineraries: quote.itineraries?.length ? quote.itineraries : [{ ...emptyItinerary }],
      profit: Number(quote.profit || 0),
      commission: Number(quote.commission || 0),
      discount: Number(quote.discount || 0),
      childPricePercent: Number(quote.childPricePercent || 75),
      infantPricePercent: Number(quote.infantPricePercent || 20),
    });
  }

  async function onSubmit(data: QuoteForm) {
    const payload = { ...data, costItems: data.costItems.filter((item) => item.description || item.serviceType || item.unitPrice > 0), itineraries: data.itineraries.filter((item) => item.title || item.content) };
    const response = await fetch(`${browserApiBase()}/api/quotes/tours${editingId ? `/${editingId}` : ''}`, {
      method: editingId ? 'PUT' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      setMessage('Khong luu duoc bao gia tour. Kiem tra ma bao gia va truong bat buoc.');
      return;
    }
    setMessage(editingId ? 'Da cap nhat bao gia.' : 'Da tao bao gia.');
    reset({ ...defaultValues, quoteCode: `BG${Date.now().toString().slice(-6)}` });
    setEditingId(null);
    setFormOpen(false);
    await reload();
  }

  async function action(path: string) {
    if (!editingId) return;
    const response = await fetch(`${browserApiBase()}/api/quotes/tours/${editingId}/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ approvedBy: 'Operator' }) });
    if (response.ok) {
      setMessage(`Da cap nhat: ${path}`);
      await reload();
    }
  }

  function closeForm() {
    setEditingId(null);
    setFormOpen(false);
    setMessage('');
    reset({ ...defaultValues, quoteCode: `BG${Date.now().toString().slice(-6)}` });
  }

  function openCreate() {
    setEditingId(null);
    setMessage('');
    reset({ ...defaultValues, quoteCode: `BG${Date.now().toString().slice(-6)}` });
    setFormOpen(true);
  }

  return (
    <div className="quotePage">
      {formOpen ? <div className="modalOverlay" role="dialog" aria-modal="true"><div className="modalPanel modalPanelWide"><form onSubmit={handleSubmit(onSubmit)} className="quoteForm">
        <section className="panel">
          <div className="sectionHeader">
            <h2>Thong tin bao gia</h2>
            <span>{message || 'Tinh gia realtime, API tinh lai truoc khi luu'}</span>
          </div>
          <div className="quoteFormGrid">
            <label>Ma bao gia<input {...register('quoteCode')} /></label>
            <label>Ma tour<input {...register('tourCode')} /></label>
            <label>Ten tour<input {...register('tourName')} /></label>
            <label>Hanh trinh<input {...register('route')} /></label>
            <label>Thi truong<input {...register('marketGroup')} /></label>
            <label>Ty gia<input type="number" {...register('exchangeRate')} /></label>
            <label>Ngay dat<input type="date" {...register('bookingDate')} /></label>
            <label>Ngay thanh toan<input type="date" {...register('paymentDate')} /></label>
            <label>Ngay di<input type="date" {...register('departureDate')} /></label>
            <label>Ngay ve<input type="date" {...register('returnDate')} /></label>
            <label>Ho ten khach<input {...register('customerName')} /></label>
            <label>Dien thoai<input {...register('customerPhone')} /></label>
            <label>Email<input type="email" {...register('customerEmail')} /></label>
            <label>Dieu hanh<input {...register('operatorOwner')} /></label>
            <label>Nguoi lon<input type="number" {...register('adultQty')} /></label>
            <label>Tre em<input type="number" {...register('childQty')} /></label>
            <label>Tre nho<input type="number" {...register('infantQty')} /></label>
            <label className="span2">Ghi chu khach<textarea rows={2} {...register('customerNote')} /></label>
          </div>
        </section>

        <section className="quoteWorkArea">
          <div className="quoteMain">
            <CostRows register={register} fieldArray={costItems} setValue={setValue} />
            <ItineraryRows register={register} fieldArray={itineraries} />
          </div>
          <aside className="panel quoteSummaryBox">
            <h2>Tien thu du kien</h2>
            <div className="summaryRows">
              <div><span>Tong phi chung</span><strong>{money(totals.common)}</strong></div>
              <div><span>Phi rieng</span><strong>{money(totals.privateTotal)}</strong></div>
              <div><span>So khach</span><strong>{totals.pax}</strong></div>
              <div><span>Gia NET/khach</span><strong>{money(totals.net)}</strong></div>
            </div>
            <label>Loi nhuan/khach<input type="number" {...register('profit')} /></label>
            <label>Hoa hong/khach<input type="number" {...register('commission')} /></label>
            <label>Giam gia<input type="number" {...register('discount')} /></label>
            <label>% tre em<input type="number" {...register('childPricePercent')} /></label>
            <label>% tre nho<input type="number" {...register('infantPricePercent')} /></label>
            <div className="summaryRows">
              <div><span>Gia ban nguoi lon</span><strong>{money(totals.selling)}</strong></div>
              <div><span>Gia tre em</span><strong>{money(totals.child)}</strong></div>
              <div><span>Gia tre nho</span><strong>{money(totals.infant)}</strong></div>
              <div><span>Ty le lai</span><strong>{totals.profitRate.toFixed(1)}%</strong></div>
            </div>
          </aside>
        </section>

        <div className="hotelFormActions">
          <button type="submit" disabled={isSubmitting}><Save size={17} /> Luu bao gia</button>
          <button type="button" className="secondaryButton" disabled={!editingId} onClick={() => action('approve')}><Check size={17} /> Duyet</button>
          <button type="button" className="secondaryButton" disabled={!editingId} onClick={() => action('convert')}><Copy size={17} /> Chuyen don hang</button>
          <button type="button" className="dangerButton" onClick={closeForm}><X size={17} /> Dong</button>
        </div>
      </form></div></div> : null}
      <section className="panel listPanel">
        <div className="sectionHeader">
          <h2>Danh sach bao gia tour</h2>
          <button type="button" className="secondaryButton iconTextButton" onClick={openCreate}><Plus size={16} /> Them moi</button>
          <label className="searchBox"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tim ma tour, khach..." /></label>
        </div>
        <div className="fitTableWrap">
          <table className="fitTable quoteListTable">
            <thead>{quoteTable.getHeaderGroups().map((group) => <tr key={group.id}>{group.headers.map((header) => <th key={header.id}>{flexRender(header.column.columnDef.header, header.getContext())}</th>)}</tr>)}</thead>
            <tbody>{quoteTable.getRowModel().rows.map((row) => <tr key={row.id}>{row.getVisibleCells().map((cell) => <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function CostRows({ register, fieldArray, setValue }: { register: UseFormRegister<QuoteForm>; fieldArray: UseFieldArrayReturn<QuoteForm, 'costItems', 'id'>; setValue: any }) {
  const columns = [
    { key: 'costType', label: 'Nhom' },
    { key: 'serviceType', label: 'Loai DV' },
    { key: 'description', label: 'Dien giai' },
    { key: 'unit', label: 'DVT' },
    { key: 'quantity', label: 'So luong', type: 'number' },
    { key: 'serviceCount', label: 'So luot', type: 'number' },
    { key: 'exchangeRate', label: 'Ty gia', type: 'number' },
    { key: 'unitPrice', label: 'Don gia', type: 'number' },
    { key: 'vat', label: 'VAT', type: 'number' },
    { key: 'note', label: 'Ghi chu' },
  ];
  return <DynamicRows title="Chi phi tour" name="costItems" register={register} fieldArray={fieldArray} columns={columns} emptyRow={emptyCost} setValue={setValue} />;
}

function ItineraryRows({ register, fieldArray }: { register: UseFormRegister<QuoteForm>; fieldArray: UseFieldArrayReturn<QuoteForm, 'itineraries', 'id'> }) {
  return <DynamicRows title="Lich trinh tour" name="itineraries" register={register} fieldArray={fieldArray} columns={[{ key: 'dayNo', label: 'Ngay', type: 'number' }, { key: 'title', label: 'Tieu de' }, { key: 'content', label: 'Noi dung', type: 'textarea' }]} emptyRow={emptyItinerary} />;
}

function DynamicRows<T extends ArrayName>({ title, name, register, fieldArray, columns, emptyRow, setValue }: { title: string; name: T; register: UseFormRegister<QuoteForm>; fieldArray: UseFieldArrayReturn<QuoteForm, T, 'id'>; columns: Array<{ key: string; label: string; type?: string }>; emptyRow: Record<string, unknown>; setValue?: any }) {
  const table = useReactTable({
    data: fieldArray.fields,
    columns: useMemo(() => {
      const helper = createColumnHelper<FieldArrayWithId<QuoteForm, T, 'id'>>();
      return [
        helper.display({ id: 'stt', header: 'STT', cell: ({ row }) => row.index + 1 }),
        ...columns.map((column) => helper.display({ id: column.key, header: column.label, cell: ({ row }) => <RowInput name={name} index={row.index} column={column} register={register} /> })),
        helper.display({ id: 'actions', header: '', cell: ({ row }) => <button type="button" className="dangerButton iconButton" onClick={() => fieldArray.remove(row.index)}><Trash2 size={15} /></button> }),
      ];
    }, [columns, fieldArray, name, register]),
    getCoreRowModel: getCoreRowModel(),
  });
  function addCommon(type: 'COMMON' | 'HOTEL' | 'PRIVATE') {
    const row = { ...emptyRow, costType: type };
    fieldArray.append(row as any);
  }
  return (
    <section className="fitTableBlock">
      <div className="sectionHeader">
        <h2>{title}</h2>
        {name === 'costItems' ? (
          <div className="fitActions">
            <button type="button" className="secondaryButton" onClick={() => addCommon('COMMON')}><Plus size={16} /> Phi chung</button>
            <button type="button" className="secondaryButton" onClick={() => addCommon('HOTEL')}><Plus size={16} /> Khach san</button>
            <button type="button" className="secondaryButton" onClick={() => addCommon('PRIVATE')}><Plus size={16} /> Phi rieng</button>
          </div>
        ) : <button type="button" className="secondaryButton" onClick={() => fieldArray.append({ ...emptyRow } as any)}><Plus size={16} /> Them dong</button>}
      </div>
      <div className="fitTableWrap">
        <table className="fitTable quoteDynamicTable">
          <thead>{table.getHeaderGroups().map((group) => <tr key={group.id}>{group.headers.map((header) => <th key={header.id}>{flexRender(header.column.columnDef.header, header.getContext())}</th>)}</tr>)}</thead>
          <tbody>{table.getRowModel().rows.map((row) => <tr key={row.id}>{row.getVisibleCells().map((cell) => <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </section>
  );
}

function RowInput<T extends ArrayName>({ name, index, column, register }: { name: T; index: number; column: { key: string; label: string; type?: string }; register: UseFormRegister<QuoteForm> }) {
  const field = `${name}.${index}.${column.key}`;
  if (column.key === 'costType') {
    return <select {...register(field as any)}><option value="COMMON">COMMON</option><option value="HOTEL">HOTEL</option><option value="PRIVATE">PRIVATE</option></select>;
  }
  if (column.type === 'textarea') return <textarea rows={2} {...register(field as any)} />;
  return <input type={column.type || 'text'} {...register(field as any)} />;
}

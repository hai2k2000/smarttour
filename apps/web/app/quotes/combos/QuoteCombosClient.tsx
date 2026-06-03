'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { Copy, Eye, Pencil, Plus, Save, Search, ShoppingCart, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { FieldArrayWithId, useFieldArray, useForm, UseFieldArrayReturn, UseFormRegister, useWatch } from 'react-hook-form';
import { z } from 'zod';

type Supplier = { id: string; name: string; supplierServices?: { id: string; serviceName: string; netPrice: string }[] };
type ComboSummary = { id: string; comboCode: string; comboType: string; adultComboPrice: string; totalNetPricePerPax: string; status: string; _count?: { items: number } };

const itemSchema = z.object({
  supplierId: z.string().default(''),
  serviceId: z.string().default(''),
  serviceName: z.string().default(''),
  checkIn: z.string().default(''),
  netPricePerService: z.coerce.number().default(0),
  nightCount: z.coerce.number().default(1),
  paxCount: z.coerce.number().default(1),
});

const comboSchema = z.object({
  comboCode: z.string().min(2),
  comboType: z.string().min(2),
  note: z.string().default(''),
  profitPerPax: z.coerce.number().default(0),
  childPricePercent: z.coerce.number().default(75),
  items: z.array(itemSchema).default([]),
});

type ComboForm = z.infer<typeof comboSchema>;
const comboTypes = ['2N1D', '3N2D', '4N3D', '5N4D', '6N5D', '7N6D', 'Combo khac'];
const emptyItem = { supplierId: '', serviceId: '', serviceName: '', checkIn: '', netPricePerService: 0, nightCount: 1, paxCount: 1 };
const defaultValues: ComboForm = { comboCode: `CB${Date.now().toString().slice(-6)}`, comboType: '3N2D', note: '', profitPerPax: 0, childPricePercent: 75, items: [{ ...emptyItem }] };

function browserApiBase() {
  const apiBase = process.env.NEXT_PUBLIC_API_URL || '';
  if (typeof window === 'undefined') return apiBase;
  if (apiBase.includes('smarttour-api-1')) return `http://${window.location.hostname}:4000`;
  return apiBase;
}

function money(value: unknown) {
  return Number(value || 0).toLocaleString('vi-VN');
}

export default function QuoteCombosClient({ initialCombos, suppliers }: { initialCombos: ComboSummary[]; suppliers: Supplier[] }) {
  const [combos, setCombos] = useState(initialCombos);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const { register, control, handleSubmit, reset, setValue, formState: { isSubmitting } } = useForm<ComboForm>({
    resolver: zodResolver(comboSchema) as any,
    defaultValues,
  });
  const items = useFieldArray({ control, name: 'items' });
  const values = useWatch({ control });

  const totals = useMemo(() => {
    const totalNet = (values.items || []).reduce((sum, item) => {
      const pax = Math.max(1, Number(item.paxCount || 1));
      const nights = Math.max(1, Number(item.nightCount || 1));
      return sum + Number(item.netPricePerService || 0) * nights / pax;
    }, 0);
    const adult = totalNet + Number(values.profitPerPax || 0);
    return { totalNet, adult, child: adult * Number(values.childPricePercent || 0) / 100 };
  }, [values]);

  const serviceOptions = useMemo(() => suppliers.flatMap((supplier) => (supplier.supplierServices || []).map((service) => ({ ...service, supplierId: supplier.id, supplierName: supplier.name }))), [suppliers]);
  const filteredCombos = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return combos;
    return combos.filter((item) => [item.comboCode, item.comboType, item.status].some((value) => String(value).toLowerCase().includes(term)));
  }, [query, combos]);

  const comboTable = useReactTable({
    data: filteredCombos,
    columns: useMemo(() => {
      const helper = createColumnHelper<ComboSummary>();
      return [
        helper.accessor('comboCode', { header: 'Ma combo' }),
        helper.accessor('comboType', { header: 'Loai combo' }),
        helper.accessor('totalNetPricePerPax', { header: 'NET/khach', cell: (info) => money(info.getValue()) }),
        helper.accessor('adultComboPrice', { header: 'Gia nguoi lon', cell: (info) => money(info.getValue()) }),
        helper.display({ id: 'count', header: 'Dich vu', cell: ({ row }) => row.original._count?.items ?? 0 }),
        helper.accessor('status', { header: 'Trang thai', cell: (info) => <span className="statusPill">{info.getValue()}</span> }),
        helper.display({ id: 'actions', header: '', cell: ({ row }) => <button type="button" className="secondaryButton iconTextButton" onClick={() => loadCombo(row.original.id)}><Pencil size={15} /> Sua</button> }),
      ];
    }, []),
    getCoreRowModel: getCoreRowModel(),
  });

  async function reload() {
    const response = await fetch(`${browserApiBase()}/api/quotes/combos`, { cache: 'no-store' });
    if (response.ok) setCombos(await response.json());
  }

  async function loadCombo(id: string) {
    const response = await fetch(`${browserApiBase()}/api/quotes/combos/${id}`);
    if (!response.ok) return;
    const combo = await response.json();
    setEditingId(id);
    setFormOpen(true);
    reset({
      comboCode: combo.comboCode,
      comboType: combo.comboType,
      note: combo.note || '',
      profitPerPax: Number(combo.profitPerPax || 0),
      childPricePercent: Number(combo.childPricePercent || 75),
      items: combo.items?.length ? combo.items.map((item: any) => ({ supplierId: item.supplierId || '', serviceId: item.serviceId || '', serviceName: item.serviceName || '', checkIn: item.checkIn?.slice(0, 10) || '', netPricePerService: Number(item.netPricePerService || 0), nightCount: Number(item.nightCount || 1), paxCount: Number(item.paxCount || 1) })) : [{ ...emptyItem }],
    });
  }

  async function onSubmit(data: ComboForm) {
    const payload = { ...data, items: data.items.filter((item) => item.serviceName && item.netPricePerService >= 0) };
    const response = await fetch(`${browserApiBase()}/api/quotes/combos${editingId ? `/${editingId}` : ''}`, {
      method: editingId ? 'PUT' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      setMessage('Khong luu duoc combo. Kiem tra ma combo va dong dich vu.');
      return;
    }
    setMessage(editingId ? 'Da cap nhat combo.' : 'Da tao combo.');
    setEditingId(null); setFormOpen(false); reset({ ...defaultValues, comboCode: `CB${Date.now().toString().slice(-6)}` });
    await reload();
  }

  async function action(path: string) {
    if (!editingId) return;
    const response = await fetch(`${browserApiBase()}/api/quotes/combos/${editingId}/${path}`, { method: 'POST' });
    if (response.ok) {
      setMessage(`Da cap nhat combo: ${path}`);
      await reload();
    }
  }

  function closeForm() {
    setEditingId(null);
    setFormOpen(false);
    setMessage('');
    reset({ ...defaultValues, comboCode: `CB${Date.now().toString().slice(-6)}` });
  }

  function openCreate() {
    setEditingId(null);
    setMessage('');
    reset({ ...defaultValues, comboCode: `CB${Date.now().toString().slice(-6)}` });
    setFormOpen(true);
  }

  return (
    <div className="quotePage">
      {formOpen ? <div className="modalOverlay" role="dialog" aria-modal="true"><div className="modalPanel modalPanelWide"><form onSubmit={handleSubmit(onSubmit)} className="quoteForm">
        <section className="quoteComboShell">
          <div className="quoteComboMain">
            <section className="panel">
              <div className="sectionHeader">
                <h2>GIA COMBO</h2>
                <button type="button" className="secondaryButton iconTextButton"><Eye size={16} /> Xem chi tiet</button>
              </div>
              <div className="quoteComboTop">
                <label>Ma combo<input {...register('comboCode')} /></label>
                <label>Loai combo<select {...register('comboType')}>{comboTypes.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>
              </div>
            </section>
            <ComboRows register={register} fieldArray={items} suppliers={suppliers} serviceOptions={serviceOptions} setValue={setValue} />
            <section className="panel">
              <h2>Ghi chu</h2>
              <textarea rows={5} {...register('note')} placeholder="Dieu kien ap dung, chinh sach hoan huy, phu thu cuoi tuan..." />
            </section>
          </div>
          <aside className="panel quoteSummaryBox">
            <h2>Khoi tinh gia</h2>
            <div className="summaryRows">
              <div><span>Tong NET/nguoi</span><strong>{money(totals.totalNet)}</strong></div>
            </div>
            <label>Loi nhuan/nguoi<input type="number" {...register('profitPerPax')} /></label>
            <div className="summaryRows">
              <div><span>Gia combo nguoi lon</span><strong>{money(totals.adult)}</strong></div>
            </div>
            <label>% tre con<input type="number" {...register('childPricePercent')} /></label>
            <div className="summaryRows">
              <div><span>Gia combo tre con</span><strong>{money(totals.child)}</strong></div>
            </div>
            <p className="mutedText">{message || 'Gia NET/nguoi tinh theo tung dong dich vu.'}</p>
          </aside>
        </section>
        <div className="hotelFormActions">
          <button type="submit" disabled={isSubmitting}><Save size={17} /> Tao bao gia</button>
          <button type="button" className="secondaryButton" disabled={!editingId} onClick={() => action('create-order')}><ShoppingCart size={17} /> Tao don hang</button>
          <button type="button" className="secondaryButton" disabled={!editingId} onClick={() => action('create-quote')}><Copy size={17} /> Chot bao gia</button>
          <button type="button" className="dangerButton" onClick={closeForm}><X size={17} /> Dong</button>
        </div>
      </form></div></div> : null}
      <section className="panel listPanel">
        <div className="sectionHeader">
          <h2>Danh sach combo</h2>
          <button type="button" className="secondaryButton iconTextButton" onClick={openCreate}><Plus size={16} /> Them moi</button>
          <label className="searchBox"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tim ma combo..." /></label>
        </div>
        <div className="fitTableWrap">
          <table className="fitTable quoteListTable">
            <thead>{comboTable.getHeaderGroups().map((group) => <tr key={group.id}>{group.headers.map((header) => <th key={header.id}>{flexRender(header.column.columnDef.header, header.getContext())}</th>)}</tr>)}</thead>
            <tbody>{comboTable.getRowModel().rows.map((row) => <tr key={row.id}>{row.getVisibleCells().map((cell) => <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function ComboRows({ register, fieldArray, suppliers, serviceOptions, setValue }: { register: UseFormRegister<ComboForm>; fieldArray: UseFieldArrayReturn<ComboForm, 'items', 'id'>; suppliers: Supplier[]; serviceOptions: Array<{ id: string; serviceName: string; netPrice: string; supplierId: string; supplierName: string }>; setValue: any }) {
  const table = useReactTable({
    data: fieldArray.fields,
    columns: useMemo(() => {
      const helper = createColumnHelper<FieldArrayWithId<ComboForm, 'items', 'id'>>();
      return [
        helper.display({ id: 'stt', header: 'STT', cell: ({ row }) => row.index + 1 }),
        helper.display({ id: 'supplierId', header: 'NCC', cell: ({ row }) => <select {...register(`items.${row.index}.supplierId`)}><option value="">Chon NCC</option>{suppliers.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select> }),
        helper.display({ id: 'serviceId', header: 'Dich vu', cell: ({ row }) => <select {...register(`items.${row.index}.serviceId`)} onChange={(event) => {
          const service = serviceOptions.find((item) => item.id === event.target.value);
          setValue(`items.${row.index}.serviceId`, event.target.value);
          if (service) {
            setValue(`items.${row.index}.supplierId`, service.supplierId);
            setValue(`items.${row.index}.serviceName`, service.serviceName);
            setValue(`items.${row.index}.netPricePerService`, Number(service.netPrice || 0));
          }
        }}><option value="">Nhap tay/chon dich vu</option>{serviceOptions.map((item) => <option value={item.id} key={item.id}>{item.supplierName} - {item.serviceName}</option>)}</select> }),
        ...[
          { key: 'serviceName', label: 'Ten dich vu' },
          { key: 'checkIn', label: 'Check In', type: 'date' },
          { key: 'netPricePerService', label: 'Gia NET/DV', type: 'number' },
          { key: 'nightCount', label: 'So dem', type: 'number' },
          { key: 'paxCount', label: 'So khach', type: 'number' },
        ].map((column) => helper.display({ id: column.key, header: column.label, cell: ({ row }) => <input type={column.type || 'text'} {...register(`items.${row.index}.${column.key}` as any)} /> })),
        helper.display({ id: 'actions', header: '', cell: ({ row }) => <button type="button" className="dangerButton iconButton" onClick={() => fieldArray.remove(row.index)}><Trash2 size={15} /></button> }),
      ];
    }, [fieldArray, register, serviceOptions, setValue, suppliers]),
    getCoreRowModel: getCoreRowModel(),
  });
  return (
    <section className="fitTableBlock">
      <div className="sectionHeader">
        <h2>Dich vu combo</h2>
        <button type="button" className="secondaryButton" onClick={() => fieldArray.append({ ...emptyItem })}><Plus size={16} /> Them dich vu</button>
      </div>
      <div className="fitTableWrap">
        <table className="fitTable quoteComboTable">
          <thead>{table.getHeaderGroups().map((group) => <tr key={group.id}>{group.headers.map((header) => <th key={header.id}>{flexRender(header.column.columnDef.header, header.getContext())}</th>)}</tr>)}</thead>
          <tbody>{table.getRowModel().rows.map((row) => <tr key={row.id}>{row.getVisibleCells().map((cell) => <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </section>
  );
}

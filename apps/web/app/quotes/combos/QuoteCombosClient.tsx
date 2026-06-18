'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { AlertCircle, Check, Pencil, Plus, RefreshCcw, Save, Search, ShoppingCart, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { FieldArrayWithId, useFieldArray, useForm, UseFieldArrayReturn, UseFormRegister, UseFormSetValue, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { authHeaders, authJsonHeaders } from '../../authFetch';
import { PermissionNotice, usePermissions } from '../../usePermissions';

type SupplierService = { id: string; serviceName: string; netPrice: string | number | null };
type Supplier = { id: string; name: string; supplierServices?: SupplierService[] };
type ServiceOption = SupplierService & { supplierId: string; supplierName: string };
type ComboSummary = {
  id: string;
  comboCode: string;
  comboType: string;
  adultComboPrice: string;
  totalNetPricePerPax: string;
  status: string;
  _count?: { items: number };
};

type ComboAction = 'create-order' | 'create-quote';

const actionLabels: Record<ComboAction, string> = {
  'create-order': 'tạo đơn hàng',
  'create-quote': 'chốt báo giá',
};

const statusLabels: Record<string, string> = {
  DRAFT: 'Nháp',
  QUOTED: 'Đã chốt báo giá',
  ORDER_CREATED: 'Đã tạo đơn hàng',
};

const itemSchema = z.object({
  supplierId: z.string().default(''),
  serviceId: z.string().default(''),
  serviceName: z.string().default(''),
  checkIn: z.string().default(''),
  netPricePerService: z.coerce.number().min(0, 'Giá NET không được âm').default(0),
  nightCount: z.coerce.number().min(1, 'Số đêm phải từ 1').default(1),
  paxCount: z.coerce.number().min(1, 'Số khách phải từ 1').default(1),
});

const comboSchema = z.object({
  comboCode: z.string().trim().min(2, 'Mã combo cần ít nhất 2 ký tự'),
  comboType: z.string().trim().min(2, 'Loại combo cần ít nhất 2 ký tự'),
  note: z.string().default(''),
  profitPerPax: z.coerce.number().min(0, 'Lợi nhuận/người không được âm').default(0),
  childPricePercent: z.coerce.number().min(0, '% giá trẻ em không được âm').default(75),
  items: z.array(itemSchema).default([]),
});

type ComboForm = z.infer<typeof comboSchema>;
type ComboItem = ComboForm['items'][number];

const comboTypes = [
  { value: '2N1D', label: '2N1D' },
  { value: '3N2D', label: '3N2D' },
  { value: '4N3D', label: '4N3D' },
  { value: '5N4D', label: '5N4D' },
  { value: '6N5D', label: '6N5D' },
  { value: '7N6D', label: '7N6D' },
  { value: 'Combo khác', label: 'Combo khác' },
];
const emptyItem: ComboItem = { supplierId: '', serviceId: '', serviceName: '', checkIn: '', netPricePerService: 0, nightCount: 1, paxCount: 1 };

function freshDefaultValues(): ComboForm {
  return {
    comboCode: `CB${Date.now().toString().slice(-6)}`,
    comboType: '3N2D',
    note: '',
    profitPerPax: 0,
    childPricePercent: 75,
    items: [{ ...emptyItem }],
  };
}

function browserApiBase() {
  const apiBase = process.env.NEXT_PUBLIC_API_URL || '';
  if (typeof window === 'undefined') return apiBase;
  if (!apiBase || apiBase.includes('smarttour-api-1')) return '';
  return apiBase.replace(/\/$/, '');
}

function safeNumber(value: unknown, fallback = 0) {
  if (value === '' || value === null || value === undefined) return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function safeNonNegative(value: unknown, fallback = 0) {
  return Math.max(0, safeNumber(value, fallback));
}

function safePositiveInt(value: unknown, fallback = 1) {
  return Math.max(1, Math.floor(safeNumber(value, fallback)));
}

function safeNonNegativeInt(value: unknown, fallback = 0) {
  return Math.max(0, Math.floor(safeNumber(value, fallback)));
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
}

function formatDateParts(year: number, month: number, day: number) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}`;
}

function dateInputValue(value: unknown) {
  if (!value) return '';
  const raw = String(value).trim();
  if (!raw) return '';
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const vietnameseDate = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (vietnameseDate) return formatDateParts(Number(vietnameseDate[3]), Number(vietnameseDate[2]), Number(vietnameseDate[1]));
  const date = value instanceof Date ? value : new Date(raw);
  return Number.isNaN(date.getTime()) ? '' : formatDateParts(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

function money(value: unknown) {
  return safeNumber(value).toLocaleString('vi-VN');
}

function statusText(status: string) {
  return statusLabels[status] || status || 'Không rõ';
}

function itemNetPerPax(item: Partial<ComboItem>) {
  const pax = Math.max(1, safeNumber(item.paxCount, 1));
  const nights = Math.max(1, safeNumber(item.nightCount, 1));
  return safeNumber(item.netPricePerService) * nights / pax;
}

function normalizeServiceOptions(suppliers: Supplier[]): ServiceOption[] {
  return suppliers.flatMap((supplier) =>
    (supplier.supplierServices || [])
      .map((service) => ({
        id: text(service.id),
        serviceName: text(service.serviceName),
        netPrice: service.netPrice ?? '0',
        supplierId: text(supplier.id),
        supplierName: text(supplier.name),
      }))
      .filter((service) => service.id && service.serviceName && service.supplierId),
  );
}

function normalizeComboItem(item: unknown, serviceOptions: ServiceOption[]): ComboItem {
  const row = item && typeof item === 'object' ? item as Record<string, unknown> : {};
  const rawSupplierId = text(row.supplierId);
  const rawServiceId = text(row.serviceId);
  const service = rawServiceId ? serviceOptions.find((option) => option.id === rawServiceId) : undefined;
  const serviceMatchesSupplier = Boolean(service && (!rawSupplierId || rawSupplierId === service.supplierId));
  const supplierId = serviceMatchesSupplier && service ? rawSupplierId || service.supplierId : rawSupplierId;
  const serviceId = serviceMatchesSupplier ? rawServiceId : '';
  const serviceName = text(row.serviceName) || (serviceMatchesSupplier && service ? service.serviceName : '');
  const fallbackNet = serviceMatchesSupplier && service ? safeNumber(service.netPrice) : 0;

  return {
    supplierId,
    serviceId,
    serviceName,
    checkIn: dateInputValue(row.checkIn),
    netPricePerService: safeNonNegative(row.netPricePerService, fallbackNet),
    nightCount: safePositiveInt(row.nightCount, 1),
    paxCount: safePositiveInt(row.paxCount, 1),
  };
}

function hasValidComboItem(item: ComboItem) {
  return item.serviceName.trim().length >= 2;
}

function normalizeComboSummary(item: unknown): ComboSummary | null {
  if (!item || typeof item !== 'object') return null;
  const row = item as Record<string, unknown>;
  const id = text(row.id);
  if (!id) return null;
  return {
    id,
    comboCode: text(row.comboCode),
    comboType: text(row.comboType),
    adultComboPrice: String(row.adultComboPrice ?? '0'),
    totalNetPricePerPax: String(row.totalNetPricePerPax ?? '0'),
    status: text(row.status) || 'DRAFT',
    _count: typeof row._count === 'object' && row._count ? { items: safeNonNegativeInt((row._count as { items?: unknown }).items) } : undefined,
  };
}

function normalizeComboList(data: unknown) {
  const rows = Array.isArray(data) ? data : Array.isArray((data as { rows?: unknown })?.rows) ? (data as { rows: unknown[] }).rows : null;
  if (!rows) throw new Error('API không trả về danh sách combo hợp lệ.');
  const normalized = rows.map(normalizeComboSummary).filter((item): item is ComboSummary => Boolean(item));
  if (rows.length && !normalized.length) throw new Error('API trả về danh sách combo nhưng thiếu dữ liệu định danh hợp lệ.');
  return normalized;
}

async function responseError(response: Response, fallback: string) {
  const data = await response.json().catch(() => null) as { message?: string | string[] } | null;
  if (Array.isArray(data?.message)) return data.message.join(', ');
  return data?.message || fallback;
}

function buildPayload(data: ComboForm, serviceOptions: ServiceOption[]) {
  const items = data.items.map((item) => normalizeComboItem(item, serviceOptions)).filter(hasValidComboItem);
  return {
    comboCode: text(data.comboCode),
    comboType: text(data.comboType),
    note: text(data.note),
    profitPerPax: safeNonNegative(data.profitPerPax),
    childPricePercent: safeNonNegative(data.childPricePercent, 75),
    items,
  };
}

export default function QuoteCombosClient({ initialCombos, suppliers }: { initialCombos: ComboSummary[]; suppliers: Supplier[] }) {
  const { can, canAny } = usePermissions();
  const [combos, setCombos] = useState(initialCombos);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [loadingComboId, setLoadingComboId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<ComboAction | null>(null);
  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ComboForm>({
    resolver: zodResolver(comboSchema) as any,
    defaultValues: freshDefaultValues(),
  });
  const items = useFieldArray({ control, name: 'items' });
  const values = useWatch({ control });

  const serviceOptions = useMemo(() => normalizeServiceOptions(suppliers), [suppliers]);

  const totals = useMemo(() => {
    const normalizedItems = (values.items || []).map((item) => normalizeComboItem(item, serviceOptions));
    const totalNet = normalizedItems.reduce((sum, item) => sum + itemNetPerPax(item), 0);
    const profit = safeNumber(values.profitPerPax);
    const adult = totalNet + profit;
    const childPercent = safeNumber(values.childPricePercent, 75);
    return { totalNet, adult, child: adult * childPercent / 100 };
  }, [serviceOptions, values]);

  const filteredCombos = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return combos;
    return combos.filter((item) => [item.comboCode, item.comboType, item.status, statusText(item.status)].some((value) => String(value).toLowerCase().includes(term)));
  }, [query, combos]);

  const comboTable = useReactTable({
    data: filteredCombos,
    columns: useMemo(() => {
      const helper = createColumnHelper<ComboSummary>();
      return [
        helper.accessor('comboCode', {
          header: 'Mã combo',
          cell: (info) => {
            const comboTitle = info.getValue();
            return <span className="cellClamp" title={comboTitle}>{comboTitle}</span>;
          },
        }),
        helper.accessor('comboType', {
          header: 'Loại combo',
          cell: (info) => {
            const comboTypeTitle = info.getValue() || 'Chưa có loại combo';
            return <span className="cellClamp" title={comboTypeTitle}>{info.getValue() || '-'}</span>;
          },
        }),
        helper.accessor('totalNetPricePerPax', { header: 'NET/khách', cell: (info) => <span className="cellClamp" title={money(info.getValue())}>{money(info.getValue())}</span> }),
        helper.accessor('adultComboPrice', { header: 'Giá người lớn', cell: (info) => <span className="cellClamp" title={money(info.getValue())}>{money(info.getValue())}</span> }),
        helper.display({
          id: 'count',
          header: 'Dịch vụ',
          cell: ({ row }) => {
            const serviceCountTitle = `${row.original._count?.items ?? 0} dịch vụ`;
            return <span className="cellClamp" title={serviceCountTitle}>{row.original._count?.items ?? 0}</span>;
          },
        }),
        helper.accessor('status', { header: 'Trạng thái', cell: (info) => <span className="statusPill">{statusText(info.getValue())}</span> }),
        helper.display({
          id: 'actions',
          header: '',
          cell: ({ row }) => (
            <button type="button" className="secondaryButton iconTextButton" disabled={loadingComboId === row.original.id} onClick={() => loadCombo(row.original.id)}>
              <Pencil size={15} /> {loadingComboId === row.original.id ? 'Đang tải' : 'Sửa'}
            </button>
          ),
        }),
      ];
    }, [loadingComboId]),
    getCoreRowModel: getCoreRowModel(),
  });

  async function reload(showSuccess = true) {
    setListLoading(true);
    setError('');
    try {
      const response = await fetch(`${browserApiBase()}/api/quotes/combos`, { cache: 'no-store', headers: authHeaders() });
      if (!response.ok) throw new Error(await responseError(response, 'Không tải được danh sách combo.'));
      const data = await response.json().catch(() => {
        throw new Error('API không trả về JSON hợp lệ cho danh sách combo.');
      });
      setCombos(normalizeComboList(data));
      if (showSuccess) setMessage('Đã tải lại danh sách combo.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không tải được danh sách combo.');
    } finally {
      setListLoading(false);
    }
  }

  async function loadCombo(id: string, showSuccess = true) {
    const previousEditingId = editingId;
    const switchingRecord = previousEditingId !== id;
    setLoadingComboId(id);
    setError('');
    setMessage('');
    if (switchingRecord) {
      setEditingId(null);
      setFormOpen(false);
      reset(freshDefaultValues());
    }
    try {
      const response = await fetch(`${browserApiBase()}/api/quotes/combos/${id}`, { headers: authHeaders() });
      if (!response.ok) throw new Error(await responseError(response, 'Không tải được chi tiết combo.'));
      const data = await response.json().catch(() => {
        throw new Error('API không trả về JSON hợp lệ cho chi tiết combo.');
      });
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('API không trả về chi tiết combo hợp lệ.');
      const combo = data as Record<string, unknown>;
      if (!Array.isArray(combo.items)) throw new Error('API không trả về danh sách dịch vụ của combo hợp lệ.');
      const comboItems = combo.items.map((item) => normalizeComboItem(item, serviceOptions)).filter(hasValidComboItem);

      setEditingId(id);
      setFormOpen(true);
      reset({
        ...freshDefaultValues(),
        comboCode: text(combo.comboCode),
        comboType: text(combo.comboType) || '3N2D',
        note: text(combo.note),
        profitPerPax: safeNonNegative(combo.profitPerPax),
        childPricePercent: safeNonNegative(combo.childPricePercent, 75),
        items: comboItems.length ? comboItems : [{ ...emptyItem }],
      });
      if (showSuccess) setMessage('Đã tải chi tiết combo.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không tải được chi tiết combo.');
      if (switchingRecord) {
        setEditingId(null);
        setFormOpen(false);
        reset(freshDefaultValues());
      }
    } finally {
      setLoadingComboId(null);
    }
  }

  async function onSubmit(data: ComboForm) {
    setError('');
    setMessage('');
    const payload = buildPayload(data, serviceOptions);
    if (!payload.items.length) {
      setError('Cần ít nhất một dịch vụ hợp lệ trước khi lưu combo.');
      return;
    }
    try {
      const response = await fetch(`${browserApiBase()}/api/quotes/combos${editingId ? `/${editingId}` : ''}`, {
        method: editingId ? 'PUT' : 'POST',
        headers: authJsonHeaders(),
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(await responseError(response, 'Không lưu được combo. Kiểm tra mã combo và dòng dịch vụ.'));
      const successMessage = editingId ? 'Đã cập nhật combo.' : 'Đã tạo báo giá combo.';
      setEditingId(null);
      setFormOpen(false);
      reset(freshDefaultValues());
      await reload(false);
      setMessage(successMessage);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không lưu được combo.');
    }
  }

  async function action(path: ComboAction) {
    const currentId = editingId;
    if (!currentId) {
      setError(`Cần mở một combo đã lưu trước khi ${actionLabels[path]}.`);
      return;
    }
    setActionLoading(path);
    setError('');
    try {
      const response = await fetch(`${browserApiBase()}/api/quotes/combos/${currentId}/${path}`, { method: 'POST', headers: authJsonHeaders(), body: '{}' });
      if (!response.ok) throw new Error(await responseError(response, `Không thể ${actionLabels[path]}.`));
      await reload(false);
      await loadCombo(currentId, false);
      setMessage(`Đã ${actionLabels[path]}.`);
    } catch (caught) {
      setError(caught instanceof Error ? `${actionLabels[path][0].toUpperCase()}${actionLabels[path].slice(1)} lỗi: ${caught.message}` : `Không thể ${actionLabels[path]}.`);
    } finally {
      setActionLoading(null);
    }
  }

  function closeForm() {
    setEditingId(null);
    setFormOpen(false);
    setMessage('');
    setError('');
    reset(freshDefaultValues());
  }

  function openCreate() {
    setEditingId(null);
    setMessage('');
    setError('');
    reset(freshDefaultValues());
    setFormOpen(true);
  }

  const validationMessage = errors.comboCode?.message || errors.comboType?.message || errors.profitPerPax?.message || errors.childPricePercent?.message;
  const formBusy = isSubmitting || listLoading || Boolean(actionLoading || loadingComboId);

  return (
    <div className="quotePage quoteComboPage">
      <PermissionNotice allowed={canAny(['quote.view', 'quote.manage'])} label="xem và quản lý báo giá combo" />
      {formOpen ? (
        <div className="modalOverlay" role="dialog" aria-modal="true">
          <div className="modalPanel modalPanelWide">
            <form onSubmit={handleSubmit(onSubmit)} className="quoteForm">
              <section className="quoteComboShell">
                <div className="quoteComboMain">
                  <section className="panel quoteFormSection">
                    <div className="sectionHeader">
                      <h2>{editingId ? 'Cập nhật báo giá combo' : 'Tạo báo giá combo'}</h2>
                      <span>{message || 'Backend sẽ tính lại NET/người và giá combo trước khi lưu.'}</span>
                    </div>
                    {validationMessage ? <div className="formErrors"><AlertCircle size={15} /> {validationMessage}</div> : null}
                    <h3>Thông tin combo</h3>
                    <div className="quoteComboTop quoteComboInfoGrid">
                      <label>Mã combo<input required {...register('comboCode')} /></label>
                      <label>Loại combo<select required {...register('comboType')}>{comboTypes.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label>
                    </div>
                  </section>

                  <ComboRows register={register} fieldArray={items} suppliers={suppliers} serviceOptions={serviceOptions} setValue={setValue} watchedItems={values.items || []} />

                  <section className="panel quoteFormSection">
                    <h3>Ghi chú</h3>
                    <textarea rows={5} {...register('note')} placeholder="Điều kiện áp dụng, chính sách hoàn hủy, phụ thu cuối tuần..." />
                  </section>
                </div>
                <aside className="panel quoteSummaryBox quoteComboSummary">
                  <h2>Phần tính giá</h2>
                  <div className="summaryRows">
                    <div><span>Tổng NET/người</span><strong>{money(totals.totalNet)}</strong></div>
                  </div>
                  <label>Lợi nhuận/người<input type="number" min="0" step="0.01" inputMode="decimal" {...register('profitPerPax')} /></label>
                  <div className="summaryRows">
                    <div><span>Giá combo người lớn</span><strong>{money(totals.adult)}</strong></div>
                  </div>
                  <label>% giá trẻ em<input type="number" min="0" step="0.01" inputMode="decimal" {...register('childPricePercent')} /></label>
                  <div className="summaryRows">
                    <div><span>Giá combo trẻ em</span><strong>{money(totals.child)}</strong></div>
                  </div>
                  <small>NET/người = tổng từng dịch vụ theo công thức giá NET/DV * số đêm / số khách.</small>
                </aside>
              </section>

              {error ? <div className="quoteAlert quoteAlertError"><AlertCircle size={16} /> {error}</div> : null}

              <div className="hotelFormActions">
                <button type="submit" disabled={formBusy || !can('quote.manage')}><Save size={17} /> {editingId ? 'Lưu báo giá' : 'Tạo báo giá'}</button>
                <button type="button" className="secondaryButton" disabled={!editingId || formBusy || !can('quote.manage')} onClick={() => action('create-order')}><ShoppingCart size={17} /> {actionLoading === 'create-order' ? 'Đang tạo đơn' : 'Tạo đơn hàng'}</button>
                <button type="button" className="secondaryButton" disabled={!editingId || formBusy || !can('quote.manage')} onClick={() => action('create-quote')}><Check size={17} /> {actionLoading === 'create-quote' ? 'Đang chốt' : 'Chốt báo giá'}</button>
                <button type="button" className="dangerButton" onClick={closeForm}><X size={17} /> Đóng</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <section className="panel listPanel">
        <div className="sectionHeader quoteListHeader">
          <div>
            <h2>Danh sách combo</h2>
            <span>{listLoading ? 'Đang tải dữ liệu...' : `${filteredCombos.length} combo`}</span>
          </div>
          <div className="quoteListActions">
            <button type="button" className="secondaryButton iconTextButton" disabled={listLoading} onClick={() => reload()}><RefreshCcw size={16} /> Tải lại danh sách</button>
            <button type="button" className="secondaryButton iconTextButton" disabled={!can('quote.manage')} onClick={openCreate}><Plus size={16} /> Tạo báo giá combo</button>
            <label className="searchBox"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm mã combo, loại combo, trạng thái..." /></label>
          </div>
        </div>
        {listLoading && !formOpen ? <div className="quoteAlert quoteAlertInfo"><RefreshCcw size={16} /> Đang tải lại danh sách combo...</div> : null}
        {loadingComboId && !formOpen ? <div className="quoteAlert quoteAlertInfo">Đang tải chi tiết combo...</div> : null}
        {error && !formOpen ? <div className="quoteAlert quoteAlertError"><AlertCircle size={16} /> {error}</div> : null}
        {message && !formOpen ? <div className="quoteAlert quoteAlertInfo">{message}</div> : null}
        <div className="fitTableWrap quoteListWrap compactListTableWrap">
          <table className="fitTable quoteComboListTable compactListTable">
            <thead>{comboTable.getHeaderGroups().map((group) => <tr key={group.id}>{group.headers.map((header) => <th key={header.id}>{flexRender(header.column.columnDef.header, header.getContext())}</th>)}</tr>)}</thead>
            <tbody>
              {comboTable.getRowModel().rows.map((row) => <tr key={row.id}>{row.getVisibleCells().map((cell) => <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}
              {!comboTable.getRowModel().rows.length ? <tr><td colSpan={7} className="tableEmptyState">{listLoading ? 'Đang tải danh sách combo...' : 'Không có combo phù hợp.'}</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function ComboRows({
  register,
  fieldArray,
  suppliers,
  serviceOptions,
  setValue,
  watchedItems,
}: {
  register: UseFormRegister<ComboForm>;
  fieldArray: UseFieldArrayReturn<ComboForm, 'items', 'id'>;
  suppliers: Supplier[];
  serviceOptions: ServiceOption[];
  setValue: UseFormSetValue<ComboForm>;
  watchedItems: Partial<ComboItem>[];
}) {
  const table = useReactTable({
    data: fieldArray.fields,
    columns: useMemo(() => {
      const helper = createColumnHelper<FieldArrayWithId<ComboForm, 'items', 'id'>>();
      return [
        helper.display({ id: 'stt', header: 'STT', cell: ({ row }) => row.index + 1 }),
        helper.display({
          id: 'supplierId',
          header: 'Nhà cung cấp',
          cell: ({ row }) => {
            const field = register(`items.${row.index}.supplierId`);
            return (
              <select
                {...field}
                onChange={(event) => {
                  field.onChange(event);
                  const supplierId = event.target.value;
                  const currentServiceId = text(watchedItems[row.index]?.serviceId);
                  const currentService = serviceOptions.find((item) => item.id === currentServiceId);
                  if (currentService && currentService.supplierId !== supplierId) {
                    setValue(`items.${row.index}.serviceId`, '');
                    setValue(`items.${row.index}.serviceName`, '');
                    setValue(`items.${row.index}.netPricePerService`, 0);
                  }
                }}
              >
                <option value="">Chọn nhà cung cấp</option>
                {suppliers.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
              </select>
            );
          },
        }),
        helper.display({
          id: 'serviceId',
          header: 'Dịch vụ',
          cell: ({ row }) => {
            const selectedSupplierId = text(watchedItems[row.index]?.supplierId);
            const availableServices = selectedSupplierId ? serviceOptions.filter((item) => item.supplierId === selectedSupplierId) : serviceOptions;
            const field = register(`items.${row.index}.serviceId`);
            return (
              <select
                {...field}
                onChange={(event) => {
                  field.onChange(event);
                  const service = serviceOptions.find((item) => item.id === event.target.value);
                  if (service) {
                    setValue(`items.${row.index}.supplierId`, service.supplierId);
                    setValue(`items.${row.index}.serviceName`, service.serviceName);
                    setValue(`items.${row.index}.netPricePerService`, safeNumber(service.netPrice));
                  }
                }}
              >
                <option value="">Nhập tay/chọn dịch vụ</option>
                {availableServices.map((item) => <option value={item.id} key={`${item.supplierId}:${item.id}`}>{item.supplierName} - {item.serviceName}</option>)}
              </select>
            );
          },
        }),
        ...[
          { key: 'serviceName', label: 'Tên dịch vụ' },
          { key: 'checkIn', label: 'Ngày dùng', type: 'date' },
          { key: 'netPricePerService', label: 'Giá NET/DV', type: 'number' },
          { key: 'nightCount', label: 'Số đêm', type: 'number' },
          { key: 'paxCount', label: 'Số khách', type: 'number' },
        ].map((column) => helper.display({
          id: column.key,
          header: column.label,
          cell: ({ row }) => {
            if (column.type === 'number') {
              const isPaxOrNight = column.key === 'nightCount' || column.key === 'paxCount';
              return <input type="number" required min={isPaxOrNight ? 1 : 0} step={isPaxOrNight ? 1 : 0.01} inputMode={isPaxOrNight ? 'numeric' : 'decimal'} {...register(`items.${row.index}.${column.key}` as any, { valueAsNumber: true })} />;
            }
            return <input type={column.type || 'text'} {...register(`items.${row.index}.${column.key}` as any)} />;
          },
        })),
        helper.display({ id: 'actions', header: '', cell: ({ row }) => <button type="button" className="dangerButton iconButton" aria-label="Xóa dịch vụ" onClick={() => fieldArray.remove(row.index)}><Trash2 size={15} /></button> }),
      ];
    }, [fieldArray, register, serviceOptions, setValue, suppliers, watchedItems]),
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <section className="fitTableBlock">
      <div className="sectionHeader">
        <h2>Danh sách dịch vụ</h2>
        <button type="button" className="secondaryButton" onClick={() => fieldArray.append({ ...emptyItem })}><Plus size={16} /> Thêm dịch vụ</button>
      </div>
      <div className="fitTableWrap">
        <table className="fitTable quoteComboTable">
          <thead>{table.getHeaderGroups().map((group) => <tr key={group.id}>{group.headers.map((header) => <th key={header.id}>{flexRender(header.column.columnDef.header, header.getContext())}</th>)}</tr>)}</thead>
          <tbody>
            {table.getRowModel().rows.map((row) => <tr key={row.id}>{row.getVisibleCells().map((cell) => <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}
            {!table.getRowModel().rows.length ? <tr><td colSpan={9} className="tableEmptyState">Chưa có dịch vụ. Bấm "Thêm dịch vụ" để bắt đầu.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

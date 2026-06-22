'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { AlertCircle, Check, Copy, Pencil, Plus, RefreshCcw, Save, Search, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { FieldArrayWithId, useFieldArray, useForm, UseFieldArrayReturn, UseFormRegister, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { authHeaders, authJsonHeaders } from '../../authFetch';
import { PermissionNotice, usePermissions } from '../../usePermissions';

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

type CostType = 'COMMON' | 'HOTEL' | 'PRIVATE';
type ArrayName = 'costItems' | 'itineraries';

const costTypes: CostType[] = ['COMMON', 'HOTEL', 'PRIVATE'];
const costTypeLabels: Record<CostType, string> = {
  COMMON: 'Chi phí chung',
  HOTEL: 'Khách sạn',
  PRIVATE: 'Chi phí riêng',
};

const statusLabels: Record<string, string> = {
  DRAFT: 'Nháp',
  PENDING: 'Chờ duyệt',
  APPROVED: 'Đã chốt',
  REJECTED: 'Từ chối',
  CONVERTED: 'Đã tạo đơn',
};

const actionLabels = {
  approve: 'chốt báo giá',
  convert: 'tạo đơn hàng',
} as const;

const costSchema = z.object({
  costType: z.enum(['COMMON', 'HOTEL', 'PRIVATE']),
  serviceType: z.string().default(''),
  description: z.string().default(''),
  unit: z.string().default(''),
  quantity: z.coerce.number().min(0, 'Số lượng không được âm').default(1),
  serviceCount: z.coerce.number().min(0, 'Số lượt không được âm').default(1),
  paxPerRoom: z.coerce.number().min(0, 'Số khách/phòng không được âm').default(1),
  currency: z.string().default('VND'),
  exchangeRate: z.coerce.number().min(0, 'Tỷ giá không được âm').default(1),
  unitPrice: z.coerce.number().min(0, 'Đơn giá không được âm').default(0),
  vat: z.coerce.number().min(0, 'VAT/phụ thu không được âm').default(0),
  note: z.string().default(''),
});

const itinerarySchema = z.object({
  dayNo: z.coerce.number().min(1, 'Ngày lịch trình phải từ 1').default(1),
  title: z.string().default(''),
  content: z.string().default(''),
});

const quoteSchema = z.object({
  id: z.string().optional(),
  quoteCode: z.string().trim().min(2, 'Mã báo giá cần ít nhất 2 ký tự'),
  tourCode: z.string().trim().min(2, 'Mã tour cần ít nhất 2 ký tự'),
  tourName: z.string().default(''),
  route: z.string().default(''),
  marketGroup: z.string().default(''),
  currency: z.string().default('VND'),
  exchangeRate: z.coerce.number().min(0, 'Tỷ giá không được âm').default(1),
  bookingDate: z.string().default(''),
  paymentDate: z.string().default(''),
  departureDate: z.string().default(''),
  returnDate: z.string().default(''),
  customerName: z.string().default(''),
  customerPhone: z.string().default(''),
  customerEmail: z.string().email('Email không hợp lệ').or(z.literal('')).default(''),
  customerAddress: z.string().default(''),
  customerNote: z.string().default(''),
  operatorOwner: z.string().default(''),
  collaborator: z.string().default(''),
  adultQty: z.coerce.number().min(0, 'Số người lớn không được âm').default(1),
  childQty: z.coerce.number().min(0, 'Số trẻ em không được âm').default(0),
  infantQty: z.coerce.number().min(0, 'Số em bé không được âm').default(0),
  profit: z.coerce.number().min(0, 'Lợi nhuận không được âm').default(0),
  commission: z.coerce.number().min(0, 'Hoa hồng không được âm').default(0),
  discount: z.coerce.number().min(0, 'Giảm giá không được âm').default(0),
  childPricePercent: z.coerce.number().min(0, '% giá trẻ em không được âm').default(75),
  infantPricePercent: z.coerce.number().min(0, '% giá em bé không được âm').default(20),
  costItems: z.array(costSchema).default([]),
  itineraries: z.array(itinerarySchema).default([]),
});

type QuoteForm = z.infer<typeof quoteSchema>;
type CostItem = QuoteForm['costItems'][number];
type ItineraryItem = QuoteForm['itineraries'][number];

const emptyCost: CostItem = {
  costType: 'COMMON',
  serviceType: '',
  description: '',
  unit: '',
  quantity: 1,
  serviceCount: 1,
  paxPerRoom: 1,
  currency: 'VND',
  exchangeRate: 1,
  unitPrice: 0,
  vat: 0,
  note: '',
};
const emptyItinerary: ItineraryItem = { dayNo: 1, title: '', content: '' };

function freshDefaultValues(): QuoteForm {
  return {
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
}

function browserApiBase() {
  const apiBase = process.env.NEXT_PUBLIC_API_URL || '';
  if (typeof window === 'undefined') return apiBase;
  if (!apiBase || apiBase.includes('smarttour-api-1')) return '';
  return apiBase.replace(/\/$/, '');
}

function money(value: unknown) {
  return safeNumber(value).toLocaleString('vi-VN');
}

function safeNumber(value: unknown, fallback = 0) {
  if (value === '' || value === null || value === undefined) return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function safeNonNegative(value: unknown, fallback = 0) {
  return Math.max(0, safeNumber(value, fallback));
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

function normalizeCostType(value: unknown): CostType {
  return costTypes.includes(value as CostType) ? value as CostType : 'COMMON';
}

function lineAmount(item: Partial<CostItem>) {
  const quantity = safeNumber(item.quantity, 1);
  const serviceCount = safeNumber(item.serviceCount, 1);
  const unitPrice = safeNumber(item.unitPrice);
  const exchangeRate = safeNumber(item.exchangeRate, 1);
  const vat = safeNumber(item.vat);
  return quantity * serviceCount * unitPrice * exchangeRate + vat;
}

function normalizeCostItem(item: unknown): CostItem {
  const row = item && typeof item === 'object' ? item as Record<string, unknown> : {};
  return {
    costType: normalizeCostType(row.costType),
    serviceType: text(row.serviceType),
    description: text(row.description),
    unit: text(row.unit),
    quantity: safeNonNegative(row.quantity, 1),
    serviceCount: safeNonNegative(row.serviceCount, 1),
    paxPerRoom: safeNonNegative(row.paxPerRoom, 1),
    currency: text(row.currency) || 'VND',
    exchangeRate: safeNonNegative(row.exchangeRate, 1),
    unitPrice: safeNonNegative(row.unitPrice),
    vat: safeNonNegative(row.vat),
    note: text(row.note),
  };
}

function normalizeItinerary(item: unknown, index: number): ItineraryItem {
  const row = item && typeof item === 'object' ? item as Record<string, unknown> : {};
  return {
    dayNo: Math.max(1, Math.floor(safeNumber(row.dayNo, index + 1))),
    title: text(row.title),
    content: text(row.content),
  };
}

function hasCostContent(item: CostItem) {
  return Boolean(item.serviceType || item.description || item.note || item.unitPrice > 0 || item.vat > 0);
}

function hasItineraryContent(item: ItineraryItem) {
  return Boolean(item.title || item.content);
}

function normalizeQuoteSummary(item: unknown): QuoteSummary | null {
  if (!item || typeof item !== 'object') return null;
  const row = item as Record<string, unknown>;
  const id = text(row.id);
  if (!id) return null;
  return {
    id,
    quoteCode: text(row.quoteCode),
    tourCode: text(row.tourCode),
    tourName: text(row.tourName) || null,
    customerName: text(row.customerName) || null,
    bookingDate: dateInputValue(row.bookingDate) || null,
    route: text(row.route) || null,
    sellingPrice: String(row.sellingPrice ?? '0'),
    status: text(row.status) || 'DRAFT',
  };
}

function normalizeQuoteList(data: unknown) {
  const rows = Array.isArray(data) ? data : Array.isArray((data as { rows?: unknown })?.rows) ? (data as { rows: unknown[] }).rows : null;
  if (!rows) throw new Error('API không trả về danh sách báo giá tour hợp lệ.');
  const normalized = rows.map(normalizeQuoteSummary).filter((item): item is QuoteSummary => Boolean(item));
  if (rows.length && !normalized.length) throw new Error('API trả về danh sách báo giá tour nhưng thiếu dữ liệu định danh hợp lệ.');
  return normalized;
}

async function responseError(response: Response, fallback: string) {
  const data = await response.json().catch(() => null) as { message?: string | string[] } | null;
  if (Array.isArray(data?.message)) return data.message.join(', ');
  return data?.message || fallback;
}

function statusText(status: string) {
  return statusLabels[status] || status || 'Không rõ';
}

function confirmQuoteAction(action: keyof typeof actionLabels) {
  if (typeof window === 'undefined') return true;
  const message = action === 'approve'
    ? 'X\u00e1c nh\u1eadn ch\u1ed1t b\u00e1o gi\u00e1 tour? Sau khi ch\u1ed1t, th\u00f4ng tin gi\u00e1 s\u1ebd tr\u1edf th\u00e0nh c\u01a1 s\u1edf \u0111\u1ec3 t\u1ea1o \u0111\u01a1n h\u00e0ng.'
    : 'X\u00e1c nh\u1eadn t\u1ea1o \u0111\u01a1n h\u00e0ng t\u1eeb b\u00e1o gi\u00e1 tour n\u00e0y?';
  return window.confirm(message);
}

function buildPayload(data: QuoteForm) {
  const costItems = data.costItems.map((item) => normalizeCostItem(item)).filter(hasCostContent);
  const itineraries = data.itineraries.map((item, index) => normalizeItinerary(item, index)).filter(hasItineraryContent);
  return {
    quoteCode: text(data.quoteCode),
    tourCode: text(data.tourCode),
    tourName: text(data.tourName),
    route: text(data.route),
    marketGroup: text(data.marketGroup),
    currency: text(data.currency) || 'VND',
    exchangeRate: safeNonNegative(data.exchangeRate, 1),
    bookingDate: dateInputValue(data.bookingDate),
    paymentDate: dateInputValue(data.paymentDate),
    departureDate: dateInputValue(data.departureDate),
    returnDate: dateInputValue(data.returnDate),
    customerName: text(data.customerName),
    customerPhone: text(data.customerPhone),
    customerEmail: text(data.customerEmail),
    customerAddress: text(data.customerAddress),
    customerNote: text(data.customerNote),
    operatorOwner: text(data.operatorOwner),
    collaborator: text(data.collaborator),
    adultQty: safeNonNegative(data.adultQty, 1),
    childQty: safeNonNegative(data.childQty),
    infantQty: safeNonNegative(data.infantQty),
    profit: safeNonNegative(data.profit),
    commission: safeNonNegative(data.commission),
    discount: safeNonNegative(data.discount),
    childPricePercent: safeNonNegative(data.childPricePercent, 75),
    infantPricePercent: safeNonNegative(data.infantPricePercent, 20),
    costItems,
    itineraries,
  };
}

export default function QuoteToursClient({ initialQuotes }: { initialQuotes: QuoteSummary[] }) {
  const { can, canAny, permissionsReady } = usePermissions();
  const [quotes, setQuotes] = useState(() => normalizeQuoteList(initialQuotes));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [loadingQuoteId, setLoadingQuoteId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<keyof typeof actionLabels | null>(null);
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<QuoteForm>({
    resolver: zodResolver(quoteSchema) as any,
    defaultValues: freshDefaultValues(),
  });
  const costItems = useFieldArray({ control, name: 'costItems' });
  const itineraries = useFieldArray({ control, name: 'itineraries' });
  const values = useWatch({ control });
  const canViewQuotes = canAny(['quote.view', 'quote.manage']);
  const canManageQuotes = can('quote.manage');
  const canApproveQuote = can('quote.approve');

  const totals = useMemo(() => {
    const items = (values.costItems || []).map(normalizeCostItem);
    const common = items.filter((item) => item.costType === 'COMMON').reduce((sum, item) => sum + lineAmount(item), 0);
    const privateTotal = items.filter((item) => item.costType === 'HOTEL' || item.costType === 'PRIVATE').reduce((sum, item) => sum + lineAmount(item), 0);
    const pax = Math.max(1, safeNumber(values.adultQty) + safeNumber(values.childQty) + safeNumber(values.infantQty));
    const net = common / pax + privateTotal;
    const profit = safeNumber(values.profit);
    const commission = safeNumber(values.commission);
    const discount = safeNumber(values.discount);
    const selling = Math.max(0, net + profit + commission - discount);
    const childPercent = safeNumber(values.childPricePercent, 75);
    const infantPercent = safeNumber(values.infantPricePercent, 20);
    return {
      common,
      privateTotal,
      pax,
      net,
      selling,
      child: selling * childPercent / 100,
      infant: selling * infantPercent / 100,
      profitRate: selling > 0 ? profit / selling * 100 : 0,
    };
  }, [values]);

  const filteredQuotes = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return quotes;
    return quotes.filter((item) => [item.quoteCode, item.tourCode, item.tourName, item.customerName, item.route].filter(Boolean).some((value) => String(value).toLowerCase().includes(term)));
  }, [query, quotes]);

  const quoteTable = useReactTable({
    data: filteredQuotes,
    columns: useMemo(() => {
      const helper = createColumnHelper<QuoteSummary>();
      return [
        helper.accessor('quoteCode', {
          header: 'Mã báo giá',
          cell: (info) => {
            const bookingText = info.row.original.bookingDate ? `Ngày đặt: ${info.row.original.bookingDate}` : 'Chưa có ngày đặt';
            const quoteTitle = `${info.getValue()} · ${bookingText}`;
            return <span className="cellClamp" title={quoteTitle}>{quoteTitle}</span>;
          },
        }),
        helper.accessor('tourCode', {
          header: 'Mã tour',
          cell: (info) => {
            const tourName = info.row.original.tourName || 'Chưa đặt tên tour';
            const tourTitle = `${info.getValue()} · ${tourName}`;
            return <span className="cellClamp" title={tourTitle}>{tourTitle}</span>;
          },
        }),
        helper.accessor('route', {
          header: 'Hành trình',
          cell: (info) => {
            const routeTitle = info.getValue() || 'Chưa có hành trình';
            return <span className="cellClamp" title={routeTitle}>{info.getValue() || '-'}</span>;
          },
        }),
        helper.accessor('customerName', {
          header: 'Người đặt',
          cell: (info) => {
            const customerTitle = info.getValue() || 'Chưa có người đặt';
            return <span className="cellClamp" title={customerTitle}>{info.getValue() || '-'}</span>;
          },
        }),
        helper.accessor('sellingPrice', { header: 'Giá/khách', cell: (info) => <span className="cellClamp" title={money(info.getValue())}>{money(info.getValue())}</span> }),
        helper.accessor('status', { header: 'Trạng thái', cell: (info) => <span className="statusPill">{statusText(info.getValue())}</span> }),
        helper.display({
          id: 'actions',
          header: '',
          cell: ({ row }) => (
            <button type="button" className="secondaryButton iconTextButton" disabled={!canViewQuotes || loadingQuoteId === row.original.id} onClick={() => loadQuote(row.original.id)}>
              <Pencil size={15} /> {loadingQuoteId === row.original.id ? 'Đang tải' : 'Sửa'}
            </button>
          ),
        }),
      ];
    }, [loadingQuoteId, canViewQuotes]),
    getCoreRowModel: getCoreRowModel(),
  });

  async function reload(showSuccess = true) {
    if (!permissionsReady || !canViewQuotes) {
      setQuotes([]);
      setError('B\u1ea1n kh\u00f4ng c\u00f3 quy\u1ec1n xem b\u00e1o gi\u00e1 tour.');
      return;
    }
    setListLoading(true);
    setError('');
    try {
      const response = await fetch(`${browserApiBase()}/api/quotes/tours`, { cache: 'no-store', headers: authHeaders() });
      if (!response.ok) throw new Error(await responseError(response, 'Không tải được danh sách báo giá tour.'));
      const data = await response.json().catch(() => {
        throw new Error('API không trả về JSON hợp lệ cho danh sách báo giá tour.');
      });
      setQuotes(normalizeQuoteList(data));
      if (showSuccess) setMessage('Đã tải lại danh sách báo giá tour.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không tải được danh sách báo giá tour.');
    } finally {
      setListLoading(false);
    }
  }

  async function loadQuote(id: string, showSuccess = true) {
    if (!permissionsReady || !canViewQuotes) {
      setError('B\u1ea1n kh\u00f4ng c\u00f3 quy\u1ec1n xem chi ti\u1ebft b\u00e1o gi\u00e1 tour.');
      return;
    }
    const previousEditingId = editingId;
    const switchingRecord = previousEditingId !== id;
    setLoadingQuoteId(id);
    setError('');
    setMessage('');
    if (switchingRecord) {
      setEditingId(null);
      setFormOpen(false);
      reset(freshDefaultValues());
    }
    try {
      const response = await fetch(`${browserApiBase()}/api/quotes/tours/${id}`, { headers: authHeaders() });
      if (!response.ok) throw new Error(await responseError(response, 'Không tải được chi tiết báo giá tour.'));
      const data = await response.json().catch(() => {
        throw new Error('API không trả về JSON hợp lệ cho chi tiết báo giá tour.');
      });
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error('API không trả về chi tiết báo giá tour hợp lệ.');
      }
      const quote = data as Record<string, unknown>;
      if (!Array.isArray(quote.costItems)) throw new Error('API không trả về danh sách chi phí của báo giá tour hợp lệ.');
      if (!Array.isArray(quote.itineraries)) throw new Error('API không trả về lịch trình của báo giá tour hợp lệ.');
      const costRows = quote.costItems.map(normalizeCostItem);
      const itineraryRows = quote.itineraries.map((item, index) => normalizeItinerary(item, index)).filter(hasItineraryContent);
      setEditingId(id);
      setFormOpen(true);
      reset({
        ...freshDefaultValues(),
        id,
        quoteCode: text(quote.quoteCode),
        tourCode: text(quote.tourCode),
        tourName: text(quote.tourName),
        route: text(quote.route),
        marketGroup: text(quote.marketGroup),
        currency: text(quote.currency) || 'VND',
        exchangeRate: safeNonNegative(quote.exchangeRate, 1),
        bookingDate: dateInputValue(quote.bookingDate),
        paymentDate: dateInputValue(quote.paymentDate),
        departureDate: dateInputValue(quote.departureDate),
        returnDate: dateInputValue(quote.returnDate),
        customerName: text(quote.customerName),
        customerPhone: text(quote.customerPhone),
        customerEmail: text(quote.customerEmail),
        customerAddress: text(quote.customerAddress),
        customerNote: text(quote.customerNote),
        operatorOwner: text(quote.operatorOwner),
        collaborator: text(quote.collaborator),
        adultQty: safeNonNegative(quote.adultQty, 1),
        childQty: safeNonNegative(quote.childQty),
        infantQty: safeNonNegative(quote.infantQty),
        profit: safeNonNegative(quote.profit),
        commission: safeNonNegative(quote.commission),
        discount: safeNonNegative(quote.discount),
        childPricePercent: safeNonNegative(quote.childPricePercent, 75),
        infantPricePercent: safeNonNegative(quote.infantPricePercent, 20),
        costItems: costRows.length ? costRows : [{ ...emptyCost }],
        itineraries: itineraryRows.length ? itineraryRows : [{ ...emptyItinerary }],
      });
      if (showSuccess) setMessage('Đã tải chi tiết báo giá.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không tải được chi tiết báo giá tour.');
      if (switchingRecord) {
        setEditingId(null);
        setFormOpen(false);
        reset(freshDefaultValues());
      }
    } finally {
      setLoadingQuoteId(null);
    }
  }

  async function onSubmit(data: QuoteForm) {
    if (!canManageQuotes) {
      setError('B\u1ea1n kh\u00f4ng c\u00f3 quy\u1ec1n t\u1ea1o ho\u1eb7c c\u1eadp nh\u1eadt b\u00e1o gi\u00e1 tour.');
      return;
    }
    setError('');
    setMessage('');
    const payload = buildPayload(data);
    try {
      const response = await fetch(`${browserApiBase()}/api/quotes/tours${editingId ? `/${editingId}` : ''}`, {
        method: editingId ? 'PUT' : 'POST',
        headers: authJsonHeaders(),
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(await responseError(response, 'Không lưu được báo giá tour. Kiểm tra mã báo giá và các trường bắt buộc.'));
      const successMessage = editingId ? 'Đã cập nhật báo giá tour.' : 'Đã tạo báo giá tour.';
      reset(freshDefaultValues());
      setEditingId(null);
      setFormOpen(false);
      await reload(false);
      setMessage(successMessage);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không lưu được báo giá tour.');
    }
  }

  async function action(path: keyof typeof actionLabels) {
    const currentId = editingId;
    if (!currentId) {
      setError(`Cần mở một báo giá đã lưu trước khi ${actionLabels[path]}.`);
      return;
    }
    if (path === 'approve' && !canApproveQuote) {
      setError('B\u1ea1n kh\u00f4ng c\u00f3 quy\u1ec1n ch\u1ed1t b\u00e1o gi\u00e1 tour.');
      return;
    }
    if (path !== 'approve' && !canManageQuotes) {
      setError(`B\u1ea1n kh\u00f4ng c\u00f3 quy\u1ec1n ${actionLabels[path]}.`);
      return;
    }
    if (!confirmQuoteAction(path)) return;
    setActionLoading(path);
    setError('');
    try {
      const response = await fetch(`${browserApiBase()}/api/quotes/tours/${currentId}/${path}`, {
        method: 'POST',
        headers: authJsonHeaders(),
        body: JSON.stringify({ approvedBy: 'Operator' }),
      });
      if (!response.ok) throw new Error(await responseError(response, `Không thể ${actionLabels[path]}.`));
      await reload(false);
      await loadQuote(currentId, false);
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
    if (!canManageQuotes) {
      setError('B\u1ea1n kh\u00f4ng c\u00f3 quy\u1ec1n t\u1ea1o b\u00e1o gi\u00e1 tour.');
      return;
    }
    setEditingId(null);
    setMessage('');
    setError('');
    reset(freshDefaultValues());
    setFormOpen(true);
  }

  const validationMessage = errors.quoteCode?.message || errors.tourCode?.message || errors.customerEmail?.message;
  const formBusy = isSubmitting || listLoading || Boolean(actionLoading || loadingQuoteId);

  useEffect(() => {
    if (!permissionsReady || canViewQuotes) return;
    setQuotes([]);
    setEditingId(null);
    setQuery('');
    setMessage('');
    setError('');
    setFormOpen(false);
    reset(freshDefaultValues());
  }, [permissionsReady, canViewQuotes, reset]);

  return (
    <div className="quotePage">
      <PermissionNotice allowed={!permissionsReady || canViewQuotes} label="xem v\u00e0 qu\u1ea3n l\u00fd b\u00e1o gi\u00e1 tour" />
      {canViewQuotes ? (
        <>
      {formOpen ? (
        <div className="modalOverlay" role="dialog" aria-modal="true">
          <div className="modalPanel modalPanelWide">
            <form onSubmit={handleSubmit(onSubmit)} className="quoteForm">
              <section className="panel quoteFormSection">
                <div className="sectionHeader">
                  <h2>{editingId ? 'Cập nhật báo giá tour' : 'Tạo báo giá tour'}</h2>
                  <span>{message || 'Giá được tính realtime trên form, backend sẽ tính lại trước khi lưu.'}</span>
                </div>
                {validationMessage ? <div className="formErrors"><AlertCircle size={15} /> {validationMessage}</div> : null}
                <h3>Thông tin chung</h3>
                <div className="quoteFormGrid">
                  <label>Mã báo giá<input required {...register('quoteCode')} /></label>
                  <label>Mã tour<input required {...register('tourCode')} /></label>
                  <label>Tên tour<input {...register('tourName')} /></label>
                  <label>Hành trình<input {...register('route')} /></label>
                  <label>Thị trường<input {...register('marketGroup')} /></label>
                  <label>Tiền tệ<input {...register('currency')} /></label>
                  <label>Tỷ giá chung<input type="number" min="0" step="0.01" inputMode="decimal" {...register('exchangeRate')} /></label>
                  <label>Ngày đặt<input type="date" {...register('bookingDate')} /></label>
                  <label>Ngày thanh toán<input type="date" {...register('paymentDate')} /></label>
                  <label>Ngày đi<input type="date" {...register('departureDate')} /></label>
                  <label>Ngày về<input type="date" {...register('returnDate')} /></label>
                  <label>Điều hành<input {...register('operatorOwner')} /></label>
                  <label>Cộng tác viên<input {...register('collaborator')} /></label>
                </div>
              </section>

              <section className="panel quoteFormSection">
                <h3>Khách hàng</h3>
                <div className="quoteFormGrid">
                  <label>Họ tên khách<input {...register('customerName')} /></label>
                  <label>Điện thoại<input {...register('customerPhone')} /></label>
                  <label>Email<input type="email" {...register('customerEmail')} /></label>
                  <label className="span2">Địa chỉ<input {...register('customerAddress')} /></label>
                  <label className="span2">Ghi chú khách hàng<textarea rows={2} {...register('customerNote')} /></label>
                </div>
              </section>

              <section className="panel quoteFormSection">
                <h3>Khách đoàn và số khách</h3>
                <div className="quoteFormGrid quotePaxGrid">
                  <label>Người lớn<input type="number" min="0" step="1" inputMode="numeric" {...register('adultQty')} /></label>
                  <label>Trẻ em<input type="number" min="0" step="1" inputMode="numeric" {...register('childQty')} /></label>
                  <label>Em bé<input type="number" min="0" step="1" inputMode="numeric" {...register('infantQty')} /></label>
                  <label>% giá trẻ em<input type="number" min="0" step="0.01" inputMode="decimal" {...register('childPricePercent')} /></label>
                  <label>% giá em bé<input type="number" min="0" step="0.01" inputMode="decimal" {...register('infantPricePercent')} /></label>
                </div>
              </section>

              <section className="quoteWorkArea">
                <div className="quoteMain">
                  <CostRows register={register} fieldArray={costItems} />
                  <ItineraryRows register={register} fieldArray={itineraries} />
                </div>
                <aside className="panel quoteSummaryBox">
                  <h2>Giá bán dự kiến</h2>
                  <div className="summaryRows">
                    <div><span>Chi phí chung</span><strong>{money(totals.common)}</strong></div>
                    <div><span>Chi phí riêng</span><strong>{money(totals.privateTotal)}</strong></div>
                    <div><span>Tổng khách</span><strong>{totals.pax}</strong></div>
                    <div><span>Giá NET/khách</span><strong>{money(totals.net)}</strong></div>
                  </div>
                  <label>Lợi nhuận/khách<input type="number" min="0" step="0.01" inputMode="decimal" {...register('profit')} /></label>
                  <label>Hoa hồng/khách<input type="number" min="0" step="0.01" inputMode="decimal" {...register('commission')} /></label>
                  <label>Giảm giá/khách<input type="number" min="0" step="0.01" inputMode="decimal" {...register('discount')} /></label>
                  <div className="summaryRows">
                    <div><span>Giá bán người lớn</span><strong>{money(totals.selling)}</strong></div>
                    <div><span>Giá trẻ em</span><strong>{money(totals.child)}</strong></div>
                    <div><span>Giá em bé</span><strong>{money(totals.infant)}</strong></div>
                    <div><span>Tỷ lệ lãi</span><strong>{totals.profitRate.toFixed(1)}%</strong></div>
                  </div>
                  <small>VAT/phụ thu trong cost item được cộng trực tiếp sau quy đổi tỷ giá, khớp công thức backend.</small>
                </aside>
              </section>

              {error ? <div className="quoteAlert quoteAlertError"><AlertCircle size={16} /> {error}</div> : null}

              <div className="hotelFormActions">
                <button type="submit" disabled={formBusy || !canManageQuotes}><Save size={17} /> {editingId ? 'Lưu thay đổi' : 'Tạo báo giá'}</button>
                <button type="button" className="secondaryButton" disabled={!editingId || formBusy || !canApproveQuote} onClick={() => action('approve')}><Check size={17} /> {actionLoading === 'approve' ? 'Đang chốt' : 'Chốt báo giá'}</button>
                <button type="button" className="secondaryButton" disabled={!editingId || formBusy || !canManageQuotes} onClick={() => action('convert')}><Copy size={17} /> {actionLoading === 'convert' ? 'Đang tạo đơn' : 'Tạo đơn hàng'}</button>
                <button type="button" className="dangerButton" onClick={closeForm}><X size={17} /> Đóng</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <section className="panel listPanel">
        <div className="sectionHeader quoteListHeader">
          <div>
            <h2>Danh sách báo giá tour</h2>
            <span>{listLoading ? 'Đang tải dữ liệu...' : `${filteredQuotes.length} báo giá`}</span>
          </div>
          <div className="quoteListActions">
            <button type="button" className="secondaryButton iconTextButton" disabled={!canViewQuotes || listLoading} onClick={() => reload()}><RefreshCcw size={16} /> Tải lại danh sách</button>
            <button type="button" className="secondaryButton iconTextButton" disabled={!canManageQuotes} onClick={openCreate}><Plus size={16} /> Tạo báo giá</button>
            <label className="searchBox"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm mã báo giá, mã tour, người đặt, hành trình..." /></label>
          </div>
        </div>
        {listLoading && !formOpen ? <div className="quoteAlert quoteAlertInfo"><RefreshCcw size={16} /> Đang tải lại danh sách báo giá tour...</div> : null}
        {loadingQuoteId && !formOpen ? <div className="quoteAlert quoteAlertInfo">Đang tải chi tiết báo giá tour...</div> : null}
        {error && !formOpen ? <div className="quoteAlert quoteAlertError"><AlertCircle size={16} /> {error}</div> : null}
        {message && !formOpen ? <div className="quoteAlert quoteAlertInfo">{message}</div> : null}
        <div className="fitTableWrap quoteListWrap compactListTableWrap">
          <table className="fitTable quoteListTable compactListTable">
            <thead>{quoteTable.getHeaderGroups().map((group) => <tr key={group.id}>{group.headers.map((header) => <th key={header.id}>{flexRender(header.column.columnDef.header, header.getContext())}</th>)}</tr>)}</thead>
            <tbody>
              {quoteTable.getRowModel().rows.map((row) => <tr key={row.id}>{row.getVisibleCells().map((cell) => <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}
              {!quoteTable.getRowModel().rows.length ? <tr><td colSpan={7} className="tableEmptyState">{listLoading ? 'Đang tải danh sách báo giá...' : 'Không có báo giá tour phù hợp.'}</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
        </>
      ) : null}
    </div>
  );
}

function CostRows({ register, fieldArray }: { register: UseFormRegister<QuoteForm>; fieldArray: UseFieldArrayReturn<QuoteForm, 'costItems', 'id'> }) {
  const columns = [
    { key: 'costType', label: 'Nhóm chi phí' },
    { key: 'serviceType', label: 'Loại dịch vụ' },
    { key: 'description', label: 'Diễn giải' },
    { key: 'unit', label: 'Đơn vị tính' },
    { key: 'quantity', label: 'Số lượng', type: 'number' },
    { key: 'serviceCount', label: 'Số lượt', type: 'number' },
    { key: 'exchangeRate', label: 'Tỷ giá', type: 'number' },
    { key: 'unitPrice', label: 'Đơn giá', type: 'number' },
    { key: 'vat', label: 'VAT/phụ thu', type: 'number' },
    { key: 'note', label: 'Ghi chú' },
  ];
  return <DynamicRows title="Chi phí tour" name="costItems" register={register} fieldArray={fieldArray} columns={columns} emptyRow={emptyCost} />;
}

function ItineraryRows({ register, fieldArray }: { register: UseFormRegister<QuoteForm>; fieldArray: UseFieldArrayReturn<QuoteForm, 'itineraries', 'id'> }) {
  return <DynamicRows title="Lịch trình tour" name="itineraries" register={register} fieldArray={fieldArray} columns={[{ key: 'dayNo', label: 'Ngày trong tour', type: 'number' }, { key: 'title', label: 'Tiêu đề' }, { key: 'content', label: 'Nội dung', type: 'textarea' }]} emptyRow={emptyItinerary} />;
}

function DynamicRows<T extends ArrayName>({ title, name, register, fieldArray, columns, emptyRow }: { title: string; name: T; register: UseFormRegister<QuoteForm>; fieldArray: UseFieldArrayReturn<QuoteForm, T, 'id'>; columns: Array<{ key: string; label: string; type?: string }>; emptyRow: Record<string, unknown> }) {
  const table = useReactTable({
    data: fieldArray.fields,
    columns: useMemo(() => {
      const helper = createColumnHelper<FieldArrayWithId<QuoteForm, T, 'id'>>();
      return [
        helper.display({ id: 'stt', header: 'STT', cell: ({ row }) => row.index + 1 }),
        ...columns.map((column) => helper.display({ id: column.key, header: column.label, cell: ({ row }) => <RowInput name={name} index={row.index} column={column} register={register} /> })),
        helper.display({ id: 'actions', header: '', cell: ({ row }) => <button type="button" className="dangerButton iconButton" aria-label="Xóa dòng" onClick={() => fieldArray.remove(row.index)}><Trash2 size={15} /></button> }),
      ];
    }, [columns, fieldArray, name, register]),
    getCoreRowModel: getCoreRowModel(),
  });

  function addCost(type: CostType) {
    fieldArray.append({ ...emptyRow, costType: type } as any);
  }

  return (
    <section className="fitTableBlock">
      <div className="sectionHeader">
        <h2>{title}</h2>
        {name === 'costItems' ? (
          <div className="fitActions">
            <button type="button" className="secondaryButton" onClick={() => addCost('COMMON')}><Plus size={16} /> Chi phí chung</button>
            <button type="button" className="secondaryButton" onClick={() => addCost('HOTEL')}><Plus size={16} /> Khách sạn</button>
            <button type="button" className="secondaryButton" onClick={() => addCost('PRIVATE')}><Plus size={16} /> Chi phí riêng</button>
          </div>
        ) : <button type="button" className="secondaryButton" onClick={() => fieldArray.append({ ...emptyRow } as any)}><Plus size={16} /> Thêm ngày tour</button>}
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
    return (
      <select {...register(field as any)}>
        {costTypes.map((type) => <option key={type} value={type}>{costTypeLabels[type]}</option>)}
      </select>
    );
  }
  if (column.type === 'textarea') return <textarea rows={2} {...register(field as any)} />;
  if (column.type === 'number') {
    const isDayNo = column.key === 'dayNo';
    return <input type="number" required min={isDayNo ? 1 : 0} step={isDayNo ? 1 : 0.01} inputMode={isDayNo ? 'numeric' : 'decimal'} {...register(field as any, { valueAsNumber: true })} />;
  }
  return <input type="text" {...register(field as any)} />;
}

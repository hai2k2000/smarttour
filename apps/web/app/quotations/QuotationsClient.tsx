'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { AlertCircle, Check, Copy, Link as LinkIcon, Pencil, Plus, RefreshCcw, Save, Search, Send, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { authHeaders, authJsonHeaders } from '../authFetch';
import { PermissionNotice, usePermissions } from '../usePermissions';

type Dashboard = {
  total: number;
  totalValue: number;
  pending: number;
  approved: number;
  converted: number;
  expired: number;
};

type QuotationSummary = {
  id: string;
  quoteCode: string;
  productType: string;
  customerName: string | null;
  customerPhone: string | null;
  route: string | null;
  totalSelling: string | number;
  sellingPerPax: string | number;
  status: string;
  smartLinkToken: string | null;
  _count?: { items: number; logs: number };
};

type QuotationAction = 'submit' | 'approve' | 'smartlink-on' | 'smartlink-off' | 'convert';

const emptyDashboard: Dashboard = { total: 0, totalValue: 0, pending: 0, approved: 0, converted: 0, expired: 0 };

const productTypes = ['FIT', 'GIT', 'LANDTOUR', 'COMBO', 'BOOKING', 'VISA', 'SERVICE'] as const;
const statuses = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'EXPIRED', 'CONVERTED', 'CANCELLED'] as const;
const services = ['Vé máy bay', 'Khách sạn', 'Xe', 'Nhà hàng', 'Hướng dẫn viên', 'Vé tham quan', 'Visa', 'Bảo hiểm', 'Sim', 'Dịch vụ khác'];

const productTypeLabels: Record<string, string> = {
  FIT: 'Tour FIT',
  GIT: 'Tour GIT',
  LANDTOUR: 'LandTour',
  COMBO: 'Combo',
  BOOKING: 'Booking phòng',
  VISA: 'Visa / hộ chiếu',
  SERVICE: 'Dịch vụ',
};

const serviceTypeLabels: Record<string, string> = {
  FLIGHT: 'Vé máy bay',
  FLIGHT_ORDER: 'Vé máy bay',
  HOTEL: 'Khách sạn',
  HOTEL_BOOKING: 'Khách sạn',
  TRANSPORT: 'Xe',
  CAR: 'Xe',
  RESTAURANT: 'Nhà hàng',
  MEAL: 'Nhà hàng',
  GUIDE: 'Hướng dẫn viên',
  TICKET: 'Vé tham quan',
  ATTRACTION_TICKET: 'Vé tham quan',
  VISA: 'Visa / hộ chiếu',
  INSURANCE: 'Bảo hiểm',
  SIM: 'SIM du lịch',
  OTHER: 'Dịch vụ khác',
  SERVICE: 'Dịch vụ khác',
};

const statusLabels: Record<string, string> = {
  DRAFT: 'Nháp',
  PENDING_APPROVAL: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Từ chối',
  EXPIRED: 'Hết hạn',
  CONVERTED: 'Đã chuyển đơn',
  CANCELLED: 'Đã hủy',
};

const actionLabels: Record<QuotationAction, string> = {
  submit: 'gửi duyệt',
  approve: 'duyệt báo giá',
  'smartlink-on': 'bật SmartLink',
  'smartlink-off': 'tắt SmartLink',
  convert: 'chuyển đơn hàng',
};

const itemSchema = z.object({
  serviceType: z.string().default('Khách sạn'),
  supplierId: z.string().default(''),
  serviceId: z.string().default(''),
  supplierName: z.string().default(''),
  serviceName: z.string().default(''),
  unit: z.string().default(''),
  quantity: z.coerce.number().min(0, 'Số lượng không được âm').default(1),
  paxCount: z.coerce.number().min(0, 'Số khách không được âm').default(1),
  nightCount: z.coerce.number().min(0, 'Số đêm không được âm').default(1),
  netPrice: z.coerce.number().min(0, 'Giá NET không được âm').default(0),
  vat: z.coerce.number().min(0, 'VAT không được âm').default(0),
  markupAmount: z.coerce.number().default(0),
  markupPercent: z.coerce.number().default(0),
  note: z.string().default(''),
});

const quotationSchema = z.object({
  quoteCode: z.string().trim().min(2, 'Mã báo giá cần ít nhất 2 ký tự'),
  productType: z.enum(productTypes).default('FIT'),
  customerCode: z.string().default(''),
  customerName: z.string().default(''),
  customerPhone: z.string().default(''),
  customerEmail: z.string().email('Email không hợp lệ').or(z.literal('')).default(''),
  salesOwner: z.string().default(''),
  operatorOwner: z.string().default(''),
  branch: z.string().default(''),
  department: z.string().default(''),
  marketGroup: z.string().default(''),
  productCategory: z.string().default(''),
  route: z.string().default(''),
  paxAdult: z.coerce.number().int('Số người lớn phải là số nguyên').min(0, 'Số người lớn không được âm').default(1),
  paxChild: z.coerce.number().int('Số trẻ em phải là số nguyên').min(0, 'Số trẻ em không được âm').default(0),
  paxInfant: z.coerce.number().int('Số em bé phải là số nguyên').min(0, 'Số em bé không được âm').default(0),
  currency: z.string().default('VND'),
  exchangeRate: z.coerce.number().min(0, 'Tỷ giá không được âm').default(1),
  createdDate: z.string().default(''),
  expiredDate: z.string().default(''),
  expectedPaymentDate: z.string().default(''),
  departureDate: z.string().default(''),
  returnDate: z.string().default(''),
  approvalLevel: z.coerce.number().int('Cấp duyệt phải là số nguyên').min(0, 'Cấp duyệt không được âm').default(1),
  status: z.enum(statuses).default('DRAFT'),
  childPricePercent: z.coerce.number().min(0, '% giá trẻ em không được âm').default(75),
  infantPricePercent: z.coerce.number().min(0, '% giá em bé không được âm').default(20),
  smartLinkEnabled: z.boolean().default(false),
  smartLinkToken: z.string().default(''),
  language: z.string().default('VI'),
  terms: z.string().default(''),
  note: z.string().default(''),
  items: z.array(itemSchema).default([]),
});

type QuotationForm = z.infer<typeof quotationSchema>;
type QuotationItem = QuotationForm['items'][number];

const emptyItem: QuotationItem = {
  serviceType: 'Khách sạn',
  supplierId: '',
  serviceId: '',
  supplierName: '',
  serviceName: '',
  unit: '',
  quantity: 1,
  paxCount: 1,
  nightCount: 1,
  netPrice: 0,
  vat: 0,
  markupAmount: 0,
  markupPercent: 0,
  note: '',
};

function freshDefaultValues(): QuotationForm {
  return {
    quoteCode: `QTE${Date.now().toString().slice(-6)}`,
    productType: 'FIT',
    customerCode: '',
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    salesOwner: 'Sales',
    operatorOwner: 'Nhân sự vận hành',
    branch: '',
    department: '',
    marketGroup: '',
    productCategory: '',
    route: '',
    paxAdult: 1,
    paxChild: 0,
    paxInfant: 0,
    currency: 'VND',
    exchangeRate: 1,
    createdDate: '',
    expiredDate: '',
    expectedPaymentDate: '',
    departureDate: '',
    returnDate: '',
    approvalLevel: 1,
    status: 'DRAFT',
    childPricePercent: 75,
    infantPricePercent: 20,
    smartLinkEnabled: false,
    smartLinkToken: '',
    language: 'VI',
    terms: '',
    note: '',
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

function normalizeProductType(value: unknown): QuotationForm['productType'] {
  return productTypes.includes(value as QuotationForm['productType']) ? value as QuotationForm['productType'] : 'FIT';
}

function normalizeStatus(value: unknown): QuotationForm['status'] {
  return statuses.includes(value as QuotationForm['status']) ? value as QuotationForm['status'] : 'DRAFT';
}

function statusText(status: unknown) {
  const key = text(status);
  return statusLabels[key] || key || 'Không rõ';
}

function productTypeText(productType: unknown) {
  const key = text(productType);
  return productTypeLabels[key] || key || '-';
}

function serviceTypeText(serviceType: unknown) {
  const key = text(serviceType);
  return serviceTypeLabels[key] || key || '-';
}

function statusPillClass(status: unknown) {
  const key = text(status);
  if (key === 'APPROVED' || key === 'CONVERTED') return 'statusPill statusPillSuccess';
  if (key === 'PENDING_APPROVAL' || key === 'EXPIRED') return 'statusPill statusPillWarning';
  if (key === 'REJECTED' || key === 'CANCELLED') return 'statusPill statusPillError';
  return 'statusPill statusPillNeutral';
}

function positiveRate(value: unknown, fallback = 1) {
  const number = safeNumber(value, fallback);
  return number > 0 ? number : fallback;
}

function itemCost(item: Partial<QuotationItem>, exchangeRateValue: unknown = 1) {
  const quantity = safeNumber(item.quantity, 1);
  const nightCount = safeNumber(item.nightCount, 1);
  const netPrice = safeNumber(item.netPrice);
  const vat = safeNumber(item.vat);
  return quantity * nightCount * netPrice * positiveRate(exchangeRateValue) * (1 + vat / 100);
}

function itemMarkup(item: Partial<QuotationItem>, exchangeRateValue: unknown = 1) {
  const cost = itemCost(item, exchangeRateValue);
  return safeNumber(item.markupAmount) + cost * (safeNumber(item.markupPercent) / 100);
}

function normalizeItem(item: unknown): QuotationItem {
  const row = item && typeof item === 'object' ? item as Record<string, unknown> : {};
  return {
    serviceType: text(row.serviceType) || 'Khách sạn',
    supplierId: text(row.supplierId),
    serviceId: text(row.serviceId),
    supplierName: text(row.supplierName),
    serviceName: text(row.serviceName),
    unit: text(row.unit),
    quantity: safeNonNegative(row.quantity, 1),
    paxCount: safeNonNegative(row.paxCount, 1),
    nightCount: safeNonNegative(row.nightCount, 1),
    netPrice: safeNonNegative(row.netPrice),
    vat: safeNonNegative(row.vat),
    markupAmount: safeNumber(row.markupAmount),
    markupPercent: safeNumber(row.markupPercent),
    note: text(row.note),
  };
}

function hasItemContent(item: QuotationItem) {
  return Boolean(
    item.serviceName ||
    item.supplierName ||
    item.unit ||
    item.note ||
    item.netPrice > 0 ||
    item.vat > 0 ||
    item.markupAmount !== 0 ||
    item.markupPercent !== 0,
  );
}

function hasValidItem(item: QuotationItem) {
  return item.serviceName.trim().length >= 2 && item.serviceType.trim().length >= 2;
}

function normalizeDashboard(data: unknown): Dashboard {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('API dashboard không trả về dữ liệu hợp lệ.');
  }
  const row = data as Record<string, unknown>;
  return {
    total: safeNonNegativeInt(row.total),
    totalValue: safeNonNegative(row.totalValue),
    pending: safeNonNegativeInt(row.pending),
    approved: safeNonNegativeInt(row.approved),
    converted: safeNonNegativeInt(row.converted),
    expired: safeNonNegativeInt(row.expired),
  };
}

function normalizeQuotationSummary(item: unknown): QuotationSummary | null {
  if (!item || typeof item !== 'object') return null;
  const row = item as Record<string, unknown>;
  const id = text(row.id);
  if (!id) return null;
  return {
    id,
    quoteCode: text(row.quoteCode),
    productType: text(row.productType) || 'FIT',
    customerName: text(row.customerName) || null,
    customerPhone: text(row.customerPhone) || null,
    route: text(row.route) || null,
    totalSelling: row.totalSelling == null ? '0' : String(row.totalSelling),
    sellingPerPax: row.sellingPerPax == null ? '0' : String(row.sellingPerPax),
    status: text(row.status) || 'DRAFT',
    smartLinkToken: text(row.smartLinkToken) || null,
    _count: row._count && typeof row._count === 'object' ? row._count as QuotationSummary['_count'] : undefined,
  };
}

function normalizeQuotationList(data: unknown) {
  const rows = Array.isArray(data) ? data : Array.isArray((data as { rows?: unknown })?.rows) ? (data as { rows: unknown[] }).rows : null;
  if (!rows) throw new Error('API không trả về danh sách báo giá hợp lệ.');
  const normalized = rows.map(normalizeQuotationSummary).filter((item): item is QuotationSummary => Boolean(item));
  if (rows.length && !normalized.length) throw new Error('API trả về danh sách báo giá nhưng thiếu dữ liệu định danh hợp lệ.');
  return normalized;
}

function derivePercent(price: unknown, sellingPerPax: unknown, fallback: number) {
  const selling = safeNumber(sellingPerPax);
  if (selling <= 0) return fallback;
  const percent = safeNumber(price) / selling * 100;
  return Number.isFinite(percent) && percent >= 0 ? percent : fallback;
}

function normalizeQuotationForm(data: unknown): QuotationForm {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('API không trả về chi tiết báo giá hợp lệ.');
  }
  const row = data as Record<string, unknown>;
  if (!Array.isArray(row.items)) throw new Error('API không trả về danh sách dịch vụ của báo giá hợp lệ.');
  const items = row.items.map(normalizeItem);
  const defaults = freshDefaultValues();
  return {
    ...defaults,
    quoteCode: text(row.quoteCode) || defaults.quoteCode,
    productType: normalizeProductType(row.productType),
    customerCode: text(row.customerCode),
    customerName: text(row.customerName),
    customerPhone: text(row.customerPhone),
    customerEmail: text(row.customerEmail),
    salesOwner: text(row.salesOwner) || defaults.salesOwner,
    operatorOwner: text(row.operatorOwner) || defaults.operatorOwner,
    branch: text(row.branch),
    department: text(row.department),
    marketGroup: text(row.marketGroup),
    productCategory: text(row.productCategory),
    route: text(row.route),
    paxAdult: safeNonNegativeInt(row.paxAdult, 1),
    paxChild: safeNonNegativeInt(row.paxChild),
    paxInfant: safeNonNegativeInt(row.paxInfant),
    currency: text(row.currency) || 'VND',
    exchangeRate: safeNonNegative(row.exchangeRate, 1),
    createdDate: dateInputValue(row.createdDate),
    expiredDate: dateInputValue(row.expiredDate),
    expectedPaymentDate: dateInputValue(row.expectedPaymentDate),
    departureDate: dateInputValue(row.departureDate),
    returnDate: dateInputValue(row.returnDate),
    approvalLevel: safeNonNegativeInt(row.approvalLevel, 1),
    status: normalizeStatus(row.status),
    childPricePercent: derivePercent(row.childPrice, row.sellingPerPax, 75),
    infantPricePercent: derivePercent(row.infantPrice, row.sellingPerPax, 20),
    smartLinkEnabled: Boolean(row.smartLinkEnabled),
    smartLinkToken: text(row.smartLinkToken),
    language: text(row.language) || 'VI',
    terms: text(row.terms),
    note: text(row.note),
    items: items.length ? items : [{ ...emptyItem }],
  };
}

function confirmQuotationAction(action: QuotationAction) {
  if (typeof window === 'undefined') return true;
  if (action !== 'approve' && action !== 'convert') return true;
  const message = action === 'approve'
    ? 'X\u00e1c nh\u1eadn duy\u1ec7t b\u00e1o gi\u00e1? Sau khi duy\u1ec7t, c\u00e1c \u0111i\u1ec1u kho\u1ea3n th\u01b0\u01a1ng m\u1ea1i s\u1ebd kh\u00f4ng \u0111\u01b0\u1ee3c s\u1eeda tr\u1ef1c ti\u1ebfp.'
    : 'X\u00e1c nh\u1eadn chuy\u1ec3n b\u00e1o gi\u00e1 th\u00e0nh \u0111\u01a1n h\u00e0ng?';
  return window.confirm(message);
}

function buildPayload(data: QuotationForm) {
  const normalizedItems = data.items.map(normalizeItem);
  const touchedItems = normalizedItems.filter(hasItemContent);
  const invalidItems = touchedItems.filter((item) => !hasValidItem(item));
  if (invalidItems.length) {
    throw new Error('Có dòng dịch vụ đã nhập chi phí hoặc ghi chú nhưng thiếu loại dịch vụ hoặc tên dịch vụ tối thiểu 2 ký tự.');
  }
  if (!touchedItems.length) {
    throw new Error('Cần ít nhất một dòng dịch vụ hợp lệ trước khi lưu báo giá.');
  }
  return {
    quoteCode: text(data.quoteCode),
    productType: normalizeProductType(data.productType),
    customerCode: text(data.customerCode),
    customerName: text(data.customerName),
    customerPhone: text(data.customerPhone),
    customerEmail: text(data.customerEmail),
    salesOwner: text(data.salesOwner),
    operatorOwner: text(data.operatorOwner),
    branch: text(data.branch),
    department: text(data.department),
    marketGroup: text(data.marketGroup),
    productCategory: text(data.productCategory),
    route: text(data.route),
    paxAdult: safeNonNegativeInt(data.paxAdult, 1),
    paxChild: safeNonNegativeInt(data.paxChild),
    paxInfant: safeNonNegativeInt(data.paxInfant),
    currency: text(data.currency) || 'VND',
    exchangeRate: positiveRate(data.exchangeRate),
    createdDate: dateInputValue(data.createdDate),
    expiredDate: dateInputValue(data.expiredDate),
    expectedPaymentDate: dateInputValue(data.expectedPaymentDate),
    departureDate: dateInputValue(data.departureDate),
    returnDate: dateInputValue(data.returnDate),
    approvalLevel: safeNonNegativeInt(data.approvalLevel, 1),
    childPricePercent: safeNonNegative(data.childPricePercent, 75),
    infantPricePercent: safeNonNegative(data.infantPricePercent, 20),
    language: text(data.language) || 'VI',
    terms: text(data.terms),
    note: text(data.note),
    items: touchedItems,
  };
}

async function responseError(response: Response, fallback: string) {
  const data = await response.json().catch(() => null) as { message?: string | string[]; error?: string } | null;
  if (Array.isArray(data?.message)) return data.message.join(', ');
  return data?.message || data?.error || fallback;
}

function formErrorText(error: unknown): string {
  if (!error || typeof error !== 'object') return '';
  const record = error as Record<string, unknown>;
  if (typeof record.message === 'string') return record.message;
  for (const value of Object.values(record)) {
    const nested = formErrorText(value);
    if (nested) return nested;
  }
  return '';
}

export default function QuotationsClient({ initialDashboard, initialQuotations }: { initialDashboard: Dashboard; initialQuotations: QuotationSummary[] }) {
  const { can, canAny, permissionsReady } = usePermissions();
  const [dashboard, setDashboard] = useState(() => {
    try {
      return normalizeDashboard(initialDashboard);
    } catch {
      return emptyDashboard;
    }
  });
  const [quotations, setQuotations] = useState(() => {
    try {
      return normalizeQuotationList(initialQuotations);
    } catch {
      return [];
    }
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [reloading, setReloading] = useState(false);
  const [loadingQuotationId, setLoadingQuotationId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<QuotationAction | null>(null);

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<QuotationForm>({
    resolver: zodResolver(quotationSchema) as any,
    defaultValues: freshDefaultValues(),
  });
  const items = useFieldArray({ control, name: 'items' });
  const values = useWatch({ control });
  const validationError = formErrorText(errors);
  const currentStatus = normalizeStatus(values.status);
  const isSmartLinkEnabled = Boolean(values.smartLinkEnabled);
  const canViewQuotations = canAny(['quotation.view', 'quotation.manage']);
  const canManageQuotations = can('quotation.manage');
  const canApproveQuotation = can('quotation.approve');

  const totals = useMemo(() => {
    const rows = (values.items || []).map(normalizeItem).filter(hasItemContent);
    const exchangeRate = positiveRate(values.exchangeRate);
    const totalCost = rows.reduce((sum, item) => sum + itemCost(item, exchangeRate), 0);
    const totalMarkup = rows.reduce((sum, item) => sum + itemMarkup(item, exchangeRate), 0);
    const totalSelling = totalCost + totalMarkup;
    const pax = Math.max(1, safeNumber(values.paxAdult) + safeNumber(values.paxChild) + safeNumber(values.paxInfant));
    const costPerPax = totalCost / pax;
    const sellingPerPax = totalSelling / pax;
    const childPrice = sellingPerPax * safeNumber(values.childPricePercent, 75) / 100;
    const infantPrice = sellingPerPax * safeNumber(values.infantPricePercent, 20) / 100;
    return {
      totalCost,
      totalMarkup,
      totalSelling,
      pax,
      costPerPax,
      sellingPerPax,
      profitPerPax: sellingPerPax - costPerPax,
      marginRate: totalSelling ? totalMarkup / totalSelling * 100 : 0,
      adultPrice: sellingPerPax,
      childPrice,
      infantPrice,
    };
  }, [values]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return quotations;
    return quotations.filter((item) =>
      [item.quoteCode, item.productType, item.customerName, item.customerPhone, item.route]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    );
  }, [query, quotations]);

  const table = useReactTable({
    data: filtered,
    columns: useMemo(() => {
      const helper = createColumnHelper<QuotationSummary>();
      return [
        helper.display({
          id: 'code',
          header: 'Mã báo giá',
          cell: ({ row }) => {
            const codeTitle = `${row.original.quoteCode || '-'} · ${productTypeText(row.original.productType)}`;
            return <span className="cellClamp" title={codeTitle}>{codeTitle}</span>;
          },
        }),
        helper.display({
          id: 'customer',
          header: 'Khách hàng',
          cell: ({ row }) => {
            const customerTitle = `${row.original.customerName || '-'} · ${row.original.customerPhone || 'Chưa có điện thoại'}`;
            return <span className="cellClamp" title={customerTitle}>{customerTitle}</span>;
          },
        }),
        helper.accessor('route', {
          header: 'Sản phẩm / hành trình',
          cell: (info) => {
            const routeTitle = info.getValue() || 'Chưa có sản phẩm / hành trình';
            return <span className="cellClamp" title={routeTitle}>{info.getValue() || '-'}</span>;
          },
        }),
        helper.accessor('totalSelling', { header: 'Tổng giá trị', cell: (info) => <span className="cellClamp" title={money(info.getValue())}>{money(info.getValue())}</span> }),
        helper.accessor('sellingPerPax', { header: 'Giá/khách', cell: (info) => <span className="cellClamp" title={money(info.getValue())}>{money(info.getValue())}</span> }),
        helper.accessor('status', { header: 'Trạng thái', cell: (info) => <span className={statusPillClass(info.getValue())}>{statusText(info.getValue())}</span> }),
        helper.display({
          id: 'actions',
          header: '',
          cell: ({ row }) => (
            <button type="button" className="secondaryButton iconTextButton" disabled={!canViewQuotations || loadingQuotationId === row.original.id} onClick={() => loadQuotation(row.original.id)}>
              <Pencil size={15} /> {loadingQuotationId === row.original.id ? 'Đang tải' : 'Sửa'}
            </button>
          ),
        }),
      ];
    }, [loadingQuotationId, canViewQuotations]),
    getCoreRowModel: getCoreRowModel(),
  });

  const submitEnabled = Boolean(editingId) && ['DRAFT', 'REJECTED'].includes(currentStatus);
  const approveEnabled = Boolean(editingId) && currentStatus === 'PENDING_APPROVAL';
  const smartLinkEnabledForStatus = Boolean(editingId) && !['CONVERTED', 'CANCELLED'].includes(currentStatus);
  const convertEnabled = Boolean(editingId) && currentStatus === 'APPROVED';
  const savingDisabled = isSubmitting || reloading || Boolean(actionLoading || loadingQuotationId) || !canManageQuotations || currentStatus === 'CONVERTED';

  useEffect(() => {
    if (!permissionsReady || canViewQuotations) return;
    setDashboard(emptyDashboard);
    setQuotations([]);
    setEditingId(null);
    setQuery('');
    setMessage('');
    setError('');
    reset(freshDefaultValues());
  }, [permissionsReady, canViewQuotations, reset]);

  async function reload(showSuccess = true) {
    if (!permissionsReady || !canViewQuotations) {
      setDashboard(emptyDashboard);
      setQuotations([]);
      setError('B\u1ea1n kh\u00f4ng c\u00f3 quy\u1ec1n xem b\u00e1o gi\u00e1.');
      return;
    }
    setReloading(true);
    setError('');
    const failures: string[] = [];
    const [dashResult, listResult] = await Promise.allSettled([
      fetch(`${browserApiBase()}/api/quotations/dashboard`, { cache: 'no-store', headers: authHeaders() }),
      fetch(`${browserApiBase()}/api/quotations?take=100`, { cache: 'no-store', headers: authHeaders() }),
    ]);

    if (dashResult.status === 'fulfilled') {
      if (dashResult.value.ok) {
        try {
          setDashboard(normalizeDashboard(await dashResult.value.json()));
        } catch (caught) {
          failures.push(caught instanceof Error ? caught.message : 'Dashboard trả về dữ liệu không hợp lệ.');
        }
      } else {
        failures.push(`Dashboard: ${await responseError(dashResult.value, 'không tải được dữ liệu tổng quan')}`);
      }
    } else {
      failures.push('Dashboard: không kết nối được API.');
    }

    if (listResult.status === 'fulfilled') {
      if (listResult.value.ok) {
        try {
          setQuotations(normalizeQuotationList(await listResult.value.json()));
        } catch (caught) {
          failures.push(caught instanceof Error ? caught.message : 'Danh sách báo giá trả về dữ liệu không hợp lệ.');
        }
      } else {
        failures.push(`Danh sách: ${await responseError(listResult.value, 'không tải được danh sách báo giá')}`);
      }
    } else {
      failures.push('Danh sách: không kết nối được API.');
    }

    if (failures.length) {
      setError(`Không tải đủ dữ liệu báo giá. ${failures.join(' ')}`);
    } else if (showSuccess) {
      setMessage('Đã tải lại dashboard và danh sách báo giá.');
    }
    setReloading(false);
  }

  async function loadQuotation(id: string, showSuccess = true) {
    if (!permissionsReady || !canViewQuotations) {
      setError('B\u1ea1n kh\u00f4ng c\u00f3 quy\u1ec1n xem chi ti\u1ebft b\u00e1o gi\u00e1.');
      return;
    }
    const previousEditingId = editingId;
    const switchingRecord = previousEditingId !== id;
    setLoadingQuotationId(id);
    setError('');
    setMessage('');
    if (switchingRecord) {
      setEditingId(null);
      reset(freshDefaultValues());
    }
    try {
      const response = await fetch(`${browserApiBase()}/api/quotations/${id}`, { headers: authHeaders() });
      if (!response.ok) throw new Error(await responseError(response, 'Không tải được chi tiết báo giá.'));
      const data = await response.json().catch(() => {
        throw new Error('API không trả về JSON hợp lệ cho chi tiết báo giá.');
      });
      setEditingId(id);
      reset(normalizeQuotationForm(data));
      if (showSuccess) setMessage('Đã tải chi tiết báo giá vào form.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không tải được chi tiết báo giá.');
      if (switchingRecord) {
        setEditingId(null);
        reset(freshDefaultValues());
      }
    } finally {
      setLoadingQuotationId(null);
    }
  }

  async function onSubmit(data: QuotationForm) {
    if (!canManageQuotations) {
      setError('B\u1ea1n kh\u00f4ng c\u00f3 quy\u1ec1n t\u1ea1o ho\u1eb7c c\u1eadp nh\u1eadt b\u00e1o gi\u00e1.');
      return;
    }
    setError('');
    setMessage('');
    let payload: ReturnType<typeof buildPayload>;
    try {
      payload = buildPayload(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Dữ liệu báo giá chưa hợp lệ.');
      return;
    }

    try {
      const response = await fetch(`${browserApiBase()}/api/quotations${editingId ? `/${editingId}` : ''}`, {
        method: editingId ? 'PUT' : 'POST',
        headers: authJsonHeaders(),
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(await responseError(response, 'Không lưu được báo giá. Kiểm tra mã báo giá và các dòng dịch vụ.'));
      const successMessage = editingId ? 'Đã cập nhật báo giá.' : 'Đã tạo báo giá.';
      reset(freshDefaultValues());
      setEditingId(null);
      await reload(false);
      setMessage(successMessage);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không lưu được báo giá.');
    }
  }

  async function action(actionKey: QuotationAction, path: 'submit' | 'approve' | 'smartlink' | 'convert', method = 'POST', body: Record<string, unknown> = { actor: 'Nhân sự vận hành' }) {
    const currentId = editingId;
    if (!currentId) {
      setError(`Cần mở một báo giá đã lưu trước khi ${actionLabels[actionKey]}.`);
      return;
    }
    const label = actionLabels[actionKey];
    if (actionKey === 'approve' && !canApproveQuotation) {
      setError('B\u1ea1n kh\u00f4ng c\u00f3 quy\u1ec1n duy\u1ec7t b\u00e1o gi\u00e1.');
      return;
    }
    if (actionKey !== 'approve' && !canManageQuotations) {
      setError(`B\u1ea1n kh\u00f4ng c\u00f3 quy\u1ec1n ${label}.`);
      return;
    }
    if (!confirmQuotationAction(actionKey)) return;
    setActionLoading(actionKey);
    setError('');
    setMessage('');
    try {
      const response = await fetch(`${browserApiBase()}/api/quotations/${currentId}/${path}`, {
        method,
        headers: authJsonHeaders(),
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(await responseError(response, `Không ${label} được.`));
      await loadQuotation(currentId, false);
      await reload(false);
      setMessage(`Đã ${label}.`);
    } catch (caught) {
      const detail = caught instanceof Error ? caught.message : `Không ${label} được.`;
      setError(`Không thể ${label}: ${detail}`);
    } finally {
      setActionLoading(null);
    }
  }

  function closeForm() {
    setEditingId(null);
    setMessage('');
    setError('');
    reset(freshDefaultValues());
  }

  return (
    <div className="quotePage quotationPage">
      <PermissionNotice allowed={!permissionsReady || canViewQuotations} label="xem v\u00e0 qu\u1ea3n l\u00fd b\u00e1o gi\u00e1" />

      {canViewQuotations ? (
        <>
      <section className="metrics">
        <article className="metric"><span>Tổng báo giá</span><strong>{dashboard.total}</strong></article>
        <article className="metric"><span>Tổng giá trị</span><strong>{money(dashboard.totalValue)}</strong></article>
        <article className="metric"><span>Chờ duyệt</span><strong>{dashboard.pending}</strong></article>
        <article className="metric"><span>Đã duyệt</span><strong>{dashboard.approved}</strong></article>
        <article className="metric"><span>Đã chuyển đơn</span><strong>{dashboard.converted}</strong></article>
        <article className="metric"><span>Hết hạn</span><strong>{dashboard.expired}</strong></article>
      </section>

      <form onSubmit={handleSubmit(onSubmit)} className="quoteForm">
        {error ? <div className="quoteAlert quoteAlertError"><AlertCircle size={16} /> {error}</div> : null}
        {validationError ? <div className="quoteAlert quoteAlertError"><AlertCircle size={16} /> {validationError}</div> : null}
        {loadingQuotationId ? <div className="quoteAlert quoteAlertInfo"><RefreshCcw size={16} /> Đang tải chi tiết báo giá...</div> : null}
        {message ? <div className="quoteAlert quoteAlertInfo"><Check size={16} /> {message}</div> : null}

        <section className="quoteWorkArea">
          <div className="quoteMain">
            <section className="panel">
              <div className="sectionHeader">
                <h2>Công cụ báo giá hợp nhất</h2>
                <span>{editingId ? `Đang sửa: ${values.quoteCode || editingId}` : 'Tạo báo giá cho FIT/GIT/Land tour/Combo/Booking/Visa/Dịch vụ'}</span>
              </div>

              <input type="hidden" {...register('status')} />

              <section className="quoteFormSection">
                <h3>Thông tin báo giá</h3>
                <div className="quoteFormGrid">
                  <label>Mã báo giá<input required {...register('quoteCode')} /></label>
                  <label>Loại sản phẩm<select required {...register('productType')}>{productTypes.map((item) => <option key={item} value={item}>{productTypeText(item)}</option>)}</select></label>
                  <label>Nhóm thị trường<input {...register('marketGroup')} /></label>
                  <label>Loại hình sản phẩm<input {...register('productCategory')} /></label>
                  <label className="span2">Sản phẩm / Hành trình<input {...register('route')} /></label>
                  <label>Tiền tệ<input {...register('currency')} /></label>
                  <label>Tỷ giá<input type="number" min="0" step="0.01" inputMode="decimal" {...register('exchangeRate', { valueAsNumber: true })} /></label>
                </div>
              </section>

              <section className="quoteFormSection">
                <h3>Khách hàng</h3>
                <div className="quoteFormGrid">
                  <label>Mã khách<input {...register('customerCode')} /></label>
                  <label>Tên khách<input {...register('customerName')} /></label>
                  <label>Điện thoại<input {...register('customerPhone')} /></label>
                  <label>Email<input type="email" {...register('customerEmail')} /></label>
                </div>
              </section>

              <section className="quoteFormSection">
                <h3>Phân bổ phụ trách</h3>
                <div className="quoteFormGrid">
                  <label>Sales phụ trách<input {...register('salesOwner')} /></label>
                  <label>Điều hành<input {...register('operatorOwner')} /></label>
                  <label>Chi nhánh<input {...register('branch')} /></label>
                  <label>Phòng ban<input {...register('department')} /></label>
                </div>
              </section>

              <section className="quoteFormSection">
                <h3>Số khách</h3>
                <div className="quoteFormGrid quotePaxGrid">
                  <label>Người lớn<input type="number" min="0" step="1" inputMode="numeric" {...register('paxAdult', { valueAsNumber: true })} /></label>
                  <label>Trẻ em<input type="number" min="0" step="1" inputMode="numeric" {...register('paxChild', { valueAsNumber: true })} /></label>
                  <label>Em bé<input type="number" min="0" step="1" inputMode="numeric" {...register('paxInfant', { valueAsNumber: true })} /></label>
                  <label>% giá trẻ em<input type="number" min="0" step="0.01" inputMode="decimal" {...register('childPricePercent', { valueAsNumber: true })} /></label>
                  <label>% giá em bé<input type="number" min="0" step="0.01" inputMode="decimal" {...register('infantPricePercent', { valueAsNumber: true })} /></label>
                </div>
              </section>

              <section className="quoteFormSection">
                <h3>Thời gian</h3>
                <div className="quoteFormGrid">
                  <label>Ngày tạo<input type="date" {...register('createdDate')} /></label>
                  <label>Hết hạn<input type="date" {...register('expiredDate')} /></label>
                  <label>Ngày thanh toán dự kiến<input type="date" {...register('expectedPaymentDate')} /></label>
                  <label>Ngày đi<input type="date" {...register('departureDate')} /></label>
                  <label>Ngày về<input type="date" {...register('returnDate')} /></label>
                </div>
              </section>

              <section className="quoteFormSection">
                <h3>Trạng thái duyệt</h3>
                <div className="quoteFormGrid">
                  <label>Cấp duyệt<select {...register('approvalLevel', { valueAsNumber: true })}><option value="0">Không duyệt</option><option value="1">1 cấp</option><option value="2">2 cấp</option></select></label>
                  <label>Ngôn ngữ<select {...register('language')}><option value="VI">Tiếng Việt</option><option value="EN">Tiếng Anh</option></select></label>
                  <div className="quotationStatusLine">
                    <span>Trạng thái</span>
                    <strong className={statusPillClass(currentStatus)}>{statusText(currentStatus)}</strong>
                  </div>
                  <div className="quotationStatusLine">
                    <span>SmartLink</span>
                    <strong>{isSmartLinkEnabled ? 'Đang bật' : 'Đang tắt'}</strong>
                  </div>
                  <div className="quotationStatusLine span2">
                    <span>Token SmartLink</span>
                    <strong>{values.smartLinkToken || 'Chưa có token'}</strong>
                  </div>
                </div>
              </section>

              <section className="quoteFormSection">
                <h3>Điều khoản và ghi chú</h3>
                <div className="quoteFormGrid">
                  <label className="span2">Điều khoản<textarea rows={3} {...register('terms')} /></label>
                  <label className="span2">Ghi chú nội bộ<textarea rows={3} {...register('note')} /></label>
                </div>
              </section>
            </section>

            <section className="fitTableBlock">
              <div className="sectionHeader">
                <h2>Dòng dịch vụ báo giá</h2>
                <button type="button" className="secondaryButton iconTextButton" onClick={() => items.append({ ...emptyItem })}>
                  <Plus size={16} /> Thêm dòng dịch vụ
                </button>
              </div>
              <div className="fitTableWrap quoteListWrap">
                <table className="fitTable quoteDynamicTable quotationItemTable">
                  <thead>
                    <tr>
                      <th>STT</th>
                      <th>Loại dịch vụ</th>
                      <th>Nhà cung cấp</th>
                      <th>Dịch vụ</th>
                      <th>Đơn vị tính</th>
                      <th>Số lượng</th>
                      <th>Số khách</th>
                      <th>Đêm</th>
                      <th>Giá NET</th>
                      <th>VAT %</th>
                      <th>Lãi cố định</th>
                      <th>Lãi %</th>
                      <th>Thành tiền</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {items.fields.map((field, index) => {
                      const row = normalizeItem(values.items?.[index] || {});
                      return (
                        <tr key={field.id}>
                          <td>{index + 1}</td>
                          <td><select required {...register(`items.${index}.serviceType`)}>{services.map((service) => <option key={service} value={service}>{serviceTypeText(service)}</option>)}</select></td>
                          <td><input {...register(`items.${index}.supplierName`)} /></td>
                          <td><input {...register(`items.${index}.serviceName`)} /></td>
                          <td><input {...register(`items.${index}.unit`)} /></td>
                          <td><input type="number" required min="0" step="0.01" inputMode="decimal" {...register(`items.${index}.quantity`, { valueAsNumber: true })} /></td>
                          <td><input type="number" required min="0" step="0.01" inputMode="decimal" {...register(`items.${index}.paxCount`, { valueAsNumber: true })} /></td>
                          <td><input type="number" required min="0" step="0.01" inputMode="decimal" {...register(`items.${index}.nightCount`, { valueAsNumber: true })} /></td>
                          <td><input type="number" required min="0" step="0.01" inputMode="decimal" {...register(`items.${index}.netPrice`, { valueAsNumber: true })} /></td>
                          <td><input type="number" required min="0" step="0.01" inputMode="decimal" {...register(`items.${index}.vat`, { valueAsNumber: true })} /></td>
                          <td><input type="number" step="0.01" inputMode="decimal" {...register(`items.${index}.markupAmount`, { valueAsNumber: true })} /></td>
                          <td><input type="number" step="0.01" inputMode="decimal" {...register(`items.${index}.markupPercent`, { valueAsNumber: true })} /></td>
                          <td>{money(itemCost(row, values.exchangeRate) + itemMarkup(row, values.exchangeRate))}</td>
                          <td><button type="button" className="dangerButton iconButton" disabled={items.fields.length <= 1} onClick={() => items.remove(index)}><Trash2 size={15} /></button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <aside className="panel quoteSummaryBox">
            <h2>Tổng hợp giá</h2>
              <div className="summaryRows">
                <div><span>Tổng chi phí</span><strong>{money(totals.totalCost)}</strong></div>
                <div><span>Tổng lãi</span><strong>{money(totals.totalMarkup)}</strong></div>
                <div><span>Tổng giá bán</span><strong>{money(totals.totalSelling)}</strong></div>
                <div><span>Tổng khách</span><strong>{totals.pax}</strong></div>
                <div><span>Tỷ giá tính giá</span><strong>{positiveRate(values.exchangeRate).toLocaleString('vi-VN')}</strong></div>
              <div><span>Chi phí/khách</span><strong>{money(totals.costPerPax)}</strong></div>
              <div><span>Giá bán/khách</span><strong>{money(totals.sellingPerPax)}</strong></div>
              <div><span>Giá người lớn</span><strong>{money(totals.adultPrice)}</strong></div>
              <div><span>Giá trẻ em</span><strong>{money(totals.childPrice)}</strong></div>
              <div><span>Giá em bé</span><strong>{money(totals.infantPrice)}</strong></div>
              <div><span>Lãi/khách</span><strong>{money(totals.profitPerPax)}</strong></div>
              <div><span>Biên lợi nhuận</span><strong>{totals.marginRate.toFixed(1)}%</strong></div>
            </div>
          </aside>
        </section>

        <div className="hotelFormActions">
          <button type="submit" disabled={savingDisabled}><Save size={17} /> {isSubmitting ? 'Đang lưu' : editingId ? 'Cập nhật báo giá' : 'Tạo báo giá'}</button>
          <button type="button" className="secondaryButton" disabled={!canManageQuotations || !submitEnabled || Boolean(actionLoading)} onClick={() => action('submit', 'submit')}><Send size={17} /> {actionLoading === 'submit' ? 'Đang gửi' : 'Gửi duyệt'}</button>
          <button type="button" className="secondaryButton" disabled={!canApproveQuotation || !approveEnabled || Boolean(actionLoading)} onClick={() => action('approve', 'approve')}><Check size={17} /> {actionLoading === 'approve' ? 'Đang duyệt' : 'Duyệt'}</button>
          <button type="button" className="secondaryButton" disabled={!canManageQuotations || !smartLinkEnabledForStatus || Boolean(actionLoading)} onClick={() => action(isSmartLinkEnabled ? 'smartlink-off' : 'smartlink-on', 'smartlink', 'PATCH', { enabled: !isSmartLinkEnabled })}><LinkIcon size={17} /> {isSmartLinkEnabled ? 'Tắt SmartLink' : 'Bật SmartLink'}</button>
          <button type="button" className="secondaryButton" disabled={!canManageQuotations || !convertEnabled || Boolean(actionLoading)} onClick={() => action('convert', 'convert')}><Copy size={17} /> Chuyển đơn</button>
          <button type="button" className="dangerButton" onClick={closeForm}><X size={17} /> Đóng</button>
        </div>
      </form>

      <section className="panel listPanel">
        <div className="sectionHeader quoteListHeader">
          <h2>Danh sách báo giá hợp nhất</h2>
          <div className="quoteListActions">
            <button type="button" className="secondaryButton iconTextButton" disabled={!canViewQuotations || reloading} onClick={() => reload()}>
              <RefreshCcw size={15} /> {reloading ? 'Đang tải' : 'Tải lại'}
            </button>
            <label className="searchBox"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm mã báo giá, khách hàng, sản phẩm..." /></label>
          </div>
        </div>
        {reloading ? <div className="quoteAlert quoteAlertInfo"><RefreshCcw size={16} /> Đang tải lại dashboard và danh sách báo giá...</div> : null}
        <div className="fitTableWrap quoteListWrap compactListTableWrap">
          <table className="fitTable quoteListTable quotationListTable compactListTable">
            <thead>
              {table.getHeaderGroups().map((group) => (
                <tr key={group.id}>{group.headers.map((header) => <th key={header.id}>{flexRender(header.column.columnDef.header, header.getContext())}</th>)}</tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr key={row.id}>{row.getVisibleCells().map((cell) => <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>
              ))}
              {!table.getRowModel().rows.length ? <tr><td colSpan={7}>Không có báo giá phù hợp.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
        </>
      ) : null}
    </div>
  );
}

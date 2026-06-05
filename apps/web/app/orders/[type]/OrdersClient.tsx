'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { Copy, Lock, LockOpen, Pencil, Plus, Save, Search, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { FieldArrayWithId, useFieldArray, useForm, UseFieldArrayReturn, UseFormRegister, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { viStatus } from '../../i18n';
import type { OrderConfig, OrderRouteType } from '../order-config';

type RowColumn = [string, string, ('text' | 'number' | 'date' | 'datetime-local' | 'textarea' | 'status' | 'passengerType' | 'language')?];

type OrderSummary = {
  id: string;
  systemCode: string;
  tourCode: string | null;
  name: string;
  customerName: string | null;
  customerPhone: string | null;
  startDate: string | null;
  endDate: string | null;
  totalRevenue: string;
  paidAmount: string;
  remainingRevenue: string;
  totalCost: string;
  paidCost: string;
  remainingCost: string;
  profit: string;
  status: string;
  costStatus: string;
  _count?: { members: number; salesItems: number; operationItems: number };
};

const rowId = { id: z.string().default('') };
const salesSchema = z.object({ ...rowId, serviceType: z.string().default(''), supplierId: z.string().default(''), serviceId: z.string().default(''), description: z.string().default(''), quantity: z.coerce.number().default(1), serviceCount: z.coerce.number().default(1), unitPrice: z.coerce.number().default(0), vat: z.coerce.number().default(0), note: z.string().default('') });
const operationSchema = z.object({ ...rowId, serviceType: z.string().default(''), supplierId: z.string().default(''), serviceId: z.string().default(''), bookingCode: z.string().default(''), serviceDate: z.string().default(''), quantity: z.coerce.number().default(1), netPrice: z.coerce.number().default(0), vat: z.coerce.number().default(0), status: z.string().default('WAITING'), note: z.string().default('') });
const memberSchema = z.object({ ...rowId, fullName: z.string().default(''), gender: z.string().default(''), birthday: z.string().default(''), phone: z.string().default(''), email: z.string().default(''), identityNumber: z.string().default(''), issuedDate: z.string().default(''), nationality: z.string().default(''), passengerType: z.string().default('ADULT'), note: z.string().default('') });
const itinerarySchema = z.object({ ...rowId, dayNo: z.coerce.number().default(1), title: z.string().default(''), content: z.string().default(''), period: z.string().default(''), destination: z.string().default(''), meals: z.string().default(''), hotel: z.string().default(''), restaurant: z.string().default(''), services: z.string().default(''), note: z.string().default('') });
const handoverSchema = z.object({ ...rowId, itemName: z.string().default(''), quantity: z.coerce.number().default(1), note: z.string().default('') });
const surveySchema = z.object({ ...rowId, question: z.string().default(''), note: z.string().default('') });
const termSchema = z.object({ ...rowId, language: z.string().default('VN'), terms: z.string().default(''), notes: z.string().default('') });
const guideSchema = z.object({ ...rowId, guideName: z.string().default(''), phone: z.string().default(''), language: z.string().default(''), note: z.string().default('') });

const orderSchema = z.object({
  systemCode: z.string().min(2, 'Nhập mã hệ thống'),
  tourCode: z.string().default(''),
  holdCode: z.string().default(''),
  name: z.string().min(2, 'Nhập tên đơn hàng'),
  route: z.string().default(''),
  marketGroup: z.string().default('Khác'),
  bookingDate: z.string().default(''),
  paymentDate: z.string().default(''),
  startDate: z.string().default(''),
  endDate: z.string().default(''),
  status: z.string().default('UPCOMING'),
  tourCategory: z.string().default('Khác'),
  currency: z.string().default('VND'),
  exchangeRate: z.coerce.number().default(1),
  createdBy: z.string().default('Điều hành'),
  createdDate: z.string().default(''),
  branch: z.string().default(''),
  customerName: z.string().default(''),
  customerType: z.string().default('Cá nhân'),
  customerPhone: z.string().default(''),
  customerEmail: z.string().email('Email không hợp lệ').or(z.literal('')).default(''),
  customerAddress: z.string().default(''),
  agencyName: z.string().default(''),
  collaborator: z.string().default(''),
  operatorOwner: z.string().default(''),
  adultQty: z.coerce.number().default(0),
  childQty: z.coerce.number().default(0),
  infantQty: z.coerce.number().default(0),
  quantity: z.coerce.number().default(1),
  roomClass: z.string().default(''),
  servicePackage: z.string().default(''),
  transportType: z.string().default(''),
  pickupPoint: z.string().default(''),
  dropoffPoint: z.string().default(''),
  seatTotal: z.coerce.number().default(0),
  seatHeld: z.coerce.number().default(0),
  seatSold: z.coerce.number().default(0),
  allowOverbooking: z.boolean().default(false),
  receiveDeadline: z.string().default(''),
  closeDeadline: z.string().default(''),
  paidAmount: z.coerce.number().default(0),
  paidCost: z.coerce.number().default(0),
  commission: z.coerce.number().default(0),
  note: z.string().default(''),
  handoverRequest: z.string().default('1. Gọi làm quen khách và tạo nhóm Zalo.\n2. Cập nhật điều hành trong nhóm.\n3. Hỗ trợ khách trong hành trình.\n4. Báo cáo phát sinh.'),
  surveyDescription: z.string().default(''),
  guides: z.array(guideSchema).default([]),
  salesItems: z.array(salesSchema).default([]),
  operationItems: z.array(operationSchema).default([]),
  members: z.array(memberSchema).default([]),
  itineraries: z.array(itinerarySchema).default([]),
  handoverItems: z.array(handoverSchema).default([]),
  surveyQuestions: z.array(surveySchema).default([]),
  terms: z.array(termSchema).default([]),
});

type OrderForm = z.infer<typeof orderSchema>;
type ArrayName = 'salesItems' | 'operationItems' | 'members' | 'itineraries' | 'handoverItems' | 'surveyQuestions' | 'terms' | 'guides';
const emptySales = { id: '', serviceType: '', supplierId: '', serviceId: '', description: '', quantity: 1, serviceCount: 1, unitPrice: 0, vat: 0, note: '' };
const emptyOperation = { id: '', serviceType: '', supplierId: '', serviceId: '', bookingCode: '', serviceDate: '', quantity: 1, netPrice: 0, vat: 0, status: 'WAITING', note: '' };
const emptyMember = { id: '', fullName: '', gender: '', birthday: '', phone: '', email: '', identityNumber: '', issuedDate: '', nationality: '', passengerType: 'ADULT', note: '' };
const defaultHandoverItems = [{ id: '', itemName: 'Rooming list', quantity: 1, note: '' }, { id: '', itemName: 'Chương trình tour', quantity: 1, note: '' }];
const defaultSurveyQuestions = [{ id: '', question: 'Chất lượng dịch vụ', note: '' }, { id: '', question: 'Mức độ hài lòng chung', note: '' }];
const statusOptions = ['DRAFT', 'UPCOMING', 'RUNNING', 'COMPLETED', 'CANCELLED'];
const stepDescriptions = [
  'Nhập số lượng, chỗ và các dòng doanh thu để hệ thống tính tổng thu.',
  'Hoàn thiện thông tin tour, khách hàng, lịch trình và danh sách thành viên.',
  'Lập dự toán dịch vụ và chi phí dự kiến trước khi chuyển điều hành.',
  'Theo dõi dịch vụ điều hành, hướng dẫn viên và trạng thái xác nhận.',
  'Chuẩn bị nội dung bàn giao và danh sách tài liệu/quà tặng.',
  'Thiết lập phiếu đánh giá dịch vụ và điều khoản sau tour.',
];

function makeDefaultValues(): OrderForm {
  return {
    systemCode: `DH${Date.now().toString().slice(-6)}`,
    tourCode: '',
    holdCode: '',
    name: '',
    route: '',
    marketGroup: 'Khác',
    bookingDate: '',
    paymentDate: '',
    startDate: '',
    endDate: '',
    status: 'UPCOMING',
    tourCategory: 'Khác',
    currency: 'VND',
    exchangeRate: 1,
    createdBy: 'Điều hành',
    createdDate: '',
    branch: '',
    customerName: '',
    customerType: 'Cá nhân',
    customerPhone: '',
    customerEmail: '',
    customerAddress: '',
    agencyName: '',
    collaborator: '',
    operatorOwner: '',
    adultQty: 0,
    childQty: 0,
    infantQty: 0,
    quantity: 1,
    roomClass: '',
    servicePackage: '',
    transportType: '',
    pickupPoint: '',
    dropoffPoint: '',
    seatTotal: 0,
    seatHeld: 0,
    seatSold: 0,
    allowOverbooking: false,
    receiveDeadline: '',
    closeDeadline: '',
    paidAmount: 0,
    paidCost: 0,
    commission: 0,
    note: '',
    handoverRequest: '1. Gọi làm quen khách và tạo nhóm Zalo.\n2. Cập nhật điều hành trong nhóm.\n3. Hỗ trợ khách trong hành trình.\n4. Báo cáo phát sinh.',
    surveyDescription: '',
    guides: [{ id: '', guideName: '', phone: '', language: '', note: '' }],
    salesItems: [{ ...emptySales }],
    operationItems: [{ ...emptyOperation }],
    members: [{ ...emptyMember }],
    itineraries: [{ id: '', dayNo: 1, title: '', content: '', period: '', destination: '', meals: '', hotel: '', restaurant: '', services: '', note: '' }],
    handoverItems: defaultHandoverItems.map((item) => ({ ...item })),
    surveyQuestions: defaultSurveyQuestions.map((item) => ({ ...item })),
    terms: [{ id: '', language: 'VN', terms: '', notes: '' }],
  };
}

function browserApiBase() {
  const apiBase = process.env.NEXT_PUBLIC_API_URL || '';
  if (typeof window === 'undefined') return apiBase;
  if (apiBase.includes('smarttour-api-1')) return `http://${window.location.hostname}:4000`;
  return apiBase;
}
function money(value: unknown) { return safeNumber(value).toLocaleString('vi-VN'); }
function safeNumber(value: unknown) { const parsed = Number(value ?? 0); return Number.isFinite(parsed) ? parsed : 0; }
function lineRevenue(i: Partial<OrderForm['salesItems'][number]>) { return safeNumber(i.quantity ?? 1) * safeNumber(i.serviceCount ?? 1) * safeNumber(i.unitPrice) * (1 + safeNumber(i.vat) / 100); }
function lineCost(i: Partial<OrderForm['operationItems'][number]>) { return safeNumber(i.quantity ?? 1) * safeNumber(i.netPrice) * (1 + safeNumber(i.vat) / 100); }
function dateOnly(value?: string | null) { return value ? String(value).slice(0, 10) : ''; }
function dateTimeLocal(value?: string | null) { return value ? String(value).slice(0, 16) : ''; }
function text(value: unknown) { return typeof value === 'string' ? value.trim() : ''; }
function hasAnyText(row: Record<string, unknown>, keys: string[]) { return keys.some((key) => Boolean(text(row[key]))); }
function cleanRow<T extends Record<string, unknown>>(row: T) { return Object.fromEntries(Object.entries(row).filter(([, value]) => value !== '' && value !== null && value !== undefined)); }
async function apiMessage(response: Response) {
  const data = await response.json().catch(() => ({}));
  return data.message || response.statusText || `HTTP ${response.status}`;
}
function statusClass(status: string) { return `statusPill status-${status.toLowerCase()}`; }

function mapOrderToForm(order: any): OrderForm {
  const defaults = makeDefaultValues();
  return {
    ...defaults,
    ...order,
    bookingDate: dateOnly(order.bookingDate),
    paymentDate: dateOnly(order.paymentDate),
    startDate: dateOnly(order.startDate),
    endDate: dateOnly(order.endDate),
    createdDate: dateOnly(order.createdDate),
    receiveDeadline: dateTimeLocal(order.receiveDeadline),
    closeDeadline: dateTimeLocal(order.closeDeadline),
    salesItems: Array.isArray(order.salesItems) && order.salesItems.length ? order.salesItems.map((i: any) => ({ ...emptySales, ...i, quantity: safeNumber(i.quantity ?? 1), serviceCount: safeNumber(i.serviceCount ?? 1), unitPrice: safeNumber(i.unitPrice), vat: safeNumber(i.vat) })) : [{ ...emptySales }],
    operationItems: Array.isArray(order.operationItems) && order.operationItems.length ? order.operationItems.map((i: any) => ({ ...emptyOperation, ...i, serviceDate: dateOnly(i.serviceDate), quantity: safeNumber(i.quantity ?? 1), netPrice: safeNumber(i.netPrice), vat: safeNumber(i.vat) })) : [{ ...emptyOperation }],
    members: Array.isArray(order.members) && order.members.length ? order.members.map((i: any) => ({ ...emptyMember, ...i, birthday: dateOnly(i.birthday), issuedDate: dateOnly(i.issuedDate) })) : [{ ...emptyMember }],
    itineraries: Array.isArray(order.itineraries) && order.itineraries.length ? order.itineraries.map((i: any) => ({ ...defaults.itineraries[0], ...i, dayNo: safeNumber(i.dayNo ?? 1) })) : defaults.itineraries,
    guides: Array.isArray(order.guides) && order.guides.length ? order.guides.map((i: any) => ({ ...defaults.guides[0], ...i })) : defaults.guides,
    handoverItems: Array.isArray(order.handoverItems) && order.handoverItems.length ? order.handoverItems.map((i: any) => ({ id: '', itemName: '', note: '', ...i, quantity: safeNumber(i.quantity ?? 1) })) : defaults.handoverItems,
    surveyQuestions: Array.isArray(order.surveyQuestions) && order.surveyQuestions.length ? order.surveyQuestions.map((i: any) => ({ id: '', question: '', note: '', ...i })) : defaults.surveyQuestions,
    terms: Array.isArray(order.terms) && order.terms.length ? order.terms.map((i: any) => ({ id: '', language: 'VN', terms: '', notes: '', ...i })) : defaults.terms,
    paidAmount: safeNumber(order.paidAmount),
    paidCost: safeNumber(order.paidCost),
    commission: safeNumber(order.commission),
    exchangeRate: safeNumber(order.exchangeRate || 1),
    adultQty: safeNumber(order.adultQty),
    childQty: safeNumber(order.childQty),
    infantQty: safeNumber(order.infantQty),
    quantity: safeNumber(order.quantity ?? 1),
    seatTotal: safeNumber(order.seatTotal),
    seatHeld: safeNumber(order.seatHeld),
    seatSold: safeNumber(order.seatSold),
  };
}

function buildPayload(data: OrderForm) {
  return cleanRow({
    ...data,
    guides: data.guides.filter((row) => hasAnyText(row, ['guideName', 'phone', 'language', 'note'])).map(cleanRow),
    salesItems: data.salesItems.filter((row) => hasAnyText(row, ['serviceType', 'supplierId', 'serviceId', 'description', 'note']) || lineRevenue(row) > 0).map(cleanRow),
    operationItems: data.operationItems.filter((row) => hasAnyText(row, ['serviceType', 'supplierId', 'serviceId', 'bookingCode', 'note']) || lineCost(row) > 0).map(cleanRow),
    members: data.members.filter((row) => hasAnyText(row, ['fullName', 'phone', 'email', 'identityNumber'])).map(cleanRow),
    itineraries: data.itineraries.filter((row) => hasAnyText(row, ['title', 'content', 'destination', 'meals', 'hotel', 'restaurant', 'services', 'note'])).map(cleanRow),
    handoverItems: data.handoverItems.filter((row) => hasAnyText(row, ['itemName', 'note'])).map(cleanRow),
    surveyQuestions: data.surveyQuestions.filter((row) => hasAnyText(row, ['question', 'note'])).map(cleanRow),
    terms: data.terms.filter((row) => hasAnyText(row, ['terms', 'notes'])).map(cleanRow),
  });
}

export default function OrdersClient({ type, config, initialOrders }: { type: OrderRouteType; config: OrderConfig; initialOrders: OrderSummary[] }) {
  const [orders, setOrders] = useState(initialOrders);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState(0);
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const { register, control, handleSubmit, reset, formState: { isSubmitting } } = useForm<OrderForm>({ resolver: zodResolver(orderSchema) as any, defaultValues: makeDefaultValues(), shouldUnregister: false });
  const values = useWatch({ control });
  const arrays = {
    guides: useFieldArray({ control, name: 'guides', keyName: 'fieldId' }),
    salesItems: useFieldArray({ control, name: 'salesItems', keyName: 'fieldId' }),
    operationItems: useFieldArray({ control, name: 'operationItems', keyName: 'fieldId' }),
    members: useFieldArray({ control, name: 'members', keyName: 'fieldId' }),
    itineraries: useFieldArray({ control, name: 'itineraries', keyName: 'fieldId' }),
    handoverItems: useFieldArray({ control, name: 'handoverItems', keyName: 'fieldId' }),
    surveyQuestions: useFieldArray({ control, name: 'surveyQuestions', keyName: 'fieldId' }),
    terms: useFieldArray({ control, name: 'terms', keyName: 'fieldId' }),
  };
  const totals = useMemo(() => {
    const revenue = (values.salesItems || []).reduce((sum, item) => sum + lineRevenue(item), 0);
    const cost = (values.operationItems || []).reduce((sum, item) => sum + lineCost(item), 0);
    return { revenue, cost, profit: revenue - cost, remainRevenue: Math.max(0, revenue - safeNumber(values.paidAmount)), remainCost: Math.max(0, cost - safeNumber(values.paidCost)), seatsLeft: safeNumber(values.seatTotal) - safeNumber(values.seatSold) };
  }, [values]);
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return orders;
    return orders.filter((item) => [item.systemCode, item.tourCode, item.name, item.customerName, item.customerPhone].filter(Boolean).some((value) => String(value).toLowerCase().includes(term)));
  }, [orders, query]);
  const currentStatus = String(values.status || '');
  const canEdit = !isSubmitting && !['SETTLED', 'CANCELLED'].includes(currentStatus);
  const canUseOrderAction = Boolean(editingId) && !isSubmitting;
  const canSettle = canUseOrderAction && !['SETTLED', 'CANCELLED'].includes(currentStatus);
  const canUnlock = canUseOrderAction && currentStatus === 'SETTLED';
  const lastStep = Math.max(0, config.steps.length - 1);
  const table = useReactTable({
    data: filtered,
    columns: useMemo(() => {
      const helper = createColumnHelper<OrderSummary>();
      return [
        helper.display({ id: 'code', header: 'Mã đơn', cell: ({ row }) => <div className="orderCellStack"><strong>{row.original.systemCode}</strong><span className="mutedText">{row.original.tourCode || '-'}</span></div> }),
        helper.accessor('name', { header: config.nameLabel, cell: (info) => <strong>{info.getValue()}</strong> }),
        helper.display({ id: 'dates', header: 'Lịch trình', cell: ({ row }) => <span>Đi: {dateOnly(row.original.startDate) || '-'}<br />Về: {dateOnly(row.original.endDate) || '-'}</span> }),
        helper.display({ id: 'customer', header: 'Khách hàng', cell: ({ row }) => <span>{row.original.customerName || '-'}<br />{row.original.customerPhone || '-'}</span> }),
        helper.display({ id: 'revenue', header: 'Phần thu', cell: ({ row }) => <span>Tổng: {money(row.original.totalRevenue)}<br />Còn thu: {money(row.original.remainingRevenue)}</span> }),
        helper.display({ id: 'cost', header: 'Phần chi', cell: ({ row }) => <span>Tổng: {money(row.original.totalCost)}<br />Còn chi: {money(row.original.remainingCost)}</span> }),
        helper.accessor('profit', { header: 'Lợi nhuận', cell: (info) => money(info.getValue()) }),
        helper.accessor('status', { header: 'Trạng thái', cell: (info) => <span className={statusClass(info.getValue())}>{viStatus(info.getValue())}</span> }),
        helper.display({ id: 'actions', header: 'Thao tác', cell: ({ row }) => <button type="button" className="secondaryButton iconTextButton" onClick={() => loadOrder(row.original.id)}><Pencil size={15} /> Sửa</button> }),
      ];
    }, [config.nameLabel]),
    getCoreRowModel: getCoreRowModel(),
  });
  const orderListColumnCount = table.getVisibleLeafColumns().length;
  async function reload(search = '') {
    const suffix = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : '';
    const response = await fetch(`${browserApiBase()}/api/orders/${type}${suffix}`, { cache: 'no-store' });
    if (response.ok) setOrders(await response.json());
  }
  async function loadOrder(id: string) {
    setMessage('');
    const response = await fetch(`${browserApiBase()}/api/orders/${type}/${id}`);
    if (!response.ok) {
      setMessage(`Không tải được đơn hàng: ${await apiMessage(response)}`);
      return;
    }
    const order = await response.json();
    setEditingId(id);
    setActiveStep(0);
    setFormOpen(true);
    reset(mapOrderToForm(order));
  }
  async function onSubmit(data: OrderForm) {
    if (data.endDate && data.startDate && new Date(data.endDate) < new Date(data.startDate)) {
      setMessage('Ngày về không được trước ngày đi.');
      return;
    }
    const payload = buildPayload(data);
    const response = await fetch(`${browserApiBase()}/api/orders/${type}${editingId ? `/${editingId}` : ''}`, { method: editingId ? 'PUT' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    if (!response.ok) {
      setMessage(`Không lưu được đơn hàng: ${await apiMessage(response)}`);
      return;
    }
    const saved = await response.json();
    setMessage(editingId ? 'Đã cập nhật đơn hàng.' : 'Đã tạo đơn hàng.');
    setEditingId(saved.id || null);
    reset(mapOrderToForm(saved));
    setFormOpen(false);
    await reload(query);
  }
  async function action(path: 'copy' | 'settle') {
    if (!editingId) return;
    const response = await fetch(`${browserApiBase()}/api/orders/${type}/${editingId}/${path}`, { method: 'POST' });
    if (!response.ok) {
      setMessage(`Không thể ${path === 'copy' ? 'sao chép' : 'chốt quyết toán'}: ${await apiMessage(response)}`);
      return;
    }
    const updated = await response.json();
    setMessage(path === 'copy' ? 'Đã sao chép đơn hàng.' : 'Đã chốt quyết toán.');
    if (path === 'copy') setEditingId(updated.id);
    reset(mapOrderToForm(updated));
    await reload(query);
  }
  async function unlockSettlement() {
    if (!editingId) return;
    const response = await fetch(`${browserApiBase()}/api/orders/${type}/${editingId}/unlock`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ actor: 'Operator', reason: 'Mở khóa từ màn hình đơn hàng' }) });
    if (!response.ok) {
      setMessage(`Không mở khóa được: ${await apiMessage(response)}`);
      return;
    }
    const updated = await response.json();
    setMessage('Đã mở khóa quyết toán.');
    reset(mapOrderToForm(updated));
    await reload(query);
  }
  function closeForm() { setEditingId(null); setFormOpen(false); setMessage(''); reset(makeDefaultValues()); }
  function openCreate() { setEditingId(null); setActiveStep(0); setMessage(''); reset(makeDefaultValues()); setFormOpen(true); }
  return (
    <div className="orderPage">
      {formOpen ? <div className="modalOverlay" role="dialog" aria-modal="true"><div className="modalPanel modalPanelWide tourWorkflowModal"><form onSubmit={handleSubmit(onSubmit)} className="orderForm">
        <section className="fitToolbar">
          <div className="fitSteps" role="tablist" aria-label="Các bước tạo đơn">
            {config.steps.map((step, index) => (
              <button
                type="button"
                key={step}
                role="tab"
                aria-selected={activeStep === index}
                className={activeStep === index ? 'active' : ''}
                onClick={() => setActiveStep(index)}
              >
                <span>{index + 1}.</span>{step}
              </button>
            ))}
          </div>
          <div className="fitActions"><strong>{config.title}</strong><span>{message || stepDescriptions[activeStep] || 'Hệ thống tính lại thu, chi và lợi nhuận trước khi lưu.'}</span></div>
        </section>
        <section className="orderWorkArea">
          <div className="orderMain">
            <section className="panel">
              <div className="sectionHeader"><h2>{config.steps[activeStep] || 'Thông tin đơn hàng'}</h2><span>{config.shortTitle}</span></div>
              <div className="orderFormSections">
                {activeStep === 0 ? <fieldset><legend>Số lượng / giá trị</legend><div className="quoteFormGrid">
                  <label>Người lớn<input type="number" {...register('adultQty')} /></label><label>Trẻ em<input type="number" {...register('childQty')} /></label><label>Em bé<input type="number" {...register('infantQty')} /></label><label>Số lượng<input type="number" {...register('quantity')} /></label><label>Tổng chỗ<input type="number" {...register('seatTotal')} /></label><label>Đã giữ<input type="number" {...register('seatHeld')} /></label><label>Đã bán<input type="number" {...register('seatSold')} /></label><label>Đã thu<input type="number" {...register('paidAmount')} /></label><label>Đã chi<input type="number" {...register('paidCost')} /></label><label>Hoa hồng<input type="number" {...register('commission')} /></label>
                </div></fieldset> : null}
                {activeStep === 1 ? <>
                  <fieldset><legend>Thông tin chung</legend><div className="quoteFormGrid">
                    <label>Mã hệ thống<input {...register('systemCode')} /></label><label>{config.codeLabel}<input {...register('tourCode')} /></label><label>Mã giữ chỗ<input {...register('holdCode')} /></label><label>{config.nameLabel}<input {...register('name')} /></label><label>Tuyến / hành trình<input {...register('route')} /></label><label>Thị trường<input {...register('marketGroup')} /></label>
                    <label>Ngày đặt<input type="date" {...register('bookingDate')} /></label><label>Ngày thanh toán<input type="date" {...register('paymentDate')} /></label><label>Ngày đi / check-in<input type="date" {...register('startDate')} /></label><label>Ngày về / check-out<input type="date" {...register('endDate')} /></label><label>Trạng thái<select {...register('status')}>{statusOptions.map((status) => <option key={status} value={status}>{viStatus(status)}</option>)}</select></label><label>Chi nhánh<input {...register('branch')} /></label>
                  </div></fieldset>
                  <fieldset><legend>Khách hàng</legend><div className="quoteFormGrid">
                    <label>Họ tên khách<input {...register('customerName')} /></label><label>Loại khách<input {...register('customerType')} /></label><label>Số điện thoại<input {...register('customerPhone')} /></label><label>Email<input type="email" {...register('customerEmail')} /></label><label>Địa chỉ<input {...register('customerAddress')} /></label><label>Đại lý<input {...register('agencyName')} /></label><label>Cộng tác viên<input {...register('collaborator')} /></label><label>Nhân viên điều hành<input {...register('operatorOwner')} /></label>
                  </div></fieldset>
                </> : null}
                {activeStep === 3 ? <fieldset><legend>Điều hành</legend><div className="quoteFormGrid">
                  <label>Hạng phòng<input {...register('roomClass')} /></label><label>Gói dịch vụ<input {...register('servicePackage')} /></label><label>Phương tiện<input {...register('transportType')} /></label><label>Điểm đón<input {...register('pickupPoint')} /></label><label>Điểm trả<input {...register('dropoffPoint')} /></label><label>Hạn nhận<input type="datetime-local" {...register('receiveDeadline')} /></label><label>Hạn đóng<input type="datetime-local" {...register('closeDeadline')} /></label><label className="span2">Ghi chú<textarea rows={2} {...register('note')} /></label>
                </div></fieldset> : null}
                {activeStep === 4 ? <fieldset><legend>Yêu cầu bàn giao</legend><div className="quoteFormGrid">
                  <label className="span2">Nội dung bàn giao<textarea rows={5} {...register('handoverRequest')} /></label>
                </div></fieldset> : null}
                {activeStep === 5 ? <fieldset><legend>Mô tả đánh giá</legend><div className="quoteFormGrid">
                  <label className="span2">Mô tả chung<textarea rows={4} {...register('surveyDescription')} /></label>
                </div></fieldset> : null}
              </div>
            </section>
            {activeStep === 0 ? <Rows title="Dịch vụ sales / phần thu" name="salesItems" register={register} fieldArray={arrays.salesItems} emptyRow={emptySales} columns={[['serviceType','Loại dịch vụ'],['description','Diễn giải'],['quantity','Số lượng','number'],['serviceCount','Số lượt','number'],['unitPrice','Đơn giá','number'],['vat','VAT (%)','number'],['note','Ghi chú']]} /> : null}
            {activeStep === 1 ? <>
              <Rows title="Lịch trình" name="itineraries" register={register} fieldArray={arrays.itineraries} emptyRow={{ id: '', dayNo: 1, title: '', content: '', period: '', destination: '', meals: '', hotel: '', restaurant: '', services: '', note: '' }} columns={[['dayNo','Ngày','number'],['title','Tiêu đề'],['content','Nội dung','textarea'],['destination','Điểm đến'],['meals','Bữa ăn'],['hotel','Khách sạn'],['restaurant','Nhà hàng'],['note','Ghi chú']]} />
              <Rows title="Thành viên / hành khách" name="members" register={register} fieldArray={arrays.members} emptyRow={emptyMember} columns={[['fullName','Họ tên'],['gender','Giới tính'],['birthday','Ngày sinh','date'],['phone','Số điện thoại'],['email','Email'],['identityNumber','CCCD / hộ chiếu'],['nationality','Quốc tịch'],['passengerType','Loại khách','passengerType']]} />
            </> : null}
            {activeStep === 2 ? <Rows title="Dự toán dịch vụ / phần chi" name="operationItems" register={register} fieldArray={arrays.operationItems} emptyRow={emptyOperation} columns={[['serviceType','Loại dịch vụ'],['bookingCode','Mã booking'],['serviceDate','Ngày sử dụng','date'],['quantity','Số lượng','number'],['netPrice','Giá NET','number'],['vat','VAT (%)','number'],['status','Trạng thái','status'],['note','Ghi chú']]} /> : null}
            {activeStep === 3 ? <>
              <Rows title="Điều hành / phần chi" name="operationItems" register={register} fieldArray={arrays.operationItems} emptyRow={emptyOperation} columns={[['serviceType','Loại dịch vụ'],['bookingCode','Mã booking'],['serviceDate','Ngày sử dụng','date'],['quantity','Số lượng','number'],['netPrice','Giá NET','number'],['vat','VAT (%)','number'],['status','Trạng thái','status'],['note','Ghi chú']]} />
              <Rows title="Hướng dẫn viên" name="guides" register={register} fieldArray={arrays.guides} emptyRow={{ id: '', guideName: '', phone: '', language: '', note: '' }} columns={[['guideName','Hướng dẫn viên'],['phone','Số điện thoại'],['language','Ngôn ngữ'],['note','Ghi chú']]} />
            </> : null}
            {activeStep === 4 ? <Rows title="Bàn giao" name="handoverItems" register={register} fieldArray={arrays.handoverItems} emptyRow={{ id: '', itemName: '', quantity: 1, note: '' }} columns={[['itemName','Tài liệu'],['quantity','Số lượng','number'],['note','Ghi chú']]} /> : null}
            {activeStep === 5 ? <>
              <Rows title="Phiếu đánh giá dịch vụ" name="surveyQuestions" register={register} fieldArray={arrays.surveyQuestions} emptyRow={{ id: '', question: '', note: '' }} columns={[['question','Câu hỏi'],['note','Ghi chú']]} />
              <Rows title="Điều khoản và lưu ý" name="terms" register={register} fieldArray={arrays.terms} emptyRow={{ id: '', language: 'VN', terms: '', notes: '' }} columns={[['language','Ngôn ngữ','language'],['terms','Điều khoản','textarea'],['notes','Lưu ý','textarea']]} />
            </> : null}
          </div>
          <aside className="panel quoteSummaryBox">
            <h2>Tổng hợp đơn hàng</h2>
            <div className="summaryRows"><div><span>Tổng thu</span><strong>{money(totals.revenue)}</strong></div><div><span>Đã thu</span><strong>{money(values.paidAmount)}</strong></div><div><span>Còn thu</span><strong>{money(totals.remainRevenue)}</strong></div><div><span>Tổng chi</span><strong>{money(totals.cost)}</strong></div><div><span>Đã chi</span><strong>{money(values.paidCost)}</strong></div><div><span>Còn chi</span><strong>{money(totals.remainCost)}</strong></div><div><span>Lợi nhuận</span><strong>{money(totals.profit)}</strong></div><div><span>Số chỗ còn</span><strong>{totals.seatsLeft}</strong></div></div>
          </aside>
        </section>
        <div className="hotelFormActions"><button type="button" className="secondaryButton" disabled={activeStep === 0} onClick={() => setActiveStep((step) => Math.max(0, step - 1))}>Trước</button><button type="button" className="secondaryButton" disabled={activeStep >= lastStep} onClick={() => setActiveStep((step) => Math.min(lastStep, step + 1))}>Tiếp</button><button type="submit" disabled={!canEdit}><Save size={17}/> Lưu</button><button type="button" className="secondaryButton" disabled={!canUseOrderAction} onClick={() => action('copy')}><Copy size={17}/> Sao chép</button><button type="button" className="secondaryButton" disabled={!canSettle} onClick={() => action('settle')}><Lock size={17}/> Chốt quyết toán</button><button type="button" className="secondaryButton" disabled={!canUnlock} onClick={unlockSettlement}><LockOpen size={17}/> Mở khóa</button><button type="button" className="dangerButton" onClick={closeForm}><X size={17}/> Đóng</button></div>
      </form></div></div> : null}
      <section className="panel listPanel"><div className="sectionHeader orderListHeader"><h2>Danh sách {config.shortTitle}</h2><button type="button" className="secondaryButton iconTextButton" onClick={openCreate}><Plus size={16}/> Thêm mới</button><label className="searchBox"><Search size={16}/><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Tìm mã, tên, số điện thoại..." /></label></div><div className="fitTableWrap"><table className="fitTable orderListTable"><thead>{table.getHeaderGroups().map((group)=><tr key={group.id}>{group.headers.map((header)=><th key={header.id}>{flexRender(header.column.columnDef.header,header.getContext())}</th>)}</tr>)}</thead><tbody>{table.getRowModel().rows.map((row)=><tr key={row.id}>{row.getVisibleCells().map((cell)=><td key={cell.id}>{flexRender(cell.column.columnDef.cell,cell.getContext())}</td>)}</tr>)}{table.getRowModel().rows.length === 0 ? <tr><td colSpan={orderListColumnCount} className="orderListEmptyCell"><div className="tableEmptyState">Không có đơn hàng phù hợp.</div></td></tr> : null}</tbody></table></div></section>
    </div>
  );
}

function Rows<T extends ArrayName>({ title, name, register, fieldArray, columns, emptyRow }: { title: string; name: T; register: UseFormRegister<OrderForm>; fieldArray: UseFieldArrayReturn<OrderForm, T, 'fieldId'>; columns: RowColumn[]; emptyRow: Record<string, unknown> }) {
  const table = useReactTable({ data: fieldArray.fields, columns: useMemo(() => { const helper = createColumnHelper<FieldArrayWithId<OrderForm, T, 'fieldId'>>(); return [helper.display({ id: 'stt', header: 'STT', cell: ({ row }) => row.index + 1 }), ...columns.map(([key,label,type]) => helper.display({ id: key, header: label, cell: ({ row }) => <Cell name={name} index={row.index} fieldKey={key} type={type} register={register} /> })), helper.display({ id: 'actions', header: 'Thao tác', cell: ({ row }) => <><input type="hidden" {...register(`${name}.${row.index}.id` as any)} /><button type="button" className="dangerButton iconButton" onClick={() => fieldArray.remove(row.index)} aria-label="Xóa dòng"><Trash2 size={15}/></button></> })]; }, [columns, fieldArray, name, register]), getCoreRowModel: getCoreRowModel(), getRowId: (row) => String(row.fieldId) });
  return <section className="fitTableBlock"><div className="sectionHeader"><h2>{title}</h2><button type="button" className="secondaryButton" onClick={() => fieldArray.append({ ...emptyRow } as any)}><Plus size={16}/> Thêm dòng</button></div><div className="fitTableWrap"><table className="fitTable orderDynamicTable"><thead>{table.getHeaderGroups().map((group)=><tr key={group.id}>{group.headers.map((header)=><th key={header.id}>{flexRender(header.column.columnDef.header,header.getContext())}</th>)}</tr>)}</thead><tbody>{table.getRowModel().rows.map((row)=><tr key={row.id}>{row.getVisibleCells().map((cell)=><td key={cell.id}>{flexRender(cell.column.columnDef.cell,cell.getContext())}</td>)}</tr>)}</tbody></table></div></section>;
}

function Cell<T extends ArrayName>({ name, index, fieldKey, type, register }: { name: T; index: number; fieldKey: string; type?: RowColumn[2]; register: UseFormRegister<OrderForm> }) {
  const field = `${name}.${index}.${fieldKey}`;
  if (type === 'textarea') return <textarea rows={2} {...register(field as any)} />;
  if (type === 'status') return <select {...register(field as any)}><option value="WAITING">{viStatus('WAITING')}</option><option value="REQUESTED">{viStatus('REQUESTED')}</option><option value="CONFIRMED">{viStatus('CONFIRMED')}</option><option value="OPERATING">{viStatus('OPERATING')}</option><option value="COMPLETED">{viStatus('COMPLETED')}</option><option value="CANCELLED">{viStatus('CANCELLED')}</option></select>;
  if (type === 'passengerType') return <select {...register(field as any)}><option value="ADULT">Người lớn</option><option value="CHILD">Trẻ em</option><option value="INFANT">Em bé</option></select>;
  if (type === 'language') return <select {...register(field as any)}><option value="VN">Tiếng Việt</option><option value="EN">Tiếng Anh</option></select>;
  return <input type={type || 'text'} {...register(field as any)} />;
}

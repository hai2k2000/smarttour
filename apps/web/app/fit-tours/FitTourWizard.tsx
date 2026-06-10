'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import {
  Calculator,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Copy,
  FileQuestion,
  FileUp,
  Info,
  Plus,
  Save,
  Send,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FieldArrayWithId, useFieldArray, useForm, UseFormRegister } from 'react-hook-form';
import { z } from 'zod';
import { authHeaders, authJsonHeaders } from '../authFetch';

type Supplier = { id: string; name: string };
type FitTourSummary = { id: string; quoteCode: string; tourCode: string; customerName: string };

const apiBase = process.env.NEXT_PUBLIC_API_URL || '';

const workflowSteps = [
  { key: 'PRICING', label: 'Tính giá', Icon: Calculator },
  { key: 'TOUR_INFO', label: 'Thông tin tour', Icon: Info },
  { key: 'BUDGET', label: 'Dự toán dịch vụ', Icon: ClipboardList },
  { key: 'OPERATION', label: 'Điều hành dịch vụ', Icon: Send },
  { key: 'HANDOVER', label: 'Phiếu bàn giao', Icon: ClipboardCheck },
  { key: 'SURVEY', label: 'Phiếu đánh giá dịch vụ', Icon: FileQuestion },
] as const;

const serviceStatuses = ['WAITING', 'REQUESTED', 'CONFIRMED', 'OPERATING', 'COMPLETED', 'CANCELLED'];
const serviceStatusLabels: Record<string, string> = {
  WAITING: 'Chờ xử lý',
  REQUESTED: 'Đã gửi yêu cầu',
  CONFIRMED: 'Đã xác nhận',
  OPERATING: 'Đang điều hành',
  COMPLETED: 'Hoàn tất',
  CANCELLED: 'Đã hủy',
};
const marketOptions = ['Nội địa', 'Inbound', 'Outbound', 'Corporate'];
const tourTypeOptions = ['FIT', 'Free & Easy', 'Private Tour', 'Combo'];
const currencyOptions = ['VND', 'USD', 'EUR', 'THB'];
const defaultHandoverGuideRequest = [
  '1. Liên hệ khách trước tour.',
  '2. Tạo nhóm Zalo để cập nhật thông tin và hỗ trợ khách.',
  '3. Hỗ trợ khách trong suốt hành trình.',
  '4. Chụp hình tư liệu phục vụ báo cáo.',
  '5. Báo cáo phát sinh cho điều hành.',
].join('\n');
const defaultHandoverItems = [
  'Danh sách xếp phòng',
  'Vé máy bay',
  'Bảo hiểm du lịch',
  'Chương trình tour',
  'Xác nhận dịch vụ cuối cùng',
];
const defaultSurveyQuestions = [
  'Chất lượng chương trình tour',
  'Phương tiện vận chuyển',
  'Chất lượng đồ ăn',
  'Thái độ nhân viên tư vấn',
  'Chất lượng khách sạn',
  'Hướng dẫn viên',
  'Công tác tổ chức',
  'Mức độ hài lòng chung',
];
const autosaveDelayMs = 2500;

const costLineSchema = z.object({
  serviceType: z.string().default(''),
  description: z.string().default(''),
  unit: z.string().default(''),
  quantity: z.coerce.number().default(1),
  paxPerRoom: z.coerce.number().default(1),
  times: z.coerce.number().default(1),
  currency: z.string().default('VND'),
  exchangeRate: z.coerce.number().default(1),
  unitPrice: z.coerce.number().default(0),
  vat: z.coerce.number().default(0),
  amount: z.coerce.number().default(0),
  notes: z.string().default(''),
});

const serviceLineSchema = z.object({
  serviceType: z.string().default(''),
  supplierId: z.string().default(''),
  description: z.string().default(''),
  bookingCode: z.string().default(''),
  quantity: z.coerce.number().default(1),
  unitPrice: z.coerce.number().default(0),
  confirmedUnitPrice: z.coerce.number().default(0),
  vat: z.coerce.number().default(0),
  amount: z.coerce.number().default(0),
  status: z.string().default('WAITING'),
  notes: z.string().default(''),
});

const fitTourSchema = z.object({
  id: z.string().optional(),
  quoteCode: z.string().min(2),
  tourCode: z.string().min(2),
  tourName: z.string().default(''),
  marketGroup: z.string().default(''),
  bookingDate: z.string().default(''),
  startDate: z.string().default(''),
  endDate: z.string().default(''),
  customerName: z.string().min(2),
  phone: z.string().default(''),
  email: z.string().default(''),
  notes: z.string().default(''),
  adultCount: z.coerce.number().default(1),
  childCount: z.coerce.number().default(0),
  infantCount: z.coerce.number().default(0),
  sellingPrice: z.coerce.number().default(0),
  commissionPerGuest: z.coerce.number().default(0),
  workflowStatus: z.string().default('DRAFT'),
  flightRoute: z.string().default(''),
  tourType: z.string().default('FIT'),
  exchangeRateCode: z.string().default('VND'),
  exchangeRate: z.coerce.number().default(1),
  operatorOwner: z.string().default(''),
  seatCount: z.coerce.number().default(0),
  tourPrice: z.coerce.number().default(0),
  discount: z.coerce.number().default(0),
  adultPrice: z.coerce.number().default(0),
  childPrice25: z.coerce.number().default(0),
  childPrice611: z.coerce.number().default(0),
  infantPrice: z.coerce.number().default(0),
  surcharge: z.coerce.number().default(0),
  transportMode: z.string().default(''),
  outboundRoute: z.string().default(''),
  outboundCarrier: z.string().default(''),
  returnRoute: z.string().default(''),
  returnCarrier: z.string().default(''),
  pickupPoint: z.string().default(''),
  dropoffPoint: z.string().default(''),
  visaDeadline: z.string().default(''),
  holdUntil: z.string().default(''),
  confirmedAt: z.string().default(''),
  allowOverbooking: z.boolean().default(false),
  closeAt: z.string().default(''),
  handoverGuideRequest: z.string().default(defaultHandoverGuideRequest),
  surveyDescription: z.string().default(''),
  commonCosts: z.array(costLineSchema).default([]),
  hotelCosts: z.array(costLineSchema).default([]),
  privateCosts: z.array(costLineSchema).default([]),
  budgetServices: z.array(serviceLineSchema).default([]),
  operationServices: z.array(serviceLineSchema).default([]),
  guides: z.array(z.object({ name: z.string().default(''), phone: z.string().default(''), guideType: z.string().default('Local'), notes: z.string().default('') })).default([]),
  handoverItems: z.array(z.object({ itemName: z.string().default(''), quantity: z.coerce.number().default(1), notes: z.string().default('') })).default([]),
  surveyQuestions: z.array(z.object({ question: z.string().default(''), notes: z.string().default('') })).default([]),
  attachments: z.array(z.object({ id: z.string().default(''), step: z.string().default(''), fileName: z.string().default(''), fileUrl: z.string().default(''), mimeType: z.string().default(''), size: z.coerce.number().default(0), uploadedBy: z.string().default('') })).default([]),
});

type FitTourForm = z.infer<typeof fitTourSchema>;
type WorkflowStepKey = (typeof workflowSteps)[number]['key'];
type ArrayName = 'commonCosts' | 'hotelCosts' | 'privateCosts' | 'budgetServices' | 'operationServices' | 'guides' | 'handoverItems' | 'surveyQuestions' | 'attachments';
type ColumnSpec = { key: string; label: string; type?: 'text' | 'number' | 'supplier' | 'status' | 'textarea' };
type FieldOption = string | { value: string; label: string };

const stepPayloadFields: Record<WorkflowStepKey, (keyof FitTourForm)[]> = {
  PRICING: [
    'quoteCode',
    'tourCode',
    'marketGroup',
    'bookingDate',
    'startDate',
    'endDate',
    'customerName',
    'phone',
    'email',
    'adultCount',
    'childCount',
    'infantCount',
    'sellingPrice',
    'commissionPerGuest',
    'notes',
    'commonCosts',
    'hotelCosts',
    'privateCosts',
  ],
  TOUR_INFO: [
    'tourCode',
    'tourName',
    'flightRoute',
    'marketGroup',
    'startDate',
    'endDate',
    'tourType',
    'exchangeRateCode',
    'exchangeRate',
    'operatorOwner',
    'seatCount',
    'tourPrice',
    'discount',
    'adultPrice',
    'childPrice25',
    'childPrice611',
    'infantPrice',
    'surcharge',
    'transportMode',
    'outboundRoute',
    'outboundCarrier',
    'returnRoute',
    'returnCarrier',
    'pickupPoint',
    'dropoffPoint',
    'visaDeadline',
    'holdUntil',
    'confirmedAt',
    'closeAt',
    'allowOverbooking',
    'guides',
  ],
  BUDGET: ['budgetServices'],
  OPERATION: ['operationServices'],
  HANDOVER: ['handoverGuideRequest', 'handoverItems'],
  SURVEY: ['surveyDescription', 'surveyQuestions'],
};

const emptyCost = { serviceType: '', description: '', unit: '', quantity: 1, paxPerRoom: 1, times: 1, currency: 'VND', exchangeRate: 1, unitPrice: 0, vat: 0, amount: 0, notes: '' };
const emptyService = { serviceType: '', supplierId: '', description: '', bookingCode: '', quantity: 1, unitPrice: 0, confirmedUnitPrice: 0, vat: 0, amount: 0, status: 'WAITING', notes: '' };

function number(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: number) {
  return new Intl.NumberFormat('vi-VN').format(Math.round(value));
}

function positiveNumber(value: unknown, fallback = 1) {
  const parsed = number(value);
  return parsed > 0 ? parsed : fallback;
}

function lineAmount(line: Record<string, unknown>, confirmed = false, quantityOverride?: number) {
  const quantity = quantityOverride ?? positiveNumber(line.quantity);
  const times = positiveNumber(line.times);
  const exchangeRate = positiveNumber(line.exchangeRate);
  const unitPrice = confirmed ? number(line.confirmedUnitPrice) : number(line.unitPrice);
  const vat = number(line.vat);
  return quantity * times * exchangeRate * unitPrice * (1 + vat / 100);
}

function hotelLineAmount(line: Record<string, unknown>, totalPax: number) {
  const rooms = Math.ceil(Math.max(1, totalPax) / positiveNumber(line.paxPerRoom));
  return lineAmount(line, false, rooms);
}

function normalizeDate(value: unknown) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

function normalizeArray<T>(rows: unknown, fallback: T[]): T[] {
  return Array.isArray(rows) ? rows as T[] : fallback;
}

function normalizeNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function amountOrCalculated(value: unknown, calculated: number) {
  if (value === undefined || value === null || value === '') return calculated;
  return normalizeNumber(value);
}

function trimText(value: unknown) {
  return String(value ?? '').trim();
}

function rowHasValue(row: Record<string, unknown>, keys: string[]) {
  return keys.some((key) => {
    const value = row[key];
    if (typeof value === 'number') return value > 0;
    return trimText(value).length > 0;
  });
}

function cleanCostRows(rows: FitTourForm['commonCosts'], totalPax: number, hotel = false) {
  return rows
    .map((row) => ({
      ...row,
      amount: amountOrCalculated(row.amount, hotel ? hotelLineAmount(row, totalPax) : lineAmount(row)),
    }))
    .filter((row) => rowHasValue(row, ['description', 'unitPrice', 'amount', 'notes']));
}

function cleanServiceRows(rows: FitTourForm['budgetServices'], confirmed = false) {
  return rows
    .map((row) => ({ ...row, amount: amountOrCalculated(row.amount, lineAmount(row, confirmed)) }))
    .filter((row) => rowHasValue(row, ['supplierId', 'description', 'bookingCode', 'unitPrice', 'confirmedUnitPrice', 'amount', 'notes']));
}

function cleanTextRows<T extends Record<string, unknown>>(rows: T[], keys: string[]) {
  return rows.filter((row) => rowHasValue(row, keys));
}

function canPersistTour(data: FitTourForm) {
  return trimText(data.quoteCode).length >= 2 && trimText(data.tourCode).length >= 2 && trimText(data.customerName).length >= 2;
}

function confirmedWorkflowStepIndex(status: unknown) {
  const key = String(status || 'DRAFT').toUpperCase();
  if (key === 'DRAFT') return -1;
  if (key === 'COMPLETED') return workflowSteps.length - 1;
  const index = workflowSteps.findIndex((step) => step.key === String(status || '').toUpperCase());
  return index >= 0 ? index : -1;
}

function workflowStepIndex(status: unknown) {
  const confirmedIndex = confirmedWorkflowStepIndex(status);
  return Math.min(workflowSteps.length - 1, Math.max(0, confirmedIndex + 1));
}

function canOpenWorkflowStep(index: number, status: unknown) {
  return index <= workflowStepIndex(status);
}

function workflowStepLabel(status: unknown) {
  return workflowSteps.find((step) => step.key === String(status || '').toUpperCase())?.label || 'Không rõ bước';
}

function blockedWorkflowStepMessage(targetIndex: number, status: unknown) {
  const requiredStep = workflowSteps[workflowStepIndex(status)];
  const targetStep = workflowSteps[targetIndex];
  return `Cần xác nhận bước ${requiredStep.label} trước khi sang bước ${targetStep.label}`;
}

function fileHref(fileUrl?: string) {
  if (!fileUrl) return '#';
  if (/^https?:\/\//.test(fileUrl)) return fileUrl;
  return `${apiBase}${fileUrl}`;
}

function validateBeforeSave(data: FitTourForm, step?: WorkflowStepKey, creating = false) {
  const errors: string[] = [];
  const requiresIdentity = creating || !step || step === 'PRICING';
  if (requiresIdentity && trimText(data.quoteCode).length < 2) errors.push('Mã báo giá cần ít nhất 2 ký tự');
  if (requiresIdentity && trimText(data.tourCode).length < 2) errors.push('Mã tour cần ít nhất 2 ký tự');
  if (requiresIdentity && trimText(data.customerName).length < 2) errors.push('Họ tên khách cần ít nhất 2 ký tự');
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) errors.push('Email không hợp lệ');
  if (number(data.adultCount) + number(data.childCount) + number(data.infantCount) < 1) errors.push('Số khách phải lớn hơn 0');
  if (data.startDate && data.endDate && data.startDate > data.endDate) errors.push('Ngày về phải sau hoặc bằng ngày khởi đi');
  return errors;
}



function stepPayload(data: FitTourForm, step?: WorkflowStepKey) {
  if (!step) return data;
  const payload: Record<string, unknown> = {};
  for (const field of stepPayloadFields[step]) {
    payload[field] = data[field];
  }
  return payload;
}

function createPayload(data: FitTourForm) {
  const { id: _id, attachments: _attachments, ...payload } = data;
  return payload;
}

function preparePayload(data: FitTourForm, workflowStatus: WorkflowStepKey | string = data.workflowStatus || 'DRAFT'): FitTourForm {
  const totalPax = Math.max(1, number(data.adultCount) + number(data.childCount) + number(data.infantCount));
  return {
    ...data,
    quoteCode: trimText(data.quoteCode).toUpperCase(),
    tourCode: trimText(data.tourCode).toUpperCase(),
    tourName: trimText(data.tourName),
    marketGroup: trimText(data.marketGroup),
    customerName: trimText(data.customerName),
    phone: trimText(data.phone),
    email: trimText(data.email),
    notes: trimText(data.notes),
    workflowStatus,
    commonCosts: cleanCostRows(data.commonCosts, totalPax),
    hotelCosts: cleanCostRows(data.hotelCosts, totalPax, true),
    privateCosts: cleanCostRows(data.privateCosts, totalPax),
    budgetServices: cleanServiceRows(data.budgetServices),
    operationServices: cleanServiceRows(data.operationServices, true),
    guides: cleanTextRows(data.guides, ['name', 'phone', 'notes']),
    handoverItems: data.handoverItems.filter((row) => trimText(row.itemName)),
    surveyQuestions: data.surveyQuestions.filter((row) => trimText(row.question)),
    attachments: data.attachments.filter((row) => trimText(row.fileName)),
  };
}

async function responseError(response: Response) {
  const text = await response.text();
  try {
    const json = JSON.parse(text);
    const message = Array.isArray(json.message) ? json.message.join(', ') : json.message;
    return message || text || `${response.status} ${response.statusText}`;
  } catch {
    return text || `${response.status} ${response.statusText}`;
  }
}

function normalizeCostRows(rows: unknown, fallback: FitTourForm['commonCosts'], totalPax: number, hotel = false) {
  return normalizeArray(rows, fallback).map((row) => {
    const normalized = {
      ...emptyCost,
      ...row,
      quantity: normalizeNumber(row.quantity, 1),
      paxPerRoom: normalizeNumber(row.paxPerRoom, hotel ? 2 : 1),
      times: normalizeNumber(row.times, 1),
      exchangeRate: normalizeNumber(row.exchangeRate, 1),
      unitPrice: normalizeNumber(row.unitPrice),
      vat: normalizeNumber(row.vat),
    };
    return {
      ...normalized,
      amount: amountOrCalculated(row.amount, hotel ? hotelLineAmount(normalized, totalPax) : lineAmount(normalized)),
    };
  });
}

function normalizeServiceRows(rows: unknown, fallback: FitTourForm['budgetServices'], confirmed = false) {
  return normalizeArray(rows, fallback).map((row) => {
    const normalized = {
      ...emptyService,
      ...row,
      quantity: normalizeNumber(row.quantity, 1),
      unitPrice: normalizeNumber(row.unitPrice),
      confirmedUnitPrice: normalizeNumber(row.confirmedUnitPrice),
      vat: normalizeNumber(row.vat),
      status: serviceStatuses.includes(String(row.status)) ? String(row.status) : 'WAITING',
    };
    return { ...normalized, amount: amountOrCalculated(row.amount, lineAmount(normalized, confirmed)) };
  });
}

function toFormDefaults(tour?: Partial<FitTourForm>): FitTourForm {
  const today = new Date().toISOString().slice(0, 10);
  const defaults: FitTourForm = {
    quoteCode: '',
    tourCode: '',
    tourName: '',
    marketGroup: 'Nội địa',
    bookingDate: today,
    startDate: '',
    endDate: '',
    customerName: '',
    phone: '',
    email: '',
    notes: '',
    adultCount: 1,
    childCount: 0,
    infantCount: 0,
    sellingPrice: 0,
    commissionPerGuest: 0,
    workflowStatus: 'DRAFT',
    flightRoute: '',
    tourType: 'FIT',
    exchangeRateCode: 'VND',
    exchangeRate: 1,
    operatorOwner: '',
    seatCount: 1,
    tourPrice: 0,
    discount: 0,
    adultPrice: 0,
    childPrice25: 0,
    childPrice611: 0,
    infantPrice: 0,
    surcharge: 0,
    transportMode: '',
    outboundRoute: '',
    outboundCarrier: '',
    returnRoute: '',
    returnCarrier: '',
    pickupPoint: '',
    dropoffPoint: '',
    visaDeadline: '',
    holdUntil: '',
    confirmedAt: '',
    allowOverbooking: false,
    closeAt: '',
    handoverGuideRequest: defaultHandoverGuideRequest,
    surveyDescription: '',
    commonCosts: [{ ...emptyCost, serviceType: 'Xe', unit: 'gói' }],
    hotelCosts: [{ ...emptyCost, serviceType: 'Khách sạn', unit: 'phòng', paxPerRoom: 2 }],
    privateCosts: [{ ...emptyCost, serviceType: 'Vé tham quan', unit: 'khách' }],
    budgetServices: [{ ...emptyService, serviceType: 'Khách sạn' }],
    operationServices: [],
    guides: [{ name: '', phone: '', guideType: 'Nội địa', notes: '' }],
    handoverItems: defaultHandoverItems.map((itemName) => ({ itemName, quantity: 1, notes: '' })),
    surveyQuestions: defaultSurveyQuestions.map((question) => ({ question, notes: '' })),
    attachments: [],
  };

  const merged = { ...defaults, ...tour };
  const totalPax = Math.max(
    1,
    normalizeNumber(tour?.adultCount, defaults.adultCount)
      + normalizeNumber(tour?.childCount, defaults.childCount)
      + normalizeNumber(tour?.infantCount, defaults.infantCount),
  );
  return {
    ...merged,
    adultCount: normalizeNumber(tour?.adultCount, defaults.adultCount),
    childCount: normalizeNumber(tour?.childCount, defaults.childCount),
    infantCount: normalizeNumber(tour?.infantCount, defaults.infantCount),
    sellingPrice: normalizeNumber(tour?.sellingPrice, defaults.sellingPrice),
    commissionPerGuest: normalizeNumber(tour?.commissionPerGuest, defaults.commissionPerGuest),
    exchangeRate: normalizeNumber(tour?.exchangeRate, defaults.exchangeRate),
    seatCount: normalizeNumber(tour?.seatCount, defaults.seatCount),
    tourPrice: normalizeNumber(tour?.tourPrice, defaults.tourPrice),
    discount: normalizeNumber(tour?.discount, defaults.discount),
    adultPrice: normalizeNumber(tour?.adultPrice, defaults.adultPrice),
    childPrice25: normalizeNumber(tour?.childPrice25, defaults.childPrice25),
    childPrice611: normalizeNumber(tour?.childPrice611, defaults.childPrice611),
    infantPrice: normalizeNumber(tour?.infantPrice, defaults.infantPrice),
    surcharge: normalizeNumber(tour?.surcharge, defaults.surcharge),
    allowOverbooking: Boolean(tour?.allowOverbooking),
    bookingDate: normalizeDate(tour?.bookingDate) || today,
    startDate: normalizeDate(tour?.startDate),
    endDate: normalizeDate(tour?.endDate),
    visaDeadline: normalizeDate(tour?.visaDeadline),
    holdUntil: normalizeDate(tour?.holdUntil),
    confirmedAt: normalizeDate(tour?.confirmedAt),
    closeAt: normalizeDate(tour?.closeAt),
    commonCosts: normalizeCostRows(tour?.commonCosts, defaults.commonCosts, totalPax),
    hotelCosts: normalizeCostRows(tour?.hotelCosts, defaults.hotelCosts, totalPax, true),
    privateCosts: normalizeCostRows(tour?.privateCosts, defaults.privateCosts, totalPax),
    budgetServices: normalizeServiceRows(tour?.budgetServices, defaults.budgetServices),
    operationServices: normalizeServiceRows(tour?.operationServices, defaults.operationServices, true),
    guides: normalizeArray(tour?.guides, defaults.guides).map((row) => ({
      name: trimText(row.name),
      phone: trimText(row.phone),
      guideType: trimText(row.guideType) || 'Nội địa',
      notes: trimText(row.notes),
    })),
    handoverItems: normalizeArray(tour?.handoverItems, defaults.handoverItems).map((row) => ({
      itemName: trimText(row.itemName),
      quantity: normalizeNumber(row.quantity, 1),
      notes: trimText(row.notes),
    })),
    surveyQuestions: normalizeArray(tour?.surveyQuestions, defaults.surveyQuestions).map((row) => ({
      question: trimText(row.question),
      notes: trimText(row.notes),
    })),
    attachments: normalizeArray(tour?.attachments, defaults.attachments).filter(
      (row) => trimText(row.fileName) && workflowSteps.some((step) => step.key === row.step),
    ),
  };
}

type SaveReason = 'autosave' | 'save' | 'confirm' | 'upload' | 'delete-attachment' | 'copy-budget' | 'copy-operation';
type FitTourWizardProps = {
  suppliers: Supplier[];
  tours: FitTourSummary[];
  initialTourId?: string;
  onSaved?: (tour: Partial<FitTourForm> & { id?: string }, reason: SaveReason) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onStatusChange?: (message: string) => void;
};

export default function FitTourWizard({ suppliers, tours, initialTourId = '', onSaved, onDirtyChange, onStatusChange }: FitTourWizardProps) {
  const [activeStep, setActiveStep] = useState(0);
  const [saveState, setSaveState] = useState('Chưa lưu');
  const [selectedTourId, setSelectedTourId] = useState('');
  const [copySourceTourId, setCopySourceTourId] = useState('');
  const lastAutosaveSignature = useRef('');
  const saveInFlight = useRef(false);
  const loadRequestId = useRef(0);
  const loadedTourId = useRef('');
  const form = useForm<FitTourForm>({
    resolver: zodResolver(fitTourSchema) as never,
    defaultValues: toFormDefaults(),
    mode: 'onChange',
  });
  const { register, control, handleSubmit, watch, setValue, getValues, reset, formState, getFieldState } = form;

  const arrays = {
    commonCosts: useFieldArray({ control, name: 'commonCosts' }),
    hotelCosts: useFieldArray({ control, name: 'hotelCosts' }),
    privateCosts: useFieldArray({ control, name: 'privateCosts' }),
    budgetServices: useFieldArray({ control, name: 'budgetServices' }),
    operationServices: useFieldArray({ control, name: 'operationServices' }),
    guides: useFieldArray({ control, name: 'guides' }),
    handoverItems: useFieldArray({ control, name: 'handoverItems' }),
    surveyQuestions: useFieldArray({ control, name: 'surveyQuestions' }),
    attachments: useFieldArray({ control, name: 'attachments' }),
  };

  useEffect(() => {
    void loadTour(initialTourId);
  }, [initialTourId]);

  const values = watch();
  const totalPax = Math.max(1, number(values.adultCount) + number(values.childCount) + number(values.infantCount));
  const totalCommonCost = [...values.commonCosts, ...values.hotelCosts].reduce((sum, row) => sum + number(row.amount), 0);
  const totalPrivateCost = values.privateCosts.reduce((sum, row) => sum + number(row.amount), 0);
  const netPerGuest = totalCommonCost / totalPax + totalPrivateCost;
  const profitPerGuest = number(values.sellingPrice) - netPerGuest;
  const priceWithCommission = number(values.sellingPrice) + number(values.commissionPerGuest);
  const budgetRevenue = totalPax * number(values.sellingPrice);
  const budgetCost = values.budgetServices.reduce((sum, row) => sum + number(row.amount), 0);
  const operationCost = values.operationServices.reduce((sum, row) => sum + number(row.amount), 0);
  const budgetProfit = budgetRevenue - budgetCost;
  const operationProfit = budgetRevenue - operationCost;
  const currentStepPayloadSignature = JSON.stringify(stepPayload(preparePayload(values), workflowSteps[activeStep].key));
  const hasUnsavedChanges = formState.isDirty && currentStepPayloadSignature !== lastAutosaveSignature.current;
  const maxOpenStep = workflowStepIndex(values.workflowStatus);

  function goToStep(index: number) {
    if (index < 0 || index >= workflowSteps.length) return;
    const workflowStatus = getValues('workflowStatus');
    if (!canOpenWorkflowStep(index, workflowStatus)) {
      setSaveState(blockedWorkflowStepMessage(index, workflowStatus));
      return;
    }
    setActiveStep(index);
  }

  useEffect(() => {
    onDirtyChange?.(hasUnsavedChanges);
  }, [hasUnsavedChanges, onDirtyChange]);

  useEffect(() => {
    onStatusChange?.(saveState);
  }, [onStatusChange, saveState]);

  useEffect(() => {
    const subscription = watch((_value, { name }) => {
      if (!name || name.endsWith('amount')) return;
      const tableName = name.split('.')[0] as ArrayName;
      if (!['commonCosts', 'hotelCosts', 'privateCosts', 'budgetServices', 'operationServices'].includes(tableName)) return;
      const index = Number(name.split('.')[1]);
      if (!Number.isInteger(index)) return;
      const row = getValues(`${tableName}.${index}` as never) as Record<string, unknown>;
      const amountPath = `${tableName}.${index}.amount` as never;
      if (getFieldState(amountPath).isDirty) return;
      const amount = tableName === 'hotelCosts'
        ? hotelLineAmount(row, totalPax)
        : lineAmount(row, tableName === 'operationServices');
      if (Math.abs(number(row.amount) - amount) > 0.5) {
        setValue(amountPath, amount as never, { shouldDirty: false, shouldValidate: false });
      }
    });
    return () => subscription.unsubscribe();
  }, [getFieldState, getValues, setValue, totalPax, watch]);

  useEffect(() => {
    values.hotelCosts.forEach((_row, index) => {
      const amountPath = `hotelCosts.${index}.amount` as never;
      if (getFieldState(amountPath).isDirty) return;
      const row = getValues(`hotelCosts.${index}` as never) as Record<string, unknown>;
      const amount = hotelLineAmount(row, totalPax);
      if (Math.abs(number(row.amount) - amount) > 0.5) {
        setValue(amountPath, amount as never, { shouldDirty: false, shouldValidate: false });
      }
    });
  }, [getFieldState, getValues, setValue, totalPax, values.hotelCosts]);

  useEffect(() => {
    const timeout = setTimeout(async () => {
      const current = getValues();
      if (!formState.isDirty) return;
      if (!current.id) {
        setSaveState('Tour mới chỉ được lưu khi bạn bấm Lưu nháp');
        return;
      }
      if (saveInFlight.current || formState.isSubmitting) return;
      if (!canPersistTour(current)) {
        setSaveState('Chưa đủ thông tin để tự lưu');
        return;
      }
      const step = workflowSteps[activeStep].key;
      const payload = preparePayload(current, step);
      const creating = !payload.id;
      const errors = validateBeforeSave(payload, step, creating);
      if (errors.length) {
        setSaveState(`Chưa thể tự lưu: ${errors[0]}`);
        return;
      }
      const signature = JSON.stringify(creating ? payload : stepPayload(payload, step));
      if (signature === lastAutosaveSignature.current) return;
      setSaveState('Đang tự lưu...');
      try {
        saveInFlight.current = true;
        const saved = await saveTour(payload, step, 'draft');
        const savedPayload = preparePayload({ ...current, id: saved.id || current.id }, step);
        lastAutosaveSignature.current = JSON.stringify(creating ? savedPayload : stepPayload(savedPayload, step));
        onSaved?.(saved, 'autosave');
        setSaveState(`Đã tự lưu ${new Date().toLocaleTimeString('vi-VN')}`);
      } catch (error) {
        setSaveState(`Tự lưu lỗi: ${error instanceof Error ? error.message : 'không xác định'}`);
      } finally {
        saveInFlight.current = false;
      }
    }, autosaveDelayMs);
    return () => clearTimeout(timeout);
  }, [values, activeStep, formState.isDirty, formState.isSubmitting, getValues, onSaved]);


  async function saveTour(data: FitTourForm, workflowStatus: WorkflowStepKey | string = data.workflowStatus || 'DRAFT', mode: 'draft' | 'confirm' = 'draft') {
    const step = workflowSteps.some((item) => item.key === workflowStatus) ? workflowStatus as WorkflowStepKey : undefined;
    const creating = !data.id;
    const payloadWorkflowStatus = creating && mode === 'draft' ? data.workflowStatus || 'DRAFT' : workflowStatus;
    const payload = preparePayload(data, payloadWorkflowStatus);
    const errors = validateBeforeSave(payload, step, creating);
    if (errors.length) throw new Error(errors.join('. '));
    const url = creating || !step
      ? `${apiBase}/api/fit-tours`
      : mode === 'confirm'
        ? `${apiBase}/api/fit-tours/${payload.id}/steps/${step}/confirm`
        : `${apiBase}/api/fit-tours/${payload.id}/steps/${step}`;
    const response = await fetch(url, {
      method: creating || !step ? 'POST' : mode === 'confirm' ? 'POST' : 'PATCH',
      headers: authJsonHeaders(),
      body: JSON.stringify(creating ? createPayload(payload) : !step ? payload : stepPayload(payload, step)),
    });
    if (!response.ok) throw new Error(await responseError(response));
    return response.json();
  }


  async function submit(data: FitTourForm) {
    setSaveState('Đang lưu nháp...');
    try {
      const step = workflowSteps[activeStep].key;
      const saved = await saveTour(data, step, 'draft');
      const defaults = toFormDefaults(saved);
      reset(defaults, { keepDirty: false });
      lastAutosaveSignature.current = JSON.stringify(preparePayload(defaults));
      setSelectedTourId(saved.id || '');
      loadedTourId.current = saved.id || '';
      onSaved?.(saved, 'save');
      setSaveState(`Đã lưu nháp bước ${activeStep + 1}: ${workflowSteps[activeStep].label}`);
    } catch (error) {
      setSaveState(`Lưu nháp lỗi: ${error instanceof Error ? error.message : 'không xác định'}`);
    }
  }

  async function confirmCurrentStep(data: FitTourForm) {
    setSaveState('Đang xác nhận bước...');
    try {
      const step = workflowSteps[activeStep].key;
      let draft = data;
      if (!draft.id) {
        const created = await saveTour(draft, step, 'draft');
        draft = toFormDefaults(created);
        setSelectedTourId(created.id || '');
        loadedTourId.current = created.id || '';
        setValue('id', created.id || '', { shouldDirty: false });
      }
      const saved = await saveTour({ ...draft, workflowStatus: step }, step, 'confirm');
      const defaults = toFormDefaults(saved);
      reset(defaults, { keepDirty: false });
      lastAutosaveSignature.current = JSON.stringify(preparePayload(defaults));
      setSelectedTourId(saved.id || '');
      loadedTourId.current = saved.id || '';
      onSaved?.(saved, 'confirm');
      const nextStep = Math.min(workflowSteps.length - 1, activeStep + 1);
      if (nextStep !== activeStep) setActiveStep(nextStep);
      setSaveState(`Đã xác nhận bước ${activeStep + 1}: ${workflowSteps[activeStep].label}`);
    } catch (error) {
      setSaveState(`Xác nhận bước lỗi: ${error instanceof Error ? error.message : 'không xác định'}`);
    }
  }

  async function loadTour(id: string) {
    const requestId = ++loadRequestId.current;
    if (!id) {
      setSelectedTourId('');
      loadedTourId.current = '';
      setCopySourceTourId('');
      setActiveStep(0);
      lastAutosaveSignature.current = '';
      reset(toFormDefaults());
      setSaveState('Chưa lưu');
      return;
    }
    setSelectedTourId(id);
    setSaveState('Đang tải tour...');
    try {
      const response = await fetch(`${apiBase}/api/fit-tours/${id}`, { headers: authHeaders() });
      if (!response.ok) throw new Error(await responseError(response));
      const defaults = toFormDefaults(await response.json());
      if (requestId !== loadRequestId.current) return;
      setCopySourceTourId('');
      reset(defaults, { keepDirty: false });
      setActiveStep(workflowStepIndex(defaults.workflowStatus));
      lastAutosaveSignature.current = JSON.stringify(preparePayload(defaults));
      loadedTourId.current = id;
      setSaveState('Đã tải tour');
    } catch (error) {
      if (requestId !== loadRequestId.current) return;
      setSelectedTourId(loadedTourId.current);
      setSaveState(`Tải tour lỗi: ${error instanceof Error ? error.message : 'không xác định'}`);
    }
  }

  function selectTour(id: string) {
    if (id === selectedTourId) return;
    if (hasUnsavedChanges && !window.confirm('Tour FIT còn thay đổi chưa lưu. Bạn có chắc muốn chuyển sang tour khác?')) return;
    void loadTour(id);
  }

  async function copyBudget() {
    const id = getValues('id');
    if (!id) {
      setSaveState('Hãy lưu tour trước khi sao chép dự toán');
      return;
    }
    if (!copySourceTourId || copySourceTourId === id) {
      setSaveState('Hãy chọn một tour nguồn khác để sao chép dự toán');
      return;
    }
    setSaveState('Đang sao chép dự toán...');
    try {
      const response = await fetch(`${apiBase}/api/fit-tours/${id}/copy-budget`, {
        method: 'POST',
        headers: authJsonHeaders(),
        body: JSON.stringify({ sourceTourId: copySourceTourId }),
      });
      if (!response.ok) throw new Error(await responseError(response));
      const saved = await response.json();
      const defaults = toFormDefaults(saved);
      reset(defaults, { keepDirty: false });
      lastAutosaveSignature.current = JSON.stringify(preparePayload(defaults));
      loadedTourId.current = saved.id || id;
      onSaved?.(saved, 'copy-budget');
      setSaveState('Đã sao chép dự toán dịch vụ');
    } catch (error) {
      setSaveState(`Sao chép dự toán lỗi: ${error instanceof Error ? error.message : 'không xác định'}`);
    }
  }

  async function copyOperation() {
    const id = getValues('id');
    if (!id) {
      setSaveState('Hãy lưu tour trước khi sao chép điều hành');
      return;
    }
    setSaveState('Đang sao chép điều hành...');
    try {
      const response = await fetch(`${apiBase}/api/fit-tours/${id}/copy-operation`, {
        method: 'POST',
        headers: authJsonHeaders(),
        body: JSON.stringify({ sourceTourId: copySourceTourId || id }),
      });
      if (!response.ok) throw new Error(await responseError(response));
      const saved = await response.json();
      const defaults = toFormDefaults(saved);
      reset(defaults, { keepDirty: false });
      lastAutosaveSignature.current = JSON.stringify(preparePayload(defaults));
      loadedTourId.current = saved.id || id;
      onSaved?.(saved, 'copy-operation');
      setSaveState('Đã sao chép điều hành dịch vụ');
    } catch (error) {
      setSaveState(`Sao chép điều hành lỗi: ${error instanceof Error ? error.message : 'không xác định'}`);
    }
  }

  async function uploadAttachmentFile(file: File, step: WorkflowStepKey) {
    let id = getValues('id');
    if (!id) {
      const created = await saveTour(getValues(), step, 'draft');
      const defaults = toFormDefaults(created);
      reset(defaults, { keepDirty: false });
      lastAutosaveSignature.current = JSON.stringify(preparePayload(defaults));
      setSelectedTourId(created.id || '');
      loadedTourId.current = created.id || '';
      id = created.id;
    }
    if (!id) throw new Error('Chưa có tour FIT để tải file');
    const body = new FormData();
    body.append('file', file);
    body.append('step', step);
    const response = await fetch(`${apiBase}/api/fit-tours/${id}/attachments`, {
      method: 'POST',
      headers: authHeaders(),
      body,
    });
    if (!response.ok) throw new Error(await responseError(response));
    return response.json();
  }

  async function addFiles(files: FileList | null) {
    if (!files) return;
    const validFiles = Array.from(files).filter((file) => file.name);
    if (!validFiles.length) return;
    const step = workflowSteps[activeStep].key;
    const stepLabel = workflowSteps[activeStep].label;
    setSaveState(`Đang tải ${validFiles.length} file...`);
    try {
      let saved: Partial<FitTourForm> & { id?: string } | undefined;
      for (const file of validFiles) {
        saved = await uploadAttachmentFile(file, step);
      }
      if (saved) {
        const defaults = toFormDefaults(saved);
        reset(defaults, { keepDirty: false });
        lastAutosaveSignature.current = JSON.stringify(preparePayload(defaults));
        setSelectedTourId(saved.id || '');
        loadedTourId.current = saved.id || '';
        onSaved?.(saved, 'upload');
      }
      setSaveState(`Đã tải ${validFiles.length} file vào bước ${stepLabel}`);
    } catch (error) {
      setSaveState(`Tải file lỗi: ${error instanceof Error ? error.message : 'không xác định'}`);
    }
  }

  async function removeAttachment(attachment: FitTourForm['attachments'][number]) {
    const id = getValues('id');
    if (!id || !attachment.id) {
      setSaveState('Chưa có file hợp lệ để xóa');
      return;
    }
    if (!window.confirm(`Xóa file ${attachment.fileName || 'đính kèm'} khỏi tour FIT?`)) return;
    setSaveState('Đang xóa file đính kèm...');
    try {
      const response = await fetch(`${apiBase}/api/fit-tours/${id}/attachments/${attachment.id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (!response.ok) throw new Error(await responseError(response));
      const saved = await response.json();
      const defaults = toFormDefaults(saved);
      reset(defaults, { keepDirty: false });
      lastAutosaveSignature.current = JSON.stringify(preparePayload(defaults));
      setSelectedTourId(saved.id || '');
      loadedTourId.current = saved.id || '';
      onSaved?.(saved, 'delete-attachment');
      setSaveState(`Đã xóa file ${attachment.fileName || 'đính kèm'}`);
    } catch (error) {
      setSaveState(`Xóa file lỗi: ${error instanceof Error ? error.message : 'không xác định'}`);
    }
  }


  return (
    <form onSubmit={handleSubmit(submit)} className="fitWizard">
      <section className="fitToolbar">
        <div className="fitSteps">
          {workflowSteps.map((step, index) => {
            const StepIcon = step.Icon;
            const locked = index > maxOpenStep;
            return (
              <button
                type="button"
                key={step.key}
                className={`${activeStep === index ? 'active' : ''}${locked ? ' locked' : ''}`}
                aria-disabled={locked}
                title={locked ? blockedWorkflowStepMessage(index, values.workflowStatus) : step.label}
                onClick={() => goToStep(index)}
              >
                <span>{index + 1}</span><StepIcon size={15} />{step.label}
              </button>
            );
          })}
        </div>
        <div className="fitActions">
          <select value={selectedTourId} onChange={(event) => selectTour(event.target.value)} aria-label="Chọn tour FIT">
            <option value="">Tạo tour FIT mới</option>
            {tours.map((tour) => <option key={tour.id} value={tour.id}>{tour.quoteCode} - {tour.customerName}</option>)}
          </select>
          <span>{saveState}</span>
          <button type="submit"><Save size={15} /> Lưu nháp</button>
          <button type="button" onClick={handleSubmit(confirmCurrentStep)}><Send size={15} /> Xác nhận bước</button>
        </div>
      </section>

      {activeStep === 0 ? (
        <section className="fitStep">
          <SummaryCards items={[
            ['Tổng phí chung', money(totalCommonCost)],
            ['Tổng phí riêng', money(totalPrivateCost)],
            ['Giá vốn / khách', money(netPerGuest)],
            ['Lợi nhuận / khách', money(profitPerGuest)],
            ['Hoa hồng / khách', money(number(values.commissionPerGuest))],
            ['Giá có hoa hồng', money(priceWithCommission)],
          ]} />
          <div className="fitFormGrid">
            <Field label="Mã báo giá" name="quoteCode" register={register} required />
            <Field label="Mã tour" name="tourCode" register={register} required />
            <Field label="Nhóm thị trường" name="marketGroup" register={register} as="select" options={marketOptions} />
            <Field label="Ngày đặt" name="bookingDate" register={register} type="date" />
            <Field label="Khởi đi" name="startDate" register={register} type="date" />
            <Field label="Ngày về" name="endDate" register={register} type="date" />
            <Field label="Họ tên khách" name="customerName" register={register} required />
            <Field label="Điện thoại" name="phone" register={register} />
            <Field label="Email" name="email" register={register} type="email" />
            <Field label="Số người lớn" name="adultCount" register={register} type="number" />
            <Field label="Trẻ em" name="childCount" register={register} type="number" />
            <Field label="Em bé" name="infantCount" register={register} type="number" />
            <Field label="Giá bán / khách" name="sellingPrice" register={register} type="number" />
            <Field label="Hoa hồng / khách" name="commissionPerGuest" register={register} type="number" />
            <label className="span2">Ghi chú<textarea {...register('notes')} rows={4} /></label>
            <label className="fileDrop span2"><FileUp size={16} /> File đính kèm<input type="file" multiple onChange={(event) => { void addFiles(event.target.files); event.currentTarget.value = ''; }} /></label>
            <AttachmentList attachments={values.attachments} onRemove={(attachment) => void removeAttachment(attachment)} />
          </div>
          <EditableTable title="Chi phí chung" name="commonCosts" fields={arrays.commonCosts.fields} register={register} append={() => arrays.commonCosts.append({ ...emptyCost })} remove={arrays.commonCosts.remove} columns={costColumns} />
          <EditableTable title="Chi phí khách sạn" name="hotelCosts" fields={arrays.hotelCosts.fields} register={register} append={() => arrays.hotelCosts.append({ ...emptyCost, serviceType: 'Khách sạn', unit: 'phòng', paxPerRoom: 2 })} remove={arrays.hotelCosts.remove} columns={hotelColumns} />
          <EditableTable title="Chi phí riêng khách" name="privateCosts" fields={arrays.privateCosts.fields} register={register} append={() => arrays.privateCosts.append({ ...emptyCost })} remove={arrays.privateCosts.remove} columns={costColumns} />
        </section>
      ) : null}

      {activeStep === 1 ? (
        <section className="fitStep">
          <div className="fitFormGrid">
            <Field label="Mã tour" name="tourCode" register={register} required />
            <Field label="Tên tour" name="tourName" register={register} />
            <Field label="Hành trình bay" name="flightRoute" register={register} />
            <Field label="Nhóm thị trường" name="marketGroup" register={register} as="select" options={marketOptions} />
            <Field label="Khởi đi" name="startDate" register={register} type="date" />
            <Field label="Ngày về" name="endDate" register={register} type="date" />
            <Field label="Loại hình" name="tourType" register={register} as="select" options={tourTypeOptions} />
            <Field label="Tỷ giá" name="exchangeRateCode" register={register} as="select" options={currencyOptions} />
            <Field label="Nhân viên điều hành" name="operatorOwner" register={register} />
            <Field label="Số chỗ nhận" name="seatCount" register={register} type="number" />
            <Field label="Giá tour" name="tourPrice" register={register} type="number" />
            <Field label="Giảm giá" name="discount" register={register} type="number" />
            <Field label="Giá người lớn" name="adultPrice" register={register} type="number" />
            <Field label="Giá trẻ em 2-5" name="childPrice25" register={register} type="number" />
            <Field label="Giá trẻ em 6-11" name="childPrice611" register={register} type="number" />
            <Field label="Giá em bé" name="infantPrice" register={register} type="number" />
            <Field label="Phụ thu trên tour" name="surcharge" register={register} type="number" />
            <Field label="Phương tiện" name="transportMode" register={register} />
            <Field label="Hành trình đi" name="outboundRoute" register={register} />
            <Field label="Hãng đi" name="outboundCarrier" register={register} />
            <Field label="Hành trình về" name="returnRoute" register={register} />
            <Field label="Hãng về" name="returnCarrier" register={register} />
            <Field label="Điểm đón" name="pickupPoint" register={register} />
            <Field label="Điểm trả" name="dropoffPoint" register={register} />
            <Field label="Hạn xin visa" name="visaDeadline" register={register} type="date" />
            <Field label="Thời gian giữ chỗ" name="holdUntil" register={register} type="date" />
            <Field label="Thời gian nhận chỗ" name="confirmedAt" register={register} type="date" />
            <Field label="Thời gian đóng chỗ" name="closeAt" register={register} type="date" />
            <label className="checkLine"><input type="checkbox" {...register('allowOverbooking')} /> Cho phép nhận thêm khách vượt số chỗ dự kiến sau khi điều hành xác nhận</label>
          </div>
          <EditableTable title="Hướng dẫn viên" name="guides" fields={arrays.guides.fields} register={register} append={() => arrays.guides.append({ name: '', phone: '', guideType: 'Nội địa', notes: '' })} remove={arrays.guides.remove} columns={guideColumns} />
        </section>
      ) : null}

      {activeStep === 2 ? (
        <section className="fitStep">
          <SummaryCards items={[
            ['Tổng thu dự kiến', money(budgetRevenue)],
            ['Tổng chi dự kiến', money(budgetCost)],
            ['Lợi nhuận dự kiến', money(budgetProfit)],
            ['Tỷ suất lợi nhuận', `${budgetRevenue ? Math.round((budgetProfit / budgetRevenue) * 1000) / 10 : 0}%`],
          ]} />
          <div className="copyBar">
            <CopySourceSelect tours={tours} currentTourId={values.id} value={copySourceTourId} onChange={setCopySourceTourId} emptyLabel="Chọn tour nguồn để sao chép dự toán" />
            <button type="button" onClick={copyBudget}><Copy size={15} /> Sao chép dự toán</button>
          </div>
          <EditableTable title="Dự toán dịch vụ" name="budgetServices" fields={arrays.budgetServices.fields} register={register} append={() => arrays.budgetServices.append({ ...emptyService })} remove={arrays.budgetServices.remove} columns={budgetColumns} suppliers={suppliers} />
        </section>
      ) : null}

      {activeStep === 3 ? (
        <section className="fitStep">
          <SummaryCards items={[
            ['Tổng chi điều hành', money(operationCost)],
            ['Lợi nhuận dự kiến', money(budgetProfit)],
            ['Lợi nhuận thực tế', money(operationProfit)],
          ]} />
          <div className="copyBar">
            <CopySourceSelect tours={tours} currentTourId={values.id} value={copySourceTourId} onChange={setCopySourceTourId} emptyLabel="Dùng dự toán của tour hiện tại" />
            <button type="button" onClick={copyOperation}><Copy size={15} /> Sao chép sang điều hành</button>
          </div>
          <EditableTable title="Điều hành dịch vụ" name="operationServices" fields={arrays.operationServices.fields} register={register} append={() => arrays.operationServices.append({ ...emptyService })} remove={arrays.operationServices.remove} columns={operationColumns} suppliers={suppliers} />
        </section>
      ) : null}

      {activeStep === 4 ? (
        <section className="fitStep">
          <SummaryCards items={[['Tour', values.tourName || values.tourCode || '-'], ['Tổng số khách', String(totalPax)], ['Ngày khởi hành', values.startDate || '-'], ['Điểm đón', values.pickupPoint || '-'], ['Ngày về', values.endDate || '-'], ['Hướng dẫn viên phụ trách', values.guides[0]?.name || '-']]} />
          <label>Yêu cầu hướng dẫn viên<textarea {...register('handoverGuideRequest')} rows={8} /></label>
          <EditableTable title="Vật dụng và quà tặng" name="handoverItems" fields={arrays.handoverItems.fields} register={register} append={() => arrays.handoverItems.append({ itemName: '', quantity: 1, notes: '' })} remove={arrays.handoverItems.remove} columns={handoverColumns} />
        </section>
      ) : null}

      {activeStep === 5 ? (
        <section className="fitStep">
          <SummaryCards items={[['Tour', values.tourName || values.tourCode || '-'], ['Tổng số khách', String(totalPax)], ['Ngày khởi hành', values.startDate || '-'], ['Ngày về', values.endDate || '-'], ['Số câu hỏi', String(values.surveyQuestions.filter((row) => trimText(row.question)).length)], ['Hướng dẫn viên phụ trách', values.guides[0]?.name || '-']]} />
          <label>Nội dung mở đầu phiếu đánh giá<textarea {...register('surveyDescription')} rows={5} /></label>
          <EditableTable title="Câu hỏi đánh giá dịch vụ" name="surveyQuestions" fields={arrays.surveyQuestions.fields} register={register} append={() => arrays.surveyQuestions.append({ question: '', notes: '' })} remove={arrays.surveyQuestions.remove} columns={surveyColumns} />
        </section>
      ) : null}

      <section className="wizardFooter">
        <button type="button" className="secondaryButton" disabled={activeStep === 0} onClick={() => goToStep(Math.max(0, activeStep - 1))}><ChevronLeft size={15} /> Trước</button>
        <button type="button" className="secondaryButton" disabled={activeStep === workflowSteps.length - 1} onClick={() => goToStep(Math.min(workflowSteps.length - 1, activeStep + 1))}>Tiếp <ChevronRight size={15} /></button>
      </section>
    </form>
  );
}

function SummaryCards({ items }: { items: [string, string][] }) {
  return <div className="fitSummary">{items.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>;
}

function AttachmentList({ attachments, onRemove }: { attachments: FitTourForm['attachments']; onRemove: (attachment: FitTourForm['attachments'][number]) => void }) {
  const rows = attachments.filter((row) => trimText(row.fileName));
  if (!rows.length) return <div className="attachmentList span2"><span className="mutedText">Chưa có file đính kèm.</span></div>;
  return (
    <div className="attachmentList span2">
      {rows.map((attachment, index) => (
        <div className="attachmentItem" key={attachment.id || `${attachment.fileName}-${index}`}>
          <div>
            <a href={fileHref(attachment.fileUrl)} target="_blank" rel="noreferrer">{attachment.fileName}</a>
            <span>{workflowStepLabel(attachment.step)}</span>
          </div>
          <button type="button" className="iconButton dangerButton" onClick={() => onRemove(attachment)} aria-label={`Xóa file ${attachment.fileName}`} title="Xóa file"><Trash2 size={14} /></button>
        </div>
      ))}
    </div>
  );
}

function CopySourceSelect({ tours, currentTourId, value, onChange, emptyLabel }: {
  tours: FitTourSummary[];
  currentTourId?: string;
  value: string;
  onChange: (value: string) => void;
  emptyLabel: string;
}) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} aria-label="Chọn tour nguồn">
      <option value="">{emptyLabel}</option>
      {tours.filter((tour) => tour.id !== currentTourId).map((tour) => (
        <option key={tour.id} value={tour.id}>{tour.quoteCode} - {tour.tourCode} - {tour.customerName}</option>
      ))}
    </select>
  );
}

function Field({ label, name, register, type = 'text', required, as, options = [] }: { label: string; name: keyof FitTourForm; register: UseFormRegister<FitTourForm>; type?: string; required?: boolean; as?: 'select'; options?: FieldOption[] }) {
  return (
    <label>{label}
      {as === 'select' ? (
        <select {...register(name)} required={required}>{options.map((option) => {
          const value = typeof option === 'string' ? option : option.value;
          const optionLabel = typeof option === 'string' ? option : option.label;
          return <option key={value} value={value}>{optionLabel}</option>;
        })}</select>
      ) : (
        <input type={type} {...register(name)} required={required} />
      )}
    </label>
  );
}

function EditableTable({ title, name, fields, register, append, remove, columns, suppliers = [] }: { title: string; name: ArrayName; fields: FieldArrayWithId<FitTourForm, ArrayName>[]; register: UseFormRegister<FitTourForm>; append: () => void; remove: (index: number) => void; columns: ColumnSpec[]; suppliers?: Supplier[] }) {
  const columnHelper = createColumnHelper<FieldArrayWithId<FitTourForm, ArrayName>>();
  const tableColumns = useMemo(() => [
    ...columns.map((column) => columnHelper.display({
      id: column.key,
      header: column.label,
      cell: ({ row }) => <TableInput name={name} rowIndex={row.index} column={column} register={register} suppliers={suppliers} />,
    })),
    columnHelper.display({
      id: 'actions',
      header: '',
      cell: ({ row }) => <button type="button" className="iconButton dangerButton" onClick={() => remove(row.index)} aria-label="Xóa dòng" title="Xóa dòng"><Trash2 size={14} /></button>,
    }),
  ], [columnHelper, columns, name, register, remove, suppliers]);
  const table = useReactTable({ data: fields, columns: tableColumns, getCoreRowModel: getCoreRowModel() });

  return (
    <section className="fitTableBlock">
      <div className="sectionHeader"><h2>{title}</h2><button type="button" onClick={append}><Plus size={15} /> Thêm dòng</button></div>
      <div className="fitTableWrap">
        <table className="fitTable">
          <thead>{table.getHeaderGroups().map((headerGroup) => <tr key={headerGroup.id}>{headerGroup.headers.map((header) => <th key={header.id}>{flexRender(header.column.columnDef.header, header.getContext())}</th>)}</tr>)}</thead>
          <tbody>{table.getRowModel().rows.map((row) => <tr key={row.id}>{row.getVisibleCells().map((cell) => <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </section>
  );
}

function TableInput({ name, rowIndex, column, register, suppliers }: { name: ArrayName; rowIndex: number; column: ColumnSpec; register: UseFormRegister<FitTourForm>; suppliers: Supplier[] }) {
  const fieldName = `${name}.${rowIndex}.${column.key}` as never;
  if (column.type === 'supplier') {
    return <select {...register(fieldName)}><option value="">Chọn nhà cung cấp</option>{suppliers.map((supplier) => <option value={supplier.id} key={supplier.id}>{supplier.name}</option>)}</select>;
  }
  if (column.type === 'status') {
    return <select {...register(fieldName)}>{serviceStatuses.map((status) => <option value={status} key={status}>{serviceStatusLabels[status] || status}</option>)}</select>;
  }
  if (column.type === 'textarea') {
    return <textarea rows={2} {...register(fieldName)} />;
  }
  const numericProps = column.type === 'number' ? { min: 0, step: 'any' } : {};
  return <input type={column.type || 'text'} {...numericProps} {...register(fieldName)} />;
}

const costColumns: ColumnSpec[] = [
  { key: 'serviceType', label: 'Loại dịch vụ' },
  { key: 'description', label: 'Diễn giải' },
  { key: 'unit', label: 'Đơn vị tính' },
  { key: 'quantity', label: 'Số lượng', type: 'number' },
  { key: 'times', label: 'Số lần', type: 'number' },
  { key: 'currency', label: 'Ngoại tệ' },
  { key: 'exchangeRate', label: 'Tỷ giá', type: 'number' },
  { key: 'unitPrice', label: 'Đơn giá', type: 'number' },
  { key: 'vat', label: 'VAT %', type: 'number' },
  { key: 'amount', label: 'Thành tiền', type: 'number' },
  { key: 'notes', label: 'Ghi chú' },
];

const hotelColumns: ColumnSpec[] = [
  { key: 'serviceType', label: 'Loại dịch vụ' },
  { key: 'description', label: 'Diễn giải' },
  { key: 'unit', label: 'Đơn vị tính' },
  { key: 'paxPerRoom', label: 'Số người/phòng', type: 'number' },
  { key: 'times', label: 'Số lần', type: 'number' },
  { key: 'currency', label: 'Ngoại tệ' },
  { key: 'exchangeRate', label: 'Tỷ giá', type: 'number' },
  { key: 'unitPrice', label: 'Đơn giá', type: 'number' },
  { key: 'vat', label: 'VAT %', type: 'number' },
  { key: 'amount', label: 'Thành tiền', type: 'number' },
  { key: 'notes', label: 'Ghi chú' },
];

const budgetColumns: ColumnSpec[] = [
  { key: 'serviceType', label: 'Loại dịch vụ' },
  { key: 'supplierId', label: 'Nhà cung cấp', type: 'supplier' },
  { key: 'description', label: 'Diễn giải' },
  { key: 'quantity', label: 'Số lượng', type: 'number' },
  { key: 'unitPrice', label: 'Đơn giá', type: 'number' },
  { key: 'vat', label: 'VAT %', type: 'number' },
  { key: 'amount', label: 'Thành tiền', type: 'number' },
  { key: 'notes', label: 'Ghi chú' },
];

const operationColumns: ColumnSpec[] = [
  { key: 'serviceType', label: 'Loại dịch vụ' },
  { key: 'supplierId', label: 'Nhà cung cấp', type: 'supplier' },
  { key: 'bookingCode', label: 'Mã booking' },
  { key: 'quantity', label: 'Số lượng', type: 'number' },
  { key: 'confirmedUnitPrice', label: 'Giá xác nhận', type: 'number' },
  { key: 'vat', label: 'VAT %', type: 'number' },
  { key: 'amount', label: 'Thành tiền', type: 'number' },
  { key: 'status', label: 'Trạng thái', type: 'status' },
  { key: 'notes', label: 'Ghi chú' },
];

const guideColumns: ColumnSpec[] = [
  { key: 'name', label: 'Tên hướng dẫn viên' },
  { key: 'phone', label: 'Điện thoại' },
  { key: 'guideType', label: 'Loại hướng dẫn viên' },
  { key: 'notes', label: 'Ghi chú' },
];

const handoverColumns: ColumnSpec[] = [
  { key: 'itemName', label: 'Tài liệu bàn giao' },
  { key: 'quantity', label: 'Số lượng', type: 'number' },
  { key: 'notes', label: 'Ghi chú' },
];

const surveyColumns: ColumnSpec[] = [
  { key: 'question', label: 'Câu hỏi' },
  { key: 'notes', label: 'Ghi chú' },
];

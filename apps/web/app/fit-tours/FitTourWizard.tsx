'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { ChevronLeft, ChevronRight, Copy, FileUp, Plus, Save, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { FieldArrayWithId, useFieldArray, useForm, UseFormRegister } from 'react-hook-form';
import { z } from 'zod';
import { authHeaders, authJsonHeaders } from '../authFetch';
import { PermissionNotice, usePermissions } from '../usePermissions';

type Supplier = { id: string; name: string };
type FitTourSummary = { id: string; quoteCode: string; tourCode: string; customerName: string };

const apiBase = process.env.NEXT_PUBLIC_API_URL || '';

const workflowSteps = [
  { key: 'PRICING', label: 'Tinh gia' },
  { key: 'TOUR_INFO', label: 'Thong tin Tour' },
  { key: 'BUDGET', label: 'Du toan dich vu' },
  { key: 'OPERATION', label: 'Dieu hanh dich vu' },
  { key: 'HANDOVER', label: 'Phieu ban giao' },
  { key: 'SURVEY', label: 'Phieu danh gia' },
] as const;

const serviceStatuses = ['WAITING', 'REQUESTED', 'CONFIRMED', 'OPERATING', 'COMPLETED', 'CANCELLED'];

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
  handoverGuideRequest: z.string().default('1. Liên hệ khach truoc tour.\n2. Tạo nhom Zalo.\n3. Ho tro khach trong hanh trinh.\n4. Chup hinh tu lieu.\n5. Bao cao phat sinh.'),
  surveyDescription: z.string().default(''),
  commonCosts: z.array(costLineSchema).default([]),
  hotelCosts: z.array(costLineSchema).default([]),
  privateCosts: z.array(costLineSchema).default([]),
  budgetServices: z.array(serviceLineSchema).default([]),
  operationServices: z.array(serviceLineSchema).default([]),
  guides: z.array(z.object({ name: z.string().default(''), phone: z.string().default(''), guideType: z.string().default('Local'), notes: z.string().default('') })).default([]),
  handoverItems: z.array(z.object({ itemName: z.string().default(''), quantity: z.coerce.number().default(1), notes: z.string().default('') })).default([]),
  surveyQuestions: z.array(z.object({ question: z.string().default(''), notes: z.string().default('') })).default([]),
  attachments: z.array(z.object({ step: z.string().default(''), fileName: z.string().default(''), mimeType: z.string().default(''), size: z.coerce.number().default(0) })).default([]),
});

type FitTourForm = z.infer<typeof fitTourSchema>;
type ArrayName = 'commonCosts' | 'hotelCosts' | 'privateCosts' | 'budgetServices' | 'operationServices' | 'guides' | 'handoverItems' | 'surveyQuestions' | 'attachments';
type ColumnSpec = { key: string; label: string; type?: 'text' | 'number' | 'supplier' | 'status' | 'textarea' };

const emptyCost = { serviceType: '', description: '', unit: '', quantity: 1, paxPerRoom: 1, times: 1, currency: 'VND', exchangeRate: 1, unitPrice: 0, vat: 0, amount: 0, notes: '' };
const emptyService = { serviceType: '', supplierId: '', description: '', bookingCode: '', quantity: 1, unitPrice: 0, confirmedUnitPrice: 0, vat: 0, amount: 0, status: 'WAITING', notes: '' };

function number(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: number) {
  return new Intl.NumberFormat('vi-VN').format(Math.round(value));
}

function lineAmount(line: Record<string, unknown>, confirmed = false) {
  const quantity = number(line.quantity || 1);
  const times = number(line.times || 1);
  const exchangeRate = number(line.exchangeRate || 1);
  const unitPrice = confirmed ? number(line.confirmedUnitPrice) : number(line.unitPrice);
  const vat = number(line.vat);
  return quantity * times * exchangeRate * unitPrice * (1 + vat / 100);
}

function normalizeDate(value: unknown) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

function toFormDefaults(tour?: Partial<FitTourForm>): FitTourForm {
  const today = new Date().toISOString().slice(0, 10);
  const defaults: FitTourForm = {
    quoteCode: `FIT-Q-${today.replaceAll('-', '')}`,
    tourCode: `FIT-${today.replaceAll('-', '')}`,
    tourName: '',
    marketGroup: 'Noi dia',
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
    handoverGuideRequest: '1. Liên hệ khach truoc tour.\n2. Tạo nhom Zalo.\n3. Ho tro khach trong hanh trinh.\n4. Chup hinh tu lieu.\n5. Bao cao phat sinh.',
    surveyDescription: '',
    commonCosts: [{ ...emptyCost, serviceType: 'Xe', unit: 'goi' }],
    hotelCosts: [{ ...emptyCost, serviceType: 'Khach san', unit: 'phong', paxPerRoom: 2 }],
    privateCosts: [{ ...emptyCost, serviceType: 'Ve tham quan', unit: 'khach' }],
    budgetServices: [{ ...emptyService, serviceType: 'Hotel' }],
    operationServices: [],
    guides: [{ name: '', phone: '', guideType: 'Local', notes: '' }],
    handoverItems: [
      { itemName: 'Rooming list', quantity: 1, notes: '' },
      { itemName: 'Ve may bay', quantity: 1, notes: '' },
      { itemName: 'Bao hiem du lich', quantity: 1, notes: '' },
      { itemName: 'Chuong trinh tour', quantity: 1, notes: '' },
      { itemName: 'Final confirmation', quantity: 1, notes: '' },
    ],
    surveyQuestions: [
      { question: 'Chat luong chuong trinh tour', notes: '' },
      { question: 'Phương tiện van chủyen', notes: '' },
      { question: 'Chat luong do an', notes: '' },
      { question: 'Thai do nhan vien tu van', notes: '' },
      { question: 'Chat luong khach san', notes: '' },
      { question: 'Hướng dẫn viên', notes: '' },
      { question: 'Cong tac to chuc', notes: '' },
      { question: 'Muc do hai long chung', notes: '' },
    ],
    attachments: [],
  };

  return {
    ...defaults,
    ...tour,
    bookingDate: normalizeDate(tour?.bookingDate) || today,
    startDate: normalizeDate(tour?.startDate),
    endDate: normalizeDate(tour?.endDate),
    visaDeadline: normalizeDate(tour?.visaDeadline),
    holdUntil: normalizeDate(tour?.holdUntil),
    confirmedAt: normalizeDate(tour?.confirmedAt),
    closeAt: normalizeDate(tour?.closeAt),
  };
}

export default function FitTourWizard({ suppliers, tours }: { suppliers: Supplier[]; tours: FitTourSummary[] }) {
  const { can, canAny } = usePermissions();
  const [activeStep, setActiveStep] = useState(0);
  const [saveState, setSaveState] = useState('Chưa luu');
  const [selectedTourId, setSelectedTourId] = useState('');
  const form = useForm<FitTourForm>({
    resolver: zodResolver(fitTourSchema) as never,
    defaultValues: toFormDefaults(),
    mode: 'onChange',
  });
  const { register, control, handleSubmit, watch, setValue, getValues, reset, formState } = form;

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

  const values = watch();
  const totalPax = Math.max(1, number(values.adultCount) + number(values.childCount) + number(values.infantCount));
  const totalCommonCost = [...values.commonCosts, ...values.hotelCosts].reduce((sum, row) => sum + lineAmount(row), 0);
  const totalPrivateCost = values.privateCosts.reduce((sum, row) => sum + lineAmount(row), 0);
  const netPerGuest = totalCommonCost / totalPax + totalPrivateCost;
  const profitPerGuest = number(values.sellingPrice) - netPerGuest;
  const priceWithCommission = number(values.sellingPrice) + number(values.commissionPerGuest);
  const budgetRevenue = totalPax * number(values.sellingPrice);
  const budgetCost = values.budgetServices.reduce((sum, row) => sum + lineAmount(row), 0);
  const operationCost = values.operationServices.reduce((sum, row) => sum + lineAmount(row, true), 0);
  const budgetProfit = budgetRevenue - budgetCost;

  useEffect(() => {
    const subscription = watch((_value, { name }) => {
      if (!name || name.endsWith('amount')) return;
      const tableName = name.split('.')[0] as ArrayName;
      if (!['commonCosts', 'hotelCosts', 'privateCosts', 'budgetServices', 'operationServices'].includes(tableName)) return;
      const index = Number(name.split('.')[1]);
      if (!Number.isInteger(index)) return;
      const row = getValues(`${tableName}.${index}` as never) as Record<string, unknown>;
      const amount = lineAmount(row, tableName === 'operationServices');
      setValue(`${tableName}.${index}.amount` as never, amount as never, { shouldDirty: true });
    });
    return () => subscription.unsubscribe();
  }, [getValues, setValue, watch]);

  useEffect(() => {
    const timeout = setTimeout(async () => {
      const current = getValues();
      if (!formState.isDirty || current.quoteCode.length < 2 || current.tourCode.length < 2 || current.customerName.length < 2) return;
      setSaveState('Đang autosave...');
      try {
        const saved = await saveTour(current);
        if (!current.id && saved.id) setValue('id', saved.id, { shouldDirty: false });
        setSaveState(`Đã autosave ${new Date().toLocaleTimeString('vi-VN')}`);
      } catch {
        setSaveState('Autosave loi');
      }
    }, 1200);
    return () => clearTimeout(timeout);
  }, [values, formState.isDirty, getValues, setValue]);

  async function saveTour(data: FitTourForm) {
    if (!can('tour.manage')) throw new Error('Missing permission');
    const url = data.id ? `${apiBase}/api/fit-tours/${data.id}` : `${apiBase}/api/fit-tours`;
    const response = await fetch(url, {
      method: data.id ? 'PUT' : 'POST',
      headers: authJsonHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  }

  async function submit(data: FitTourForm) {
    setSaveState('Đang luu...');
    const saved = await saveTour({ ...data, workflowStatus: workflowSteps[activeStep].key });
    reset(toFormDefaults(saved), { keepDirty: false });
    setSaveState('Đã lưu');
  }

  async function loadTour(id: string) {
    setSelectedTourId(id);
    if (!id) {
      reset(toFormDefaults());
      return;
    }
    const response = await fetch(`${apiBase}/api/fit-tours/${id}`, { headers: authHeaders() });
    if (response.ok) reset(toFormDefaults(await response.json()));
  }

  async function copyBudget() {
    const id = getValues('id');
    if (!id) return;
    const response = await fetch(`${apiBase}/api/fit-tours/${id}/copy-budget`, {
      method: 'POST',
      headers: authJsonHeaders(),
      body: JSON.stringify({ sourceTourId: selectedTourId || undefined }),
    });
    if (response.ok) reset(toFormDefaults(await response.json()));
  }

  async function copyOperation() {
    const id = getValues('id');
    if (!id) return;
    const response = await fetch(`${apiBase}/api/fit-tours/${id}/copy-operation`, {
      method: 'POST',
      headers: authJsonHeaders(),
      body: JSON.stringify({ sourceTourId: selectedTourId || undefined }),
    });
    if (response.ok) reset(toFormDefaults(await response.json()));
  }

  function addFiles(files: FileList | null) {
    if (!files) return;
    Array.from(files).forEach((file) => arrays.attachments.append({ step: workflowSteps[activeStep].key, fileName: file.name, mimeType: file.type, size: file.size }));
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="fitWizard">
      <PermissionNotice allowed={canAny(['tour.view', 'tour.manage'])} label="xem va quan ly FIT tour" />
      <section className="fitToolbar">
        <div className="fitSteps">
          {workflowSteps.map((step, index) => (
            <button type="button" key={step.key} className={activeStep === index ? 'active' : ''} onClick={() => setActiveStep(index)}>
              <span>{index + 1}</span>{step.label}
            </button>
          ))}
        </div>
        <div className="fitActions">
          <select value={selectedTourId} onChange={(event) => loadTour(event.target.value)} aria-label="Chọn FIT tour">
            <option value="">Tour FIT moi</option>
            {tours.map((tour) => <option key={tour.id} value={tour.id}>{tour.quoteCode} - {tour.customerName}</option>)}
          </select>
          <span>{saveState}</span>
          <button type="submit" disabled={!can('tour.manage')}><Save size={15} /> Lưu</button>
        </div>
      </section>

      {activeStep === 0 ? (
        <section className="fitStep">
          <SummaryCards items={[
            ['Tong phi chung', money(totalCommonCost)],
            ['Tong phi rieng', money(totalPrivateCost)],
            ['Gia NET / khach', money(netPerGuest)],
            ['Lợi nhuận / khach', money(profitPerGuest)],
            ['Hoa hong / khach', money(number(values.commissionPerGuest))],
            ['Gia co hoa hồng', money(priceWithCommission)],
          ]} />
          <div className="fitFormGrid">
            <Field label="Ma báo giá" name="quoteCode" register={register} required />
            <Field label="Ma tour" name="tourCode" register={register} required />
            <Field label="Nhom thi truong" name="marketGroup" register={register} as="select" options={['Noi dia', 'Inbound', 'Outbound', 'Corporate']} />
            <Field label="Ngày đặt" name="bookingDate" register={register} type="date" />
            <Field label="Khoi di" name="startDate" register={register} type="date" />
            <Field label="Ngay ve" name="endDate" register={register} type="date" />
            <Field label="Họ tên khach" name="customerName" register={register} required />
            <Field label="Điện thoại" name="phone" register={register} />
            <Field label="Email" name="email" register={register} type="email" />
            <Field label="Người lớn" name="adultCount" register={register} type="number" />
            <Field label="Trẻ em" name="childCount" register={register} type="number" />
            <Field label="Em be" name="infantCount" register={register} type="number" />
            <Field label="Gia ban / khach" name="sellingPrice" register={register} type="number" />
            <Field label="Hoa hong / khach" name="commissionPerGuest" register={register} type="number" />
            <label className="span2">Ghi chú<textarea {...register('notes')} rows={4} /></label>
            <label className="fileDrop"><FileUp size={16} /> File dinh kem<input type="file" multiple onChange={(event) => addFiles(event.target.files)} /></label>
          </div>
          <EditableTable title="Chi phi chung" name="commonCosts" fields={arrays.commonCosts.fields} register={register} append={() => arrays.commonCosts.append(emptyCost)} remove={arrays.commonCosts.remove} columns={costColumns} />
          <EditableTable title="Chi phi khach san" name="hotelCosts" fields={arrays.hotelCosts.fields} register={register} append={() => arrays.hotelCosts.append(emptyCost)} remove={arrays.hotelCosts.remove} columns={hotelColumns} />
          <EditableTable title="Chi phi rieng khach" name="privateCosts" fields={arrays.privateCosts.fields} register={register} append={() => arrays.privateCosts.append(emptyCost)} remove={arrays.privateCosts.remove} columns={costColumns} />
        </section>
      ) : null}

      {activeStep === 1 ? (
        <section className="fitStep">
          <div className="fitFormGrid">
            <Field label="Ma tour" name="tourCode" register={register} required />
            <Field label="Ten tour" name="tourName" register={register} />
            <Field label="Hanh trinh bay" name="flightRoute" register={register} />
            <Field label="Nhom thi truong" name="marketGroup" register={register} as="select" options={['Noi dia', 'Inbound', 'Outbound', 'Corporate']} />
            <Field label="Khoi hanh" name="startDate" register={register} type="date" />
            <Field label="Ngay ve" name="endDate" register={register} type="date" />
            <Field label="Loai hinh" name="tourType" register={register} as="select" options={['FIT', 'Free & Easy', 'Private Tour', 'Combo']} />
            <Field label="Ty gia" name="exchangeRateCode" register={register} as="select" options={['VND', 'USD', 'EUR', 'THB']} />
            <Field label="Nhan vien dieu hanh" name="operatorOwner" register={register} />
            <Field label="So cho nhan" name="seatCount" register={register} type="number" />
            <Field label="Gia tour" name="tourPrice" register={register} type="number" />
            <Field label="Giam gia" name="discount" register={register} type="number" />
            <Field label="Gia nguoi lon" name="adultPrice" register={register} type="number" />
            <Field label="Gia tre em 2-5" name="childPrice25" register={register} type="number" />
            <Field label="Gia tre em 6-11" name="childPrice611" register={register} type="number" />
            <Field label="Gia em be" name="infantPrice" register={register} type="number" />
            <Field label="Phu thu tren tour" name="surcharge" register={register} type="number" />
            <Field label="Phương tiện" name="transportMode" register={register} />
            <Field label="Hanh trinh di" name="outboundRoute" register={register} />
            <Field label="Hang di" name="outboundCarrier" register={register} />
            <Field label="Hanh trinh ve" name="returnRoute" register={register} />
            <Field label="Hang ve" name="returnCarrier" register={register} />
            <Field label="Điểm đón" name="pickupPoint" register={register} />
            <Field label="Điểm trả" name="dropoffPoint" register={register} />
            <Field label="Han xin visa" name="visaDeadline" register={register} type="date" />
            <Field label="Thoi gian giu cho" name="holdUntil" register={register} type="date" />
            <Field label="Thoi gian nhan cho" name="confirmedAt" register={register} type="date" />
            <Field label="Thoi gian dong cho" name="closeAt" register={register} type="date" />
            <label className="checkLine"><input type="checkbox" {...register('allowOverbooking')} /> Cho ban qua so ghe</label>
          </div>
          <EditableTable title="Guide" name="guides" fields={arrays.guides.fields} register={register} append={() => arrays.guides.append({ name: '', phone: '', guideType: 'Local', notes: '' })} remove={arrays.guides.remove} columns={guideColumns} />
        </section>
      ) : null}

      {activeStep === 2 ? (
        <section className="fitStep">
          <SummaryCards items={[
            ['Tổng thu du kien', money(budgetRevenue)],
            ['Tổng chi du kien', money(budgetCost)],
            ['Lợi nhuận du kien', money(budgetProfit)],
            ['Ty suat loi nhuan', `${budgetRevenue ? Math.round((budgetProfit / budgetRevenue) * 1000) / 10 : 0}%`],
          ]} />
          <div className="copyBar"><button type="button" onClick={copyBudget}><Copy size={15} /> Copy du toan</button></div>
          <EditableTable title="Du toan dich vu" name="budgetServices" fields={arrays.budgetServices.fields} register={register} append={() => arrays.budgetServices.append(emptyService)} remove={arrays.budgetServices.remove} columns={budgetColumns} suppliers={suppliers} />
        </section>
      ) : null}

      {activeStep === 3 ? (
        <section className="fitStep">
          <SummaryCards items={[
            ['Tổng chi', money(operationCost)],
            ['Lợi nhuận du kien', money(budgetProfit)],
            ['Lợi nhuận thuc te', money(budgetRevenue - operationCost)],
          ]} />
          <div className="copyBar"><button type="button" onClick={copyOperation}><Copy size={15} /> Copy dieu hanh tu du toan</button></div>
          <EditableTable title="Dieu hanh dich vu" name="operationServices" fields={arrays.operationServices.fields} register={register} append={() => arrays.operationServices.append(emptyService)} remove={arrays.operationServices.remove} columns={operationColumns} suppliers={suppliers} />
        </section>
      ) : null}

      {activeStep === 4 ? (
        <section className="fitStep">
          <SummaryCards items={[['Tour', values.tourName || values.tourCode], ['So khach', String(totalPax)], ['Ngay khoi hanh', values.startDate || '-'], ['Điểm đón', values.pickupPoint || '-'], ['Ngay ve', values.endDate || '-'], ['Local guide', values.guides[0]?.name || '-']]} />
          <label>Yeu cau huong dan vien<textarea {...register('handoverGuideRequest')} rows={8} /></label>
          <EditableTable title="Vat dung va qua tang" name="handoverItems" fields={arrays.handoverItems.fields} register={register} append={() => arrays.handoverItems.append({ itemName: '', quantity: 1, notes: '' })} remove={arrays.handoverItems.remove} columns={handoverColumns} />
        </section>
      ) : null}

      {activeStep === 5 ? (
        <section className="fitStep">
          <SummaryCards items={[['Tour', values.tourName || values.tourCode], ['So khach', String(totalPax)], ['Ngay khoi hanh', values.startDate || '-'], ['Điểm đón', values.pickupPoint || '-'], ['Ngay ve', values.endDate || '-'], ['Local guide', values.guides[0]?.name || '-']]} />
          <label>Mo ta chung<textarea {...register('surveyDescription')} rows={5} /></label>
          <EditableTable title="Cau hoi khao sat" name="surveyQuestions" fields={arrays.surveyQuestions.fields} register={register} append={() => arrays.surveyQuestions.append({ question: '', notes: '' })} remove={arrays.surveyQuestions.remove} columns={surveyColumns} />
        </section>
      ) : null}

      <section className="wizardFooter">
        <button type="button" className="secondaryButton" disabled={activeStep === 0} onClick={() => setActiveStep((step) => Math.max(0, step - 1))}><ChevronLeft size={15} /> Truoc</button>
        <button type="button" className="secondaryButton" disabled={activeStep === workflowSteps.length - 1} onClick={() => setActiveStep((step) => Math.min(workflowSteps.length - 1, step + 1))}>Tiep <ChevronRight size={15} /></button>
      </section>
    </form>
  );
}

function SummaryCards({ items }: { items: [string, string][] }) {
  return <div className="fitSummary">{items.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>;
}

function Field({ label, name, register, type = 'text', required, as, options = [] }: { label: string; name: keyof FitTourForm; register: UseFormRegister<FitTourForm>; type?: string; required?: boolean; as?: 'select'; options?: string[] }) {
  return (
    <label>{label}
      {as === 'select' ? (
        <select {...register(name)} required={required}>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select>
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
      cell: ({ row }) => <button type="button" className="iconButton dangerButton" onClick={() => remove(row.index)} aria-label="Xóa dòng"><Trash2 size={14} /></button>,
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
    return <select {...register(fieldName)}><option value="">Chọn NCC</option>{suppliers.map((supplier) => <option value={supplier.id} key={supplier.id}>{supplier.name}</option>)}</select>;
  }
  if (column.type === 'status') {
    return <select {...register(fieldName)}>{serviceStatuses.map((status) => <option value={status} key={status}>{status}</option>)}</select>;
  }
  if (column.type === 'textarea') {
    return <textarea rows={2} {...register(fieldName)} />;
  }
  return <input type={column.type || 'text'} {...register(fieldName)} />;
}

const costColumns: ColumnSpec[] = [
  { key: 'serviceType', label: 'Loai dich vu' },
  { key: 'description', label: 'Dien giai' },
  { key: 'unit', label: 'Don vi tinh' },
  { key: 'quantity', label: 'Số lượng', type: 'number' },
  { key: 'times', label: 'So lan', type: 'number' },
  { key: 'currency', label: 'Ngoai te' },
  { key: 'exchangeRate', label: 'Ty gia', type: 'number' },
  { key: 'unitPrice', label: 'Don gia', type: 'number' },
  { key: 'vat', label: 'VAT %', type: 'number' },
  { key: 'amount', label: 'Thanh tien', type: 'number' },
  { key: 'notes', label: 'Ghi chú' },
];

const hotelColumns: ColumnSpec[] = [
  { key: 'serviceType', label: 'Loai dich vu' },
  { key: 'description', label: 'Dien giai' },
  { key: 'unit', label: 'Don vi tinh' },
  { key: 'paxPerRoom', label: 'So nguoi/phong', type: 'number' },
  { key: 'times', label: 'So lan', type: 'number' },
  { key: 'currency', label: 'Ngoai te' },
  { key: 'exchangeRate', label: 'Ty gia', type: 'number' },
  { key: 'unitPrice', label: 'Don gia', type: 'number' },
  { key: 'vat', label: 'VAT %', type: 'number' },
  { key: 'amount', label: 'Thanh tien', type: 'number' },
  { key: 'notes', label: 'Ghi chú' },
];

const budgetColumns: ColumnSpec[] = [
  { key: 'serviceType', label: 'Loai dich vu' },
  { key: 'supplierId', label: 'Nhà cung cấp', type: 'supplier' },
  { key: 'description', label: 'Dien giai' },
  { key: 'quantity', label: 'Số lượng', type: 'number' },
  { key: 'unitPrice', label: 'Don gia', type: 'number' },
  { key: 'vat', label: 'VAT %', type: 'number' },
  { key: 'amount', label: 'Thanh tien', type: 'number' },
  { key: 'notes', label: 'Ghi chú' },
];

const operationColumns: ColumnSpec[] = [
  { key: 'serviceType', label: 'Loai dich vu' },
  { key: 'supplierId', label: 'Nhà cung cấp', type: 'supplier' },
  { key: 'bookingCode', label: 'Booking code' },
  { key: 'quantity', label: 'Số lượng', type: 'number' },
  { key: 'confirmedUnitPrice', label: 'Gia xác nhận', type: 'number' },
  { key: 'vat', label: 'VAT %', type: 'number' },
  { key: 'amount', label: 'Thanh tien', type: 'number' },
  { key: 'status', label: 'Trạng thái', type: 'status' },
  { key: 'notes', label: 'Ghi chú' },
];

const guideColumns: ColumnSpec[] = [
  { key: 'name', label: 'Ten' },
  { key: 'phone', label: 'Điện thoại' },
  { key: 'guideType', label: 'Loai guide' },
  { key: 'notes', label: 'Ghi chú' },
];

const handoverColumns: ColumnSpec[] = [
  { key: 'itemName', label: 'Tai lieu ban giao' },
  { key: 'quantity', label: 'Số lượng', type: 'number' },
  { key: 'notes', label: 'Ghi chú' },
];

const surveyColumns: ColumnSpec[] = [
  { key: 'question', label: 'Cau hoi' },
  { key: 'notes', label: 'Ghi chú' },
];

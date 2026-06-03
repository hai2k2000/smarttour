'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { Copy, Lock, LockOpen, Pencil, Plus, Save, Search, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { FieldArrayWithId, useFieldArray, useForm, UseFieldArrayReturn, UseFormRegister, useWatch } from 'react-hook-form';
import { z } from 'zod';

export type OrderRouteType = 'fit-tours' | 'git-combos' | 'landtours' | 'hotel-bookings' | 'single-services' | 'flight-orders';
type OrderConfig = { title: string; shortTitle: string; steps: string[]; nameLabel: string; codeLabel: string };

export const orderConfigs: Record<OrderRouteType, OrderConfig> = {
  'fit-tours': { title: 'Tạo Tour khách lẻ FIT', shortTitle: 'Tour FIT', nameLabel: 'Tên tour', codeLabel: 'Mã tour', steps: ['Tính giá', 'Thông tin Tour', 'Dự toán dịch vụ', 'Điều hành dịch vụ', 'Phiếu bàn giao', 'Phiếu đánh giá dịch vụ'] },
  'git-combos': { title: 'Tạo Tour GIT/Combo', shortTitle: 'GIT/Combo', nameLabel: 'Lịch trình', codeLabel: 'Mã tour', steps: ['Tính giá', 'Thông tin Tour', 'Dự toán dịch vụ', 'Điều hành dịch vụ', 'Danh sách thành viên', 'Phiếu bàn giao', 'Phiếu đánh giá dịch vụ'] },
  landtours: { title: 'Tạo LandTour/Combo', shortTitle: 'LandTour', nameLabel: 'Lịch trình', codeLabel: 'Mã tour', steps: ['Tính giá', 'Thông tin Tour', 'Dự toán dịch vụ', 'Điều hành dịch vụ', 'Phiếu bàn giao', 'Phiếu đánh giá dịch vụ'] },
  'hotel-bookings': { title: 'Booking phòng / Khách sạn', shortTitle: 'Booking phòng', nameLabel: 'Tên tour / dịch vụ', codeLabel: 'Mã booking', steps: ['Thông tin booking', 'Dịch vụ & giá', 'Danh sách thành viên', 'Điều khoản', 'Đánh giá dịch vụ'] },
  'single-services': { title: 'Đơn dịch vụ lẻ', shortTitle: 'Dịch vụ lẻ', nameLabel: 'Tên dịch vụ', codeLabel: 'Mã đơn', steps: ['Thông tin dịch vụ', 'Dịch vụ & giá', 'Danh sách thành viên', 'Điều khoản', 'Đánh giá'] },
  'flight-orders': { title: 'Booking vé máy bay', shortTitle: 'Vé máy bay', nameLabel: 'Tên booking / PNR', codeLabel: 'Mã vé', steps: ['Thông tin vé', 'Chặng bay', 'Hành khách', 'Điều khoản', 'Đánh giá'] },
};

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

const salesSchema = z.object({ serviceType: z.string().default(''), supplierId: z.string().default(''), serviceId: z.string().default(''), description: z.string().default(''), quantity: z.coerce.number().default(1), serviceCount: z.coerce.number().default(1), unitPrice: z.coerce.number().default(0), vat: z.coerce.number().default(0), note: z.string().default('') });
const operationSchema = z.object({ serviceType: z.string().default(''), supplierId: z.string().default(''), serviceId: z.string().default(''), bookingCode: z.string().default(''), serviceDate: z.string().default(''), quantity: z.coerce.number().default(1), netPrice: z.coerce.number().default(0), vat: z.coerce.number().default(0), status: z.string().default('WAITING'), note: z.string().default('') });
const memberSchema = z.object({ fullName: z.string().default(''), gender: z.string().default(''), birthday: z.string().default(''), phone: z.string().default(''), email: z.string().default(''), identityNumber: z.string().default(''), issuedDate: z.string().default(''), nationality: z.string().default(''), passengerType: z.string().default('ADULT'), note: z.string().default('') });
const itinerarySchema = z.object({ dayNo: z.coerce.number().default(1), title: z.string().default(''), content: z.string().default(''), period: z.string().default(''), destination: z.string().default(''), meals: z.string().default(''), hotel: z.string().default(''), restaurant: z.string().default(''), services: z.string().default(''), note: z.string().default('') });
const smallRowSchema = z.object({ itemName: z.string().default(''), quantity: z.coerce.number().default(1), note: z.string().default('') });
const surveySchema = z.object({ question: z.string().default(''), note: z.string().default('') });
const termSchema = z.object({ language: z.string().default('VN'), terms: z.string().default(''), notes: z.string().default('') });

const orderSchema = z.object({
  systemCode: z.string().min(2),
  tourCode: z.string().default(''),
  holdCode: z.string().default(''),
  name: z.string().min(2),
  route: z.string().default(''),
  marketGroup: z.string().default('Khac'),
  bookingDate: z.string().default(''),
  paymentDate: z.string().default(''),
  startDate: z.string().default(''),
  endDate: z.string().default(''),
  status: z.string().default('UPCOMING'),
  tourCategory: z.string().default('Khac'),
  currency: z.string().default('VND'),
  exchangeRate: z.coerce.number().default(1),
  createdBy: z.string().default('Operator'),
  createdDate: z.string().default(''),
  branch: z.string().default(''),
  customerName: z.string().default(''),
  customerType: z.string().default('Ca nhan'),
  customerPhone: z.string().default(''),
  customerEmail: z.string().email().or(z.literal('')).default(''),
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
  handoverRequest: z.string().default('1. Goi lam quen khach va tao nhom Zalo.\n2. Cap nhat dieu hanh trong nhom.\n3. Ho tro khach trong hanh trinh.\n4. Bao cao phat sinh.'),
  surveyDescription: z.string().default(''),
  guides: z.array(z.object({ guideName: z.string().default(''), phone: z.string().default(''), language: z.string().default(''), note: z.string().default('') })).default([]),
  salesItems: z.array(salesSchema).default([]),
  operationItems: z.array(operationSchema).default([]),
  members: z.array(memberSchema).default([]),
  itineraries: z.array(itinerarySchema).default([]),
  handoverItems: z.array(smallRowSchema).default([]),
  surveyQuestions: z.array(surveySchema).default([]),
  terms: z.array(termSchema).default([]),
});

type OrderForm = z.infer<typeof orderSchema>;
type ArrayName = 'salesItems' | 'operationItems' | 'members' | 'itineraries' | 'handoverItems' | 'surveyQuestions' | 'terms' | 'guides';
const emptySales = { serviceType: '', supplierId: '', serviceId: '', description: '', quantity: 1, serviceCount: 1, unitPrice: 0, vat: 0, note: '' };
const emptyOperation = { serviceType: '', supplierId: '', serviceId: '', bookingCode: '', serviceDate: '', quantity: 1, netPrice: 0, vat: 0, status: 'WAITING', note: '' };
const emptyMember = { fullName: '', gender: '', birthday: '', phone: '', email: '', identityNumber: '', issuedDate: '', nationality: '', passengerType: 'ADULT', note: '' };
const defaultValues: OrderForm = {
  systemCode: `DH${Date.now().toString().slice(-6)}`, tourCode: '', holdCode: '', name: '', route: '', marketGroup: 'Khac', bookingDate: '', paymentDate: '', startDate: '', endDate: '', status: 'UPCOMING', tourCategory: 'Khac', currency: 'VND', exchangeRate: 1, createdBy: 'Operator', createdDate: '', branch: '', customerName: '', customerType: 'Ca nhan', customerPhone: '', customerEmail: '', customerAddress: '', agencyName: '', collaborator: '', operatorOwner: '', adultQty: 0, childQty: 0, infantQty: 0, quantity: 1, roomClass: '', servicePackage: '', transportType: '', pickupPoint: '', dropoffPoint: '', seatTotal: 0, seatHeld: 0, seatSold: 0, allowOverbooking: false, receiveDeadline: '', closeDeadline: '', paidAmount: 0, paidCost: 0, commission: 0, note: '', handoverRequest: '1. Goi lam quen khach va tao nhom Zalo.\n2. Cap nhat dieu hanh trong nhom.\n3. Ho tro khach trong hanh trinh.\n4. Bao cao phat sinh.', surveyDescription: '', guides: [{ guideName: '', phone: '', language: '', note: '' }], salesItems: [{ ...emptySales }], operationItems: [{ ...emptyOperation }], members: [{ ...emptyMember }], itineraries: [{ dayNo: 1, title: '', content: '', period: '', destination: '', meals: '', hotel: '', restaurant: '', services: '', note: '' }], handoverItems: [{ itemName: 'Rooming list', quantity: 1, note: '' }, { itemName: 'Chuong trinh tour', quantity: 1, note: '' }], surveyQuestions: [{ question: 'Chat luong dich vu', note: '' }, { question: 'Muc do hai long chung', note: '' }], terms: [{ language: 'VN', terms: '', notes: '' }],
};

function browserApiBase() {
  const apiBase = process.env.NEXT_PUBLIC_API_URL || '';
  if (typeof window === 'undefined') return apiBase;
  if (apiBase.includes('smarttour-api-1')) return `http://${window.location.hostname}:4000`;
  return apiBase;
}
function money(value: unknown) { return Number(value || 0).toLocaleString('vi-VN'); }
function lineRevenue(i: any) { return Number(i.quantity || 0) * Number(i.serviceCount || 0) * Number(i.unitPrice || 0) * (1 + Number(i.vat || 0) / 100); }
function lineCost(i: any) { return Number(i.quantity || 0) * Number(i.netPrice || 0) * (1 + Number(i.vat || 0) / 100); }
function dateOnly(value?: string | null) { return value ? value.slice(0, 10) : ''; }

export default function OrdersClient({ type, config, initialOrders }: { type: OrderRouteType; config: OrderConfig; initialOrders: OrderSummary[] }) {
  const [orders, setOrders] = useState(initialOrders);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState(0);
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const { register, control, handleSubmit, reset, formState: { isSubmitting } } = useForm<OrderForm>({ resolver: zodResolver(orderSchema) as any, defaultValues });
  const values = useWatch({ control });
  const arrays = {
    guides: useFieldArray({ control, name: 'guides' }),
    salesItems: useFieldArray({ control, name: 'salesItems' }),
    operationItems: useFieldArray({ control, name: 'operationItems' }),
    members: useFieldArray({ control, name: 'members' }),
    itineraries: useFieldArray({ control, name: 'itineraries' }),
    handoverItems: useFieldArray({ control, name: 'handoverItems' }),
    surveyQuestions: useFieldArray({ control, name: 'surveyQuestions' }),
    terms: useFieldArray({ control, name: 'terms' }),
  };
  const totals = useMemo(() => {
    const revenue = (values.salesItems || []).reduce((sum, item) => sum + lineRevenue(item), 0);
    const cost = (values.operationItems || []).reduce((sum, item) => sum + lineCost(item), 0);
    return { revenue, cost, profit: revenue - cost, remainRevenue: Math.max(0, revenue - Number(values.paidAmount || 0)), remainCost: Math.max(0, cost - Number(values.paidCost || 0)), seatsLeft: Number(values.seatTotal || 0) - Number(values.seatSold || 0) };
  }, [values]);
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return orders;
    return orders.filter((item) => [item.systemCode, item.tourCode, item.name, item.customerName, item.customerPhone].filter(Boolean).some((value) => String(value).toLowerCase().includes(term)));
  }, [orders, query]);
  const table = useReactTable({
    data: filtered,
    columns: useMemo(() => {
      const helper = createColumnHelper<OrderSummary>();
      return [
        helper.display({ id: 'code', header: 'Ma don', cell: ({ row }) => <div><strong>{row.original.systemCode}</strong><br /><span className="mutedText">{row.original.tourCode || '-'}</span></div> }),
        helper.accessor('name', { header: config.nameLabel }),
        helper.display({ id: 'dates', header: 'Lich', cell: ({ row }) => <span>Di: {dateOnly(row.original.startDate) || '-'}<br />Ve: {dateOnly(row.original.endDate) || '-'}</span> }),
        helper.display({ id: 'customer', header: 'Khach hang', cell: ({ row }) => <span>{row.original.customerName || '-'}<br />{row.original.customerPhone || '-'}</span> }),
        helper.display({ id: 'revenue', header: 'Phan thu', cell: ({ row }) => <span>Tong: {money(row.original.totalRevenue)}<br />Con: {money(row.original.remainingRevenue)}</span> }),
        helper.display({ id: 'cost', header: 'Phan chi', cell: ({ row }) => <span>Tong: {money(row.original.totalCost)}<br />Con: {money(row.original.remainingCost)}</span> }),
        helper.accessor('profit', { header: 'Loi nhuan', cell: (info) => money(info.getValue()) }),
        helper.accessor('status', { header: 'Trang thai', cell: (info) => <span className="statusPill">{info.getValue()}</span> }),
        helper.display({ id: 'actions', header: '', cell: ({ row }) => <button type="button" className="secondaryButton iconTextButton" onClick={() => loadOrder(row.original.id)}><Pencil size={15} /> Sua</button> }),
      ];
    }, [config.nameLabel]),
    getCoreRowModel: getCoreRowModel(),
  });
  async function reload() { const r = await fetch(`${browserApiBase()}/api/orders/${type}`, { cache: 'no-store' }); if (r.ok) setOrders(await r.json()); }
  async function loadOrder(id: string) {
    const r = await fetch(`${browserApiBase()}/api/orders/${type}/${id}`);
    if (!r.ok) return;
    const o = await r.json();
    setEditingId(id);
    setActiveStep(0);
    setFormOpen(true);
    reset({ ...defaultValues, ...o, bookingDate: dateOnly(o.bookingDate), paymentDate: dateOnly(o.paymentDate), startDate: dateOnly(o.startDate), endDate: dateOnly(o.endDate), createdDate: dateOnly(o.createdDate), receiveDeadline: o.receiveDeadline?.slice(0, 16) || '', closeDeadline: o.closeDeadline?.slice(0, 16) || '', salesItems: o.salesItems?.length ? o.salesItems.map((i: any) => ({ ...i, quantity: Number(i.quantity), serviceCount: Number(i.serviceCount), unitPrice: Number(i.unitPrice), vat: Number(i.vat) })) : [{ ...emptySales }], operationItems: o.operationItems?.length ? o.operationItems.map((i: any) => ({ ...i, serviceDate: dateOnly(i.serviceDate), quantity: Number(i.quantity), netPrice: Number(i.netPrice), vat: Number(i.vat) })) : [{ ...emptyOperation }], members: o.members?.length ? o.members.map((i: any) => ({ ...i, birthday: dateOnly(i.birthday), issuedDate: dateOnly(i.issuedDate) })) : [{ ...emptyMember }], itineraries: o.itineraries?.length ? o.itineraries : defaultValues.itineraries, guides: o.guides?.length ? o.guides : defaultValues.guides, handoverItems: o.handoverItems?.length ? o.handoverItems : defaultValues.handoverItems, surveyQuestions: o.surveyQuestions?.length ? o.surveyQuestions : defaultValues.surveyQuestions, terms: o.terms?.length ? o.terms : defaultValues.terms, paidAmount: Number(o.paidAmount || 0), paidCost: Number(o.paidCost || 0), commission: Number(o.commission || 0) });
  }
  async function onSubmit(data: OrderForm) {
    const payload = { ...data, guides: data.guides.filter((i) => i.guideName), salesItems: data.salesItems.filter((i) => i.description || i.serviceType || i.unitPrice > 0), operationItems: data.operationItems.filter((i) => i.serviceType || i.bookingCode || i.netPrice > 0), members: data.members.filter((i) => i.fullName), itineraries: data.itineraries.filter((i) => i.title || i.content), handoverItems: data.handoverItems.filter((i) => i.itemName), surveyQuestions: data.surveyQuestions.filter((i) => i.question), terms: data.terms.filter((i) => i.terms || i.notes) };
    const r = await fetch(`${browserApiBase()}/api/orders/${type}${editingId ? `/${editingId}` : ''}`, { method: editingId ? 'PUT' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    if (!r.ok) { setMessage('Khong luu duoc don hang. Kiem tra ma don va ngay thang.'); return; }
    setMessage(editingId ? 'Da cap nhat don hang.' : 'Da tao don hang.');
    setEditingId(null); setFormOpen(false); reset({ ...defaultValues, systemCode: `DH${Date.now().toString().slice(-6)}` }); await reload();
  }
  async function action(path: string) { if (!editingId) return; const r = await fetch(`${browserApiBase()}/api/orders/${type}/${editingId}/${path}`, { method: 'POST' }); if (r.ok) { setMessage(`Da thuc hien ${path}`); await reload(); } }
  async function unlockSettlement() { if (!editingId) return; const r = await fetch(`${browserApiBase()}/api/orders/${type}/${editingId}/unlock`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ actor: 'Operator', reason: 'Mo khoa tu man hinh don hang' }) }); if (r.ok) { setMessage('Da mo khoa quyet toan'); await reload(); } }
  function closeForm() { setEditingId(null); setFormOpen(false); setMessage(''); reset({ ...defaultValues, systemCode: `DH${Date.now().toString().slice(-6)}` }); }
  function openCreate() { setEditingId(null); setActiveStep(0); setMessage(''); reset({ ...defaultValues, systemCode: `DH${Date.now().toString().slice(-6)}` }); setFormOpen(true); }
  return (
    <div className="orderPage">
      {formOpen ? <div className="modalOverlay" role="dialog" aria-modal="true"><div className="modalPanel modalPanelWide tourWorkflowModal"><form onSubmit={handleSubmit(onSubmit)} className="orderForm">
        <section className="fitToolbar">
          <div className="fitSteps">{config.steps.map((step, index) => <button type="button" key={step} className={activeStep === index ? 'active' : ''} onClick={() => setActiveStep(index)}><span>{index + 1}.</span>{step}</button>)}</div>
          <div className="fitActions"><strong>{config.title}</strong><span>{message || 'Hệ thống tính lại thu, chi và lợi nhuận trước khi lưu'}</span></div>
        </section>
        <section className="orderWorkArea">
          <div className="orderMain">
            <section className="panel">
              <div className="sectionHeader"><h2>Thong tin don hang</h2><span>{config.shortTitle}</span></div>
              <div className="quoteFormGrid">
                <label>Ma he thong<input {...register('systemCode')} /></label><label>{config.codeLabel}<input {...register('tourCode')} /></label><label>Ma giu cho<input {...register('holdCode')} /></label><label>{config.nameLabel}<input {...register('name')} /></label><label>Thi truong<input {...register('marketGroup')} /></label>
                <label>Ngay dat<input type="date" {...register('bookingDate')} /></label><label>Ngay thanh toan<input type="date" {...register('paymentDate')} /></label><label>Ngay di/CI<input type="date" {...register('startDate')} /></label><label>Ngay ve/CO<input type="date" {...register('endDate')} /></label><label>Trang thai<select {...register('status')}><option value="UPCOMING">UPCOMING</option><option value="RUNNING">RUNNING</option><option value="COMPLETED">COMPLETED</option><option value="CANCELLED">CANCELLED</option></select></label>
                <label>Ho ten khach<input {...register('customerName')} /></label><label>Dien thoai<input {...register('customerPhone')} /></label><label>Email<input type="email" {...register('customerEmail')} /></label><label>CTV<input {...register('collaborator')} /></label><label>NVDH<input {...register('operatorOwner')} /></label>
                <label>Nguoi lon<input type="number" {...register('adultQty')} /></label><label>Tre em<input type="number" {...register('childQty')} /></label><label>So luong<input type="number" {...register('quantity')} /></label><label>Tong cho<input type="number" {...register('seatTotal')} /></label><label>Da ban<input type="number" {...register('seatSold')} /></label>
                <label>Phuong tien<input {...register('transportType')} /></label><label>Diem don<input {...register('pickupPoint')} /></label><label>Diem tra<input {...register('dropoffPoint')} /></label><label>Da thu<input type="number" {...register('paidAmount')} /></label><label>Da chi<input type="number" {...register('paidCost')} /></label>
                <label className="span2">Ghi chu<textarea rows={2} {...register('note')} /></label>
              </div>
            </section>
            <Rows title="Tour Guide" name="guides" register={register} fieldArray={arrays.guides} emptyRow={{ guideName: '', phone: '', language: '', note: '' }} columns={[['guideName','Guide'],['phone','Dien thoai'],['language','Ngon ngu'],['note','Ghi chu']]} />
            <Rows title="Dich vu Sales / Du tru Tour" name="salesItems" register={register} fieldArray={arrays.salesItems} emptyRow={emptySales} columns={[['serviceType','Loai DV'],['description','Dien giai'],['quantity','So luong','number'],['serviceCount','So luot','number'],['unitPrice','Don gia','number'],['vat','VAT %','number'],['note','Ghi chu']]} />
            <Rows title="Dich vu Dieu hanh / Phan chi" name="operationItems" register={register} fieldArray={arrays.operationItems} emptyRow={emptyOperation} columns={[['serviceType','Loai DV'],['bookingCode','Booking code'],['serviceDate','Ngay SD','date'],['quantity','So luong','number'],['netPrice','Gia NET','number'],['vat','VAT %','number'],['status','Trang thai'],['note','Ghi chu']]} />
            <Rows title="Lich trinh" name="itineraries" register={register} fieldArray={arrays.itineraries} emptyRow={{ dayNo: 1, title: '', content: '', period: '', destination: '', meals: '', hotel: '', restaurant: '', services: '', note: '' }} columns={[['dayNo','Ngay','number'],['title','Tieu de'],['content','Noi dung','textarea'],['destination','Diem den'],['meals','Bua an'],['hotel','Khach san'],['restaurant','Nha hang'],['note','Ghi chu']]} />
            <Rows title="Danh sach thanh vien" name="members" register={register} fieldArray={arrays.members} emptyRow={emptyMember} columns={[['fullName','Ho ten'],['gender','Gioi tinh'],['birthday','Ngay sinh','date'],['phone','Dien thoai'],['email','Email'],['identityNumber','CCCD/Passport'],['nationality','Quoc tich'],['passengerType','Loai khach']]} />
            <Rows title="Phieu ban giao" name="handoverItems" register={register} fieldArray={arrays.handoverItems} emptyRow={{ itemName: '', quantity: 1, note: '' }} columns={[['itemName','Tai lieu'],['quantity','So luong','number'],['note','Ghi chu']]} />
            <Rows title="Phieu danh gia dich vu" name="surveyQuestions" register={register} fieldArray={arrays.surveyQuestions} emptyRow={{ question: '', note: '' }} columns={[['question','Cau hoi'],['note','Ghi chu']]} />
            <Rows title="Dieu khoan & Luu y" name="terms" register={register} fieldArray={arrays.terms} emptyRow={{ language: 'VN', terms: '', notes: '' }} columns={[['language','Ngon ngu'],['terms','Dieu khoan','textarea'],['notes','Luu y','textarea']]} />
          </div>
          <aside className="panel quoteSummaryBox">
            <h2>Tong hop don hang</h2>
            <div className="summaryRows"><div><span>Tong thu</span><strong>{money(totals.revenue)}</strong></div><div><span>Da thu</span><strong>{money(values.paidAmount)}</strong></div><div><span>Con thieu</span><strong>{money(totals.remainRevenue)}</strong></div><div><span>Tong chi</span><strong>{money(totals.cost)}</strong></div><div><span>Da chi</span><strong>{money(values.paidCost)}</strong></div><div><span>Con chi</span><strong>{money(totals.remainCost)}</strong></div><div><span>Loi nhuan</span><strong>{money(totals.profit)}</strong></div><div><span>Con lai</span><strong>{totals.seatsLeft}</strong></div></div>
          </aside>
        </section>
        <div className="hotelFormActions"><button type="submit" disabled={isSubmitting}><Save size={17}/> Luu</button><button type="button" className="secondaryButton" disabled={!editingId} onClick={() => action('copy')}><Copy size={17}/> Sao chep</button><button type="button" className="secondaryButton" disabled={!editingId} onClick={() => action('settle')}><Lock size={17}/> Chot quyet toan</button><button type="button" className="secondaryButton" disabled={!editingId} onClick={unlockSettlement}><LockOpen size={17}/> Mo khoa</button><button type="button" className="dangerButton" onClick={closeForm}><X size={17}/> Dong</button></div>
      </form></div></div> : null}
      <section className="panel listPanel"><div className="sectionHeader"><h2>Danh sach {config.shortTitle}</h2><button type="button" className="secondaryButton iconTextButton" onClick={openCreate}><Plus size={16}/> Them moi</button><label className="searchBox"><Search size={16}/><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Tim ma, ten, SDT..." /></label></div><div className="fitTableWrap"><table className="fitTable orderListTable"><thead>{table.getHeaderGroups().map((g)=><tr key={g.id}>{g.headers.map((h)=><th key={h.id}>{flexRender(h.column.columnDef.header,h.getContext())}</th>)}</tr>)}</thead><tbody>{table.getRowModel().rows.map((r)=><tr key={r.id}>{r.getVisibleCells().map((c)=><td key={c.id}>{flexRender(c.column.columnDef.cell,c.getContext())}</td>)}</tr>)}</tbody></table></div></section>
    </div>
  );
}

function Rows<T extends ArrayName>({ title, name, register, fieldArray, columns, emptyRow }: { title: string; name: T; register: UseFormRegister<OrderForm>; fieldArray: UseFieldArrayReturn<OrderForm, T, 'id'>; columns: Array<[string, string, string?]>; emptyRow: Record<string, unknown> }) {
  const table = useReactTable({ data: fieldArray.fields, columns: useMemo(() => { const helper = createColumnHelper<FieldArrayWithId<OrderForm, T, 'id'>>(); return [helper.display({ id: 'stt', header: 'STT', cell: ({ row }) => row.index + 1 }), ...columns.map(([key,label,type]) => helper.display({ id: key, header: label, cell: ({ row }) => <Cell name={name} index={row.index} fieldKey={key} type={type} register={register} /> })), helper.display({ id: 'actions', header: '', cell: ({ row }) => <button type="button" className="dangerButton iconButton" onClick={() => fieldArray.remove(row.index)}><Trash2 size={15}/></button> })]; }, [columns, fieldArray, name, register]), getCoreRowModel: getCoreRowModel() });
  return <section className="fitTableBlock"><div className="sectionHeader"><h2>{title}</h2><button type="button" className="secondaryButton" onClick={() => fieldArray.append({ ...emptyRow } as any)}><Plus size={16}/> Them dong</button></div><div className="fitTableWrap"><table className="fitTable orderDynamicTable"><thead>{table.getHeaderGroups().map((g)=><tr key={g.id}>{g.headers.map((h)=><th key={h.id}>{flexRender(h.column.columnDef.header,h.getContext())}</th>)}</tr>)}</thead><tbody>{table.getRowModel().rows.map((r)=><tr key={r.id}>{r.getVisibleCells().map((c)=><td key={c.id}>{flexRender(c.column.columnDef.cell,c.getContext())}</td>)}</tr>)}</tbody></table></div></section>;
}

function Cell<T extends ArrayName>({ name, index, fieldKey, type, register }: { name: T; index: number; fieldKey: string; type?: string; register: UseFormRegister<OrderForm> }) {
  const field = `${name}.${index}.${fieldKey}`;
  if (type === 'textarea') return <textarea rows={2} {...register(field as any)} />;
  return <input type={type || 'text'} {...register(field as any)} />;
}

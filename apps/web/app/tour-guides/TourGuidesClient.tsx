'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { Pencil, Plus, Save, Search, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { z } from 'zod';
import { authHeaders, authJsonHeaders } from '../authFetch';
import { PermissionNotice, usePermissions } from '../usePermissions';

type GuideSummary = { id: string; guideCode: string; fullName: string; phone: string; email: string | null; guideType: string | null; languages: string[]; markets: string[]; status: string };
const cardSchema = z.object({ cardType: z.string().default(''), cardNumber: z.string().default(''), issueDate: z.string().default(''), expiredDate: z.string().default(''), issuePlace: z.string().default(''), note: z.string().default('') });
const documentSchema = z.object({ documentType: z.string().default(''), documentNo: z.string().default(''), country: z.string().default(''), issueDate: z.string().default(''), expiredDate: z.string().default(''), issuePlace: z.string().default(''), note: z.string().default('') });
const costSchema = z.object({ serviceType: z.string().default(''), serviceName: z.string().default(''), unit: z.string().default(''), currency: z.string().default('VND'), netPrice: z.coerce.number().default(0), sellingPrice: z.coerce.number().default(0), note: z.string().default('') });
const scheduleSchema = z.object({ title: z.string().default(''), startDate: z.string().default(''), endDate: z.string().default(''), status: z.string().default('BUSY'), note: z.string().default('') });
const guideSchema = z.object({
  guideCode: z.string().min(2),
  fullName: z.string().min(2),
  taxCode: z.string().default(''),
  birthday: z.string().default(''),
  gender: z.string().default(''),
  phone: z.string().min(6),
  email: z.string().email().or(z.literal('')).default(''),
  address: z.string().default(''),
  provinceId: z.string().default(''),
  bankAccountName: z.string().default(''),
  bankAccountNumber: z.string().default(''),
  bankName: z.string().default(''),
  link: z.string().default(''),
  description: z.string().default(''),
  guideType: z.string().default('Local'),
  languagesText: z.string().default('VI'),
  marketsText: z.string().default('Noi dia'),
  skillsText: z.string().default(''),
  frequency: z.string().default(''),
  comment: z.string().default(''),
  status: z.string().default('ACTIVE'),
  createdBy: z.string().default('Operator'),
  cards: z.array(cardSchema).default([]),
  documents: z.array(documentSchema).default([]),
  costServices: z.array(costSchema).default([]),
  schedules: z.array(scheduleSchema).default([]),
});
type GuideForm = z.infer<typeof guideSchema>;
const defaultValues: GuideForm = { guideCode: `HDV${Date.now().toString().slice(-6)}`, fullName: '', taxCode: '', birthday: '', gender: '', phone: '', email: '', address: '', provinceId: '', bankAccountName: '', bankAccountNumber: '', bankName: '', link: '', description: '', guideType: 'Local', languagesText: 'VI', marketsText: 'Noi dia', skillsText: '', frequency: '', comment: '', status: 'ACTIVE', createdBy: 'Operator', cards: [{ cardType: 'The HDV', cardNumber: '', issueDate: '', expiredDate: '', issuePlace: '', note: '' }], documents: [{ documentType: 'Passport', documentNo: '', country: '', issueDate: '', expiredDate: '', issuePlace: '', note: '' }], costServices: [{ serviceType: 'Guide', serviceName: 'Cong tac phi HDV', unit: 'ngay', currency: 'VND', netPrice: 0, sellingPrice: 0, note: '' }], schedules: [{ title: '', startDate: '', endDate: '', status: 'BUSY', note: '' }] };

function browserApiBase() {
  const apiBase = process.env.NEXT_PUBLIC_API_URL || '';
  if (typeof window === 'undefined') return apiBase;
  if (apiBase.includes('smarttour-api-1')) return `http://${window.location.hostname}:4000`;
  return apiBase;
}
function csv(value: string) { return value.split(',').map((item) => item.trim()).filter(Boolean); }
function join(value?: string[]) { return value?.join(', ') || ''; }
function money(value: unknown) { return Number(value || 0).toLocaleString('vi-VN'); }
function dateOnly(value?: string | null) { return value ? value.slice(0, 10) : ''; }

export default function TourGuidesClient({ initialGuides }: { initialGuides: GuideSummary[] }) {
  const { can, canAny } = usePermissions();
  const [guides, setGuides] = useState(initialGuides);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const { register, control, handleSubmit, reset, formState: { isSubmitting } } = useForm<GuideForm>({ resolver: zodResolver(guideSchema) as any, defaultValues });
  const cards = useFieldArray({ control, name: 'cards' });
  const documents = useFieldArray({ control, name: 'documents' });
  const costs = useFieldArray({ control, name: 'costServices' });
  const schedules = useFieldArray({ control, name: 'schedules' });
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return guides;
    return guides.filter((item) => [item.guideCode, item.fullName, item.phone, item.guideType, join(item.languages), join(item.markets)].filter(Boolean).some((value) => String(value).toLowerCase().includes(term)));
  }, [guides, query]);
  const table = useReactTable({
    data: filtered,
    columns: useMemo(() => {
      const helper = createColumnHelper<GuideSummary>();
      return [
        helper.display({ id: 'code', header: 'Ma HDV', cell: ({ row }) => <div><strong>{row.original.guideCode}</strong><br /><span className="mutedText">{row.original.guideType || '-'}</span></div> }),
        helper.display({ id: 'contact', header: 'Thong tin', cell: ({ row }) => <span>{row.original.fullName}<br />{row.original.phone}</span> }),
        helper.display({ id: 'lang', header: 'Ngon ngu / thi truong', cell: ({ row }) => <span>{join(row.original.languages) || '-'}<br />{join(row.original.markets) || '-'}</span> }),
        helper.accessor('status', { header: 'Trang thai', cell: (info) => <span className="statusPill">{info.getValue()}</span> }),
        helper.display({ id: 'actions', header: '', cell: ({ row }) => <button type="button" className="secondaryButton iconTextButton" onClick={() => loadGuide(row.original.id)}><Pencil size={15}/> Sua</button> }),
      ];
    }, []),
    getCoreRowModel: getCoreRowModel(),
  });

  async function reload() { const r = await fetch(`${browserApiBase()}/api/tour-guides`, { cache: 'no-store', headers: authHeaders() }); if (r.ok) setGuides(await r.json()); }
  async function loadGuide(id: string) {
    const r = await fetch(`${browserApiBase()}/api/tour-guides/${id}`, { headers: authHeaders() });
    if (!r.ok) return;
    const guide = await r.json();
    setEditingId(id);
    reset({ ...defaultValues, ...guide, birthday: dateOnly(guide.birthday), languagesText: join(guide.languages), marketsText: join(guide.markets), skillsText: join(guide.skills), cards: guide.cards?.length ? guide.cards.map((i: any) => ({ ...i, issueDate: dateOnly(i.issueDate), expiredDate: dateOnly(i.expiredDate) })) : defaultValues.cards, documents: guide.documents?.length ? guide.documents.map((i: any) => ({ ...i, issueDate: dateOnly(i.issueDate), expiredDate: dateOnly(i.expiredDate) })) : defaultValues.documents, costServices: guide.costServices?.length ? guide.costServices.map((i: any) => ({ ...i, netPrice: Number(i.netPrice), sellingPrice: Number(i.sellingPrice) })) : defaultValues.costServices, schedules: guide.schedules?.length ? guide.schedules.map((i: any) => ({ ...i, startDate: i.startDate?.slice(0, 16), endDate: i.endDate?.slice(0, 16) })) : defaultValues.schedules });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  async function onSubmit(data: GuideForm) {
    const payload = { ...data, languages: csv(data.languagesText), markets: csv(data.marketsText), skills: csv(data.skillsText), cards: data.cards.filter((i) => i.cardType), documents: data.documents.filter((i) => i.documentType), costServices: data.costServices.filter((i) => i.serviceName), schedules: data.schedules.filter((i) => i.startDate && i.endDate) };
    const r = await fetch(`${browserApiBase()}/api/tour-guides${editingId ? `/${editingId}` : ''}`, { method: editingId ? 'PUT' : 'POST', headers: authJsonHeaders(), body: JSON.stringify(payload) });
    if (!r.ok) { setMessage('Khong luu duoc HDV. Kiem tra ma, email, SDT hoac lich bi trung.'); return; }
    setMessage(editingId ? 'Da cap nhat HDV.' : 'Da tao HDV.');
    setEditingId(null); reset({ ...defaultValues, guideCode: `HDV${Date.now().toString().slice(-6)}` }); await reload();
  }
  function closeForm() { setEditingId(null); setMessage(''); reset({ ...defaultValues, guideCode: `HDV${Date.now().toString().slice(-6)}` }); }

  return (
    <div className="orderPage">
      <PermissionNotice allowed={canAny(['guide.view', 'guide.manage'])} label="xem va quan ly huong dan vien" />
      <form onSubmit={handleSubmit(onSubmit)} className="orderForm">
        <section className="panel">
          <div className="sectionHeader"><h2>Ho so huong dan vien</h2><span>{message || 'Quan ly HDV doc lap voi NCC'}</span></div>
          <div className="quoteFormGrid">
            <label>Ma HDV<input {...register('guideCode')} /></label><label>Ho ten<input {...register('fullName')} /></label><label>Dien thoai<input {...register('phone')} /></label><label>Email<input type="email" {...register('email')} /></label><label>Loai HDV<input {...register('guideType')} /></label>
            <label>Ngay sinh<input type="date" {...register('birthday')} /></label><label>Gioi tinh<input {...register('gender')} /></label><label>MST<input {...register('taxCode')} /></label><label>Tinh/TP<input {...register('provinceId')} /></label><label>Trang thai<select {...register('status')}><option value="ACTIVE">ACTIVE</option><option value="INACTIVE">INACTIVE</option></select></label>
            <label>Ngon ngu<input {...register('languagesText')} /></label><label>Thi truong<input {...register('marketsText')} /></label><label>Ky nang<input {...register('skillsText')} /></label><label>Tan suat<input {...register('frequency')} /></label><label>Link<input {...register('link')} /></label>
            <label>Chu tai khoan<input {...register('bankAccountName')} /></label><label>So TK<input {...register('bankAccountNumber')} /></label><label>Ngan hang<input {...register('bankName')} /></label><label className="span2">Dia chi<textarea rows={2} {...register('address')} /></label>
            <label className="span2">Mo ta<textarea rows={2} {...register('description')} /></label><label className="span2">Nhan xet<textarea rows={2} {...register('comment')} /></label>
          </div>
        </section>
        <Rows title="The HDV" array={cards} prefix="cards" register={register} empty={{ cardType: '', cardNumber: '', issueDate: '', expiredDate: '', issuePlace: '', note: '' }} columns={[['cardType','Loai the'],['cardNumber','So the'],['issueDate','Ngay cap','date'],['expiredDate','Het han','date'],['issuePlace','Noi cap'],['note','Ghi chu']]} />
        <Rows title="Passport / Visa" array={documents} prefix="documents" register={register} empty={{ documentType: '', documentNo: '', country: '', issueDate: '', expiredDate: '', issuePlace: '', note: '' }} columns={[['documentType','Loai giay to'],['documentNo','So'],['country','Quoc gia'],['issueDate','Ngay cap','date'],['expiredDate','Het han','date'],['note','Ghi chu']]} />
        <Rows title="Bang gia dich vu HDV" array={costs} prefix="costServices" register={register} empty={{ serviceType: '', serviceName: '', unit: '', currency: 'VND', netPrice: 0, sellingPrice: 0, note: '' }} columns={[['serviceType','Loai DV'],['serviceName','Ten dich vu'],['unit','DVT'],['netPrice','Gia NET','number'],['sellingPrice','Gia ban','number'],['note','Ghi chu']]} />
        <Rows title="Lich dieu hanh" array={schedules} prefix="schedules" register={register} empty={{ title: '', startDate: '', endDate: '', status: 'BUSY', note: '' }} columns={[['title','Noi dung'],['startDate','Bat dau','datetime-local'],['endDate','Ket thuc','datetime-local'],['status','Trang thai'],['note','Ghi chu']]} />
        <div className="hotelFormActions"><button type="submit" disabled={isSubmitting || !can('guide.manage')}><Save size={17}/> Luu HDV</button><button type="button" className="dangerButton" onClick={closeForm}><X size={17}/> Dong</button></div>
      </form>
      <section className="panel listPanel"><div className="sectionHeader"><h2>Danh sach HDV</h2><label className="searchBox"><Search size={16}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tim ma, ten, SDT..." /></label></div><div className="fitTableWrap"><table className="fitTable orderListTable"><thead>{table.getHeaderGroups().map((group) => <tr key={group.id}>{group.headers.map((header) => <th key={header.id}>{flexRender(header.column.columnDef.header, header.getContext())}</th>)}</tr>)}</thead><tbody>{table.getRowModel().rows.map((row) => <tr key={row.id}>{row.getVisibleCells().map((cell) => <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}</tbody></table></div></section>
    </div>
  );
}

function Rows({ title, array, prefix, register, columns, empty }: { title: string; array: any; prefix: string; register: any; columns: Array<[string, string, string?]>; empty: Record<string, unknown> }) {
  return <section className="fitTableBlock"><div className="sectionHeader"><h2>{title}</h2><button type="button" className="secondaryButton" onClick={() => array.append({ ...empty })}><Plus size={16}/> Them dong</button></div><div className="fitTableWrap"><table className="fitTable orderDynamicTable"><thead><tr><th>STT</th>{columns.map(([, label]) => <th key={label}>{label}</th>)}<th /></tr></thead><tbody>{array.fields.map((field: any, index: number) => <tr key={field.id}><td>{index + 1}</td>{columns.map(([key, , type]) => <td key={key}>{key === 'netPrice' || key === 'sellingPrice' ? <input type={type || 'text'} {...register(`${prefix}.${index}.${key}`)} title={money(0)} /> : <input type={type || 'text'} {...register(`${prefix}.${index}.${key}`)} />}</td>)}<td><button type="button" className="dangerButton iconButton" onClick={() => array.remove(index)}><Trash2 size={15}/></button></td></tr>)}</tbody></table></div></section>;
}

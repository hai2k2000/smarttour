'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { Loader2, Pencil, Plus, RefreshCcw, Save, Search, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { z } from 'zod';

type GuideSummary = {
  id: string;
  guideCode: string;
  fullName: string;
  phone: string;
  email: string | null;
  guideType: string | null;
  languages: string[];
  markets: string[];
  status: string;
};

type Message = { kind: 'success' | 'error' | 'info'; text: string };
type RowColumn = { key: string; label: string; type?: string; placeholder?: string };
const costValueKeys = ['serviceType', 'serviceName', 'unit', 'netPrice', 'sellingPrice', 'note'];
const scheduleValueKeys = ['title', 'startDate', 'endDate', 'note'];

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
  marketsText: z.string().default('Nội địa'),
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

const emptyCard: GuideForm['cards'][number] = { cardType: '', cardNumber: '', issueDate: '', expiredDate: '', issuePlace: '', note: '' };
const emptyDocument: GuideForm['documents'][number] = { documentType: '', documentNo: '', country: '', issueDate: '', expiredDate: '', issuePlace: '', note: '' };
const emptyCost: GuideForm['costServices'][number] = { serviceType: '', serviceName: '', unit: '', currency: 'VND', netPrice: 0, sellingPrice: 0, note: '' };
const emptySchedule: GuideForm['schedules'][number] = { title: '', startDate: '', endDate: '', status: 'BUSY', note: '' };

function browserApiBase() {
  const apiBase = process.env.NEXT_PUBLIC_API_URL || '';
  if (typeof window === 'undefined') return apiBase;
  if (apiBase.includes('smarttour-api-1')) return `http://${window.location.hostname}:4000`;
  return apiBase;
}

function newGuideCode() {
  return `HDV${Date.now().toString().slice(-6)}`;
}

function newGuideDefaults(): GuideForm {
  return {
    guideCode: newGuideCode(),
    fullName: '',
    taxCode: '',
    birthday: '',
    gender: '',
    phone: '',
    email: '',
    address: '',
    provinceId: '',
    bankAccountName: '',
    bankAccountNumber: '',
    bankName: '',
    link: '',
    description: '',
    guideType: 'Local',
    languagesText: 'VI',
    marketsText: 'Nội địa',
    skillsText: '',
    frequency: '',
    comment: '',
    status: 'ACTIVE',
    createdBy: 'Operator',
    cards: [{ ...emptyCard, cardType: 'Thẻ HDV' }],
    documents: [{ ...emptyDocument, documentType: 'Passport' }],
    costServices: [{ ...emptyCost, serviceType: 'Guide', serviceName: 'Công tác phí HDV', unit: 'ngày' }],
    schedules: [{ ...emptySchedule }],
  };
}

function text(value: unknown) {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function cleanText(value: unknown) {
  return text(value).trim();
}

function optionalText(value: unknown) {
  const cleaned = cleanText(value);
  return cleaned || undefined;
}

function numberOrZero(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function csv(value: string) {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function join(value?: unknown) {
  return Array.isArray(value) ? value.map(text).filter(Boolean).join(', ') : '';
}

function money(value: unknown) {
  return Number(value || 0).toLocaleString('vi-VN');
}

function dateOnly(value?: string | null) {
  return value ? value.slice(0, 10) : '';
}

function dateTimeLocal(value?: string | null) {
  return value ? value.slice(0, 16) : '';
}

function normalizeSearch(value: unknown) {
  return text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase();
}

function hasAnyValue(row: Record<string, unknown>, keys: string[]) {
  return keys.some((key) => cleanText(row[key]).length > 0 || numberOrZero(row[key]) > 0);
}

async function responseMessage(response: Response, fallback: string) {
  try {
    const body = await response.json();
    const raw = Array.isArray(body?.message) ? body.message.join('; ') : body?.message || body?.error;
    return raw ? `${fallback}: ${raw}` : fallback;
  } catch {
    return fallback;
  }
}

function guideStatusLabel(status: string) {
  if (status === 'ACTIVE') return 'Đang hoạt động';
  if (status === 'INACTIVE') return 'Tạm dừng';
  return status || 'Chưa rõ';
}

function guideStatusClass(status: string) {
  if (status === 'ACTIVE') return 'statusPill statusPillSuccess';
  if (status === 'INACTIVE') return 'statusPill statusPillNeutral';
  return 'statusPill statusPillWarning';
}

function messageClass(message: Message) {
  if (message.kind === 'success') return 'statusPill statusPillSuccess';
  if (message.kind === 'error') return 'statusPill statusPillWarning';
  return 'statusPill statusPillNeutral';
}

function mapGuideToForm(guide: any): GuideForm {
  const cards = Array.isArray(guide?.cards)
    ? guide.cards.map((item: any) => ({
      cardType: text(item?.cardType),
      cardNumber: text(item?.cardNumber),
      issueDate: dateOnly(item?.issueDate),
      expiredDate: dateOnly(item?.expiredDate),
      issuePlace: text(item?.issuePlace),
      note: text(item?.note),
    })).filter((item: Record<string, unknown>) => hasAnyValue(item, ['cardType', 'cardNumber', 'issueDate', 'expiredDate', 'issuePlace', 'note']))
    : [];
  const documents = Array.isArray(guide?.documents)
    ? guide.documents.map((item: any) => ({
      documentType: text(item?.documentType),
      documentNo: text(item?.documentNo),
      country: text(item?.country),
      issueDate: dateOnly(item?.issueDate),
      expiredDate: dateOnly(item?.expiredDate),
      issuePlace: text(item?.issuePlace),
      note: text(item?.note),
    })).filter((item: Record<string, unknown>) => hasAnyValue(item, ['documentType', 'documentNo', 'country', 'issueDate', 'expiredDate', 'issuePlace', 'note']))
    : [];
  const costServices = Array.isArray(guide?.costServices)
    ? guide.costServices.map((item: any) => ({
      serviceType: text(item?.serviceType),
      serviceName: text(item?.serviceName),
      unit: text(item?.unit),
      currency: text(item?.currency) || 'VND',
      netPrice: numberOrZero(item?.netPrice),
      sellingPrice: numberOrZero(item?.sellingPrice),
      note: text(item?.note),
    })).filter((item: Record<string, unknown>) => hasAnyValue(item, costValueKeys))
    : [];
  const schedules = Array.isArray(guide?.schedules)
    ? guide.schedules.map((item: any) => ({
      title: text(item?.title),
      startDate: dateTimeLocal(item?.startDate),
      endDate: dateTimeLocal(item?.endDate),
      status: text(item?.status) || 'BUSY',
      note: text(item?.note),
    })).filter((item: Record<string, unknown>) => hasAnyValue(item, scheduleValueKeys))
    : [];

  return {
    ...newGuideDefaults(),
    guideCode: text(guide?.guideCode) || newGuideCode(),
    fullName: text(guide?.fullName),
    taxCode: text(guide?.taxCode),
    birthday: dateOnly(guide?.birthday),
    gender: text(guide?.gender),
    phone: text(guide?.phone),
    email: text(guide?.email),
    address: text(guide?.address),
    provinceId: text(guide?.provinceId),
    bankAccountName: text(guide?.bankAccountName),
    bankAccountNumber: text(guide?.bankAccountNumber),
    bankName: text(guide?.bankName),
    link: text(guide?.link),
    description: text(guide?.description),
    guideType: text(guide?.guideType) || 'Local',
    languagesText: join(guide?.languages) || 'VI',
    marketsText: join(guide?.markets) || 'Nội địa',
    skillsText: join(guide?.skills),
    frequency: text(guide?.frequency),
    comment: text(guide?.comment),
    status: text(guide?.status) || 'ACTIVE',
    createdBy: text(guide?.createdBy) || 'Operator',
    cards: cards.length ? cards : [{ ...emptyCard }],
    documents: documents.length ? documents : [{ ...emptyDocument }],
    costServices: costServices.length ? costServices : [{ ...emptyCost }],
    schedules: schedules.length ? schedules : [{ ...emptySchedule }],
  };
}

function validateRows(data: GuideForm) {
  const cardMissingType = data.cards.some((row) => hasAnyValue(row, ['cardType', 'cardNumber', 'issueDate', 'expiredDate', 'issuePlace', 'note']) && !cleanText(row.cardType));
  if (cardMissingType) return 'Có dòng thẻ HDV đã nhập dữ liệu nhưng thiếu loại thẻ.';
  const documentMissingType = data.documents.some((row) => hasAnyValue(row, ['documentType', 'documentNo', 'country', 'issueDate', 'expiredDate', 'issuePlace', 'note']) && !cleanText(row.documentType));
  if (documentMissingType) return 'Có dòng giấy tờ đã nhập dữ liệu nhưng thiếu loại giấy tờ.';
  const costMissingName = data.costServices.some((row) => hasAnyValue(row, costValueKeys) && !cleanText(row.serviceName));
  if (costMissingName) return 'Có dòng bảng giá đã nhập dữ liệu nhưng thiếu tên dịch vụ.';
  const scheduleMissingDate = data.schedules.some((row) => hasAnyValue(row, scheduleValueKeys) && (!cleanText(row.startDate) || !cleanText(row.endDate)));
  if (scheduleMissingDate) return 'Có dòng lịch điều hành đã nhập dữ liệu nhưng thiếu ngày bắt đầu hoặc ngày kết thúc.';
  const scheduleInvalidRange = data.schedules.some((row) => cleanText(row.startDate) && cleanText(row.endDate) && new Date(row.endDate) < new Date(row.startDate));
  if (scheduleInvalidRange) return 'Ngày kết thúc lịch điều hành phải sau ngày bắt đầu.';
  return '';
}

function buildPayload(data: GuideForm) {
  const cards = data.cards
    .filter((row) => hasAnyValue(row, ['cardType', 'cardNumber', 'issueDate', 'expiredDate', 'issuePlace', 'note']))
    .map((row) => ({
      cardType: cleanText(row.cardType),
      cardNumber: cleanText(row.cardNumber),
      issueDate: cleanText(row.issueDate),
      expiredDate: cleanText(row.expiredDate),
      issuePlace: cleanText(row.issuePlace),
      note: cleanText(row.note),
    }));
  const documents = data.documents
    .filter((row) => hasAnyValue(row, ['documentType', 'documentNo', 'country', 'issueDate', 'expiredDate', 'issuePlace', 'note']))
    .map((row) => ({
      documentType: cleanText(row.documentType),
      documentNo: cleanText(row.documentNo),
      country: cleanText(row.country),
      issueDate: cleanText(row.issueDate),
      expiredDate: cleanText(row.expiredDate),
      issuePlace: cleanText(row.issuePlace),
      note: cleanText(row.note),
    }));
  const costServices = data.costServices
    .filter((row) => hasAnyValue(row, costValueKeys))
    .map((row) => ({
      serviceType: cleanText(row.serviceType),
      serviceName: cleanText(row.serviceName),
      unit: cleanText(row.unit),
      currency: cleanText(row.currency) || 'VND',
      netPrice: numberOrZero(row.netPrice),
      sellingPrice: numberOrZero(row.sellingPrice),
      note: cleanText(row.note),
    }));
  const schedules = data.schedules
    .filter((row) => hasAnyValue(row, scheduleValueKeys))
    .map((row) => ({
      title: cleanText(row.title),
      startDate: cleanText(row.startDate),
      endDate: cleanText(row.endDate),
      status: cleanText(row.status) || 'BUSY',
      note: cleanText(row.note),
    }));
  const { languagesText, marketsText, skillsText, ...rest } = data;

  return {
    ...rest,
    guideCode: cleanText(data.guideCode),
    fullName: cleanText(data.fullName),
    phone: cleanText(data.phone),
    email: optionalText(data.email),
    birthday: cleanText(data.birthday),
    languages: csv(languagesText),
    markets: csv(marketsText),
    skills: csv(skillsText),
    cards,
    documents,
    costServices,
    schedules,
  };
}

export default function TourGuidesClient({ initialHDVs }: { initialHDVs: GuideSummary[] }) {
  const [guides, setGuides] = useState(initialHDVs);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState<Message | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [loadingGuideId, setLoadingGuideId] = useState<string | null>(null);
  const { register, control, handleSubmit, reset, formState: { isSubmitting } } = useForm<GuideForm>({ resolver: zodResolver(guideSchema) as any, defaultValues: newGuideDefaults() });
  const cards = useFieldArray({ control, name: 'cards' });
  const documents = useFieldArray({ control, name: 'documents' });
  const costs = useFieldArray({ control, name: 'costServices' });
  const schedules = useFieldArray({ control, name: 'schedules' });
  const filtered = useMemo(() => {
    const term = normalizeSearch(query.trim());
    if (!term) return guides;
    return guides.filter((item) => [item.guideCode, item.fullName, item.phone, item.email, item.guideType, join(item.languages), join(item.markets), guideStatusLabel(item.status)].some((value) => normalizeSearch(value).includes(term)));
  }, [guides, query]);
  const table = useReactTable({
    data: filtered,
    columns: useMemo(() => {
      const helper = createColumnHelper<GuideSummary>();
      return [
        helper.display({ id: 'code', header: 'Mã HDV', cell: ({ row }) => <div><strong>{row.original.guideCode}</strong><br /><span className="mutedText">{row.original.guideType || '-'}</span></div> }),
        helper.display({ id: 'contact', header: 'Thông tin', cell: ({ row }) => <span>{row.original.fullName}<br />{row.original.phone || '-'}{row.original.email ? <><br />{row.original.email}</> : null}</span> }),
        helper.display({ id: 'lang', header: 'Ngôn ngữ / thị trường', cell: ({ row }) => <span>{join(row.original.languages) || '-'}<br />{join(row.original.markets) || '-'}</span> }),
        helper.accessor('status', { header: 'Trạng thái', cell: (info) => <span className={guideStatusClass(info.getValue())}>{guideStatusLabel(info.getValue())}</span> }),
        helper.display({
          id: 'actions',
          header: 'Thao tác',
          cell: ({ row }) => (
            <button type="button" className="secondaryButton iconTextButton" disabled={loadingGuideId === row.original.id} onClick={() => loadGuide(row.original.id)}>
              {loadingGuideId === row.original.id ? <Loader2 size={15} /> : <Pencil size={15} />} {loadingGuideId === row.original.id ? 'Đang tải' : 'Sửa'}
            </button>
          ),
        }),
      ];
    }, [loadingGuideId]),
    getCoreRowModel: getCoreRowModel(),
  });

  async function reload(announce = true) {
    setReloading(true);
    if (announce) setMessage({ kind: 'info', text: 'Đang tải lại danh sách hướng dẫn viên...' });
    try {
      const response = await fetch(`${browserApiBase()}/api/tour-guides`, { cache: 'no-store' });
      if (!response.ok) throw new Error(await responseMessage(response, 'Không tải được danh sách hướng dẫn viên từ API /tour-guides'));
      const data = await response.json();
      setGuides(Array.isArray(data) ? data : []);
      if (announce) setMessage({ kind: 'success', text: 'Đã tải lại danh sách hướng dẫn viên.' });
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Không tải được danh sách hướng dẫn viên từ API /tour-guides.' });
    } finally {
      setReloading(false);
    }
  }

  async function loadGuide(id: string) {
    setEditingId(id);
    setFormOpen(true);
    setLoadingGuideId(id);
    setMessage({ kind: 'info', text: 'Đang tải hồ sơ hướng dẫn viên...' });
    reset(newGuideDefaults());
    try {
      const response = await fetch(`${browserApiBase()}/api/tour-guides/${id}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(await responseMessage(response, 'Không tải được hồ sơ hướng dẫn viên'));
      const guide = await response.json();
      reset(mapGuideToForm(guide));
      setMessage(null);
    } catch (error) {
      setEditingId(null);
      setFormOpen(false);
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Không tải được hồ sơ hướng dẫn viên.' });
    } finally {
      setLoadingGuideId(null);
    }
  }

  async function onSubmit(data: GuideForm) {
    const rowError = validateRows(data);
    if (rowError) {
      setMessage({ kind: 'error', text: rowError });
      return;
    }
    const payload = buildPayload(data);
    try {
      const response = await fetch(`${browserApiBase()}/api/tour-guides${editingId ? `/${editingId}` : ''}`, {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(await responseMessage(response, 'Không lưu được hồ sơ HDV'));
      const savedMessage = editingId ? 'Đã cập nhật hồ sơ HDV.' : 'Đã tạo hồ sơ HDV.';
      setEditingId(null);
      setFormOpen(false);
      reset(newGuideDefaults());
      await reload(false);
      setMessage({ kind: 'success', text: savedMessage });
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Không lưu được hồ sơ HDV. Kiểm tra mã HDV, email, số điện thoại hoặc lịch điều hành bị trùng.' });
    }
  }

  function closeForm() {
    setEditingId(null);
    setFormOpen(false);
    setLoadingGuideId(null);
    setMessage(null);
    reset(newGuideDefaults());
  }

  function openCreate() {
    setEditingId(null);
    setLoadingGuideId(null);
    setMessage(null);
    reset(newGuideDefaults());
    setFormOpen(true);
  }

  const formBusy = isSubmitting || Boolean(loadingGuideId);

  return (
    <div className="orderPage">
      {formOpen ? (
        <div className="modalOverlay" role="dialog" aria-modal="true">
          <div className="modalPanel modalPanelWide">
            <form onSubmit={handleSubmit(onSubmit)} className="orderForm">
              <section className="panel">
                <div className="sectionHeader">
                  <h2>{editingId ? 'Cập nhật hồ sơ hướng dẫn viên' : 'Hồ sơ hướng dẫn viên'}</h2>
                  <span>{loadingGuideId ? 'Đang tải dữ liệu...' : 'Quản lý hồ sơ hướng dẫn viên độc lập với nhà cung cấp'}</span>
                </div>
                {loadingGuideId ? <div className="loadingBar" /> : null}
                <div className="sectionHeader"><h2>Thông tin cá nhân</h2><span>Mã, liên hệ, ngôn ngữ và thị trường</span></div>
                <div className="quoteFormGrid">
                  <label>Mã HDV<input {...register('guideCode')} disabled={formBusy} /></label>
                  <label>Họ tên<input {...register('fullName')} disabled={formBusy} /></label>
                  <label>Điện thoại<input {...register('phone')} disabled={formBusy} /></label>
                  <label>Email<input type="email" {...register('email')} disabled={formBusy} /></label>
                  <label>Loại HDV<input {...register('guideType')} disabled={formBusy} /></label>
                  <label>Ngày sinh<input type="date" {...register('birthday')} disabled={formBusy} /></label>
                  <label>Giới tính<select {...register('gender')} disabled={formBusy}><option value="">Chọn giới tính</option><option value="Nam">Nam</option><option value="Nữ">Nữ</option><option value="Khác">Khác</option></select></label>
                  <label>Mã số thuế<input {...register('taxCode')} disabled={formBusy} /></label>
                  <label>Tỉnh/TP<input {...register('provinceId')} disabled={formBusy} /></label>
                  <label>Trạng thái<select {...register('status')} disabled={formBusy}><option value="ACTIVE">Đang hoạt động</option><option value="INACTIVE">Tạm dừng</option></select></label>
                  <label>Ngôn ngữ<input {...register('languagesText')} placeholder="VI, EN, TH..." disabled={formBusy} /></label>
                  <label>Thị trường<input {...register('marketsText')} placeholder="Nội địa, Inbound..." disabled={formBusy} /></label>
                  <label>Kỹ năng<input {...register('skillsText')} placeholder="Teambuilding, MICE..." disabled={formBusy} /></label>
                  <label>Tần suất<input {...register('frequency')} disabled={formBusy} /></label>
                  <label>Link hồ sơ<input {...register('link')} disabled={formBusy} /></label>
                  <label className="span2">Địa chỉ<textarea rows={2} {...register('address')} disabled={formBusy} /></label>
                  <label className="span2">Mô tả<textarea rows={2} {...register('description')} disabled={formBusy} /></label>
                  <label className="span2">Nhận xét<textarea rows={2} {...register('comment')} disabled={formBusy} /></label>
                </div>
              </section>
              <section className="panel">
                <div className="sectionHeader"><h2>Ngân hàng</h2><span>Thông tin thanh toán cho hướng dẫn viên</span></div>
                <div className="quoteFormGrid">
                  <label>Chủ tài khoản<input {...register('bankAccountName')} disabled={formBusy} /></label>
                  <label>Số tài khoản<input {...register('bankAccountNumber')} disabled={formBusy} /></label>
                  <label>Ngân hàng<input {...register('bankName')} disabled={formBusy} /></label>
                </div>
              </section>
              <Rows title="Giấy tờ - thẻ HDV" addLabel="Thêm thẻ" array={cards} prefix="cards" register={register} disabled={formBusy} empty={emptyCard} columns={[
                { key: 'cardType', label: 'Loại thẻ' },
                { key: 'cardNumber', label: 'Số thẻ' },
                { key: 'issueDate', label: 'Ngày cấp', type: 'date' },
                { key: 'expiredDate', label: 'Hết hạn', type: 'date' },
                { key: 'issuePlace', label: 'Nơi cấp' },
                { key: 'note', label: 'Ghi chú' },
              ]} />
              <Rows title="Giấy tờ - passport / visa" addLabel="Thêm giấy tờ" array={documents} prefix="documents" register={register} disabled={formBusy} empty={emptyDocument} columns={[
                { key: 'documentType', label: 'Loại giấy tờ' },
                { key: 'documentNo', label: 'Số giấy tờ' },
                { key: 'country', label: 'Quốc gia' },
                { key: 'issueDate', label: 'Ngày cấp', type: 'date' },
                { key: 'expiredDate', label: 'Hết hạn', type: 'date' },
                { key: 'note', label: 'Ghi chú' },
              ]} />
              <Rows title="Bảng giá dịch vụ HDV" addLabel="Thêm dòng giá" array={costs} prefix="costServices" register={register} disabled={formBusy} empty={emptyCost} columns={[
                { key: 'serviceType', label: 'Loại dịch vụ' },
                { key: 'serviceName', label: 'Tên dịch vụ' },
                { key: 'unit', label: 'ĐVT' },
                { key: 'netPrice', label: 'Giá NET', type: 'number' },
                { key: 'sellingPrice', label: 'Giá bán', type: 'number' },
                { key: 'note', label: 'Ghi chú' },
              ]} />
              <Rows title="Lịch điều hành" addLabel="Thêm lịch" array={schedules} prefix="schedules" register={register} disabled={formBusy} empty={emptySchedule} columns={[
                { key: 'title', label: 'Nội dung' },
                { key: 'startDate', label: 'Bắt đầu', type: 'datetime-local' },
                { key: 'endDate', label: 'Kết thúc', type: 'datetime-local' },
                { key: 'status', label: 'Trạng thái' },
                { key: 'note', label: 'Ghi chú' },
              ]} />
              {message ? <span className={messageClass(message)} role={message.kind === 'error' ? 'alert' : 'status'}>{message.text}</span> : null}
              <div className="hotelFormActions">
                <button type="submit" disabled={formBusy}>{isSubmitting ? <Loader2 size={17} /> : <Save size={17} />} {isSubmitting ? 'Đang lưu' : 'Lưu HDV'}</button>
                <button type="button" className="dangerButton" onClick={closeForm} disabled={isSubmitting}><X size={17} /> Đóng</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
      <section className="panel listPanel">
        <div className="sectionHeader">
          <div>
            <h2>Danh sách hướng dẫn viên</h2>
            <span>{reloading ? 'Đang tải dữ liệu...' : `${filtered.length} / ${guides.length} HDV`}</span>
          </div>
          <div className="pageHeaderActions">
            <button type="button" className="secondaryButton iconTextButton" disabled={reloading} onClick={() => void reload()}><RefreshCcw size={16} /> {reloading ? 'Đang tải' : 'Tải lại'}</button>
            <button type="button" className="secondaryButton iconTextButton" onClick={openCreate}><Plus size={16} /> Thêm mới</button>
            <label className="searchBox"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm mã, tên, SĐT, ngôn ngữ..." /></label>
          </div>
        </div>
        {message && !formOpen ? <span className={messageClass(message)} role={message.kind === 'error' ? 'alert' : 'status'}>{message.text}</span> : null}
        {reloading ? <div className="loadingBar" /> : null}
        <div className="fitTableWrap">
          <table className="fitTable orderListTable">
            <thead>{table.getHeaderGroups().map((group) => <tr key={group.id}>{group.headers.map((header) => <th key={header.id}>{flexRender(header.column.columnDef.header, header.getContext())}</th>)}</tr>)}</thead>
            <tbody>
              {table.getRowModel().rows.map((row) => <tr key={row.id}>{row.getVisibleCells().map((cell) => <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}
              {!table.getRowModel().rows.length ? <tr><td colSpan={5}><div className="tableEmptyState">{reloading ? 'Đang tải danh sách hướng dẫn viên...' : 'Chưa có hướng dẫn viên phù hợp bộ lọc.'}</div></td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Rows({ title, addLabel, array, prefix, register, columns, empty, disabled }: { title: string; addLabel: string; array: any; prefix: string; register: any; columns: RowColumn[]; empty: Record<string, unknown>; disabled?: boolean }) {
  return (
    <section className="fitTableBlock">
      <div className="sectionHeader">
        <h2>{title}</h2>
        <button type="button" className="secondaryButton" disabled={disabled} onClick={() => array.append({ ...empty }, { shouldFocus: false })}><Plus size={16} /> {addLabel}</button>
      </div>
      <div className="fitTableWrap">
        <table className="fitTable orderDynamicTable">
          <thead><tr><th>STT</th>{columns.map((column) => <th key={column.key}>{column.label}</th>)}<th /></tr></thead>
          <tbody>
            {array.fields.map((field: any, index: number) => (
              <tr key={field.id}>
                <td>{index + 1}</td>
                {columns.map((column) => (
                  <td key={column.key}>
                    <input
                      type={column.type || 'text'}
                      min={column.type === 'number' ? 0 : undefined}
                      step={column.type === 'number' ? '0.01' : undefined}
                      placeholder={column.placeholder}
                      title={column.type === 'number' ? money(0) : column.label}
                      disabled={disabled}
                      {...register(`${prefix}.${index}.${column.key}`)}
                    />
                  </td>
                ))}
                <td><button type="button" className="dangerButton iconButton" disabled={disabled} onClick={() => array.remove(index)}><Trash2 size={15} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

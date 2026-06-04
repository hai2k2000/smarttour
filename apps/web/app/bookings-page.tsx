import type { ReactNode } from 'react';
import { AlertTriangle, CalendarDays, CheckCircle2, CircleDollarSign, ClipboardCheck, Pencil, Plus, Save, Trash2, Users, X } from 'lucide-react';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { viStatus } from './i18n';
import { serverAuthHeaders, serverAuthJsonHeaders } from './serverAuth';

export const dynamic = 'force-dynamic';

type TourProgram = { id: string; code: string; name: string; durationDays: number };
type Booking = {
  id: string;
  code: string;
  customerName: string;
  paxCount: number;
  startDate: string;
  endDate: string;
  saleOwner: string | null;
  operatorOwner: string | null;
  status: string;
  totalSellPrice: string | number | null;
  tourProgram: TourProgram;
  operationForm: { id: string; status: string } | null;
};
type BookingDeleteGuardDetail = {
  operationForm?: unknown | null;
  operationVouchers?: unknown[];
  allotmentLocks?: unknown[];
};
type BookingPayload = {
  code: string;
  tourProgramId: string;
  customerName: string;
  paxCount: number;
  startDate: string;
  endDate: string;
  totalSellPrice: number;
  saleOwner?: string;
  operatorOwner?: string;
};
type ApiResult<T> = { data: T; error?: string };
type MutationResult = { ok: boolean; message: string };
type BookingsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const apiBase = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/+$/, '');
const moneyFormatter = new Intl.NumberFormat('vi-VN');
const dateFormatter = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
const bookingStatusOptions = [
  'DRAFT',
  'CONFIRMED',
  'OPERATING',
  'COMPLETED',
  'CANCELLED',
] as const;
type BookingStatus = (typeof bookingStatusOptions)[number];
const validBookingStatuses = new Set<string>(bookingStatusOptions);

async function responseError(response: Response) {
  try {
    const body = await response.clone().json();
    const message = body?.message;
    return Array.isArray(message) ? message.join(', ') : message || body?.error || response.statusText || `HTTP ${response.status}`;
  } catch {
    const text = await response.text().catch(() => '');
    return text || response.statusText || `HTTP ${response.status}`;
  }
}

async function apiGet<T>(path: string, fallback: T, label: string): Promise<ApiResult<T>> {
  try {
    const response = await fetch(`${apiBase}/api${path}`, { cache: 'no-store', headers: await serverAuthHeaders() });
    if (!response.ok) {
      const error = `${label}: HTTP ${response.status} - ${await responseError(response)}`;
      console.error(`[BookingsPage] ${error}`);
      return { data: fallback, error };
    }
    return { data: await response.json() };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'KhÃ´ng rÃµ lá»—i';
    const detail = `${label}: ${message}`;
    console.error(`[BookingsPage] ${detail}`);
    return { data: fallback, error: detail };
  }
}

async function apiMutation(path: string, init: RequestInit, successMessage: string, failureLabel: string): Promise<MutationResult> {
  try {
    const response = await fetch(`${apiBase}/api${path}`, { cache: 'no-store', ...init });
    if (!response.ok) return { ok: false, message: `${failureLabel}: HTTP ${response.status} - ${await responseError(response)}` };
    revalidatePath('/bookings');
    return { ok: true, message: successMessage };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'KhÃ´ng rÃµ lá»—i';
    return { ok: false, message: `${failureLabel}: ${message}` };
  }
}

function redirectWithResult(result: MutationResult): never {
  const key = result.ok ? 'notice' : 'error';
  redirect(`/bookings?${key}=${encodeURIComponent(result.message)}`);
}

function singleParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function field(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function optionalText(formData: FormData, key: string) {
  return field(formData, key) || undefined;
}

function requiredText(formData: FormData, key: string, label: string, minLength = 1) {
  const value = field(formData, key);
  if (value.length < minLength) throw new Error(`${label} pháº£i cÃ³ tá»‘i thiá»ƒu ${minLength} kÃ½ tá»±.`);
  return value;
}

function numberField(formData: FormData, key: string, label: string, options: { min?: number; integer?: boolean; fallback?: number } = {}) {
  const raw = field(formData, key);
  if (!raw && options.fallback !== undefined) return options.fallback;
  const value = Number(raw.replace(/,/g, ''));
  if (!Number.isFinite(value)) throw new Error(`${label} pháº£i lÃ  sá»‘ há»£p lá»‡.`);
  if (options.integer && !Number.isInteger(value)) throw new Error(`${label} pháº£i lÃ  sá»‘ nguyÃªn.`);
  if (options.min !== undefined && value < options.min) throw new Error(`${label} khÃ´ng Ä‘Æ°á»£c nhá» hÆ¡n ${options.min}.`);
  return value;
}

function dateField(formData: FormData, key: string, label: string) {
  const value = field(formData, key);
  if (!value) throw new Error(`${label} lÃ  báº¯t buá»™c.`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${label} khÃ´ng Ä‘Ãºng Ä‘á»‹nh dáº¡ng ngÃ y.`);
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new Error(`${label} khÃ´ng pháº£i lÃ  ngÃ y há»£p lá»‡.`);
  }
  return value;
}

function dateTime(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day).getTime();
}

function bookingPayload(formData: FormData): BookingPayload {
  const startDate = dateField(formData, 'startDate', 'NgÃ y khá»Ÿi hÃ nh');
  const endDate = dateField(formData, 'endDate', 'NgÃ y káº¿t thÃºc');
  if (dateTime(startDate) > dateTime(endDate)) throw new Error('NgÃ y káº¿t thÃºc pháº£i sau hoáº·c báº±ng ngÃ y khá»Ÿi hÃ nh.');

  const payload: BookingPayload = {
    code: requiredText(formData, 'code', 'MÃ£ booking', 2),
    tourProgramId: requiredText(formData, 'tourProgramId', 'Tour máº«u'),
    customerName: requiredText(formData, 'customerName', 'TÃªn khÃ¡ch/Ä‘oÃ n', 2),
    paxCount: numberField(formData, 'paxCount', 'Sá»‘ khÃ¡ch', { min: 1, integer: true, fallback: 1 }),
    startDate,
    endDate,
    totalSellPrice: numberField(formData, 'totalSellPrice', 'GiÃ¡ bÃ¡n tá»•ng', { min: 0, fallback: 0 }),
  };
  const saleOwner = optionalText(formData, 'saleOwner');
  const operatorOwner = optionalText(formData, 'operatorOwner');
  if (saleOwner) payload.saleOwner = saleOwner;
  if (operatorOwner) payload.operatorOwner = operatorOwner;
  return payload;
}

function validationResult(error: unknown, label: string): MutationResult {
  const message = error instanceof Error ? error.message : 'Dá»¯ liá»‡u khÃ´ng há»£p lá»‡.';
  return { ok: false, message: `${label}: ${message}` };
}

async function createBooking(formData: FormData) {
  'use server';
  let payload: BookingPayload;
  try {
    payload = bookingPayload(formData);
  } catch (error) {
    redirectWithResult(validationResult(error, 'Táº¡o booking tháº¥t báº¡i'));
  }
  const result = await apiMutation(
    '/bookings',
    { method: 'POST', headers: await serverAuthJsonHeaders(), body: JSON.stringify(payload) },
    'ÄÃ£ táº¡o booking.',
    'Táº¡o booking tháº¥t báº¡i',
  );
  redirectWithResult(result);
}

async function updateBooking(formData: FormData) {
  'use server';
  const id = field(formData, 'id');
  if (!id) redirectWithResult({ ok: false, message: 'Cáº­p nháº­t booking tháº¥t báº¡i: thiáº¿u ID booking.' });
  let payload: BookingPayload;
  try {
    payload = bookingPayload(formData);
  } catch (error) {
    redirectWithResult(validationResult(error, 'Cáº­p nháº­t booking tháº¥t báº¡i'));
  }
  const result = await apiMutation(
    `/bookings/${encodeURIComponent(id)}`,
    { method: 'PATCH', headers: await serverAuthJsonHeaders(), body: JSON.stringify(payload) },
    'ÄÃ£ cáº­p nháº­t booking.',
    'Cáº­p nháº­t booking tháº¥t báº¡i',
  );
  redirectWithResult(result);
}

async function updateBookingStatus(formData: FormData) {
  'use server';
  const id = field(formData, 'id');
  const status = field(formData, 'status');
  if (!id) redirectWithResult({ ok: false, message: 'Cáº­p nháº­t tráº¡ng thÃ¡i tháº¥t báº¡i: thiáº¿u ID booking.' });
  if (!validBookingStatuses.has(status)) {
    redirectWithResult({ ok: false, message: `Cáº­p nháº­t tráº¡ng thÃ¡i tháº¥t báº¡i: tráº¡ng thÃ¡i "${status || 'trá»‘ng'}" khÃ´ng há»£p lá»‡.` });
  }
  const result = await apiMutation(
    `/bookings/${encodeURIComponent(id)}`,
    { method: 'PATCH', headers: await serverAuthJsonHeaders(), body: JSON.stringify({ status }) },
    'ÄÃ£ cáº­p nháº­t tráº¡ng thÃ¡i booking.',
    'Cáº­p nháº­t tráº¡ng thÃ¡i tháº¥t báº¡i',
  );
  redirectWithResult(result);
}

async function blockingDeleteReason(id: string, hasOperationFormFromList: boolean) {
  if (hasOperationFormFromList) return 'Booking Ä‘Ã£ phÃ¡t sinh phiáº¿u Ä‘iá»u hÃ nh, khÃ´ng thá»ƒ xÃ³a trá»±c tiáº¿p tá»« danh sÃ¡ch.';
  const detailResult = await apiGet<BookingDeleteGuardDetail | null>(`/bookings/${encodeURIComponent(id)}`, null, 'Kiá»ƒm tra dá»¯ liá»‡u liÃªn quan trÆ°á»›c khi xÃ³a');
  if (detailResult.error) return `KhÃ´ng thá»ƒ kiá»ƒm tra dá»¯ liá»‡u liÃªn quan: ${detailResult.error}`;
  const detail = detailResult.data;
  if (!detail) return 'KhÃ´ng tÃ¬m tháº¥y booking Ä‘á»ƒ kiá»ƒm tra trÆ°á»›c khi xÃ³a.';
  if (detail.operationForm) return 'Booking Ä‘Ã£ cÃ³ phiáº¿u Ä‘iá»u hÃ nh liÃªn quan.';
  if (detail.operationVouchers?.length) return 'Booking Ä‘Ã£ cÃ³ phiáº¿u Ä‘iá»u hÃ nh dá»‹ch vá»¥ liÃªn quan.';
  if (detail.allotmentLocks?.length) return 'Booking Ä‘Ã£ cÃ³ khÃ³a allotment khÃ¡ch sáº¡n liÃªn quan.';
  return '';
}

async function deleteBooking(formData: FormData) {
  'use server';
  const id = field(formData, 'id');
  const code = field(formData, 'code') || 'booking';
  if (!id) redirectWithResult({ ok: false, message: 'XÃ³a booking tháº¥t báº¡i: thiáº¿u ID booking.' });
  const reason = await blockingDeleteReason(id, field(formData, 'hasOperationForm') === 'true');
  if (reason) redirectWithResult({ ok: false, message: `XÃ³a ${code} tháº¥t báº¡i: ${reason}` });
  const result = await apiMutation(
    `/bookings/${encodeURIComponent(id)}`,
    { method: 'DELETE', headers: await serverAuthHeaders() },
    `ÄÃ£ xÃ³a ${code}.`,
    `XÃ³a ${code} tháº¥t báº¡i`,
  );
  redirectWithResult(result);
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'â€”';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (match) {
    const [, year, month, day] = match;
    return dateFormatter.format(new Date(Number(year), Number(month) - 1, Number(day)));
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'â€”';
  return dateFormatter.format(date);
}

function formatMoney(value: string | number | null | undefined) {
  const amount = Number(value ?? 0);
  return `${moneyFormatter.format(Number.isFinite(amount) ? amount : 0)} Ä‘`;
}

function toDateInputValue(value: string | null | undefined) {
  if (!value) return '';
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  if (match) return match[1];
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function display(value: string | null | undefined) {
  return value?.trim() || 'â€”';
}

function bookingStatusClass(status: string) {
  if (status === 'COMPLETED') return 'statusPill statusPillSuccess';
  if (status === 'CANCELLED') return 'statusPill statusPillError';
  if (status === 'OPERATING' || status === 'CONFIRMED') return 'statusPill statusPillWarning';
  return 'statusPill statusPillNeutral';
}

function operationBadge(booking: Booking) {
  if (!booking.operationForm) return <span className="statusPill statusPillNeutral">ChÆ°a vÃ o Ä‘iá»u hÃ nh</span>;
  return <span className="statusPill statusPillSuccess">ÄÃ£ vÃ o Ä‘iá»u hÃ nh: {viStatus(booking.operationForm.status)}</span>;
}

function modalCloseHref() {
  return '/bookings';
}

export default async function BookingsPage({ searchParams }: BookingsPageProps) {
  const params = searchParams ? await searchParams : {};
  const notice = singleParam(params.notice);
  const error = singleParam(params.error);
  const [tourProgramsResult, bookingsResult] = await Promise.all([
    apiGet<TourProgram[]>('/tour-programs', [], 'Táº£i danh sÃ¡ch tour máº«u'),
    apiGet<Booking[]>('/bookings', [], 'Táº£i danh sÃ¡ch booking'),
  ]);
  const tourPrograms = tourProgramsResult.data;
  const bookings = bookingsResult.data;
  const loadErrors = [tourProgramsResult.error, bookingsResult.error].filter(Boolean);

  return (
    <section className="workspace">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">Quy trÃ¬nh booking</p>
          <h1>Booking tour</h1>
        </div>
        <div className="pageHeaderActions">
          <a className="secondaryButton iconTextButton" href="#create-booking"><Plus size={16} /> ThÃªm booking</a>
          <span className="statusPill"><Users size={14} /> NhÃ¢n sá»± váº­n hÃ nh</span>
        </div>
      </header>

      {notice ? <div className="supplierNotice"><CheckCircle2 size={16} /> {notice}</div> : null}
      {error ? <div className="supplierNotice supplierNoticeError"><AlertTriangle size={16} /> {error}</div> : null}
      {loadErrors.length ? (
        <div className="supplierNotice supplierNoticeError">
          <AlertTriangle size={16} /> {loadErrors.join(' ')}
        </div>
      ) : null}

      <section className="panel listPanel">
        <div className="sectionHeader">
          <h2>Danh sÃ¡ch booking</h2>
          <span>{bookings.length} booking</span>
        </div>
        <div className="fitTableWrap">
          <table className="fitTable orderListTable">
            <thead>
              <tr>
                <th>MÃ£ booking</th>
                <th>TÃªn khÃ¡ch/Ä‘oÃ n</th>
                <th>Tour máº«u</th>
                <th>NgÃ y khá»Ÿi hÃ nh</th>
                <th>NgÃ y káº¿t thÃºc</th>
                <th>Pax</th>
                <th>Sale phá»¥ trÃ¡ch</th>
                <th>Äiá»u hÃ nh phá»¥ trÃ¡ch</th>
                <th>GiÃ¡ bÃ¡n tá»•ng</th>
                <th>Tráº¡ng thÃ¡i</th>
                <th>Äiá»u hÃ nh</th>
                <th>Thao tÃ¡c</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((booking) => (
                <tr key={booking.id}>
                  <td><strong>{booking.code}</strong></td>
                  <td>{booking.customerName}</td>
                  <td>
                    <strong>{booking.tourProgram.code}</strong>
                    <span>{booking.tourProgram.name}</span>
                  </td>
                  <td><CalendarDays size={14} /> {formatDate(booking.startDate)}</td>
                  <td>{formatDate(booking.endDate)}</td>
                  <td>{booking.paxCount}</td>
                  <td>{display(booking.saleOwner)}</td>
                  <td>{display(booking.operatorOwner)}</td>
                  <td><CircleDollarSign size={14} /> {formatMoney(booking.totalSellPrice)}</td>
                  <td><span className={bookingStatusClass(booking.status)}>{viStatus(booking.status)}</span></td>
                  <td>{operationBadge(booking)}</td>
                  <td className="actionsCell">
                    <div className="rowActions">
                      <a className="secondaryButton iconOnlyButton" href={`#status-${booking.id}`} title="Cáº­p nháº­t tráº¡ng thÃ¡i" aria-label={`Cáº­p nháº­t tráº¡ng thÃ¡i ${booking.code}`}>
                        <ClipboardCheck size={14} />
                      </a>
                      <a className="secondaryButton iconOnlyButton" href={`#edit-${booking.id}`} title="Sá»­a booking" aria-label={`Sá»­a ${booking.code}`}>
                        <Pencil size={14} />
                      </a>
                      <a className="dangerButton iconOnlyButton" href={`#delete-${booking.id}`} title="XÃ³a booking" aria-label={`XÃ³a ${booking.code}`}>
                        <Trash2 size={14} />
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
              {bookings.length === 0 ? (
                <tr>
                  <td colSpan={12} className="tableEmptyState">ChÆ°a cÃ³ booking. HÃ£y táº¡o booking tá»« popup thÃªm má»›i.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <BookingModal id="create-booking" title="Táº¡o booking" icon={<Plus size={18} />}>
        <BookingForm tourPrograms={tourPrograms} action={createBooking} submitLabel="Táº¡o booking" />
      </BookingModal>
      {bookings.map((booking) => (
        <BookingModal id={`edit-${booking.id}`} title={`Sá»­a ${booking.code}`} icon={<Pencil size={18} />} key={`edit-${booking.id}`}>
          <BookingForm tourPrograms={tourPrograms} booking={booking} action={updateBooking} submitLabel="LÆ°u booking" />
        </BookingModal>
      ))}
      {bookings.map((booking) => (
        <StatusBookingModal booking={booking} key={`status-${booking.id}`} />
      ))}
      {bookings.map((booking) => (
        <DeleteBookingModal booking={booking} key={`delete-${booking.id}`} />
      ))}
    </section>
  );
}

function BookingModal({ id, title, icon, children }: { id: string; title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div id={id} className="hashModal">
      <a href={modalCloseHref()} className="hashModalBackdrop" aria-label="ÄÃ³ng modal" />
      <div className="hashModalPanel hashModalWide">
        <div className="hashModalHeader">
          <h2>{icon} {title}</h2>
          <a className="secondaryButton iconOnlyButton" href={modalCloseHref()} aria-label="ÄÃ³ng"><X size={14} /></a>
        </div>
        {children}
      </div>
    </div>
  );
}

function BookingForm({
  tourPrograms,
  booking,
  action,
  submitLabel,
}: {
  tourPrograms: TourProgram[];
  booking?: Booking;
  action: (formData: FormData) => Promise<void>;
  submitLabel: string;
}) {
  const selectedTourProgramId = booking?.tourProgram.id || '';
  const hasSelectedTour = !selectedTourProgramId || tourPrograms.some((tour) => tour.id === selectedTourProgramId);

  return (
    <form action={action} className="modalFormStack">
      {booking ? <input type="hidden" name="id" value={booking.id} /> : null}
      {tourPrograms.length === 0 ? (
        <div className="supplierNotice supplierNoticeError">
          <AlertTriangle size={16} /> ChÆ°a táº£i Ä‘Æ°á»£c tour máº«u. Kiá»ƒm tra lá»—i á»Ÿ Ä‘áº§u trang trÆ°á»›c khi táº¡o booking.
        </div>
      ) : null}

      <fieldset>
        <legend>ThÃ´ng tin booking</legend>
        <div className="supplierFieldGrid">
          <label>
            MÃ£ booking
            <input name="code" defaultValue={booking?.code || ''} placeholder="BK-2026-0001" required minLength={2} />
          </label>
          {booking ? (
            <label>
              Tráº¡ng thÃ¡i hiá»‡n táº¡i
              <input value={viStatus(booking.status)} readOnly />
            </label>
          ) : null}
        </div>
      </fieldset>

      <fieldset>
        <legend>Tour máº«u</legend>
        <label>
          Tour máº«u
          <select name="tourProgramId" defaultValue={selectedTourProgramId} required disabled={tourPrograms.length === 0}>
            <option value="">Chá»n tour máº«u</option>
            {booking && !hasSelectedTour ? <option value={booking.tourProgram.id}>{booking.tourProgram.code} - {booking.tourProgram.name}</option> : null}
            {tourPrograms.map((tour) => (
              <option value={tour.id} key={tour.id}>{tour.code} - {tour.name} ({tour.durationDays} ngÃ y)</option>
            ))}
          </select>
        </label>
      </fieldset>

      <fieldset>
        <legend>KhÃ¡ch hÃ ng</legend>
        <div className="supplierFieldGrid">
          <label>
            TÃªn khÃ¡ch/Ä‘oÃ n
            <input name="customerName" defaultValue={booking?.customerName || ''} placeholder="CÃ´ng ty ABC" required minLength={2} />
          </label>
          <label>
            Pax
            <input name="paxCount" type="number" min={1} step={1} defaultValue={booking?.paxCount || 1} required />
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend>PhÃ¢n cÃ´ng</legend>
        <div className="supplierFieldGrid">
          <label>
            Sale phá»¥ trÃ¡ch
            <input name="saleOwner" defaultValue={booking?.saleOwner || ''} placeholder="TÃªn nhÃ¢n sá»± sale" />
          </label>
          <label>
            Äiá»u hÃ nh phá»¥ trÃ¡ch
            <input name="operatorOwner" defaultValue={booking?.operatorOwner || ''} placeholder="TÃªn nhÃ¢n sá»± Ä‘iá»u hÃ nh" />
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend>GiÃ¡ trá»‹</legend>
        <div className="supplierFieldGrid">
          <label>
            NgÃ y khá»Ÿi hÃ nh
            <input name="startDate" type="date" defaultValue={toDateInputValue(booking?.startDate)} required />
          </label>
          <label>
            NgÃ y káº¿t thÃºc
            <input name="endDate" type="date" defaultValue={toDateInputValue(booking?.endDate)} required />
          </label>
          <label>
            GiÃ¡ bÃ¡n tá»•ng
            <input name="totalSellPrice" type="number" min={0} step={1} defaultValue={Number(booking?.totalSellPrice || 0)} />
          </label>
        </div>
      </fieldset>

      <div className="modalActions">
        <a className="secondaryButton" href={modalCloseHref()}>Há»§y</a>
        <button type="submit" disabled={tourPrograms.length === 0}><Save size={14} /> {submitLabel}</button>
      </div>
    </form>
  );
}

function StatusBookingModal({ booking }: { booking: Booking }) {
  return (
    <div id={`status-${booking.id}`} className="hashModal">
      <a href={modalCloseHref()} className="hashModalBackdrop" aria-label="ÄÃ³ng modal" />
      <div className="hashModalPanel">
        <div className="hashModalHeader">
          <h2><ClipboardCheck size={18} /> Cáº­p nháº­t tráº¡ng thÃ¡i</h2>
          <a className="secondaryButton iconOnlyButton" href={modalCloseHref()} aria-label="ÄÃ³ng"><X size={14} /></a>
        </div>
        <form action={updateBookingStatus} className="modalFormStack">
          <input type="hidden" name="id" value={booking.id} />
          <fieldset>
            <legend>{booking.code}</legend>
            <label>
              Tráº¡ng thÃ¡i
              <select name="status" defaultValue={validBookingStatuses.has(booking.status) ? booking.status : 'DRAFT'}>
                {bookingStatusOptions.map((status: BookingStatus) => (
                  <option value={status} key={status}>{viStatus(status)}</option>
                ))}
              </select>
            </label>
          </fieldset>
          <div className="modalActions">
            <a className="secondaryButton" href={modalCloseHref()}>Há»§y</a>
            <button type="submit"><Save size={14} /> Cáº­p nháº­t tráº¡ng thÃ¡i</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DeleteBookingModal({ booking }: { booking: Booking }) {
  const blocked = Boolean(booking.operationForm);
  return (
    <div id={`delete-${booking.id}`} className="hashModal">
      <a href={modalCloseHref()} className="hashModalBackdrop" aria-label="ÄÃ³ng modal" />
      <div className="hashModalPanel">
        <div className="hashModalHeader">
          <h2><AlertTriangle size={18} /> XÃ³a booking</h2>
          <a className="secondaryButton iconOnlyButton" href={modalCloseHref()} aria-label="ÄÃ³ng"><X size={14} /></a>
        </div>
        <div className="supplierDeleteWarning">
          <strong>{booking.code} - {booking.customerName}</strong>
          {blocked ? (
            <p>Booking nÃ y Ä‘Ã£ phÃ¡t sinh phiáº¿u Ä‘iá»u hÃ nh ({viStatus(booking.operationForm?.status)}), khÃ´ng thá»ƒ xÃ³a trá»±c tiáº¿p tá»« danh sÃ¡ch.</p>
          ) : (
            <p>Há»‡ thá»‘ng sáº½ kiá»ƒm tra phiáº¿u Ä‘iá»u hÃ nh, phiáº¿u dá»‹ch vá»¥ vÃ  khÃ³a allotment liÃªn quan trÆ°á»›c khi xÃ³a.</p>
          )}
        </div>
        {blocked ? (
          <div className="modalActions">
            <a className="secondaryButton" href={modalCloseHref()}>ÄÃ³ng</a>
          </div>
        ) : (
          <form action={deleteBooking} className="modalActions">
            <input type="hidden" name="id" value={booking.id} />
            <input type="hidden" name="code" value={booking.code} />
            <input type="hidden" name="hasOperationForm" value={booking.operationForm ? 'true' : 'false'} />
            <a className="secondaryButton" href={modalCloseHref()}>Há»§y</a>
            <button type="submit" className="dangerButton"><Trash2 size={14} /> XÃ³a booking</button>
          </form>
        )}
      </div>
    </div>
  );
}

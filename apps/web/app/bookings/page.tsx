import type { ReactNode } from 'react';
import { AlertTriangle, CalendarDays, CheckCircle2, CircleDollarSign, ClipboardCheck, Pencil, Plus, Save, Trash2, Users, X } from 'lucide-react';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { viStatus } from '../i18n';
import { serverAuthHeaders, serverAuthJsonHeaders } from '../serverAuth';

export const dynamic = 'force-dynamic';

type ItineraryDay = { id: string; dayNumber: number; title: string; description?: string | null };
type TourProgram = { id: string; code: string; name: string; durationDays: number; itineraryDays?: ItineraryDay[] };
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
  canDelete: boolean;
  operationForms: number;
  operationVouchers: number;
  allotmentLocks: number;
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
const bookingSafeTextPattern = '[^\\x00-\\x1F\\x7F<>]+';
const bookingSafeTextRegex = /^[^\u0000-\u001F\u007F<>]+$/;
const bookingStatusOptions = [
  'DRAFT',
  'CONFIRMED',
  'OPERATING',
  'COMPLETED',
  'CANCELLED',
] as const;
type BookingStatus = (typeof bookingStatusOptions)[number];
const validBookingStatuses = new Set<string>(bookingStatusOptions);
const bookingPageSize = 50;

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
    const message = error instanceof Error ? error.message : 'Không rõ lỗi';
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
    const message = error instanceof Error ? error.message : 'Không rõ lỗi';
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

function pageParam(value: string | string[] | undefined) {
  const page = Number(singleParam(value));
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function field(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function ensureSafeText(value: string, label: string, maxLength?: number) {
  if (maxLength !== undefined && value.length > maxLength) throw new Error(`${label} không được vượt quá ${maxLength} ký tự.`);
  if (!bookingSafeTextRegex.test(value)) throw new Error(`${label} không được chứa ký tự điều khiển hoặc dấu < >.`);
}

function optionalText(formData: FormData, key: string, label: string, minLength = 1, maxLength?: number) {
  const value = field(formData, key);
  if (!value) return undefined;
  if (value.length < minLength) throw new Error(`${label} phải có tối thiểu ${minLength} ký tự.`);
  ensureSafeText(value, label, maxLength);
  return value;
}

function requiredText(formData: FormData, key: string, label: string, minLength = 1, maxLength?: number) {
  const value = field(formData, key);
  if (value.length < minLength) throw new Error(`${label} phải có tối thiểu ${minLength} ký tự.`);
  ensureSafeText(value, label, maxLength);
  return value;
}

function numberField(formData: FormData, key: string, label: string, options: { min?: number; integer?: boolean; fallback?: number } = {}) {
  const raw = field(formData, key);
  if (!raw && options.fallback !== undefined) return options.fallback;
  const value = Number(raw.replace(/,/g, ''));
  if (!Number.isFinite(value)) throw new Error(`${label} phải là số hợp lệ.`);
  if (options.integer && !Number.isInteger(value)) throw new Error(`${label} phải là số nguyên.`);
  if (options.min !== undefined && value < options.min) throw new Error(`${label} không được nhỏ hơn ${options.min}.`);
  return value;
}

function dateField(formData: FormData, key: string, label: string) {
  const value = field(formData, key);
  if (!value) throw new Error(`${label} là bắt buộc.`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${label} không đúng định dạng ngày.`);
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new Error(`${label} không phải là ngày hợp lệ.`);
  }
  return value;
}

function dateTime(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day).getTime();
}

function bookingPayload(formData: FormData): BookingPayload {
  const startDate = dateField(formData, 'startDate', 'Ngày khởi hành');
  const endDate = dateField(formData, 'endDate', 'Ngày kết thúc');
  if (dateTime(startDate) > dateTime(endDate)) throw new Error('Ngày kết thúc phải sau hoặc bằng ngày khởi hành.');

  const payload: BookingPayload = {
    code: requiredText(formData, 'code', 'Mã booking', 2),
    tourProgramId: requiredText(formData, 'tourProgramId', 'Tour mẫu'),
    customerName: requiredText(formData, 'customerName', 'Tên khách/đoàn', 2, 180),
    paxCount: numberField(formData, 'paxCount', 'Số khách', { min: 1, integer: true, fallback: 1 }),
    startDate,
    endDate,
    totalSellPrice: numberField(formData, 'totalSellPrice', 'Giá bán tổng', { min: 0, fallback: 0 }),
  };
  const saleOwner = optionalText(formData, 'saleOwner', 'Sale phụ trách', 2, 120);
  const operatorOwner = optionalText(formData, 'operatorOwner', 'Điều hành phụ trách', 2, 120);
  if (saleOwner) payload.saleOwner = saleOwner;
  if (operatorOwner) payload.operatorOwner = operatorOwner;
  return payload;
}

function validationResult(error: unknown, label: string): MutationResult {
  const message = error instanceof Error ? error.message : 'Dữ liệu không hợp lệ.';
  return { ok: false, message: `${label}: ${message}` };
}

async function createBooking(formData: FormData) {
  'use server';
  let payload: BookingPayload;
  try {
    payload = bookingPayload(formData);
  } catch (error) {
    redirectWithResult(validationResult(error, 'Tạo booking thất bại'));
  }
  const result = await apiMutation(
    '/bookings',
    { method: 'POST', headers: await serverAuthJsonHeaders(), body: JSON.stringify(payload) },
    'Đã tạo booking.',
    'Tạo booking thất bại',
  );
  redirectWithResult(result);
}

async function updateBooking(formData: FormData) {
  'use server';
  const id = field(formData, 'id');
  if (!id) redirectWithResult({ ok: false, message: 'Cập nhật booking thất bại: thiếu ID booking.' });
  let payload: BookingPayload;
  try {
    payload = bookingPayload(formData);
  } catch (error) {
    redirectWithResult(validationResult(error, 'Cập nhật booking thất bại'));
  }
  const result = await apiMutation(
    `/bookings/${encodeURIComponent(id)}`,
    { method: 'PATCH', headers: await serverAuthJsonHeaders(), body: JSON.stringify(payload) },
    'Đã cập nhật booking.',
    'Cập nhật booking thất bại',
  );
  redirectWithResult(result);
}

async function updateBookingStatus(formData: FormData) {
  'use server';
  const id = field(formData, 'id');
  const status = field(formData, 'status');
  if (!id) redirectWithResult({ ok: false, message: 'Cập nhật trạng thái thất bại: thiếu ID booking.' });
  if (!validBookingStatuses.has(status)) {
    redirectWithResult({ ok: false, message: `Cập nhật trạng thái thất bại: trạng thái "${status || 'trống'}" không hợp lệ.` });
  }
  const result = await apiMutation(
    `/bookings/${encodeURIComponent(id)}/status`,
    { method: 'PATCH', headers: await serverAuthJsonHeaders(), body: JSON.stringify({ status }) },
    'Đã cập nhật trạng thái booking.',
    'Cập nhật trạng thái thất bại',
  );
  redirectWithResult(result);
}

async function blockingDeleteReason(id: string, hasOperationFormFromList: boolean) {
  if (hasOperationFormFromList) return 'Booking đã phát sinh phiếu điều hành, không thể xóa trực tiếp từ danh sách.';
  const detailResult = await apiGet<BookingDeleteGuardDetail | null>(`/bookings/${encodeURIComponent(id)}/delete-guard`, null, 'Kiểm tra dữ liệu liên quan trước khi xóa');
  if (detailResult.error) return `Không thể kiểm tra dữ liệu liên quan: ${detailResult.error}`;
  const detail = detailResult.data;
  if (!detail) return 'Không tìm thấy booking để kiểm tra trước khi xóa.';
  if (detail.operationForms > 0) return `Booking đã có ${detail.operationForms} phiếu điều hành liên quan.`;
  if (detail.operationVouchers > 0) return `Booking đã có ${detail.operationVouchers} phiếu điều hành dịch vụ liên quan.`;
  if (detail.allotmentLocks > 0) return `Booking đã có ${detail.allotmentLocks} khóa allotment khách sạn liên quan.`;
  return '';
}

async function deleteBooking(formData: FormData) {
  'use server';
  const id = field(formData, 'id');
  const code = field(formData, 'code') || 'booking';
  if (!id) redirectWithResult({ ok: false, message: 'Xóa booking thất bại: thiếu ID booking.' });
  const reason = await blockingDeleteReason(id, field(formData, 'hasOperationForm') === 'true');
  if (reason) redirectWithResult({ ok: false, message: `Xóa ${code} thất bại: ${reason}` });
  const result = await apiMutation(
    `/bookings/${encodeURIComponent(id)}`,
    { method: 'DELETE', headers: await serverAuthHeaders() },
    `Đã xóa ${code}.`,
    `Xóa ${code} thất bại`,
  );
  redirectWithResult(result);
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (match) {
    const [, year, month, day] = match;
    return dateFormatter.format(new Date(Number(year), Number(month) - 1, Number(day)));
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return dateFormatter.format(date);
}

function formatMoney(value: string | number | null | undefined) {
  const amount = Number(value ?? 0);
  return `${moneyFormatter.format(Number.isFinite(amount) ? amount : 0)} đ`;
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
  return value?.trim() || '—';
}

function missingItineraryDays(tourProgram: TourProgram) {
  const days = new Set((tourProgram.itineraryDays || []).map((day) => day.dayNumber));
  const missing: number[] = [];
  for (let day = 1; day <= tourProgram.durationDays; day += 1) {
    if (!days.has(day)) missing.push(day);
  }
  return missing;
}

function isTourProgramReadyForBooking(tourProgram: TourProgram) {
  return missingItineraryDays(tourProgram).length === 0;
}

function tourProgramBookingLabel(tourProgram: TourProgram) {
  const base = `${tourProgram.code} - ${tourProgram.name} (${tourProgram.durationDays} ngày)`;
  const missing = missingItineraryDays(tourProgram);
  return missing.length ? `${base} - thiếu ngày ${missing.join(', ')}` : base;
}

function bookingStatusClass(status: string) {
  if (status === 'COMPLETED') return 'statusPill statusPillSuccess';
  if (status === 'CANCELLED') return 'statusPill statusPillError';
  if (status === 'OPERATING' || status === 'CONFIRMED') return 'statusPill statusPillWarning';
  return 'statusPill statusPillNeutral';
}

function operationBadge(booking: Booking) {
  if (!booking.operationForm) return <span className="statusPill statusPillNeutral">Chưa vào điều hành</span>;
  return <span className="statusPill statusPillSuccess">Đã vào điều hành: {viStatus(booking.operationForm.status)}</span>;
}

function modalCloseHref() {
  return '/bookings';
}

export default async function BookingsPage({ searchParams }: BookingsPageProps) {
  const params = searchParams ? await searchParams : {};
  const notice = singleParam(params.notice);
  const error = singleParam(params.error);
  const page = pageParam(params.page);
  const skip = (page - 1) * bookingPageSize;
  const [tourProgramsResult, bookingsResult] = await Promise.all([
    apiGet<TourProgram[]>('/tour-programs', [], 'Tải danh sách tour mẫu'),
    apiGet<Booking[]>(`/bookings?skip=${skip}&take=${bookingPageSize + 1}`, [], 'Tải danh sách booking'),
  ]);
  const tourPrograms = tourProgramsResult.data;
  const hasNextPage = bookingsResult.data.length > bookingPageSize;
  const bookings = bookingsResult.data.slice(0, bookingPageSize);
  const loadErrors = [tourProgramsResult.error, bookingsResult.error].filter(Boolean);

  return (
    <section className="workspace">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">Quy trình booking</p>
          <h1>Booking tour</h1>
        </div>
        <div className="pageHeaderActions">
          <a className="secondaryButton iconTextButton" href="#create-booking"><Plus size={16} /> Thêm booking</a>
          <span className="statusPill"><Users size={14} /> Nhân sự vận hành</span>
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
          <h2>Danh sách booking</h2>
          <span>Trang {page} · {bookings.length} booking</span>
        </div>
        <div className="fitTableWrap">
          <table className="fitTable orderListTable">
            <thead>
              <tr>
                <th>Mã booking</th>
                <th>Tên khách/đoàn</th>
                <th>Tour mẫu</th>
                <th>Ngày khởi hành</th>
                <th>Ngày kết thúc</th>
                <th>Pax</th>
                <th>Sale phụ trách</th>
                <th>Điều hành phụ trách</th>
                <th>Giá bán tổng</th>
                <th>Trạng thái</th>
                <th>Điều hành</th>
                <th>Thao tác</th>
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
                      <a className="secondaryButton iconOnlyButton" href={`#status-${booking.id}`} title="Cập nhật trạng thái" aria-label={`Cập nhật trạng thái ${booking.code}`}>
                        <ClipboardCheck size={14} />
                      </a>
                      <a className="secondaryButton iconOnlyButton" href={`#edit-${booking.id}`} title="Sửa booking" aria-label={`Sửa ${booking.code}`}>
                        <Pencil size={14} />
                      </a>
                      <a className="dangerButton iconOnlyButton" href={`#delete-${booking.id}`} title="Xóa booking" aria-label={`Xóa ${booking.code}`}>
                        <Trash2 size={14} />
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
              {bookings.length === 0 ? (
                <tr>
                  <td colSpan={12} className="tableEmptyState">Chưa có booking. Hãy tạo booking từ popup thêm mới.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {page > 1 || hasNextPage ? (
          <div className="modalActions">
            {page > 1 ? <a className="secondaryButton" href={`/bookings?page=${page - 1}`}>Trang trước</a> : <span />}
            {hasNextPage ? <a className="secondaryButton" href={`/bookings?page=${page + 1}`}>Trang sau</a> : null}
          </div>
        ) : null}
      </section>

      <BookingModal id="create-booking" title="Tạo booking" icon={<Plus size={18} />}>
        <BookingForm tourPrograms={tourPrograms} action={createBooking} submitLabel="Tạo booking" />
      </BookingModal>
      {bookings.map((booking) => (
        <BookingModal id={`edit-${booking.id}`} title={`Sửa ${booking.code}`} icon={<Pencil size={18} />} key={`edit-${booking.id}`}>
          <BookingForm tourPrograms={tourPrograms} booking={booking} action={updateBooking} submitLabel="Lưu booking" />
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
      <a href={modalCloseHref()} className="hashModalBackdrop" aria-label="Đóng modal" />
      <div className="hashModalPanel hashModalWide">
        <div className="hashModalHeader">
          <h2>{icon} {title}</h2>
          <a className="secondaryButton iconOnlyButton" href={modalCloseHref()} aria-label="Đóng"><X size={14} /></a>
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
  const readyTourPrograms = tourPrograms.filter(isTourProgramReadyForBooking);
  const selectedTourProgram = tourPrograms.find((tour) => tour.id === selectedTourProgramId);
  const selectedTourIsReady = selectedTourProgram ? isTourProgramReadyForBooking(selectedTourProgram) : true;
  const canSubmit = tourPrograms.length > 0 && (booking ? selectedTourIsReady : readyTourPrograms.length > 0);

  return (
    <form action={action} className="modalFormStack">
      {booking ? <input type="hidden" name="id" value={booking.id} /> : null}
      {tourPrograms.length === 0 ? (
        <div className="supplierNotice supplierNoticeError">
          <AlertTriangle size={16} /> Chưa tải được tour mẫu. Kiểm tra lỗi ở đầu trang trước khi tạo booking.
        </div>
      ) : null}
      {tourPrograms.length > 0 && readyTourPrograms.length === 0 ? (
        <div className="supplierNotice supplierNoticeError">
          <AlertTriangle size={16} /> Chưa có tour mẫu nào đủ lịch trình. Hãy vào Tour mẫu và tạo đủ ngày lịch trình trước khi tạo booking.
        </div>
      ) : null}
      {booking && selectedTourProgram && !selectedTourIsReady ? (
        <div className="supplierNotice supplierNoticeError">
          <AlertTriangle size={16} /> Tour mẫu đang chọn còn thiếu ngày {missingItineraryDays(selectedTourProgram).join(', ')}. Cần bổ sung lịch trình trước khi lưu booking.
        </div>
      ) : null}

      <fieldset>
        <legend>Thông tin booking</legend>
        <div className="supplierFieldGrid">
          <label>
            Mã booking
            <input name="code" defaultValue={booking?.code || ''} placeholder="BK-2026-0001" required minLength={2} />
          </label>
          {booking ? (
            <label>
              Trạng thái hiện tại
              <input value={viStatus(booking.status)} readOnly />
            </label>
          ) : null}
        </div>
      </fieldset>

      <fieldset>
        <legend>Tour mẫu</legend>
        <label>
          Tour mẫu
          <select name="tourProgramId" defaultValue={selectedTourProgramId} required disabled={tourPrograms.length === 0}>
            <option value="">Chọn tour mẫu</option>
            {booking && !hasSelectedTour ? <option value={booking.tourProgram.id}>{booking.tourProgram.code} - {booking.tourProgram.name}</option> : null}
            {tourPrograms.map((tour) => (
              <option value={tour.id} key={tour.id} disabled={!isTourProgramReadyForBooking(tour)}>
                {tourProgramBookingLabel(tour)}
              </option>
            ))}
          </select>
        </label>
      </fieldset>

      <fieldset>
        <legend>Khách hàng</legend>
        <div className="supplierFieldGrid">
          <label>
            Tên khách/đoàn
            <input name="customerName" defaultValue={booking?.customerName || ''} placeholder="Công ty ABC" required minLength={2} maxLength={180} pattern={bookingSafeTextPattern} />
          </label>
          <label>
            Pax
            <input name="paxCount" type="number" min={1} step={1} defaultValue={booking?.paxCount || 1} required />
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend>Phân công</legend>
        <div className="supplierFieldGrid">
          <label>
            Sale phụ trách
            <input name="saleOwner" defaultValue={booking?.saleOwner || ''} placeholder="Tên nhân sự sale" minLength={2} maxLength={120} pattern={bookingSafeTextPattern} />
          </label>
          <label>
            Điều hành phụ trách
            <input name="operatorOwner" defaultValue={booking?.operatorOwner || ''} placeholder="Tên nhân sự điều hành" minLength={2} maxLength={120} pattern={bookingSafeTextPattern} />
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend>Giá trị</legend>
        <div className="supplierFieldGrid">
          <label>
            Ngày khởi hành
            <input name="startDate" type="date" defaultValue={toDateInputValue(booking?.startDate)} required />
          </label>
          <label>
            Ngày kết thúc
            <input name="endDate" type="date" defaultValue={toDateInputValue(booking?.endDate)} required />
          </label>
          <label>
            Giá bán tổng
            <input name="totalSellPrice" type="number" min={0} step={1} defaultValue={Number(booking?.totalSellPrice || 0)} />
          </label>
        </div>
      </fieldset>

      <div className="modalActions">
        <a className="secondaryButton" href={modalCloseHref()}>Hủy</a>
        <button type="submit" disabled={!canSubmit}><Save size={14} /> {submitLabel}</button>
      </div>
    </form>
  );
}

function StatusBookingModal({ booking }: { booking: Booking }) {
  return (
    <div id={`status-${booking.id}`} className="hashModal">
      <a href={modalCloseHref()} className="hashModalBackdrop" aria-label="Đóng modal" />
      <div className="hashModalPanel">
        <div className="hashModalHeader">
          <h2><ClipboardCheck size={18} /> Cập nhật trạng thái</h2>
          <a className="secondaryButton iconOnlyButton" href={modalCloseHref()} aria-label="Đóng"><X size={14} /></a>
        </div>
        <form action={updateBookingStatus} className="modalFormStack">
          <input type="hidden" name="id" value={booking.id} />
          <fieldset>
            <legend>{booking.code}</legend>
            <label>
              Trạng thái
              <select name="status" defaultValue={validBookingStatuses.has(booking.status) ? booking.status : 'DRAFT'}>
                {bookingStatusOptions.map((status: BookingStatus) => (
                  <option value={status} key={status}>{viStatus(status)}</option>
                ))}
              </select>
            </label>
          </fieldset>
          <div className="modalActions">
            <a className="secondaryButton" href={modalCloseHref()}>Hủy</a>
            <button type="submit"><Save size={14} /> Cập nhật trạng thái</button>
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
      <a href={modalCloseHref()} className="hashModalBackdrop" aria-label="Đóng modal" />
      <div className="hashModalPanel">
        <div className="hashModalHeader">
          <h2><AlertTriangle size={18} /> Xóa booking</h2>
          <a className="secondaryButton iconOnlyButton" href={modalCloseHref()} aria-label="Đóng"><X size={14} /></a>
        </div>
        <div className="supplierDeleteWarning">
          <strong>{booking.code} - {booking.customerName}</strong>
          {blocked ? (
            <p>Booking này đã phát sinh phiếu điều hành ({viStatus(booking.operationForm?.status)}), không thể xóa trực tiếp từ danh sách.</p>
          ) : (
            <p>Hệ thống sẽ kiểm tra phiếu điều hành, phiếu dịch vụ và khóa allotment liên quan trước khi xóa.</p>
          )}
        </div>
        {blocked ? (
          <div className="modalActions">
            <a className="secondaryButton" href={modalCloseHref()}>Đóng</a>
          </div>
        ) : (
          <form action={deleteBooking} className="modalActions">
            <input type="hidden" name="id" value={booking.id} />
            <input type="hidden" name="code" value={booking.code} />
            <input type="hidden" name="hasOperationForm" value={booking.operationForm ? 'true' : 'false'} />
            <a className="secondaryButton" href={modalCloseHref()}>Hủy</a>
            <button type="submit" className="dangerButton"><Trash2 size={14} /> Xóa booking</button>
          </form>
        )}
      </div>
    </div>
  );
}

import type { ReactNode } from 'react';
import { AlertTriangle, CalendarDays, CheckCircle2, Map, Pencil, Plus, Route, Save, Trash2, Users, X } from 'lucide-react';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { serverAuthHeaders, serverAuthJsonHeaders } from '../serverAuth';

export const dynamic = 'force-dynamic';

type ItineraryDay = {
  id: string;
  dayNumber: number;
  title: string;
  description?: string | null;
};

type TourProgram = {
  id: string;
  code: string;
  name: string;
  route: string | null;
  durationDays: number;
  description: string | null;
  itineraryDays: ItineraryDay[];
  _count?: { bookings: number };
};

type TourProgramDetail = TourProgram & {
  bookings?: Array<{ id: string; code: string; customerName: string }>;
};

type ApiResult<T> = { data: T; error?: string };
type MutationResult = { ok: boolean; message: string };
type TourProgramsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};
type TourProgramPayload = {
  code: string;
  name: string;
  route: string;
  durationDays: number;
  description: string;
};
type ItineraryDayPayload = {
  dayNumber: number;
  title: string;
  description: string;
};

const apiBase = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/+$/, '');
const MAX_CODE_LENGTH = 50;
const MAX_NAME_LENGTH = 250;
const MAX_DURATION_DAYS = 60;
const MAX_ROUTE_LENGTH = 250;
const MAX_DESCRIPTION_LENGTH = 2000;

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
      console.error(`[TourProgramsPage] ${error}`);
      return { data: fallback, error };
    }
    return { data: await response.json() };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Không rõ lỗi';
    const detail = `${label}: ${message}`;
    console.error(`[TourProgramsPage] ${detail}`);
    return { data: fallback, error: detail };
  }
}

async function apiMutation(path: string, init: RequestInit, successMessage: string, failureLabel: string): Promise<MutationResult> {
  try {
    const response = await fetch(`${apiBase}/api${path}`, { cache: 'no-store', ...init });
    if (!response.ok) return { ok: false, message: `${failureLabel}: HTTP ${response.status} - ${await responseError(response)}` };
    revalidatePath('/tour-programs');
    return { ok: true, message: successMessage };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Không rõ lỗi';
    return { ok: false, message: `${failureLabel}: ${message}` };
  }
}

function redirectWithResult(result: MutationResult): never {
  const key = result.ok ? 'notice' : 'error';
  redirect(`/tour-programs?${key}=${encodeURIComponent(result.message)}`);
}

function singleParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function field(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function requiredText(formData: FormData, key: string, label: string, minLength = 1) {
  const value = field(formData, key);
  if (value.length < minLength) throw new Error(`${label} phải có tối thiểu ${minLength} ký tự.`);
  return value;
}

function boundedText(formData: FormData, key: string, label: string, maxLength: number) {
  const value = field(formData, key);
  if (value.length > maxLength) throw new Error(`${label} không được dài quá ${maxLength} ký tự.`);
  return value;
}

function integerField(formData: FormData, key: string, label: string, options: { min?: number; max?: number }) {
  const raw = field(formData, key);
  const value = Number(raw);
  if (!Number.isInteger(value)) throw new Error(`${label} phải là số nguyên hợp lệ.`);
  if (options.min !== undefined && value < options.min) throw new Error(`${label} không được nhỏ hơn ${options.min}.`);
  if (options.max !== undefined && value > options.max) throw new Error(`${label} không được lớn hơn ${options.max}.`);
  return value;
}

function tourProgramPayload(formData: FormData): TourProgramPayload {
  return {
    code: requiredText(formData, 'code', 'Mã tour', 2).toUpperCase(),
    name: requiredText(formData, 'name', 'Tên tour', 2),
    route: boundedText(formData, 'route', 'Tuyến điểm', MAX_ROUTE_LENGTH),
    durationDays: integerField(formData, 'durationDays', 'Số ngày', { min: 1, max: MAX_DURATION_DAYS }),
    description: boundedText(formData, 'description', 'Mô tả', MAX_DESCRIPTION_LENGTH),
  };
}

function itineraryDayPayload(formData: FormData): ItineraryDayPayload {
  return {
    dayNumber: integerField(formData, 'dayNumber', 'Ngày thứ', { min: 1, max: MAX_DURATION_DAYS }),
    title: requiredText(formData, 'title', 'Tiêu đề ngày', 2),
    description: boundedText(formData, 'description', 'Nội dung lịch trình', MAX_DESCRIPTION_LENGTH),
  };
}

function validationResult(error: unknown, label: string): MutationResult {
  const message = error instanceof Error ? error.message : 'Dữ liệu không hợp lệ.';
  return { ok: false, message: `${label}: ${message}` };
}

async function tourProgramDetail(id: string, label: string) {
  return apiGet<TourProgramDetail | null>(`/tour-programs/${encodeURIComponent(id)}`, null, label);
}

async function createTourProgram(formData: FormData) {
  'use server';
  let payload: TourProgramPayload;
  try {
    payload = tourProgramPayload(formData);
  } catch (error) {
    redirectWithResult(validationResult(error, 'Tạo tour mẫu thất bại'));
  }
  const result = await apiMutation(
    '/tour-programs',
    { method: 'POST', headers: await serverAuthJsonHeaders(), body: JSON.stringify(payload) },
    'Đã tạo tour mẫu.',
    'Tạo tour mẫu thất bại',
  );
  redirectWithResult(result);
}

async function updateTourProgram(formData: FormData) {
  'use server';
  const id = field(formData, 'id');
  if (!id) redirectWithResult({ ok: false, message: 'Sửa tour mẫu thất bại: thiếu ID tour mẫu.' });
  let payload: TourProgramPayload;
  try {
    payload = tourProgramPayload(formData);
  } catch (error) {
    redirectWithResult(validationResult(error, 'Sửa tour mẫu thất bại'));
  }

  const detailResult = await tourProgramDetail(id, 'Kiểm tra tour mẫu trước khi sửa');
  if (detailResult.error) redirectWithResult({ ok: false, message: `Sửa tour mẫu thất bại: ${detailResult.error}` });
  const current = detailResult.data;
  if (!current) redirectWithResult({ ok: false, message: 'Sửa tour mẫu thất bại: không tìm thấy tour mẫu.' });
  const bookingsCount = current.bookings?.length ?? current._count?.bookings ?? 0;
  const maxItineraryDay = Math.max(0, ...current.itineraryDays.map((day) => day.dayNumber));
  if (bookingsCount > 0 && payload.durationDays !== current.durationDays) {
    redirectWithResult({ ok: false, message: 'Sửa tour mẫu thất bại: tour đã có booking, không thể đổi số ngày.' });
  }
  if (maxItineraryDay > payload.durationDays) {
    redirectWithResult({ ok: false, message: `Sửa tour mẫu thất bại: lịch trình đã có ngày ${maxItineraryDay}, không thể đặt số ngày nhỏ hơn.` });
  }

  const result = await apiMutation(
    `/tour-programs/${encodeURIComponent(id)}`,
    { method: 'PATCH', headers: await serverAuthJsonHeaders(), body: JSON.stringify(payload) },
    'Đã cập nhật tour mẫu.',
    'Sửa tour mẫu thất bại',
  );
  redirectWithResult(result);
}

async function deleteTourProgram(formData: FormData) {
  'use server';
  const id = field(formData, 'id');
  const code = field(formData, 'code') || 'tour mẫu';
  if (!id) redirectWithResult({ ok: false, message: 'Xóa tour mẫu thất bại: thiếu ID tour mẫu.' });
  const detailResult = await tourProgramDetail(id, 'Kiểm tra dữ liệu liên quan trước khi xóa');
  if (detailResult.error) redirectWithResult({ ok: false, message: `Xóa ${code} thất bại: ${detailResult.error}` });
  const detail = detailResult.data;
  if (!detail) redirectWithResult({ ok: false, message: `Xóa ${code} thất bại: không tìm thấy tour mẫu.` });
  const bookingsCount = detail.bookings?.length ?? detail._count?.bookings ?? Number(field(formData, 'bookingCount') || 0);
  if (bookingsCount > 0) redirectWithResult({ ok: false, message: `Xóa ${code} thất bại: tour mẫu đã có ${bookingsCount} booking.` });
  if (detail.itineraryDays.length > 0) redirectWithResult({ ok: false, message: `Xóa ${code} thất bại: tour mẫu còn ${detail.itineraryDays.length} ngày lịch trình.` });

  const result = await apiMutation(
    `/tour-programs/${encodeURIComponent(id)}`,
    { method: 'DELETE', headers: await serverAuthHeaders() },
    `Đã xóa ${code}.`,
    `Xóa ${code} thất bại`,
  );
  redirectWithResult(result);
}

async function createItineraryDay(formData: FormData) {
  'use server';
  const tourProgramId = field(formData, 'tourProgramId');
  if (!tourProgramId) redirectWithResult({ ok: false, message: 'Tạo ngày lịch trình thất bại: cần chọn tour mẫu.' });
  let payload: ItineraryDayPayload;
  try {
    payload = itineraryDayPayload(formData);
  } catch (error) {
    redirectWithResult(validationResult(error, 'Tạo ngày lịch trình thất bại'));
  }

  const detailResult = await tourProgramDetail(tourProgramId, 'Kiểm tra tour mẫu trước khi thêm ngày lịch trình');
  if (detailResult.error) redirectWithResult({ ok: false, message: `Tạo ngày lịch trình thất bại: ${detailResult.error}` });
  const tour = detailResult.data;
  if (!tour) redirectWithResult({ ok: false, message: 'Tạo ngày lịch trình thất bại: không tìm thấy tour mẫu.' });
  if (payload.dayNumber > tour.durationDays) {
    redirectWithResult({ ok: false, message: `Tạo ngày lịch trình thất bại: tour mẫu chỉ có ${tour.durationDays} ngày.` });
  }
  if (tour.itineraryDays.some((day) => day.dayNumber === payload.dayNumber)) {
    redirectWithResult({ ok: false, message: `Tạo ngày lịch trình thất bại: ngày ${payload.dayNumber} đã tồn tại trong tour mẫu này.` });
  }

  const result = await apiMutation(
    `/tour-programs/${encodeURIComponent(tourProgramId)}/itinerary-days`,
    { method: 'POST', headers: await serverAuthJsonHeaders(), body: JSON.stringify(payload) },
    'Đã tạo ngày lịch trình.',
    'Tạo ngày lịch trình thất bại',
  );
  redirectWithResult(result);
}

function modalCloseHref() {
  return '/tour-programs';
}

function itineraryPreview(days: ItineraryDay[]) {
  return [...days].sort((left, right) => left.dayNumber - right.dayNumber).slice(0, 3);
}

export default async function TourProgramsPage({ searchParams }: TourProgramsPageProps) {
  const params = searchParams ? await searchParams : {};
  const notice = singleParam(params.notice);
  const error = singleParam(params.error);
  const tourProgramsResult = await apiGet<TourProgram[]>('/tour-programs', [], 'Tải danh sách tour mẫu');
  const tourPrograms = tourProgramsResult.data;
  const loadErrors = [tourProgramsResult.error].filter(Boolean);

  return (
    <section className="workspace">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">Thiết lập sản phẩm vận hành</p>
          <h1>Tour mẫu và lịch trình</h1>
        </div>
        <div className="pageHeaderActions">
          <a className="secondaryButton iconTextButton" href="#create-tour-program"><Plus size={16} /> Thêm tour mẫu</a>
          <a className="secondaryButton iconTextButton" href="#create-itinerary-day"><CalendarDays size={16} /> Thêm ngày</a>
          <span className="statusPill"><Users size={14} /> Nhân sự vận hành</span>
          <span className="statusPill statusPillNeutral">Lõi tour</span>
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
          <h2>Danh sách tour mẫu</h2>
          <span>{tourPrograms.length} tour</span>
        </div>
        {tourPrograms.length === 0 ? (
          <div className="tableEmptyState"><Map size={20} /> Chưa có tour mẫu. Hãy tạo tour đầu tiên để tiếp tục luồng booking và điều hành.</div>
        ) : (
          <div className="fitTableWrap tourProgramTableWrap">
            <table className="fitTable orderListTable tourProgramTable">
              <thead>
                <tr>
                  <th>Mã / số ngày</th>
                  <th>Tên tour</th>
                  <th>Tuyến điểm</th>
                  <th>Lịch trình</th>
                  <th>Booking</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {tourPrograms.map((tour) => {
                  const previewDays = itineraryPreview(tour.itineraryDays);
                  const remainingDays = Math.max(0, tour.itineraryDays.length - previewDays.length);

                  return (
                    <tr key={tour.id}>
                      <td>
                        <div className="tourProgramCodeCell">
                          <span className="codeBadge">{tour.code}</span>
                          <span>{tour.durationDays} ngày</span>
                        </div>
                      </td>
                      <td>
                        <div className="tourProgramNameCell">
                          <strong>{tour.name}</strong>
                          {tour.description ? <span>{tour.description}</span> : <span className="mutedText">Chưa có mô tả</span>}
                        </div>
                      </td>
                      <td>
                        {tour.route ? (
                          <span className="tourProgramRoute"><Route size={14} /> {tour.route}</span>
                        ) : <span className="mutedText">Chưa có tuyến điểm</span>}
                      </td>
                      <td>
                        {previewDays.length > 0 ? (
                          <div className="tourProgramItinerary">
                            {previewDays.map((day) => (
                              <span
                                className="tourProgramDayPill"
                                key={day.id}
                                title={day.description ? `${day.title} - ${day.description}` : day.title}
                              >
                                <strong>Ngày {day.dayNumber}</strong>
                                <span>{day.title}</span>
                              </span>
                            ))}
                            {remainingDays > 0 ? <span className="tourProgramMoreDays">+{remainingDays} ngày</span> : null}
                          </div>
                        ) : <span className="mutedText">Chưa có lịch trình</span>}
                      </td>
                      <td><span className={tour._count?.bookings ? 'statusPill statusPillWarning' : 'statusPill statusPillNeutral'}>{tour._count?.bookings ?? 0} booking</span></td>
                      <td className="actionsCell">
                        <div className="tourProgramRowActions">
                          <a className="secondaryButton iconTextButton" href={`#add-day-${tour.id}`} title="Thêm ngày" aria-label={`Thêm ngày cho ${tour.code}`}>
                            <CalendarDays size={14} /> Thêm ngày
                          </a>
                          <a className="secondaryButton iconOnlyButton" href={`#edit-${tour.id}`} title="Sửa tour mẫu" aria-label={`Sửa ${tour.code}`}>
                            <Pencil size={14} />
                          </a>
                          <a className="dangerButton iconOnlyButton" href={`#delete-${tour.id}`} title="Xóa tour mẫu" aria-label={`Xóa ${tour.code}`}>
                            <Trash2 size={14} />
                          </a>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <TourProgramModal id="create-tour-program" title="Tạo tour mẫu" icon={<Plus size={18} />}>
        <TourProgramForm action={createTourProgram} submitLabel="Tạo tour mẫu" />
      </TourProgramModal>

      <TourProgramModal id="create-itinerary-day" title="Tạo ngày lịch trình" icon={<CalendarDays size={18} />}>
        <ItineraryDayForm tourPrograms={tourPrograms} action={createItineraryDay} />
      </TourProgramModal>

      {tourPrograms.map((tour) => (
        <TourProgramModal id={`add-day-${tour.id}`} title={`Tạo ngày lịch trình - ${tour.code}`} icon={<CalendarDays size={18} />} key={`add-day-${tour.id}`}>
          <ItineraryDayForm tourPrograms={tourPrograms} selectedTourProgram={tour} action={createItineraryDay} />
        </TourProgramModal>
      ))}

      {tourPrograms.map((tour) => (
        <TourProgramModal id={`edit-${tour.id}`} title={`Sửa tour mẫu - ${tour.code}`} icon={<Pencil size={18} />} key={`edit-${tour.id}`}>
          <TourProgramForm tourProgram={tour} action={updateTourProgram} submitLabel="Lưu tour mẫu" />
        </TourProgramModal>
      ))}

      {tourPrograms.map((tour) => (
        <DeleteTourProgramModal tourProgram={tour} key={`delete-${tour.id}`} />
      ))}
    </section>
  );
}

function TourProgramModal({ id, title, icon, children }: { id: string; title: string; icon: ReactNode; children: ReactNode }) {
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

function TourProgramForm({
  tourProgram,
  action,
  submitLabel,
}: {
  tourProgram?: TourProgram;
  action: (formData: FormData) => Promise<void>;
  submitLabel: string;
}) {
  return (
    <form action={action} className="modalFormStack">
      {tourProgram ? <input type="hidden" name="id" value={tourProgram.id} /> : null}
      <fieldset>
        <legend>Thông tin chung</legend>
        <div className="supplierFieldGrid">
          <label>
            Mã tour
            <input name="code" placeholder="HL-3N2D" defaultValue={tourProgram?.code || ''} required minLength={2} maxLength={MAX_CODE_LENGTH} />
          </label>
          <label>
            Tên tour
            <input name="name" placeholder="Hạ Long 3 ngày 2 đêm" defaultValue={tourProgram?.name || ''} required minLength={2} maxLength={MAX_NAME_LENGTH} />
          </label>
          <label>
            Số ngày
            <input name="durationDays" type="number" min={1} max={MAX_DURATION_DAYS} step={1} defaultValue={tourProgram?.durationDays || 3} required />
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend>Tuyến điểm</legend>
        <label>
          Tuyến điểm
          <input name="route" placeholder="Hà Nội - Hạ Long" defaultValue={tourProgram?.route || ''} maxLength={MAX_ROUTE_LENGTH} />
        </label>
      </fieldset>

      <fieldset>
        <legend>Lịch trình</legend>
        <label>
          Mô tả
          <textarea name="description" rows={4} defaultValue={tourProgram?.description || ''} maxLength={MAX_DESCRIPTION_LENGTH} />
        </label>
      </fieldset>

      <div className="modalActions">
        <a className="secondaryButton" href={modalCloseHref()}>Hủy</a>
        <button type="submit"><Save size={14} /> {submitLabel}</button>
      </div>
    </form>
  );
}

function ItineraryDayForm({
  tourPrograms,
  selectedTourProgram,
  action,
}: {
  tourPrograms: TourProgram[];
  selectedTourProgram?: TourProgram;
  action: (formData: FormData) => Promise<void>;
}) {
  const selectedId = selectedTourProgram?.id || '';
  const defaultDayNumber = selectedTourProgram ? nextItineraryDayNumber(selectedTourProgram) : 1;
  return (
    <form action={action} className="modalFormStack">
      {tourPrograms.length === 0 ? (
        <div className="supplierNotice supplierNoticeError">
          <AlertTriangle size={16} /> Chưa tải được tour mẫu. Kiểm tra lỗi ở đầu trang trước khi tạo ngày lịch trình.
        </div>
      ) : null}
      <fieldset>
        <legend>Tour mẫu</legend>
        <label>
          Tour mẫu
          <select name="tourProgramId" required defaultValue={selectedId} disabled={Boolean(selectedTourProgram) || tourPrograms.length === 0}>
            <option value="">Chọn tour mẫu</option>
            {tourPrograms.map((tour) => (
              <option value={tour.id} key={tour.id}>{tour.code} - {tour.name}</option>
            ))}
          </select>
        </label>
        {selectedTourProgram ? <input type="hidden" name="tourProgramId" value={selectedTourProgram.id} /> : null}
      </fieldset>

      <fieldset>
        <legend>Lịch trình</legend>
        <div className="supplierFieldGrid">
          <label>
            Ngày thứ
            <input name="dayNumber" type="number" min={1} max={selectedTourProgram?.durationDays || MAX_DURATION_DAYS} step={1} defaultValue={defaultDayNumber} required />
          </label>
          <label>
            Tiêu đề ngày
            <input name="title" placeholder="Hà Nội - Hạ Long" required minLength={2} />
          </label>
        </div>
        <label>
          Nội dung lịch trình
          <textarea name="description" rows={4} maxLength={MAX_DESCRIPTION_LENGTH} />
        </label>
      </fieldset>

      <div className="modalActions">
        <a className="secondaryButton" href={modalCloseHref()}>Hủy</a>
        <button type="submit" disabled={tourPrograms.length === 0}><Save size={14} /> Tạo ngày lịch trình</button>
      </div>
    </form>
  );
}

function DeleteTourProgramModal({ tourProgram }: { tourProgram: TourProgram }) {
  const bookingCount = tourProgram._count?.bookings ?? 0;
  const itineraryCount = tourProgram.itineraryDays.length;
  const blocked = bookingCount > 0 || itineraryCount > 0;
  return (
    <div id={`delete-${tourProgram.id}`} className="hashModal">
      <a href={modalCloseHref()} className="hashModalBackdrop" aria-label="Đóng modal" />
      <div className="hashModalPanel">
        <div className="hashModalHeader">
          <h2><AlertTriangle size={18} /> Xóa tour mẫu</h2>
          <a className="secondaryButton iconOnlyButton" href={modalCloseHref()} aria-label="Đóng"><X size={14} /></a>
        </div>
        <div className="supplierDeleteWarning">
          <strong>{tourProgram.code} - {tourProgram.name}</strong>
          {blocked ? (
            <p>Tour mẫu này đang có {bookingCount} booking và {itineraryCount} ngày lịch trình, không thể xóa trực tiếp.</p>
          ) : (
            <p>Hệ thống sẽ kiểm tra booking và lịch trình liên quan trước khi xóa.</p>
          )}
        </div>
        {blocked ? (
          <div className="modalActions">
            <a className="secondaryButton" href={modalCloseHref()}>Đóng</a>
          </div>
        ) : (
          <form action={deleteTourProgram} className="modalActions">
            <input type="hidden" name="id" value={tourProgram.id} />
            <input type="hidden" name="code" value={tourProgram.code} />
            <input type="hidden" name="bookingCount" value={bookingCount} />
            <a className="secondaryButton" href={modalCloseHref()}>Hủy</a>
            <button type="submit" className="dangerButton"><Trash2 size={14} /> Xóa tour mẫu</button>
          </form>
        )}
      </div>
    </div>
  );
}

function nextItineraryDayNumber(tourProgram: TourProgram) {
  const usedDays = new Set(tourProgram.itineraryDays.map((day) => day.dayNumber));
  for (let day = 1; day <= tourProgram.durationDays; day += 1) {
    if (!usedDays.has(day)) return day;
  }
  return Math.min(tourProgram.durationDays + 1, MAX_DURATION_DAYS);
}

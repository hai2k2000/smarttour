import { CalendarDays, Map, Pencil, Plus, Route, Save, Trash2, Users, X } from 'lucide-react';
import { revalidatePath } from 'next/cache';
import { serverAuthHeaders, serverAuthJsonHeaders } from '../serverAuth';

export const dynamic = 'force-dynamic';

type ItineraryDay = {
  id: string;
  dayNumber: number;
  title: string;
  description: string | null;
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

const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

async function apiGet<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${apiBase}/api${path}`, { cache: 'no-store', headers: await serverAuthHeaders() });
    if (!res.ok) return fallback;
    return res.json();
  } catch { return fallback; }
}

async function createTourProgram(formData: FormData) {
  'use server';
  await fetch(`${apiBase}/api/tour-programs`, {
    method: 'POST',
    headers: await serverAuthJsonHeaders(),
    body: JSON.stringify({
      code: String(formData.get('code') || ''),
      name: String(formData.get('name') || ''),
      route: String(formData.get('route') || ''),
      durationDays: Number(formData.get('durationDays') || 1),
      description: String(formData.get('description') || ''),
    }),
  });
  revalidatePath('/tour-programs');
}

async function updateTourProgram(formData: FormData) {
  'use server';
  const id = String(formData.get('id') || '');
  if (!id) return;
  await fetch(`${apiBase}/api/tour-programs/${id}`, {
    method: 'PATCH',
    headers: await serverAuthJsonHeaders(),
    body: JSON.stringify({
      code: String(formData.get('code') || ''),
      name: String(formData.get('name') || ''),
      route: String(formData.get('route') || ''),
      durationDays: Number(formData.get('durationDays') || 1),
      description: String(formData.get('description') || ''),
    }),
  });
  revalidatePath('/tour-programs');
}

async function deleteTourProgram(formData: FormData) {
  'use server';
  const id = String(formData.get('id') || '');
  if (!id) return;
  await fetch(`${apiBase}/api/tour-programs/${id}`, { method: 'DELETE', headers: await serverAuthHeaders() });
  revalidatePath('/tour-programs');
}

async function createItineraryDay(formData: FormData) {
  'use server';
  const tourProgramId = String(formData.get('tourProgramId') || '');
  await fetch(`${apiBase}/api/tour-programs/${tourProgramId}/itinerary-days`, {
    method: 'POST',
    headers: await serverAuthJsonHeaders(),
    body: JSON.stringify({
      dayNumber: Number(formData.get('dayNumber') || 1),
      title: String(formData.get('title') || ''),
      description: String(formData.get('description') || ''),
    }),
  });
  revalidatePath('/tour-programs');
}

export default async function TourProgramsPage() {
  const tourPrograms = await apiGet<TourProgram[]>('/tour-programs', []);

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
      <section className="panel listPanel">
        <div className="sectionHeader">
          <h2>Danh sách tour mẫu</h2>
          <span>{tourPrograms.length} tour</span>
        </div>
        {tourPrograms.length === 0 ? (
          <div className="tableEmptyState"><Map size={20} /> Chưa có tour mẫu. Hãy tạo tour đầu tiên để tiếp tục luồng booking và điều hành.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Mã</th><th>Tên tour</th><th>Tuyến điểm</th><th>Số ngày</th><th>Lịch trình</th><th>Booking</th><th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {tourPrograms.map((tour) => (
                <tr key={tour.id}>
                    <td><span className="codeBadge">{tour.code}</span></td>
                    <td>
                      <strong>{tour.name}</strong>
                      {tour.description ? <><br /><span className="mutedText">{tour.description}</span></> : null}
                    </td>
                    <td>{tour.route ? <><Route size={13} /> {tour.route}</> : <span className="mutedText">—</span>}</td>
                    <td>{tour.durationDays}N</td>
                    <td>
                      {tour.itineraryDays.length > 0 ? (
                        <div className="chips">
                          {tour.itineraryDays.map((d) => (
                            <span key={d.id}>Ngày {d.dayNumber}: {d.title}</span>
                          ))}
                        </div>
                      ) : <span className="mutedText">Chưa có lịch trình</span>}
                    </td>
                    <td>{tour._count?.bookings ?? 0} booking</td>
                    <td className="actionsCell">
                      <div className="rowActions">
                      <a className="secondaryButton iconButton" href={`#edit-${tour.id}`} title="Sửa tour mẫu"><Pencil size={14} /></a>
                      <form action={deleteTourProgram} style={{ display: 'inline' }}>
                        <input type="hidden" name="id" value={tour.id} />
                        <button type="submit" className="dangerButton" title="Xóa tour mẫu"><Trash2 size={14} /></button>
                      </form>
                      </div>
                    </td>
                  </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <section id="create-tour-program" className="hashModal">
        <a href="#" className="hashModalBackdrop" aria-label="Đóng"></a>
        <div className="hashModalPanel">
          <div className="hashModalHeader">
            <h2><Plus size={18} /> Tạo tour mẫu</h2>
            <a className="secondaryButton iconButton" href="#" title="Đóng"><X size={16} /></a>
          </div>
          <form action={createTourProgram} className="formStack">
            <label>Mã tour<input name="code" placeholder="HL-3N2D" required minLength={2} /></label>
            <label>Tên tour<input name="name" placeholder="Hạ Long 3 ngày 2 đêm" required minLength={2} /></label>
            <label>Tuyến điểm<input name="route" placeholder="Hà Nội - Hạ Long" /></label>
            <label>Số ngày<input name="durationDays" type="number" min={1} defaultValue={3} required /></label>
            <label>Mô tả<textarea name="description" rows={3} /></label>
            <button type="submit">Tạo tour mẫu</button>
          </form>
        </div>
      </section>

      <section id="create-itinerary-day" className="hashModal">
        <a href="#" className="hashModalBackdrop" aria-label="Đóng"></a>
        <div className="hashModalPanel">
          <div className="hashModalHeader">
            <h2><CalendarDays size={18} /> Thêm ngày lịch trình</h2>
            <a className="secondaryButton iconButton" href="#" title="Đóng"><X size={16} /></a>
          </div>
          <form action={createItineraryDay} className="formStack">
            <label>Tour mẫu
              <select name="tourProgramId" required>
                <option value="">Chọn tour</option>
                {tourPrograms.map((t) => (
                  <option value={t.id} key={t.id}>{t.code} - {t.name}</option>
                ))}
              </select>
            </label>
            <label>Ngày thứ<input name="dayNumber" type="number" min={1} defaultValue={1} required /></label>
            <label>Tiêu đề ngày<input name="title" placeholder="Hà Nội - Hạ Long" required minLength={2} /></label>
            <label>Nội dung lịch trình<textarea name="description" rows={4} /></label>
            <button type="submit">Thêm ngày lịch trình</button>
          </form>
        </div>
      </section>

      {tourPrograms.map((tour) => (
        <section id={`edit-${tour.id}`} className="hashModal" key={`edit-${tour.id}`}>
          <a href="#" className="hashModalBackdrop" aria-label="Đóng"></a>
          <div className="hashModalPanel">
            <div className="hashModalHeader">
              <h2><Pencil size={18} /> Sửa tour mẫu</h2>
              <a className="secondaryButton iconButton" href="#" title="Đóng"><X size={16} /></a>
            </div>
            <form action={updateTourProgram} className="bookingEditForm">
              <input type="hidden" name="id" value={tour.id} />
              <label>Mã tour<input name="code" defaultValue={tour.code} required minLength={2} /></label>
              <label>Tên tour<input name="name" defaultValue={tour.name} required minLength={2} /></label>
              <label>Tuyến điểm<input name="route" defaultValue={tour.route || ''} /></label>
              <label>Số ngày<input name="durationDays" type="number" min={1} defaultValue={tour.durationDays} required /></label>
              <label>Mô tả<textarea name="description" defaultValue={tour.description || ''} rows={2} /></label>
              <button type="submit"><Save size={14} /> Lưu</button>
            </form>
          </div>
        </section>
      ))}
    </section>
  );
}

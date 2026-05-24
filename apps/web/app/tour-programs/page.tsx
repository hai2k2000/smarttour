import { CalendarDays, Map, Plus, Route, Users } from 'lucide-react';
import { revalidatePath } from 'next/cache';
import Link from 'next/link';

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
    const response = await fetch(`${apiBase}/api${path}`, { cache: 'no-store' });
    if (!response.ok) return fallback;
    return response.json();
  } catch {
    return fallback;
  }
}

async function createTourProgram(formData: FormData) {
  'use server';
  await fetch(`${apiBase}/api/tour-programs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
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

async function createItineraryDay(formData: FormData) {
  'use server';
  const tourProgramId = String(formData.get('tourProgramId') || '');
  await fetch(`${apiBase}/api/tour-programs/${tourProgramId}/itinerary-days`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
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
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">SmartTour</div>
        <nav>
          <Link href="/">Dashboard van hanh</Link>
          <Link href="/suppliers">Nha cung cap</Link>
          <Link href="/tour-programs" className="active">Tour mau</Link>
          <Link href="/bookings">Booking tour</Link>
          <a>Phieu dieu hanh</a>
          <a>Chi phi tour</a>
          <a>Thanh toan NCC</a>
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Operation product setup</p>
            <h1>Tour mau va lich trinh</h1>
          </div>
          <div className="user"><Users size={18} /> Operator</div>
        </header>

        <section className="contentGrid tourProgramGrid">
          <div className="panel">
            <h2><Plus size={18} /> Tao tour mau</h2>
            <form action={createTourProgram} className="formStack">
              <label>
                Ma tour
                <input name="code" placeholder="HL-3N2D" required minLength={2} />
              </label>
              <label>
                Ten tour
                <input name="name" placeholder="Ha Long 3 ngay 2 dem" required minLength={2} />
              </label>
              <label>
                Tuyen diem
                <input name="route" placeholder="Ha Noi - Ha Long" />
              </label>
              <label>
                So ngay
                <input name="durationDays" type="number" min={1} defaultValue={3} required />
              </label>
              <label>
                Mo ta
                <textarea name="description" rows={4} />
              </label>
              <button type="submit">Tao tour mau</button>
            </form>
          </div>

          <div className="panel">
            <h2><CalendarDays size={18} /> Them ngay lich trinh</h2>
            <form action={createItineraryDay} className="formStack">
              <label>
                Tour mau
                <select name="tourProgramId" required>
                  <option value="">Chon tour</option>
                  {tourPrograms.map((tour) => (
                    <option value={tour.id} key={tour.id}>{tour.code} - {tour.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Ngay thu
                <input name="dayNumber" type="number" min={1} defaultValue={1} required />
              </label>
              <label>
                Tieu de ngay
                <input name="title" placeholder="Ha Noi - Ha Long" required minLength={2} />
              </label>
              <label>
                Noi dung lich trinh
                <textarea name="description" rows={5} />
              </label>
              <button type="submit">Them ngay lich trinh</button>
            </form>
          </div>
        </section>

        <section className="tourCards">
          {tourPrograms.map((tour) => (
            <article className="panel tourCard" key={tour.id}>
              <div className="tourCardHeader">
                <div>
                  <span className="codeBadge">{tour.code}</span>
                  <h2>{tour.name}</h2>
                </div>
                <strong>{tour.durationDays}N</strong>
              </div>
              <p className="muted"><Route size={15} /> {tour.route || 'Chua co tuyen diem'}</p>
              {tour.description ? <p>{tour.description}</p> : null}
              <div className="itineraryList">
                {tour.itineraryDays.map((day) => (
                  <div key={day.id} className="itineraryItem">
                    <span>Ngay {day.dayNumber}</span>
                    <div>
                      <strong>{day.title}</strong>
                      {day.description ? <p>{day.description}</p> : null}
                    </div>
                  </div>
                ))}
                {tour.itineraryDays.length === 0 ? <p className="muted"><Map size={15} /> Chua co lich trinh</p> : null}
              </div>
              <footer>{tour._count?.bookings ?? 0} booking su dung tour nay</footer>
            </article>
          ))}
          {tourPrograms.length === 0 ? (
            <section className="panel emptyState">Chua co tour mau. Hay tao tour dau tien de tiep tuc luong booking va dieu hanh.</section>
          ) : null}
        </section>
      </section>
    </main>
  );
}

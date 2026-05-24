import { CalendarDays, CircleDollarSign, Plus, Users } from 'lucide-react';
import { revalidatePath } from 'next/cache';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

type TourProgram = {
  id: string;
  code: string;
  name: string;
  durationDays: number;
};

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
  totalSellPrice: string;
  tourProgram: TourProgram;
  operationForm: { id: string; status: string } | null;
};

const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const moneyFormatter = new Intl.NumberFormat('vi-VN');
const dateFormatter = new Intl.DateTimeFormat('vi-VN');

async function apiGet<T>(path: string, fallback: T): Promise<T> {
  try {
    const response = await fetch(`${apiBase}/api${path}`, { cache: 'no-store' });
    if (!response.ok) return fallback;
    return response.json();
  } catch {
    return fallback;
  }
}

async function createBooking(formData: FormData) {
  'use server';
  await fetch(`${apiBase}/api/bookings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      code: String(formData.get('code') || ''),
      tourProgramId: String(formData.get('tourProgramId') || ''),
      customerName: String(formData.get('customerName') || ''),
      paxCount: Number(formData.get('paxCount') || 1),
      startDate: String(formData.get('startDate') || ''),
      endDate: String(formData.get('endDate') || ''),
      saleOwner: String(formData.get('saleOwner') || ''),
      operatorOwner: String(formData.get('operatorOwner') || ''),
      totalSellPrice: Number(formData.get('totalSellPrice') || 0),
    }),
  });
  revalidatePath('/bookings');
}

function formatDate(value: string) {
  return dateFormatter.format(new Date(value));
}

function formatMoney(value: string) {
  return moneyFormatter.format(Number(value || 0));
}

export default async function BookingsPage() {
  const [tourPrograms, bookings] = await Promise.all([
    apiGet<TourProgram[]>('/tour-programs', []),
    apiGet<Booking[]>('/bookings', []),
  ]);

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">SmartTour</div>
        <nav>
          <Link href="/">Dashboard van hanh</Link>
          <Link href="/suppliers">Nha cung cap</Link>
          <Link href="/tour-programs">Tour mau</Link>
          <Link href="/bookings" className="active">Booking tour</Link>
          <a>Phieu dieu hanh</a>
          <a>Chi phi tour</a>
          <a>Thanh toan NCC</a>
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Booking workflow</p>
            <h1>Booking tour</h1>
          </div>
          <div className="user"><Users size={18} /> Operator</div>
        </header>

        <section className="contentGrid bookingGrid">
          <div className="panel">
            <h2><Plus size={18} /> Tao booking</h2>
            <form action={createBooking} className="formGrid">
              <label>Ma booking<input name="code" placeholder="BK-2026-0001" required minLength={2} /></label>
              <label>Tour mau<select name="tourProgramId" required><option value="">Chon tour mau</option>{tourPrograms.map((tour) => (<option value={tour.id} key={tour.id}>{tour.code} - {tour.name}</option>))}</select></label>
              <label>Ten khach/doan<input name="customerName" placeholder="Cong ty ABC" required minLength={2} /></label>
              <label>So khach<input name="paxCount" type="number" min={1} defaultValue={1} required /></label>
              <label>Ngay khoi hanh<input name="startDate" type="date" required /></label>
              <label>Ngay ket thuc<input name="endDate" type="date" required /></label>
              <label>Sale phu trach<input name="saleOwner" /></label>
              <label>Dieu hanh phu trach<input name="operatorOwner" /></label>
              <label>Gia ban tong<input name="totalSellPrice" type="number" min={0} defaultValue={0} /></label>
              <button type="submit">Tao booking</button>
            </form>
          </div>

          <div className="panel bookingSummary">
            <h2><CalendarDays size={18} /> Tong quan</h2>
            <div className="summaryRows">
              <div><span>Tong booking</span><strong>{bookings.length}</strong></div>
              <div><span>Da xac nhan</span><strong>{bookings.filter((booking) => booking.status === 'CONFIRMED').length}</strong></div>
              <div><span>Dang van hanh</span><strong>{bookings.filter((booking) => booking.status === 'OPERATING').length}</strong></div>
              <div><span>Chua co phieu DH</span><strong>{bookings.filter((booking) => !booking.operationForm).length}</strong></div>
            </div>
          </div>
        </section>

        <section className="panel listPanel">
          <div className="sectionHeader"><h2>Danh sach booking</h2><span>{bookings.length} booking</span></div>
          <table>
            <thead><tr><th>Ma</th><th>Khach/doan</th><th>Tour</th><th>Ngay di</th><th>Pax</th><th>Phu trach</th><th>Gia ban</th><th>Trang thai</th></tr></thead>
            <tbody>
              {bookings.map((booking) => (
                <tr key={booking.id}>
                  <td>{booking.code}</td>
                  <td>{booking.customerName}</td>
                  <td>{booking.tourProgram.code}</td>
                  <td>{formatDate(booking.startDate)} - {formatDate(booking.endDate)}</td>
                  <td>{booking.paxCount}</td>
                  <td>{booking.operatorOwner || booking.saleOwner || '-'}</td>
                  <td><CircleDollarSign size={14} /> {formatMoney(booking.totalSellPrice)}</td>
                  <td><span className="statusPill">{booking.status}</span></td>
                </tr>
              ))}
              {bookings.length === 0 ? (<tr><td colSpan={8}>Chua co booking. Hay tao booking tu tour mau dau tien.</td></tr>) : null}
            </tbody>
          </table>
        </section>
      </section>
    </main>
  );
}

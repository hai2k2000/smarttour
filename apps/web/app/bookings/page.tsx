import { CircleDollarSign, Pencil, Plus, Save, Trash2, Users, X } from 'lucide-react';
import { revalidatePath } from 'next/cache';
import { serverAuthHeaders, serverAuthJsonHeaders } from '../serverAuth';

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
  totalSellPrice: string;
  tourProgram: TourProgram;
  operationForm: { id: string; status: string } | null;
};

const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const moneyFormatter = new Intl.NumberFormat('vi-VN');
const dateFormatter = new Intl.DateTimeFormat('vi-VN');
const bookingStatuses = ['DRAFT', 'CONFIRMED', 'OPERATING', 'COMPLETED', 'CANCELLED'];

async function apiGet<T>(path: string, fallback: T): Promise<T> {
  try {
    const response = await fetch(`${apiBase}/api${path}`, { cache: 'no-store', headers: await serverAuthHeaders() });
    if (!response.ok) return fallback;
    return response.json();
  } catch { return fallback; }
}

async function createBooking(formData: FormData) {
  'use server';
  await fetch(`${apiBase}/api/bookings`, {
    method: 'POST', headers: await serverAuthJsonHeaders(),
    body: JSON.stringify({
      code: String(formData.get('code') || ''), tourProgramId: String(formData.get('tourProgramId') || ''),
      customerName: String(formData.get('customerName') || ''), paxCount: Number(formData.get('paxCount') || 1),
      startDate: String(formData.get('startDate') || ''), endDate: String(formData.get('endDate') || ''),
      saleOwner: String(formData.get('saleOwner') || ''), operatorOwner: String(formData.get('operatorOwner') || ''),
      totalSellPrice: Number(formData.get('totalSellPrice') || 0),
    }),
  });
  revalidatePath('/bookings');
}

async function updateBooking(formData: FormData) {
  'use server';
  const id = String(formData.get('id') || '');
  if (!id) return;
  await fetch(`${apiBase}/api/bookings/${id}`, {
    method: 'PATCH', headers: await serverAuthJsonHeaders(),
    body: JSON.stringify({
      code: String(formData.get('code') || ''), tourProgramId: String(formData.get('tourProgramId') || ''),
      customerName: String(formData.get('customerName') || ''), paxCount: Number(formData.get('paxCount') || 1),
      startDate: String(formData.get('startDate') || ''), endDate: String(formData.get('endDate') || ''),
      saleOwner: String(formData.get('saleOwner') || ''), operatorOwner: String(formData.get('operatorOwner') || ''),
      totalSellPrice: Number(formData.get('totalSellPrice') || 0),
    }),
  });
  revalidatePath('/bookings');
}

async function updateBookingStatus(formData: FormData) {
  'use server';
  const id = String(formData.get('id') || '');
  if (!id) return;
  await fetch(`${apiBase}/api/bookings/${id}`, { method: 'PATCH', headers: await serverAuthJsonHeaders(), body: JSON.stringify({ status: String(formData.get('status') || 'DRAFT') }) });
  revalidatePath('/bookings');
}

async function deleteBooking(formData: FormData) {
  'use server';
  const id = String(formData.get('id') || '');
  if (!id) return;
  await fetch(`${apiBase}/api/bookings/${id}`, { method: 'DELETE', headers: await serverAuthHeaders() });
  revalidatePath('/bookings');
}

function formatDate(value: string) { return dateFormatter.format(new Date(value)); }
function formatMoney(value: string) { return moneyFormatter.format(Number(value || 0)); }
function toDateInputValue(value: string) { return new Date(value).toISOString().slice(0, 10); }

function BookingForm({ tourPrograms, booking }: { tourPrograms: TourProgram[]; booking?: Booking }) {
  return (
    <form action={booking ? updateBooking : createBooking} className="bookingEditForm">
      {booking ? <input type="hidden" name="id" value={booking.id} /> : null}
      <label>Mã booking<input name="code" defaultValue={booking?.code || ''} placeholder="BK-2026-0001" required minLength={2} /></label>
      <label>Tour mẫu<select name="tourProgramId" defaultValue={booking?.tourProgram.id || ''} required><option value="">Chọn tour mẫu</option>{tourPrograms.map((tour) => (<option value={tour.id} key={tour.id}>{tour.code} - {tour.name}</option>))}</select></label>
      <label>Tên khách/đoàn<input name="customerName" defaultValue={booking?.customerName || ''} placeholder="Công ty ABC" required minLength={2} /></label>
      <label>Số khách<input name="paxCount" type="number" min={1} defaultValue={booking?.paxCount || 1} required /></label>
      <label>Ngày khởi hành<input name="startDate" type="date" defaultValue={booking ? toDateInputValue(booking.startDate) : ''} required /></label>
      <label>Ngày kết thúc<input name="endDate" type="date" defaultValue={booking ? toDateInputValue(booking.endDate) : ''} required /></label>
      <label>Sale phụ trách<input name="saleOwner" defaultValue={booking?.saleOwner || ''} /></label>
      <label>Điều hành phụ trách<input name="operatorOwner" defaultValue={booking?.operatorOwner || ''} /></label>
      <label>Giá bán tổng<input name="totalSellPrice" type="number" min={0} defaultValue={Number(booking?.totalSellPrice || 0)} /></label>
      <button type="submit"><Save size={15} /> {booking ? 'Lưu booking' : 'Tạo booking'}</button>
    </form>
  );
}

export default async function BookingsPage() {
  const [tourPrograms, bookings] = await Promise.all([apiGet<TourProgram[]>('/tour-programs', []), apiGet<Booking[]>('/bookings', [])]);
  return (
    <section className="workspace">
      <header className="pageHeader">
        <div><p className="eyebrow">Quy trình booking</p><h1>Booking tour</h1></div>
        <div className="pageHeaderActions"><a className="secondaryButton iconTextButton" href="#create-booking"><Plus size={16} /> Thêm booking</a><span className="statusPill"><Users size={14} /> Nhân sự vận hành</span></div>
      </header>

      <section className="panel listPanel">
        <div className="sectionHeader"><h2>Danh sách booking</h2><span>{bookings.length} booking</span></div>
        <table className="bookingTable">
          <thead><tr><th>Mã</th><th>Khách/đoàn</th><th>Tour</th><th>Ngày đi</th><th>Pax</th><th>Phụ trách</th><th>Giá bán</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
          <tbody>
            {bookings.map((booking) => (
              <tr key={booking.id}>
                <td>{booking.code}</td><td>{booking.customerName}</td><td>{booking.tourProgram.code}</td><td>{formatDate(booking.startDate)} - {formatDate(booking.endDate)}</td><td>{booking.paxCount}</td><td>{booking.operatorOwner || booking.saleOwner || '-'}</td><td><CircleDollarSign size={14} /> {formatMoney(booking.totalSellPrice)}</td>
                <td><span className={`statusBadge status-${booking.status.toLowerCase()}`}>{booking.status}</span></td>
                <td className="actionsCell"><div className="rowActions"><a className="secondaryButton iconButton" href={`#status-${booking.id}`} title="Cập nhật trạng thái"><Save size={14} /></a><a className="secondaryButton iconButton" href={`#edit-${booking.id}`} title="Sửa booking"><Pencil size={14} /></a><form action={deleteBooking}><input type="hidden" name="id" value={booking.id} /><button type="submit" className="dangerButton" title="Xóa booking"><Trash2 size={14} /></button></form></div></td>
              </tr>
            ))}
            {bookings.length === 0 ? (<tr><td colSpan={9}>Chưa có booking. Hãy tạo booking từ popup thêm mới.</td></tr>) : null}
          </tbody>
        </table>
      </section>

      <section id="create-booking" className="hashModal"><a href="#" className="hashModalBackdrop" aria-label="Đóng"></a><div className="hashModalPanel hashModalWide"><div className="hashModalHeader"><h2><Plus size={18} /> Tạo booking</h2><a className="secondaryButton iconButton" href="#" title="Đóng"><X size={16} /></a></div><BookingForm tourPrograms={tourPrograms} /></div></section>
      {bookings.map((booking) => (
        <section id={`edit-${booking.id}`} className="hashModal" key={`edit-${booking.id}`}><a href="#" className="hashModalBackdrop" aria-label="Đóng"></a><div className="hashModalPanel hashModalWide"><div className="hashModalHeader"><h2><Pencil size={18} /> Sửa booking</h2><a className="secondaryButton iconButton" href="#" title="Đóng"><X size={16} /></a></div><BookingForm tourPrograms={tourPrograms} booking={booking} /></div></section>
      ))}
      {bookings.map((booking) => (
        <section id={`status-${booking.id}`} className="hashModal" key={`status-${booking.id}`}><a href="#" className="hashModalBackdrop" aria-label="Đóng"></a><div className="hashModalPanel"><div className="hashModalHeader"><h2>Cập nhật trạng thái</h2><a className="secondaryButton iconButton" href="#" title="Đóng"><X size={16} /></a></div><form action={updateBookingStatus} className="formStack"><input type="hidden" name="id" value={booking.id} /><label>Trạng thái<select name="status" defaultValue={booking.status}>{bookingStatuses.map((status) => (<option value={status} key={status}>{status}</option>))}</select></label><button type="submit"><Save size={15} /> Cập nhật</button></form></div></section>
      ))}
    </section>
  );
}

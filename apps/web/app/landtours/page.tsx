import { Boxes, FileText, Plus, Route, Save, Trash2, Users } from 'lucide-react';
import { revalidatePath } from 'next/cache';
import { Fragment } from 'react';
import { serverAuthHeaders, serverAuthJsonHeaders } from '../serverAuth';
import { viStatus } from '../i18n';

export const dynamic = 'force-dynamic';

type LandTour = {
  id: string;
  systemCode: string;
  tourCode: string;
  name: string | null;
  status: string;
  paymentStatus: string;
  startDate: string | null;
  endDate: string | null;
  route: string | null;
  operatorOwner: string | null;
  landTour: { comboType: string | null; guideName: string | null; autoTermsEnabled: boolean } | null;
  customers: { name: string }[];
  _count?: { services: number; terms: number };
};

const apiBase = process.env.NEXT_PUBLIC_API_URL || '';
const dateFormatter = new Intl.DateTimeFormat('vi-VN');

async function apiGet<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${apiBase}/api${path}`, { cache: 'no-store', headers: await serverAuthHeaders() });
    if (!res.ok) return fallback;
    return res.json();
  } catch { return fallback; }
}

async function createLandTour(formData: FormData) {
  'use server';
  await fetch(`${apiBase}/api/landtours`, {
    method: 'POST',
    headers: await serverAuthJsonHeaders(),
    body: JSON.stringify({
      systemCode: String(formData.get('systemCode') || ''),
      tourCode: String(formData.get('tourCode') || ''),
      name: String(formData.get('name') || ''),
      itinerarySummary: String(formData.get('itinerarySummary') || ''),
      marketGroup: String(formData.get('marketGroup') || ''),
      bookingDate: String(formData.get('bookingDate') || ''),
      paymentDueDate: String(formData.get('paymentDueDate') || ''),
      startDate: String(formData.get('startDate') || ''),
      endDate: String(formData.get('endDate') || ''),
      customerName: String(formData.get('customerName') || ''),
      operatorOwner: String(formData.get('operatorOwner') || ''),
      guideName: String(formData.get('guideName') || ''),
      comboType: String(formData.get('comboType') || ''),
      exchangeRateCode: String(formData.get('exchangeRateCode') || 'VND'),
      exchangeRate: Number(formData.get('exchangeRate') || 1),
      notes: String(formData.get('notes') || ''),
      termsVi: String(formData.get('termsVi') || ''),
      termsEn: String(formData.get('termsEn') || ''),
      autoTermsEnabled: formData.get('autoTermsEnabled') === 'on',
      smartLinkCode: String(formData.get('smartLinkCode') || ''),
      confirmationNote: String(formData.get('confirmationNote') || ''),
      salesServices: [{ serviceType: String(formData.get('salesServiceType') || 'Land'), description: String(formData.get('salesDescription') || ''), quantity: Number(formData.get('salesQuantity') || 1), unitPrice: Number(formData.get('salesUnitPrice') || 0), vat: Number(formData.get('salesVat') || 0) }],
      operationServices: [{ serviceType: String(formData.get('operationServiceType') || 'Land'), description: String(formData.get('operationDescription') || ''), quantity: Number(formData.get('operationQuantity') || 1), confirmedUnitPrice: Number(formData.get('operationUnitPrice') || 0), vat: Number(formData.get('operationVat') || 0), status: String(formData.get('operationStatus') || 'WAITING') }],
    }),
  });
  revalidatePath('/landtours');
}

async function updateLandTourStatus(formData: FormData) {
  'use server';
  const id = String(formData.get('id') || '');
  if (!id) return;
  await fetch(`${apiBase}/api/landtours/${id}`, {
    method: 'PATCH',
    headers: await serverAuthJsonHeaders(),
    body: JSON.stringify({ status: String(formData.get('status') || '') }),
  });
  revalidatePath('/landtours');
}

async function deleteLandTour(formData: FormData) {
  'use server';
  const id = String(formData.get('id') || '');
  if (!id) return;
  await fetch(`${apiBase}/api/landtours/${id}`, { method: 'DELETE', headers: await serverAuthHeaders() });
  revalidatePath('/landtours');
}

function formatDate(v: string | null) { return v ? dateFormatter.format(new Date(v)) : '—'; }

const tourStatuses = ['DRAFT', 'UPCOMING', 'RUNNING', 'COMPLETED', 'CANCELLED'];

export default async function LandToursPage() {
  const tours = await apiGet<LandTour[]>('/landtours', []);

  return (
    <section className="workspace">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">LandTour and Combo workflow</p>
          <h1>LandTour / Combo dịch vụ</h1>
        </div>
        <div className="pageHeaderActions">
          <span className="statusPill"><Boxes size={14} /> Combo</span>
          <span className="statusPill statusPillNeutral"><Users size={14} /> Nhân sự vận hành</span>
        </div>
      </header>

      <section className="contentGrid landGrid">
        <div className="panel">
          <h2><Plus size={18} /> Tạo LandTour / Combo</h2>
          <form action={createLandTour} className="formGrid landForm">
            <label>Mã hệ thống<input name="systemCode" placeholder="LAND-2026-0001" required minLength={2} /></label>
            <label>Mã tour<input name="tourCode" placeholder="LAND-DN-COMBO" required minLength={2} /></label>
            <label>Tên tour<input name="name" required minLength={2} /></label>
            <label>Lịch trình<input name="itinerarySummary" placeholder="Land + phòng + xe" /></label>
            <label>Nhóm thị trường<input name="marketGroup" /></label>
            <label>Ngày đặt<input name="bookingDate" type="date" /></label>
            <label>Ngày thanh toán<input name="paymentDueDate" type="date" /></label>
            <label>Ngày đi<input name="startDate" type="date" /></label>
            <label>Ngày về<input name="endDate" type="date" /></label>
            <label>Khách hàng<input name="customerName" required minLength={2} /></label>
            <label>NVDH<input name="operatorOwner" /></label>
            <label>Hướng dẫn viên<input name="guideName" /></label>
            <label>Loại combo<select name="comboType" defaultValue="Land + Hotel"><option>Land only</option><option>Land + Vé</option><option>Land + Phòng</option><option>Land + Xe</option><option>Land + Hotel</option><option>Combo du lịch</option></select></label>
            <label>Tỷ giá<select name="exchangeRateCode" defaultValue="VND"><option>VND</option><option>USD</option><option>EUR</option></select></label>
            <label>Giá trị tỷ giá<input name="exchangeRate" type="number" min={0} defaultValue={1} /></label>
            <label>Sales service<input name="salesServiceType" defaultValue="Land" /></label>
            <label>Diễn giải sales<input name="salesDescription" /></label>
            <label>SL sales<input name="salesQuantity" type="number" min={1} defaultValue={1} /></label>
            <label>Đơn giá sales<input name="salesUnitPrice" type="number" min={0} defaultValue={0} /></label>
            <label>VAT sales %<input name="salesVat" type="number" min={0} defaultValue={0} /></label>
            <label>Dịch vụ điều hành<input name="operationServiceType" defaultValue="Hotel" /></label>
            <label>Diễn giải operation<input name="operationDescription" /></label>
            <label>SL operation<input name="operationQuantity" type="number" min={1} defaultValue={1} /></label>
            <label>Giá xác nhận<input name="operationUnitPrice" type="number" min={0} defaultValue={0} /></label>
            <label>VAT operation %<input name="operationVat" type="number" min={0} defaultValue={0} /></label>
            <label>Trạng thái DV<select name="operationStatus" defaultValue="WAITING"><option>WAITING</option><option>REQUESTED</option><option>CONFIRMED</option><option>OPERATING</option><option>COMPLETED</option><option>CANCELLED</option></select></label>
            <label>SmartLink<input name="smartLinkCode" /></label>
            <label className="checkLine"><input name="autoTermsEnabled" type="checkbox" /> Điều khoản tự động</label>
            <label>Điều khoản VI<textarea name="termsVi" rows={2} /></label>
            <label>Điều khoản EN<textarea name="termsEn" rows={2} /></label>
            <label>Ghi chú<textarea name="notes" rows={2} /></label>
            <label>Ghi chú xác nhận<textarea name="confirmationNote" rows={2} /></label>
            <button type="submit">Tạo LandTour</button>
          </form>
        </div>

        <div className="panel landSummary">
          <h2>Tổng quan Land</h2>
          <div className="summaryRows">
            <div><span>Tổng LandTour</span><strong>{tours.length}</strong></div>
            <div><span>Sắp chạy</span><strong>{tours.filter((t) => t.status === 'UPCOMING').length}</strong></div>
            <div><span>Đang chạy</span><strong>{tours.filter((t) => t.status === 'RUNNING').length}</strong></div>
            <div><span>Có điều khoản</span><strong>{tours.filter((t) => (t._count?.terms ?? 0) > 0).length}</strong></div>
          </div>
        </div>
      </section>

      <section className="panel listPanel">
        <div className="sectionHeader">
          <h2>Danh sách LandTour / Combo</h2>
          <span>{tours.length} tour</span>
        </div>
        {tours.length === 0 ? (
          <div className="tableEmptyState"><Boxes size={20} /> Chưa có LandTour / Combo nào.</div>
        ) : (
          <table>
            <thead>
              <tr><th>Mã</th><th>Tour</th><th>Khách</th><th>Ngày đi</th><th>Loại combo</th><th>HDV</th><th>Trạng thái</th><th>DV / ĐK</th><th>Thao tác</th></tr>
            </thead>
            <tbody>
              {tours.map((tour) => (
                <Fragment key={tour.id}>
                  <tr>
                    <td><span className="codeBadge">{tour.systemCode}</span><br /><span className="mutedText">{tour.tourCode}</span></td>
                    <td><strong>{tour.name || '—'}</strong>{tour.route ? <><br /><span className="mutedText"><Route size={12} /> {tour.route}</span></> : null}</td>
                    <td>{tour.customers[0]?.name || '—'}</td>
                    <td>{formatDate(tour.startDate)} — {formatDate(tour.endDate)}</td>
                    <td>{tour.landTour?.comboType || '—'}</td>
                    <td>{tour.landTour?.guideName || '—'}</td>
                    <td>
                      <form action={updateLandTourStatus} className="inlineStatusForm">
                        <input type="hidden" name="id" value={tour.id} />
                        <select name="status" defaultValue={tour.status} aria-label="Trạng thái">
                          {tourStatuses.map((s) => <option key={s} value={s}>{viStatus(s)}</option>)}
                        </select>
                        <button type="submit" className="secondaryButton">Cập nhật</button>
                      </form>
                    </td>
                    <td>{tour._count?.services ?? 0} DV / <FileText size={12} /> {tour._count?.terms ?? 0} ĐK</td>
                    <td className="actionsCell">
                      <form action={deleteLandTour} style={{ display: 'inline' }}>
                        <input type="hidden" name="id" value={tour.id} />
                        <button type="submit" className="dangerButton" title="Xóa LandTour"><Trash2 size={14} /></button>
                      </form>
                    </td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </section>
  );
}

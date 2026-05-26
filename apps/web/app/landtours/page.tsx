import { Boxes, FileText, Plus, Route, Users } from 'lucide-react';
import { revalidatePath } from 'next/cache';
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
    const response = await fetch(`${apiBase}/api${path}`, { cache: 'no-store', headers: await serverAuthHeaders() });
    if (!response.ok) return fallback;
    return response.json();
  } catch {
    return fallback;
  }
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
      salesServices: [
        {
          serviceType: String(formData.get('salesServiceType') || 'Land'),
          description: String(formData.get('salesDescription') || ''),
          quantity: Number(formData.get('salesQuantity') || 1),
          unitPrice: Number(formData.get('salesUnitPrice') || 0),
          vat: Number(formData.get('salesVat') || 0),
        },
      ],
      operationServices: [
        {
          serviceType: String(formData.get('operationServiceType') || 'Land'),
          description: String(formData.get('operationDescription') || ''),
          quantity: Number(formData.get('operationQuantity') || 1),
          confirmedUnitPrice: Number(formData.get('operationUnitPrice') || 0),
          vat: Number(formData.get('operationVat') || 0),
          status: String(formData.get('operationStatus') || 'WAITING'),
        },
      ],
    }),
  });
  revalidatePath('/landtours');
}

function formatDate(value: string | null) {
  return value ? dateFormatter.format(new Date(value)) : '-';
}

export default async function LandToursPage() {
  const tours = await apiGet<LandTour[]>('/landtours', []);

  return (
    <section className="workspace">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">LandTour and Combo workflow</p>
          <h1>LandTour / Combo dich vu</h1>
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
              <label>Ma he thong<input name="systemCode" placeholder="LAND-2026-0001" required minLength={2} /></label>
              <label>Ma tour<input name="tourCode" placeholder="LAND-DN-COMBO" required minLength={2} /></label>
              <label>Ten tour<input name="name" required minLength={2} /></label>
              <label>Lịch trình<input name="itinerarySummary" placeholder="Land + phong + xe" /></label>
              <label>Nhom thi truong<input name="marketGroup" /></label>
              <label>Ngày đặt<input name="bookingDate" type="date" /></label>
              <label>Ngay thanh toán<input name="paymentDueDate" type="date" /></label>
              <label>Ngay di<input name="startDate" type="date" /></label>
              <label>Ngay ve<input name="endDate" type="date" /></label>
              <label>Khach hang<input name="customerName" required minLength={2} /></label>
              <label>NVDH<input name="operatorOwner" /></label>
              <label>Tour guide<input name="guideName" /></label>
              <label>Loai combo<select name="comboType" defaultValue="Land + Hotel"><option>Land only</option><option>Land + Ve</option><option>Land + Phong</option><option>Land + Xe</option><option>Land + Hotel</option><option>Combo du lich</option></select></label>
              <label>Ty gia<select name="exchangeRateCode" defaultValue="VND"><option>VND</option><option>USD</option><option>EUR</option></select></label>
              <label>Gia tri ty gia<input name="exchangeRate" type="number" min={0} defaultValue={1} /></label>
              <label>Sales service<input name="salesServiceType" defaultValue="Land" /></label>
              <label>Dien giai sales<input name="salesDescription" /></label>
              <label>SL sales<input name="salesQuantity" type="number" min={1} defaultValue={1} /></label>
              <label>Don gia sales<input name="salesUnitPrice" type="number" min={0} defaultValue={0} /></label>
              <label>VAT sales %<input name="salesVat" type="number" min={0} defaultValue={0} /></label>
              <label>Operation service<input name="operationServiceType" defaultValue="Hotel" /></label>
              <label>Dien giai operation<input name="operationDescription" /></label>
              <label>SL operation<input name="operationQuantity" type="number" min={1} defaultValue={1} /></label>
              <label>Gia xác nhận<input name="operationUnitPrice" type="number" min={0} defaultValue={0} /></label>
              <label>VAT operation %<input name="operationVat" type="number" min={0} defaultValue={0} /></label>
              <label>Trạng thái DV<select name="operationStatus" defaultValue="WAITING"><option>WAITING</option><option>REQUESTED</option><option>CONFIRMED</option><option>OPERATING</option><option>COMPLETED</option><option>CANCELLED</option></select></label>
              <label>SmartLink<input name="smartLinkCode" /></label>
              <label className="checkLine"><input name="autoTermsEnabled" type="checkbox" /> Dieu khoan tu dong</label>
              <label>Dieu khoan VI<textarea name="termsVi" rows={3} /></label>
              <label>Dieu khoan EN<textarea name="termsEn" rows={3} /></label>
              <label>Ghi chú<textarea name="notes" rows={3} /></label>
              <label>Ghi chú xác nhận<textarea name="confirmationNote" rows={3} /></label>
              <button type="submit">Tạo LandTour</button>
            </form>
          </div>

          <div className="panel landSummary">
            <h2><Route size={18} /> Tổng quan Land</h2>
            <div className="summaryRows">
              <div><span>Tong LandTour</span><strong>{tours.length}</strong></div>
              <div><span>Sap chay</span><strong>{tours.filter((tour) => tour.status === 'UPCOMING').length}</strong></div>
              <div><span>Đang chay</span><strong>{tours.filter((tour) => tour.status === 'RUNNING').length}</strong></div>
              <div><span>Co dieu khoan</span><strong>{tours.filter((tour) => (tour._count?.terms ?? 0) > 0).length}</strong></div>
            </div>
          </div>
        </section>

        <section className="panel listPanel">
          <div className="sectionHeader"><h2>Danh sach LandTour / Combo</h2><span>{tours.length} tour</span></div>
          <table>
            <thead><tr><th>Ma</th><th>Tour</th><th>Khach</th><th>Ngay di</th><th>Loai combo</th><th>Guide</th><th>Trạng thái</th><th>DV</th><th>DK</th></tr></thead>
            <tbody>
              {tours.map((tour) => (
                <tr key={tour.id}>
                  <td>{tour.systemCode}<br /><span className="mutedText">{tour.tourCode}</span></td>
                  <td>{tour.name || '-'}<br /><span className="mutedText">{tour.route || ''}</span></td>
                  <td>{tour.customers[0]?.name || '-'}</td>
                  <td>{formatDate(tour.startDate)} - {formatDate(tour.endDate)}</td>
                  <td>{tour.landTour?.comboType || '-'}</td>
                  <td>{tour.landTour?.guideName || '-'}</td>
                  <td><span className="statusPill">{viStatus(tour.status)}</span></td>
                  <td>{tour._count?.services ?? 0}</td>
                  <td><FileText size={14} /> {tour._count?.terms ?? 0}</td>
                </tr>
              ))}
              {tours.length === 0 ? <tr><td colSpan={9}>Chưa co LandTour / Combo.</td></tr> : null}
            </tbody>
          </table>
        </section>
    </section>
  );
}

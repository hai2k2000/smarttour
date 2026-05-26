import { BriefcaseBusiness, CircleDollarSign, Plus, Route, Users } from 'lucide-react';
import { revalidatePath } from 'next/cache';
import { serverAuthHeaders, serverAuthJsonHeaders } from '../serverAuth';

export const dynamic = 'force-dynamic';

type GitTour = {
  id: string;
  systemCode: string;
  tourCode: string;
  name: string | null;
  status: string;
  paymentStatus: string;
  startDate: string | null;
  endDate: string | null;
  operatorOwner: string | null;
  gitTour: { agentName: string | null; collaborator: string | null; commissionRate: string } | null;
  customers: { name: string }[];
  _count?: { revenues: number; services: number; costs: number };
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

async function createGitTour(formData: FormData) {
  'use server';
  await fetch(`${apiBase}/api/git-tours`, {
    method: 'POST',
    headers: await serverAuthJsonHeaders(),
    body: JSON.stringify({
      systemCode: String(formData.get('systemCode') || ''),
      tourCode: String(formData.get('tourCode') || ''),
      holdCode: String(formData.get('holdCode') || ''),
      name: String(formData.get('name') || ''),
      itinerarySummary: String(formData.get('itinerarySummary') || ''),
      marketGroup: String(formData.get('marketGroup') || ''),
      bookingDate: String(formData.get('bookingDate') || ''),
      paymentDueDate: String(formData.get('paymentDueDate') || ''),
      startDate: String(formData.get('startDate') || ''),
      endDate: String(formData.get('endDate') || ''),
      customerName: String(formData.get('customerName') || ''),
      agentName: String(formData.get('agentName') || ''),
      operatorOwner: String(formData.get('operatorOwner') || ''),
      collaborator: String(formData.get('collaborator') || ''),
      branch: String(formData.get('branch') || ''),
      department: String(formData.get('department') || ''),
      customerSource: String(formData.get('customerSource') || ''),
      commissionRate: Number(formData.get('commissionRate') || 0),
      invoiceStatus: String(formData.get('invoiceStatus') || ''),
      accountCode: String(formData.get('accountCode') || ''),
      exchangeRateCode: String(formData.get('exchangeRateCode') || 'VND'),
      exchangeRate: Number(formData.get('exchangeRate') || 1),
      notes: String(formData.get('notes') || ''),
      fileNote: String(formData.get('fileNote') || ''),
      revenues: [
        {
          description: String(formData.get('revenueDescription') || 'Doanh thu tour'),
          quantity: Number(formData.get('revenueQuantity') || 1),
          unitPrice: Number(formData.get('revenueUnitPrice') || 0),
          vat: Number(formData.get('revenueVat') || 0),
        },
      ],
      budgetServices: [
        {
          serviceType: String(formData.get('budgetServiceType') || 'Dich vu'),
          description: String(formData.get('budgetDescription') || ''),
          quantity: Number(formData.get('budgetQuantity') || 1),
          unitPrice: Number(formData.get('budgetUnitPrice') || 0),
          vat: Number(formData.get('budgetVat') || 0),
        },
      ],
    }),
  });
  revalidatePath('/git-tours');
}

function formatDate(value: string | null) {
  return value ? dateFormatter.format(new Date(value)) : '-';
}

export default async function GitToursPage() {
  const tours = await apiGet<GitTour[]>('/git-tours', []);

  return (
    <section className="workspace">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">GIT Tour core workflow</p>
          <h1>Tour doan thiet ke rieng</h1>
        </div>
        <div className="pageHeaderActions">
          <span className="statusPill"><BriefcaseBusiness size={14} /> GIT</span>
          <span className="statusPill statusPillNeutral"><Users size={14} /> Operator</span>
        </div>
      </header>

        <section className="contentGrid gitGrid">
          <div className="panel">
            <h2><Plus size={18} /> Tao tour GIT</h2>
            <form action={createGitTour} className="formGrid gitForm">
              <label>Ma he thong<input name="systemCode" placeholder="GIT-2026-0001" required minLength={2} /></label>
              <label>Ma tour<input name="tourCode" placeholder="GIT-HN-DN" required minLength={2} /></label>
              <label>Ma giu cho<input name="holdCode" /></label>
              <label>Ten tour<input name="name" required minLength={2} /></label>
              <label>Lich trinh<input name="itinerarySummary" placeholder="Ha Noi - Da Nang - Hoi An" /></label>
              <label>Nhom<input name="marketGroup" /></label>
              <label>Ngay dat<input name="bookingDate" type="date" /></label>
              <label>Ngay thanh toan<input name="paymentDueDate" type="date" /></label>
              <label>Ngay di<input name="startDate" type="date" /></label>
              <label>Ngay ve<input name="endDate" type="date" /></label>
              <label>Khach hang<input name="customerName" required minLength={2} /></label>
              <label>Dai ly<input name="agentName" /></label>
              <label>NVDH<input name="operatorOwner" /></label>
              <label>CTV<input name="collaborator" /></label>
              <label>Chi nhanh<input name="branch" /></label>
              <label>Phong ban<input name="department" /></label>
              <label>Nguon khach<input name="customerSource" /></label>
              <label>Hoa hong %<input name="commissionRate" type="number" min={0} defaultValue={0} /></label>
              <label>Hoa don<input name="invoiceStatus" /></label>
              <label>TK<input name="accountCode" /></label>
              <label>Ty gia<select name="exchangeRateCode" defaultValue="VND"><option>VND</option><option>USD</option><option>EUR</option></select></label>
              <label>Gia tri ty gia<input name="exchangeRate" type="number" min={0} defaultValue={1} /></label>
              <label>Noi dung doanh thu<input name="revenueDescription" defaultValue="Gia tour tron goi" /></label>
              <label>SL thu<input name="revenueQuantity" type="number" min={1} defaultValue={1} /></label>
              <label>Don gia thu<input name="revenueUnitPrice" type="number" min={0} defaultValue={0} /></label>
              <label>VAT thu %<input name="revenueVat" type="number" min={0} defaultValue={0} /></label>
              <label>Dich vu Sales<input name="budgetServiceType" defaultValue="Hotel" /></label>
              <label>Dien giai chi<input name="budgetDescription" /></label>
              <label>SL chi<input name="budgetQuantity" type="number" min={1} defaultValue={1} /></label>
              <label>Don gia chi<input name="budgetUnitPrice" type="number" min={0} defaultValue={0} /></label>
              <label>VAT chi %<input name="budgetVat" type="number" min={0} defaultValue={0} /></label>
              <label>Ghi chu<textarea name="notes" rows={3} /></label>
              <label>File/Ghi chu file<textarea name="fileNote" rows={3} /></label>
              <button type="submit">Tao tour GIT</button>
            </form>
          </div>

          <div className="panel gitSummary">
            <h2><Route size={18} /> Tong quan GIT</h2>
            <div className="summaryRows">
              <div><span>Tong GIT</span><strong>{tours.length}</strong></div>
              <div><span>Sap chay</span><strong>{tours.filter((tour) => tour.status === 'UPCOMING').length}</strong></div>
              <div><span>Dang chay</span><strong>{tours.filter((tour) => tour.status === 'RUNNING').length}</strong></div>
              <div><span>Chua thu het</span><strong>{tours.filter((tour) => tour.paymentStatus !== 'PAID').length}</strong></div>
            </div>
          </div>
        </section>

        <section className="panel listPanel">
          <div className="sectionHeader"><h2>Danh sach tour GIT</h2><span>{tours.length} tour</span></div>
          <table>
            <thead><tr><th>Ma</th><th>Tour</th><th>Khach/Dai ly</th><th>Ngay di</th><th>NVDH</th><th>Trang thai</th><th>Doanh thu</th><th>Dich vu</th></tr></thead>
            <tbody>
              {tours.map((tour) => (
                <tr key={tour.id}>
                  <td>{tour.systemCode}<br /><span className="mutedText">{tour.tourCode}</span></td>
                  <td>{tour.name || '-'}</td>
                  <td>{tour.customers[0]?.name || '-'}<br /><span className="mutedText">{tour.gitTour?.agentName || ''}</span></td>
                  <td>{formatDate(tour.startDate)} - {formatDate(tour.endDate)}</td>
                  <td>{tour.operatorOwner || '-'}</td>
                  <td><span className="statusPill">{tour.status}</span></td>
                  <td><CircleDollarSign size={14} /> {tour._count?.revenues ?? 0}</td>
                  <td>{tour._count?.services ?? 0}</td>
                </tr>
              ))}
              {tours.length === 0 ? <tr><td colSpan={8}>Chua co tour GIT.</td></tr> : null}
            </tbody>
          </table>
        </section>
    </section>
  );
}

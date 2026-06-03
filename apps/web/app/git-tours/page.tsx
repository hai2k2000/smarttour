import { BriefcaseBusiness, CircleDollarSign, Plus, Save, Trash2, Users, X } from 'lucide-react';
import { revalidatePath } from 'next/cache';
import { serverAuthHeaders, serverAuthJsonHeaders } from '../serverAuth';
import { viStatus } from '../i18n';

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
    const res = await fetch(`${apiBase}/api${path}`, { cache: 'no-store', headers: await serverAuthHeaders() });
    if (!res.ok) return fallback;
    return res.json();
  } catch { return fallback; }
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
      revenues: [{ description: String(formData.get('revenueDescription') || 'Doanh thu tour'), quantity: Number(formData.get('revenueQuantity') || 1), unitPrice: Number(formData.get('revenueUnitPrice') || 0), vat: Number(formData.get('revenueVat') || 0) }],
      budgetServices: [{ serviceType: String(formData.get('budgetServiceType') || 'Dịch vụ'), description: String(formData.get('budgetDescription') || ''), quantity: Number(formData.get('budgetQuantity') || 1), unitPrice: Number(formData.get('budgetUnitPrice') || 0), vat: Number(formData.get('budgetVat') || 0) }],
    }),
  });
  revalidatePath('/git-tours');
}

async function updateGitTourStatus(formData: FormData) {
  'use server';
  const id = String(formData.get('id') || '');
  if (!id) return;
  await fetch(`${apiBase}/api/git-tours/${id}`, {
    method: 'PATCH',
    headers: await serverAuthJsonHeaders(),
    body: JSON.stringify({ status: String(formData.get('status') || '') }),
  });
  revalidatePath('/git-tours');
}

async function deleteGitTour(formData: FormData) {
  'use server';
  const id = String(formData.get('id') || '');
  if (!id) return;
  await fetch(`${apiBase}/api/git-tours/${id}`, { method: 'DELETE', headers: await serverAuthHeaders() });
  revalidatePath('/git-tours');
}

function formatDate(v: string | null) { return v ? dateFormatter.format(new Date(v)) : '—'; }

function statusClass(s: string) {
  const m: Record<string, string> = { DRAFT: 'status-draft', UPCOMING: 'status-upcoming', RUNNING: 'status-running', COMPLETED: 'status-completed', CANCELLED: 'status-cancelled' };
  return m[s] || '';
}

const tourStatuses = ['DRAFT', 'UPCOMING', 'RUNNING', 'COMPLETED', 'CANCELLED'];

export default async function GitToursPage() {
  const tours = await apiGet<GitTour[]>('/git-tours', []);

  return (
    <section className="workspace">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">GIT Tour core workflow</p>
          <h1>Tour đoàn thiết kế riêng</h1>
        </div>
        <div className="pageHeaderActions">
          <a className="secondaryButton iconTextButton" href="#create-git-tour"><Plus size={16} /> Thêm tour GIT</a>
          <span className="statusPill"><BriefcaseBusiness size={14} /> GIT</span>
          <span className="statusPill statusPillNeutral"><Users size={14} /> Nhân sự vận hành</span>
        </div>
      </header>

      <section id="create-git-tour" className="hashModal"><a href="#" className="hashModalBackdrop" aria-label="Đóng"></a><div className="hashModalPanel hashModalWide"><div className="hashModalHeader">
          <h2><Plus size={18} /> Tạo tour GIT</h2><a className="secondaryButton iconButton" href="#" title="Đóng"><X size={16} /></a></div>
          <form action={createGitTour} className="formGrid gitForm">
            <label>Mã hệ thống<input name="systemCode" placeholder="GIT-2026-0001" required minLength={2} /></label>
            <label>Mã tour<input name="tourCode" placeholder="GIT-HN-DN" required minLength={2} /></label>
            <label>Mã giữ chỗ<input name="holdCode" /></label>
            <label>Tên tour<input name="name" required minLength={2} /></label>
            <label>Lịch trình<input name="itinerarySummary" placeholder="Hà Nội - Đà Nẵng - Hội An" /></label>
            <label>Nhóm<input name="marketGroup" /></label>
            <label>Ngày đặt<input name="bookingDate" type="date" /></label>
            <label>Ngày thanh toán<input name="paymentDueDate" type="date" /></label>
            <label>Ngày đi<input name="startDate" type="date" /></label>
            <label>Ngày về<input name="endDate" type="date" /></label>
            <label>Khách hàng<input name="customerName" required minLength={2} /></label>
            <label>Đại lý<input name="agentName" /></label>
            <label>NVDH<input name="operatorOwner" /></label>
            <label>CTV<input name="collaborator" /></label>
            <label>Chi nhánh<input name="branch" /></label>
            <label>Phòng ban<input name="department" /></label>
            <label>Nguồn khách<input name="customerSource" /></label>
            <label>Hoa hồng %<input name="commissionRate" type="number" min={0} defaultValue={0} /></label>
            <label>Hóa đơn<input name="invoiceStatus" /></label>
            <label>TK<input name="accountCode" /></label>
            <label>Tỷ giá<select name="exchangeRateCode" defaultValue="VND"><option>VND</option><option>USD</option><option>EUR</option></select></label>
            <label>Giá trị tỷ giá<input name="exchangeRate" type="number" min={0} defaultValue={1} /></label>
            <label>Nội dung doanh thu<input name="revenueDescription" defaultValue="Giá tour trọn gói" /></label>
            <label>SL thu<input name="revenueQuantity" type="number" min={1} defaultValue={1} /></label>
            <label>Đơn giá thu<input name="revenueUnitPrice" type="number" min={0} defaultValue={0} /></label>
            <label>VAT thu %<input name="revenueVat" type="number" min={0} defaultValue={0} /></label>
            <label>Dịch vụ Sales<input name="budgetServiceType" defaultValue="Hotel" /></label>
            <label>Diễn giải chi<input name="budgetDescription" /></label>
            <label>SL chi<input name="budgetQuantity" type="number" min={1} defaultValue={1} /></label>
            <label>Đơn giá chi<input name="budgetUnitPrice" type="number" min={0} defaultValue={0} /></label>
            <label>VAT chi %<input name="budgetVat" type="number" min={0} defaultValue={0} /></label>
            <label>Ghi chú<textarea name="notes" rows={2} /></label>
            <button type="submit">Tạo tour GIT</button>
          </form>
        </div></section>

      <section className="panel listPanel">
        <div className="sectionHeader">
          <h2>Danh sách tour GIT</h2>
          <span>{tours.length} tour</span>
        </div>
        {tours.length === 0 ? (
          <div className="tableEmptyState"><BriefcaseBusiness size={20} /> Chưa có tour GIT nào.</div>
        ) : (
          <table>
            <thead>
              <tr><th>Mã</th><th>Tour</th><th>Khách / Đại lý</th><th>Ngày đi</th><th>NVDH</th><th>Trạng thái</th><th>DT / DV</th><th>Thao tác</th></tr>
            </thead>
            <tbody>
              {tours.map((tour) => (
                <tr key={tour.id}>
                    <td><span className="codeBadge">{tour.systemCode}</span><br /><span className="mutedText">{tour.tourCode}</span></td>
                    <td><strong>{tour.name || '—'}</strong></td>
                    <td>{tour.customers[0]?.name || '—'}<br /><span className="mutedText">{tour.gitTour?.agentName || ''}</span></td>
                    <td>{formatDate(tour.startDate)} — {formatDate(tour.endDate)}</td>
                    <td>{tour.operatorOwner || '—'}</td>
                    <td>
                      <span className={`statusBadge ${statusClass(tour.status)}`}>{viStatus(tour.status)}</span>
                    </td>
                    <td><CircleDollarSign size={13} /> {tour._count?.revenues ?? 0} / {tour._count?.services ?? 0} DV</td>
                    <td className="actionsCell"><div className="rowActions"><a className="secondaryButton iconButton" href={`#status-${tour.id}`} title="Cập nhật trạng thái"><Save size={14} /></a><form action={deleteGitTour}>
                        <input type="hidden" name="id" value={tour.id} />
                        <button type="submit" className="dangerButton" title="Xóa tour GIT"><Trash2 size={14} /></button>
                      </form></div></td></tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      {tours.map((tour) => (
        <section id={`status-${tour.id}`} className="hashModal" key={`status-${tour.id}`}>
          <a href="#" className="hashModalBackdrop" aria-label="Đóng"></a>
          <div className="hashModalPanel">
            <div className="hashModalHeader"><h2>Cập nhật trạng thái GIT</h2><a className="secondaryButton iconButton" href="#" title="Đóng"><X size={16} /></a></div>
            <form action={updateGitTourStatus} className="formStack">
              <input type="hidden" name="id" value={tour.id} />
              <label>Trạng thái<select name="status" defaultValue={tour.status}>{tourStatuses.map((s) => <option key={s} value={s}>{viStatus(s)}</option>)}</select></label>
              <button type="submit"><Save size={15} /> Cập nhật</button>
            </form>
          </div>
        </section>
      ))}
    </section>
  );
}

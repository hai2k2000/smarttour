import { AlertTriangle, BriefcaseBusiness, CircleDollarSign, Copy, GitBranch, Plus, Save, Trash2, Users, X } from 'lucide-react';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { serverAuthHeaders, serverAuthJsonHeaders } from '../serverAuth';
import { serverApiBase } from '../serverApiBase';
import { viStatus } from '../i18n';
import { ServerPermissionNotice, hasPermission, type PermissionUser } from '../serverPermissions';

export const dynamic = 'force-dynamic';

type GitTour = {
  id: string;
  systemCode: string;
  tourCode: string;
  name: string | null;
  status: string;
  paymentStatus: string;
  workflowStep: string | null;
  startDate: string | null;
  endDate: string | null;
  operatorOwner: string | null;
  gitTour: { agentName: string | null; collaborator: string | null; commissionRate: string | null; invoiceStatus: string | null } | null;
  customers: { name: string }[];
  _count?: { revenues: number; services: number; costs: number };
};

const apiBase = serverApiBase();
const dateFormatter = new Intl.DateTimeFormat('vi-VN');
const tourStatuses = ['DRAFT', 'UPCOMING', 'RUNNING', 'COMPLETED', 'CANCELLED', 'SETTLED'];
const gitWorkflowSteps = ['GIT_INFO', 'GIT_COSTING', 'GIT_OPERATION', 'GIT_HANDOVER', 'GIT_SURVEY', 'GIT_COMPLETED'];
const paymentStatuses = ['UNPAID', 'PARTIAL', 'PAID'];
const invoiceStatuses = ['OPEN', 'REQUESTED', 'APPROVED', 'INVOICE', 'CLOSED'];

async function apiGet<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${apiBase}/api${path}`, { cache: 'no-store', headers: await serverAuthHeaders() });
    if (!res.ok) return fallback;
    return res.json();
  } catch { return fallback; }
}

async function apiErrorMessage(res: Response) {
  try {
    const body = await res.json();
    const message = Array.isArray(body?.message) ? body.message.join(', ') : body?.message;
    return String(message || body?.error || 'Thao tác tour GIT không thành công');
  } catch {
    return 'Thao tác tour GIT không thành công';
  }
}

function textField(formData: FormData, key: string) {
  return String(formData.get(key) || '').trim();
}

function numberField(formData: FormData, key: string, label: string, options: { min?: number; max?: number; fallback?: number } = {}) {
  const raw = textField(formData, key);
  if (!raw && options.fallback !== undefined) return options.fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${label} ph\u1ea3i l\u00e0 s\u1ed1 h\u1ee3p l\u1ec7.`);
  if (options.min !== undefined && value < options.min) throw new Error(`${label} kh\u00f4ng \u0111\u01b0\u1ee3c nh\u1ecf h\u01a1n ${options.min}.`);
  if (options.max !== undefined && value > options.max) throw new Error(`${label} kh\u00f4ng \u0111\u01b0\u1ee3c l\u1edbn h\u01a1n ${options.max}.`);
  return value;
}

function validationResult(error: unknown, label: string) {
  const message = error instanceof Error ? error.message : 'D\u1eef li\u1ec7u kh\u00f4ng h\u1ee3p l\u1ec7.';
  redirectWithState('error', `${label}: ${message}`);
}

function redirectWithState(type: 'notice' | 'error', message: string) {
  redirect(`/git-tours?${type}=${encodeURIComponent(message)}`);
}

async function createGitTour(formData: FormData) {
  'use server';
  let revenueUnitPrice = 0;
  let revenueQuantity = 1;
  let budgetUnitPrice = 0;
  let budgetQuantity = 1;
  let commissionRate = 0;
  let exchangeRate = 1;
  let revenueVat = 0;
  let budgetVat = 0;
  try {
    revenueUnitPrice = numberField(formData, 'revenueUnitPrice', '\u0110\u01a1n gi\u00e1 doanh thu', { min: 0 });
    revenueQuantity = numberField(formData, 'revenueQuantity', 'S\u1ed1 l\u01b0\u1ee3ng doanh thu', { min: 1, fallback: 1 });
    budgetUnitPrice = numberField(formData, 'budgetUnitPrice', '\u0110\u01a1n gi\u00e1 d\u1ecbch v\u1ee5', { min: 0 });
    budgetQuantity = numberField(formData, 'budgetQuantity', 'S\u1ed1 l\u01b0\u1ee3ng d\u1ecbch v\u1ee5', { min: 1, fallback: 1 });
    commissionRate = numberField(formData, 'commissionRate', 'T\u1ef7 l\u1ec7 hoa h\u1ed3ng', { min: 0, max: 100 });
    exchangeRate = numberField(formData, 'exchangeRate', 'T\u1ef7 gi\u00e1', { min: 0.000001, fallback: 1 });
    revenueVat = numberField(formData, 'revenueVat', 'VAT doanh thu', { min: 0, max: 100 });
    budgetVat = numberField(formData, 'budgetVat', 'VAT d\u1ecbch v\u1ee5', { min: 0, max: 100 });
  } catch (error) {
    validationResult(error, 'T\u1ea1o tour GIT th\u1ea5t b\u1ea1i');
  }
  const revenueDescription = textField(formData, 'revenueDescription');
  const budgetDescription = textField(formData, 'budgetDescription');
  const budgetServiceType = textField(formData, 'budgetServiceType');
  const payload: Record<string, unknown> = {
    systemCode: textField(formData, 'systemCode'),
    tourCode: textField(formData, 'tourCode'),
    holdCode: textField(formData, 'holdCode'),
    name: textField(formData, 'name'),
    itinerarySummary: textField(formData, 'itinerarySummary'),
    marketGroup: textField(formData, 'marketGroup'),
    bookingDate: textField(formData, 'bookingDate'),
    paymentDueDate: textField(formData, 'paymentDueDate'),
    startDate: textField(formData, 'startDate'),
    endDate: textField(formData, 'endDate'),
    customerName: textField(formData, 'customerName'),
    agentName: textField(formData, 'agentName'),
    operatorOwner: textField(formData, 'operatorOwner'),
    collaborator: textField(formData, 'collaborator'),
    branch: textField(formData, 'branch'),
    department: textField(formData, 'department'),
    customerSource: textField(formData, 'customerSource'),
    commissionRate,
    invoiceStatus: textField(formData, 'invoiceStatus'),
    accountCode: textField(formData, 'accountCode'),
    exchangeRateCode: textField(formData, 'exchangeRateCode') || 'VND',
    exchangeRate,
    notes: textField(formData, 'notes'),
  };
  if (revenueDescription || revenueUnitPrice > 0) {
    payload.revenues = [{ description: revenueDescription || 'Doanh thu tour', quantity: revenueQuantity, unitPrice: revenueUnitPrice, vat: revenueVat }];
  }
  if (budgetDescription || budgetUnitPrice > 0 || budgetServiceType) {
    payload.budgetServices = [{ serviceType: budgetServiceType || 'GIT_SERVICE', description: budgetDescription, quantity: budgetQuantity, unitPrice: budgetUnitPrice, vat: budgetVat }];
  }
  const response = await fetch(`${apiBase}/api/git-tours`, { method: 'POST', headers: await serverAuthJsonHeaders(), body: JSON.stringify(payload) });
  if (!response.ok) redirectWithState('error', await apiErrorMessage(response));
  revalidatePath('/git-tours');
  redirectWithState('notice', 'Đã tạo tour GIT.');
}

async function updateGitTourWorkflow(formData: FormData) {
  'use server';
  const id = textField(formData, 'id');
  if (!id) redirectWithState('error', 'Thiếu tour GIT cần cập nhật.');
  const response = await fetch(`${apiBase}/api/git-tours/${id}`, {
    method: 'PATCH',
    headers: await serverAuthJsonHeaders(),
    body: JSON.stringify({ status: textField(formData, 'status'), paymentStatus: textField(formData, 'paymentStatus'), workflowStep: textField(formData, 'workflowStep'), invoiceStatus: textField(formData, 'invoiceStatus') }),
  });
  if (!response.ok) redirectWithState('error', await apiErrorMessage(response));
  revalidatePath('/git-tours');
  redirectWithState('notice', 'Đã cập nhật trạng thái tour GIT.');
}

async function copyGitServices(formData: FormData) {
  'use server';
  const id = textField(formData, 'id');
  const sourceTourId = textField(formData, 'sourceTourId');
  if (!id || !sourceTourId) redirectWithState('error', 'Hãy chọn tour nguồn để sao chép dịch vụ GIT.');
  const response = await fetch(`${apiBase}/api/git-tours/${id}/copy-services`, {
    method: 'POST',
    headers: await serverAuthJsonHeaders(),
    body: JSON.stringify({ sourceTourId }),
  });
  if (!response.ok) redirectWithState('error', await apiErrorMessage(response));
  revalidatePath('/git-tours');
  redirectWithState('notice', 'Đã sao chép dịch vụ GIT từ tour nguồn.');
}

async function deleteGitTour(formData: FormData) {
  'use server';
  const id = textField(formData, 'id');
  if (!id) redirectWithState('error', 'Thiếu tour GIT cần xóa.');
  const response = await fetch(`${apiBase}/api/git-tours/${id}`, { method: 'DELETE', headers: await serverAuthHeaders() });
  if (!response.ok) redirectWithState('error', await apiErrorMessage(response));
  revalidatePath('/git-tours');
  redirectWithState('notice', 'Đã xóa tour GIT.');
}

function formatDate(v: string | null) { return v ? dateFormatter.format(new Date(v)) : '—'; }

function statusClass(s: string) {
  const m: Record<string, string> = { DRAFT: 'status-draft', UPCOMING: 'status-upcoming', RUNNING: 'status-running', COMPLETED: 'status-completed', CANCELLED: 'status-cancelled', SETTLED: 'status-completed', PAID: 'status-completed', PARTIAL: 'status-running', UNPAID: 'status-draft' };
  return m[s] || '';
}

function gitToursPath(search?: string, status?: string) {
  const params = new URLSearchParams();
  const keyword = String(search || '').trim().replace(/\s+/g, ' ');
  const normalizedStatus = String(status || '').trim().toUpperCase();
  if (keyword) params.set('search', keyword);
  if (tourStatuses.includes(normalizedStatus)) params.set('status', normalizedStatus);
  const query = params.toString();
  return `/git-tours${query ? `?${query}` : ''}`;
}

function summarizeTours(tours: GitTour[]) {
  return {
    total: tours.length,
    running: tours.filter((tour) => tour.status === 'RUNNING').length,
    upcoming: tours.filter((tour) => tour.status === 'UPCOMING').length,
    openWorkflow: tours.filter((tour) => !['GIT_COMPLETED', 'COMPLETED'].includes(String(tour.workflowStep || '').toUpperCase())).length,
    revenues: tours.reduce((sum, tour) => sum + (tour._count?.revenues || 0), 0),
    services: tours.reduce((sum, tour) => sum + (tour._count?.services || 0), 0),
  };
}

type GitToursPageProps = { searchParams?: { search?: string; status?: string; notice?: string; error?: string } };

export default async function GitToursPage({ searchParams }: GitToursPageProps) {
  const search = String(searchParams?.search || '').trim().replace(/\s+/g, ' ');
  const status = String(searchParams?.status || '').trim().toUpperCase();
  const notice = String(searchParams?.notice || '').trim();
  const error = String(searchParams?.error || '').trim();
  const currentUser = await apiGet<PermissionUser | null>('/auth/me', null);
  const canViewTours = hasPermission(currentUser, 'tour.view');
  const canManageTours = hasPermission(currentUser, 'tour.manage');
  const tours = canViewTours ? await apiGet<GitTour[]>(gitToursPath(search, status), []) : [];
  const summary = summarizeTours(tours);

  return (
    <section className="workspace">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">Quy trình tour GIT</p>
          <h1>Tour đoàn thiết kế riêng</h1>
        </div>
        <div className="pageHeaderActions">
          {canManageTours ? <a className="secondaryButton iconTextButton" href="#create-git-tour"><Plus size={16} /> Thêm tour GIT</a> : null}
          <span className="statusPill"><BriefcaseBusiness size={14} /> GIT</span>
          <span className="statusPill statusPillNeutral"><Users size={14} /> Điều hành tour</span>
        </div>
      </header>

      {notice ? <div className="statusPill statusPillSuccess"><Save size={14} /> {notice}</div> : null}
      {error ? <div className="statusPill statusPillDanger"><AlertTriangle size={14} /> {error}</div> : null}

      <ServerPermissionNotice allowed={canViewTours} label="xem tour GIT" missingPermissions={['tour.view']} />
      {canViewTours ? (
      <>
      <section className="metrics gitTourMetrics">
        <article className="metric"><span>Tổng tour GIT</span><strong>{summary.total}</strong></article>
        <article className="metric metricTone-amber"><span>Sắp khởi hành</span><strong>{summary.upcoming}</strong></article>
        <article className="metric metricTone-indigo"><span>Đang chạy</span><strong>{summary.running}</strong></article>
        <article className="metric"><span>Workflow đang mở</span><strong>{summary.openWorkflow}</strong></article>
        <article className="metric"><span>Dòng doanh thu</span><strong>{summary.revenues}</strong></article>
        <article className="metric"><span>Dòng dịch vụ</span><strong>{summary.services}</strong></article>
      </section>

      {canManageTours ? (
      <section id="create-git-tour" className="hashModal"><a href="#" className="hashModalBackdrop" aria-label="Đóng"></a><div className="hashModalPanel hashModalWide"><div className="hashModalHeader">
          <h2><Plus size={18} /> Tạo tour GIT</h2><a className="secondaryButton iconButton" href="#" title="Đóng"><X size={16} /></a></div>
          <form action={createGitTour} className="formGrid gitForm">
            <label>Mã hệ thống GIT<input name="systemCode" placeholder="GIT-2026-0001" required minLength={2} maxLength={50} pattern="[A-Za-z0-9][A-Za-z0-9._/\-]*" /></label>
            <label>Mã tour<input name="tourCode" placeholder="GIT-HN-DN" required minLength={2} maxLength={50} pattern="[A-Za-z0-9][A-Za-z0-9._/\-]*" /></label>
            <label>Mã giữ chỗ<input name="holdCode" maxLength={100} /></label>
            <label>Tên tour<input name="name" required minLength={2} maxLength={200} /></label>
            <label>Lịch trình tóm tắt<input name="itinerarySummary" placeholder="Hà Nội - Đà Nẵng - Hội An" maxLength={1000} /></label>
            <label>Nhóm thị trường<input name="marketGroup" maxLength={200} /></label>
            <label>Ngày đặt<input name="bookingDate" type="date" /></label>
            <label>Hạn thanh toán<input name="paymentDueDate" type="date" /></label>
            <label>Khởi đi<input name="startDate" type="date" /></label>
            <label>Ngày về<input name="endDate" type="date" /></label>
            <label>Khách hàng chính<input name="customerName" minLength={2} maxLength={200} /></label>
            <label>Đại lý<input name="agentName" maxLength={200} /></label>
            <label>Nhân viên điều hành<input name="operatorOwner" maxLength={200} /></label>
            <label>Cộng tác viên<input name="collaborator" maxLength={200} /></label>
            <label>Chi nhánh<input name="branch" maxLength={100} /></label>
            <label>Phòng ban<input name="department" maxLength={100} /></label>
            <label>Nguồn khách<input name="customerSource" maxLength={200} /></label>
            <label>Tỷ lệ hoa hồng (%)<input name="commissionRate" type="number" min={0} max={100} step="0.01" defaultValue={0} /></label>
            <label>Trạng thái hóa đơn<input name="invoiceStatus" maxLength={100} /></label>
            <label>Tài khoản<input name="accountCode" maxLength={100} /></label>
            <label>Tiền tệ<select name="exchangeRateCode" defaultValue="VND"><option>VND</option><option>USD</option><option>EUR</option></select></label>
            <label>Giá trị tỷ giá<input name="exchangeRate" type="number" min="0.000001" step="0.000001" defaultValue={1} /></label>
            <label>Nội dung doanh thu<input name="revenueDescription" placeholder="Giá tour trọn gói" /></label>
            <label>Số lượng doanh thu<input name="revenueQuantity" type="number" min={1} defaultValue={1} /></label>
            <label>Đơn giá doanh thu<input name="revenueUnitPrice" type="number" min={0} defaultValue={0} /></label>
            <label>VAT doanh thu (%)<input name="revenueVat" type="number" min={0} max={100} defaultValue={0} /></label>
            <label>Loại dịch vụ dự toán<input name="budgetServiceType" placeholder="GIT_HOTEL" /></label>
            <label>Diễn giải dịch vụ<input name="budgetDescription" /></label>
            <label>Số lượng dịch vụ<input name="budgetQuantity" type="number" min={1} defaultValue={1} /></label>
            <label>Đơn giá dịch vụ<input name="budgetUnitPrice" type="number" min={0} defaultValue={0} /></label>
            <label>VAT dịch vụ (%)<input name="budgetVat" type="number" min={0} max={100} defaultValue={0} /></label>
            <label>Ghi chú<textarea name="notes" rows={2} maxLength={2000} /></label>
            <button type="submit">Tạo tour GIT</button>
          </form>
        </div></section>
      ) : null}

      <section className="panel listPanel">
        <div className="sectionHeader">
          <h2>Danh sách tour GIT</h2>
          <span>{tours.length} tour</span>
        </div>
        <form className="filterBar" action="/git-tours">
          <label>Tìm kiếm<input name="search" defaultValue={search} placeholder="Mã tour, khách hàng, đại lý, điều hành" /></label>
          <label>Trạng thái<select name="status" defaultValue={tourStatuses.includes(status) ? status : ''}>
            <option value="">Tất cả trạng thái</option>
            {tourStatuses.map((s) => <option key={s} value={s}>{viStatus(s)}</option>)}
          </select></label>
          <button type="submit">Lọc danh sách</button>
        </form>
        {tours.length === 0 ? (
          <div className="tableEmptyState"><BriefcaseBusiness size={20} /> Chưa có tour GIT nào.</div>
        ) : (
          <div className="fitTableWrap compactListTableWrap">
            <table className="fitTable orderListTable compactListTable">
              <thead>
                <tr><th>Mã</th><th>Tour</th><th>Khách hàng / Đại lý</th><th>Ngày tour</th><th>Điều hành</th><th>Trạng thái</th><th>Thanh toán</th><th>Hóa đơn</th><th>Dòng dữ liệu</th><th>Thao tác</th></tr>
              </thead>
              <tbody>
                {tours.map((tour) => (
                  <tr key={tour.id}>
                      <td><span className="codeBadge">{tour.systemCode}</span><br /><span className="mutedText">{tour.tourCode}</span></td>
                      <td><strong>{tour.name || '—'}</strong></td>
                      <td>{tour.customers[0]?.name || '—'}<br /><span className="mutedText">{tour.gitTour?.agentName || ''}</span></td>
                      <td>{formatDate(tour.startDate)} - {formatDate(tour.endDate)}</td>
                      <td>{tour.operatorOwner || '—'}</td>
                      <td>
                        <span className={`statusBadge ${statusClass(tour.status)}`}>{viStatus(tour.status)}</span>
                        <br /><span className="mutedText"><GitBranch size={12} /> {viStatus(tour.workflowStep)}</span>
                      </td>
                      <td><span className={`statusBadge ${statusClass(tour.paymentStatus)}`}>{viStatus(tour.paymentStatus)}</span></td>
                      <td>{tour.gitTour?.invoiceStatus ? viStatus(tour.gitTour.invoiceStatus) : '—'}</td>
                      <td><CircleDollarSign size={13} /> {tour._count?.revenues ?? 0} doanh thu / {tour._count?.services ?? 0} dịch vụ</td>
                      <td className="actionsCell"><div className="rowActions">
                        {canManageTours ? (
                          <>
                        <a className="secondaryButton iconButton" href={`#status-${tour.id}`} title="Cập nhật trạng thái"><Save size={14} /></a>
                        <a className="secondaryButton iconButton" href={`#copy-${tour.id}`} title="Sao chép dịch vụ"><Copy size={14} /></a>
                        <a className="dangerButton iconButton" href={`#delete-${tour.id}`} title="Xóa tour GIT"><Trash2 size={14} /></a>
                      
                          </>
                        ) : <span className="mutedText">Ch? xem</span>}
                      </div></td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {canManageTours ? tours.map((tour) => (
        <section id={`status-${tour.id}`} className="hashModal" key={`status-${tour.id}`}>
          <a href="#" className="hashModalBackdrop" aria-label="Đóng"></a>
          <div className="hashModalPanel">
            <div className="hashModalHeader"><h2>Cập nhật trạng thái GIT</h2><a className="secondaryButton iconButton" href="#" title="Đóng"><X size={16} /></a></div>
            <form action={updateGitTourWorkflow} className="formStack">
              <input type="hidden" name="id" value={tour.id} />
              <label>Trạng thái tour<select name="status" defaultValue={tour.status}>{tourStatuses.map((s) => <option key={s} value={s}>{viStatus(s)}</option>)}</select></label>
              <label>Trạng thái thanh toán<select name="paymentStatus" defaultValue={tour.paymentStatus}>{paymentStatuses.map((s) => <option key={s} value={s}>{viStatus(s)}</option>)}</select></label>
              <label>Bước workflow<select name="workflowStep" defaultValue={tour.workflowStep || 'GIT_INFO'}>{gitWorkflowSteps.map((step) => <option key={step} value={step}>{viStatus(step)}</option>)}</select></label>
              <label>Trạng thái hóa đơn<select name="invoiceStatus" defaultValue={tour.gitTour?.invoiceStatus || ''}><option value="">Chưa cập nhật</option>{invoiceStatuses.map((s) => <option key={s} value={s}>{viStatus(s)}</option>)}</select></label>
              <button type="submit"><Save size={15} /> Cập nhật</button>
            </form>
          </div>
        </section>
      )) : null}
      {canManageTours ? tours.map((tour) => (
        <section id={`copy-${tour.id}`} className="hashModal" key={`copy-${tour.id}`}>
          <a href="#" className="hashModalBackdrop" aria-label="Đóng"></a>
          <div className="hashModalPanel">
            <div className="hashModalHeader"><h2>Sao chép dịch vụ GIT</h2><a className="secondaryButton iconButton" href="#" title="Đóng"><X size={16} /></a></div>
            <form action={copyGitServices} className="formStack">
              <input type="hidden" name="id" value={tour.id} />
              <p className="mutedText">Thao tác này thay thế các dòng dịch vụ hiện có của {tour.systemCode} bằng dịch vụ từ tour nguồn.</p>
              <label>Tour nguồn<select name="sourceTourId" required defaultValue="">
                <option value="" disabled>Chọn tour nguồn</option>
                {tours.filter((source) => source.id !== tour.id).map((source) => <option key={source.id} value={source.id}>{source.systemCode} - {source.name || source.tourCode}</option>)}
              </select></label>
              <button type="submit"><Copy size={15} /> Xác nhận sao chép</button>
            </form>
          </div>
        </section>
      )) : null}
      {canManageTours ? tours.map((tour) => (
        <section id={`delete-${tour.id}`} className="hashModal" key={`delete-${tour.id}`}>
          <a href="#" className="hashModalBackdrop" aria-label="Đóng"></a>
          <div className="hashModalPanel">
            <div className="hashModalHeader"><h2>Xóa tour GIT</h2><a className="secondaryButton iconButton" href="#" title="Đóng"><X size={16} /></a></div>
            <form action={deleteGitTour} className="formStack">
              <input type="hidden" name="id" value={tour.id} />
              <p className="mutedText">Chỉ xóa tour khi chưa phát sinh đơn hàng, booking, điều hành hoặc chứng từ tài chính.</p>
              <strong>{tour.systemCode} - {tour.name || tour.tourCode}</strong>
              <button type="submit" className="dangerButton"><Trash2 size={15} /> Xác nhận xóa</button>
            </form>
          </div>
        </section>
      )) : null}
      </>
      ) : null}
    </section>
  );
}

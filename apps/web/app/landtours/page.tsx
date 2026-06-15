import { AlertTriangle, Boxes, Copy, FileText, GitBranch, Plus, Route, Save, Trash2, Users, X } from 'lucide-react';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
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
  workflowStep: string | null;
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
const tourStatuses = ['DRAFT', 'UPCOMING', 'RUNNING', 'COMPLETED', 'CANCELLED', 'SETTLED'];
const paymentStatuses = ['UNPAID', 'PARTIAL', 'PAID'];
const landWorkflowSteps = ['LANDTOUR_INFO', 'LANDTOUR_COSTING', 'LANDTOUR_OPERATION', 'LANDTOUR_HANDOVER', 'LANDTOUR_SURVEY', 'LANDTOUR_COMPLETED'];

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
    return String(message || body?.error || 'Thao t\u00e1c LandTour kh\u00f4ng th\u00e0nh c\u00f4ng');
  } catch {
    return 'Thao t\u00e1c LandTour kh\u00f4ng th\u00e0nh c\u00f4ng';
  }
}

function textField(formData: FormData, key: string) {
  return String(formData.get(key) || '').trim();
}

function numberField(formData: FormData, key: string, fallback = 0) {
  const raw = textField(formData, key);
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function redirectWithState(type: 'notice' | 'error', message: string) {
  redirect(`/landtours?${type}=${encodeURIComponent(message)}`);
}

async function createLandTour(formData: FormData) {
  'use server';
  const salesServiceType = textField(formData, 'salesServiceType');
  const salesDescription = textField(formData, 'salesDescription');
  const salesUnitPrice = numberField(formData, 'salesUnitPrice');
  const salesQuantity = numberField(formData, 'salesQuantity', 1);
  const operationServiceType = textField(formData, 'operationServiceType');
  const operationDescription = textField(formData, 'operationDescription');
  const operationUnitPrice = numberField(formData, 'operationUnitPrice');
  const operationQuantity = numberField(formData, 'operationQuantity', 1);
  const route = textField(formData, 'route');
  const payload: Record<string, unknown> = {
    systemCode: textField(formData, 'systemCode'),
    tourCode: textField(formData, 'tourCode'),
    name: textField(formData, 'name'),
    route,
    itinerarySummary: route,
    marketGroup: textField(formData, 'marketGroup'),
    bookingDate: textField(formData, 'bookingDate'),
    paymentDueDate: textField(formData, 'paymentDueDate'),
    startDate: textField(formData, 'startDate'),
    endDate: textField(formData, 'endDate'),
    customerName: textField(formData, 'customerName'),
    operatorOwner: textField(formData, 'operatorOwner'),
    guideName: textField(formData, 'guideName'),
    comboType: textField(formData, 'comboType'),
    exchangeRateCode: textField(formData, 'exchangeRateCode') || 'VND',
    exchangeRate: numberField(formData, 'exchangeRate', 1),
    notes: textField(formData, 'notes'),
    termsVi: textField(formData, 'termsVi'),
    termsEn: textField(formData, 'termsEn'),
    autoTermsEnabled: formData.get('autoTermsEnabled') === 'on',
    smartLinkCode: textField(formData, 'smartLinkCode'),
    confirmationNote: textField(formData, 'confirmationNote'),
  };
  if (salesDescription || salesUnitPrice > 0 || salesServiceType) {
    payload.salesServices = [{ serviceType: salesServiceType || 'LAND_SERVICE', description: salesDescription, quantity: salesQuantity, unitPrice: salesUnitPrice, vat: numberField(formData, 'salesVat') }];
  }
  if (operationDescription || operationUnitPrice > 0 || operationServiceType) {
    payload.operationServices = [{ serviceType: operationServiceType || 'LAND_SERVICE', description: operationDescription, quantity: operationQuantity, confirmedUnitPrice: operationUnitPrice, vat: numberField(formData, 'operationVat'), status: textField(formData, 'operationStatus') || 'WAITING' }];
  }
  const response = await fetch(`${apiBase}/api/landtours`, { method: 'POST', headers: await serverAuthJsonHeaders(), body: JSON.stringify(payload) });
  if (!response.ok) redirectWithState('error', await apiErrorMessage(response));
  revalidatePath('/landtours');
  redirectWithState('notice', '\u0110\u00e3 t\u1ea1o LandTour.');
}

async function updateLandTourWorkflow(formData: FormData) {
  'use server';
  const id = textField(formData, 'id');
  if (!id) redirectWithState('error', 'Thi\u1ebfu LandTour c\u1ea7n c\u1eadp nh\u1eadt.');
  const response = await fetch(`${apiBase}/api/landtours/${id}`, {
    method: 'PATCH',
    headers: await serverAuthJsonHeaders(),
    body: JSON.stringify({ status: textField(formData, 'status'), paymentStatus: textField(formData, 'paymentStatus'), workflowStep: textField(formData, 'workflowStep') }),
  });
  if (!response.ok) redirectWithState('error', await apiErrorMessage(response));
  revalidatePath('/landtours');
  redirectWithState('notice', '\u0110\u00e3 c\u1eadp nh\u1eadt tr\u1ea1ng th\u00e1i LandTour.');
}

async function copyLandServices(formData: FormData) {
  'use server';
  const id = textField(formData, 'id');
  const sourceTourId = textField(formData, 'sourceTourId');
  if (!id || !sourceTourId) redirectWithState('error', 'H\u00e3y ch\u1ecdn tour ngu\u1ed3n \u0111\u1ec3 sao ch\u00e9p d\u1ecbch v\u1ee5 LandTour.');
  const response = await fetch(`${apiBase}/api/landtours/${id}/copy-services`, {
    method: 'POST',
    headers: await serverAuthJsonHeaders(),
    body: JSON.stringify({ sourceTourId }),
  });
  if (!response.ok) redirectWithState('error', await apiErrorMessage(response));
  revalidatePath('/landtours');
  redirectWithState('notice', '\u0110\u00e3 sao ch\u00e9p d\u1ecbch v\u1ee5 LandTour t\u1eeb tour ngu\u1ed3n.');
}

async function deleteLandTour(formData: FormData) {
  'use server';
  const id = textField(formData, 'id');
  if (!id) redirectWithState('error', 'Thi\u1ebfu LandTour c\u1ea7n x\u00f3a.');
  const response = await fetch(`${apiBase}/api/landtours/${id}`, { method: 'DELETE', headers: await serverAuthHeaders() });
  if (!response.ok) redirectWithState('error', await apiErrorMessage(response));
  revalidatePath('/landtours');
  redirectWithState('notice', '\u0110\u00e3 x\u00f3a LandTour.');
}

function formatDate(v: string | null) { return v ? dateFormatter.format(new Date(v)) : '-'; }

function statusClass(s: string) {
  const m: Record<string, string> = { DRAFT: 'status-draft', UPCOMING: 'status-upcoming', RUNNING: 'status-running', COMPLETED: 'status-completed', CANCELLED: 'status-cancelled', SETTLED: 'status-completed', PAID: 'status-completed', PARTIAL: 'status-running', UNPAID: 'status-draft' };
  return m[s] || '';
}

function landToursPath(search?: string, status?: string) {
  const params = new URLSearchParams();
  const keyword = String(search || '').trim().replace(/\s+/g, ' ');
  const normalizedStatus = String(status || '').trim().toUpperCase();
  if (keyword) params.set('search', keyword);
  if (tourStatuses.includes(normalizedStatus)) params.set('status', normalizedStatus);
  const query = params.toString();
  return `/landtours${query ? `?${query}` : ''}`;
}

function summarizeTours(tours: LandTour[]) {
  return {
    total: tours.length,
    running: tours.filter((tour) => tour.status === 'RUNNING').length,
    upcoming: tours.filter((tour) => tour.status === 'UPCOMING').length,
    openWorkflow: tours.filter((tour) => !['LANDTOUR_COMPLETED', 'COMPLETED'].includes(String(tour.workflowStep || '').toUpperCase())).length,
    services: tours.reduce((sum, tour) => sum + (tour._count?.services || 0), 0),
    terms: tours.reduce((sum, tour) => sum + (tour._count?.terms || 0), 0),
  };
}

type LandToursPageProps = { searchParams?: { search?: string; status?: string; notice?: string; error?: string } };

export default async function LandToursPage({ searchParams }: LandToursPageProps) {
  const search = String(searchParams?.search || '').trim().replace(/\s+/g, ' ');
  const status = String(searchParams?.status || '').trim().toUpperCase();
  const notice = String(searchParams?.notice || '').trim();
  const error = String(searchParams?.error || '').trim();
  const tours = await apiGet<LandTour[]>(landToursPath(search, status), []);
  const summary = summarizeTours(tours);

  return (
    <section className="workspace">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">Quy tr&#236;nh LandTour v&#224; combo d&#7883;ch v&#7909;</p>
          <h1>LandTour / Combo d&#7883;ch v&#7909;</h1>
        </div>
        <div className="pageHeaderActions">
          <a className="secondaryButton iconTextButton" href="#create-land-tour"><Plus size={16} /> Th&#234;m LandTour</a>
          <span className="statusPill"><Boxes size={14} /> Combo</span>
          <span className="statusPill statusPillNeutral"><Users size={14} /> &#272;i&#7873;u h&#224;nh d&#7883;ch v&#7909;</span>
        </div>
      </header>

      {notice ? <div className="statusPill statusPillSuccess"><Save size={14} /> {notice}</div> : null}
      {error ? <div className="statusPill statusPillDanger"><AlertTriangle size={14} /> {error}</div> : null}

      <section className="metrics landTourMetrics">
        <article className="metric"><span>T&#7893;ng LandTour</span><strong>{summary.total}</strong></article>
        <article className="metric metricTone-amber"><span>S&#7855;p kh&#7903;i h&#224;nh</span><strong>{summary.upcoming}</strong></article>
        <article className="metric metricTone-indigo"><span>&#272;ang ch&#7841;y</span><strong>{summary.running}</strong></article>
        <article className="metric"><span>Workflow &#273;ang m&#7903;</span><strong>{summary.openWorkflow}</strong></article>
        <article className="metric"><span>D&#242;ng d&#7883;ch v&#7909;</span><strong>{summary.services}</strong></article>
        <article className="metric"><span>D&#242;ng &#273;i&#7873;u kho&#7843;n</span><strong>{summary.terms}</strong></article>
      </section>

      <section id="create-land-tour" className="hashModal"><a href="#" className="hashModalBackdrop" aria-label="&#272;&#243;ng"></a><div className="hashModalPanel hashModalWide"><div className="hashModalHeader">
          <h2><Plus size={18} /> T&#7841;o LandTour / Combo</h2><a className="secondaryButton iconButton" href="#" title="&#272;&#243;ng"><X size={16} /></a></div>
          <form action={createLandTour} className="formGrid landForm">
            <label>M&#227; h&#7879; th&#7889;ng LandTour<input name="systemCode" placeholder="LAND-2026-0001" required minLength={2} maxLength={50} pattern="[A-Za-z0-9][A-Za-z0-9._/\-]*" /></label>
            <label>M&#227; tour<input name="tourCode" placeholder="LAND-DN-COMBO" required minLength={2} maxLength={50} pattern="[A-Za-z0-9][A-Za-z0-9._/\-]*" /></label>
            <label>T&#234;n tour<input name="name" required minLength={2} maxLength={200} /></label>
            <label>Tuy&#7871;n &#273;i&#7875;m / l&#7883;ch tr&#236;nh<input name="route" placeholder="&#272;&#224; N&#7861;ng - H&#7897;i An - B&#224; N&#224;" maxLength={1000} /></label>
            <label>Nh&#243;m th&#7883; tr&#432;&#7901;ng<input name="marketGroup" maxLength={200} /></label>
            <label>Ng&#224;y &#273;&#7863;t<input name="bookingDate" type="date" /></label>
            <label>H&#7841;n thanh to&#225;n<input name="paymentDueDate" type="date" /></label>
            <label>Kh&#7903;i &#273;i<input name="startDate" type="date" /></label>
            <label>Ng&#224;y v&#7873;<input name="endDate" type="date" /></label>
            <label>Kh&#225;ch h&#224;ng ch&#237;nh<input name="customerName" minLength={2} maxLength={200} /></label>
            <label>Nh&#226;n vi&#234;n &#273;i&#7873;u h&#224;nh<input name="operatorOwner" maxLength={200} /></label>
            <label>H&#432;&#7899;ng d&#7851;n vi&#234;n<input name="guideName" maxLength={200} /></label>
            <label>Lo&#7841;i combo<select name="comboType" defaultValue="Combo du l&#7883;ch"><option>Land only</option><option>Land + V&#233;</option><option>Land + Ph&#242;ng</option><option>Land + Xe</option><option>Land + Kh&#225;ch s&#7841;n</option><option>Combo du l&#7883;ch</option></select></label>
            <label>Ti&#7873;n t&#7879;<select name="exchangeRateCode" defaultValue="VND"><option>VND</option><option>USD</option><option>EUR</option></select></label>
            <label>Gi&#225; tr&#7883; t&#7927; gi&#225;<input name="exchangeRate" type="number" min="0.000001" step="0.000001" defaultValue={1} /></label>
            <label>Lo&#7841;i d&#7883;ch v&#7909; b&#225;n<input name="salesServiceType" placeholder="LAND_CAR" maxLength={100} /></label>
            <label>Di&#7877;n gi&#7843;i d&#7883;ch v&#7909; b&#225;n<input name="salesDescription" maxLength={500} /></label>
            <label>S&#7889; l&#432;&#7907;ng b&#225;n<input name="salesQuantity" type="number" min={1} defaultValue={1} /></label>
            <label>&#272;&#417;n gi&#225; b&#225;n<input name="salesUnitPrice" type="number" min={0} defaultValue={0} /></label>
            <label>VAT b&#225;n (%)<input name="salesVat" type="number" min={0} max={100} defaultValue={0} /></label>
            <label>Lo&#7841;i d&#7883;ch v&#7909; &#273;i&#7873;u h&#224;nh<input name="operationServiceType" placeholder="LAND_HOTEL" maxLength={100} /></label>
            <label>Di&#7877;n gi&#7843;i &#273;i&#7873;u h&#224;nh<input name="operationDescription" maxLength={500} /></label>
            <label>S&#7889; l&#432;&#7907;ng &#273;i&#7873;u h&#224;nh<input name="operationQuantity" type="number" min={1} defaultValue={1} /></label>
            <label>Gi&#225; x&#225;c nh&#7853;n<input name="operationUnitPrice" type="number" min={0} defaultValue={0} /></label>
            <label>VAT &#273;i&#7873;u h&#224;nh (%)<input name="operationVat" type="number" min={0} max={100} defaultValue={0} /></label>
            <label>Tr&#7841;ng th&#225;i d&#7883;ch v&#7909;<select name="operationStatus" defaultValue="WAITING"><option>WAITING</option><option>REQUESTED</option><option>CONFIRMED</option><option>OPERATING</option><option>COMPLETED</option><option>CANCELLED</option></select></label>
            <label>M&#227; SmartLink<input name="smartLinkCode" maxLength={100} /></label>
            <label className="checkLine"><input name="autoTermsEnabled" type="checkbox" /> T&#7921; &#273;&#7897;ng &#225;p d&#7909;ng &#273;i&#7873;u kho&#7843;n</label>
            <label>&#272;i&#7873;u kho&#7843;n ti&#7871;ng Vi&#7879;t<textarea name="termsVi" rows={2} maxLength={4000} /></label>
            <label>&#272;i&#7873;u kho&#7843;n ti&#7871;ng Anh<textarea name="termsEn" rows={2} maxLength={4000} /></label>
            <label>Ghi ch&#250;<textarea name="notes" rows={2} maxLength={2000} /></label>
            <label>Ghi ch&#250; x&#225;c nh&#7853;n<textarea name="confirmationNote" rows={2} maxLength={2000} /></label>
            <button type="submit">T&#7841;o LandTour</button>
          </form>
        </div></section>

      <section className="panel listPanel">
        <div className="sectionHeader">
          <h2>Danh s&#225;ch LandTour / Combo</h2>
          <span>{tours.length} tour</span>
        </div>
        <form className="filterBar" action="/landtours">
          <label>T&#236;m ki&#7871;m<input name="search" defaultValue={search} placeholder="M&#227; tour, tuy&#7871;n &#273;i&#7875;m, kh&#225;ch h&#224;ng, h&#432;&#7899;ng d&#7851;n vi&#234;n" /></label>
          <label>Tr&#7841;ng th&#225;i<select name="status" defaultValue={tourStatuses.includes(status) ? status : ''}>
            <option value="">T&#7845;t c&#7843; tr&#7841;ng th&#225;i</option>
            {tourStatuses.map((s) => <option key={s} value={s}>{viStatus(s)}</option>)}
          </select></label>
          <button type="submit">L&#7885;c danh s&#225;ch</button>
        </form>
        {tours.length === 0 ? (
          <div className="tableEmptyState"><Boxes size={20} /> Ch&#432;a c&#243; LandTour / Combo n&#224;o.</div>
        ) : (
          <div className="fitTableWrap compactListTableWrap">
            <table className="fitTable orderListTable compactListTable">
              <thead>
                <tr><th>M&#227;</th><th>Tour</th><th>Kh&#225;ch h&#224;ng</th><th>Ng&#224;y tour</th><th>Lo&#7841;i combo</th><th>H&#432;&#7899;ng d&#7851;n vi&#234;n</th><th>Tr&#7841;ng th&#225;i</th><th>Thanh to&#225;n</th><th>D&#242;ng d&#7919; li&#7879;u</th><th>Thao t&#225;c</th></tr>
              </thead>
              <tbody>
                {tours.map((tour) => (
                  <tr key={tour.id}>
                      <td><span className="codeBadge">{tour.systemCode}</span><br /><span className="mutedText">{tour.tourCode}</span></td>
                      <td><strong>{tour.name || '-'}</strong>{tour.route ? <><br /><span className="mutedText"><Route size={12} /> {tour.route}</span></> : null}</td>
                      <td>{tour.customers[0]?.name || '-'}</td>
                      <td>{formatDate(tour.startDate)} - {formatDate(tour.endDate)}</td>
                      <td>{tour.landTour?.comboType || '-'}</td>
                      <td>{tour.landTour?.guideName || '-'}</td>
                      <td>
                        <span className={`statusBadge ${statusClass(tour.status)}`}>{viStatus(tour.status)}</span>
                        <br /><span className="mutedText"><GitBranch size={12} /> {viStatus(tour.workflowStep)}</span>
                      </td>
                      <td><span className={`statusBadge ${statusClass(tour.paymentStatus)}`}>{viStatus(tour.paymentStatus)}</span></td>
                      <td>{tour._count?.services ?? 0} d&#7883;ch v&#7909; / <FileText size={12} /> {tour._count?.terms ?? 0} &#273;i&#7873;u kho&#7843;n</td>
                      <td className="actionsCell"><div className="rowActions">
                        <a className="secondaryButton iconButton" href={`#status-${tour.id}`} title="C&#7853;p nh&#7853;t tr&#7841;ng th&#225;i"><Save size={14} /></a>
                        <a className="secondaryButton iconButton" href={`#copy-${tour.id}`} title="Sao ch&#233;p d&#7883;ch v&#7909;"><Copy size={14} /></a>
                        <a className="dangerButton iconButton" href={`#delete-${tour.id}`} title="X&#243;a LandTour"><Trash2 size={14} /></a>
                      </div></td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {tours.map((tour) => (
        <section id={`status-${tour.id}`} className="hashModal" key={`status-${tour.id}`}>
          <a href="#" className="hashModalBackdrop" aria-label="&#272;&#243;ng"></a>
          <div className="hashModalPanel">
            <div className="hashModalHeader"><h2>C&#7853;p nh&#7853;t tr&#7841;ng th&#225;i LandTour</h2><a className="secondaryButton iconButton" href="#" title="&#272;&#243;ng"><X size={16} /></a></div>
            <form action={updateLandTourWorkflow} className="formStack">
              <input type="hidden" name="id" value={tour.id} />
              <label>Tr&#7841;ng th&#225;i tour<select name="status" defaultValue={tour.status}>{tourStatuses.map((s) => <option key={s} value={s}>{viStatus(s)}</option>)}</select></label>
              <label>Tr&#7841;ng th&#225;i thanh to&#225;n<select name="paymentStatus" defaultValue={tour.paymentStatus}>{paymentStatuses.map((s) => <option key={s} value={s}>{viStatus(s)}</option>)}</select></label>
              <label>B&#432;&#7899;c workflow<select name="workflowStep" defaultValue={tour.workflowStep || 'LANDTOUR_INFO'}>{landWorkflowSteps.map((step) => <option key={step} value={step}>{viStatus(step)}</option>)}</select></label>
              <button type="submit"><Save size={15} /> C&#7853;p nh&#7853;t</button>
            </form>
          </div>
        </section>
      ))}
      {tours.map((tour) => (
        <section id={`copy-${tour.id}`} className="hashModal" key={`copy-${tour.id}`}>
          <a href="#" className="hashModalBackdrop" aria-label="&#272;&#243;ng"></a>
          <div className="hashModalPanel">
            <div className="hashModalHeader"><h2>Sao ch&#233;p d&#7883;ch v&#7909; LandTour</h2><a className="secondaryButton iconButton" href="#" title="&#272;&#243;ng"><X size={16} /></a></div>
            <form action={copyLandServices} className="formStack">
              <input type="hidden" name="id" value={tour.id} />
              <p className="mutedText">Thao t&#225;c n&#224;y thay th&#7871; c&#225;c d&#242;ng d&#7883;ch v&#7909; hi&#7879;n c&#243; c&#7911;a {tour.systemCode} b&#7857;ng d&#7883;ch v&#7909; t&#7915; tour ngu&#7891;n.</p>
              <label>Tour ngu&#7891;n<select name="sourceTourId" required defaultValue="">
                <option value="" disabled>Ch&#7885;n tour ngu&#7891;n</option>
                {tours.filter((source) => source.id !== tour.id).map((source) => <option key={source.id} value={source.id}>{source.systemCode} - {source.name || source.tourCode}</option>)}
              </select></label>
              <button type="submit"><Copy size={15} /> X&#225;c nh&#7853;n sao ch&#233;p</button>
            </form>
          </div>
        </section>
      ))}
      {tours.map((tour) => (
        <section id={`delete-${tour.id}`} className="hashModal" key={`delete-${tour.id}`}>
          <a href="#" className="hashModalBackdrop" aria-label="&#272;&#243;ng"></a>
          <div className="hashModalPanel">
            <div className="hashModalHeader"><h2>X&#243;a LandTour</h2><a className="secondaryButton iconButton" href="#" title="&#272;&#243;ng"><X size={16} /></a></div>
            <form action={deleteLandTour} className="formStack">
              <input type="hidden" name="id" value={tour.id} />
              <p className="mutedText">Ch&#7881; x&#243;a LandTour khi ch&#432;a ph&#225;t sinh &#273;&#417;n h&#224;ng, booking, &#273;i&#7873;u h&#224;nh ho&#7863;c ch&#7913;ng t&#7915; t&#224;i ch&#237;nh.</p>
              <strong>{tour.systemCode} - {tour.name || tour.tourCode}</strong>
              <button type="submit" className="dangerButton"><Trash2 size={15} /> X&#225;c nh&#7853;n x&#243;a</button>
            </form>
          </div>
        </section>
      ))}
    </section>
  );
}

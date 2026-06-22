import { Route, Users } from 'lucide-react';
import { serverAuthHeaders } from '../serverAuth';
import { serverApiBase } from '../serverApiBase';
import { ServerPermissionNotice, hasPermission, type PermissionUser } from '../serverPermissions';
import FitToursClient from './FitToursClient';

export const dynamic = 'force-dynamic';

type Supplier = { id: string; name: string };
type FitTourSummary = {
  id: string;
  quoteCode: string;
  tourCode: string;
  tourName?: string | null;
  customerName: string;
  phone?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  adultCount?: number | null;
  childCount?: number | null;
  infantCount?: number | null;
  sellingPrice?: string | number | null;
  workflowStatus?: string | null;
  _count?: { commonCosts: number; hotelCosts: number; privateCosts: number; budgetServices: number; operationServices: number };
};

const apiBase = serverApiBase();

type ApiResult<T> = { data: T; error?: string };

async function apiGet<T>(path: string, fallback: T, label: string): Promise<ApiResult<T>> {
  try {
    const response = await fetch(`${apiBase}/api${path}`, { cache: 'no-store', headers: await serverAuthHeaders() });
    if (!response.ok) {
      const text = await response.text();
      let detail = text;
      try {
        const body = JSON.parse(text);
        detail = Array.isArray(body.message) ? body.message.join(', ') : body.message || body.error || text;
      } catch {
        // Keep the raw response when the API does not return JSON.
      }
      return { data: fallback, error: `${label}: ${detail || `HTTP ${response.status}`}` };
    }
    return { data: await response.json() };
  } catch (error) {
    return { data: fallback, error: `${label}: ${error instanceof Error ? error.message : 'không xác định'}` };
  }
}

export default async function FitToursPage() {
  const currentUserResult = await apiGet<PermissionUser | null>('/auth/me', null, 'T\u1ea3i quy\u1ec1n phi\u00ean \u0111\u0103ng nh\u1eadp th\u1ea5t b\u1ea1i');
  const currentUser = currentUserResult.data;
  const canViewTours = hasPermission(currentUser, 'tour.view');
  const canManageTours = hasPermission(currentUser, 'tour.manage');
  const [suppliersResult, toursResult] = await Promise.all([
    canManageTours ? await apiGet<Supplier[]>('/suppliers', [], 'T\u1ea3i danh s\u00e1ch nh\u00e0 cung c\u1ea5p th\u1ea5t b\u1ea1i') : { data: [] as Supplier[] },
    canViewTours ? await apiGet<FitTourSummary[]>('/fit-tours', [], 'T\u1ea3i danh s\u00e1ch tour FIT th\u1ea5t b\u1ea1i') : { data: [] as FitTourSummary[] },
  ]);
  const initialError = [currentUserResult.error, suppliersResult.error, toursResult.error].filter(Boolean).join('. ');

  return (
    <section className="workspace">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">{'Quy tr\u00ecnh tour FIT'}</p>
          <h1>{'Tour kh\u00e1ch l\u1ebb FIT'}</h1>
        </div>
        <div className="pageHeaderActions">
          <span className="statusPill"><Route size={14} /> {'6 b\u01b0\u1edbc'}</span>
          <span className="statusPill statusPillNeutral"><Users size={14} /> {'\u0110i\u1ec1u h\u00e0nh'}</span>
        </div>
      </header>

      <ServerPermissionNotice allowed={canViewTours} label={'xem tour FIT'} missingPermissions={['tour.view']} />
      {canViewTours ? (
        <FitToursClient suppliers={suppliersResult.data} tours={toursResult.data} initialError={initialError} />
      ) : null}
    </section>
  );
}

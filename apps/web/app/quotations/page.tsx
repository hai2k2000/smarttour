import { ClipboardList, Users } from 'lucide-react';
import { serverAuthHeaders } from '../serverAuth';
import { serverApiBase } from '../serverApiBase';
import { ServerPermissionNotice, hasPermission, type PermissionUser } from '../serverPermissions';
import QuotationsClient from './QuotationsClient';

export const dynamic = 'force-dynamic';

const apiBase = serverApiBase();
const emptyDashboard = { total: 0, totalValue: 0, pending: 0, approved: 0, converted: 0, expired: 0 };

async function apiGet<T>(path: string, fallback: T): Promise<T> {
  try {
    const response = await fetch(`${apiBase}/api${path}`, { cache: 'no-store', headers: await serverAuthHeaders() });
    if (!response.ok) return fallback;
    return response.json();
  } catch {
    return fallback;
  }
}

export default async function QuotationsPage() {
  const currentUser = await apiGet<PermissionUser | null>('/auth/me', null);
  const canViewQuotations = hasPermission(currentUser, 'quotation.view') || hasPermission(currentUser, 'quotation.manage');
  const [dashboard, quotations] = canViewQuotations ? await Promise.all([
    apiGet('/quotations/dashboard', emptyDashboard),
    apiGet('/quotations?take=100', []),
  ]) : [emptyDashboard, []];

  return (
    <section className="workspace">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">{'B\u00e1o gi\u00e1 h\u1ee3p nh\u1ea5t'}</p>
          <h1>{'C\u00f4ng c\u1ee5 b\u00e1o gi\u00e1'}</h1>
        </div>
        <div className="pageHeaderActions">
          <span className="statusPill"><ClipboardList size={14} /> {'C\u00f4ng c\u1ee5 gi\u00e1'}</span>
          <span className="statusPill statusPillNeutral"><Users size={14} /> {'Nh\u00e2n s\u1ef1 v\u1eadn h\u00e0nh'}</span>
        </div>
      </header>
      <ServerPermissionNotice allowed={canViewQuotations} label={'xem v\u00e0 qu\u1ea3n l\u00fd b\u00e1o gi\u00e1'} missingPermissions={['quotation.view']} />
      {canViewQuotations ? (
        <QuotationsClient initialDashboard={dashboard} initialQuotations={quotations} />
      ) : null}
    </section>
  );
}

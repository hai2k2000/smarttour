import { ClipboardList, Users } from 'lucide-react';
import { serverAuthHeaders } from '../serverAuth';
import QuotationsClient from './QuotationsClient';

export const dynamic = 'force-dynamic';

const apiBase = process.env.NEXT_PUBLIC_API_URL || '';

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
  const [dashboard, quotations] = await Promise.all([
    apiGet('/quotations/dashboard', { total: 0, totalValue: 0, pending: 0, approved: 0, converted: 0, expired: 0 }),
    apiGet('/quotations', []),
  ]);

  return (
    <section className="workspace">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">Bao gia hop nhat</p>
          <h1>Quotation Engine</h1>
        </div>
        <div className="pageHeaderActions">
          <span className="statusPill"><ClipboardList size={14} /> Price Engine</span>
          <span className="statusPill statusPillNeutral"><Users size={14} /> Operator</span>
        </div>
      </header>
      <QuotationsClient initialDashboard={dashboard} initialQuotations={quotations} />
    </section>
  );
}

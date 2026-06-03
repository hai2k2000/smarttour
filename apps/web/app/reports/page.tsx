import { serverAuthHeaders } from '../serverAuth';
import ReportsClient from './ReportsClient';

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

export default async function ReportsPage() {
  const [overview, revenue] = await Promise.all([
    apiGet('/reports/overview', {}),
    apiGet('/reports/revenue/by-created-date', { summary: {}, rows: [] }),
  ]);

  return (
    <section className="workspace reportWorkspace">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">Reporting & Analytics</p>
          <h1>Báo cáo tổng hợp</h1>
        </div>
        <div className="pageHeaderActions">
          <span className="statusPill">Quản trị</span>
          <span className="statusPill statusPillNeutral">Tài chính</span>
          <span className="statusPill statusPillNeutral">CSV</span>
        </div>
      </header>
      <ReportsClient initialOverview={overview as any} initialRevenue={revenue as any} />
    </section>
  );
}

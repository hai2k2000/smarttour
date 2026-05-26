import { serverAuthHeaders } from '../serverAuth';
import OrderCenterClient from './OrderCenterClient';

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

export default async function OrderCenterPage() {
  const [dashboard, orders] = await Promise.all([
    apiGet('/order-center/dashboard', { total: 0, upcoming: 0, running: 0, completed: 0, cancelled: 0, unpaid: 0, unpaidCost: 0, revenue: 0, cost: 0, profit: 0 }),
    apiGet('/order-center', []),
  ]);

  return (
    <section className="workspace orderWorkspace">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">Trung tam don hang</p>
          <h1>Order Center</h1>
        </div>
        <div className="pageHeaderActions">
          <span className="statusPill">Tat ca don hang</span>
          <span className="statusPill statusPillNeutral">Operator</span>
        </div>
      </header>
      <OrderCenterClient initialDashboard={dashboard} initialOrders={orders} />
    </section>
  );
}

import { Calculator, Users } from 'lucide-react';
import Link from 'next/link';
import { serverAuthHeaders } from '../../serverAuth';
import { serverApiBase } from '../../serverApiBase';
import { ServerPermissionNotice, hasPermission, type PermissionUser } from '../../serverPermissions';
import QuoteCombosClient from './QuoteCombosClient';

export const dynamic = 'force-dynamic';

type Supplier = { id: string; name: string; supplierServices?: { id: string; serviceName: string; netPrice: string }[] };

const apiBase = serverApiBase();

async function apiGet<T>(path: string, fallback: T): Promise<T> {
  try {
    const response = await fetch(`${apiBase}/api${path}`, { cache: 'no-store', headers: await serverAuthHeaders() });
    if (!response.ok) return fallback;
    return response.json();
  } catch {
    return fallback;
  }
}

export default async function QuoteCombosPage() {
  const currentUser = await apiGet<PermissionUser | null>('/auth/me', null);
  const canViewQuotes = hasPermission(currentUser, 'quote.view') || hasPermission(currentUser, 'quote.manage');
  const canManageQuotes = hasPermission(currentUser, 'quote.manage');
  const combos = canViewQuotes ? await apiGet('/quotes/combos', []) : [];
  const [hotels, flights, landtours, attractions, transport, other] = canManageQuotes ? await Promise.all([
    apiGet<Supplier[]>('/suppliers/hotels?take=100', []),
    apiGet<Supplier[]>('/suppliers/flights?take=100', []),
    apiGet<Supplier[]>('/suppliers/landtour-suppliers?take=100', []),
    apiGet<Supplier[]>('/suppliers/attraction-tickets?take=100', []),
    apiGet<Supplier[]>('/suppliers/transport?take=100', []),
    apiGet<Supplier[]>('/suppliers/other?take=100', []),
  ]) : [[], [], [], [], [], []];
  const suppliers = [...hotels, ...flights, ...landtours, ...attractions, ...transport, ...other];

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">SmartTour</div>
        <nav>
          <Link href="/">Tổng quan vận hành</Link>
          <Link href="/quotes/tours">Tính giá tour</Link>
          <Link href="/quotes/combos" className="active">Tính giá combo</Link>
          <Link href="/suppliers">Nhà cung cấp</Link>
          <Link href="/landtours">LandTour / Combo</Link>
        </nav>
      </aside>
      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Báo giá</p>
            <h1>Giá combo</h1>
          </div>
          <div className="user"><Calculator size={18} /> Báo giá combo <Users size={18} /> Nhân sự vận hành</div>
        </header>
        <ServerPermissionNotice allowed={canViewQuotes} label={'xem v\u00e0 qu\u1ea3n l\u00fd b\u00e1o gi\u00e1 combo'} missingPermissions={['quote.view']} />
        {canViewQuotes ? (
          <QuoteCombosClient initialCombos={combos} suppliers={suppliers} />
        ) : null}
      </section>
    </main>
  );
}

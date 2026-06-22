import { Calculator, Users } from 'lucide-react';
import Link from 'next/link';
import { serverAuthHeaders } from '../../serverAuth';
import { ServerPermissionNotice, hasPermission, type PermissionUser } from '../../serverPermissions';
import QuoteToursClient from './QuoteToursClient';

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

export default async function QuoteToursPage() {
  const currentUser = await apiGet<PermissionUser | null>('/auth/me', null);
  const canViewQuotes = hasPermission(currentUser, 'quote.view') || hasPermission(currentUser, 'quote.manage');
  const quotes = canViewQuotes ? await apiGet('/quotes/tours', []) : [];
  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">SmartTour</div>
        <nav>
          <Link href="/">Tổng quan vận hành</Link>
          <Link href="/quotes/tours" className="active">Tính giá tour</Link>
          <Link href="/quotes/combos">Tính giá combo</Link>
          <Link href="/suppliers">Nhà cung cấp</Link>
          <Link href="/fit-tours">Tour khách lẻ FIT</Link>
          <Link href="/git-tours">Tour GIT</Link>
          <Link href="/landtours">LandTour / Combo</Link>
        </nav>
      </aside>
      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Báo giá</p>
            <h1>Tính giá tour</h1>
          </div>
          <div className="user"><Calculator size={18} /> Báo giá tour <Users size={18} /> Nhân sự vận hành</div>
        </header>
        <ServerPermissionNotice allowed={canViewQuotes} label={'xem v\u00e0 qu\u1ea3n l\u00fd b\u00e1o gi\u00e1 tour'} missingPermissions={['quote.view']} />
        {canViewQuotes ? (
          <QuoteToursClient initialQuotes={quotes} />
        ) : null}
      </section>
    </main>
  );
}

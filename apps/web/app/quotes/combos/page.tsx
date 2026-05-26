import { Calculator, Users } from 'lucide-react';
import Link from 'next/link';
import { serverAuthHeaders } from '../../serverAuth';
import QuoteCombosClient from './QuoteCombosClient';

export const dynamic = 'force-dynamic';

type Supplier = { id: string; name: string; supplierServices?: { id: string; serviceName: string; netPrice: string }[] };

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

export default async function QuoteCombosPage() {
  const [combos, hotels, flights, landtours, attractions, transport, other] = await Promise.all([
    apiGet('/quotes/combos', []),
    apiGet<Supplier[]>('/suppliers/hotels', []),
    apiGet<Supplier[]>('/suppliers/flights', []),
    apiGet<Supplier[]>('/suppliers/landtour-suppliers', []),
    apiGet<Supplier[]>('/suppliers/attraction-tickets', []),
    apiGet<Supplier[]>('/suppliers/transport', []),
    apiGet<Supplier[]>('/suppliers/other', []),
  ]);
  const suppliers = [...hotels, ...flights, ...landtours, ...attractions, ...transport, ...other];

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">SmartTour</div>
        <nav>
          <Link href="/">Dashboard vận hành</Link>
          <Link href="/quotes/tours">Tính giá tour</Link>
          <Link href="/quotes/combos" className="active">Tính giá combo</Link>
          <Link href="/suppliers">Nhà cung cấp</Link>
          <Link href="/landtours">LandTour / Combo</Link>
        </nav>
      </aside>
      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Bao gia</p>
            <h1>Gia combo</h1>
          </div>
          <div className="user"><Calculator size={18} /> Quote Combo <Users size={18} /> Nhân sự vận hành</div>
        </header>
        <QuoteCombosClient initialCombos={combos} suppliers={suppliers} />
      </section>
    </main>
  );
}

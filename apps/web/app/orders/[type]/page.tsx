import { ClipboardList, Users } from 'lucide-react';
import Link from 'next/link';
import { serverAuthHeaders } from '../../serverAuth';
import OrdersClient, { orderConfigs, OrderRouteType } from './OrdersClient';

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

export default async function OrdersPage({ params }: { params: Promise<{ type: OrderRouteType }> }) {
  const { type } = await params;
  const config = orderConfigs[type];
  const orders = config ? await apiGet(`/orders/${type}`, []) : [];

  if (!config) {
    return (
      <main className="shell">
        <aside className="sidebar"><div className="brand">SmartTour</div></aside>
        <section className="workspace"><h1>Loai don hang khong ton tai</h1></section>
      </main>
    );
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">SmartTour</div>
        <nav>
          <Link href="/">Dashboard van hanh</Link>
          <Link href="/orders/fit-tours" className={type === 'fit-tours' ? 'active' : ''}>Don Tour FIT</Link>
          <Link href="/orders/git-combos" className={type === 'git-combos' ? 'active' : ''}>Don GIT/Combo</Link>
          <Link href="/orders/landtours" className={type === 'landtours' ? 'active' : ''}>Don LandTour</Link>
          <Link href="/orders/hotel-bookings" className={type === 'hotel-bookings' ? 'active' : ''}>Booking phong KS</Link>
          <Link href="/orders/flight-orders" className={type === 'flight-orders' ? 'active' : ''}>Booking ve MB</Link>
          <Link href="/orders/single-services" className={type === 'single-services' ? 'active' : ''}>Dich vu le</Link>
          <Link href="/quotes/tours">Tinh gia tour</Link>
          <Link href="/quotes/combos">Tinh gia combo</Link>
          <Link href="/suppliers">Nha cung cap</Link>
        </nav>
      </aside>
      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Don hang/LKH</p>
            <h1>{config.title}</h1>
          </div>
          <div className="user"><ClipboardList size={18} /> {config.shortTitle} <Users size={18} /> Operator</div>
        </header>
        <OrdersClient type={type} config={config} initialOrders={orders} />
      </section>
    </main>
  );
}

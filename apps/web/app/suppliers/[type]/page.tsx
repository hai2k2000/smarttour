import { Package, Users } from 'lucide-react';
import Link from 'next/link';
import { serverAuthHeaders } from '../../serverAuth';
import GenericSupplierClient, { supplierConfigs, SupplierType } from './GenericSupplierClient';

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

export default async function SupplierTypePage({ params }: { params: Promise<{ type: SupplierType }> }) {
  const { type } = await params;
  const config = supplierConfigs[type];
  const suppliers = config ? await apiGet(`/suppliers/${type}`, []) : [];

  if (!config) {
    return (
      <main className="shell">
        <aside className="sidebar"><div className="brand">SmartTour</div></aside>
        <section className="workspace"><h1>Loại NCC không tồn tại</h1></section>
      </main>
    );
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">SmartTour</div>
        <nav>
          <Link href="/">Dashboard vận hành</Link>
          <Link href="/suppliers">Nhà cung cấp</Link>
          <Link href="/suppliers/hotels">NCC khách sạn</Link>
          <Link href="/suppliers/restaurants" className={type === 'restaurants' ? 'active' : ''}>NCC nhà hàng</Link>
          <Link href="/suppliers/flights" className={type === 'flights' ? 'active' : ''}>NCC vé máy bay</Link>
          <Link href="/suppliers/attraction-tickets" className={type === 'attraction-tickets' ? 'active' : ''}>NCC vé tham quan</Link>
          <Link href="/suppliers/landtour-suppliers" className={type === 'landtour-suppliers' ? 'active' : ''}>NCC Landtour</Link>
          <Link href="/fit-tours">Tour khách lẻ FIT</Link>
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Phân hệ nhà cung cấp</p>
            <h1>{config.title}</h1>
          </div>
          <div className="user"><Package size={18} /> {config.shortTitle} <Users size={18} /> Nhân sự vận hành</div>
        </header>

        <GenericSupplierClient type={type} config={config} initialSuppliers={suppliers} />
      </section>
    </main>
  );
}

import { Package, Users } from 'lucide-react';
import Link from 'next/link';
import { serverAuthHeaders } from '../../serverAuth';
import GenericSupplierClient, { type SupplierType } from './GenericSupplierClient';

export const dynamic = 'force-dynamic';

const apiBase = process.env.NEXT_PUBLIC_API_URL || '';

const supplierPageConfigs: Record<SupplierType, { title: string; shortTitle: string }> = {
  restaurants: { title: 'Nhà cung cấp nhà hàng', shortTitle: 'Nhà hàng' },
  flights: { title: 'Nhà cung cấp vé máy bay', shortTitle: 'Vé máy bay' },
  'attraction-tickets': { title: 'Nhà cung cấp vé tham quan', shortTitle: 'Vé tham quan' },
  'landtour-suppliers': { title: 'Nhà cung cấp Land Tour', shortTitle: 'Land Tour' },
  water: { title: 'Nhà cung cấp nước uống', shortTitle: 'Nước uống' },
  transport: { title: 'Nhà cung cấp vận chuyển', shortTitle: 'Vận chuyển' },
  bus: { title: 'Nhà xe tuyến cố định', shortTitle: 'Nhà xe' },
  other: { title: 'Nhà cung cấp chi phí khác', shortTitle: 'Chi phí khác' },
  villas: { title: 'Nhà cung cấp biệt thự', shortTitle: 'Biệt thự' },
  passport: { title: 'Nhà cung cấp visa và hộ chiếu', shortTitle: 'Visa và hộ chiếu' },
  guides: { title: 'Hướng dẫn viên', shortTitle: 'Hướng dẫn viên' },
  'series-tickets': { title: 'Vé series giữ chỗ', shortTitle: 'Vé series' },
};

async function apiGet<T>(path: string, fallback: T, label: string): Promise<{ data: T; error?: string }> {
  try {
    const response = await fetch(`${apiBase}/api${path}`, { cache: 'no-store', headers: await serverAuthHeaders() });
    if (!response.ok) return { data: fallback, error: `${label}: HTTP ${response.status} - ${response.statusText || 'Không tải được dữ liệu'}` };
    return { data: await response.json() };
  } catch (error) {
    return { data: fallback, error: `${label}: ${error instanceof Error ? error.message : 'Không tải được dữ liệu'}` };
  }
}

export default async function SupplierTypePage({ params }: { params: Promise<{ type: SupplierType }> }) {
  const { type } = await params;
  const config = supplierPageConfigs[type];
  const result = config ? await apiGet(`/suppliers/${type}`, [], `Tải danh sách ${config.shortTitle.toLowerCase()}`) : { data: [], error: '' };

  if (!config) {
    return (
      <main className="shell">
        <aside className="sidebar"><div className="brand">SmartTour</div></aside>
        <section className="workspace"><h1>Loại nhà cung cấp không tồn tại</h1></section>
      </main>
    );
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">SmartTour</div>
        <nav>
          <Link href="/">Tổng quan vận hành</Link>
          <Link href="/suppliers">Nhà cung cấp</Link>
          <Link href="/suppliers/hotels">Nhà cung cấp khách sạn</Link>
          <Link href="/suppliers/restaurants" className={type === 'restaurants' ? 'active' : ''}>Nhà cung cấp nhà hàng</Link>
          <Link href="/suppliers/flights" className={type === 'flights' ? 'active' : ''}>Nhà cung cấp vé máy bay</Link>
          <Link href="/suppliers/attraction-tickets" className={type === 'attraction-tickets' ? 'active' : ''}>Nhà cung cấp vé tham quan</Link>
          <Link href="/suppliers/landtour-suppliers" className={type === 'landtour-suppliers' ? 'active' : ''}>Nhà cung cấp Land Tour</Link>
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

        <GenericSupplierClient type={type} initialSuppliers={result.data} initialError={result.error} />
      </section>
    </main>
  );
}

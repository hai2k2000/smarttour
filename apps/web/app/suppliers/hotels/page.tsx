import { Building2, Users } from 'lucide-react';
import Link from 'next/link';
import { serverAuthHeaders } from '../../serverAuth';
import HotelSuppliersClient from './HotelSuppliersClient';

export const dynamic = 'force-dynamic';

const apiBase = process.env.NEXT_PUBLIC_API_URL || '';

async function apiGet<T>(path: string, fallback: T, label: string): Promise<{ data: T; error?: string }> {
  try {
    const response = await fetch(`${apiBase}/api${path}`, { cache: 'no-store', headers: await serverAuthHeaders() });
    if (!response.ok) return { data: fallback, error: `${label}: HTTP ${response.status} - ${response.statusText || 'Không tải được dữ liệu'}` };
    return { data: await response.json() };
  } catch (error) {
    return { data: fallback, error: `${label}: ${error instanceof Error ? error.message : 'Không tải được dữ liệu'}` };
  }
}

export default async function HotelSuppliersPage() {
  const hotels = await apiGet('/suppliers/hotels', [], 'Tải danh sách nhà cung cấp khách sạn');

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">SmartTour</div>
        <nav>
          <Link href="/">Tổng quan vận hành</Link>
          <Link href="/suppliers">Nhà cung cấp</Link>
          <Link href="/suppliers/hotels" className="active">Nhà cung cấp khách sạn</Link>
          <Link href="/tour-programs">Tour mẫu</Link>
          <Link href="/bookings">Booking tour</Link>
          <Link href="/fit-tours">Tour khách lẻ FIT</Link>
          <Link href="/git-tours">Tour GIT</Link>
          <Link href="/landtours">LandTour / Combo</Link>
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Phân hệ nhà cung cấp</p>
            <h1>Nhà cung cấp khách sạn</h1>
          </div>
          <div className="user"><Building2 size={18} /> Hồ sơ khách sạn <Users size={18} /> Nhân sự vận hành</div>
        </header>

        <HotelSuppliersClient initialHotels={hotels.data} initialError={hotels.error} />
      </section>
    </main>
  );
}

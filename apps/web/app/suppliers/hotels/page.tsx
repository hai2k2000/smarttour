import { Building2, Users } from 'lucide-react';
import Link from 'next/link';
import { serverAuthHeaders } from '../../serverAuth';
import { ServerPermissionNotice, hasPermission, type PermissionUser } from '../../serverPermissions';
import HotelSuppliersClient from './HotelSuppliersClient';

export const dynamic = 'force-dynamic';

const apiBase = process.env.NEXT_PUBLIC_API_URL || '';
const text = {
  loadFallback: 'Kh\u00f4ng t\u1ea3i \u0111\u01b0\u1ee3c d\u1eef li\u1ec7u',
  authError: 'T\u1ea3i quy\u1ec1n phi\u00ean \u0111\u0103ng nh\u1eadp th\u1ea5t b\u1ea1i',
  loadHotelsError: 'T\u1ea3i danh s\u00e1ch nh\u00e0 cung c\u1ea5p kh\u00e1ch s\u1ea1n',
  overview: 'T\u1ed5ng quan v\u1eadn h\u00e0nh',
  suppliers: 'Nh\u00e0 cung c\u1ea5p',
  hotelSuppliers: 'Nh\u00e0 cung c\u1ea5p kh\u00e1ch s\u1ea1n',
  tourPrograms: 'Tour m\u1eabu',
  bookings: 'Booking tour',
  fitTours: 'Tour kh\u00e1ch l\u1ebb FIT',
  gitTours: 'Tour GIT',
  landtours: 'LandTour / Combo',
  eyebrow: 'Ph\u00e2n h\u1ec7 nh\u00e0 cung c\u1ea5p',
  hotelProfile: 'H\u1ed3 s\u01a1 kh\u00e1ch s\u1ea1n',
  operationStaff: 'Nh\u00e2n s\u1ef1 v\u1eadn h\u00e0nh',
  viewHotelSuppliers: 'xem nh\u00e0 cung c\u1ea5p kh\u00e1ch s\u1ea1n',
};

async function apiGet<T>(path: string, fallback: T, label: string): Promise<{ data: T; error?: string }> {
  try {
    const response = await fetch(`${apiBase}/api${path}`, { cache: 'no-store', headers: await serverAuthHeaders() });
    if (!response.ok) return { data: fallback, error: `${label}: HTTP ${response.status} - ${response.statusText || text.loadFallback}` };
    return { data: await response.json() };
  } catch (error) {
    return { data: fallback, error: `${label}: ${error instanceof Error ? error.message : text.loadFallback}` };
  }
}

export default async function HotelSuppliersPage() {
  const currentUserResult = await apiGet<PermissionUser | null>('/auth/me', null, text.authError);
  const currentUser = currentUserResult.data;
  const canViewSuppliers = hasPermission(currentUser, 'supplier.view');
  const canManageSuppliers = hasPermission(currentUser, 'supplier.manage');
  void canManageSuppliers;
  const hotels = canViewSuppliers ? await apiGet('/suppliers/hotels', [], text.loadHotelsError) : { data: [] as never[] };
  const initialError = [currentUserResult.error, hotels.error].filter(Boolean).join('. ');

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">SmartTour</div>
        <nav>
          <Link href="/">{text.overview}</Link>
          <Link href="/suppliers">{text.suppliers}</Link>
          <Link href="/suppliers/hotels" className="active">{text.hotelSuppliers}</Link>
          <Link href="/tour-programs">{text.tourPrograms}</Link>
          <Link href="/bookings">{text.bookings}</Link>
          <Link href="/fit-tours">{text.fitTours}</Link>
          <Link href="/git-tours">{text.gitTours}</Link>
          <Link href="/landtours">{text.landtours}</Link>
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">{text.eyebrow}</p>
            <h1>{text.hotelSuppliers}</h1>
          </div>
          <div className="user"><Building2 size={18} /> {text.hotelProfile} <Users size={18} /> {text.operationStaff}</div>
        </header>

        <ServerPermissionNotice allowed={canViewSuppliers} label={text.viewHotelSuppliers} missingPermissions={['supplier.view']} />
        {canViewSuppliers ? (
          <HotelSuppliersClient initialHotels={hotels.data} initialError={initialError} />
        ) : null}
      </section>
    </main>
  );
}

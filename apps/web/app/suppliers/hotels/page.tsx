import { Building2, Users } from 'lucide-react';
import Link from 'next/link';
import { serverAuthHeaders } from '../../serverAuth';
import HotelSuppliersClient from './HotelSuppliersClient';

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

export default async function HotelSuppliersPage() {
  const hotels = await apiGet('/suppliers/hotels', []);

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">SmartTour</div>
        <nav>
          <Link href="/">Dashboard van hanh</Link>
          <Link href="/suppliers">Nha cung cap</Link>
          <Link href="/suppliers/hotels" className="active">NCC khach san</Link>
          <Link href="/tour-programs">Tour mau</Link>
          <Link href="/bookings">Booking tour</Link>
          <Link href="/fit-tours">Tour khach le FIT</Link>
          <Link href="/git-tours">Tour GIT</Link>
          <Link href="/landtours">LandTour / Combo</Link>
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Supplier hotel form</p>
            <h1>Nha cung cap khach san</h1>
          </div>
          <div className="user"><Building2 size={18} /> Hotel <Users size={18} /> Operator</div>
        </header>

        <HotelSuppliersClient initialHotels={hotels} />
      </section>
    </main>
  );
}

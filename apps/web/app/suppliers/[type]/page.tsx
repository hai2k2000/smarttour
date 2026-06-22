import { Package, Users } from 'lucide-react';
import Link from 'next/link';
import { serverAuthHeaders } from '../../serverAuth';
import { serverApiBase } from '../../serverApiBase';
import { ServerPermissionNotice, hasPermission, type PermissionUser } from '../../serverPermissions';
import GenericSupplierClient, { type SupplierType } from './GenericSupplierClient';

export const dynamic = 'force-dynamic';

const apiBase = serverApiBase();
const text = {
  loadFallback: 'Kh\u00f4ng t\u1ea3i \u0111\u01b0\u1ee3c d\u1eef li\u1ec7u',
  authError: 'T\u1ea3i quy\u1ec1n phi\u00ean \u0111\u0103ng nh\u1eadp th\u1ea5t b\u1ea1i',
  invalidType: 'Lo\u1ea1i nh\u00e0 cung c\u1ea5p kh\u00f4ng t\u1ed3n t\u1ea1i',
  overview: 'T\u1ed5ng quan v\u1eadn h\u00e0nh',
  suppliers: 'Nh\u00e0 cung c\u1ea5p',
  hotelSuppliers: 'Nh\u00e0 cung c\u1ea5p kh\u00e1ch s\u1ea1n',
  restaurants: 'Nh\u00e0 cung c\u1ea5p nh\u00e0 h\u00e0ng',
  flights: 'Nh\u00e0 cung c\u1ea5p v\u00e9 m\u00e1y bay',
  attractionTickets: 'Nh\u00e0 cung c\u1ea5p v\u00e9 tham quan',
  landtourSuppliers: 'Nh\u00e0 cung c\u1ea5p Landtour',
  fitTours: 'Tour kh\u00e1ch l\u1ebb FIT',
  eyebrow: 'Ph\u00e2n h\u1ec7 nh\u00e0 cung c\u1ea5p',
  operationStaff: 'Nh\u00e2n s\u1ef1 v\u1eadn h\u00e0nh',
  viewSuppliers: 'xem nh\u00e0 cung c\u1ea5p',
};

const supplierPageConfigs: Record<SupplierType, { title: string; shortTitle: string }> = {
  restaurants: { title: text.restaurants, shortTitle: 'Nh\u00e0 h\u00e0ng' },
  flights: { title: text.flights, shortTitle: 'V\u00e9 m\u00e1y bay' },
  vouchers: { title: 'Nh\u00e0 cung c\u1ea5p voucher', shortTitle: 'Vouchers' },
  'attraction-tickets': { title: text.attractionTickets, shortTitle: 'V\u00e9 tham quan' },
  'landtour-suppliers': { title: text.landtourSuppliers, shortTitle: 'Landtour' },
  water: { title: 'Nh\u00e0 cung c\u1ea5p n\u01b0\u1edbc su\u1ed1i', shortTitle: 'N\u01b0\u1edbc su\u1ed1i' },
  transport: { title: 'Nh\u00e0 cung c\u1ea5p v\u1eadn chuy\u1ec3n', shortTitle: 'V\u1eadn chuy\u1ec3n' },
  bus: { title: 'Nh\u00e0 xe tuy\u1ebfn c\u1ed1 \u0111\u1ecbnh', shortTitle: 'Nh\u00e0 xe' },
  other: { title: 'Nh\u00e0 cung c\u1ea5p chi ph\u00ed kh\u00e1c', shortTitle: 'Chi ph\u00ed kh\u00e1c' },
  villas: { title: 'Nh\u00e0 cung c\u1ea5p bi\u1ec7t th\u1ef1', shortTitle: 'Bi\u1ec7t th\u1ef1' },
  passport: { title: 'Nh\u00e0 cung c\u1ea5p visa v\u00e0 h\u1ed9 chi\u1ebfu', shortTitle: 'Visa v\u00e0 h\u1ed9 chi\u1ebfu' },
  guides: { title: 'H\u01b0\u1edbng d\u1eabn vi\u00ean', shortTitle: 'H\u01b0\u1edbng d\u1eabn vi\u00ean' },
  'series-tickets': { title: 'V\u00e9 series gi\u1eef ch\u1ed7', shortTitle: 'V\u00e9 series' },
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

export default async function SupplierTypePage({ params }: { params: Promise<{ type: SupplierType }> }) {
  const { type } = await params;
  const config = supplierPageConfigs[type];
  const currentUserResult = await apiGet<PermissionUser | null>('/auth/me', null, text.authError);
  const currentUser = currentUserResult.data;
  const canViewSuppliers = hasPermission(currentUser, 'supplier.view');
  const canManageSuppliers = hasPermission(currentUser, 'supplier.manage');
  void canManageSuppliers;
  const result = config && canViewSuppliers ? await apiGet(`/suppliers/${type}`, [], `T\u1ea3i danh s\u00e1ch ${config.shortTitle.toLowerCase()}`) : { data: [], error: '' };
  const initialError = [currentUserResult.error, result.error].filter(Boolean).join('. ');

  if (!config) {
    return (
      <main className="shell">
        <aside className="sidebar"><div className="brand">SmartTour</div></aside>
        <section className="workspace"><h1>{text.invalidType}</h1></section>
      </main>
    );
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">SmartTour</div>
        <nav>
          <Link href="/">{text.overview}</Link>
          <Link href="/suppliers">{text.suppliers}</Link>
          <Link href="/suppliers/hotels">{text.hotelSuppliers}</Link>
          <Link href="/suppliers/restaurants" className={type === 'restaurants' ? 'active' : ''}>{text.restaurants}</Link>
          <Link href="/suppliers/flights" className={type === 'flights' ? 'active' : ''}>{text.flights}</Link>
          <Link href="/suppliers/attraction-tickets" className={type === 'attraction-tickets' ? 'active' : ''}>{text.attractionTickets}</Link>
          <Link href="/suppliers/landtour-suppliers" className={type === 'landtour-suppliers' ? 'active' : ''}>{text.landtourSuppliers}</Link>
          <Link href="/fit-tours">{text.fitTours}</Link>
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">{text.eyebrow}</p>
            <h1>{config.title}</h1>
          </div>
          <div className="user"><Package size={18} /> {config.shortTitle} <Users size={18} /> {text.operationStaff}</div>
        </header>

        <ServerPermissionNotice allowed={canViewSuppliers} label={text.viewSuppliers} missingPermissions={['supplier.view']} />
        {canViewSuppliers ? (
          <GenericSupplierClient type={type} initialSuppliers={result.data} initialError={initialError} />
        ) : null}
      </section>
    </main>
  );
}

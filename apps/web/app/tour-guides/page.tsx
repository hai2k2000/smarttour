import { UserCheck, Users } from 'lucide-react';
import { serverAuthHeaders } from '../serverAuth';
import TourGuidesClient from './TourGuidesClient';

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

export default async function TourGuidesPage() {
  const guides = await apiGet('/tour-guides', []);

  return (
    <section className="workspace">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">HDV</p>
          <h1>Quan ly huong dan vien</h1>
        </div>
        <div className="pageHeaderActions">
          <span className="statusPill"><UserCheck size={14} /> Dieu hanh HDV</span>
          <span className="statusPill statusPillNeutral"><Users size={14} /> Operator</span>
        </div>
      </header>
      <TourGuidesClient initialGuides={guides} />
    </section>
  );
}

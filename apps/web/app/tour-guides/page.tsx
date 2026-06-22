import { UserCheck, Users } from 'lucide-react';
import { serverAuthHeaders } from '../serverAuth';
import { serverApiBase } from '../serverApiBase';
import { ServerPermissionNotice, hasPermission, type PermissionUser } from '../serverPermissions';
import TourGuidesClient from './TourGuidesClient';

export const dynamic = 'force-dynamic';

const apiBase = serverApiBase();

async function apiGet<T>(path: string, fallback: T): Promise<T> {
  try {
    const response = await fetch(`${apiBase}/api${path}`, { cache: 'no-store', headers: await serverAuthHeaders() });
    if (!response.ok) return fallback;
    return response.json();
  } catch {
    return fallback;
  }
}

export default async function TourHDVsPage() {
  const currentUser = await apiGet<PermissionUser | null>('/auth/me', null);
  const canViewGuides = hasPermission(currentUser, 'guide.view');
  const guides = canViewGuides ? await apiGet('/tour-guides', []) : [];

  return (
    <section className="workspace">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">Hướng dẫn viên</p>
          <h1>Quản lý hướng dẫn viên</h1>
        </div>
        <div className="pageHeaderActions">
          <span className="statusPill"><UserCheck size={14} /> Điều hành hướng dẫn viên</span>
          <span className="statusPill statusPillNeutral"><Users size={14} /> Nhân sự vận hành</span>
        </div>
      </header>
      <ServerPermissionNotice allowed={canViewGuides} label={'xem h\u01b0\u1edbng d\u1eabn vi\u00ean'} missingPermissions={['guide.view']} />
      {canViewGuides ? (
        <TourGuidesClient initialHDVs={guides} />
      ) : null}
    </section>
  );
}

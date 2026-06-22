import { ClipboardList, Users } from 'lucide-react';
import { serverAuthHeaders } from '../serverAuth';
import { serverApiBase } from '../serverApiBase';
import { ServerPermissionNotice, hasPermission, type PermissionUser } from '../serverPermissions';
import OperationVouchersClient from './OperationVouchersClient';

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

export default async function OperationVouchersPage() {
  const currentUser = await apiGet<PermissionUser | null>('/auth/me', null);
  const canViewVouchers = hasPermission(currentUser, 'operation.form.view') || hasPermission(currentUser, 'operation.form.manage');
  const vouchers = canViewVouchers ? await apiGet('/operation-vouchers?take=100', []) : [];

  return (
    <section className="workspace">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">Điều hành Tour</p>
          <h1>Phiếu điều hành dịch vụ</h1>
        </div>
        <div className="pageHeaderActions">
          <span className="statusPill"><ClipboardList size={14} /> Công nợ NCC</span>
          <span className="statusPill statusPillNeutral"><Users size={14} /> Nhân sự vận hành</span>
        </div>
      </header>
      <ServerPermissionNotice allowed={canViewVouchers} label={'xem phi\u1ebfu \u0111i\u1ec1u h\u00e0nh d\u1ecbch v\u1ee5'} missingPermissions={['operation.form.view']} />
      {canViewVouchers ? (
        <OperationVouchersClient initialVouchers={vouchers} />
      ) : null}
    </section>
  );
}

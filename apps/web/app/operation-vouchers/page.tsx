import { ClipboardList, Users } from 'lucide-react';
import { serverAuthHeaders } from '../serverAuth';
import OperationVouchersClient from './OperationVouchersClient';

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

export default async function OperationVouchersPage() {
  const vouchers = await apiGet('/operation-vouchers', []);

  return (
    <section className="workspace">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">Dieu hanh Tour</p>
          <h1>Phieu dieu hanh dich vu</h1>
        </div>
        <div className="pageHeaderActions">
          <span className="statusPill"><ClipboardList size={14} /> Cong no NCC</span>
          <span className="statusPill statusPillNeutral"><Users size={14} /> Operator</span>
        </div>
      </header>
      <OperationVouchersClient initialVouchers={vouchers} />
    </section>
  );
}

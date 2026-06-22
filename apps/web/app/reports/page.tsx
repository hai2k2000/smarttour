import { serverAuthHeaders } from '../serverAuth';
import { ServerPermissionNotice, hasPermission, type PermissionUser } from '../serverPermissions';
import ReportsClient from './ReportsClient';

export const dynamic = 'force-dynamic';

const apiBase = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/+$/, '');
const defaultOverviewPath = '/reports/overview?dateField=createdAt';
const defaultRevenuePath = '/reports/revenue/by-created-date?dateField=createdAt';

type ApiResult<T> = { data: T; error?: string };

async function responseError(response: Response) {
  try {
    const body = await response.clone().json();
    const message = body?.message;
    return Array.isArray(message) ? message.join(', ') : message || body?.error || response.statusText;
  } catch {
    const text = await response.text().catch(() => '');
    return text || response.statusText;
  }
}

async function apiGet<T>(label: string, path: string, fallback: T): Promise<ApiResult<T>> {
  try {
    const response = await fetch(`${apiBase}/api${path}`, { cache: 'no-store', headers: await serverAuthHeaders() });
    if (!response.ok) {
      const error = `${label}: HTTP ${response.status} - ${await responseError(response)}`;
      console.error(`[ReportsPage] ${error}`);
      return { data: fallback, error };
    }
    return { data: await response.json() };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Không rõ lỗi';
    const detail = `${label}: ${message}`;
    console.error(`[ReportsPage] ${detail}`);
    return { data: fallback, error: detail };
  }
}

export default async function ReportsPage() {
  const currentUserResult = await apiGet<PermissionUser | null>('Phien dang nhap', '/auth/me', null);
  const currentUser = currentUserResult.data;
  const canViewReports = hasPermission(currentUser, 'report.view');
  const canViewFinanceReports = hasPermission(currentUser, 'finance.cashflow.view');
  const canViewDebtReports = hasPermission(currentUser, 'finance.debt.view');
  const canExportReports = hasPermission(currentUser, 'report.export');
  const [overviewResult, revenueResult] = canViewReports ? await Promise.all([
    apiGet('Tong quan', defaultOverviewPath, {}),
    apiGet('Doanh thu mac dinh', defaultRevenuePath, { summary: {}, rows: [] }),
  ]) : [
    { data: {} },
    { data: { summary: {}, rows: [] } },
  ];
  const initialLoadErrors = [currentUserResult.error, overviewResult.error, revenueResult.error].filter(Boolean).join(' ');

  return (
    <section className="workspace reportWorkspace dashboardPage">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">Reporting & Analytics</p>
          <h1>Báo cáo tổng hợp</h1>
        </div>
        <div className="pageHeaderActions">
          <span className="statusPill">Phân quyền: Quản trị</span>
          <span className="statusPill statusPillNeutral">Nhóm dữ liệu: Tài chính</span>
          <span className="statusPill statusPillNeutral">Xuất dữ liệu: CSV</span>
        </div>
      </header>
      <ServerPermissionNotice allowed={canViewReports} label={'xem b\u00e1o c\u00e1o'} missingPermissions={['report.view']} />
      {canViewReports ? (
        <ReportsClient
          initialOverview={overviewResult.data as any}
          initialRevenue={revenueResult.data as any}
          initialMessage={initialLoadErrors || undefined}
          canViewFinanceReports={canViewFinanceReports}
          canViewDebtReports={canViewDebtReports}
          canExportReports={canExportReports}
        />
      ) : null}
    </section>
  );
}

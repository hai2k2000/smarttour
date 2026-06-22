import { ArrowLeft, CircleAlert, ClipboardList } from 'lucide-react';
import Link from 'next/link';
import { serverAuthHeaders } from '../../serverAuth';
import { serverApiBase } from '../../serverApiBase';
import { ServerPermissionNotice, hasPermission, type PermissionUser } from '../../serverPermissions';
import { isOrderRouteType, orderConfigs } from '../order-config';
import OrdersClient from './OrdersClient';

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

export default async function OrdersPage({ params }: { params: Promise<{ type: string }> }) {
  const { type: rawType } = await params;

  if (!isOrderRouteType(rawType)) {
    return (
      <section className="workspace orderWorkspace">
        <header className="pageHeader">
          <div>
            <p className="eyebrow">Đơn hàng / lữ hành</p>
            <h1>Loại đơn hàng không được hỗ trợ</h1>
          </div>
        </header>
        <section className="panel emptyState">
          <CircleAlert size={28} />
          <div>
            <strong>Không tìm thấy màn hình đơn hàng “{rawType}”.</strong>
            <p>Hãy chọn một loại đơn hàng hợp lệ từ thanh điều hướng.</p>
          </div>
          <div className="pageHeaderActions">
            <Link className="secondaryButton iconTextButton" href="/order-center"><ArrowLeft size={16} /> Trung tâm đơn hàng</Link>
            <Link className="secondaryButton iconTextButton" href="/orders/fit-tours"><ClipboardList size={16} /> Đơn tour FIT</Link>
          </div>
        </section>
      </section>
    );
  }

  const type = rawType;
  const config = orderConfigs[type];
  const currentUser = await apiGet<PermissionUser | null>('/auth/me', null);
  const canViewOrders = hasPermission(currentUser, 'order.view') || hasPermission(currentUser, 'order.manage');
  const orders = canViewOrders ? await apiGet(`/orders/${type}?take=100`, []) : [];

  return (
    <section className="workspace orderWorkspace">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">Đơn hàng / lữ hành</p>
          <h1>{config.pageTitle}</h1>
        </div>
        <div className="pageHeaderActions">
          <span className="statusPill"><ClipboardList size={15} /> {config.shortTitle}</span>
          <Link className="secondaryButton" href="/order-center">Trung tâm đơn hàng</Link>
        </div>
      </header>
      <ServerPermissionNotice allowed={canViewOrders} label={'xem v\u00e0 qu\u1ea3n l\u00fd \u0111\u01a1n h\u00e0ng'} missingPermissions={['order.view']} />
      {canViewOrders ? (
        <OrdersClient type={type} config={config} initialOrders={orders} />
      ) : null}
    </section>
  );
}

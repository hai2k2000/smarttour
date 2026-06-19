import { BriefcaseBusiness, CalendarDays, CheckCircle2, ClipboardList, Plus, UserCircle } from 'lucide-react';
import Link from 'next/link';
import { getWorkspaceData, WorkspaceOrder, WorkspacePayment, WorkspaceReceipt } from './workspace-data';

export const dynamic = 'force-dynamic';

const weekDays = ['CN', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];

export default async function WorkspacePage() {
  const data = await getWorkspaceData();
  const user = data.user;
  const today = new Date();
  const calendar = calendarDays(today, data.orders);
  const notifications = notificationRows(data.orders, data.receipts, data.payments);
  const topDebts = (data.finance.customerDebtRows || []).slice(0, 8);
  const pendingReceipts = data.receipts.filter((row) => row.approvalStatus !== 'APPROVED').slice(0, 5);

  return (
    <section className="workspace workspaceDeskPage">
      <header className="workspaceDeskHero panel">
        <div className="workspaceProfile">
          <div className="workspaceAvatar"><UserCircle size={58} /></div>
          <div>
            <p className="eyebrow">Hồ sơ chuyên viên</p>
            <h1>{user?.name || 'Admin SmartTour'}</h1>
            <span className="statusPill statusPillNeutral">{user?.roles?.[0]?.name || 'Người dùng hệ thống'}</span>
          </div>
        </div>
        <div className="workspaceWorkInfo">
          <InfoLine label="Ngày vào làm việc" value="Cập nhật thông tin" muted />
          <InfoLine label="Số ngày làm việc" value="-" />
          <InfoLine label="Thâm niên" value="-" />
        </div>
        <div className="workspaceWorkRatio">
          <h2>Tỉ lệ công việc</h2>
          <div className="workspaceLegend">
            <span><i style={{ background: '#22c7c7' }} /> Chưa bắt đầu ({data.operations.upcomingDepartures || 0})</span>
            <span><i style={{ background: '#8b5cf6' }} /> Đang kiểm tra ({data.operations.waitingSupplierConfirmations || 0})</span>
            <span><i style={{ background: '#60a5fa' }} /> Đang thực hiện ({data.operations.operatingTours || 0})</span>
            <span><i style={{ background: '#fb7185' }} /> Hủy ({data.orderDashboard.cancelled || 0})</span>
            <span><i style={{ background: '#f59e0b' }} /> Hoàn thành ({data.orderDashboard.completed || 0})</span>
          </div>
        </div>
      </header>

      <nav className="workspaceQuickActions panel" aria-label="Thao tác nhanh">
        <Link href="/operations"><Plus size={18} /> Tạo việc</Link>
        <Link href="/customers"><BriefcaseBusiness size={18} /> Tạo cơ hội</Link>
        <Link href="/bookings"><CalendarDays size={18} /> Tạo lịch hẹn</Link>
        <Link href="/customers"><UserCircle size={18} /> Tạo dữ liệu khách</Link>
        <Link href="/order-center"><ClipboardList size={18} /> Tạo đơn</Link>
      </nav>

      {data.errors.length ? <div className="workspaceNotice panel">Một số dữ liệu chưa tải được: {data.errors.slice(0, 3).join('; ')}</div> : null}

      <div className="workspaceDeskGrid">
        <aside className="workspaceSideStack">
          <section className="workspaceCard panel">
            <p className="eyebrow">Hồ sơ</p>
            <h2>Thông tin cá nhân</h2>
            <dl className="workspaceInfoList">
              <div><dt>ID</dt><dd>{user?.username || '-'}</dd></div>
              <div><dt>Email</dt><dd>{user?.email || '-'}</dd></div>
              <div><dt>Điện thoại</dt><dd>{user?.phone || '-'}</dd></div>
              <div><dt>Văn phòng</dt><dd>{user?.branch || 'Chi nhánh Tổng'}</dd></div>
            </dl>
          </section>

          <section className="workspaceCard panel">
            <p className="eyebrow">Lịch hôm nay</p>
            <h2>Lịch hẹn hôm nay</h2>
            <p>{todayOrders(data.orders).length ? `${todayOrders(data.orders).length} lịch khởi hành / dịch vụ trong hôm nay.` : 'Hôm nay không có lịch hẹn.'}</p>
            <Link className="workspaceGhostButton" href="/order-center">Xem lịch biểu đầy đủ</Link>
          </section>

          <section className="workspaceCard panel">
            <p className="eyebrow">Phiếu chờ duyệt</p>
            <h2>Phiếu cần duyệt</h2>
            <div className="workspacePendingTabs"><span>Phiếu thu</span><span>Phiếu chi</span></div>
            <div className="workspacePendingList">
              {pendingReceipts.map((row) => <PendingReceipt key={row.id || row.receiptCode} row={row} />)}
              {!pendingReceipts.length ? <p className="mutedText">Không có phiếu thu đang chờ.</p> : null}
            </div>
            <Link className="workspaceGhostButton" href="/finance?tab=pending">Xem tất cả Phiếu thu</Link>
          </section>

          <section className="workspaceCard panel workspaceCorporateCard">
            <p className="eyebrow">Doanh nghiệp</p>
            <h2>Thông tin doanh nghiệp</h2>
            <p>Chưa có tin tức.</p>
            <Link className="workspaceGhostButton" href="/security">Xem thêm thông tin</Link>
          </section>
        </aside>

        <main className="workspaceMainStack">
          <section className="workspaceCard panel">
            <div className="sectionHeader">
              <div>
                <p className="eyebrow">Thông báo</p>
                <h2>Thông báo bạn cần quan tâm</h2>
              </div>
              <Link href="/order-center">Đánh dấu đọc tất cả</Link>
            </div>
            <div className="workspaceNotificationList">
              {notifications.map((item) => (
                <article key={item.key}>
                  <span className="workspaceNotificationAvatar">{item.initial}</span>
                  <div><strong>{item.title}</strong><p>{item.description}</p></div>
                  <time>{item.time}</time>
                  <i />
                </article>
              ))}
              {!notifications.length ? <p className="tableEmptyState">Không có thông báo mới.</p> : null}
            </div>
            <Link className="workspaceInlineLink" href="/order-center">Xem tất cả thông báo</Link>
          </section>

          <section className="workspaceCard panel">
            <div className="workspaceCalendarHeader">
              <div><CalendarDays size={20} /><h2>Lịch khởi hành</h2></div>
              <strong>{monthTitle(today)}</strong>
              <Link href="/order-center">Xem tháng</Link>
            </div>
            <CalendarGrid days={calendar} />
          </section>

          <section className="workspaceCard panel">
            <div className="sectionHeader">
              <h2>Công việc của tôi</h2>
              <div className="workspaceTaskTabs"><span>Tất cả ({data.operations.overdueTasks || 0})</span><span>Ngày mai (0)</span><span>Quá hạn ({data.operations.overdueTasks || 0})</span><span>Hoàn thành ({data.orderDashboard.completed || 0})</span></div>
            </div>
            <div className="fitTableWrap compactListTableWrap">
              <table className="fitTable compactListTable workspaceTaskTable">
                <thead><tr><th>STT</th><th>Công việc</th><th>Dự án</th><th>Ưu tiên</th><th>Hạn hoàn thành</th><th>Trạng thái</th></tr></thead>
                <tbody>
                  {taskRows(data).map((task, index) => (
                    <tr key={task.title}>
                      <td>{index + 1}</td>
                      <td>{task.title}</td>
                      <td>{task.project}</td>
                      <td>{task.priority}</td>
                      <td>{task.due}</td>
                      <td><span className="statusPill statusPillNeutral">{task.status}</span></td>
                    </tr>
                  ))}
                  {!taskRows(data).length ? <tr><td colSpan={6} className="tableEmptyState">Không có công việc.</td></tr> : null}
                </tbody>
              </table>
            </div>
            <Link className="workspaceInlineLink" href="/operations">Xem tất cả công việc</Link>
          </section>
        </main>

        <aside className="workspaceDebtPanel">
          <section className="workspaceCard panel">
            <p className="eyebrow">Công nợ nổi bật</p>
            <h2>Công nợ khách hàng</h2>
            <div className="workspaceDebtList">
              {topDebts.map((row, index) => (
                <article key={row.id || row.name || index}>
                  <span>#{index + 1}</span>
                  <div><strong>{row.name || 'Khách hàng'}</strong><em>{row.phone || 'Chưa có số điện thoại'}</em></div>
                  <b>{money(row.balance)}</b>
                </article>
              ))}
              {!topDebts.length ? <p className="mutedText">Chưa có dòng công nợ khách hàng.</p> : null}
            </div>
            <Link className="workspaceGhostButton" href="/reports?tab=customer-debt">Xem tất cả công nợ</Link>
          </section>
        </aside>
      </div>
    </section>
  );
}

function InfoLine({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return <div><span>{label}</span><strong className={muted ? 'mutedText' : ''}>{value}</strong></div>;
}

function primaryReceiptTitle(row: WorkspaceReceipt) {
  return row.receiptName || row.payerName || row.customerName || row.receiptCode || row.code || 'Phiếu thu';
}
function secondaryReceiptInfo(row: WorkspaceReceipt) {
  const code = row.receiptCode || row.code || '';
  const party = row.payerName || row.customerName || '';
  const parts = [party, code ? `Mã: ${code}` : ''].filter(Boolean);
  return parts.length ? parts.join(' - ') : '-';
}

function PendingReceipt({ row }: { row: WorkspaceReceipt }) {
  return (
    <article>
      <CheckCircle2 size={18} />
      <div><strong>{primaryReceiptTitle(row)}</strong><span>{secondaryReceiptInfo(row)}</span></div>
      <b>{money(row.receiptAmount ?? row.amount ?? row.totalAmount)}</b>
      <em>Thu</em>
    </article>
  );
}

function CalendarGrid({ days }: { days: Array<{ date: Date; inMonth: boolean; orders: WorkspaceOrder[] }> }) {
  return (
    <div className="workspaceCalendarGrid">
      {weekDays.map((day) => <strong key={day}>{day}</strong>)}
      {days.map((day) => (
        <div key={day.date.toISOString()} className={day.inMonth ? '' : 'muted'}>
          <span>{day.date.getDate()}</span>
          {day.orders.slice(0, 3).map((order) => <p key={order.id || order.systemCode} title={`${order.type || 'Đơn'} - ${order.name || order.tourCode || ''}`}>{viType(order.type)} - {order.name || order.tourCode || order.systemCode}</p>)}
        </div>
      ))}
    </div>
  );
}

function notificationRows(orders: WorkspaceOrder[], receipts: WorkspaceReceipt[], payments: WorkspacePayment[]) {
  const orderRows = orders.slice(0, 5).map((order) => ({
    key: `order-${order.id || order.systemCode}`,
    initial: initials(order.operatorOwner || order.customerName || order.systemCode),
    title: order.operatorOwner || order.customerName || 'SmartTour',
    description: `Cập nhật đơn ${order.systemCode || order.tourCode || order.name || '-'}`,
    time: shortDate(order.startDate || order.endDate),
  }));
  const receiptRows = receipts.slice(0, 3).map((row) => ({
    key: `receipt-${row.id || row.receiptCode}`,
    initial: 'T',
    title: row.assignedStaff || row.payerName || 'Kế toán',
    description: `Phiếu thu ${row.receiptCode || row.code || row.receiptName || ''}`,
    time: shortDate(row.paymentDate),
  }));
  const paymentRows = payments.slice(0, 2).map((row) => ({
    key: `payment-${row.id || row.voucherCode}`,
    initial: 'C',
    title: row.assignedStaff || row.receiverName || 'Kế toán',
    description: `Phiếu chi ${row.voucherCode || row.code || row.voucherName || ''}`,
    time: shortDate(row.paymentDate),
  }));
  return [...orderRows, ...receiptRows, ...paymentRows].slice(0, 10);
}

function taskRows(data: Awaited<ReturnType<typeof getWorkspaceData>>) {
  const rows = [
    data.operations.overdueTasks ? { title: 'Xử lý công việc quá hạn', project: 'Điều hành tour', priority: 'Cao', due: 'Hôm nay', status: 'Cần xử lý' } : null,
    data.operations.waitingSupplierConfirmations ? { title: 'Xác nhận dịch vụ nhà cung cấp', project: 'Nhà cung cấp', priority: 'Cao', due: 'Hôm nay', status: 'Đang chờ' } : null,
    data.operations.pendingSupplierPayments ? { title: 'Duyệt đề nghị thanh toán NCC', project: 'Tài chính', priority: 'Trung bình', due: 'Hôm nay', status: 'Chờ duyệt' } : null,
    data.orderDashboard.unpaid ? { title: 'Đối soát đơn còn phải thu', project: 'Đơn hàng', priority: 'Trung bình', due: 'Tuần này', status: 'Đang theo dõi' } : null,
  ];
  return rows.filter(Boolean) as Array<{ title: string; project: string; priority: string; due: string; status: string }>;
}

function calendarDays(base: Date, orders: WorkspaceOrder[]) {
  const first = new Date(base.getFullYear(), base.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const key = dateKey(date);
    return {
      date,
      inMonth: date.getMonth() === base.getMonth(),
      orders: orders.filter((order) => dateKey(order.startDate) === key),
    };
  });
}

function todayOrders(orders: WorkspaceOrder[]) {
  return orders.filter((order) => dateKey(order.startDate) === dateKey(new Date()));
}

function dateKey(value?: string | Date | null) {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function monthTitle(value: Date) {
  return `Tháng ${value.getMonth() + 1} / ${value.getFullYear()}`;
}

function shortDate(value?: string | null) {
  if (!value) return '-';
  const [year, month, day] = value.slice(0, 10).split('-');
  return day && month && year ? `${day}/${month}/${year}` : value.slice(0, 10);
}

function money(value: unknown) {
  return `${numberValue(value).toLocaleString('vi-VN')}đ`;
}

function numberValue(value: unknown) {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function initials(value?: string | null) {
  const text = (value || 'ST').trim();
  const parts = text.split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : text.slice(0, 2)).toUpperCase();
}

function viType(value?: string | null) {
  const labels: Record<string, string> = {
    FIT_TOUR: 'Tour FIT',
    GIT_COMBO: 'Tour GIT',
    LANDTOUR: 'LandTour',
    HOTEL_BOOKING: 'Booking Hotel',
    SINGLE_SERVICE: 'Dịch vụ lẻ',
    FLIGHT_ORDER: 'Vé máy bay',
  };
  return labels[value || ''] || value || 'Đơn';
}

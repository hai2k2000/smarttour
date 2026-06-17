import { CalendarDays, CheckCircle2, ClipboardList, HandCoins, PieChart, ReceiptText, Route, WalletCards } from 'lucide-react';
import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { getWorkspaceData, MetricRow, WorkspaceOrder } from '../workspace-data';

export const dynamic = 'force-dynamic';

const weekDays = ['CN', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];

export default async function WorkspaceOverviewPage() {
  const data = await getWorkspaceData();
  const summary = data.overview || {};
  const financeSummary = data.finance.summary || {};
  const cashflowRows = data.finance.cashflowByMonth || [];
  const monthRows = chartRows(summary.byMonth || [], cashflowRows);
  const calendar = calendarDays(new Date(), data.orders);
  const reconciliationRows = (data.finance.reconciliationRows || []).slice(0, 8);
  const salesRows = salesRanking(data.orders).slice(0, 5);
  const customerRows = customerRanking(data.orders).slice(0, 7);
  const statusTotal = Math.max(numberValue(data.orderDashboard.total), 1);
  const completionPercent = Math.round((numberValue(data.orderDashboard.completed) / statusTotal) * 100);

  return (
    <section className="workspace workspaceOverviewPage">
      <header className="workspaceCeoHero">
        <div>
          <p className="eyebrow">CEO Analytics</p>
          <h1>CEO Analytics</h1>
          <span>Tổng quan điều hành, bán hàng, tài chính và công nợ theo dữ liệu SmartTour hiện tại.</span>
        </div>
        <div className="workspaceCeoHeroActions">
          <span>Ngày giờ: {new Date().toLocaleDateString('vi-VN')}</span>
          <Link href="/reports">Xem báo cáo</Link>
        </div>
      </header>

      {data.errors.length ? <div className="workspaceNotice panel">Một số dữ liệu chưa tải được: {data.errors.slice(0, 3).join('; ')}</div> : null}

      <section className="workspaceModuleTabs">
        {['Dòng bán hàng', 'Tạo công việc', 'Tạo phiếu đoàn DVT', 'Tạo thanh toán', 'Tạo booking phòng', 'Tạo dịch vụ', 'Tạo mail', 'Hệ thống'].map((item) => <span key={item}>{item}</span>)}
      </section>

      <section className="workspaceKpiGrid">
        <Kpi title="Doanh thu dự kiến" value={money(summary.totalRevenue)} hint="Theo đơn hàng" icon={<WalletCards size={18} />} tone="blue" />
        <Kpi title="Thực thu" value={money(summary.paidAmount)} hint="Phiếu thu đã ghi nhận" icon={<ReceiptText size={18} />} tone="green" />
        <Kpi title="Lợi nhuận" value={money(summary.profit)} hint="Sau chi phí trực tiếp" icon={<HandCoins size={18} />} tone="amber" />
        <Kpi title="Công nợ còn thu" value={money(summary.remainingRevenue)} hint="Cần theo dõi" icon={<ClipboardList size={18} />} tone="red" />
        <Kpi title="Tổng chi" value={money(summary.totalCost)} hint="Chi phí dự kiến" icon={<WalletCards size={18} />} tone="blue" />
        <Kpi title="Đã chi" value={money(summary.paidCost)} hint="Phiếu chi đã ghi nhận" icon={<HandCoins size={18} />} tone="green" />
        <Kpi title="Còn phải chi" value={money(summary.remainingCost)} hint="Công nợ NCC" icon={<ReceiptText size={18} />} tone="red" />
        <Kpi title="Đối soát lệch" value={numberValue(financeSummary.issueCount).toLocaleString('vi-VN')} hint="Dòng cần kiểm tra" icon={<CheckCircle2 size={18} />} tone="amber" />
        <Kpi title="Tổng đơn hàng" value={numberValue(summary.totalOrders).toLocaleString('vi-VN')} hint="Tất cả loại đơn" icon={<Route size={18} />} tone="blue" />
        <Kpi title="Khách hàng" value={numberValue(summary.totalCustomers).toLocaleString('vi-VN')} hint="Khách có giao dịch" icon={<PieChart size={18} />} tone="green" />
        <Kpi title="Phiếu thu" value={numberValue(financeSummary.receiptCount).toLocaleString('vi-VN')} hint={money(financeSummary.totalReceipt)} icon={<ReceiptText size={18} />} tone="blue" />
        <Kpi title="Phiếu chi" value={numberValue(financeSummary.paymentCount).toLocaleString('vi-VN')} hint={money(financeSummary.totalPayment)} icon={<HandCoins size={18} />} tone="red" />
      </section>

      <section className="workspaceAnalyticsGrid">
        <article className="workspaceCard panel workspaceChartPanel">
          <div className="sectionHeader">
            <h2>Doanh thu & chi phí</h2>
            <Link href="/reports">Xem chi tiết</Link>
          </div>
          <div className="workspaceMiniBarChart" aria-label="Biểu đồ doanh thu và chi phí">
            {monthRows.map((row) => <ChartMonth key={row.label} row={row} max={maxChart(monthRows)} />)}
          </div>
          <div className="workspaceChartLegend">
            <span><i style={{ background: '#1f2937' }} /> Doanh thu</span>
            <span><i style={{ background: '#ff6b1a' }} /> Chi phí</span>
            <span><i style={{ background: '#19a463' }} /> Lợi nhuận</span>
          </div>
        </article>

        <article className="workspaceCard panel workspaceDonutPanel">
          <div className="sectionHeader"><h2>Hiệu quả marketing</h2><span>{completionPercent}% hoàn tất</span></div>
          <div className="workspaceDonut" style={donutStyle(completionPercent)}><span>{completionPercent}%</span></div>
          <div className="workspaceChartLegend">
            <span><i style={{ background: '#2cc7c9' }} /> Hoàn tất</span>
            <span><i style={{ background: '#a78bfa' }} /> Còn lại</span>
          </div>
        </article>
      </section>

      <section className="workspaceCard panel">
        <div className="workspaceCalendarHeader">
          <div><CalendarDays size={20} /><h2>Điều hành khởi hành</h2></div>
          <strong>{monthTitle(new Date())}</strong>
          <Link href="/order-center">Month</Link>
        </div>
        <CalendarGrid days={calendar} />
      </section>

      <section className="workspaceAnalyticsGrid">
        <article className="workspaceCard panel">
          <div className="sectionHeader"><h2>Trạng thái vận hành</h2><Link href="/order-center">Xem chi tiết</Link></div>
          <div className="workspaceStatusCards">
            <MiniStatus label="Sắp khởi hành" value={data.orderDashboard.upcoming} />
            <MiniStatus label="Đang chạy" value={data.orderDashboard.running} />
            <MiniStatus label="Hoàn thành" value={data.orderDashboard.completed} />
            <MiniStatus label="Đã hủy" value={data.orderDashboard.cancelled} />
          </div>
        </article>
        <article className="workspaceCard panel">
          <div className="sectionHeader"><h2>Cơ cấu dịch vụ</h2><Link href="/reports">Xem chi tiết</Link></div>
          <div className="workspacePieRows">
            {(summary.byType || []).slice(0, 6).map((row) => <span key={row.key || row.label}><i />{row.label || row.key}: {numberValue(row.orderCount)}</span>)}
            {!(summary.byType || []).length ? <p className="mutedText">Chưa có dữ liệu theo loại dịch vụ.</p> : null}
          </div>
        </article>
      </section>

      <section className="workspaceCard panel">
        <div className="sectionHeader"><h2>Quản lý thực hiện</h2><Link href="/operations">Tạo lịch hẹn</Link></div>
        <div className="fitTableWrap compactListTableWrap">
          <table className="fitTable compactListTable workspaceActionTable">
            <thead><tr><th>STT</th><th>Tên việc</th><th>Nội dung</th><th>Hạn thời gian</th><th>Trạng thái</th></tr></thead>
            <tbody>
              {actionRows(data).map((row, index) => (
                <tr key={row.title}>
                  <td>{index + 1}</td>
                  <td>{row.title}</td>
                  <td>{row.content}</td>
                  <td>{row.due}</td>
                  <td><span className="statusPill statusPillNeutral">{row.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="workspaceAnalyticsGrid">
        <article className="workspaceCard panel">
          <div className="sectionHeader"><h2>Cơ cấu dịch vụ</h2><span>{numberValue(summary.totalOrders)} đơn</span></div>
          <div className="workspaceDonut workspaceDonutSmall" style={serviceDonut(summary.byType || [])}><span>{numberValue(summary.totalOrders)}</span></div>
        </article>
        <article className="workspaceCard panel">
          <div className="sectionHeader"><h2>Phiếu bán hàng thông minh</h2><Link href="/quotations">Xem chi tiết</Link></div>
          <div className="workspaceMiniBarChart workspaceMiniBarChartThin">
            <span className="workspaceMiniChartBar" style={{ height: `${Math.max(8, numberValue(data.quotations.total))}%`, background: '#2cc7c9' }} />
          </div>
        </article>
      </section>

      <section className="workspaceCard panel">
        <div className="sectionHeader"><h2>Báo cáo tài chính sâu</h2><Link href="/reports?tab=finance">Xem chi tiết</Link></div>
        <div className="fitTableWrap compactListTableWrap">
          <table className="fitTable compactListTable workspaceFinanceDeepTable">
            <thead><tr><th>Chỉ nhánh</th><th>Số nhóm sự kiện</th><th>Số đơn</th><th>Doanh thu</th><th>Thực thu</th><th>Còn thiếu</th><th>Lợi nhuận</th><th>Hoa hồng</th></tr></thead>
            <tbody>
              <tr>
                <td>Chi nhánh Tổng</td>
                <td>{numberValue(data.operations.upcomingDepartures)}</td>
                <td>{numberValue(summary.totalOrders)}</td>
                <td>{money(summary.totalRevenue)}</td>
                <td>{money(summary.paidAmount)}</td>
                <td className="financeAmountNegative">{money(summary.remainingRevenue)}</td>
                <td className="financeAmountPositive">{money(summary.profit)}</td>
                <td>{money(summary.commission)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="workspaceAnalyticsGrid">
        <article className="workspaceCard panel">
          <div className="sectionHeader"><h2>Nhân viên doanh chiến binh sales</h2><Link href="/reports?tab=employees">Xem chi tiết</Link></div>
          <RankingList rows={salesRows} empty="Chưa có dữ liệu nhân viên." />
        </article>
        <article className="workspaceCard panel">
          <div className="sectionHeader"><h2>Top khách hàng trung thành</h2><Link href="/customers">Xem chi tiết</Link></div>
          <RankingList rows={customerRows} empty="Chưa có dữ liệu khách hàng." />
        </article>
      </section>
    </section>
  );
}

function Kpi({ title, value, hint, icon, tone }: { title: string; value: string; hint: string; icon: ReactNode; tone: string }) {
  return <article className={`workspaceKpi workspaceKpi-${tone}`}><div>{icon}</div><span>{title}</span><strong>{value}</strong><em>{hint}</em></article>;
}

function ChartMonth({ row, max }: { row: { label: string; revenue: number; cost: number; profit: number }; max: number }) {
  return (
    <div className="workspaceMiniChartGroup">
      <div>
        <span className="workspaceMiniChartBar" style={{ height: barHeight(row.revenue, max), background: '#1f2937' }} />
        <span className="workspaceMiniChartBar" style={{ height: barHeight(row.cost, max), background: '#ff6b1a' }} />
        <span className="workspaceMiniChartBar" style={{ height: barHeight(Math.max(row.profit, 0), max), background: '#19a463' }} />
      </div>
      <small>{row.label}</small>
    </div>
  );
}

function CalendarGrid({ days }: { days: Array<{ date: Date; inMonth: boolean; orders: WorkspaceOrder[] }> }) {
  return (
    <div className="workspaceCalendarGrid workspaceOverviewCalendar">
      {weekDays.map((day) => <strong key={day}>{day}</strong>)}
      {days.map((day) => (
        <div key={day.date.toISOString()} className={day.inMonth ? '' : 'muted'}>
          <span>{day.date.getDate()}</span>
          {day.orders.slice(0, 3).map((order) => <p key={order.id || order.systemCode} title={`${viType(order.type)} - ${order.name || order.tourCode || ''}`}>{viType(order.type)} - {order.name || order.tourCode || order.systemCode}</p>)}
        </div>
      ))}
    </div>
  );
}

function MiniStatus({ label, value }: { label: string; value?: number }) {
  return <article><span>{label}</span><strong>{numberValue(value).toLocaleString('vi-VN')}</strong></article>;
}

function RankingList({ rows, empty }: { rows: Array<{ name: string; value: number }>; empty: string }) {
  return (
    <div className="workspaceRankingList">
      {rows.map((row, index) => <p key={row.name}><span>{index + 1}</span><strong>{row.name}</strong><b>{money(row.value)}</b></p>)}
      {!rows.length ? <p className="mutedText">{empty}</p> : null}
    </div>
  );
}

function actionRows(data: Awaited<ReturnType<typeof getWorkspaceData>>) {
  return [
    { title: 'Đối soát phiếu thu/chi', content: `${numberValue(data.finance.summary?.issueCount)} dòng cần kiểm tra`, due: 'Hôm nay', status: 'Cần xử lý' },
    { title: 'Xác nhận dịch vụ NCC', content: `${numberValue(data.operations.waitingSupplierConfirmations)} dịch vụ chờ xác nhận`, due: 'Hôm nay', status: 'Đang chờ' },
    { title: 'Theo dõi công nợ khách hàng', content: `${money(data.finance.summary?.customerDebtBalance)} còn phải thu`, due: 'Tuần này', status: 'Theo dõi' },
    { title: 'Duyệt đề nghị thanh toán', content: `${numberValue(data.operations.pendingSupplierPayments)} đề nghị đang mở`, due: 'Tuần này', status: 'Chờ duyệt' },
  ];
}

function chartRows(months: MetricRow[], cashflowRows: Array<{ key?: string; label?: string; receipt?: number; payment?: number; net?: number }>) {
  const rows = months.length ? months.slice(-12).map((row) => ({
    label: shortMonth(row.label || row.key),
    revenue: numberValue(row.revenue ?? row.paidAmount),
    cost: numberValue(row.cost ?? row.paidCost),
    profit: numberValue(row.profit),
  })) : cashflowRows.slice(-12).map((row) => ({
    label: shortMonth(row.label || row.key),
    revenue: numberValue(row.receipt),
    cost: numberValue(row.payment),
    profit: numberValue(row.net),
  }));
  return rows.length ? rows : [{ label: 'Tháng này', revenue: 0, cost: 0, profit: 0 }];
}

function maxChart(rows: Array<{ revenue: number; cost: number; profit: number }>) {
  return Math.max(1, ...rows.flatMap((row) => [row.revenue, row.cost, Math.max(row.profit, 0)]));
}

function barHeight(value: number, max: number) {
  return `${Math.max(4, Math.round((value / max) * 100))}%`;
}

function donutStyle(percent: number): CSSProperties {
  const value = Math.max(0, Math.min(100, percent));
  return { background: `conic-gradient(#2cc7c9 0 ${value}%, #a78bfa ${value}% 100%)` };
}

function serviceDonut(rows: MetricRow[]): CSSProperties {
  const total = Math.max(1, rows.reduce((sum, row) => sum + numberValue(row.orderCount), 0));
  let cursor = 0;
  const colors = ['#2cc7c9', '#60a5fa', '#a78bfa', '#fb923c', '#facc15', '#22c55e'];
  const stops = rows.slice(0, 6).map((row, index) => {
    const from = cursor;
    cursor += (numberValue(row.orderCount) / total) * 100;
    return `${colors[index]} ${from}% ${cursor}%`;
  });
  return { background: `conic-gradient(${stops.length ? stops.join(', ') : '#dbeafe 0 100%'})` };
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

function salesRanking(orders: WorkspaceOrder[]) {
  return ranking(orders, (order) => order.operatorOwner || order.createdBy || 'Chưa phân công');
}

function customerRanking(orders: WorkspaceOrder[]) {
  return ranking(orders, (order) => order.customerName || 'Khách chưa xác định');
}

function ranking(orders: WorkspaceOrder[], keyFn: (order: WorkspaceOrder) => string) {
  const rows = new Map<string, number>();
  orders.forEach((order) => {
    const key = keyFn(order);
    rows.set(key, (rows.get(key) || 0) + numberValue(order.totalRevenue));
  });
  return Array.from(rows.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
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

function shortMonth(value?: string | null) {
  if (!value) return '-';
  const text = String(value);
  const match = text.match(/^(\d{4})-(\d{2})/);
  return match ? `T${Number(match[2])}` : text.slice(0, 8);
}

function money(value: unknown) {
  return `${numberValue(value).toLocaleString('vi-VN')}đ`;
}

function numberValue(value: unknown) {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric : 0;
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

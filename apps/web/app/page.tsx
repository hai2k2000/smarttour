import { AlertTriangle, BadgeCheck, CalendarDays, ClipboardList, CreditCard, Route, TrendingUp, Users } from 'lucide-react';
import Link from 'next/link';
import { MetricCard, Panel, StatusBadge } from './ui';

const cards = [
  { label: 'Tour sắp khởi hành', value: '0', note: '7 ngày tới', icon: CalendarDays, tone: 'blue' },
  { label: 'Tour đang vận hành', value: '0', note: 'cần theo dõi', icon: Route, tone: 'green' },
  { label: 'Việc quá hạn', value: '0', note: 'việc điều hành', icon: ClipboardList, tone: 'red' },
  { label: 'Thanh toán chờ duyệt', value: '0', note: 'phiếu chi NCC', icon: CreditCard, tone: 'amber' },
  { label: 'Khách mới tháng này', value: '0', note: 'CRM', icon: Users, tone: 'indigo' },
  { label: 'Tour nguy cơ lỗ', value: '0', note: 'cần đối soát', icon: AlertTriangle, tone: 'red' },
] as const;

const quickActions = [
  { label: 'Tạo báo giá', href: '/quotations' },
  { label: 'Tạo đơn FIT', href: '/orders/fit-tours' },
  { label: 'Thêm khách hàng', href: '/customers' },
  { label: 'Xem công nợ', href: '/reports' },
  { label: 'Duyệt hoa hồng', href: '/commission-reports' },
];

const operations = [
  { step: 'Báo giá', target: 'Chốt giá và SmartLink', status: 'Sẵn sàng', href: '/quotations' },
  { step: 'Đơn hàng', target: 'Theo dõi booking và dịch vụ', status: 'Sẵn sàng', href: '/order-center' },
  { step: 'Điều hành', target: 'Phiếu điều hành, HDV, NCC', status: 'Sẵn sàng', href: '/operation-vouchers' },
  { step: 'Tài chính', target: 'Công nợ, lãi lỗ, hoa hồng', status: 'Sẵn sàng', href: '/reports' },
];

export default function Home() {
  return (
    <div className="dashboardPage">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">AI Tour Operations</p>
          <h1>Tổng quan vận hành AI Tour</h1>
        </div>
        <div className="pageHeaderActions">
          <Link className="secondaryButton iconTextButton" href="/reports"><TrendingUp size={16} /> Báo cáo</Link>
          <Link className="iconTextButton" href="/order-center"><BadgeCheck size={16} /> Trung tâm đơn hàng</Link>
        </div>
      </header>

      <section className="metrics dashboardMetrics">
        {cards.map((card) => <MetricCard key={card.label} {...card} />)}
      </section>

      <section className="dashboardGrid">
        <Panel>
          <div className="sectionHeader">
            <h2>Luồng xử lý chính</h2>
            <span>Luồng vận hành</span>
          </div>
          <div className="processList">
            {operations.map((item) => (
              <Link href={item.href} key={item.step}>
                <strong>{item.step}</strong>
                <span>{item.target}</span>
                <em>{item.status}</em>
              </Link>
            ))}
          </div>
        </Panel>

        <Panel>
          <div className="sectionHeader">
            <h2>Thao tác nhanh</h2>
            <span>Thao tác nhanh</span>
          </div>
          <div className="quickActionGrid">
            {quickActions.map((item) => <Link href={item.href} key={item.href}>{item.label}</Link>)}
          </div>
        </Panel>

        <Panel className="dashboardWide">
          <div className="sectionHeader">
            <h2>Trạng thái module</h2>
            <span>Đang chạy production</span>
          </div>
          <table className="dashboardTable">
            <tbody>
              <tr><td>CRM khách hàng</td><td>Dữ liệu nền, chăm sóc khách hàng, cơ hội bán hàng</td><td><StatusBadge>Sẵn sàng</StatusBadge></td></tr>
              <tr><td>Công cụ báo giá</td><td>SmartLink, duyệt báo giá, chuyển thành đơn</td><td><StatusBadge>Sẵn sàng</StatusBadge></td></tr>
              <tr><td>Trung tâm đơn hàng</td><td>Danh sách, lọc, quyết toán/mở khóa, xuất dữ liệu</td><td><StatusBadge>Sẵn sàng</StatusBadge></td></tr>
              <tr><td>Báo cáo tài chính</td><td>Lãi lỗ, công nợ, hoa hồng</td><td><StatusBadge>Sẵn sàng</StatusBadge></td></tr>
              <tr><td>Nhà cung cấp</td><td>Khách sạn, nhà hàng, vé máy bay, hướng dẫn viên, vận chuyển</td><td><StatusBadge>Sẵn sàng</StatusBadge></td></tr>
            </tbody>
          </table>
        </Panel>
      </section>
    </div>
  );
}

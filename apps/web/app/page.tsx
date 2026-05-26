import { AlertTriangle, BadgeCheck, CalendarDays, ClipboardList, CreditCard, Route, TrendingUp, Users } from 'lucide-react';
import Link from 'next/link';

const cards = [
  { label: 'Tour sắp khởi hành', value: '0', note: '7 ngày tới', icon: CalendarDays, tone: 'blue' },
  { label: 'Tour dang vận hành', value: '0', note: 'cần theo dõi', icon: Route, tone: 'green' },
  { label: 'Việc quá hạn', value: '0', note: 'operation task', icon: ClipboardList, tone: 'red' },
  { label: 'Thanh toán cho duyệt', value: '0', note: 'phiếu chi NCC', icon: CreditCard, tone: 'amber' },
  { label: 'Khách mới tháng này', value: '0', note: 'CRM', icon: Users, tone: 'indigo' },
  { label: 'Tour nguy cơ lỗ', value: '0', note: 'cần đối soát', icon: AlertTriangle, tone: 'red' },
];

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
          <p className="eyebrow">Du Niên Travel SmartTour</p>
          <h1>Dashboard vận hành Du Niên Travel</h1>
        </div>
        <div className="pageHeaderActions">
          <Link className="secondaryButton iconTextButton" href="/reports"><TrendingUp size={16} /> Báo cáo</Link>
          <Link className="iconTextButton" href="/order-center"><BadgeCheck size={16} /> Trung tâm đơn hàng</Link>
        </div>
      </header>

      <section className="metrics dashboardMetrics">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <article className={`metric metricTone-${card.tone}`} key={card.label}>
              <div className="metricTop">
                <div className="metricIcon"><Icon size={18} /></div>
                <span>{card.note}</span>
              </div>
              <span>{card.label}</span>
              <strong>{card.value}</strong>
            </article>
          );
        })}
      </section>

      <section className="dashboardGrid">
        <section className="panel">
          <div className="sectionHeader">
            <h2>Luồng xử lý chính</h2>
            <span>Operation core</span>
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
        </section>

        <section className="panel">
          <div className="sectionHeader">
            <h2>Thao tác nhanh</h2>
            <span>Shortcut</span>
          </div>
          <div className="quickActionGrid">
            {quickActions.map((item) => <Link href={item.href} key={item.href}>{item.label}</Link>)}
          </div>
        </section>

        <section className="panel dashboardWide">
          <div className="sectionHeader">
            <h2>Trạng thái module</h2>
            <span>Đang chạy production</span>
          </div>
          <table className="dashboardTable">
            <tbody>
              <tr><td>CRM khách hàng</td><td>Dữ liệu nền, CSKH, opportunity</td><td><span className="statusPill">Sẵn sàng</span></td></tr>
              <tr><td>Công cụ báo giá</td><td>SmartLink, approve, convert order</td><td><span className="statusPill">Sẵn sàng</span></td></tr>
              <tr><td>Trung tâm đơn hàng</td><td>List, filter, settle/unlock, export</td><td><span className="statusPill">Sẵn sàng</span></td></tr>
              <tr><td>Báo cáo tài chính</td><td>Lãi lỗ, công nợ, hoa hồng</td><td><span className="statusPill">Sẵn sàng</span></td></tr>
              <tr><td>Nhà cung cấp</td><td>Hotel, restaurant, flight, guide, transport</td><td><span className="statusPill">Sẵn sàng</span></td></tr>
            </tbody>
          </table>
        </section>
      </section>
    </div>
  );
}

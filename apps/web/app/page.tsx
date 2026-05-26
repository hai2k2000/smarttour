import { AlertTriangle, BadgeCheck, CalendarDays, ClipboardList, CreditCard, Route, TrendingUp, Users } from 'lucide-react';
import Link from 'next/link';

const cards = [
  { label: 'Tour sap khoi hanh', value: '0', note: '7 ngay toi', icon: CalendarDays, tone: 'blue' },
  { label: 'Tour dang vận hành', value: '0', note: 'can theo doi', icon: Route, tone: 'green' },
  { label: 'Viec qua han', value: '0', note: 'operation task', icon: ClipboardList, tone: 'red' },
  { label: 'Thanh toán cho duyệt', value: '0', note: 'phieu chi NCC', icon: CreditCard, tone: 'amber' },
  { label: 'Khach moi thang nay', value: '0', note: 'CRM', icon: Users, tone: 'indigo' },
  { label: 'Tour nguy co lo', value: '0', note: 'can doi soat', icon: AlertTriangle, tone: 'red' },
];

const quickActions = [
  { label: 'Tạo báo giá', href: '/quotations' },
  { label: 'Tạo đơn FIT', href: '/orders/fit-tours' },
  { label: 'Thêm khách hàng', href: '/customers' },
  { label: 'Xem cong no', href: '/reports' },
  { label: 'Duyet hoa hồng', href: '/commission-reports' },
];

const operations = [
  { step: 'Bao gia', target: 'Chot gia va SmartLink', status: 'Sẵn sàng', href: '/quotations' },
  { step: 'Đơn hàng', target: 'Theo doi booking va dich vu', status: 'Sẵn sàng', href: '/order-center' },
  { step: 'Dieu hanh', target: 'Phiếu điều hành, HDV, NCC', status: 'Sẵn sàng', href: '/operation-vouchers' },
  { step: 'Tài chính', target: 'Cong no, lai lo, hoa hồng', status: 'Sẵn sàng', href: '/reports' },
];

export default function Home() {
  return (
    <div className="dashboardPage">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">Travel Operations ERP</p>
          <h1>Dashboard vận hành SmartTour</h1>
        </div>
        <div className="pageHeaderActions">
          <Link className="secondaryButton iconTextButton" href="/reports"><TrendingUp size={16} /> Bao cao</Link>
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
            <h2>Luong xu ly chinh</h2>
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
            <span>MVP dang chay</span>
          </div>
          <table className="dashboardTable">
            <tbody>
              <tr><td>CRM khách hàng</td><td>Dữ liệu nền, CSKH, opportunity</td><td><span className="statusPill">Sẵn sàng</span></td></tr>
              <tr><td>Công cụ báo giá</td><td>SmartLink, approve, convert order</td><td><span className="statusPill">Sẵn sàng</span></td></tr>
              <tr><td>Trung tâm đơn hàng</td><td>List, filter, settle/unlock, export</td><td><span className="statusPill">Sẵn sàng</span></td></tr>
              <tr><td>Finance Reports</td><td>Lai lo, cong no, hoa hồng</td><td><span className="statusPill">Sẵn sàng</span></td></tr>
              <tr><td>Nhà cung cấp</td><td>Hotel, restaurant, flight, guide, transport</td><td><span className="statusPill">Sẵn sàng</span></td></tr>
            </tbody>
          </table>
        </section>
      </section>
    </div>
  );
}

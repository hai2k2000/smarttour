import { AlertTriangle, BadgeCheck, CalendarDays, ClipboardList, CreditCard, Route, TrendingUp, Users } from 'lucide-react';
import Link from 'next/link';

const cards = [
  { label: 'Tour sap khoi hanh', value: '0', note: '7 ngay toi', icon: CalendarDays, tone: 'blue' },
  { label: 'Tour dang van hanh', value: '0', note: 'can theo doi', icon: Route, tone: 'green' },
  { label: 'Viec qua han', value: '0', note: 'operation task', icon: ClipboardList, tone: 'red' },
  { label: 'Thanh toan cho duyet', value: '0', note: 'phieu chi NCC', icon: CreditCard, tone: 'amber' },
  { label: 'Khach moi thang nay', value: '0', note: 'CRM', icon: Users, tone: 'indigo' },
  { label: 'Tour nguy co lo', value: '0', note: 'can doi soat', icon: AlertTriangle, tone: 'red' },
];

const quickActions = [
  { label: 'Tao bao gia', href: '/quotations' },
  { label: 'Tao don FIT', href: '/orders/fit-tours' },
  { label: 'Them khach hang', href: '/customers' },
  { label: 'Xem cong no', href: '/reports' },
  { label: 'Duyet hoa hong', href: '/commission-reports' },
];

const operations = [
  { step: 'Bao gia', target: 'Chot gia va SmartLink', status: 'Ready', href: '/quotations' },
  { step: 'Don hang', target: 'Theo doi booking va dich vu', status: 'Ready', href: '/order-center' },
  { step: 'Dieu hanh', target: 'Phieu dieu hanh, HDV, NCC', status: 'Ready', href: '/operation-vouchers' },
  { step: 'Tai chinh', target: 'Cong no, lai lo, hoa hong', status: 'Ready', href: '/reports' },
];

export default function Home() {
  return (
    <div className="dashboardPage">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">Travel Operations ERP</p>
          <h1>Dashboard van hanh SmartTour</h1>
        </div>
        <div className="pageHeaderActions">
          <Link className="secondaryButton iconTextButton" href="/reports"><TrendingUp size={16} /> Bao cao</Link>
          <Link className="iconTextButton" href="/order-center"><BadgeCheck size={16} /> Order Center</Link>
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
            <h2>Thao tac nhanh</h2>
            <span>Shortcut</span>
          </div>
          <div className="quickActionGrid">
            {quickActions.map((item) => <Link href={item.href} key={item.href}>{item.label}</Link>)}
          </div>
        </section>

        <section className="panel dashboardWide">
          <div className="sectionHeader">
            <h2>Trang thai module</h2>
            <span>MVP dang chay</span>
          </div>
          <table className="dashboardTable">
            <tbody>
              <tr><td>CRM khach hang</td><td>Master data, CSKH, opportunity</td><td><span className="statusPill">Ready</span></td></tr>
              <tr><td>Quotation Engine</td><td>SmartLink, approve, convert order</td><td><span className="statusPill">Ready</span></td></tr>
              <tr><td>Order Center</td><td>List, filter, settle/unlock, export</td><td><span className="statusPill">Ready</span></td></tr>
              <tr><td>Finance Reports</td><td>Lai lo, cong no, hoa hong</td><td><span className="statusPill">Ready</span></td></tr>
              <tr><td>Nha cung cap</td><td>Hotel, restaurant, flight, guide, transport</td><td><span className="statusPill">Ready</span></td></tr>
            </tbody>
          </table>
        </section>
      </section>
    </div>
  );
}

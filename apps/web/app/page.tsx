import { BadgeCheck, Building2, CalendarDays, ClipboardList, CreditCard, Route, Users } from 'lucide-react';
import Link from 'next/link';

const nav = [
  'Dashboard van hanh',
  'Nha cung cap',
  'Tour mau',
  'Booking tour',
  'Phieu dieu hanh',
  'Cong viec van hanh',
  'Chi phi tour',
  'Thanh toan NCC',
  'Bao cao lai lo',
  'Cai dat',
];

const cards = [
  { label: 'Tour sap khoi hanh', value: '0', icon: CalendarDays },
  { label: 'Tour dang van hanh', value: '0', icon: Route },
  { label: 'Viec qua han', value: '0', icon: ClipboardList },
  { label: 'NCC cho xac nhan', value: '0', icon: Building2 },
  { label: 'Thanh toan cho duyet', value: '0', icon: CreditCard },
  { label: 'Tour nguy co lo', value: '0', icon: BadgeCheck },
];

const workflow = [
  'Tao nha cung cap',
  'Tao tour mau va lich trinh',
  'Tao booking tour',
  'Tao phieu dieu hanh',
  'Gan dich vu va NCC',
  'Theo doi chi phi va cong no',
];

export default function Home() {
  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">SmartTour</div>
        <nav>
          {nav.map((item) => (
            item === 'Nha cung cap' ? (
              <Link key={item} href="/suppliers">{item}</Link>
            ) : (
              <a key={item} className={item === 'Dashboard van hanh' ? 'active' : ''}>{item}</a>
            )
          ))}
        </nav>
      </aside>
      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Travel Operations ERP</p>
            <h1>Dashboard van hanh tour</h1>
          </div>
          <div className="user"><Users size={18} /> Operator</div>
        </header>

        <section className="metrics">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <article className="metric" key={card.label}>
                <div className="metricIcon"><Icon size={18} /></div>
                <span>{card.label}</span>
                <strong>{card.value}</strong>
              </article>
            );
          })}
        </section>

        <section className="contentGrid">
          <div className="panel">
            <h2>Luong MVP uu tien</h2>
            <ol>
              {workflow.map((item) => <li key={item}>{item}</li>)}
            </ol>
          </div>
          <div className="panel">
            <h2>Module tiep theo</h2>
            <table>
              <tbody>
                <tr><td>Supplier CRUD</td><td>In progress</td></tr>
                <tr><td>Tour Program</td><td>Planned</td></tr>
                <tr><td>Operation Form</td><td>Planned</td></tr>
                <tr><td>Cost & Supplier Debt</td><td>Planned</td></tr>
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </main>
  );
}

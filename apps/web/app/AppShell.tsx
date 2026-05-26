'use client';

import {
  BarChart3,
  BedDouble,
  Bell,
  BookOpen,
  BriefcaseBusiness,
  Calculator,
  ClipboardList,
  ClipboardCheck,
  FileCheck2,
  FileText,
  HandCoins,
  Home,
  Landmark,
  LayoutDashboard,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plane,
  ReceiptText,
  Route,
  Search,
  ShieldCheck,
  TicketCheck,
  Users,
  Warehouse,
  WalletCards,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode, useEffect, useMemo, useState } from 'react';

const groups = [
  {
    title: 'Tong quan',
    items: [
      { label: 'Dashboard', href: '/', icon: LayoutDashboard },
      { label: 'Order Center', href: '/order-center', icon: ClipboardList },
      { label: 'Bao cao lai lo', href: '/reports', icon: BarChart3 },
      { label: 'Bao cao hoa hong', href: '/commission-reports', icon: HandCoins },
    ],
  },
  {
    title: 'Ban hang',
    items: [
      { label: 'CRM khach hang', href: '/customers', icon: Users },
      { label: 'Quotation Engine', href: '/quotations', icon: Calculator },
      { label: 'Tinh gia tour', href: '/quotes/tours', icon: FileText },
      { label: 'Tinh gia combo', href: '/quotes/combos', icon: TicketCheck },
    ],
  },
  {
    title: 'Tai chinh / Ke toan',
    items: [
      { label: 'Tong quan tai chinh', href: '/finance', icon: WalletCards },
      { label: 'Phieu thu cho', href: '/finance?tab=pending', icon: ReceiptText },
      { label: 'Phieu thu', href: '/finance?tab=receipts', icon: ReceiptText },
      { label: 'Phieu chi', href: '/finance?tab=payments', icon: HandCoins },
      { label: 'Hoa don VAT', href: '/finance?tab=invoices', icon: FileText },
      { label: 'Dong tien', href: '/finance?tab=cashflow', icon: BarChart3 },
    ],
  },
  {
    title: 'Don hang',
    items: [
      { label: 'Don Tour FIT', href: '/orders/fit-tours', icon: Route },
      { label: 'Don GIT/Combo', href: '/orders/git-combos', icon: BriefcaseBusiness },
      { label: 'Don LandTour', href: '/orders/landtours', icon: Landmark },
      { label: 'Booking phong KS', href: '/orders/hotel-bookings', icon: BedDouble },
      { label: 'Booking ve MB', href: '/orders/flight-orders', icon: Plane },
      { label: 'Dich vu le', href: '/orders/single-services', icon: ReceiptText },
    ],
  },
  {
    title: 'San pham & van hanh',
    items: [
      { label: 'Tour mau', href: '/tour-programs', icon: BookOpen },
      { label: 'Booking tour', href: '/bookings', icon: FileCheck2 },
      { label: 'Tour khach le FIT', href: '/fit-tours', icon: Route },
      { label: 'Tour doan GIT', href: '/git-tours', icon: BriefcaseBusiness },
      { label: 'LandTour / Combo', href: '/landtours', icon: Landmark },
      { label: 'Phieu dieu hanh', href: '/operation-vouchers', icon: FileCheck2 },
      { label: 'Van hanh tour', href: '/operations', icon: ClipboardCheck },
      { label: 'Huong dan vien', href: '/tour-guides', icon: Users },
      { label: 'Nha cung cap', href: '/suppliers', icon: Warehouse },
    ],
  },
  {
    title: 'He thong',
    items: [
      { label: 'Phan quyen', href: '/security', icon: ShieldCheck },
    ],
  },
];

const shortcuts = [
  { label: 'Tao bao gia', href: '/quotations' },
  { label: 'Tao don', href: '/order-center' },
  { label: 'CRM', href: '/customers' },
];

const workflowLinks: Record<string, { label: string; href: string }[]> = {
  'Tong quan': [
    { label: 'Order Center', href: '/order-center' },
    { label: 'Bao cao lai lo', href: '/reports' },
    { label: 'Hoa hong', href: '/commission-reports' },
  ],
  'Ban hang': [
    { label: 'CRM', href: '/customers' },
    { label: 'Quotation', href: '/quotations' },
    { label: 'Tinh gia tour', href: '/quotes/tours' },
    { label: 'Tinh gia combo', href: '/quotes/combos' },
  ],
  'Tai chinh / Ke toan': [
    { label: 'Tong quan', href: '/finance' },
    { label: 'Thu cho', href: '/finance?tab=pending' },
    { label: 'Phieu thu', href: '/finance?tab=receipts' },
    { label: 'Phieu chi', href: '/finance?tab=payments' },
    { label: 'VAT', href: '/finance?tab=invoices' },
    { label: 'Dong tien', href: '/finance?tab=cashflow' },
  ],
  'Don hang': [
    { label: 'FIT', href: '/orders/fit-tours' },
    { label: 'GIT/Combo', href: '/orders/git-combos' },
    { label: 'LandTour', href: '/orders/landtours' },
    { label: 'Phong KS', href: '/orders/hotel-bookings' },
    { label: 'Ve MB', href: '/orders/flight-orders' },
    { label: 'Dich vu le', href: '/orders/single-services' },
  ],
  'San pham & van hanh': [
    { label: 'Tour mau', href: '/tour-programs' },
    { label: 'FIT', href: '/fit-tours' },
    { label: 'GIT', href: '/git-tours' },
    { label: 'LandTour', href: '/landtours' },
    { label: 'Dieu hanh', href: '/operation-vouchers' },
    { label: 'Van hanh', href: '/operations' },
    { label: 'NCC', href: '/suppliers' },
  ],
  'He thong': [
    { label: 'Users & Roles', href: '/security' },
    { label: 'Dang nhap', href: '/login' },
  ],
};

function currentPage(pathname: string) {
  const items = groups.flatMap((group) => group.items.map((item) => ({ ...item, group: group.title })));
  return items
    .filter((item) => item.href === '/' ? pathname === '/' : pathname.startsWith(item.href))
    .sort((a, b) => b.href.length - a.href.length)[0] || items[0];
}

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [authUser, setAuthUser] = useState<{ name: string; email: string } | null>(null);
  const page = currentPage(pathname);
  const PageIcon = page.icon;
  const relatedLinks = workflowLinks[page.group] || [];
  const allItems = useMemo(() => groups.flatMap((group) => group.items.map((item) => ({ ...item, group: group.title }))), []);
  const searchResults = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return [];
    return allItems
      .filter((item) => `${item.label} ${item.group} ${item.href}`.toLowerCase().includes(keyword))
      .slice(0, 8);
  }, [allItems, search]);

  useEffect(() => {
    setCollapsed(window.localStorage.getItem('smarttour.sidebar.collapsed') === 'true');
    const storedUser = window.localStorage.getItem('smarttour.auth.user');
    if (storedUser) {
      try {
        setAuthUser(JSON.parse(storedUser));
      } catch {
        window.localStorage.removeItem('smarttour.auth.user');
      }
    }
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandOpen(true);
      }
      if (event.key === 'Escape') setCommandOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem('smarttour.sidebar.collapsed', String(next));
      return next;
    });
  }

  function logout() {
    const token = window.localStorage.getItem('smarttour.auth.token');
    window.localStorage.removeItem('smarttour.auth.token');
    window.localStorage.removeItem('smarttour.auth.user');
    document.cookie = 'smarttour.auth.token=; path=/; max-age=0; samesite=lax';
    setAuthUser(null);
    if (token) {
      void fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/auth/logout`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(() => undefined);
    }
  }

  return (
    <div className={`appShell ${collapsed ? 'sidebarCollapsed' : ''}`}>
      <aside className={`appSidebar ${open ? 'open' : ''}`}>
        <div className="appBrand">
          <Link href="/" className="brandMark"><Home size={18} /> <span>SmartTour</span></Link>
          <div className="brandActions">
            <button className="collapseButton" onClick={toggleCollapsed} aria-label="Thu gon sidebar">
              {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            </button>
            <button className="mobileClose" onClick={() => setOpen(false)} aria-label="Dong menu"><X size={18} /></button>
          </div>
        </div>
        <nav className="appNav">
          {groups.map((group) => (
            <section key={group.title} className="navGroup">
              <h2>{group.title}</h2>
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
                return (
                  <Link key={item.href} href={item.href} className={active ? 'active' : ''} onClick={() => setOpen(false)}>
                    <Icon size={16} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </section>
          ))}
        </nav>
        <div className="sidebarFooter">
          <span>Workspace</span>
          <strong>Dunien Travel</strong>
        </div>
      </aside>
      <div className="appFrame">
        <header className="appTopbar">
          <button className="mobileMenu" onClick={() => setOpen(true)} aria-label="Mo menu"><Menu size={18} /></button>
          <div className="routeTitle">
            <span><PageIcon size={15} /> {page.group}</span>
            <strong>{page.label}</strong>
          </div>
          <label className={`globalSearch ${searchResults.length ? 'hasResults' : ''}`}>
            <Search size={16} />
            <input value={search} onFocus={() => setCommandOpen(true)} onChange={(event) => setSearch(event.target.value)} placeholder="Tim module, order, khach hang..." />
            <kbd>Ctrl K</kbd>
            {searchResults.length ? (
              <div className="searchResults">
                {searchResults.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link key={item.href} href={item.href} onClick={() => setSearch('')}>
                      <Icon size={16} />
                      <span>{item.label}</span>
                      <em>{item.group}</em>
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </label>
          <div className="topbarActions">
            <div className="topbarShortcuts">
              {shortcuts.map((item) => <Link key={item.href} href={item.href}>{item.label}</Link>)}
            </div>
            <button className="activityButton" onClick={() => setActivityOpen(true)} aria-label="Mo trung tam cong viec">
              <Bell size={16} />
              <span>3</span>
            </button>
            {authUser ? (
              <button className="authUserButton" onClick={logout} title={authUser.email}>
                {authUser.name}
              </button>
            ) : (
              <Link className="authLoginLink" href="/login">Dang nhap</Link>
            )}
            <span className="envPill">quanly.dunientravel.com</span>
            <span className="healthPill"><ShieldCheck size={15} /> Online</span>
          </div>
        </header>
        <div className="moduleStrip">
          {relatedLinks.map((item) => (
            <Link key={item.href} href={item.href} className={pathname === item.href || pathname.startsWith(`${item.href}/`) ? 'active' : ''}>{item.label}</Link>
          ))}
        </div>
        <main className="appMain">{children}</main>
      </div>
      {commandOpen ? (
        <div className="commandOverlay" onMouseDown={() => setCommandOpen(false)}>
          <section className="commandPalette" onMouseDown={(event) => event.stopPropagation()}>
            <div className="commandSearch">
              <Search size={18} />
              <input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nhap ten module hoac nghiep vu..." />
              <button onClick={() => setCommandOpen(false)} aria-label="Dong"><X size={18} /></button>
            </div>
            <div className="commandBody">
              {(search.trim() ? searchResults : allItems).slice(0, 12).map((item) => {
                const Icon = item.icon;
                return (
                  <Link key={item.href} href={item.href} onClick={() => { setSearch(''); setCommandOpen(false); }}>
                    <Icon size={18} />
                    <span>{item.label}</span>
                    <em>{item.group}</em>
                  </Link>
                );
              })}
            </div>
            <footer className="commandFooter">
              <span>Enter de mo module</span>
              <span>Esc de dong</span>
            </footer>
          </section>
        </div>
      ) : null}
      {activityOpen ? (
        <div className="activityOverlay" onMouseDown={() => setActivityOpen(false)}>
          <aside className="activityDrawer" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <p className="eyebrow">Workspace</p>
                <h2>Trung tam cong viec</h2>
              </div>
              <button onClick={() => setActivityOpen(false)} aria-label="Dong"><X size={18} /></button>
            </header>
            <section>
              <h3>Can xu ly</h3>
              <Link href="/order-center" onClick={() => setActivityOpen(false)}><strong>Don hang can doi soat</strong><span>Loc don chua thu/chi het</span></Link>
              <Link href="/commission-reports" onClick={() => setActivityOpen(false)}><strong>Hoa hong cho duyet</strong><span>Duyet va ghi nhan phieu chi</span></Link>
              <Link href="/reports" onClick={() => setActivityOpen(false)}><strong>Cong no khach/NCC</strong><span>Theo doi no phai thu va phai tra</span></Link>
            </section>
            <section>
              <h3>Thao tac nhanh</h3>
              <div className="activityQuick">
                {shortcuts.map((item) => <Link key={item.href} href={item.href} onClick={() => setActivityOpen(false)}>{item.label}</Link>)}
              </div>
            </section>
            <section>
              <h3>He thong</h3>
              <div className="activityHealth"><ShieldCheck size={16} /><span>Domain va API dang online</span></div>
            </section>
          </aside>
        </div>
      ) : null}
    </div>
  );
}

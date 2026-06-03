'use client';

import {
  BarChart3,
  BedDouble,
  Bell,
  BookOpen,
  BriefcaseBusiness,
  Calculator,
  ChevronDown,
  ClipboardList,
  ClipboardCheck,
  FileCheck2,
  FileText,
  HandCoins,
  Landmark,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plane,
  ReceiptText,
  Route,
  Search,
  Settings,
  ShieldCheck,
  TicketCheck,
  UserCircle,
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
    title: 'Tổng quan',
    items: [
      { label: 'Tổng quan AI Tour', href: '/', icon: LayoutDashboard },
      { label: 'Trung tâm đơn hàng', href: '/order-center', icon: ClipboardList },
      { label: 'Báo cáo lãi lỗ', href: '/reports', icon: BarChart3 },
      { label: 'Báo cáo hoa hồng', href: '/commission-reports', icon: HandCoins },
    ],
  },
  {
    title: 'Bán hàng',
    items: [
      { label: 'CRM khách hàng', href: '/customers', icon: Users },
      { label: 'Công cụ báo giá', href: '/quotations', icon: Calculator },
      { label: 'Tính giá tour', href: '/quotes/tours', icon: FileText },
      { label: 'Tính giá combo', href: '/quotes/combos', icon: TicketCheck },
    ],
  },
  {
    title: 'Tài chính / Kế toán',
    items: [
      { label: 'Tổng quan tài chính', href: '/finance', icon: WalletCards },
      { label: 'Phiếu thu chờ', href: '/finance?tab=pending', icon: ReceiptText },
      { label: 'Phiếu thu', href: '/finance', icon: ReceiptText },
      { label: 'Phiếu chi', href: '/finance?tab=payments', icon: HandCoins },
      { label: 'Hóa đơn VAT', href: '/finance?tab=invoices', icon: FileText },
      { label: 'Dòng tiền', href: '/finance?tab=cashflow', icon: BarChart3 },
    ],
  },
  {
    title: 'Đơn hàng',
    items: [
      { label: 'Đơn Tour FIT', href: '/orders/fit-tours', icon: Route },
      { label: 'Đơn GIT/Combo', href: '/orders/git-combos', icon: BriefcaseBusiness },
      { label: 'Đơn LandTour', href: '/orders/landtours', icon: Landmark },
      { label: 'Booking phòng KS', href: '/orders/hotel-bookings', icon: BedDouble },
      { label: 'Booking vé MB', href: '/orders/flight-orders', icon: Plane },
      { label: 'Dịch vụ lẻ', href: '/orders/single-services', icon: ReceiptText },
    ],
  },
  {
    title: 'Sản phẩm & vận hành',
    items: [
      { label: 'Tour mẫu', href: '/tour-programs', icon: BookOpen },
      { label: 'Booking tour', href: '/bookings', icon: FileCheck2 },
      { label: 'Tour khách lẻ FIT', href: '/fit-tours', icon: Route },
      { label: 'Tour đoàn GIT', href: '/git-tours', icon: BriefcaseBusiness },
      { label: 'LandTour / Combo', href: '/landtours', icon: Landmark },
      { label: 'Phiếu điều hành', href: '/operation-vouchers', icon: FileCheck2 },
      { label: 'Vận hành tour', href: '/operations', icon: ClipboardCheck },
      { label: 'Hướng dẫn viên', href: '/tour-guides', icon: Users },
      { label: 'Nhà cung cấp', href: '/suppliers', icon: Warehouse },
    ],
  },
  {
    title: 'Hệ thống',
    items: [
      { label: 'Phân quyền', href: '/security', icon: ShieldCheck },
    ],
  },
];

const shortcuts = [
  { label: 'Tạo báo giá', href: '/quotations' },
  { label: 'Tạo đơn', href: '/order-center' },
  { label: 'CRM', href: '/customers' },
];

const workflowLinks: Record<string, { label: string; href: string }[]> = {
  'Tổng quan': [
    { label: 'Trung tâm đơn hàng', href: '/order-center' },
    { label: 'Báo cáo lãi lỗ', href: '/reports' },
    { label: 'Hoa hồng', href: '/commission-reports' },
  ],
  'Bán hàng': [
    { label: 'CRM', href: '/customers' },
    { label: 'Báo giá', href: '/quotations' },
    { label: 'Tính giá tour', href: '/quotes/tours' },
    { label: 'Tính giá combo', href: '/quotes/combos' },
  ],
  'Tài chính / Kế toán': [
    { label: 'Tổng quan', href: '/finance' },
    { label: 'Thu chờ', href: '/finance?tab=pending' },
    { label: 'Phiếu thu', href: '/finance' },
    { label: 'Phiếu chi', href: '/finance?tab=payments' },
    { label: 'VAT', href: '/finance?tab=invoices' },
    { label: 'Dòng tiền', href: '/finance?tab=cashflow' },
  ],
  'Đơn hàng': [
    { label: 'FIT', href: '/orders/fit-tours' },
    { label: 'GIT/Combo', href: '/orders/git-combos' },
    { label: 'LandTour', href: '/orders/landtours' },
    { label: 'Phong KS', href: '/orders/hotel-bookings' },
    { label: 'Ve MB', href: '/orders/flight-orders' },
    { label: 'Dịch vụ lẻ', href: '/orders/single-services' },
  ],
  'Sản phẩm & vận hành': [
    { label: 'Tour mẫu', href: '/tour-programs' },
    { label: 'FIT', href: '/fit-tours' },
    { label: 'GIT', href: '/git-tours' },
    { label: 'LandTour', href: '/landtours' },
    { label: 'Điều hành', href: '/operation-vouchers' },
    { label: 'Vận hành', href: '/operations' },
    { label: 'NCC', href: '/suppliers' },
  ],
  'Hệ thống': [
    { label: 'Người dùng & vai trò', href: '/security' },
    { label: 'Đăng nhập', href: '/login' },
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
  const [accountOpen, setAccountOpen] = useState(false);
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
      if (event.key === 'Escape') {
        setCommandOpen(false);
        setAccountOpen(false);
      }
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
    setAccountOpen(false);
    if (token) {
      void fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/auth/logout`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(() => undefined);
    }
  }

  return (
    <div className={`appShell ${collapsed ? 'sidebarCollapsed' : ''}`}>
      <aside className={`appSidebar ${open ? 'open' : ''}`}>
        <div className="appBrand">
          <Link href="/" className="brandMark"><span className="textLogo">AI</span><span><strong>AI Tour</strong><em>Operations</em></span></Link>
          <div className="brandActions">
            <button className="collapseButton" onClick={toggleCollapsed} aria-label="Thu gọn thanh bên">
              {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            </button>
            <button className="mobileClose" onClick={() => setOpen(false)} aria-label="Đóng menu"><X size={18} /></button>
          </div>
        </div>
        <nav className="appNav">
          {groups.map((group) => (
            <section key={group.title} className="navGroup">
              <h2>{group.title}</h2>
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = item.href === '/' ? pathname === '/' : pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link key={item.href} href={item.href} prefetch={false} className={active ? 'active' : ''} onClick={() => setOpen(false)}>
                    <Icon size={16} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </section>
          ))}
        </nav>
        <div className="sidebarFooter">
          <span>AI Tour</span>
          <strong>Travel Operations</strong><small>Quản lý bán hàng, tour và vận hành</small>
        </div>
      </aside>
      <div className="appFrame">
        <header className="appTopbar">
          <button className="mobileMenu" onClick={() => setOpen(true)} aria-label="Mở menu"><Menu size={18} /></button>
          <div className="routeTitle">
            <span><PageIcon size={15} /> {page.group}</span>
            <strong>{page.label}</strong>
          </div>
          <label className={`globalSearch ${searchResults.length ? 'hasResults' : ''}`}>
            <Search size={16} />
            <input value={search} onFocus={() => setCommandOpen(true)} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm module, đơn hàng, khách hàng..." />
            <kbd>Ctrl K</kbd>
            {searchResults.length ? (
              <div className="searchResults">
                {searchResults.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link key={item.href} href={item.href} prefetch={false} onClick={() => setSearch('')}>
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
              {shortcuts.map((item) => <Link key={item.href} href={item.href} prefetch={false}>{item.label}</Link>)}
            </div>
            <button className="activityButton" onClick={() => setActivityOpen(true)} aria-label="Mở trung tâm công việc">
              <Bell size={16} />
              <span>3</span>
            </button>
            {authUser ? (
              <div className="accountMenuWrap">
                <button className="authUserButton" onClick={() => setAccountOpen((current) => !current)} title={authUser.email} aria-expanded={accountOpen} aria-haspopup="menu">
                  <UserCircle size={16} />
                  <span>{authUser.name}</span>
                  <ChevronDown size={14} />
                </button>
                {accountOpen ? (
                  <div className="accountMenu" role="menu">
                    <div className="accountMenuHeader">
                      <strong>{authUser.name}</strong>
                      <span>{authUser.email}</span>
                    </div>
                    <Link href="/security" prefetch={false} role="menuitem" onClick={() => setAccountOpen(false)}>
                      <Settings size={16} />
                      <span>Quản trị tài khoản</span>
                    </Link>
                    <Link href="/security" prefetch={false} role="menuitem" onClick={() => setAccountOpen(false)}>
                      <ShieldCheck size={16} />
                      <span>Phân quyền vai trò</span>
                    </Link>
                    <button type="button" role="menuitem" onClick={logout}>
                      <LogOut size={16} />
                      <span>Đăng xuất</span>
                    </button>
                  </div>
                ) : null}
              </div>
            ) : (
              <Link className="authLoginLink" href="/login">Đăng nhập</Link>
            )}
            <span className="envPill">AI Tour</span>
            <span className="healthPill"><ShieldCheck size={15} /> Online</span>
          </div>
        </header>
        <div className="moduleStrip">
          {relatedLinks.map((item) => (
            <Link key={item.href} href={item.href} prefetch={false} className={pathname === item.href || pathname.startsWith(`${item.href}/`) ? 'active' : ''}>{item.label}</Link>
          ))}
        </div>
        <main className="appMain">{children}</main>
      </div>
      {commandOpen ? (
        <div className="commandOverlay" onMouseDown={() => setCommandOpen(false)}>
          <section className="commandPalette" onMouseDown={(event) => event.stopPropagation()}>
            <div className="commandSearch">
              <Search size={18} />
              <input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nhập tên module hoặc nghiệp vụ..." />
              <button onClick={() => setCommandOpen(false)} aria-label="Đóng"><X size={18} /></button>
            </div>
            <div className="commandBody">
              {(search.trim() ? searchResults : allItems).slice(0, 12).map((item) => {
                const Icon = item.icon;
                return (
                  <Link key={item.href} href={item.href} prefetch={false} onClick={() => { setSearch(''); setCommandOpen(false); }}>
                    <Icon size={18} />
                    <span>{item.label}</span>
                    <em>{item.group}</em>
                  </Link>
                );
              })}
            </div>
            <footer className="commandFooter">
              <span>Enter để mở module</span>
              <span>Esc để đóng</span>
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
                <h2>Trung tâm công việc</h2>
              </div>
              <button onClick={() => setActivityOpen(false)} aria-label="Đóng"><X size={18} /></button>
            </header>
            <section>
              <h3>Cần xử lý</h3>
              <Link href="/order-center" onClick={() => setActivityOpen(false)}><strong>Đơn hàng can doi soat</strong><span>Lọc đơn chưa thu/chi hết</span></Link>
              <Link href="/commission-reports" onClick={() => setActivityOpen(false)}><strong>Hoa hồng chờ duyệt</strong><span>Duyệt và ghi nhận phiếu chi</span></Link>
              <Link href="/reports" onClick={() => setActivityOpen(false)}><strong>Công nợ khách/NCC</strong><span>Theo dõi nợ phải thu và phải trả</span></Link>
            </section>
            <section>
              <h3>Thao tác nhanh</h3>
              <div className="activityQuick">
                {shortcuts.map((item) => <Link key={item.href} href={item.href} onClick={() => setActivityOpen(false)}>{item.label}</Link>)}
              </div>
            </section>
            <section>
              <h3>Hệ thống</h3>
              <div className="activityHealth"><ShieldCheck size={16} /><span>Domain và API đang online</span></div>
            </section>
          </aside>
        </div>
      ) : null}
    </div>
  );
}

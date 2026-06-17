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
  LogIn,
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
import { usePathname, useSearchParams } from 'next/navigation';
import { ReactNode, Suspense, useEffect, useMemo, useState } from 'react';
import { clearAuthSession } from './authFetch';
import { orderNavigation } from './orders/order-config';

const LOGOUT_REQUEST_TIMEOUT_MS = 3000;

const orderIcons = {
  'fit-tours': Route,
  'git-combos': BriefcaseBusiness,
  landtours: Landmark,
  'hotel-bookings': BedDouble,
  'flight-orders': Plane,
  'single-services': ReceiptText,
};

function orderMenuItem(type: (typeof orderNavigation)[number]['type']) {
  const item = orderNavigation.find((entry) => entry.type === type);
  if (!item) throw new Error(`Missing order navigation item: ${type}`);
  return { label: item.label, href: item.href, icon: orderIcons[item.type] };
}

const groups = [
  {
    key: 'workspace',
    title: 'Workspace',
    icon: LayoutDashboard,
    items: [
      { label: 'Tổng quan AI Tour', href: '/', icon: LayoutDashboard },
      { label: 'Trung tâm đơn hàng', href: '/order-center', icon: ClipboardList },
      { label: 'Tour mẫu', href: '/tour-programs', icon: BookOpen },
    ],
  },
  {
    key: 'suppliers',
    title: 'Nhà cung cấp',
    icon: Warehouse,
    items: [
      { label: 'Tất cả nhà cung cấp', href: '/suppliers', icon: Warehouse },
      { label: 'Khách sạn', href: '/suppliers/hotels', icon: BedDouble },
      { label: 'Vouchers', href: '/suppliers/vouchers', icon: TicketCheck },
      { label: 'Vé tham quan', href: '/suppliers/attraction-tickets', icon: TicketCheck },
      { label: 'Nhà hàng', href: '/suppliers/restaurants', icon: ReceiptText },
      { label: 'Vé máy bay', href: '/suppliers/flights', icon: Plane },
      { label: 'LandTour', href: '/suppliers/landtour-suppliers', icon: Landmark },
      { label: 'Nước suối', href: '/suppliers/water', icon: ReceiptText },
      { label: 'Vận chuyển', href: '/suppliers/transport', icon: Route },
      { label: 'Nhà xe', href: '/suppliers/bus', icon: Route },
      { label: 'Chi phí khác', href: '/suppliers/other', icon: ReceiptText },
      { label: 'Villas', href: '/suppliers/villas', icon: Warehouse },
      { label: 'Hộ chiếu', href: '/suppliers/passport', icon: FileText },
      { label: 'Tour Guide', href: '/suppliers/guides', icon: Users },
      { label: 'Series vé', href: '/suppliers/series-tickets', icon: TicketCheck },
    ],
  },
  {
    key: 'crm',
    title: 'CRM',
    icon: Users,
    items: [
      { label: 'CRM khách hàng', href: '/customers', icon: Users },
    ],
  },
  {
    key: 'quotes',
    title: 'Báo Giá',
    icon: Calculator,
    items: [
      { label: 'Danh sách báo giá', href: '/quotations', icon: Calculator },
      { label: 'Báo giá tour', href: '/quotes/tours', icon: FileText },
      { label: 'Báo giá combo', href: '/quotes/combos', icon: TicketCheck },
    ],
  },
  {
    key: 'orders',
    title: 'Đơn hàng/LKH',
    icon: ClipboardList,
    items: [
      { label: 'Trung tâm đơn hàng', href: '/order-center', icon: ClipboardList },
      orderMenuItem('fit-tours'),
      orderMenuItem('git-combos'),
      orderMenuItem('landtours'),
      orderMenuItem('single-services'),
    ],
  },
  {
    key: 'hotel-bookings',
    title: 'Booking Phòng/Khách sạn',
    icon: BedDouble,
    items: [
      orderMenuItem('hotel-bookings'),
      { label: 'Nhà cung cấp khách sạn', href: '/suppliers/hotels', icon: Warehouse },
    ],
  },
  {
    key: 'flight-orders',
    title: 'Vé Máy Bay',
    icon: Plane,
    items: [
      orderMenuItem('flight-orders'),
      { label: 'Nhà cung cấp vé máy bay', href: '/suppliers/flights', icon: Plane },
      { label: 'Series vé giữ chỗ', href: '/suppliers/series-tickets', icon: TicketCheck },
    ],
  },
  {
    key: 'guides',
    title: 'Hướng dẫn viên',
    icon: Users,
    items: [
      { label: 'Danh sách hướng dẫn viên', href: '/tour-guides', icon: Users },
      { label: 'Nhà cung cấp hướng dẫn viên', href: '/suppliers/guides', icon: Warehouse },
    ],
  },
  {
    key: 'vehicles',
    title: 'Quản lý xe',
    icon: Route,
    items: [
      { label: 'Nhà cung cấp vận chuyển', href: '/suppliers/transport', icon: Route },
      { label: 'Nhà xe tuyến cố định', href: '/suppliers/bus', icon: Route },
      { label: 'Tàu thuyền / đường thủy', href: '/suppliers/water', icon: Landmark },
    ],
  },
  {
    key: 'operations',
    title: 'Điều hành Tour',
    icon: ClipboardCheck,
    items: [
      { label: 'Booking tour', href: '/bookings', icon: FileCheck2 },
      { label: 'Phiếu điều hành', href: '/operation-vouchers', icon: FileCheck2 },
      { label: 'Vận hành tour', href: '/operations', icon: ClipboardCheck },
      { label: 'Tour khách lẻ FIT', href: '/fit-tours', icon: Route },
      { label: 'Tour đoàn GIT', href: '/git-tours', icon: BriefcaseBusiness },
      { label: 'LandTour / Combo', href: '/landtours', icon: Landmark },
    ],
  },
  {
    key: 'finance',
    title: 'Tài chính/Kế toán',
    icon: WalletCards,
    items: [
      { label: 'Tổng quan tài chính', href: '/finance', icon: WalletCards },
      { label: 'Phiếu thu chờ', href: '/finance?tab=pending', icon: ReceiptText },
      { label: 'Phiếu thu', href: '/finance?tab=receipts', icon: ReceiptText },
      { label: 'Phiếu chi', href: '/finance?tab=payments', icon: HandCoins },
      { label: 'Hóa đơn VAT', href: '/finance?tab=invoices', icon: FileText },
      { label: 'Dòng tiền', href: '/finance?tab=cashflow', icon: BarChart3 },
      { label: 'Công nợ', href: '/finance?tab=debt', icon: WalletCards },
    ],
  },
  {
    key: 'kpis',
    title: 'KPIs',
    icon: BarChart3,
    items: [
      { label: 'Tổng quan KPIs', href: '/reports?view=kpis', icon: BarChart3 },
      { label: 'Hiệu suất nhân viên', href: '/reports?tab=employee-performance', icon: Users },
    ],
  },
  {
    key: 'commission',
    title: 'Hoa Hồng',
    icon: HandCoins,
    items: [
      { label: 'Báo cáo hoa hồng', href: '/commission-reports', icon: HandCoins },
      { label: 'Công nợ hoa hồng', href: '/finance?tab=debt', icon: WalletCards },
    ],
  },
  {
    key: 'projects',
    title: 'Dự án & Công việc',
    icon: BriefcaseBusiness,
    items: [
      { label: 'Dự án tour mẫu', href: '/tour-programs', icon: BookOpen },
      { label: 'Công việc điều hành', href: '/operations', icon: ClipboardCheck },
    ],
  },
  {
    key: 'hrm',
    title: 'HRM',
    icon: Users,
    items: [
      { label: 'Người dùng & vai trò', href: '/security?tab=users', icon: Users },
      { label: 'Phân quyền nhân sự', href: '/security?tab=roles', icon: ShieldCheck },
    ],
  },
  {
    key: 'marketing',
    title: 'Marketing',
    icon: Bell,
    items: [
      { label: 'Chiến dịch khách hàng', href: '/customers?view=campaigns', icon: Bell },
      { label: 'Tệp khách hàng CRM', href: '/customers', icon: Users },
    ],
  },
  {
    key: 'reports',
    title: 'Báo cáo',
    icon: BarChart3,
    items: [
      { label: 'Báo cáo tổng quan', href: '/reports', icon: BarChart3 },
      { label: 'Báo cáo tài chính', href: '/finance?tab=cashflow', icon: WalletCards },
      { label: 'Báo cáo công nợ', href: '/finance?tab=debt', icon: FileText },
    ],
  },
  {
    key: 'settings',
    title: 'Cài đặt hệ thống',
    icon: Settings,
    items: [
      { label: 'Phân quyền', href: '/security', icon: ShieldCheck },
      { label: 'Đăng nhập', href: '/login', icon: LogIn },
    ],
  },
];

const shortcuts = [
  { label: 'Tạo báo giá', href: '/quotations' },
  { label: 'Tạo đơn', href: '/order-center' },
  { label: 'CRM', href: '/customers' },
];

const workflowLinks: Record<string, { label: string; href: string }[]> = Object.fromEntries(
  groups.map((group) => [group.title, group.items.map((item) => ({ label: item.label, href: item.href }))]),
);

type SearchReader = Pick<URLSearchParams, 'get'>;
type ShellItem = (typeof groups)[number]['items'][number] & { group: string };

function normalizePath(value: string) {
  const [rawPath] = value.split('?');
  const path = rawPath.replace(/\/+$/, '');
  return path || '/';
}

function routeParts(href: string) {
  const [rawPath, rawQuery = ''] = href.split('?');
  return { path: normalizePath(rawPath || '/'), params: new URLSearchParams(rawQuery) };
}

function paramsEntries(params: URLSearchParams) {
  return Array.from(params.entries());
}

function paramsMatch(params: URLSearchParams, current: SearchReader) {
  return paramsEntries(params).every(([key, value]) => current.get(key) === value);
}

function pathMatches(currentPathname: string, itemPath: string) {
  const currentPath = normalizePath(currentPathname);
  return itemPath === '/' ? currentPath === '/' : currentPath === itemPath || currentPath.startsWith(`${itemPath}/`);
}

function hasMoreSpecificActivePeer(href: string, pathname: string, routePath: string, searchParams: SearchReader, peerItems: { href: string }[]) {
  return peerItems.some((item) => {
    if (item.href === href) return false;
    const peerRoute = routeParts(item.href);
    if (peerRoute.path === routePath || !peerRoute.path.startsWith(`${routePath}/`)) return false;
    if (!pathMatches(pathname, peerRoute.path)) return false;
    const peerHasQuery = paramsEntries(peerRoute.params).length > 0;
    return !peerHasQuery || paramsMatch(peerRoute.params, searchParams);
  });
}

function isRouteActive(href: string, pathname: string, searchParams: SearchReader, peerItems: { href: string }[] = []) {
  const route = routeParts(href);
  if (!pathMatches(pathname, route.path)) return false;

  const hasQuery = paramsEntries(route.params).length > 0;
  if (hasQuery) return paramsMatch(route.params, searchParams);

  const hasActiveQueryPeer = peerItems.some((item) => {
    if (item.href === href) return false;
    const peerRoute = routeParts(item.href);
    return peerRoute.path === route.path && paramsEntries(peerRoute.params).length > 0 && paramsMatch(peerRoute.params, searchParams);
  });
  return !hasActiveQueryPeer && !hasMoreSpecificActivePeer(href, pathname, route.path, searchParams, peerItems);
}

function currentPage(pathname: string, searchParams: SearchReader, items: ShellItem[]) {
  return items
    .filter((item) => isRouteActive(item.href, pathname, searchParams, items))
    .sort((a, b) => b.href.length - a.href.length)[0] || items
    .filter((item) => pathMatches(pathname, routeParts(item.href).path))
    .sort((a, b) => routeParts(b.href).path.length - routeParts(a.href).path.length)[0] || items[0];
}

function initialsFor(name?: string, email?: string) {
  const source = (name || email || 'AI').trim();
  const words = source.split(/\s+/).filter(Boolean);
  return (words.length > 1 ? `${words[0][0]}${words[words.length - 1][0]}` : source.slice(0, 2)).toUpperCase();
}

export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div className="appShellFallback" />}>
      <AppShellContent>{children}</AppShellContent>
    </Suspense>
  );
}

function AppShellContent({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [openNavGroups, setOpenNavGroups] = useState<Record<string, boolean>>({});
  const [activityOpen, setActivityOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [quickSearch, setQuickSearch] = useState({ query: '', focused: false });
  const [commandPalette, setCommandPalette] = useState({ open: false, query: '' });
  const [authUser, setAuthUser] = useState<{ name: string; email: string } | null>(null);
  const allItems = useMemo(() => groups.flatMap((group) => group.items.map((item) => ({ ...item, group: group.title }))), []);
  const page = currentPage(pathname, searchParams, allItems);
  const PageIcon = page.icon;
  const relatedLinks = workflowLinks[page.group] || [];
  const authName = authUser?.name?.trim() || 'Người dùng';
  const authEmail = authUser?.email?.trim() || 'Phiên đăng nhập đang hoạt động';
  const authInitials = initialsFor(authName, authEmail);
  const currentPathWithQuery = `${pathname}${searchKey ? `?${searchKey}` : ''}`;
  const quickSearchResults = useMemo(() => {
    const keyword = quickSearch.query.trim().toLowerCase();
    if (!keyword) return [];
    return allItems
      .filter((item) => `${item.label} ${item.group} ${item.href}`.toLowerCase().includes(keyword))
      .slice(0, 8);
  }, [allItems, quickSearch.query]);
  const commandSearchResults = useMemo(() => {
    const keyword = commandPalette.query.trim().toLowerCase();
    if (!keyword) return allItems.slice(0, 12);
    return allItems
      .filter((item) => `${item.label} ${item.group} ${item.href}`.toLowerCase().includes(keyword))
      .slice(0, 12);
  }, [allItems, commandPalette.query]);

  useEffect(() => {
    setCollapsed(window.localStorage.getItem('smarttour.sidebar.collapsed') === 'true');
    const storedNavGroups = window.localStorage.getItem('smarttour.sidebar.navGroups');
    if (storedNavGroups) {
      try {
        setOpenNavGroups(JSON.parse(storedNavGroups));
      } catch {
        window.localStorage.removeItem('smarttour.sidebar.navGroups');
      }
    }
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
        setQuickSearch((current) => ({ ...current, focused: false }));
        setCommandPalette({ open: true, query: '' });
      }
      if (event.key === 'Escape') {
        setQuickSearch((current) => ({ ...current, focused: false }));
        setCommandPalette((current) => ({ ...current, open: false }));
        setAccountOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    setOpen(false);
    setAccountOpen(false);
    setActivityOpen(false);
    setQuickSearch((current) => ({ ...current, focused: false }));
  }, [pathname, searchKey]);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    if (window.matchMedia('(max-width: 1100px)').matches) document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem('smarttour.sidebar.collapsed', String(next));
      return next;
    });
  }

  function toggleNavGroup(key: string, currentOpen: boolean) {
    setOpenNavGroups((current) => {
      const next = { ...current, [key]: !currentOpen };
      window.localStorage.setItem('smarttour.sidebar.navGroups', JSON.stringify(next));
      return next;
    });
  }

  async function logout() {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), LOGOUT_REQUEST_TIMEOUT_MS);
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        signal: controller.signal,
      });
    } catch {
      // Keep local logout deterministic even if the network request fails.
    } finally {
      window.clearTimeout(timeoutId);
    }
    clearAuthSession();
    setAuthUser(null);
    setAccountOpen(false);
    window.location.assign('/login');
  }

  function openCommandPalette() {
    setQuickSearch((current) => ({ ...current, focused: false }));
    setCommandPalette({ open: true, query: '' });
  }

  return (
    <div className={`appShell ${collapsed ? 'sidebarCollapsed' : ''}`}>
      {open ? <button type="button" className="sidebarScrim" aria-label="Đóng menu" onClick={() => setOpen(false)} /> : null}
      <aside className={`appSidebar ${open ? 'open' : ''}`} aria-label="Điều hướng chính">
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
          {groups.map((group) => {
            const GroupIcon = group.icon;
            const groupActive = group.items.some((item) => isRouteActive(item.href, pathname, searchParams, group.items));
            const groupOpen = openNavGroups[group.key] ?? groupActive;
            return (
              <section key={group.key} className={`navGroup ${groupOpen ? 'expanded' : 'collapsed'}`}>
                <button
                  type="button"
                  className={`navGroupHeader ${groupActive ? 'active' : ''}`}
                  aria-expanded={groupOpen}
                  aria-controls={`nav-group-${group.key}`}
                  onClick={() => toggleNavGroup(group.key, groupOpen)}
                >
                  <GroupIcon size={16} />
                  <span>{group.title}</span>
                  <ChevronDown className="navGroupToggleIcon" size={15} />
                </button>
                <div id={`nav-group-${group.key}`} className="navGroupItems">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active = isRouteActive(item.href, pathname, searchParams, group.items);
                    return (
                      <Link key={item.href} href={item.href} prefetch={false} className={active ? 'active' : ''} onClick={() => setOpen(false)}>
                        <Icon size={16} />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </nav>
        <div className="sidebarFooter">
          <span>AI Tour</span>
          <strong>Travel Operations</strong><small>Quản lý bán hàng, tour và vận hành</small>
        </div>
      </aside>
      <div className="appFrame">
        <header className="appTopbar">
          <div className="topbarInner">
            <button className="mobileMenu" onClick={() => setOpen(true)} aria-label="Mở menu"><Menu size={18} /></button>
            <div className="routeTitle">
              <span><PageIcon size={15} /> {page.group}</span>
              <strong>{page.label}</strong>
            </div>
            <div className={`globalSearch ${quickSearchResults.length && quickSearch.focused ? 'hasResults' : ''}`} role="search">
              <Search size={16} />
              <input
                aria-label="Tìm nhanh module"
                value={quickSearch.query}
                onChange={(event) => setQuickSearch({ query: event.target.value, focused: true })}
                onFocus={() => setQuickSearch((current) => ({ ...current, focused: true }))}
                placeholder="Tìm nhanh module, nghiệp vụ..."
              />
              <button type="button" className="searchShortcutButton" onClick={openCommandPalette}>Ctrl K</button>
              {quickSearchResults.length && quickSearch.focused ? (
                <div className="searchResults">
                  {quickSearchResults.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Link key={item.href} href={item.href} prefetch={false} onClick={() => setQuickSearch({ query: '', focused: false })}>
                        <Icon size={16} />
                        <span>{item.label}</span>
                        <em>{item.group}</em>
                      </Link>
                    );
                  })}
                </div>
              ) : null}
            </div>
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
                  <button className="authUserButton" onClick={() => setAccountOpen((current) => !current)} title={authEmail} aria-expanded={accountOpen} aria-haspopup="menu">
                    <span className="authAvatar">{authInitials}</span>
                    <span className="authUserMeta">
                      <strong>{authName}</strong>
                      <small>{authEmail}</small>
                    </span>
                    <ChevronDown size={14} />
                  </button>
                  {accountOpen ? (
                    <div className="accountMenu" role="menu">
                      <div className="accountMenuHeader">
                        <small>Tài khoản đang dùng</small>
                        <strong>{authName}</strong>
                        <span>{authEmail}</span>
                        <em>Đã xác thực</em>
                      </div>
                      <Link href="/security" prefetch={false} role="menuitem" onClick={() => setAccountOpen(false)}>
                        <UserCircle size={16} />
                        <span>Thông tin người dùng</span>
                      </Link>
                      <Link href="/security" prefetch={false} role="menuitem" onClick={() => setAccountOpen(false)}>
                        <Settings size={16} />
                        <span>Quản trị & phân quyền</span>
                      </Link>
                      <button type="button" role="menuitem" className="accountLogoutButton" onClick={logout}>
                        <LogOut size={16} />
                        <span>Đăng xuất khỏi hệ thống</span>
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : (
                <Link className="authLoginLink" href={`/login?next=${encodeURIComponent(currentPathWithQuery)}`}>
                  <LogIn size={15} />
                  <span>Đăng nhập</span>
                </Link>
              )}
              <span className="envPill">AI Tour</span>
              <span className="healthPill"><ShieldCheck size={15} /> Online</span>
            </div>
          </div>
        </header>
        <div className="moduleStrip">
          <div className="moduleStripInner">
            {relatedLinks.map((item) => (
              <Link key={item.href} href={item.href} prefetch={false} className={isRouteActive(item.href, pathname, searchParams, relatedLinks) ? 'active' : ''}>{item.label}</Link>
            ))}
          </div>
        </div>
        <main className="appMain">{children}</main>
      </div>
      {commandPalette.open ? (
        <div className="commandOverlay" onMouseDown={() => setCommandPalette((current) => ({ ...current, open: false }))}>
          <section className="commandPalette" onMouseDown={(event) => event.stopPropagation()}>
            <div className="commandSearch">
              <Search size={18} />
              <input autoFocus value={commandPalette.query} onChange={(event) => setCommandPalette((current) => ({ ...current, query: event.target.value }))} placeholder="Nhập tên module hoặc nghiệp vụ..." />
              <button onClick={() => setCommandPalette((current) => ({ ...current, open: false }))} aria-label="Đóng"><X size={18} /></button>
            </div>
            <div className="commandBody">
              {commandSearchResults.map((item) => {
                const Icon = item.icon;
                return (
                  <Link key={item.href} href={item.href} prefetch={false} onClick={() => setCommandPalette({ open: false, query: '' })}>
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
              <Link href="/order-center" onClick={() => setActivityOpen(false)}><strong>Đơn hàng cần đối soát</strong><span>Lọc đơn chưa thu/chi hết</span></Link>
              <Link href="/commission-reports" onClick={() => setActivityOpen(false)}><strong>Hoa hồng chờ duyệt</strong><span>Duyệt và ghi nhận phiếu chi</span></Link>
              <Link href="/reports" onClick={() => setActivityOpen(false)}><strong>Công nợ khách và nhà cung cấp</strong><span>Theo dõi nợ phải thu và phải trả</span></Link>
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

import './globals.css';
import type { ReactNode } from 'react';
import AppShell from './AppShell';
import TableRowDetailPopup from './TableRowDetailPopup';

export const metadata = {
  title: 'AI Tour | Operations',
  description: 'Hệ thống quản lý bán hàng, tour và vận hành của AI Tour',
  icons: {
    icon: '/favicon-32x32.png',
    shortcut: '/favicon-32x32.png',
    apple: '/icon-192.png',
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body>
        <AppShell>{children}</AppShell>
        <TableRowDetailPopup />
      </body>
    </html>
  );
}

import './globals.css';
import type { ReactNode } from 'react';
import AppShell from './AppShell';

export const metadata = {
  title: 'Du Niên Travel | SmartTour',
  description: 'Hệ thống quản lý vận hành tour của Du Niên Travel',
  icons: {
    icon: '/favicon-32x32.png',
    shortcut: '/favicon-32x32.png',
    apple: '/icon-192.png',
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body><AppShell>{children}</AppShell></body>
    </html>
  );
}

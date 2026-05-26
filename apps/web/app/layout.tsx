import './globals.css';
import type { ReactNode } from 'react';
import AppShell from './AppShell';

export const metadata = {
  title: 'SmartTour Operations',
  description: 'Travel operations ERP dashboard',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body><AppShell>{children}</AppShell></body>
    </html>
  );
}

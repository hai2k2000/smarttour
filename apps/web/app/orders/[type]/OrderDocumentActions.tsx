'use client';

import { Download, Printer } from 'lucide-react';
import { useState } from 'react';
import { authFetch, authHeaders } from '../../authFetch';
import { usePermissions } from '../../usePermissions';
import type { OrderRouteType } from '../order-config';
import { downloadOrderWord, type OrderDocumentModel, writeOrderPrintWindow } from './order-document';

type OrderDocumentActionsProps = {
  type: OrderRouteType;
  orderId: string | null;
  disabled: boolean;
  onMessage(message: string): void;
};

function browserApiBase() {
  const apiBase = process.env.NEXT_PUBLIC_API_URL || '';
  if (typeof window === 'undefined') return apiBase;
  if (apiBase.includes('smarttour-api-1')) return `http://${window.location.hostname}:4000`;
  return apiBase;
}

async function responseMessage(response: Response) {
  const data: unknown = await response.json().catch(() => null);
  if (data && typeof data === 'object' && 'message' in data) {
    const message = (data as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
    if (Array.isArray(message)) {
      const joined = message.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).join(', ');
      if (joined) return joined;
    }
  }
  return response.statusText || `HTTP ${response.status}`;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

export default function OrderDocumentActions({ type, orderId, disabled, onMessage }: OrderDocumentActionsProps) {
  const { can, permissionsReady } = usePermissions();
  const [busy, setBusy] = useState<'word' | 'print' | null>(null);
  const canViewOrders = can('order.view') || can('order.manage');
  const canExportDocuments = canViewOrders && can('order.export');

  if (!permissionsReady || type !== 'hotel-bookings') return null;
  if (!canExportDocuments || !orderId) return null;

  async function fetchModel() {
    const response = await authFetch(`${browserApiBase()}/api/orders/${type}/${orderId}/document`, {
      cache: 'no-store',
      headers: authHeaders(),
    });
    if (!response.ok) throw new Error(`Không tải được chứng từ: ${await responseMessage(response)}`);
    return response.json() as Promise<OrderDocumentModel>;
  }

  async function handleWord() {
    setBusy('word');
    try {
      const model = await fetchModel();
      downloadOrderWord(model);
      onMessage('Đã tải chứng từ Word-compatible (.doc).');
    } catch (error) {
      onMessage(errorMessage(error, 'Không tải được chứng từ Word.'));
    } finally {
      setBusy(null);
    }
  }

  async function handlePrint() {
    const popup = window.open('', '_blank');
    if (!popup) {
      onMessage('Không mở được cửa sổ In / PDF. Cho phép cửa sổ bật lên cho trang này rồi thử lại.');
      return;
    }

    setBusy('print');
    try {
      popup.opener = null;
      popup.document.open();
      popup.document.write('<!doctype html><html lang="vi"><head><title>Đang chuẩn bị chứng từ</title></head><body><p>Đang tải dữ liệu đã lưu...</p></body></html>');
      popup.document.close();
      const model = await fetchModel();
      writeOrderPrintWindow(popup, model);
      onMessage('Đã mở bản In / PDF từ dữ liệu đã lưu.');
    } catch (error) {
      try {
        popup.close();
      } catch {
        // The browser may deny access after the popup navigates or closes itself.
      }
      onMessage(errorMessage(error, 'Không mở được bản In / PDF.'));
    } finally {
      setBusy(null);
    }
  }

  const actionsDisabled = disabled || busy !== null;
  return (
    <>
      <button type="button" className="secondaryButton" disabled={actionsDisabled} onClick={handleWord}>
        <Download size={17} /> {busy === 'word' ? 'Đang tải Word...' : 'Tải Word'}
      </button>
      <button type="button" className="secondaryButton" disabled={actionsDisabled} onClick={handlePrint}>
        <Printer size={17} /> {busy === 'print' ? 'Đang mở In / PDF...' : 'In / PDF'}
      </button>
    </>
  );
}

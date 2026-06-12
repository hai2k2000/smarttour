'use client';

import { AlertTriangle, CheckCircle2, Info, Trash2 } from 'lucide-react';
import { authHeaders, authJsonHeaders } from '../authFetch';
import { SupplierFile, supplierFileHref } from './uploadSupplierFiles';

export type SupplierNotice = { type: 'success' | 'error' | 'info'; text: string };

export function browserSupplierApiBase() {
  const apiBase = (process.env.NEXT_PUBLIC_API_URL || '').trim().replace(/\/+$/, '');
  if (typeof window === 'undefined') return apiBase;
  if (!apiBase || apiBase.includes('smarttour-api-1')) return '';
  return apiBase;
}

export async function supplierApi<T>(path: string, init: RequestInit = {}, label = 'Thao tác') {
  const hasBody = init.body !== undefined && !(init.body instanceof FormData);
  const response = await fetch(`${browserSupplierApiBase()}${path}`, {
    cache: 'no-store',
    ...init,
    headers: {
      ...(hasBody ? authJsonHeaders() : authHeaders()),
      ...(init.headers || {}),
    },
  });
  const data = await parseResponse(response);
  if (!response.ok) {
    const detail = messageOf(data) || response.statusText || 'Không thực hiện được';
    throw new Error(`${label}: HTTP ${response.status} - ${detail}`);
  }
  return data as T;
}

export async function uploadSupplierFiles(supplierId: string, files: File[]) {
  const uploaded: SupplierFile[] = [];
  for (const file of files) {
    const body = new FormData();
    body.append('file', file);
    uploaded.push(await supplierApi<SupplierFile>(
      `/api/suppliers/${supplierId}/files`,
      { method: 'POST', body },
      `Tải file "${file.name}"`,
    ));
  }
  return uploaded;
}

export function SupplierNoticeBanner({ notice }: { notice: SupplierNotice | null }) {
  if (!notice) return null;
  const Icon = notice.type === 'success' ? CheckCircle2 : notice.type === 'error' ? AlertTriangle : Info;
  return (
    <div className={`supplierNotice ${notice.type === 'error' ? 'supplierNoticeError' : notice.type === 'info' ? 'supplierNoticeInfo' : ''}`} role="status">
      <Icon size={16} /> {notice.text}
    </div>
  );
}

export function SupplierStatus({ status }: { status: string }) {
  const inactive = status === 'INACTIVE' || status === 'STOP_SELL' || status === 'RELEASED';
  const warning = status === 'LOCKED' || status === 'COD_LOCKED';
  const label = supplierStatusLabel(status);
  return <span className={`statusPill ${inactive ? 'statusPillError' : warning ? 'statusPillWarning' : 'statusPillSuccess'}`} title={label}>{label}</span>;
}

export function SupplierFiles({
  files,
  busy,
  canManage,
  onDelete,
}: {
  files: SupplierFile[];
  busy: boolean;
  canManage: boolean;
  onDelete: (file: SupplierFile) => void;
}) {
  if (!files.length) return <div className="supplierFilesEmpty">Chưa có file đính kèm.</div>;
  return (
    <div className="attachmentList">
      {files.map((file) => (
        <div className="attachmentItem" key={file.id}>
          <div>
            <a href={supplierFileHref(browserSupplierApiBase(), file.fileUrl)} target="_blank" rel="noreferrer">{file.fileName}</a>
            <span>{file.fileType || 'Tệp đính kèm'}</span>
          </div>
          <button
            type="button"
            className="dangerButton iconButton"
            disabled={!canManage || busy}
            onClick={() => onDelete(file)}
            aria-label={`Xóa file ${file.fileName}`}
            title="Xóa file"
          >
            <Trash2 size={15} />
          </button>
        </div>
      ))}
    </div>
  );
}

export const supplierLifecycleStatuses = ['ACTIVE', 'INACTIVE'] as const;
export type SupplierLifecycleStatus = (typeof supplierLifecycleStatuses)[number];

const supplierStatusLabels: Record<string, string> = {
    ACTIVE: 'Đang hoạt động',
    INACTIVE: 'Ngừng hoạt động',
    STOP_SELL: 'Dừng bán',
    COD_LOCKED: 'Đã khóa theo hạn chốt',
    LOCKED: 'Đang giữ chỗ',
    CONFIRMED: 'Đã xác nhận',
    RELEASED: 'Đã giải phóng',
};

export const supplierLifecycleStatusOptions = supplierLifecycleStatuses.map((value) => ({
  value,
  label: supplierStatusLabels[value],
}));

export function supplierStatusLabel(status: string) {
  return supplierStatusLabels[status] || status;
}

export function dayTypeLabel(value: string) {
  return {
    ALL_DAYS: 'Tất cả các ngày',
    WEEKDAY: 'Ngày thường',
    WEEKEND: 'Cuối tuần',
    HOLIDAY: 'Ngày lễ',
    PEAK: 'Cao điểm',
  }[value] || value;
}

export function messageOf(data: unknown) {
  if (!data) return '';
  if (typeof data === 'string') return data;
  if (typeof data === 'object') {
    const value = data as { message?: unknown; error?: unknown };
    if (Array.isArray(value.message)) return value.message.join(', ');
    if (typeof value.message === 'string') return value.message;
    if (typeof value.error === 'string') return value.error;
  }
  return '';
}

async function parseResponse(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

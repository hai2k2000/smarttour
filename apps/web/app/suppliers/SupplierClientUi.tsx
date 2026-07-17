'use client';

import { AlertTriangle, CheckCircle2, Info, Trash2 } from 'lucide-react';
import { authFetch, authHeaders, authJsonHeaders } from '../authFetch';
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
  const response = await authFetch(`${browserSupplierApiBase()}${path}`, {
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

export type SupplierChildRow = { id?: string | null };

export function rowIdSet<T extends SupplierChildRow>(rows: T[]) {
  return new Set(rows.map((row) => row.id).filter((id): id is string => Boolean(id)));
}

async function syncSupplierChildRows<T extends SupplierChildRow>(
  originalRows: T[],
  nextRows: T[],
  pathForRow: (row: SupplierChildRow) => string,
  label: string,
) {
  const nextIds = rowIdSet(nextRows);
  for (const row of originalRows) {
    if (row.id && !nextIds.has(row.id)) {
      await supplierApi(pathForRow(row), { method: 'DELETE' }, `${label}: xóa dòng`);
    }
  }
  for (const row of nextRows.filter((item) => item.id)) {
    const { id, ...body } = row;
    await supplierApi(pathForRow(row), { method: 'PUT', body: JSON.stringify(body) }, `${label}: cập nhật dòng`);
  }
  for (const row of nextRows.filter((item) => !item.id)) {
    const { id, ...body } = row;
    void id;
    await supplierApi(pathForRow(row), { method: 'POST', body: JSON.stringify(body) }, `${label}: thêm dòng`);
  }
}

export function syncSupplierContacts(supplierId: string, originalRows: SupplierChildRow[], nextRows: SupplierChildRow[]) {
  return syncSupplierChildRows(
    originalRows,
    nextRows,
    (row) => row.id ? `/api/suppliers/${supplierId}/contacts/${row.id}` : `/api/suppliers/${supplierId}/contacts`,
    'Đồng bộ liên hệ nhà cung cấp',
  );
}

export function syncSupplierServices(supplierId: string, originalRows: SupplierChildRow[], nextRows: SupplierChildRow[]) {
  return syncSupplierChildRows(
    originalRows,
    nextRows,
    (row) => row.id ? `/api/suppliers/${supplierId}/services/${row.id}` : `/api/suppliers/${supplierId}/services`,
    'Đồng bộ dịch vụ nhà cung cấp',
  );
}

export function syncSupplierAllotments(supplierId: string, originalRows: SupplierChildRow[], nextRows: SupplierChildRow[]) {
  return syncSupplierChildRows(
    originalRows,
    nextRows,
    (row) => row.id ? `/api/suppliers/${supplierId}/allotments/${row.id}` : `/api/suppliers/${supplierId}/allotments`,
    'Đồng bộ quỹ phòng nhà cung cấp',
  );
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

export const supplierLifecycleGuidanceLinks = [
  { href: '/orders', label: 'Đơn hàng' },
  { href: '/operation', label: 'Điều hành' },
  { href: '/finance/payments', label: 'Tài chính' },
  { href: '/finance/supplier-payment-requests', label: 'Yêu cầu thanh toán' },
] as const;

export function nextSupplierLifecycleStatus(status: string): SupplierLifecycleStatus {
  return status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
}

export function supplierLifecycleAction(name: string, status: string, noun = 'nhà cung cấp') {
  const nextStatus = nextSupplierLifecycleStatus(status);
  const isReactivation = nextStatus === 'ACTIVE';
  const label = isReactivation ? 'Kích hoạt lại' : 'Ngừng hoạt động';
  const capitalizedNoun = noun.charAt(0).toUpperCase() + noun.slice(1);
  return {
    nextStatus,
    label,
    title: `${label} ${noun}`,
    confirmText: isReactivation
      ? `${label} "${name}"? ${capitalizedNoun} sẽ được mở lại để chọn trong vận hành mới.`
      : `${label} "${name}"? ${capitalizedNoun} sẽ không còn được dùng cho lựa chọn mới; giao dịch lịch sử vẫn được giữ và hệ thống sẽ chặn nếu còn tham chiếu vận hành.`,
    successText: isReactivation ? `Đã kích hoạt lại "${name}".` : `Đã ngừng hoạt động "${name}".`,
  };
}

export function supplierLifecycleBlockedText(message: string) {
  const detail = message.trim() || 'Không thực hiện được thao tác lifecycle nhà cung cấp.';
  const modules = supplierLifecycleGuidanceLinks.map((link) => link.label).join(', ');
  return `${detail} Có thể mở các module liên quan (${modules}) để gỡ tham chiếu trước khi thử lại.`;
}

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

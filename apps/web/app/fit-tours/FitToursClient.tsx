'use client';

import { Download, Pencil, Plus, RefreshCw, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { authHeaders } from '../authFetch';
import FitTourWizard from './FitTourWizard';

type Supplier = { id: string; name: string };
type FitTourSummary = {
  id: string;
  quoteCode: string;
  tourCode: string;
  tourName?: string | null;
  customerName: string;
  phone?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  adultCount?: number | null;
  childCount?: number | null;
  infantCount?: number | null;
  sellingPrice?: string | number | null;
  workflowStatus?: string | null;
  _count?: { commonCosts: number; hotelCosts: number; privateCosts: number; budgetServices: number; operationServices: number };
};
type FitTourSaved = Partial<FitTourSummary> & {
  id?: string;
  commonCosts?: unknown[];
  hotelCosts?: unknown[];
  privateCosts?: unknown[];
  budgetServices?: unknown[];
  operationServices?: unknown[];
};
type SaveReason = 'autosave' | 'save' | 'confirm' | 'upload' | 'copy-budget' | 'copy-operation';

const apiBase = process.env.NEXT_PUBLIC_API_URL || '';
const money = new Intl.NumberFormat('vi-VN');
const workflowLabels: Record<string, string> = {
  DRAFT: 'Nháp',
  PRICING: 'Tính giá',
  TOUR_INFO: 'Thông tin tour',
  BUDGET: 'Dự toán dịch vụ',
  OPERATION: 'Điều hành dịch vụ',
  HANDOVER: 'Phiếu bàn giao',
  SURVEY: 'Phiếu đánh giá dịch vụ',
  COMPLETED: 'Hoàn tất',
  CANCELLED: 'Đã hủy',
};

function dateOnly(value?: string | null) {
  return value ? value.slice(0, 10) : '-';
}

function pax(tour: FitTourSummary) {
  return Number(tour.adultCount || 0) + Number(tour.childCount || 0) + Number(tour.infantCount || 0);
}

function countRows(rows: unknown[] | undefined, fallback = 0) {
  return Array.isArray(rows) ? rows.length : fallback;
}

function workflowLabel(status?: string | null) {
  const key = (status || 'DRAFT').toUpperCase();
  return workflowLabels[key] || status || 'Nháp';
}

function workflowClass(status?: string | null) {
  const key = (status || 'DRAFT').toUpperCase();
  if (key === 'COMPLETED') return 'statusPill statusPillSuccess';
  if (key === 'OPERATION' || key === 'HANDOVER' || key === 'SURVEY') return 'statusPill statusPillWarning';
  if (key === 'DRAFT' || key === 'CANCELLED') return 'statusPill statusPillNeutral';
  return 'statusPill';
}

async function responseError(response: Response) {
  const text = await response.text();
  if (!text) return `${response.status} ${response.statusText}`;
  try {
    const json = JSON.parse(text);
    const message = Array.isArray(json.message) ? json.message.join(', ') : json.message;
    return message || text;
  } catch {
    return text;
  }
}

function toSummary(saved: FitTourSaved, previous?: FitTourSummary): FitTourSummary {
  const currentCount = previous?._count;
  return {
    id: String(saved.id || previous?.id || ''),
    quoteCode: String(saved.quoteCode ?? previous?.quoteCode ?? ''),
    tourCode: String(saved.tourCode ?? previous?.tourCode ?? ''),
    tourName: saved.tourName ?? previous?.tourName ?? null,
    customerName: String(saved.customerName ?? previous?.customerName ?? ''),
    phone: saved.phone ?? previous?.phone ?? null,
    startDate: saved.startDate ?? previous?.startDate ?? null,
    endDate: saved.endDate ?? previous?.endDate ?? null,
    adultCount: saved.adultCount ?? previous?.adultCount ?? 0,
    childCount: saved.childCount ?? previous?.childCount ?? 0,
    infantCount: saved.infantCount ?? previous?.infantCount ?? 0,
    sellingPrice: saved.sellingPrice ?? previous?.sellingPrice ?? 0,
    workflowStatus: saved.workflowStatus ?? previous?.workflowStatus ?? 'DRAFT',
    _count: {
      commonCosts: countRows(saved.commonCosts, saved._count?.commonCosts ?? currentCount?.commonCosts ?? 0),
      hotelCosts: countRows(saved.hotelCosts, saved._count?.hotelCosts ?? currentCount?.hotelCosts ?? 0),
      privateCosts: countRows(saved.privateCosts, saved._count?.privateCosts ?? currentCount?.privateCosts ?? 0),
      budgetServices: countRows(saved.budgetServices, saved._count?.budgetServices ?? currentCount?.budgetServices ?? 0),
      operationServices: countRows(saved.operationServices, saved._count?.operationServices ?? currentCount?.operationServices ?? 0),
    },
  };
}

function savedMessage(summary: FitTourSummary, reason: SaveReason) {
  const code = summary.quoteCode || summary.tourCode || 'tour FIT';
  if (reason === 'copy-budget') return `Đã sao chép dự toán và cập nhật ${code}.`;
  if (reason === 'copy-operation') return `Đã sao chép điều hành và cập nhật ${code}.`;
  if (reason === 'autosave') return `Đã tự lưu ${code}.`;
  return `Đã lưu ${code}.`;
}

export default function FitToursClient({ suppliers, tours }: { suppliers: Supplier[]; tours: FitTourSummary[] }) {
  const [rows, setRows] = useState<FitTourSummary[]>(tours);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedTourId, setSelectedTourId] = useState('');
  const [listBusy, setListBusy] = useState(false);
  const [listMessage, setListMessage] = useState('');

  useEffect(() => {
    setRows(tours);
  }, [tours]);

  async function reloadTours(message = 'Đã tải lại danh sách tour FIT.') {
    setListBusy(true);
    setListMessage('Đang tải danh sách tour FIT...');
    try {
      const response = await fetch(`${apiBase}/api/fit-tours`, { cache: 'no-store', headers: authHeaders() });
      if (!response.ok) throw new Error(await responseError(response));
      const data = await response.json();
      setRows(Array.isArray(data) ? data : []);
      setListMessage(message);
    } catch (error) {
      setListMessage(`Tải danh sách FIT lỗi: ${error instanceof Error ? error.message : 'không xác định'}`);
    } finally {
      setListBusy(false);
    }
  }

  async function exportTour(id: string) {
    setListMessage('Đang xuất file tour FIT...');
    try {
      const response = await fetch(`${apiBase}/api/fit-tours/${id}/export`, { headers: authHeaders() });
      if (!response.ok) throw new Error(await responseError(response));
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `smarttour-fit-${id}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setListMessage('Đã xuất file tour FIT.');
    } catch (error) {
      setListMessage(`Xuất file FIT lỗi: ${error instanceof Error ? error.message : 'không xác định'}`);
    }
  }

  function openCreate() {
    setSelectedTourId('');
    setListMessage('Đang tạo tour FIT mới.');
    setModalOpen(true);
  }

  function openEdit(id: string) {
    setSelectedTourId(id);
    setListMessage('Đang mở chi tiết tour FIT.');
    setModalOpen(true);
  }

  function closeWizard() {
    setModalOpen(false);
  }

  const handleWizardSaved = useCallback((saved: FitTourSaved, reason: SaveReason) => {
    if (!saved.id) return;
    const nextMessage = savedMessage(toSummary(saved), reason);
    setSelectedTourId(String(saved.id));
    setListMessage(nextMessage);
    setRows((current) => {
      const existing = current.find((tour) => tour.id === saved.id);
      const summary = toSummary(saved, existing);
      if (existing) return current.map((tour) => (tour.id === summary.id ? summary : tour));
      return [summary, ...current];
    });
  }, []);

  return (
    <>
      <section className="panel listPanel">
        <div className="sectionHeader">
          <h2>Danh sách tour FIT</h2>
          <div className="sectionActions">
            <button type="button" className="secondaryButton iconTextButton" onClick={() => void reloadTours()} disabled={listBusy}>
              <RefreshCw size={16} /> {listBusy ? 'Đang tải' : 'Tải lại'}
            </button>
            <button type="button" className="secondaryButton iconTextButton" onClick={openCreate}><Plus size={16} /> Tạo tour FIT</button>
            <span>{rows.length} tour</span>
          </div>
        </div>
        {listMessage ? <div className="statusPill statusPillNeutral">{listMessage}</div> : null}
        <div className="fitTableWrap">
          <table className="fitTable orderListTable">
            <thead>
              <tr>
                <th>Mã báo giá</th>
                <th>Mã tour</th>
                <th>Khách hàng</th>
                <th>Khởi đi / Ngày về</th>
                <th>Số khách</th>
                <th>Giá bán / khách</th>
                <th>Trạng thái</th>
                <th>Dự toán / Điều hành</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((tour) => (
                <tr key={tour.id}>
                  <td><strong>{tour.quoteCode || '-'}</strong></td>
                  <td>{tour.tourCode || '-'}<br /><span className="mutedText">{tour.tourName || '-'}</span></td>
                  <td>{tour.customerName || '-'}<br /><span className="mutedText">{tour.phone || '-'}</span></td>
                  <td>{dateOnly(tour.startDate)} - {dateOnly(tour.endDate)}</td>
                  <td>{pax(tour)}</td>
                  <td>{money.format(Number(tour.sellingPrice || 0))}</td>
                  <td><span className={workflowClass(tour.workflowStatus)}>{workflowLabel(tour.workflowStatus)}</span></td>
                  <td>
                    <span>{tour._count?.budgetServices ?? 0} dòng dự toán</span>
                    <br />
                    <span className="mutedText">{tour._count?.operationServices ?? 0} dòng điều hành</span>
                  </td>
                  <td className="actionsCell">
                    <button type="button" className="secondaryButton iconButton" onClick={() => openEdit(tour.id)} title="Sửa tour FIT"><Pencil size={14} /></button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr><td colSpan={9} className="tableEmptyState">Chưa có tour FIT. Bấm Tạo tour FIT để bắt đầu quy trình 6 bước.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {modalOpen ? (
        <div className="modalOverlay" role="dialog" aria-modal="true">
          <div className="modalPanel modalPanelWide fitTourWizardModal">
            <div className="hashModalHeader">
              <h2>{selectedTourId ? 'Sửa tour khách lẻ FIT' : 'Tạo tour khách lẻ FIT'}</h2>
              <button type="button" className="secondaryButton iconButton" onClick={closeWizard} title="Đóng"><X size={16} /></button>
            </div>
            <FitTourWizard suppliers={suppliers} tours={rows} initialTourId={selectedTourId} onSaved={handleWizardSaved} />
          </div>
        </div>
      ) : null}
    </>
  );
}

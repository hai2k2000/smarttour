'use client';

import { Download, Pencil, Plus, RefreshCw, Search, X } from 'lucide-react';
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
const workflowFilterOptions = Object.entries(workflowLabels);

function dateOnly(value?: string | null) {
  if (!value) return '-';
  const [year, month, day] = value.slice(0, 10).split('-');
  return year && month && day ? `${day}/${month}/${year}` : '-';
}

function pax(tour: FitTourSummary) {
  return Number(tour.adultCount || 0) + Number(tour.childCount || 0) + Number(tour.infantCount || 0);
}

function countRows(rows: unknown[] | undefined, fallback = 0) {
  return Array.isArray(rows) ? rows.length : fallback;
}

function workflowLabel(status?: string | null) {
  const key = (status || 'DRAFT').toUpperCase();
  return workflowLabels[key] || 'Chưa xác định';
}

function workflowClass(status?: string | null) {
  const key = (status || 'DRAFT').toUpperCase();
  if (key === 'COMPLETED') return 'statusPill statusPillSuccess';
  if (key === 'OPERATION' || key === 'HANDOVER' || key === 'SURVEY') return 'statusPill statusPillWarning';
  if (key === 'CANCELLED') return 'statusPill statusPillError';
  if (key === 'DRAFT') return 'statusPill statusPillNeutral';
  return 'statusPill';
}

function messageClass(message: string) {
  if (/lỗi|thất bại|không hợp lệ/i.test(message)) return 'statusPill statusPillError';
  if (/^Đã /.test(message)) return 'statusPill statusPillSuccess';
  if (/chưa thể|chưa đủ|hãy |cần nhập/i.test(message)) return 'statusPill statusPillWarning';
  return 'statusPill statusPillNeutral';
}

function exportFileCode(tour: FitTourSummary) {
  return (tour.quoteCode || tour.tourCode || 'tour-fit').trim().replace(/[^a-zA-Z0-9_-]+/g, '-');
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

function savedMessage(summary: FitTourSummary, reason: SaveReason, existed: boolean) {
  const code = summary.quoteCode || summary.tourCode || 'tour FIT';
  if (reason === 'copy-budget') return `Đã sao chép dự toán và cập nhật ${code}.`;
  if (reason === 'copy-operation') return `Đã sao chép điều hành và cập nhật ${code}.`;
  if (reason === 'upload') return `Đã tải file đính kèm cho ${code}.`;
  if (reason === 'confirm') return `Đã xác nhận bước ${workflowLabel(summary.workflowStatus)} của ${code}.`;
  if (reason === 'autosave') return `Đã tự lưu ${code}.`;
  return existed ? `Đã lưu thay đổi của ${code}.` : `Đã tạo ${code}.`;
}

export default function FitToursClient({ suppliers, tours, initialError = '' }: { suppliers: Supplier[]; tours: FitTourSummary[]; initialError?: string }) {
  const [rows, setRows] = useState<FitTourSummary[]>(tours);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedTourId, setSelectedTourId] = useState('');
  const [listBusy, setListBusy] = useState(false);
  const [listMessage, setListMessage] = useState(initialError);
  const [search, setSearch] = useState('');
  const [workflowFilter, setWorkflowFilter] = useState('');
  const [wizardDirty, setWizardDirty] = useState(false);

  useEffect(() => {
    setRows(tours);
  }, [tours]);

  async function reloadTours(message = 'Đã tải lại danh sách tour FIT.') {
    const normalizedSearch = search.trim().replace(/\s+/g, ' ');
    if (normalizedSearch && normalizedSearch.length < 2) {
      setListMessage('Hãy nhập ít nhất 2 ký tự để tìm tour FIT.');
      return;
    }
    setListBusy(true);
    setListMessage('Đang tải danh sách tour FIT...');
    try {
      const params = new URLSearchParams();
      if (normalizedSearch) params.set('search', normalizedSearch);
      if (workflowFilter) params.set('status', workflowFilter);
      const query = params.size ? `?${params.toString()}` : '';
      const response = await fetch(`${apiBase}/api/fit-tours${query}`, { cache: 'no-store', headers: authHeaders() });
      if (!response.ok) throw new Error(await responseError(response));
      const data = await response.json();
      if (!Array.isArray(data)) throw new Error('API danh sách tour FIT trả dữ liệu không hợp lệ');
      setRows(data.map((tour) => toSummary(tour)));
      setListMessage(`${message} Có ${data.length} tour phù hợp.`);
    } catch (error) {
      setListMessage(`Tải danh sách FIT lỗi: ${error instanceof Error ? error.message : 'không xác định'}`);
    } finally {
      setListBusy(false);
    }
  }

  async function exportTour(tour: FitTourSummary) {
    setListMessage('Đang xuất file tour FIT...');
    try {
      const response = await fetch(`${apiBase}/api/fit-tours/${tour.id}/export`, { headers: authHeaders() });
      if (!response.ok) throw new Error(await responseError(response));
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `smarttour-fit-${exportFileCode(tour)}.csv`;
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
    setWizardDirty(false);
    setListMessage('Đang tạo tour FIT mới. Cần nhập mã báo giá, mã tour và họ tên khách trước khi lưu.');
    setModalOpen(true);
  }

  function openEdit(id: string) {
    setSelectedTourId(id);
    setWizardDirty(false);
    const selected = rows.find((tour) => tour.id === id);
    setListMessage(`Đang mở ${selected?.quoteCode || selected?.tourCode || 'tour FIT'}.`);
    setModalOpen(true);
  }

  function closeWizard() {
    if (wizardDirty && !window.confirm('Tour FIT còn thay đổi chưa lưu. Bạn có chắc muốn đóng?')) return;
    setModalOpen(false);
    setWizardDirty(false);
  }

  const handleWizardSaved = useCallback((saved: FitTourSaved, reason: SaveReason) => {
    if (!saved.id) return;
    const existing = rows.find((tour) => tour.id === saved.id);
    const summary = toSummary(saved, existing);
    const nextMessage = savedMessage(summary, reason, Boolean(existing));
    setSelectedTourId(String(saved.id));
    setWizardDirty(false);
    setListMessage(nextMessage);
    setRows((current) => {
      if (existing) return current.map((tour) => (tour.id === summary.id ? summary : tour));
      return [summary, ...current];
    });
  }, [rows]);

  const handleWizardStatus = useCallback((message: string) => {
    if (message && message !== 'Chưa lưu') setListMessage(message);
  }, []);

  const selectedTour = rows.find((tour) => tour.id === selectedTourId);

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
        <div className="filterToolbar fitToursFilterToolbar">
          <label>
            Tìm tour FIT
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Mã báo giá, mã tour, tên tour hoặc khách hàng"
              maxLength={80}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void reloadTours('Đã lọc danh sách tour FIT.');
                }
              }}
            />
          </label>
          <label>
            Bước xử lý
            <select value={workflowFilter} onChange={(event) => setWorkflowFilter(event.target.value)}>
              <option value="">Tất cả các bước</option>
              {workflowFilterOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <button type="button" className="secondaryButton iconTextButton" onClick={() => void reloadTours('Đã lọc danh sách tour FIT.')} disabled={listBusy}>
            <Search size={16} /> Tìm kiếm
          </button>
        </div>
        {listMessage ? <div className={messageClass(listMessage)} role="status">{listMessage}</div> : null}
        <div className="fitTableWrap">
          <table className="fitTable orderListTable fitTourListTable">
            <thead>
              <tr>
                <th>Tour FIT</th>
                <th>Khách hàng</th>
                <th>Thời gian</th>
                <th>Quy mô</th>
                <th>Giá bán / khách</th>
                <th>Bước hiện tại</th>
                <th>Tiến độ dịch vụ</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((tour) => (
                <tr key={tour.id}>
                  <td>
                    <strong>{tour.quoteCode || '-'}</strong>
                    <br />
                    <span>{tour.tourCode || '-'}</span>
                    {tour.tourName ? <><br /><span className="mutedText">{tour.tourName}</span></> : null}
                  </td>
                  <td>{tour.customerName || '-'}<br /><span className="mutedText">{tour.phone || '-'}</span></td>
                  <td>{dateOnly(tour.startDate)}<br /><span className="mutedText">đến {dateOnly(tour.endDate)}</span></td>
                  <td>{pax(tour)} khách</td>
                  <td>{money.format(Number(tour.sellingPrice || 0))} đ</td>
                  <td><span className={workflowClass(tour.workflowStatus)}>{workflowLabel(tour.workflowStatus)}</span></td>
                  <td>
                    <span>{tour._count?.budgetServices ?? 0} dịch vụ dự toán</span>
                    <br />
                    <span className="mutedText">{tour._count?.operationServices ?? 0} dịch vụ điều hành</span>
                  </td>
                  <td className="actionsCell">
                    <button type="button" className="secondaryButton iconButton" onClick={() => openEdit(tour.id)} title="Mở tour FIT" aria-label={`Mở ${tour.quoteCode || tour.tourCode}`}><Pencil size={14} /></button>
                    <button type="button" className="secondaryButton iconButton" onClick={() => void exportTour(tour)} title="Tải CSV" aria-label={`Tải CSV ${tour.quoteCode || tour.tourCode}`}><Download size={14} /></button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr><td colSpan={8} className="tableEmptyState">Không có tour FIT phù hợp. Thử đổi điều kiện tìm kiếm hoặc tạo tour mới.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {modalOpen ? (
        <div className="modalOverlay" role="dialog" aria-modal="true">
          <div className="modalPanel modalPanelWide fitTourWizardModal">
            <div className="hashModalHeader">
              <h2>{selectedTourId ? `Sửa tour FIT: ${selectedTour?.quoteCode || selectedTour?.tourCode || 'Đang tải'}` : 'Tạo tour khách lẻ FIT'}</h2>
              <button type="button" className="secondaryButton iconButton" onClick={closeWizard} title="Đóng"><X size={16} /></button>
            </div>
            <FitTourWizard
              suppliers={suppliers}
              tours={rows}
              initialTourId={selectedTourId}
              onSaved={handleWizardSaved}
              onDirtyChange={setWizardDirty}
              onStatusChange={handleWizardStatus}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}

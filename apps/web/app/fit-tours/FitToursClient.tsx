'use client';

import { Pencil, Plus, X } from 'lucide-react';
import { useState } from 'react';
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

const money = new Intl.NumberFormat('vi-VN');

function dateOnly(value?: string | null) {
  return value ? value.slice(0, 10) : '-';
}

function pax(tour: FitTourSummary) {
  return Number(tour.adultCount || 0) + Number(tour.childCount || 0) + Number(tour.infantCount || 0);
}

export default function FitToursClient({ suppliers, tours }: { suppliers: Supplier[]; tours: FitTourSummary[] }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedTourId, setSelectedTourId] = useState('');

  function openCreate() {
    setSelectedTourId('');
    setModalOpen(true);
  }

  function openEdit(id: string) {
    setSelectedTourId(id);
    setModalOpen(true);
  }

  return (
    <>
      <section className="panel listPanel">
        <div className="sectionHeader">
          <h2>Danh sách tour FIT</h2>
          <button type="button" className="secondaryButton iconTextButton" onClick={openCreate}><Plus size={16} /> Tạo tour</button>
          <span>{tours.length} tour</span>
        </div>
        <div className="fitTableWrap">
          <table className="fitTable orderListTable">
            <thead>
              <tr>
                <th>Mã BG</th>
                <th>Mã tour</th>
                <th>Khách</th>
                <th>Ngày đi</th>
                <th>Pax</th>
                <th>Giá/khách</th>
                <th>Trạng thái</th>
                <th>Dự toán / Điều hành</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {tours.map((tour) => (
                <tr key={tour.id}>
                  <td><strong>{tour.quoteCode}</strong></td>
                  <td>{tour.tourCode}<br /><span className="mutedText">{tour.tourName || '-'}</span></td>
                  <td>{tour.customerName || '-'}<br /><span className="mutedText">{tour.phone || '-'}</span></td>
                  <td>{dateOnly(tour.startDate)} - {dateOnly(tour.endDate)}</td>
                  <td>{pax(tour)}</td>
                  <td>{money.format(Number(tour.sellingPrice || 0))}</td>
                  <td><span className="statusPill">{tour.workflowStatus || 'DRAFT'}</span></td>
                  <td>{tour._count?.budgetServices ?? 0} dự toán / {tour._count?.operationServices ?? 0} điều hành</td>
                  <td className="actionsCell">
                    <button type="button" className="secondaryButton iconButton" onClick={() => openEdit(tour.id)} title="Sửa tour"><Pencil size={14} /></button>
                  </td>
                </tr>
              ))}
              {tours.length === 0 ? (
                <tr><td colSpan={9} className="tableEmptyState">Chưa có tour FIT. Bấm Tạo tour để bắt đầu quy trình 6 bước.</td></tr>
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
              <button type="button" className="secondaryButton iconButton" onClick={() => setModalOpen(false)} title="Đóng"><X size={16} /></button>
            </div>
            <FitTourWizard suppliers={suppliers} tours={tours} initialTourId={selectedTourId} />
          </div>
        </div>
      ) : null}
    </>
  );
}

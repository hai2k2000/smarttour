'use client';

import { useEffect, useState } from 'react';

type RowDetail = {
  title: string;
  fields: Array<{ label: string; value: string }>;
};

const rowSelector = [
  '.fitTableWrap table.orderListTable tbody tr',
  '.fitTableWrap table.hotelListTable tbody tr',
  '.fitTableWrap table.tourProgramTable tbody tr',
  '.fitTableWrap table.fitTourListTable tbody tr',
  '.fitTableWrap table.quoteListTable tbody tr',
  '.fitTableWrap table.quoteComboListTable tbody tr',
  '.fitTableWrap table.quotationListTable tbody tr',
  '.fitTableWrap table.reportTable tbody tr',
  '.fitTableWrap table.customerTable tbody tr',
  '.fitTableWrap table.commissionTable tbody tr',
  '.fitTableWrap table.financeTable tbody tr',
  '.fitTableWrap table.operationsTable tbody tr',
  '.fitTableWrap table.securityTable tbody tr',
  '.fitTableWrap table.hotelInventoryTable tbody tr',
  '.supplierTableWrap table tbody tr',
  '.quoteListWrap table tbody tr',
].join(',');

const interactiveSelector = [
  'a',
  'button',
  'input',
  'select',
  'textarea',
  'label',
  '[role="button"]',
  '[data-row-detail-ignore]',
].join(',');

function cleanText(text: string) {
  return text.replace(/\s+/g, ' ').trim();
}

function detailFromRow(row: HTMLTableRowElement): RowDetail | null {
  if (row.querySelector('.tableEmptyState')) return null;

  const table = row.closest('table');
  if (!table) return null;

  const headers = Array.from(table.querySelectorAll('thead th')).map((header) => cleanText(header.textContent || ''));
  const cells = Array.from(row.cells);
  const fields = cells
    .map((cell, index) => ({
      label: headers[index] || `Cột ${index + 1}`,
      value: cleanText(cell.textContent || ''),
    }))
    .filter((field) => field.value && field.label.toLowerCase() !== 'thao tác');

  if (!fields.length) return null;

  const heading = table.closest('section, .panel')?.querySelector('h2');
  return {
    title: cleanText(heading?.textContent || 'Chi tiết dòng dữ liệu'),
    fields,
  };
}

export default function TableRowDetailPopup() {
  const [detail, setDetail] = useState<RowDetail | null>(null);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest(interactiveSelector)) return;

      const row = target.closest(rowSelector);
      if (!(row instanceof HTMLTableRowElement)) return;

      const nextDetail = detailFromRow(row);
      if (!nextDetail) return;
      setDetail(nextDetail);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDetail(null);
    };

    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  if (!detail) return null;

  return (
    <div className="rowDetailOverlay" role="presentation" onClick={() => setDetail(null)}>
      <section
        className="rowDetailModal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="row-detail-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span>Chi tiết dòng</span>
            <h2 id="row-detail-title">{detail.title}</h2>
          </div>
          <button type="button" className="secondaryButton rowDetailClose" onClick={() => setDetail(null)} aria-label="Đóng chi tiết">
            Đóng
          </button>
        </header>
        <dl className="rowDetailGrid">
          {detail.fields.map((field, index) => (
            <div key={`${field.label}-${index}`}>
              <dt>{field.label}</dt>
              <dd>{field.value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}

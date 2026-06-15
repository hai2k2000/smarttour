'use client';

import { useEffect, useState } from 'react';

type RowDetail = {
  title: string;
  fields: Array<{ label: string; value: string }>;
};

const tableSelectors = [
  '.fitTableWrap table.orderListTable',
  '.fitTableWrap table.hotelListTable',
  '.fitTableWrap table.tourProgramTable',
  '.fitTableWrap table.fitTourListTable',
  '.fitTableWrap table.quoteListTable',
  '.fitTableWrap table.quoteComboListTable',
  '.fitTableWrap table.quotationListTable',
  '.fitTableWrap table.reportTable',
  '.fitTableWrap table.customerTable',
  '.fitTableWrap table.commissionTable',
  '.fitTableWrap table.financeTable',
  '.fitTableWrap table.operationsTable',
  '.fitTableWrap table.securityTable',
  '.fitTableWrap table.hotelInventoryTable',
  '.fitTableWrap table.reconciliationItemTable',
  '.supplierTableWrap table',
  '.quoteListWrap table',
];

const tableSelector = tableSelectors.join(',');
const rowSelector = tableSelectors.map((selector) => `${selector} tbody tr`).join(',');

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

function bindTableCellTitles(root: ParentNode = document) {
  root.querySelectorAll(`${tableSelector} th, ${tableSelector} td`).forEach((cell) => {
    if (!(cell instanceof HTMLElement)) return;
    if (cell.querySelector('.tableEmptyState')) return;

    const text = cleanText(cell.textContent || '');
    if (!text || text === cell.getAttribute('title')) return;

    cell.setAttribute('title', text);
  });
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
    bindTableCellTitles();

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof Element) bindTableCellTitles(node);
        });
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

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
      observer.disconnect();
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

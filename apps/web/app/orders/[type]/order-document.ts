import { viStatus } from '../../i18n';

type SupplierLabel = { id: string; supplierCode: string | null; name: string } | null;
type ServiceLabel = { id: string; sku: string | null; serviceName: string } | null;

export type OrderDocumentModel = {
  version: number;
  generatedAt: string;
  documentTitle: string;
  order: {
    id: string;
    type: string;
    systemCode: string;
    tourCode: string | null;
    holdCode: string | null;
    name: string;
    route: string | null;
    marketGroup: string | null;
    status: string;
    paymentStatus: string;
    costStatus: string;
    currency: string;
    exchangeRate: number;
    createdBy: string | null;
    branch: string | null;
    department: string | null;
    operatorOwner: string | null;
    adultQty: number;
    childQty: number;
    infantQty: number;
    quantity: number;
    roomClass: string | null;
    servicePackage: string | null;
    note: string | null;
    bookingDate: string | null;
    paymentDate: string | null;
    startDate: string | null;
    endDate: string | null;
    createdDate: string | null;
    receiveDeadline: string | null;
    closeDeadline: string | null;
  };
  customer: {
    customerName: string | null;
    customerType: string | null;
    customerPhone: string | null;
    customerEmail: string | null;
    customerAddress: string | null;
    agencyName: string | null;
    collaborator: string | null;
  };
  summary: {
    totalRevenue: number;
    paidAmount: number;
    remainingRevenue: number;
    totalCost: number;
    paidCost: number;
    remainingCost: number;
    profit: number;
    commission: number;
  };
  salesItems: Array<{
    id: string;
    serviceType: string | null;
    description: string | null;
    quantity: number;
    serviceCount: number;
    unitPrice: number;
    vat: number;
    amount: number;
    note: string | null;
    supplier: SupplierLabel;
    service: ServiceLabel;
  }>;
  operationItems: Array<{
    id: string;
    serviceType: string | null;
    bookingCode: string | null;
    serviceDate: string | null;
    quantity: number;
    netPrice: number;
    vat: number;
    amount: number;
    status: string;
    note: string | null;
    supplier: SupplierLabel;
    service: ServiceLabel;
  }>;
  members: Array<{
    id: string;
    fullName: string;
    gender: string | null;
    birthday: string | null;
    phone: string | null;
    email: string | null;
    identityNumber: string | null;
    issuedDate: string | null;
    nationality: string | null;
    passengerType: string | null;
    note: string | null;
  }>;
  terms: Array<{ id: string; language: string; terms: string | null; notes: string | null }>;
  survey: {
    description: string | null;
    questions: Array<{ id: string; question: string; note: string | null }>;
  };
  signatures: Array<{ role: string; name: string | null }>;
};

export function escapeOrderDocumentHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function date(value?: string | null) {
  if (!value) return '-';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

function money(value: unknown) {
  return Number(value ?? 0).toLocaleString('vi-VN');
}

function quantity(value: unknown) {
  return Number(value ?? 0).toLocaleString('vi-VN', { maximumFractionDigits: 2 });
}

function status(value?: string | null) {
  return viStatus(value);
}

function multiline(value?: string | null) {
  return escapeOrderDocumentHtml(value ?? '')
    .replaceAll('\r\n', '\n')
    .replaceAll('\r', '\n')
    .replaceAll('\n', '<br>');
}

function hasText(value?: string | null) {
  return Boolean(value?.trim());
}

function firstPresent(...values: unknown[]) {
  for (const value of values) {
    if (value !== null && value !== undefined && value !== '') return value;
  }
  return '-';
}

function cell(value: unknown) {
  const display = value === null || value === undefined || value === '' ? '-' : value;
  return escapeOrderDocumentHtml(display);
}

function numericCell(value: string) {
  return `<span class="number">${value}</span>`;
}

function row(label: string, value: unknown) {
  const display = value === null || value === undefined || value === '' ? '-' : value;
  return `<div class="infoRow"><span>${escapeOrderDocumentHtml(label)}</span><strong>${escapeOrderDocumentHtml(display)}</strong></div>`;
}

function table(headers: string[], rows: string[][]) {
  if (!rows.length) return '';
  return `<table><thead><tr>${headers.map((header) => `<th>${escapeOrderDocumentHtml(header)}</th>`).join('')}</tr></thead><tbody>${rows.map((cells) => `<tr>${cells.map((entry) => `<td>${entry}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

const DOCUMENT_CSS = `
  @page { size: A4; margin: 11mm; }
  * { box-sizing: border-box; }
  html { background: #ffffff; }
  body { margin: 0; color: #24313a; font: 11px/1.38 Aptos, "Segoe UI", sans-serif; }
  h1 { margin: 4px 0 5px; color: #173b44; font: 700 21px/1.2 Georgia, serif; text-align: center; }
  h2 { margin: 13px 0 6px; padding: 4px 7px; border-left: 4px solid #d97706; background: #fff7ed; color: #7c2d12; font-size: 11px; letter-spacing: .04em; text-transform: uppercase; }
  p { margin: 4px 0; }
  .brand { color: #0f766e; font-weight: 800; letter-spacing: .18em; text-align: center; }
  .documentCode { margin-bottom: 11px; color: #64748b; text-align: center; }
  .blocks { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  .meta, .summary { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 3px 15px; }
  .infoRow { display: flex; justify-content: space-between; gap: 10px; min-width: 0; border-bottom: 1px dotted #cbd5e1; padding: 2px 0; }
  .infoRow span { color: #64748b; }
  .infoRow strong { min-width: 0; text-align: right; overflow-wrap: anywhere; }
  table { width: 100%; border-collapse: collapse; table-layout: auto; margin-top: 5px; font-size: 10px; }
  th, td { border: 1px solid #cbd5e1; padding: 4px 5px; vertical-align: top; overflow-wrap: anywhere; }
  th { background: #e7f5f2; color: #115e59; font-weight: 700; text-align: left; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  .number { display: block; text-align: right; white-space: nowrap; }
  .note { margin-top: 7px; padding: 7px 9px; border: 1px solid #e2e8f0; background: #f8fafc; }
  .terms article, .surveyItem { break-inside: avoid; page-break-inside: avoid; margin: 5px 0; padding: 6px 8px; border: 1px solid #e2e8f0; }
  .signatures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 22px; margin-top: 24px; text-align: center; }
  .signatureSpace { height: 58px; }
  .muted { color: #64748b; }
  .generated { margin-top: 18px; font-size: 9px; text-align: right; }
  @media print {
    html, body { background: #ffffff; }
    body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    .noPrint { display: none !important; }
  }
`;

export function orderDocumentHtml(model: OrderDocumentModel) {
  const salesRows = model.salesItems.map((item) => [
    cell(firstPresent(item.supplier?.name, item.supplier?.supplierCode)),
    `${cell(firstPresent(item.service?.serviceName, item.serviceType))}${hasText(item.description) ? `<br><span class="muted">${cell(item.description)}</span>` : ''}`,
    numericCell(quantity(item.quantity)),
    numericCell(quantity(item.serviceCount)),
    numericCell(money(item.unitPrice)),
    numericCell(quantity(item.vat)),
    numericCell(money(item.amount)),
    cell(item.note),
  ]);
  const operationRows = model.operationItems.map((item) => [
    cell(firstPresent(item.supplier?.name, item.supplier?.supplierCode)),
    cell(firstPresent(item.service?.serviceName, item.serviceType)),
    cell(item.bookingCode),
    cell(date(item.serviceDate)),
    numericCell(quantity(item.quantity)),
    numericCell(money(item.netPrice)),
    numericCell(quantity(item.vat)),
    numericCell(money(item.amount)),
    cell(status(item.status)),
    cell(item.note),
  ]);
  const memberRows = model.members.map((item) => [
    cell(item.fullName),
    `${cell(item.passengerType)}<br><span class="muted">${cell(item.gender)}</span>`,
    cell(date(item.birthday)),
    `${cell(item.phone)}<br><span class="muted">${cell(item.email)}</span>`,
    `${cell(item.identityNumber)}<br><span class="muted">Cấp: ${cell(date(item.issuedDate))}</span>`,
    cell(item.nationality),
    cell(item.note),
  ]);

  const memberSection = (() => {
    if (!model.members.length) return '';
    return `<h2>Danh sách thành viên</h2>${table(['Họ tên', 'Loại / giới tính', 'Ngày sinh', 'Liên hệ', 'CCCD / hộ chiếu', 'Quốc tịch', 'Ghi chú'], memberRows)}`;
  })();
  const terms = model.terms
    .filter((item) => hasText(item.terms) || hasText(item.notes))
    .map((item) => `<article><strong>${cell(item.language)}</strong>${hasText(item.terms) ? `<p>${multiline(item.terms)}</p>` : ''}${hasText(item.notes) ? `<p class="muted">${multiline(item.notes)}</p>` : ''}</article>`)
    .join('');
  const surveyQuestions = model.survey.questions
    .filter((item) => hasText(item.question) || hasText(item.note))
    .map((item) => `<div class="surveyItem"><strong>${cell(item.question)}</strong>${hasText(item.note) ? `<br><span class="muted">${multiline(item.note)}</span>` : ''}</div>`)
    .join('');
  const survey = `${hasText(model.survey.description) ? `<p>${multiline(model.survey.description)}</p>` : ''}${surveyQuestions}`;
  const bookingNote = hasText(model.order.note) ? `<div class="note"><strong>Ghi chú booking</strong><p>${multiline(model.order.note)}</p></div>` : '';
  const generatedAt = new Date(model.generatedAt).toLocaleString('vi-VN');

  return `<!doctype html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><meta http-equiv="Content-Type" content="text/html; charset=utf-8"><title>${cell(model.order.systemCode)}</title><style>${DOCUMENT_CSS}</style></head><body>
    <div class="brand">SMARTTOUR</div>
    <h1>${escapeOrderDocumentHtml(model.documentTitle)}</h1>
    <p class="documentCode">Mã chứng từ: ${cell(model.order.systemCode)}</p>
    <div class="blocks">
      <section><h2>Thông tin booking</h2><div class="meta">${row('Mã hệ thống', model.order.systemCode)}${row('Mã tour', model.order.tourCode)}${row('Mã giữ chỗ', model.order.holdCode)}${row('Tên booking', model.order.name)}${row('Tuyến', model.order.route)}${row('Thị trường', model.order.marketGroup)}${row('Trạng thái', status(model.order.status))}${row('Thanh toán', status(model.order.paymentStatus))}${row('Chi phí', status(model.order.costStatus))}${row('Ngày booking', date(model.order.bookingDate))}${row('Ngày thanh toán', date(model.order.paymentDate))}${row('Check-in', date(model.order.startDate))}${row('Check-out', date(model.order.endDate))}${row('Hạn tiếp nhận', date(model.order.receiveDeadline))}${row('Hạn đóng', date(model.order.closeDeadline))}</div></section>
      <section><h2>Khách hàng &amp; dịch vụ</h2><div class="meta">${row('Khách hàng', model.customer.customerName)}${row('Loại khách', model.customer.customerType)}${row('Điện thoại', model.customer.customerPhone)}${row('Email', model.customer.customerEmail)}${row('Địa chỉ', model.customer.customerAddress)}${row('Đại lý', model.customer.agencyName)}${row('Cộng tác viên', model.customer.collaborator)}${row('Hạng phòng', model.order.roomClass)}${row('Gói dịch vụ', model.order.servicePackage)}${row('Người lớn', quantity(model.order.adultQty))}${row('Trẻ em', quantity(model.order.childQty))}${row('Em bé', quantity(model.order.infantQty))}${row('Tổng số lượng', quantity(model.order.quantity))}${row('Tiền tệ', model.order.currency)}${row('Tỷ giá', quantity(model.order.exchangeRate))}</div></section>
    </div>
    <section class="meta">${row('Người tạo', model.order.createdBy)}${row('Ngày tạo', date(model.order.createdDate))}${row('Điều hành', model.order.operatorOwner)}${row('Chi nhánh', model.order.branch)}${row('Phòng ban', model.order.department)}</section>
    ${bookingNote}
    <h2>Phòng bán / phần thu</h2>${table(['Khách sạn', 'Dịch vụ / mô tả', 'SL', 'Số lượt', 'Đơn giá', 'VAT %', 'Thành tiền', 'Ghi chú'], salesRows)}
    <h2>Phòng đặt / phần chi</h2>${table(['Khách sạn', 'Dịch vụ', 'Mã NCC', 'Ngày dùng', 'SL', 'Giá NET', 'VAT %', 'Thành tiền', 'Trạng thái', 'Ghi chú'], operationRows)}
    <h2>Tổng hợp tài chính</h2><section class="summary">${row('Tổng thu', money(model.summary.totalRevenue))}${row('Đã thu', money(model.summary.paidAmount))}${row('Còn thu', money(model.summary.remainingRevenue))}${row('Tổng chi', money(model.summary.totalCost))}${row('Đã chi', money(model.summary.paidCost))}${row('Còn chi', money(model.summary.remainingCost))}${row('Lợi nhuận', money(model.summary.profit))}${row('Hoa hồng', money(model.summary.commission))}</section>
    ${memberSection}
    ${terms ? `<section class="terms"><h2>Điều khoản</h2>${terms}</section>` : ''}
    ${survey ? `<section><h2>Đánh giá dịch vụ</h2>${survey}</section>` : ''}
    <section class="signatures">${model.signatures.map((signature) => `<div><strong>${cell(signature.role)}</strong><div class="signatureSpace"></div><span>${cell(signature.name)}</span></div>`).join('')}</section>
    <p class="muted generated">Tạo lúc ${escapeOrderDocumentHtml(generatedAt)}</p>
  </body></html>`;
}

function fileBase(model: OrderDocumentModel) {
  const normalized = model.order.systemCode
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'hotel-booking';
}

export function downloadOrderWord(model: OrderDocumentModel) {
  const blob = new Blob(['\uFEFF', orderDocumentHtml(model)], { type: 'application/msword;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  try {
    link.href = url;
    link.download = `${fileBase(model)}.doc`;
    document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    URL.revokeObjectURL(url);
  }
  return { extension: 'doc' as const };
}

export function writeOrderPrintWindow(popup: Window, model: OrderDocumentModel) {
  popup.document.open();
  popup.document.write(orderDocumentHtml(model));
  popup.document.close();
  popup.focus();
  popup.setTimeout(() => popup.print(), 150);
}

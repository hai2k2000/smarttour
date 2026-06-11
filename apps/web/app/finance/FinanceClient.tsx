'use client';

import { CheckCircle2, Download, FileText, HandCoins, Plus, ReceiptText, RefreshCcw, Search, WalletCards, X, XCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PermissionNotice, usePermissions } from '../usePermissions';
import { viStatus } from '../i18n';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

type Summary = { count: number; totalAmount: number; draft?: number; deposit?: number; approved?: number; pending?: number; rejected?: number };
type Receipt = { id: string; receiptCode: string; receiptName: string; receiptType: string; paymentMethod: string; paymentDate?: string; payerName?: string; payerPhone?: string; totalAmount: string; paidBefore: string; receiptAmount: string; remainingAmount: string; approvalStatus: string; branch?: string; assignedStaff?: string; attachmentName?: string; attachmentUrl?: string; orders?: { tourCode?: string; tourName?: string; amount: string }[] };
type Payment = { id: string; voucherCode: string; voucherName?: string; voucherType: string; paymentMethod: string; paymentDate?: string; receiverName?: string; receiverPhone?: string; totalAmount: string; paymentAmount: string; remainingAmount: string; approvalStatus: string; branch?: string; assignedStaff?: string; attachmentName?: string; attachmentUrl?: string };
type InvoiceFile = { id: string; fileName: string; fileUrl: string; fileType?: string };
type Invoice = { id: string; invoiceCode: string; invoiceNumber?: string; customerName?: string; customerPhone?: string; taxCode?: string; companyName?: string; tourCode?: string; tourName?: string; issuedDate?: string; totalBeforeTax: string; totalTax: string; totalAfterTax: string; invoiceType: string; taxAuthorityCode?: string; approvalStatus: string; files?: InvoiceFile[] };
type Cashflow = { id: string; sourceType: string; entryType: string; amount: string; paymentMethod: string; paymentDate?: string; branch?: string; department?: string; staff?: string; note?: string };
type DebtAging = { current: number; overdue1To30: number; overdue31To60: number; overdue61To90: number; overdueOver90: number; overdueTotal: number };
type DebtRow = { id: string; name: string; phone?: string; debitTotal: number; creditTotal: number; balance: number; aging: DebtAging };
type FinanceAction = 'save' | 'approve' | 'cancel' | 'reject' | 'import' | 'upload' | 'deleteFile' | 'adjustDebt';

const emptySummary: Summary = { count: 0, totalAmount: 0 };
const receiptTypes = ['DEPOSIT', 'TOUR_PAYMENT', 'CUSTOMER_DEBT', 'COLLECT_ON_BEHALF', 'SUPPLIER_FUND_REFUND', 'OTHER'];
const paymentTypes = ['SUPPLIER_PAYMENT', 'CUSTOMER_REFUND', 'COMMISSION', 'INTERNAL_EXPENSE', 'SUPPLIER_DEPOSIT', 'ADVANCE', 'OTHER'];
const methods = ['BANK_TRANSFER', 'CASH', 'CARD', 'QR', 'OFFSET', 'OTHER'];
const statuses = ['DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'];
const financeTabs = ['pending', 'receipts', 'payments', 'invoices', 'cashflow', 'debt'] as const;
type FinanceTab = typeof financeTabs[number];
function normalizeTab(value: string | null): FinanceTab { return financeTabs.includes(value as FinanceTab) ? value as FinanceTab : 'receipts'; }

const tabLabels: Record<FinanceTab, string> = {
  pending: 'Phiếu thu chờ',
  receipts: 'Phiếu thu',
  payments: 'Phiếu chi',
  invoices: 'Hóa đơn VAT',
  cashflow: 'Dòng tiền',
  debt: 'Công nợ',
};

const actionLabels: Record<FinanceAction, string> = {
  save: 'lưu chứng từ',
  approve: 'duyệt chứng từ',
  cancel: 'hủy chứng từ',
  reject: 'từ chối chứng từ',
  import: 'nhập CSV',
  upload: 'tải file',
  deleteFile: 'xóa file',
  adjustDebt: 'điều chỉnh công nợ',
};

export default function FinanceClient() {
  const { can, canAny } = usePermissions();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<FinanceTab>('receipts');
  const [modal, setModal] = useState<null | 'receipts' | 'payments' | 'invoices'>(null);
  const [filter, setFilter] = useState({ search: '', status: '', paymentMethod: '', from: '', to: '' });
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [cashflow, setCashflow] = useState<Cashflow[]>([]);
  const [receiptSummary, setReceiptSummary] = useState<Summary>(emptySummary);
  const [paymentSummary, setPaymentSummary] = useState<Summary>(emptySummary);
  const [invoiceSummary, setInvoiceSummary] = useState<Summary>(emptySummary);
  const [cashSummary, setCashSummary] = useState({ totalReceipt: 0, totalPayment: 0, netCashflow: 0, byMethod: [] as { method: string; receipt: number; payment: number }[] });
  const [customerDebt, setCustomerDebt] = useState<DebtRow[]>([]);
  const [supplierDebt, setSupplierDebt] = useState<DebtRow[]>([]);
  const [message, setMessage] = useState('');

  const query = useMemo(() => {
    const params = new URLSearchParams();
    Object.entries(filter).forEach(([key, value]) => value && params.set(key, value));
    return params.toString();
  }, [filter, tab]);

  useEffect(() => { setTab(normalizeTab(searchParams.get('tab'))); }, [searchParams]);
  useEffect(() => { void load(); }, [query]);

  function openTab(nextTab: FinanceTab) {
    setTab(nextTab);
    router.push(nextTab === 'receipts' ? '/finance' : `/finance?tab=${nextTab}`, { scroll: false });
  }

  async function load() {
    const receiptQuery = tab === 'pending' ? mergeQuery(query, { status: 'PENDING' }) : query;
    const branches = [
      { label: 'Phiếu thu', run: () => getJson(`/api/finance/receipts?${receiptQuery}`), apply: (data: any) => { setReceipts(data.rows || []); setReceiptSummary(data.summary || emptySummary); } },
      { label: 'Phiếu chi', run: () => getJson(`/api/finance/payments?${query}`), apply: (data: any) => { setPayments(data.rows || []); setPaymentSummary(data.summary || emptySummary); } },
      { label: 'Hóa đơn VAT', run: () => getJson(`/api/finance/invoices?${query}`), apply: (data: any) => { setInvoices(data.rows || []); setInvoiceSummary(data.summary || emptySummary); } },
      { label: 'Dòng tiền', run: () => getJson(`/api/finance/cashflow?${query}`), apply: (data: any) => { setCashflow(data.rows || []); setCashSummary(data.summary || { totalReceipt: 0, totalPayment: 0, netCashflow: 0, byMethod: [] }); } },
      { label: 'Công nợ khách hàng', run: () => getJson('/api/finance/debt/customers'), apply: (data: any) => setCustomerDebt(data.rows || []) },
      { label: 'Công nợ nhà cung cấp', run: () => getJson('/api/finance/debt/suppliers'), apply: (data: any) => setSupplierDebt(data.rows || []) },
    ];
    const results = await Promise.allSettled(branches.map((branch) => branch.run()));
    const failed: string[] = [];
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') branches[index].apply(result.value);
      else failed.push(`${branches[index].label}: ${errorText(result.reason)}`);
    });
    if (failed.length) setMessage(`Không tải được ${failed.join('; ')}`);
  }

  async function createReceipt(formData: FormData) {
    const amount = number(formData.get('receiptAmount'));
    const created = await post('/api/finance/receipts', {
      receiptName: text(formData.get('receiptName')), receiptType: text(formData.get('receiptType')), paymentMethod: text(formData.get('paymentMethod')), paymentDate: text(formData.get('paymentDate')),
      payerName: text(formData.get('payerName')), payerPhone: text(formData.get('payerPhone')), payerEmail: text(formData.get('payerEmail')), reason: text(formData.get('reason')),
      totalAmount: number(formData.get('totalAmount')) || amount, paidBefore: number(formData.get('paidBefore')), receiptAmount: amount,
      branch: text(formData.get('branch')), assignedStaff: text(formData.get('assignedStaff')), orders: [{ tourCode: text(formData.get('tourCode')), tourName: text(formData.get('tourName')), amount }], createdBy: 'accounting',
    }, 'save');
    return created ? uploadFinanceFile('receipts', created.id, formData.get('attachment')) : false;
  }

  async function createPayment(formData: FormData) {
    const amount = number(formData.get('paymentAmount'));
    const created = await post('/api/finance/payments', {
      voucherName: text(formData.get('voucherName')), voucherType: text(formData.get('voucherType')), paymentMethod: text(formData.get('paymentMethod')), paymentDate: text(formData.get('paymentDate')),
      receiverName: text(formData.get('receiverName')), receiverPhone: text(formData.get('receiverPhone')), reason: text(formData.get('reason')),
      totalAmount: number(formData.get('totalAmount')) || amount, paymentAmount: amount, bankAccountName: text(formData.get('bankAccountName')), bankAccountNumber: text(formData.get('bankAccountNumber')), bankName: text(formData.get('bankName')),
      branch: text(formData.get('branch')), assignedStaff: text(formData.get('assignedStaff')), createdBy: 'accounting',
    }, 'save');
    return created ? uploadFinanceFile('payments', created.id, formData.get('attachment')) : false;
  }

  async function createInvoice(formData: FormData) {
    const created = await post('/api/finance/invoices', {
      customerName: text(formData.get('customerName')), customerPhone: text(formData.get('customerPhone')), customerEmail: text(formData.get('customerEmail')),
      taxCode: text(formData.get('taxCode')), companyName: text(formData.get('companyName')), companyAddress: text(formData.get('companyAddress')), invoiceType: text(formData.get('invoiceType')), issuedDate: text(formData.get('issuedDate')),
      tourCode: text(formData.get('tourCode')), tourName: text(formData.get('tourName')), note: text(formData.get('note')),
      items: [{ itemName: text(formData.get('itemName')) || 'Dịch vụ du lịch', unit: text(formData.get('unit')) || 'gói', quantity: number(formData.get('quantity')) || 1, unitPrice: number(formData.get('unitPrice')), taxRate: number(formData.get('taxRate')) }], createdBy: 'accounting',
    }, 'save');
    return created ? uploadInvoiceFiles(created.id, formData.getAll('attachments')) : false;
  }

  async function post(path: string, payload: unknown, actionType: FinanceAction = 'save') {
    setMessage('');
    const response = await fetch(`${API_URL}${path}`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(payload) });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setMessage(`Không thể ${actionLabels[actionType]}: ${data.message || response.statusText || `HTTP ${response.status}`}`);
      return false as const;
    }
    const data = await response.json().catch(() => ({}));
    setMessage(actionType === 'save' ? 'Đã lưu chứng từ tài chính' : `Đã ${actionLabels[actionType]}`);
    await load();
    return data;
  }

  async function uploadFinanceFile(kind: 'receipts' | 'payments', id: string, entry: FormDataEntryValue | null) {
    if (!(entry instanceof File) || !entry.size) return true;
    const body = new FormData();
    body.append('file', entry);
    const response = await fetch(`${API_URL}/api/finance/${kind}/${id}/file`, { method: 'POST', headers: authHeaders(false), body });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setMessage(`Đã lưu chứng từ nhưng tải file "${entry.name}" thất bại: ${data.message || response.statusText || `HTTP ${response.status}`}`);
      return false;
    }
    setMessage('Đã lưu chứng từ và file đính kèm');
    await load();
    return true;
  }

  async function uploadInvoiceFiles(id: string, entries: ArrayLike<FormDataEntryValue> | null) {
    const files = entries ? Array.from(entries).filter((entry): entry is File => entry instanceof File && entry.size > 0) : [];
    const uploaded: string[] = [];
    const failed: string[] = [];
    for (const file of files) {
      const body = new FormData();
      body.append('file', file);
      const response = await fetch(`${API_URL}/api/finance/invoices/${id}/files`, { method: 'POST', headers: authHeaders(false), body });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        failed.push(`${file.name} (${data.message || response.statusText || `HTTP ${response.status}`})`);
      } else {
        uploaded.push(file.name);
      }
    }
    if (failed.length) {
      setMessage(`Đã tải ${uploaded.length}/${files.length} file hóa đơn. Lỗi: ${failed.join('; ')}`);
    } else {
      setMessage(files.length ? `Đã tải ${uploaded.length} file hóa đơn` : 'Đã lưu hóa đơn');
    }
    await load();
    return failed.length === 0;
  }

  async function deleteInvoiceFile(id: string, fileId: string) {
    const response = await fetch(`${API_URL}/api/finance/invoices/${id}/files/${fileId}`, { method: 'DELETE', headers: authHeaders(false) });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setMessage(`Không thể xóa file hóa đơn: ${data.message || response.statusText || `HTTP ${response.status}`}`);
      return;
    }
    setMessage('Đã xóa file hóa đơn');
    await load();
  }

  async function importCsv(kind: 'receipts' | 'payments', files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    const body = new FormData();
    body.append('file', file);
    const response = await fetch(`${API_URL}/api/finance/${kind}/import`, { method: 'POST', headers: authHeaders(false), body });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(`Không thể nhập CSV ${kind === 'receipts' ? 'phiếu thu' : 'phiếu chi'}: ${data.message || response.statusText || `HTTP ${response.status}`}`);
      return;
    }
    const imported = Number(data.imported || data.success || data.successCount || 0);
    const failed = Number(data.failed || data.fail || data.failedCount || data.errors?.length || 0);
    setMessage(failed > 0 ? `Đã nhập ${imported} dòng, ${failed} dòng lỗi` : `Đã nhập ${imported} dòng CSV`);
    await load();
  }

  async function adjustDebt(kind: 'customers' | 'suppliers', formData: FormData) {
    const partyId = text(formData.get('partyId'));
    const direction = text(formData.get('direction'));
    const amount = number(formData.get('amount'));
    const description = text(formData.get('description'));
    if (!partyId) {
      setMessage(`Chưa có ${kind === 'customers' ? 'khách hàng' : 'nhà cung cấp'} để điều chỉnh`);
      return false;
    }
    if (!['INCREASE', 'DECREASE'].includes(direction)) {
      setMessage('Chọn loại điều chỉnh công nợ hợp lệ');
      return false;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setMessage('Số tiền điều chỉnh phải lớn hơn 0');
      return false;
    }
    if (!description) {
      setMessage('Nhập ghi chú điều chỉnh để dễ truy vết công nợ');
      return false;
    }
    return Boolean(await post(`/api/finance/debt/${kind}/${partyId}/adjustments`, {
      direction,
      amount,
      dueDate: text(formData.get('dueDate')),
      description,
      actor: 'accounting',
    }, 'adjustDebt'));
  }

  async function action(kind: 'receipts' | 'payments' | 'invoices', id: string, actionName: 'approve' | 'reject' | 'cancel') { await post(`/api/finance/${kind}/${id}/${actionName}`, { actor: 'accounting' }, actionName); }
  function exportUrl(kind: 'receipts' | 'payments' | 'invoices' | 'cashflow') { return `${API_URL}/api/finance/${kind}/export?${query}`; }
  const pendingReceipts = tab === 'pending' ? receipts.filter((row) => row.approvalStatus === 'PENDING') : receipts;

  return (
    <section className="workspace financePage">
      <header className="pageHeader">
        <div><p className="eyebrow">Tài chính / Kế toán</p><h1>Thu chi, VAT và dòng tiền</h1></div>
        <div className="pageHeaderActions">
          {message ? <span className="statusPill statusPillNeutral">{message}</span> : null}
          <button className="secondaryButton iconTextButton" onClick={load}><RefreshCcw size={16} /> Tải lại</button>
          <a className="secondaryButton iconTextButton" href={exportUrl(tab === 'payments' ? 'payments' : tab === 'invoices' ? 'invoices' : tab === 'cashflow' ? 'cashflow' : 'receipts')}><Download size={16} /> CSV</a>
        </div>
      </header>

      <section className="metrics financeMetrics">
        <Metric label="Chứng từ thu" value={receiptSummary.count} /><Metric label="Tổng tiền thu" value={money(receiptSummary.totalAmount)} /><Metric label="Chứng từ chi" value={paymentSummary.count} />
        <Metric label="Tổng tiền chi" value={money(paymentSummary.totalAmount)} /><Metric label="Hóa đơn VAT" value={invoiceSummary.count} /><Metric label="Dòng tiền ròng" value={money(cashSummary.netCashflow)} />
      </section>
      <PermissionNotice allowed={canAny(['finance.receipt.view', 'finance.payment.view', 'finance.invoice.view', 'finance.cashflow.view', 'finance.debt.view'])} label="xem tài chính kế toán" />

      <section className="panel financeFilters">
        <label><Search size={15} /> Tìm kiếm<input value={filter.search} onChange={(event) => setFilter({ ...filter, search: event.target.value })} placeholder="Tên, số điện thoại, email, mã chứng từ, mã tour" /></label>
        <label>Trạng thái<select value={filter.status} onChange={(event) => setFilter({ ...filter, status: event.target.value })}><option value="">Tất cả</option>{statuses.map((status) => <option key={status} value={status}>{viStatus(status)}</option>)}</select></label>
        <label>Phương thức thanh toán<select value={filter.paymentMethod} onChange={(event) => setFilter({ ...filter, paymentMethod: event.target.value })}><option value="">Tất cả</option>{methods.map((method) => <option key={method} value={method}>{viStatus(method)}</option>)}</select></label>
        <label>Từ ngày<input type="date" value={filter.from} onChange={(event) => setFilter({ ...filter, from: event.target.value })} /></label>
        <label>Đến ngày<input type="date" value={filter.to} onChange={(event) => setFilter({ ...filter, to: event.target.value })} /></label>
      </section>

      <div className="moduleTabs financeTabs">
        {[
          ['pending', tabLabels.pending, ReceiptText], ['receipts', tabLabels.receipts, ReceiptText], ['payments', tabLabels.payments, HandCoins], ['invoices', tabLabels.invoices, FileText], ['cashflow', tabLabels.cashflow, WalletCards],
          ['debt', tabLabels.debt, WalletCards],
        ].map(([key, label, Icon]) => { const tabKey = key as FinanceTab; const TabIcon = Icon as typeof ReceiptText; return <button key={tabKey} type="button" className={tab === tabKey ? 'active' : ''} onClick={() => openTab(tabKey)}><TabIcon size={16} /> {label as string}</button>; })}
      </div>

      {tab === 'pending' || tab === 'receipts' ? <ReceiptsTab rows={pendingReceipts} onCreateClick={() => setModal('receipts')} onImportFile={(files) => importCsv('receipts', files)} onAction={(id, type) => action('receipts', id, type)} can={can} /> : null}
      {tab === 'payments' ? <PaymentsTab rows={payments} onCreateClick={() => setModal('payments')} onImportFile={(files) => importCsv('payments', files)} onAction={(id, type) => action('payments', id, type)} can={can} /> : null}
      {tab === 'invoices' ? <InvoicesTab rows={invoices} onCreateClick={() => setModal('invoices')} onAction={(id, type) => action('invoices', id, type)} onUploadFiles={uploadInvoiceFiles} onDeleteFile={deleteInvoiceFile} can={can} /> : null}
      {tab === 'cashflow' ? <CashflowTab rows={cashflow} summary={cashSummary} /> : null}
      {tab === 'debt' ? <DebtTab customerDebt={customerDebt} supplierDebt={supplierDebt} onAdjust={adjustDebt} can={can} /> : null}

      {modal === 'receipts' ? <FinanceModal title="Tạo phiếu thu" onClose={() => setModal(null)}><ReceiptForm can={can} onCreate={createReceipt} onClose={() => setModal(null)} /></FinanceModal> : null}
      {modal === 'payments' ? <FinanceModal title="Tạo phiếu chi" onClose={() => setModal(null)}><PaymentForm can={can} onCreate={createPayment} onClose={() => setModal(null)} /></FinanceModal> : null}
      {modal === 'invoices' ? <FinanceModal title="Tạo hóa đơn VAT" onClose={() => setModal(null)}><InvoiceForm can={can} onCreate={createInvoice} onClose={() => setModal(null)} /></FinanceModal> : null}
    </section>
  );
}

function ReceiptsTab({ rows, onCreateClick, onImportFile, onAction, can }: { rows: Receipt[]; onCreateClick: () => void; onImportFile: (files: FileList | null) => void; onAction: (id: string, action: 'approve' | 'reject' | 'cancel') => void; can: (permission: string) => boolean }) {
  return <FinanceTable title="Danh sách phiếu thu" count={rows.length} action={<div className="sectionActions"><label className="secondaryButton financeFilePicker"><Download size={14} /> Nhập CSV<input hidden type="file" accept=".csv,text/csv" disabled={!can('finance.receipt.import')} onChange={(event) => { onImportFile(event.currentTarget.files); event.currentTarget.value = ''; }} /></label><button type="button" disabled={!can('finance.receipt.create')} onClick={onCreateClick}><Plus size={16} /> Tạo phiếu thu</button></div>}><thead><tr><th>Mã phiếu</th><th>Người nộp</th><th>Tour</th><th>Ngày thanh toán</th><th>Loại phiếu</th><th>Số tiền</th><th>Còn phải thu</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><strong>{row.receiptCode}</strong><span>{row.receiptName}</span>{row.attachmentUrl ? <a href={`${API_URL}${row.attachmentUrl}`} target="_blank" rel="noreferrer">{row.attachmentName || 'Tải file'}</a> : null}</td><td>{row.payerName || '-'}<span>{row.payerPhone || ''}</span></td><td>{row.orders?.[0]?.tourCode || '-'}<span>{row.orders?.[0]?.tourName || ''}</span></td><td>{date(row.paymentDate)}</td><td>{viStatus(row.receiptType)}</td><td>{money(Number(row.receiptAmount))}</td><td>{money(Number(row.remainingAmount))}</td><td><StatusPill status={row.approvalStatus} /></td><td><RowActions disabled={!can('finance.receipt.approve')} status={row.approvalStatus} code={row.receiptCode} onAction={(type) => onAction(row.id, type)} /></td></tr>)}{rows.length === 0 ? <tr><td colSpan={9} className="tableEmptyState">Không có phiếu thu nào.</td></tr> : null}</tbody></FinanceTable>;
}

function PaymentsTab({ rows, onCreateClick, onImportFile, onAction, can }: { rows: Payment[]; onCreateClick: () => void; onImportFile: (files: FileList | null) => void; onAction: (id: string, action: 'approve' | 'reject' | 'cancel') => void; can: (permission: string) => boolean }) {
  return <FinanceTable title="Danh sách phiếu chi" count={rows.length} action={<div className="sectionActions"><label className="secondaryButton financeFilePicker"><Download size={14} /> Nhập CSV<input hidden type="file" accept=".csv,text/csv" disabled={!can('finance.payment.import')} onChange={(event) => { onImportFile(event.currentTarget.files); event.currentTarget.value = ''; }} /></label><button type="button" disabled={!can('finance.payment.create')} onClick={onCreateClick}><Plus size={16} /> Tạo phiếu chi</button></div>}><thead><tr><th>Mã phiếu</th><th>Người nhận</th><th>Ngày thanh toán</th><th>Loại phiếu</th><th>Số tiền</th><th>Còn phải chi</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><strong>{row.voucherCode}</strong><span>{row.voucherName || ''}</span>{row.attachmentUrl ? <a href={`${API_URL}${row.attachmentUrl}`} target="_blank" rel="noreferrer">{row.attachmentName || 'Tải file'}</a> : null}</td><td>{row.receiverName || '-'}<span>{row.receiverPhone || ''}</span></td><td>{date(row.paymentDate)}</td><td>{viStatus(row.voucherType)}</td><td>{money(Number(row.paymentAmount))}</td><td>{money(Number(row.remainingAmount))}</td><td><StatusPill status={row.approvalStatus} /></td><td><RowActions disabled={!can('finance.payment.approve')} status={row.approvalStatus} code={row.voucherCode} onAction={(type) => onAction(row.id, type)} /></td></tr>)}{rows.length === 0 ? <tr><td colSpan={8} className="tableEmptyState">Không có phiếu chi nào.</td></tr> : null}</tbody></FinanceTable>;
}

function InvoicesTab({ rows, onCreateClick, onAction, onUploadFiles, onDeleteFile, can }: { rows: Invoice[]; onCreateClick: () => void; onAction: (id: string, action: 'approve' | 'reject' | 'cancel') => void; onUploadFiles: (id: string, files: FileList | null) => Promise<boolean>; onDeleteFile: (id: string, fileId: string) => Promise<void>; can: (permission: string) => boolean }) {
  return <FinanceTable title="Danh sách hóa đơn VAT" count={rows.length} action={<button type="button" disabled={!can('finance.invoice.create')} onClick={onCreateClick}><Plus size={16} /> Tạo hóa đơn VAT</button>}><thead><tr><th>Mã hóa đơn / file</th><th>Khách hàng</th><th>Mã số thuế / Công ty</th><th>Tour</th><th>Ngày xuất</th><th>Giá trị sau thuế</th><th>Tiền VAT</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><strong>{row.invoiceCode}</strong><span>{row.invoiceNumber || ''}</span><div className="financeInvoiceFiles">{row.files?.map((file) => <span key={file.id}><a href={`${API_URL}${file.fileUrl}`} target="_blank" rel="noreferrer">{file.fileName}</a><button type="button" className="iconButton" disabled={!can('finance.invoice.update')} onClick={() => { if (window.confirm(`Xóa file hóa đơn "${file.fileName}"?`)) void onDeleteFile(row.id, file.id); }} aria-label={`Xóa ${file.fileName}`} title="Xóa file"><X size={13} /></button></span>)}<label className="secondaryButton financeFilePicker"><Plus size={13} /> Thêm file<input hidden type="file" multiple disabled={!can('finance.invoice.update')} onChange={(event) => { void onUploadFiles(row.id, event.currentTarget.files); event.currentTarget.value = ''; }} /></label></div></td><td>{row.customerName || '-'}<span>{row.customerPhone || ''}</span></td><td>{row.taxCode || '-'}<span>{row.companyName || ''}</span></td><td>{row.tourCode || '-'}<span>{row.tourName || ''}</span></td><td>{date(row.issuedDate)}</td><td>{money(Number(row.totalAfterTax))}</td><td>{money(Number(row.totalTax))}</td><td><StatusPill status={row.approvalStatus} /></td><td><RowActions disabled={!can('finance.invoice.approve')} status={row.approvalStatus} code={row.invoiceCode} onAction={(type) => onAction(row.id, type)} /></td></tr>)}{rows.length === 0 ? <tr><td colSpan={9} className="tableEmptyState">Không có hóa đơn VAT nào.</td></tr> : null}</tbody></FinanceTable>;
}

function ReceiptForm({ onCreate, onClose, can }: { onCreate: (formData: FormData) => Promise<boolean>; onClose: () => void; can: (permission: string) => boolean }) {
  return <form action={async (formData) => { if (await onCreate(formData)) onClose(); }} className="modalFormStack"><fieldset><legend>Thông tin phiếu thu</legend><div className="formGrid modalFormGrid"><label>Tên phiếu thu<input name="receiptName" required placeholder="Thu tiền tour" /></label><label>Loại phiếu thu<select name="receiptType" defaultValue="TOUR_PAYMENT">{receiptTypes.map((type) => <option key={type} value={type}>{viStatus(type)}</option>)}</select></label><label>Phương thức thanh toán<select name="paymentMethod" defaultValue="BANK_TRANSFER">{methods.map((method) => <option key={method} value={method}>{viStatus(method)}</option>)}</select></label><label>Ngày thanh toán<input name="paymentDate" type="date" /></label></div></fieldset><fieldset><legend>Người nộp và tour</legend><div className="formGrid modalFormGrid"><label>Người nộp<input name="payerName" /></label><label>Số điện thoại<input name="payerPhone" /></label><label>Email<input name="payerEmail" type="email" /></label><label>Mã tour<input name="tourCode" /></label><label className="span2">Tên tour<input name="tourName" /></label></div></fieldset><fieldset><legend>Số tiền và phụ trách</legend><div className="formGrid modalFormGrid"><label>Tổng tiền<input name="totalAmount" type="number" min={0} defaultValue={0} /></label><label>Đã thu trước<input name="paidBefore" type="number" min={0} defaultValue={0} /></label><label>Số tiền thu<input name="receiptAmount" type="number" min={0} defaultValue={0} /></label><label>Chi nhánh<input name="branch" /></label><label>Nhân viên phụ trách<input name="assignedStaff" /></label><label>File đính kèm<input name="attachment" type="file" /></label></div></fieldset><fieldset><legend>Diễn giải</legend><label>Lý do thu<textarea name="reason" rows={3} /></label></fieldset><div className="modalActions"><button type="button" className="secondaryButton" onClick={onClose}>Hủy</button><button type="submit" disabled={!can('finance.receipt.create')}>Tạo phiếu thu</button></div></form>;
}

function PaymentForm({ onCreate, onClose, can }: { onCreate: (formData: FormData) => Promise<boolean>; onClose: () => void; can: (permission: string) => boolean }) {
  return <form action={async (formData) => { if (await onCreate(formData)) onClose(); }} className="modalFormStack"><fieldset><legend>Thông tin phiếu chi</legend><div className="formGrid modalFormGrid"><label>Tên phiếu chi<input name="voucherName" placeholder="Chi thanh toán nhà cung cấp" /></label><label>Loại phiếu chi<select name="voucherType" defaultValue="SUPPLIER_PAYMENT">{paymentTypes.map((type) => <option key={type} value={type}>{viStatus(type)}</option>)}</select></label><label>Phương thức thanh toán<select name="paymentMethod" defaultValue="BANK_TRANSFER">{methods.map((method) => <option key={method} value={method}>{viStatus(method)}</option>)}</select></label><label>Ngày thanh toán<input name="paymentDate" type="date" /></label></div></fieldset><fieldset><legend>Người nhận</legend><div className="formGrid modalFormGrid"><label>Người nhận<input name="receiverName" /></label><label>Số điện thoại<input name="receiverPhone" /></label><label>Tổng tiền<input name="totalAmount" type="number" min={0} defaultValue={0} /></label><label>Số tiền chi<input name="paymentAmount" type="number" min={0} defaultValue={0} /></label></div></fieldset><fieldset><legend>Thông tin chuyển khoản</legend><div className="formGrid modalFormGrid"><label>Tên tài khoản<input name="bankAccountName" /></label><label>Số tài khoản<input name="bankAccountNumber" /></label><label>Ngân hàng<input name="bankName" /></label><label>Chi nhánh<input name="branch" /></label><label>Nhân viên phụ trách<input name="assignedStaff" /></label><label>File đính kèm<input name="attachment" type="file" /></label></div></fieldset><fieldset><legend>Diễn giải</legend><label>Lý do chi<textarea name="reason" rows={3} /></label></fieldset><div className="modalActions"><button type="button" className="secondaryButton" onClick={onClose}>Hủy</button><button type="submit" disabled={!can('finance.payment.create')}>Tạo phiếu chi</button></div></form>;
}

function InvoiceForm({ onCreate, onClose, can }: { onCreate: (formData: FormData) => Promise<boolean>; onClose: () => void; can: (permission: string) => boolean }) {
  return <form action={async (formData) => { if (await onCreate(formData)) onClose(); }} className="modalFormStack"><fieldset><legend>Khách hàng và thông tin thuế</legend><div className="formGrid modalFormGrid"><label>Tên khách hàng<input name="customerName" /></label><label>Số điện thoại<input name="customerPhone" /></label><label>Email<input name="customerEmail" type="email" /></label><label>Mã số thuế<input name="taxCode" /></label><label>Tên đơn vị<input name="companyName" /></label><label>Địa chỉ<input name="companyAddress" /></label></div></fieldset><fieldset><legend>Thông tin hóa đơn</legend><div className="formGrid modalFormGrid"><label>Loại hóa đơn<select name="invoiceType" defaultValue="VAT"><option value="VAT">Hóa đơn VAT</option><option value="NO_VAT">Không VAT</option><option value="ADJUSTMENT">Điều chỉnh</option><option value="REPLACEMENT">Thay thế</option></select></label><label>Ngày xuất<input name="issuedDate" type="date" /></label><label>Mã tour<input name="tourCode" /></label><label>Tên tour<input name="tourName" /></label></div></fieldset><fieldset><legend>Dòng dịch vụ</legend><div className="formGrid modalFormGrid"><label>Dịch vụ<input name="itemName" defaultValue="Dịch vụ du lịch" /></label><label>Đơn vị tính<input name="unit" defaultValue="gói" /></label><label>Số lượng<input name="quantity" type="number" min={1} defaultValue={1} /></label><label>Đơn giá<input name="unitPrice" type="number" min={0} defaultValue={0} /></label><label>Thuế VAT (%)<select name="taxRate" defaultValue="10"><option>0</option><option>5</option><option>8</option><option>10</option></select></label></div></fieldset><fieldset><legend>File và ghi chú</legend><div className="formGrid modalFormGrid"><label className="span2">Tài liệu hóa đơn<input name="attachments" type="file" multiple /></label><label className="span2">Ghi chú<textarea name="note" rows={3} /></label></div></fieldset><div className="modalActions"><button type="button" className="secondaryButton" onClick={onClose}>Hủy</button><button type="submit" disabled={!can('finance.invoice.create')}>Tạo hóa đơn VAT</button></div></form>;
}

function CashflowTab({ rows, summary }: { rows: Cashflow[]; summary: { totalReceipt: number; totalPayment: number; netCashflow: number; byMethod: { method: string; receipt: number; payment: number }[] } }) {
  return <section className="cashflowStack"><aside className="panel financeSide"><h2>Tổng hợp dòng tiền</h2><div className="summaryRows"><div><span>Tổng thu</span><strong>{money(summary.totalReceipt)}</strong></div><div><span>Tổng chi</span><strong>{money(summary.totalPayment)}</strong></div><div><span>Dòng tiền ròng</span><strong>{money(summary.netCashflow)}</strong></div></div><h2>Theo phương thức thanh toán</h2><div className="summaryRows">{summary.byMethod.map((row) => <div key={row.method}><span>{viStatus(row.method)}</span><strong>{money(row.receipt - row.payment)}</strong></div>)}</div></aside><FinanceTable title="Dòng tiền đã duyệt" count={rows.length}><thead><tr><th>Nguồn chứng từ</th><th>Loại dòng tiền</th><th>Ngày thanh toán</th><th>Phương thức</th><th>Số tiền</th><th>Chi nhánh</th><th>Nhân viên phụ trách</th><th>Ghi chú</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{viStatus(row.sourceType)}</td><td><StatusPill status={row.entryType} /></td><td>{date(row.paymentDate)}</td><td>{viStatus(row.paymentMethod)}</td><td>{money(Number(row.amount))}</td><td>{row.branch || '-'}</td><td>{row.staff || '-'}</td><td>{row.note || '-'}</td></tr>)}</tbody></FinanceTable></section>;
}

function DebtTab({ customerDebt, supplierDebt, onAdjust, can }: { customerDebt: DebtRow[]; supplierDebt: DebtRow[]; onAdjust: (kind: 'customers' | 'suppliers', formData: FormData) => Promise<boolean>; can: (permission: string) => boolean }) {
  const [adjustKind, setAdjustKind] = useState<'customers' | 'suppliers'>('customers');
  const adjustmentRows = adjustKind === 'customers' ? customerDebt : supplierDebt;
  return (
    <>
      <section className="panel financeDebtAdjustment">
        <div className="sectionHeader"><h2>Điều chỉnh công nợ thủ công</h2><span>Ghi nhận vào sổ công nợ để truy vết</span></div>
        <form action={async (formData) => { await onAdjust(adjustKind, formData); }} className="formGrid">
          <label>Đối tượng<select value={adjustKind} onChange={(event) => setAdjustKind(event.target.value as 'customers' | 'suppliers')}><option value="customers">Khách hàng</option><option value="suppliers">Nhà cung cấp</option></select></label>
          <label>Chọn hồ sơ<select name="partyId" required><option value="">Chọn hồ sơ</option>{adjustmentRows.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
          <label>Loại điều chỉnh<select name="direction" defaultValue="INCREASE"><option value="INCREASE">Tăng công nợ</option><option value="DECREASE">Giảm công nợ</option></select></label>
          <label>Số tiền<input name="amount" type="number" min={1} required /></label>
          <label>Hạn thanh toán<input name="dueDate" type="date" /></label>
          <label className="span2">Ghi chú<input name="description" required /></label>
          <div><button type="submit" disabled={!can('finance.debt.adjust')}>Ghi điều chỉnh</button></div>
        </form>
      </section>
      <div className="debtGrid">
      <section className="panel financeList">
        <div className="sectionHeader"><h2>Công nợ khách hàng</h2><span>{customerDebt.length} khách hàng</span></div>
        <div className="fitTableWrap"><table className="financeTable">
          <thead><tr><th>Khách hàng</th><th>Số điện thoại</th><th>Tổng phải thu</th><th>Đã thu</th><th>Trong hạn</th><th>Quá hạn</th><th>Còn lại</th></tr></thead>
          <tbody>
            {customerDebt.map((row) => <tr key={row.id}><td><strong>{row.name}</strong>{row.aging.overdueTotal > 0 ? <StatusPill status="OVERDUE" /> : null}</td><td>{row.phone || '-'}</td><td>{money(row.debitTotal)}</td><td>{money(row.creditTotal)}</td><td>{money(row.aging.current)}</td><td><strong className={row.aging.overdueTotal > 0 ? 'dangerText' : ''}>{money(row.aging.overdueTotal)}</strong></td><td><strong style={{color: row.balance > 0 ? '#b20000' : 'inherit'}}>{money(row.balance)}</strong></td></tr>)}
            {customerDebt.length === 0 ? <tr><td colSpan={7} className="tableEmptyState">Không có công nợ khách hàng.</td></tr> : null}
          </tbody>
        </table></div>
      </section>
      <section className="panel financeList">
        <div className="sectionHeader"><h2>Công nợ nhà cung cấp</h2><span>{supplierDebt.length} nhà cung cấp</span></div>
        <div className="fitTableWrap"><table className="financeTable">
          <thead><tr><th>Nhà cung cấp</th><th>Số điện thoại</th><th>Tổng phải trả</th><th>Đã trả</th><th>Trong hạn</th><th>Quá hạn</th><th>Còn lại</th></tr></thead>
          <tbody>
            {supplierDebt.map((row) => <tr key={row.id}><td><strong>{row.name}</strong>{row.aging.overdueTotal > 0 ? <StatusPill status="OVERDUE" /> : null}</td><td>{row.phone || '-'}</td><td>{money(row.debitTotal)}</td><td>{money(row.creditTotal)}</td><td>{money(row.aging.current)}</td><td><strong className={row.aging.overdueTotal > 0 ? 'dangerText' : ''}>{money(row.aging.overdueTotal)}</strong></td><td><strong style={{color: row.balance > 0 ? '#b20000' : 'inherit'}}>{money(row.balance)}</strong></td></tr>)}
            {supplierDebt.length === 0 ? <tr><td colSpan={7} className="tableEmptyState">Không có công nợ nhà cung cấp.</td></tr> : null}
          </tbody>
        </table></div>
      </section>
      </div>
    </>
  );
}
function FinanceModal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="modalOverlay" role="dialog" aria-modal="true"><section className="modalPanel"><header><h2>{title}</h2><button type="button" className="secondaryButton iconButton" onClick={onClose} aria-label="Đóng"><X size={18} /></button></header>{children}</section></div>;
}

function FinanceTable({ title, count, action, children }: { title: string; count: number; action?: React.ReactNode; children: React.ReactNode }) {
  return <section className="panel financeList"><div className="sectionHeader"><h2>{title}</h2><div className="sectionActions"><span>{count} dòng</span>{action}</div></div><div className="fitTableWrap"><table className="financeTable">{children}</table></div></section>;
}
function Metric({ label, value }: { label: string; value: string | number }) { return <article className="metric"><span>{label}</span><strong>{value}</strong></article>; }
function authHeaders(json = true) { const token = typeof window !== 'undefined' ? window.localStorage.getItem('smarttour.auth.token') : null; return { ...(json ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }; }
async function getJson(path: string) { const response = await fetch(`${API_URL}${path}`, { cache: 'no-store', headers: authHeaders() }); if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.message || response.statusText || `HTTP ${response.status}`); } return response.json(); }
function money(value: number) { return new Intl.NumberFormat('vi-VN').format(value || 0); }
function date(value?: string) { return value ? new Date(value).toLocaleDateString('vi-VN') : '-'; }
function text(value: FormDataEntryValue | null) { return typeof value === 'string' ? value : ''; }
function number(value: FormDataEntryValue | null) { return Number(text(value) || 0); }
function mergeQuery(query: string, values: Record<string, string>) { const params = new URLSearchParams(query); Object.entries(values).forEach(([key, value]) => params.set(key, value)); return params.toString(); }
function errorText(error: unknown) { return error instanceof Error ? error.message : String(error || 'Lỗi không xác định'); }
function canRunAction(status: string, action: 'approve' | 'reject' | 'cancel') {
  if (action === 'approve' || action === 'reject') return ['DRAFT', 'PENDING'].includes(status);
  if (action === 'cancel') return status === 'APPROVED';
  return false;
}
function StatusPill({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const extra = status === 'OVERDUE' ? 'status-rejected' : status === 'RECEIPT' ? 'status-approved' : status === 'PAYMENT' ? 'status-pending' : `status-${normalized}`;
  return <span className={`statusPill ${extra}`}>{status === 'OVERDUE' ? 'Quá hạn' : viStatus(status)}</span>;
}
function RowActions({ disabled, status, code, onAction }: { disabled: boolean; status: string; code: string; onAction: (action: 'approve' | 'reject' | 'cancel') => void }) {
  const run = (action: 'approve' | 'reject' | 'cancel', label: string) => {
    if (window.confirm(`${label} chứng từ ${code}?`)) onAction(action);
  };
  return <div className="financeActions"><button className="secondaryButton iconButton" title="Duyệt" aria-label="Duyệt" disabled={disabled || !canRunAction(status, 'approve')} onClick={() => run('approve', 'Duyệt')}><CheckCircle2 size={16} /></button><button className="secondaryButton iconButton" title="Từ chối" aria-label="Từ chối" disabled={disabled || !canRunAction(status, 'reject')} onClick={() => run('reject', 'Từ chối')}><XCircle size={16} /></button><button className="dangerButton iconButton" title="Hủy" aria-label="Hủy" disabled={disabled || !canRunAction(status, 'cancel')} onClick={() => run('cancel', 'Hủy')}><X size={16} /></button></div>;
}

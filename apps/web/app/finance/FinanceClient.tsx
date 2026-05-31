'use client';

import { CheckCircle2, Download, FileText, HandCoins, Plus, ReceiptText, RefreshCcw, Search, WalletCards, X, XCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PermissionNotice, usePermissions } from '../usePermissions';
import { viStatus } from '../i18n';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

type Summary = { count: number; totalAmount: number; draft?: number; deposit?: number; approved?: number; pending?: number; rejected?: number };
type Receipt = { id: string; receiptCode: string; receiptName: string; receiptType: string; paymentMethod: string; paymentDate?: string; payerName?: string; payerPhone?: string; totalAmount: string; paidBefore: string; receiptAmount: string; remainingAmount: string; approvalStatus: string; branch?: string; assignedStaff?: string; orders?: { tourCode?: string; tourName?: string; amount: string }[] };
type Payment = { id: string; voucherCode: string; voucherName?: string; voucherType: string; paymentMethod: string; paymentDate?: string; receiverName?: string; receiverPhone?: string; totalAmount: string; paymentAmount: string; remainingAmount: string; approvalStatus: string; branch?: string; assignedStaff?: string };
type Invoice = { id: string; invoiceCode: string; invoiceNumber?: string; customerName?: string; customerPhone?: string; taxCode?: string; companyName?: string; tourCode?: string; tourName?: string; issuedDate?: string; totalBeforeTax: string; totalTax: string; totalAfterTax: string; invoiceType: string; taxAuthorityCode?: string; approvalStatus: string };
type Cashflow = { id: string; sourceType: string; entryType: string; amount: string; paymentMethod: string; paymentDate?: string; branch?: string; department?: string; staff?: string; note?: string };

const emptySummary: Summary = { count: 0, totalAmount: 0 };
const receiptTypes = ['DEPOSIT', 'TOUR_PAYMENT', 'CUSTOMER_DEBT', 'COLLECT_ON_BEHALF', 'SUPPLIER_FUND_REFUND', 'OTHER'];
const paymentTypes = ['SUPPLIER_PAYMENT', 'CUSTOMER_REFUND', 'COMMISSION', 'INTERNAL_EXPENSE', 'SUPPLIER_DEPOSIT', 'ADVANCE', 'OTHER'];
const methods = ['BANK_TRANSFER', 'CASH', 'CARD', 'QR', 'OFFSET', 'OTHER'];
const statuses = ['DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'];
const financeTabs = ['pending', 'receipts', 'payments', 'invoices', 'cashflow', 'debt'] as const;
type FinanceTab = typeof financeTabs[number];
function normalizeTab(value: string | null): FinanceTab { return financeTabs.includes(value as FinanceTab) ? value as FinanceTab : 'receipts'; }

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
  const [customerDebt, setCustomerDebt] = useState<{id:string;name:string;phone?:string;debitTotal:string;creditTotal:string;balance:string}[]>([]);
  const [supplierDebt, setSupplierDebt] = useState<{id:string;name:string;phone?:string;debitTotal:string;creditTotal:string;balance:string}[]>([]);
  const [message, setMessage] = useState('');

  const query = useMemo(() => {
    const params = new URLSearchParams();
    Object.entries(filter).forEach(([key, value]) => value && params.set(key, value));
    if (tab === 'pending') params.set('status', 'PENDING');
    return params.toString();
  }, [filter, tab]);

  useEffect(() => { setTab(normalizeTab(searchParams.get('tab'))); }, [searchParams]);
  useEffect(() => { void load(); }, [query]);

  function openTab(nextTab: FinanceTab) {
    setTab(nextTab);
    router.push(nextTab === 'receipts' ? '/finance' : `/finance?tab=${nextTab}`, { scroll: false });
  }

  async function load() {
    const [receiptData, paymentData, invoiceData, cashData, custDebtData, suppDebtData] = await Promise.all([
      getJson(`/api/finance/receipts?${query}`),
      getJson(`/api/finance/payments?${query}`),
      getJson(`/api/finance/invoices?${query}`),
      getJson(`/api/finance/cashflow?${query}`),
      getJson(`/api/finance/debt/customers`),
      getJson(`/api/finance/debt/suppliers`),
    ]);
    setReceipts(receiptData.rows || []);
    setPayments(paymentData.rows || []);
    setInvoices(invoiceData.rows || []);
    setCashflow(cashData.rows || []);
    setReceiptSummary(receiptData.summary || emptySummary);
    setPaymentSummary(paymentData.summary || emptySummary);
    setInvoiceSummary(invoiceData.summary || emptySummary);
    setCashSummary(cashData.summary || { totalReceipt: 0, totalPayment: 0, netCashflow: 0, byMethod: [] });
    setCustomerDebt(custDebtData.rows || []);
    setSupplierDebt(suppDebtData.rows || []);
  }

  async function createReceipt(formData: FormData) {
    const amount = number(formData.get('receiptAmount'));
    return post('/api/finance/receipts', {
      receiptName: text(formData.get('receiptName')), receiptType: text(formData.get('receiptType')), paymentMethod: text(formData.get('paymentMethod')), paymentDate: text(formData.get('paymentDate')),
      payerName: text(formData.get('payerName')), payerPhone: text(formData.get('payerPhone')), payerEmail: text(formData.get('payerEmail')), reason: text(formData.get('reason')),
      totalAmount: number(formData.get('totalAmount')) || amount, paidBefore: number(formData.get('paidBefore')), receiptAmount: amount,
      branch: text(formData.get('branch')), assignedStaff: text(formData.get('assignedStaff')), orders: [{ tourCode: text(formData.get('tourCode')), tourName: text(formData.get('tourName')), amount }], createdBy: 'accounting',
    });
  }

  async function createPayment(formData: FormData) {
    const amount = number(formData.get('paymentAmount'));
    return post('/api/finance/payments', {
      voucherName: text(formData.get('voucherName')), voucherType: text(formData.get('voucherType')), paymentMethod: text(formData.get('paymentMethod')), paymentDate: text(formData.get('paymentDate')),
      receiverName: text(formData.get('receiverName')), receiverPhone: text(formData.get('receiverPhone')), reason: text(formData.get('reason')),
      totalAmount: number(formData.get('totalAmount')) || amount, paymentAmount: amount, bankAccountName: text(formData.get('bankAccountName')), bankAccountNumber: text(formData.get('bankAccountNumber')), bankName: text(formData.get('bankName')),
      branch: text(formData.get('branch')), assignedStaff: text(formData.get('assignedStaff')), createdBy: 'accounting',
    });
  }

  async function createInvoice(formData: FormData) {
    return post('/api/finance/invoices', {
      customerName: text(formData.get('customerName')), customerPhone: text(formData.get('customerPhone')), customerEmail: text(formData.get('customerEmail')),
      taxCode: text(formData.get('taxCode')), companyName: text(formData.get('companyName')), companyAddress: text(formData.get('companyAddress')), invoiceType: text(formData.get('invoiceType')), issuedDate: text(formData.get('issuedDate')),
      tourCode: text(formData.get('tourCode')), tourName: text(formData.get('tourName')), note: text(formData.get('note')),
      items: [{ itemName: text(formData.get('itemName')) || 'Dịch vụ du lịch', unit: text(formData.get('unit')) || 'gói', quantity: number(formData.get('quantity')) || 1, unitPrice: number(formData.get('unitPrice')), taxRate: number(formData.get('taxRate')) }], createdBy: 'accounting',
    });
  }

  async function post(path: string, payload: unknown) {
    setMessage('');
    const response = await fetch(`${API_URL}${path}`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(payload) });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setMessage(data.message || 'Không thực hiện được');
      return false;
    }
    setMessage('Đã cập nhật dữ liệu tài chính');
    await load();
    return true;
  }

  async function action(kind: 'receipts' | 'payments' | 'invoices', id: string, actionName: 'approve' | 'reject' | 'cancel') { await post(`/api/finance/${kind}/${id}/${actionName}`, { actor: 'accounting' }); }
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
      <PermissionNotice allowed={canAny(['finance.receipt.view', 'finance.payment.view', 'finance.invoice.view', 'finance.cashflow.view'])} label="xem tài chính kế toán" />

      <section className="panel financeFilters">
        <label><Search size={15} /> Tìm kiếm<input value={filter.search} onChange={(event) => setFilter({ ...filter, search: event.target.value })} placeholder="Tên, SĐT, email, mã chứng từ, mã tour" /></label>
        <label>Trạng thái<select value={filter.status} onChange={(event) => setFilter({ ...filter, status: event.target.value })}><option value="">Tất cả</option>{statuses.map((status) => <option key={status}>{status}</option>)}</select></label>
        <label>Phương thức<select value={filter.paymentMethod} onChange={(event) => setFilter({ ...filter, paymentMethod: event.target.value })}><option value="">Tất cả</option>{methods.map((method) => <option key={method}>{method}</option>)}</select></label>
        <label>Từ ngày<input type="date" value={filter.from} onChange={(event) => setFilter({ ...filter, from: event.target.value })} /></label>
        <label>Đến ngày<input type="date" value={filter.to} onChange={(event) => setFilter({ ...filter, to: event.target.value })} /></label>
      </section>

      <div className="moduleTabs financeTabs">
        {[
          ['pending', 'Phiếu thu chờ', ReceiptText], ['receipts', 'Phiếu thu', ReceiptText], ['payments', 'Phiếu chi', HandCoins], ['invoices', 'Hóa đơn VAT', FileText], ['cashflow', 'Dòng tiền', WalletCards],
          ['debt', 'Công nợ', WalletCards],
        ].map(([key, label, Icon]) => { const tabKey = key as FinanceTab; const TabIcon = Icon as typeof ReceiptText; return <button key={tabKey} type="button" className={tab === tabKey ? 'active' : ''} onClick={() => openTab(tabKey)}><TabIcon size={16} /> {label as string}</button>; })}
      </div>

      {tab === 'pending' || tab === 'receipts' ? <ReceiptsTab rows={pendingReceipts} onCreateClick={() => setModal('receipts')} onAction={(id, type) => action('receipts', id, type)} can={can} /> : null}
      {tab === 'payments' ? <PaymentsTab rows={payments} onCreateClick={() => setModal('payments')} onAction={(id, type) => action('payments', id, type)} can={can} /> : null}
      {tab === 'invoices' ? <InvoicesTab rows={invoices} onCreateClick={() => setModal('invoices')} onAction={(id, type) => action('invoices', id, type)} can={can} /> : null}
      {tab === 'cashflow' ? <CashflowTab rows={cashflow} summary={cashSummary} /> : null}
      {tab === 'debt' ? <DebtTab customerDebt={customerDebt} supplierDebt={supplierDebt} /> : null}

      {modal === 'receipts' ? <FinanceModal title="Tạo phiếu thu" onClose={() => setModal(null)}><ReceiptForm can={can} onCreate={createReceipt} onClose={() => setModal(null)} /></FinanceModal> : null}
      {modal === 'payments' ? <FinanceModal title="Tạo phiếu chi" onClose={() => setModal(null)}><PaymentForm can={can} onCreate={createPayment} onClose={() => setModal(null)} /></FinanceModal> : null}
      {modal === 'invoices' ? <FinanceModal title="Tạo hóa đơn VAT" onClose={() => setModal(null)}><InvoiceForm can={can} onCreate={createInvoice} onClose={() => setModal(null)} /></FinanceModal> : null}
    </section>
  );
}

function ReceiptsTab({ rows, onCreateClick, onAction, can }: { rows: Receipt[]; onCreateClick: () => void; onAction: (id: string, action: 'approve' | 'reject' | 'cancel') => void; can: (permission: string) => boolean }) {
  return <FinanceTable title="Danh sách phiếu thu" count={rows.length} action={<button type="button" disabled={!can('finance.receipt.create')} onClick={onCreateClick}><Plus size={16} /> Tạo phiếu thu</button>}><thead><tr><th>Mã</th><th>Người nộp</th><th>Tour</th><th>Ngày</th><th>Loại</th><th>Số tiền</th><th>Còn thu</th><th>Trạng thái</th><th></th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><strong>{row.receiptCode}</strong><span>{row.receiptName}</span></td><td>{row.payerName || '-'}<span>{row.payerPhone || ''}</span></td><td>{row.orders?.[0]?.tourCode || '-'}<span>{row.orders?.[0]?.tourName || ''}</span></td><td>{date(row.paymentDate)}</td><td>{viStatus(row.receiptType)}</td><td>{money(Number(row.receiptAmount))}</td><td>{money(Number(row.remainingAmount))}</td><td><span className={`statusPill status-${row.approvalStatus.toLowerCase()}`}>{viStatus(row.approvalStatus)}</span></td><td className="financeActions"><button className="secondaryButton iconButton" disabled={!can('finance.receipt.approve')} onClick={() => onAction(row.id, 'approve')}><CheckCircle2 size={16} /></button><button className="secondaryButton iconButton" disabled={!can('finance.receipt.approve')} onClick={() => onAction(row.id, 'reject')}><XCircle size={16} /></button><button className="dangerButton iconButton" disabled={!can('finance.receipt.approve')} onClick={() => onAction(row.id, 'cancel')}><X size={16} /></button></td></tr>)}{rows.length === 0 ? <tr><td colSpan={9} className="tableEmptyState">Không có phiếu thu nào.</td></tr> : null}</tbody></FinanceTable>;
}

function PaymentsTab({ rows, onCreateClick, onAction, can }: { rows: Payment[]; onCreateClick: () => void; onAction: (id: string, action: 'approve' | 'reject' | 'cancel') => void; can: (permission: string) => boolean }) {
  return <FinanceTable title="Danh sách phiếu chi" count={rows.length} action={<button type="button" disabled={!can('finance.payment.create')} onClick={onCreateClick}><Plus size={16} /> Tạo phiếu chi</button>}><thead><tr><th>Mã</th><th>Người nhận</th><th>Ngày</th><th>Loại</th><th>Số tiền</th><th>Còn chi</th><th>Trạng thái</th><th></th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><strong>{row.voucherCode}</strong><span>{row.voucherName || ''}</span></td><td>{row.receiverName || '-'}<span>{row.receiverPhone || ''}</span></td><td>{date(row.paymentDate)}</td><td>{viStatus(row.voucherType)}</td><td>{money(Number(row.paymentAmount))}</td><td>{money(Number(row.remainingAmount))}</td><td><span className={`statusPill status-${row.approvalStatus.toLowerCase()}`}>{viStatus(row.approvalStatus)}</span></td><td className="financeActions"><button className="secondaryButton iconButton" disabled={!can('finance.payment.approve')} onClick={() => onAction(row.id, 'approve')}><CheckCircle2 size={16} /></button><button className="secondaryButton iconButton" disabled={!can('finance.payment.approve')} onClick={() => onAction(row.id, 'reject')}><XCircle size={16} /></button><button className="dangerButton iconButton" disabled={!can('finance.payment.approve')} onClick={() => onAction(row.id, 'cancel')}><X size={16} /></button></td></tr>)}{rows.length === 0 ? <tr><td colSpan={8} className="tableEmptyState">Không có phiếu chi nào.</td></tr> : null}</tbody></FinanceTable>;
}

function InvoicesTab({ rows, onCreateClick, onAction, can }: { rows: Invoice[]; onCreateClick: () => void; onAction: (id: string, action: 'approve' | 'reject' | 'cancel') => void; can: (permission: string) => boolean }) {
  return <FinanceTable title="Danh sách hóa đơn" count={rows.length} action={<button type="button" disabled={!can('finance.invoice.create')} onClick={onCreateClick}><Plus size={16} /> Tạo hóa đơn</button>}><thead><tr><th>Mã</th><th>Khách hàng</th><th>MST/Công ty</th><th>Tour</th><th>Ngày xuất</th><th>Giá trị</th><th>VAT</th><th>Trạng thái</th><th></th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><strong>{row.invoiceCode}</strong><span>{row.invoiceNumber || ''}</span></td><td>{row.customerName || '-'}<span>{row.customerPhone || ''}</span></td><td>{row.taxCode || '-'}<span>{row.companyName || ''}</span></td><td>{row.tourCode || '-'}<span>{row.tourName || ''}</span></td><td>{date(row.issuedDate)}</td><td>{money(Number(row.totalAfterTax))}</td><td>{money(Number(row.totalTax))}</td><td><span className={`statusPill status-${row.approvalStatus.toLowerCase()}`}>{viStatus(row.approvalStatus)}</span></td><td className="financeActions"><button className="secondaryButton iconButton" disabled={!can('finance.invoice.approve')} onClick={() => onAction(row.id, 'approve')}><CheckCircle2 size={16} /></button><button className="secondaryButton iconButton" disabled={!can('finance.invoice.approve')} onClick={() => onAction(row.id, 'reject')}><XCircle size={16} /></button><button className="dangerButton iconButton" disabled={!can('finance.invoice.approve')} onClick={() => onAction(row.id, 'cancel')}><X size={16} /></button></td></tr>)}{rows.length === 0 ? <tr><td colSpan={9} className="tableEmptyState">Không có hóa đơn nào.</td></tr> : null}</tbody></FinanceTable>;
}

function ReceiptForm({ onCreate, onClose, can }: { onCreate: (formData: FormData) => Promise<boolean>; onClose: () => void; can: (permission: string) => boolean }) {
  return <form action={async (formData) => { if (await onCreate(formData)) onClose(); }} className="formGrid modalFormGrid"><label>Tên phiếu thu<input name="receiptName" required placeholder="Thu tiền tour" /></label><label>Loại phiếu thu<select name="receiptType" defaultValue="TOUR_PAYMENT">{receiptTypes.map((type) => <option key={type}>{type}</option>)}</select></label><label>Phương thức<select name="paymentMethod" defaultValue="BANK_TRANSFER">{methods.map((method) => <option key={method}>{method}</option>)}</select></label><label>Ngày thanh toán<input name="paymentDate" type="date" /></label><label>Người nộp<input name="payerName" /></label><label>SĐT<input name="payerPhone" /></label><label>Email<input name="payerEmail" type="email" /></label><label>Mã tour<input name="tourCode" /></label><label>Tên tour<input name="tourName" /></label><label>Tổng tiền<input name="totalAmount" type="number" min={0} defaultValue={0} /></label><label>Đã thu<input name="paidBefore" type="number" min={0} defaultValue={0} /></label><label>Số tiền thu<input name="receiptAmount" type="number" min={0} defaultValue={0} /></label><label>Chi nhánh<input name="branch" /></label><label>Nhân viên<input name="assignedStaff" /></label><label className="span2">Lý do<textarea name="reason" rows={3} /></label><div className="modalActions"><button type="button" className="secondaryButton" onClick={onClose}>Hủy</button><button type="submit" disabled={!can('finance.receipt.create')}>Tạo phiếu thu</button></div></form>;
}

function PaymentForm({ onCreate, onClose, can }: { onCreate: (formData: FormData) => Promise<boolean>; onClose: () => void; can: (permission: string) => boolean }) {
  return <form action={async (formData) => { if (await onCreate(formData)) onClose(); }} className="formGrid modalFormGrid"><label>Tên phiếu chi<input name="voucherName" placeholder="Chi thanh toán NCC" /></label><label>Loại phiếu chi<select name="voucherType" defaultValue="SUPPLIER_PAYMENT">{paymentTypes.map((type) => <option key={type}>{type}</option>)}</select></label><label>Phương thức<select name="paymentMethod" defaultValue="BANK_TRANSFER">{methods.map((method) => <option key={method}>{method}</option>)}</select></label><label>Ngày thanh toán<input name="paymentDate" type="date" /></label><label>Người nhận<input name="receiverName" /></label><label>SĐT<input name="receiverPhone" /></label><label>Tổng tiền<input name="totalAmount" type="number" min={0} defaultValue={0} /></label><label>Số tiền chi<input name="paymentAmount" type="number" min={0} defaultValue={0} /></label><label>Tên TK<input name="bankAccountName" /></label><label>Số TK<input name="bankAccountNumber" /></label><label>Ngân hàng<input name="bankName" /></label><label>Chi nhánh<input name="branch" /></label><label>Nhân viên<input name="assignedStaff" /></label><label className="span2">Lý do<textarea name="reason" rows={3} /></label><div className="modalActions"><button type="button" className="secondaryButton" onClick={onClose}>Hủy</button><button type="submit" disabled={!can('finance.payment.create')}>Tạo phiếu chi</button></div></form>;
}

function InvoiceForm({ onCreate, onClose, can }: { onCreate: (formData: FormData) => Promise<boolean>; onClose: () => void; can: (permission: string) => boolean }) {
  return <form action={async (formData) => { if (await onCreate(formData)) onClose(); }} className="formGrid modalFormGrid"><label>Tên KH<input name="customerName" /></label><label>SĐT<input name="customerPhone" /></label><label>Email<input name="customerEmail" type="email" /></label><label>MST<input name="taxCode" /></label><label>Tên đơn vị<input name="companyName" /></label><label>Địa chỉ<input name="companyAddress" /></label><label>Loại HĐ<select name="invoiceType" defaultValue="VAT"><option>VAT</option><option>NO_VAT</option><option>ADJUSTMENT</option><option>REPLACEMENT</option></select></label><label>Ngày xuất<input name="issuedDate" type="date" /></label><label>Mã tour<input name="tourCode" /></label><label>Tên tour<input name="tourName" /></label><label>Dịch vụ<input name="itemName" defaultValue="Dịch vụ du lịch" /></label><label>ĐVT<input name="unit" defaultValue="gói" /></label><label>SL<input name="quantity" type="number" min={1} defaultValue={1} /></label><label>Đơn giá<input name="unitPrice" type="number" min={0} defaultValue={0} /></label><label>VAT %<select name="taxRate" defaultValue="10"><option>0</option><option>5</option><option>8</option><option>10</option></select></label><label className="span2">Ghi chú<textarea name="note" rows={3} /></label><div className="modalActions"><button type="button" className="secondaryButton" onClick={onClose}>Hủy</button><button type="submit" disabled={!can('finance.invoice.create')}>Tạo hóa đơn</button></div></form>;
}

function CashflowTab({ rows, summary }: { rows: Cashflow[]; summary: { totalReceipt: number; totalPayment: number; netCashflow: number; byMethod: { method: string; receipt: number; payment: number }[] } }) {
  return <section className="cashflowStack"><aside className="panel financeSide"><h2>Tổng hợp dòng tiền</h2><div className="summaryRows"><div><span>Tổng thu</span><strong>{money(summary.totalReceipt)}</strong></div><div><span>Tổng chi</span><strong>{money(summary.totalPayment)}</strong></div><div><span>Net</span><strong>{money(summary.netCashflow)}</strong></div></div><h2>Theo phương thức</h2><div className="summaryRows">{summary.byMethod.map((row) => <div key={row.method}><span>{row.method}</span><strong>{money(row.receipt - row.payment)}</strong></div>)}</div></aside><FinanceTable title="Dòng tiền đã duyệt" count={rows.length}><thead><tr><th>Nguồn</th><th>Loại</th><th>Ngày</th><th>Phương thức</th><th>Số tiền</th><th>Chi nhánh</th><th>Nhân viên</th><th>Ghi chú</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{viStatus(row.sourceType)}</td><td><span className="statusPill">{viStatus(row.entryType)}</span></td><td>{date(row.paymentDate)}</td><td>{viStatus(row.paymentMethod)}</td><td>{money(Number(row.amount))}</td><td>{row.branch || '-'}</td><td>{row.staff || '-'}</td><td>{row.note || '-'}</td></tr>)}</tbody></FinanceTable></section>;
}

function DebtTab({ customerDebt, supplierDebt }: { customerDebt: {id:string;name:string;phone?:string;debitTotal:string;creditTotal:string;balance:string}[]; supplierDebt: {id:string;name:string;phone?:string;debitTotal:string;creditTotal:string;balance:string}[] }) {
  return (
    <div className="debtGrid">
      <section className="panel financeList">
        <div className="sectionHeader"><h2>Công nợ khách hàng</h2><span>{customerDebt.length} khách</span></div>
        <div className="fitTableWrap"><table className="financeTable">
          <thead><tr><th>Khách hàng</th><th>SĐT</th><th>Tổng phải thu</th><th>Đã thu</th><th>Còn lại</th></tr></thead>
          <tbody>
            {customerDebt.map((row) => <tr key={row.id}><td><strong>{row.name}</strong></td><td>{row.phone || '-'}</td><td>{money(Number(row.debitTotal))}</td><td>{money(Number(row.creditTotal))}</td><td><strong style={{color: Number(row.balance) > 0 ? '#b20000' : 'inherit'}}>{money(Number(row.balance))}</strong></td></tr>)}
            {customerDebt.length === 0 ? <tr><td colSpan={5} className="tableEmptyState">Không có công nợ khách hàng.</td></tr> : null}
          </tbody>
        </table></div>
      </section>
      <section className="panel financeList">
        <div className="sectionHeader"><h2>Công nợ nhà cung cấp</h2><span>{supplierDebt.length} NCC</span></div>
        <div className="fitTableWrap"><table className="financeTable">
          <thead><tr><th>Nhà cung cấp</th><th>SĐT</th><th>Tổng phải trả</th><th>Đã trả</th><th>Còn lại</th></tr></thead>
          <tbody>
            {supplierDebt.map((row) => <tr key={row.id}><td><strong>{row.name}</strong></td><td>{row.phone || '-'}</td><td>{money(Number(row.debitTotal))}</td><td>{money(Number(row.creditTotal))}</td><td><strong style={{color: Number(row.balance) > 0 ? '#b20000' : 'inherit'}}>{money(Number(row.balance))}</strong></td></tr>)}
            {supplierDebt.length === 0 ? <tr><td colSpan={5} className="tableEmptyState">Không có công nợ nhà cung cấp.</td></tr> : null}
          </tbody>
        </table></div>
      </section>
    </div>
  );
}
function FinanceModal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="modalOverlay" role="dialog" aria-modal="true" onMouseDown={onClose}><section className="modalPanel" onMouseDown={(event) => event.stopPropagation()}><header><h2>{title}</h2><button type="button" className="secondaryButton iconButton" onClick={onClose} aria-label="Đóng"><X size={18} /></button></header>{children}</section></div>;
}

function FinanceTable({ title, count, action, children }: { title: string; count: number; action?: React.ReactNode; children: React.ReactNode }) {
  return <section className="panel financeList"><div className="sectionHeader"><h2>{title}</h2><div className="sectionActions"><span>{count} dòng</span>{action}</div></div><div className="fitTableWrap"><table className="financeTable">{children}</table></div></section>;
}
function Metric({ label, value }: { label: string; value: string | number }) { return <article className="metric"><span>{label}</span><strong>{value}</strong></article>; }
function authHeaders() { const token = typeof window !== 'undefined' ? window.localStorage.getItem('smarttour.auth.token') : null; return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }; }
async function getJson(path: string) { const response = await fetch(`${API_URL}${path}`, { cache: 'no-store', headers: authHeaders() }); if (!response.ok) return {}; return response.json(); }
function money(value: number) { return new Intl.NumberFormat('vi-VN').format(value || 0); }
function date(value?: string) { return value ? new Date(value).toLocaleDateString('vi-VN') : '-'; }
function text(value: FormDataEntryValue | null) { return typeof value === 'string' ? value : ''; }
function number(value: FormDataEntryValue | null) { return Number(text(value) || 0); }

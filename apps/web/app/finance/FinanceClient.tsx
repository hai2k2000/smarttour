'use client';

import { CheckCircle2, Download, FileText, HandCoins, Plus, ReceiptText, RefreshCcw, Search, WalletCards, XCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
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

export default function FinanceClient() {
  const { can, canAny } = usePermissions();
  const [tab, setTab] = useState('receipts');
  const [filter, setFilter] = useState({ search: '', status: '', paymentMethod: '', from: '', to: '' });
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [cashflow, setCashflow] = useState<Cashflow[]>([]);
  const [receiptSummary, setReceiptSummary] = useState<Summary>(emptySummary);
  const [paymentSummary, setPaymentSummary] = useState<Summary>(emptySummary);
  const [invoiceSummary, setInvoiceSummary] = useState<Summary>(emptySummary);
  const [cashSummary, setCashSummary] = useState({ totalReceipt: 0, totalPayment: 0, netCashflow: 0, byMethod: [] as { method: string; receipt: number; payment: number }[] });
  const [message, setMessage] = useState('');

  const query = useMemo(() => {
    const params = new URLSearchParams();
    Object.entries(filter).forEach(([key, value]) => value && params.set(key, value));
    if (tab === 'pending') params.set('status', 'PENDING');
    return params.toString();
  }, [filter, tab]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initialTab = params.get('tab');
    if (initialTab) setTab(initialTab);
  }, []);

  useEffect(() => {
    void load();
  }, [query]);

  async function load() {
    const [receiptData, paymentData, invoiceData, cashData] = await Promise.all([
      getJson(`/api/finance/receipts?${query}`),
      getJson(`/api/finance/payments?${query}`),
      getJson(`/api/finance/invoices?${query}`),
      getJson(`/api/finance/cashflow?${query}`),
    ]);
    setReceipts(receiptData.rows || []);
    setPayments(paymentData.rows || []);
    setInvoices(invoiceData.rows || []);
    setCashflow(cashData.rows || []);
    setReceiptSummary(receiptData.summary || emptySummary);
    setPaymentSummary(paymentData.summary || emptySummary);
    setInvoiceSummary(invoiceData.summary || emptySummary);
    setCashSummary(cashData.summary || { totalReceipt: 0, totalPayment: 0, netCashflow: 0, byMethod: [] });
  }

  async function createReceipt(formData: FormData) {
    const amount = number(formData.get('receiptAmount'));
    await post('/api/finance/receipts', {
      receiptName: text(formData.get('receiptName')),
      receiptType: text(formData.get('receiptType')),
      paymentMethod: text(formData.get('paymentMethod')),
      paymentDate: text(formData.get('paymentDate')),
      payerName: text(formData.get('payerName')),
      payerPhone: text(formData.get('payerPhone')),
      payerEmail: text(formData.get('payerEmail')),
      reason: text(formData.get('reason')),
      totalAmount: number(formData.get('totalAmount')) || amount,
      paidBefore: number(formData.get('paidBefore')),
      receiptAmount: amount,
      branch: text(formData.get('branch')),
      assignedStaff: text(formData.get('assignedStaff')),
      orders: [{ tourCode: text(formData.get('tourCode')), tourName: text(formData.get('tourName')), amount }],
      createdBy: 'accounting',
    });
  }

  async function createPayment(formData: FormData) {
    const amount = number(formData.get('paymentAmount'));
    await post('/api/finance/payments', {
      voucherName: text(formData.get('voucherName')),
      voucherType: text(formData.get('voucherType')),
      paymentMethod: text(formData.get('paymentMethod')),
      paymentDate: text(formData.get('paymentDate')),
      receiverName: text(formData.get('receiverName')),
      receiverPhone: text(formData.get('receiverPhone')),
      reason: text(formData.get('reason')),
      totalAmount: number(formData.get('totalAmount')) || amount,
      paymentAmount: amount,
      bankAccountName: text(formData.get('bankAccountName')),
      bankAccountNumber: text(formData.get('bankAccountNumber')),
      bankName: text(formData.get('bankName')),
      branch: text(formData.get('branch')),
      assignedStaff: text(formData.get('assignedStaff')),
      createdBy: 'accounting',
    });
  }

  async function createInvoice(formData: FormData) {
    await post('/api/finance/invoices', {
      customerName: text(formData.get('customerName')),
      customerPhone: text(formData.get('customerPhone')),
      customerEmail: text(formData.get('customerEmail')),
      taxCode: text(formData.get('taxCode')),
      companyName: text(formData.get('companyName')),
      companyAddress: text(formData.get('companyAddress')),
      invoiceType: text(formData.get('invoiceType')),
      issuedDate: text(formData.get('issuedDate')),
      tourCode: text(formData.get('tourCode')),
      tourName: text(formData.get('tourName')),
      note: text(formData.get('note')),
      items: [{
        itemName: text(formData.get('itemName')) || 'Dich vu du lich',
        unit: text(formData.get('unit')) || 'goi',
        quantity: number(formData.get('quantity')) || 1,
        unitPrice: number(formData.get('unitPrice')),
        taxRate: number(formData.get('taxRate')),
      }],
      createdBy: 'accounting',
    });
  }

  async function post(path: string, payload: unknown) {
    setMessage('');
    const response = await fetch(`${API_URL}${path}`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(payload) });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setMessage(data.message || 'Khong thực hiện duoc');
      return;
    }
    setMessage('Đã cập nhật dữ liệu tài chính');
    await load();
  }

  async function action(kind: 'receipts' | 'payments' | 'invoices', id: string, actionName: 'approve' | 'reject') {
    await post(`/api/finance/${kind}/${id}/${actionName}`, { actor: 'accounting' });
  }

  function exportUrl(kind: 'receipts' | 'payments' | 'invoices' | 'cashflow') {
    return `${API_URL}/api/finance/${kind}/export?${query}`;
  }

  const pendingReceipts = tab === 'pending' ? receipts.filter((row) => row.approvalStatus === 'PENDING') : receipts;

  return (
    <section className="workspace financePage">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">Tài chính / Kế toán</p>
          <h1>Thu chi, VAT va dong tien</h1>
        </div>
        <div className="pageHeaderActions">
          {message ? <span className="statusPill statusPillNeutral">{message}</span> : null}
          <button className="secondaryButton iconTextButton" onClick={load}><RefreshCcw size={16} /> Reload</button>
          <a className="secondaryButton iconTextButton" href={exportUrl(tab === 'payments' ? 'payments' : tab === 'invoices' ? 'invoices' : tab === 'cashflow' ? 'cashflow' : 'receipts')}><Download size={16} /> CSV</a>
        </div>
      </header>

      <section className="metrics financeMetrics">
        <Metric label="Chung tu thu" value={receiptSummary.count} />
        <Metric label="Tong tien thu" value={money(receiptSummary.totalAmount)} />
        <Metric label="Chung tu chi" value={paymentSummary.count} />
        <Metric label="Tong tien chi" value={money(paymentSummary.totalAmount)} />
        <Metric label="Hóa đơn VAT" value={invoiceSummary.count} />
        <Metric label="Dòng tiền rong" value={money(cashSummary.netCashflow)} />
      </section>
      <PermissionNotice allowed={canAny(['finance.receipt.view', 'finance.payment.view', 'finance.invoice.view', 'finance.cashflow.view'])} label="xem tài chính ke toan" />

      <section className="panel financeFilters">
        <label><Search size={15} /> Tìm kiếm<input value={filter.search} onChange={(event) => setFilter({ ...filter, search: event.target.value })} placeholder="Tên, SĐT, email, mã chứng từ, mã tour" /></label>
        <label>Trạng thái<select value={filter.status} onChange={(event) => setFilter({ ...filter, status: event.target.value })}><option value="">Tất cả</option>{statuses.map((status) => <option key={status}>{status}</option>)}</select></label>
        <label>Phuong thuc<select value={filter.paymentMethod} onChange={(event) => setFilter({ ...filter, paymentMethod: event.target.value })}><option value="">Tất cả</option>{methods.map((method) => <option key={method}>{method}</option>)}</select></label>
        <label>Từ ngày<input type="date" value={filter.from} onChange={(event) => setFilter({ ...filter, from: event.target.value })} /></label>
        <label>Đến ngày<input type="date" value={filter.to} onChange={(event) => setFilter({ ...filter, to: event.target.value })} /></label>
      </section>

      <div className="moduleTabs financeTabs">
        {[
          ['pending', 'Phiếu thu chờ', ReceiptText],
          ['receipts', 'Phiếu thu', ReceiptText],
          ['payments', 'Phiếu chi', HandCoins],
          ['invoices', 'Hóa đơn VAT', FileText],
          ['cashflow', 'Dòng tiền', WalletCards],
        ].map(([key, label, Icon]) => {
          const TabIcon = Icon as typeof ReceiptText;
          return <button key={key as string} className={tab === key ? 'active' : ''} onClick={() => setTab(key as string)}><TabIcon size={16} /> {label as string}</button>;
        })}
      </div>

      {tab === 'pending' || tab === 'receipts' ? <ReceiptsTab rows={pendingReceipts} onCreate={createReceipt} onAction={(id, type) => action('receipts', id, type)} can={can} /> : null}
      {tab === 'payments' ? <PaymentsTab rows={payments} onCreate={createPayment} onAction={(id, type) => action('payments', id, type)} can={can} /> : null}
      {tab === 'invoices' ? <InvoicesTab rows={invoices} onCreate={createInvoice} onAction={(id, type) => action('invoices', id, type)} can={can} /> : null}
      {tab === 'cashflow' ? <CashflowTab rows={cashflow} summary={cashSummary} /> : null}
    </section>
  );
}

function ReceiptsTab({ rows, onCreate, onAction, can }: { rows: Receipt[]; onCreate: (formData: FormData) => void; onAction: (id: string, action: 'approve' | 'reject') => void; can: (permission: string) => boolean }) {
  return (
    <section className="contentGrid financeGrid">
      <div className="panel financeFormPanel">
        <h2><Plus size={18} /> Tạo phieu thu</h2>
        <form action={onCreate} className="formGrid">
          <label>Tên phiếu thu<input name="receiptName" required placeholder="Thu tiền tour" /></label>
          <label>Loai phieu thu<select name="receiptType" defaultValue="TOUR_PAYMENT">{receiptTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
          <label>Phuong thuc<select name="paymentMethod" defaultValue="BANK_TRANSFER">{methods.map((method) => <option key={method}>{method}</option>)}</select></label>
          <label>Ngay thanh toán<input name="paymentDate" type="date" /></label>
          <label>Nguoi nop<input name="payerName" /></label>
          <label>SDT<input name="payerPhone" /></label>
          <label>Email<input name="payerEmail" type="email" /></label>
          <label>Ma tour<input name="tourCode" /></label>
          <label>Ten tour<input name="tourName" /></label>
          <label>Tong tien<input name="totalAmount" type="number" min={0} defaultValue={0} /></label>
          <label>Đã thu<input name="paidBefore" type="number" min={0} defaultValue={0} /></label>
          <label>So tien thu<input name="receiptAmount" type="number" min={0} defaultValue={0} /></label>
          <label>Chi nhanh<input name="branch" /></label>
          <label>Nhan vien<input name="assignedStaff" /></label>
          <label>Ly do<textarea name="reason" rows={3} /></label>
          <button type="submit" disabled={!can('finance.receipt.create')}>Tạo phieu thu</button>
        </form>
      </div>
      <FinanceTable title="Danh sach phieu thu" count={rows.length}>
        <thead><tr><th>Ma</th><th>Nguoi nop</th><th>Tour</th><th>Ngay</th><th>Loai</th><th>So tien</th><th>Con thu</th><th>Trạng thái</th><th></th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.id}><td><strong>{row.receiptCode}</strong><span>{row.receiptName}</span></td><td>{row.payerName || '-'}<span>{row.payerPhone || ''}</span></td><td>{row.orders?.[0]?.tourCode || '-'}<span>{row.orders?.[0]?.tourName || ''}</span></td><td>{date(row.paymentDate)}</td><td>{viStatus(row.receiptType)}</td><td>{money(Number(row.receiptAmount))}</td><td>{money(Number(row.remainingAmount))}</td><td><span className="statusPill">{viStatus(row.approvalStatus)}</span></td><td className="financeActions"><button className="secondaryButton iconButton" disabled={!can('finance.receipt.approve')} onClick={() => onAction(row.id, 'approve')}><CheckCircle2 size={16} /></button><button className="secondaryButton iconButton" disabled={!can('finance.receipt.approve')} onClick={() => onAction(row.id, 'reject')}><XCircle size={16} /></button></td></tr>)}</tbody>
      </FinanceTable>
    </section>
  );
}

function PaymentsTab({ rows, onCreate, onAction, can }: { rows: Payment[]; onCreate: (formData: FormData) => void; onAction: (id: string, action: 'approve' | 'reject') => void; can: (permission: string) => boolean }) {
  return (
    <section className="contentGrid financeGrid">
      <div className="panel financeFormPanel">
        <h2><Plus size={18} /> Tạo phieu chi</h2>
        <form action={onCreate} className="formGrid">
          <label>Tên phiếu chi<input name="voucherName" placeholder="Chi thanh toán NCC" /></label>
          <label>Loai phieu chi<select name="voucherType" defaultValue="SUPPLIER_PAYMENT">{paymentTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
          <label>Phuong thuc<select name="paymentMethod" defaultValue="BANK_TRANSFER">{methods.map((method) => <option key={method}>{method}</option>)}</select></label>
          <label>Ngay thanh toán<input name="paymentDate" type="date" /></label>
          <label>Nguoi nhan<input name="receiverName" /></label>
          <label>SDT<input name="receiverPhone" /></label>
          <label>Tong tien<input name="totalAmount" type="number" min={0} defaultValue={0} /></label>
          <label>So tien chi<input name="paymentAmount" type="number" min={0} defaultValue={0} /></label>
          <label>Ten TK<input name="bankAccountName" /></label>
          <label>So TK<input name="bankAccountNumber" /></label>
          <label>Ngân hàng<input name="bankName" /></label>
          <label>Chi nhanh<input name="branch" /></label>
          <label>Nhan vien<input name="assignedStaff" /></label>
          <label>Ly do<textarea name="reason" rows={3} /></label>
          <button type="submit" disabled={!can('finance.payment.create')}>Tạo phieu chi</button>
        </form>
      </div>
      <FinanceTable title="Danh sach phieu chi" count={rows.length}>
        <thead><tr><th>Ma</th><th>Nguoi nhan</th><th>Ngay</th><th>Loai</th><th>So tien</th><th>Còn chi</th><th>Trạng thái</th><th></th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.id}><td><strong>{row.voucherCode}</strong><span>{row.voucherName || ''}</span></td><td>{row.receiverName || '-'}<span>{row.receiverPhone || ''}</span></td><td>{date(row.paymentDate)}</td><td>{viStatus(row.voucherType)}</td><td>{money(Number(row.paymentAmount))}</td><td>{money(Number(row.remainingAmount))}</td><td><span className="statusPill">{viStatus(row.approvalStatus)}</span></td><td className="financeActions"><button className="secondaryButton iconButton" disabled={!can('finance.payment.approve')} onClick={() => onAction(row.id, 'approve')}><CheckCircle2 size={16} /></button><button className="secondaryButton iconButton" disabled={!can('finance.payment.approve')} onClick={() => onAction(row.id, 'reject')}><XCircle size={16} /></button></td></tr>)}</tbody>
      </FinanceTable>
    </section>
  );
}

function InvoicesTab({ rows, onCreate, onAction, can }: { rows: Invoice[]; onCreate: (formData: FormData) => void; onAction: (id: string, action: 'approve' | 'reject') => void; can: (permission: string) => boolean }) {
  return (
    <section className="contentGrid financeGrid">
      <div className="panel financeFormPanel">
        <h2><Plus size={18} /> Tạo hoa don VAT</h2>
        <form action={onCreate} className="formGrid">
          <label>Ten KH<input name="customerName" /></label>
          <label>SDT<input name="customerPhone" /></label>
          <label>Email<input name="customerEmail" type="email" /></label>
          <label>MST<input name="taxCode" /></label>
          <label>Ten don vi<input name="companyName" /></label>
          <label>Địa chỉ<input name="companyAddress" /></label>
          <label>Loai HD<select name="invoiceType" defaultValue="VAT"><option>VAT</option><option>NO_VAT</option><option>ADJUSTMENT</option><option>REPLACEMENT</option></select></label>
          <label>Ngay xuat<input name="issuedDate" type="date" /></label>
          <label>Ma tour<input name="tourCode" /></label>
          <label>Ten tour<input name="tourName" /></label>
          <label>Dich vu<input name="itemName" defaultValue="Dich vu du lich" /></label>
          <label>DVT<input name="unit" defaultValue="goi" /></label>
          <label>SL<input name="quantity" type="number" min={1} defaultValue={1} /></label>
          <label>Don gia<input name="unitPrice" type="number" min={0} defaultValue={0} /></label>
          <label>VAT %<select name="taxRate" defaultValue="10"><option>0</option><option>5</option><option>8</option><option>10</option></select></label>
          <label>Ghi chú<textarea name="note" rows={3} /></label>
          <button type="submit" disabled={!can('finance.invoice.create')}>Tạo hoa don</button>
        </form>
      </div>
      <FinanceTable title="Danh sach hoa don" count={rows.length}>
        <thead><tr><th>Ma</th><th>Khach hang</th><th>MST/Cong ty</th><th>Tour</th><th>Ngay xuat</th><th>Gia tri</th><th>VAT</th><th>Trạng thái</th><th></th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.id}><td><strong>{row.invoiceCode}</strong><span>{row.invoiceNumber || ''}</span></td><td>{row.customerName || '-'}<span>{row.customerPhone || ''}</span></td><td>{row.taxCode || '-'}<span>{row.companyName || ''}</span></td><td>{row.tourCode || '-'}<span>{row.tourName || ''}</span></td><td>{date(row.issuedDate)}</td><td>{money(Number(row.totalAfterTax))}</td><td>{money(Number(row.totalTax))}</td><td><span className="statusPill">{viStatus(row.approvalStatus)}</span></td><td className="financeActions"><button className="secondaryButton iconButton" disabled={!can('finance.invoice.approve')} onClick={() => onAction(row.id, 'approve')}><CheckCircle2 size={16} /></button><button className="secondaryButton iconButton" disabled={!can('finance.invoice.approve')} onClick={() => onAction(row.id, 'reject')}><XCircle size={16} /></button></td></tr>)}</tbody>
      </FinanceTable>
    </section>
  );
}

function CashflowTab({ rows, summary }: { rows: Cashflow[]; summary: { totalReceipt: number; totalPayment: number; netCashflow: number; byMethod: { method: string; receipt: number; payment: number }[] } }) {
  return (
    <section className="contentGrid financeCashGrid">
      <aside className="panel financeSide">
        <h2>Tong hop dong tien</h2>
        <div className="summaryRows">
          <div><span>Tổng thu</span><strong>{money(summary.totalReceipt)}</strong></div>
          <div><span>Tổng chi</span><strong>{money(summary.totalPayment)}</strong></div>
          <div><span>Net</span><strong>{money(summary.netCashflow)}</strong></div>
        </div>
        <h2>Theo phuong thuc</h2>
        <div className="summaryRows">{summary.byMethod.map((row) => <div key={row.method}><span>{row.method}</span><strong>{money(row.receipt - row.payment)}</strong></div>)}</div>
      </aside>
      <FinanceTable title="Dòng tiền da duyệt" count={rows.length}>
        <thead><tr><th>Nguon</th><th>Loai</th><th>Ngay</th><th>Phuong thuc</th><th>So tien</th><th>Chi nhanh</th><th>Nhan vien</th><th>Ghi chú</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.id}><td>{viStatus(row.sourceType)}</td><td><span className="statusPill">{viStatus(row.entryType)}</span></td><td>{date(row.paymentDate)}</td><td>{viStatus(row.paymentMethod)}</td><td>{money(Number(row.amount))}</td><td>{row.branch || '-'}</td><td>{row.staff || '-'}</td><td>{row.note || '-'}</td></tr>)}</tbody>
      </FinanceTable>
    </section>
  );
}

function FinanceTable({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return <section className="panel financeList"><div className="sectionHeader"><h2>{title}</h2><span>{count} dong</span></div><div className="fitTableWrap"><table className="financeTable">{children}</table></div></section>;
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <article className="metric"><span>{label}</span><strong>{value}</strong></article>;
}

function authHeaders() {
  const token = typeof window !== 'undefined' ? window.localStorage.getItem('smarttour.auth.token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

async function getJson(path: string) {
  const response = await fetch(`${API_URL}${path}`, { cache: 'no-store', headers: authHeaders() });
  if (!response.ok) return {};
  return response.json();
}

function money(value: number) {
  return new Intl.NumberFormat('vi-VN').format(value || 0);
}

function date(value?: string) {
  return value ? new Date(value).toLocaleDateString('vi-VN') : '-';
}

function text(value: FormDataEntryValue | null) {
  return typeof value === 'string' ? value : '';
}

function number(value: FormDataEntryValue | null) {
  return Number(text(value) || 0);
}

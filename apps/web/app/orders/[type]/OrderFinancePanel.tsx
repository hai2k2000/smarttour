'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { authFetch, authHeaders, authJsonHeaders } from '../../authFetch';
import { viStatus } from '../../i18n';
import { usePermissions } from '../../usePermissions';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
const paymentMethods = ['BANK_TRANSFER', 'CASH', 'CARD', 'QR', 'OFFSET', 'OTHER'];

export type OrderFinanceOrder = {
  id: string;
  systemCode: string;
  tourCode?: string | null;
  name: string;
  customerId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
  branch?: string | null;
  department?: string | null;
  totalRevenue: string | number;
  paidAmount: string | number;
  remainingRevenue: string | number;
  totalCost: string | number;
  paidCost: string | number;
  remainingCost: string | number;
  operationItems?: Array<{
    supplierId?: string | null;
    status?: string | null;
    supplier?: { id: string; name: string } | null;
  }>;
};

type ReceiptRow = {
  id: string;
  receiptCode: string;
  receiptName?: string | null;
  paymentDate?: string | null;
  receiptAmount: string | number;
  approvalStatus: string;
  payerName?: string | null;
};

type PaymentRow = {
  id: string;
  voucherCode: string;
  voucherName?: string | null;
  paymentDate?: string | null;
  paymentAmount: string | number;
  approvalStatus: string;
  receiverName?: string | null;
};

type ReceiptDraft = { name: string; amount: string; paymentMethod: string; paymentDate: string };
type PaymentDraft = ReceiptDraft & { supplierId: string };

const emptyReceiptDraft: ReceiptDraft = { name: '', amount: '', paymentMethod: 'BANK_TRANSFER', paymentDate: '' };
const emptyPaymentDraft: PaymentDraft = { ...emptyReceiptDraft, supplierId: '' };

function amount(value: string | number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: string | number) {
  return amount(value).toLocaleString('vi-VN');
}

function date(value?: string | null) {
  return value ? new Date(value).toLocaleDateString('vi-VN') : '-';
}

function statusClass(status: string) {
  return `statusPill status-${status.toLowerCase()}`;
}

async function responseMessage(response: Response) {
  const data = await response.json().catch(() => null) as { message?: string | string[] } | null;
  const message = Array.isArray(data?.message) ? data.message.join('; ') : data?.message;
  return message || response.statusText || `HTTP ${response.status}`;
}

export default function OrderFinancePanel({ order }: { order: OrderFinanceOrder }) {
  const { can, permissionsReady } = usePermissions();
  const canViewReceipts = can('finance.receipt.view');
  const canViewPayments = can('finance.payment.view');
  const canCreateReceipts = can('finance.receipt.create');
  const canCreatePayments = can('finance.payment.create');
  const [receipts, setReceipts] = useState<ReceiptRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [receiptError, setReceiptError] = useState('');
  const [paymentError, setPaymentError] = useState('');
  const [receiptNotice, setReceiptNotice] = useState('');
  const [paymentNotice, setPaymentNotice] = useState('');
  const [receiptDraftOpen, setReceiptDraftOpen] = useState(false);
  const [paymentDraftOpen, setPaymentDraftOpen] = useState(false);
  const [receiptDraft, setReceiptDraft] = useState<ReceiptDraft>(emptyReceiptDraft);
  const [paymentDraft, setPaymentDraft] = useState<PaymentDraft>(emptyPaymentDraft);
  const [receiptDraftError, setReceiptDraftError] = useState('');
  const [paymentDraftError, setPaymentDraftError] = useState('');
  const [receiptSaving, setReceiptSaving] = useState(false);
  const [paymentSaving, setPaymentSaving] = useState(false);

  const suppliers = useMemo(() => {
    const unique = new Map<string, string>();
    for (const item of order.operationItems || []) {
      if (item.supplierId && item.supplier && item.status !== 'CANCELLED') {
        unique.set(item.supplierId, item.supplier.name);
      }
    }
    return Array.from(unique, ([id, name]) => ({ id, name }));
  }, [order.operationItems]);

  useEffect(() => {
    if (!permissionsReady) return;
    if (canViewReceipts) void loadReceipts();
    else {
      setReceipts([]);
      setReceiptError('');
    }
    if (canViewPayments) void loadPayments();
    else {
      setPayments([]);
      setPaymentError('');
    }
  }, [order.id, permissionsReady, canViewReceipts, canViewPayments]);

  async function loadReceipts() {
    setReceiptLoading(true);
    setReceiptError('');
    const params = new URLSearchParams({ orderId: order.id, take: '50' });
    try {
      const response = await authFetch(`${API_URL}/api/finance/receipts?${params.toString()}`, { cache: 'no-store', headers: authHeaders() });
      if (!response.ok) throw new Error(await responseMessage(response));
      const data = await response.json() as { rows?: ReceiptRow[] };
      setReceipts(Array.isArray(data.rows) ? data.rows : []);
    } catch (error) {
      setReceiptError(error instanceof Error ? error.message : 'Không tải được phiếu thu.');
    } finally {
      setReceiptLoading(false);
    }
  }

  async function loadPayments() {
    setPaymentLoading(true);
    setPaymentError('');
    const params = new URLSearchParams({ orderId: order.id, take: '50' });
    try {
      const response = await authFetch(`${API_URL}/api/finance/payments?${params.toString()}`, { cache: 'no-store', headers: authHeaders() });
      if (!response.ok) throw new Error(await responseMessage(response));
      const data = await response.json() as { rows?: PaymentRow[] };
      setPayments(Array.isArray(data.rows) ? data.rows : []);
    } catch (error) {
      setPaymentError(error instanceof Error ? error.message : 'Không tải được phiếu chi.');
    } finally {
      setPaymentLoading(false);
    }
  }

  function openReceiptDraft() {
    setReceiptDraft({ ...emptyReceiptDraft, amount: amount(order.remainingRevenue) > 0 ? String(amount(order.remainingRevenue)) : '' });
    setReceiptDraftError('');
    setReceiptNotice('');
    setReceiptDraftOpen(true);
  }

  function openPaymentDraft() {
    setPaymentDraft({ ...emptyPaymentDraft, amount: amount(order.remainingCost) > 0 ? String(amount(order.remainingCost)) : '', supplierId: suppliers[0]?.id || '' });
    setPaymentDraftError('');
    setPaymentNotice('');
    setPaymentDraftOpen(true);
  }

  async function createReceipt() {
    setReceiptDraftError('');
    const draftAmount = Number(receiptDraft.amount);
    if (!Number.isFinite(draftAmount) || draftAmount <= 0) {
      setReceiptDraftError('Số tiền thu phải lớn hơn 0.');
      return;
    }
    if (draftAmount > amount(order.remainingRevenue)) {
      setReceiptDraftError('Số tiền thu không được lớn hơn số còn thu của đơn hàng.');
      return;
    }
    const payload = {
      receiptName: receiptDraft.name || `Thu ${order.systemCode}`,
      receiptType: 'TOUR_PAYMENT',
      paymentMethod: receiptDraft.paymentMethod,
      paymentDate: receiptDraft.paymentDate || undefined,
      customerId: order.customerId || undefined,
      payerName: order.customerName || undefined,
      payerPhone: order.customerPhone || undefined,
      payerEmail: order.customerEmail || undefined,
      totalAmount: Number(order.totalRevenue),
      paidBefore: Number(order.paidAmount),
      receiptAmount: draftAmount,
      branch: order.branch || undefined,
      department: order.department || undefined,
      orders: [{ orderId: order.id, orderCode: order.systemCode, tourCode: order.tourCode, tourName: order.name, amount: draftAmount }],
    };
    setReceiptSaving(true);
    try {
      const response = await authFetch(`${API_URL}/api/finance/receipts`, { method: 'POST', headers: authJsonHeaders(), body: JSON.stringify(payload) });
      if (!response.ok) throw new Error(await responseMessage(response));
      setReceiptDraftOpen(false);
      setReceiptDraft(emptyReceiptDraft);
      setReceiptNotice('Đã tạo phiếu thu nháp trong Finance.');
      await loadReceipts();
    } catch (error) {
      setReceiptDraftError(error instanceof Error ? error.message : 'Không tạo được phiếu thu nháp.');
    } finally {
      setReceiptSaving(false);
    }
  }

  async function createPayment() {
    setPaymentDraftError('');
    const supplier = suppliers.find((item) => item.id === paymentDraft.supplierId);
    const draftAmount = Number(paymentDraft.amount);
    if (!supplier) {
      setPaymentDraftError('Chọn nhà cung cấp thuộc dịch vụ điều hành của đơn hàng.');
      return;
    }
    if (!Number.isFinite(draftAmount) || draftAmount <= 0) {
      setPaymentDraftError('Số tiền chi phải lớn hơn 0.');
      return;
    }
    const payload = {
      voucherName: paymentDraft.name || `Chi ${order.systemCode}`,
      voucherType: 'SUPPLIER_PAYMENT',
      paymentMethod: paymentDraft.paymentMethod,
      paymentDate: paymentDraft.paymentDate || undefined,
      supplierId: paymentDraft.supplierId,
      orderId: order.id,
      tourCode: order.tourCode || undefined,
      receiverName: supplier.name,
      totalAmount: draftAmount,
      paymentAmount: draftAmount,
      branch: order.branch || undefined,
      department: order.department || undefined,
    };
    setPaymentSaving(true);
    try {
      const response = await authFetch(`${API_URL}/api/finance/payments`, { method: 'POST', headers: authJsonHeaders(), body: JSON.stringify(payload) });
      if (!response.ok) throw new Error(await responseMessage(response));
      setPaymentDraftOpen(false);
      setPaymentDraft(emptyPaymentDraft);
      setPaymentNotice('Đã tạo phiếu chi nháp trong Finance.');
      await loadPayments();
    } catch (error) {
      setPaymentDraftError(error instanceof Error ? error.message : 'Không tạo được phiếu chi nháp.');
    } finally {
      setPaymentSaving(false);
    }
  }

  if (!permissionsReady || (!canViewReceipts && !canViewPayments)) return null;

  return (
    <section className="orderFinancePanel">
      <div className="orderFinanceHeader">
        <div><h2>Tài chính đơn hàng</h2><span>Chỉ tạo chứng từ nháp; duyệt và xử lý sau duyệt thực hiện trong Finance.</span></div>
      </div>
      <div className="orderFinanceMetrics">
        <FinanceMetric label="Tổng thu" value={order.totalRevenue} />
        <FinanceMetric label="Đã thu" value={order.paidAmount} />
        <FinanceMetric label="Còn thu" value={order.remainingRevenue} />
        <FinanceMetric label="Tổng chi" value={order.totalCost} />
        <FinanceMetric label="Đã chi" value={order.paidCost} />
        <FinanceMetric label="Còn chi" value={order.remainingCost} />
      </div>
      <div className="orderFinanceHistoryGrid">
        {canViewReceipts ? (
          <article className="orderFinanceHistoryCard">
            <div className="orderFinanceHistoryHeader">
              <div><h3>Phiếu thu</h3><span>{receipts.length} chứng từ gần nhất</span></div>
              <div className="orderFinanceHistoryActions">
                {canCreateReceipts ? <button type="button" onClick={openReceiptDraft} disabled={amount(order.remainingRevenue) <= 0}>Tạo phiếu thu nháp</button> : null}
                <Link className="secondaryButton orderFinanceLink" href={`/finance?tab=receipts&orderId=${encodeURIComponent(order.id)}`}>Mở phiếu thu trong Finance</Link>
              </div>
            </div>
            {receiptError ? <p className="orderFinanceError" role="alert">{receiptError}</p> : null}
            {receiptNotice ? <p className="orderFinanceNotice" role="status">{receiptNotice}</p> : null}
            {receiptLoading ? <div className="orderFinanceHistoryState">Đang tải phiếu thu...</div> : receipts.length ? (
              <div className="orderFinanceTableWrap"><table className="orderFinanceTable"><thead><tr><th>Mã phiếu</th><th>Ngày</th><th>Nội dung</th><th>Số tiền</th><th>Trạng thái</th></tr></thead><tbody>{receipts.map((row) => <tr key={row.id}><td><strong>{row.receiptCode}</strong></td><td>{date(row.paymentDate)}</td><td>{row.receiptName || row.payerName || '-'}</td><td>{money(row.receiptAmount)}</td><td><span className={statusClass(row.approvalStatus)}>{viStatus(row.approvalStatus)}</span></td></tr>)}</tbody></table></div>
            ) : <div className="orderFinanceHistoryState">Chưa có phiếu thu cho đơn hàng.</div>}
          </article>
        ) : null}
        {canViewPayments ? (
          <article className="orderFinanceHistoryCard">
            <div className="orderFinanceHistoryHeader">
              <div><h3>Phiếu chi</h3><span>{payments.length} chứng từ gần nhất</span></div>
              <div className="orderFinanceHistoryActions">
                {canCreatePayments ? <button type="button" onClick={openPaymentDraft} disabled={!suppliers.length}>Tạo phiếu chi nháp</button> : null}
                <Link className="secondaryButton orderFinanceLink" href={`/finance?tab=payments&orderId=${encodeURIComponent(order.id)}`}>Mở phiếu chi trong Finance</Link>
              </div>
            </div>
            {!suppliers.length && canCreatePayments ? <p className="orderFinanceHint">Thêm nhà cung cấp vào dịch vụ điều hành trước khi tạo phiếu chi.</p> : null}
            {paymentError ? <p className="orderFinanceError" role="alert">{paymentError}</p> : null}
            {paymentNotice ? <p className="orderFinanceNotice" role="status">{paymentNotice}</p> : null}
            {paymentLoading ? <div className="orderFinanceHistoryState">Đang tải phiếu chi...</div> : payments.length ? (
              <div className="orderFinanceTableWrap"><table className="orderFinanceTable"><thead><tr><th>Mã phiếu</th><th>Ngày</th><th>Nội dung</th><th>Số tiền</th><th>Trạng thái</th></tr></thead><tbody>{payments.map((row) => <tr key={row.id}><td><strong>{row.voucherCode}</strong></td><td>{date(row.paymentDate)}</td><td>{row.voucherName || row.receiverName || '-'}</td><td>{money(row.paymentAmount)}</td><td><span className={statusClass(row.approvalStatus)}>{viStatus(row.approvalStatus)}</span></td></tr>)}</tbody></table></div>
            ) : <div className="orderFinanceHistoryState">Chưa có phiếu chi cho đơn hàng.</div>}
          </article>
        ) : null}
      </div>

      {receiptDraftOpen ? (
        <div className="modalOverlay orderFinanceDraftOverlay" role="dialog" aria-modal="true" aria-label="Tạo phiếu thu nháp">
          <div className="modalPanel orderFinanceDraftModal">
            <header><div><h2>Tạo phiếu thu nháp</h2><span>Đơn {order.systemCode}</span></div><button type="button" className="secondaryButton" onClick={() => setReceiptDraftOpen(false)}>Đóng</button></header>
            <div className="orderFinanceDraftGrid">
              <label>Tên phiếu<input value={receiptDraft.name} onChange={(event) => setReceiptDraft((draft) => ({ ...draft, name: event.target.value }))} placeholder={`Thu ${order.systemCode}`} /></label>
              <label>Số tiền<input type="number" min="0.01" step="0.01" value={receiptDraft.amount} onChange={(event) => setReceiptDraft((draft) => ({ ...draft, amount: event.target.value }))} /></label>
              <label>Phương thức<select value={receiptDraft.paymentMethod} onChange={(event) => setReceiptDraft((draft) => ({ ...draft, paymentMethod: event.target.value }))}>{paymentMethods.map((method) => <option key={method} value={method}>{viStatus(method)}</option>)}</select></label>
              <label>Ngày thu<input type="date" value={receiptDraft.paymentDate} onChange={(event) => setReceiptDraft((draft) => ({ ...draft, paymentDate: event.target.value }))} /></label>
            </div>
            {receiptDraftError ? <p className="orderFinanceError" role="alert">{receiptDraftError}</p> : null}
            <div className="modalActions"><button type="button" className="secondaryButton" onClick={() => setReceiptDraftOpen(false)}>Bỏ qua</button><button type="button" disabled={receiptSaving} onClick={createReceipt}>{receiptSaving ? 'Đang tạo...' : 'Tạo phiếu thu nháp'}</button></div>
          </div>
        </div>
      ) : null}

      {paymentDraftOpen ? (
        <div className="modalOverlay orderFinanceDraftOverlay" role="dialog" aria-modal="true" aria-label="Tạo phiếu chi nháp">
          <div className="modalPanel orderFinanceDraftModal">
            <header><div><h2>Tạo phiếu chi nháp</h2><span>Đơn {order.systemCode}</span></div><button type="button" className="secondaryButton" onClick={() => setPaymentDraftOpen(false)}>Đóng</button></header>
            <div className="orderFinanceDraftGrid">
              <label>Tên phiếu<input value={paymentDraft.name} onChange={(event) => setPaymentDraft((draft) => ({ ...draft, name: event.target.value }))} placeholder={`Chi ${order.systemCode}`} /></label>
              <label>Nhà cung cấp<select value={paymentDraft.supplierId} onChange={(event) => setPaymentDraft((draft) => ({ ...draft, supplierId: event.target.value }))}><option value="">Chọn nhà cung cấp</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
              <label>Số tiền<input type="number" min="0.01" step="0.01" value={paymentDraft.amount} onChange={(event) => setPaymentDraft((draft) => ({ ...draft, amount: event.target.value }))} /></label>
              <label>Phương thức<select value={paymentDraft.paymentMethod} onChange={(event) => setPaymentDraft((draft) => ({ ...draft, paymentMethod: event.target.value }))}>{paymentMethods.map((method) => <option key={method} value={method}>{viStatus(method)}</option>)}</select></label>
              <label>Ngày chi<input type="date" value={paymentDraft.paymentDate} onChange={(event) => setPaymentDraft((draft) => ({ ...draft, paymentDate: event.target.value }))} /></label>
            </div>
            {paymentDraftError ? <p className="orderFinanceError" role="alert">{paymentDraftError}</p> : null}
            <div className="modalActions"><button type="button" className="secondaryButton" onClick={() => setPaymentDraftOpen(false)}>Bỏ qua</button><button type="button" disabled={paymentSaving} onClick={createPayment}>{paymentSaving ? 'Đang tạo...' : 'Tạo phiếu chi nháp'}</button></div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function FinanceMetric({ label, value }: { label: string; value: string | number }) {
  return <div className="orderFinanceMetric"><span>{label}</span><strong>{money(value)}</strong></div>;
}

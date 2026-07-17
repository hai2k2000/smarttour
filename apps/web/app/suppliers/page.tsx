import { AlertTriangle, Building2, CheckCircle2, FolderPlus, Pencil, Plus, Save, Trash2, Users, X } from 'lucide-react';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { serverAuthHeaders, serverAuthJsonHeaders } from '../serverAuth';
import { serverApiBase } from '../serverApiBase';
import { ServerPermissionNotice, hasPermission, type PermissionUser } from '../serverPermissions';

export const dynamic = 'force-dynamic';

type SupplierCategory = {
  id: string;
  name: string;
  _count?: { suppliers: number };
};

type Supplier = {
  id: string;
  categoryId?: string | null;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  pricePolicy: string | null;
  debtNote: string | null;
  notes: string | null;
  status?: string | null;
  category: { id: string; name: string } | null;
  updatedAt: string;
};

type SupplierFinanceSummary = {
  supplierId: string;
  summary: { payable: number; paid: number; balance: number; ledgerCount: number };
  payments: { count: number; totalAmount: number; paymentAmount: number; remainingAmount: number };
  vouchers: { count: number; totalAmount: number; paidAmount: number; remainingAmount: number };
  paymentRequests: { count: number; amount: number };
  links: {
    financeDebt: string;
    financePayments: string;
    operationVouchers: string;
    supplierPaymentRequests: string;
  };
};

type ApiResult<T> = { data: T; error?: string };
type MutationResult = { ok: boolean; message: string };
type SuppliersPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const apiBase = serverApiBase();
const createCategoryModalId = 'suppliers-create-category';
const editCategoryModalId = (id: string) => `suppliers-edit-category-${id}`;
const createSupplierModalId = 'suppliers-create-supplier';
const editSupplierModalId = (id: string) => `suppliers-edit-${id}`;
const deleteSupplierModalId = (id: string) => `suppliers-delete-${id}`;
const lifecycleSupplierModalId = (id: string) => `suppliers-lifecycle-${id}`;
const supplierCategoryLabels: Record<string, string> = {
  'attraction ticket': 'Vé tham quan',
  'attraction tickets': 'Vé tham quan',
  bus: 'Nhà xe tuyến cố định',
  flight: 'Vé máy bay',
  'flight ticket': 'Vé máy bay',
  'flight tickets': 'Vé máy bay',
  guide: 'Hướng dẫn viên',
  guides: 'Hướng dẫn viên',
  hotel: 'Khách sạn',
  'demo hotel': 'Khách sạn demo',
  landtour: 'LandTour',
  'land tour': 'LandTour',
  other: 'Chi phí khác',
  passport: 'Visa / hộ chiếu',
  restaurant: 'Nhà hàng',
  restaurants: 'Nhà hàng',
  transport: 'Vận chuyển',
  villa: 'Biệt thự',
  villas: 'Biệt thự',
  voucher: 'Voucher',
  vouchers: 'Voucher',
  water: 'Nước suối',
};
const supplierStatusLabels: Record<string, string> = {
  ACTIVE: 'Đang hoạt động',
  INACTIVE: 'Ngừng hoạt động',
};
const supplierLifecycleGuidanceLinks = ['Đơn hàng', 'Điều hành', 'Tài chính', 'Yêu cầu thanh toán'];

function supplierCategoryLabel(value?: string | null) {
  const raw = String(value || '').trim();
  if (!raw) return 'Chưa phân loại';
  const key = raw.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  return supplierCategoryLabels[key] || raw;
}

function supplierStatusLabel(status?: string | null) {
  return supplierStatusLabels[status || ''] || status || 'Chưa rõ';
}

function nextSupplierLifecycleStatus(status?: string | null) {
  return status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
}

function supplierLifecycleAction(name: string, status?: string | null, noun = 'nhà cung cấp') {
  const nextStatus = nextSupplierLifecycleStatus(status);
  const isReactivation = nextStatus === 'ACTIVE';
  const label = isReactivation ? 'Kích hoạt lại' : 'Ngừng hoạt động';
  const capitalizedNoun = noun.charAt(0).toUpperCase() + noun.slice(1);
  return {
    nextStatus,
    label,
    title: `${label} ${noun}`,
    confirmText: isReactivation
      ? `${capitalizedNoun} "${name}" sẽ được mở lại để chọn trong vận hành mới.`
      : `${capitalizedNoun} "${name}" sẽ không còn được dùng cho lựa chọn mới; giao dịch lịch sử vẫn được giữ và hệ thống sẽ chặn nếu còn tham chiếu vận hành.`,
    successText: isReactivation ? `Đã kích hoạt lại ${name}.` : `Đã ngừng hoạt động ${name}.`,
  };
}

function supplierLifecycleBlockedText(message: string) {
  const detail = message.trim() || 'Không thực hiện được thao tác lifecycle nhà cung cấp.';
  return `${detail} Có thể mở các module liên quan (${supplierLifecycleGuidanceLinks.join(', ')}) để gỡ tham chiếu trước khi thử lại.`;
}

async function responseError(response: Response) {
  try {
    const body = await response.clone().json();
    const message = body?.message;
    return Array.isArray(message) ? message.join(', ') : message || body?.error || response.statusText || `HTTP ${response.status}`;
  } catch {
    const text = await response.text().catch(() => '');
    return text || response.statusText || `HTTP ${response.status}`;
  }
}

async function apiGet<T>(path: string, fallback: T, label: string): Promise<ApiResult<T>> {
  try {
    const response = await fetch(`${apiBase}/api${path}`, { cache: 'no-store', headers: await serverAuthHeaders() });
    if (!response.ok) {
      const error = `${label}: HTTP ${response.status} - ${await responseError(response)}`;
      console.error(`[SuppliersPage] ${error}`);
      return { data: fallback, error };
    }
    return { data: await response.json() };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Không rõ lỗi';
    const detail = `${label}: ${message}`;
    console.error(`[SuppliersPage] ${detail}`);
    return { data: fallback, error: detail };
  }
}

async function apiMutation(path: string, init: RequestInit, successMessage: string, failureLabel: string): Promise<MutationResult> {
  try {
    const response = await fetch(`${apiBase}/api${path}`, { cache: 'no-store', ...init });
    if (!response.ok) {
      return { ok: false, message: `${failureLabel}: HTTP ${response.status} - ${await responseError(response)}` };
    }
    revalidatePath('/suppliers');
    return { ok: true, message: successMessage };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Không rõ lỗi';
    return { ok: false, message: `${failureLabel}: ${message}` };
  }
}

function redirectWithResult(result: MutationResult): never {
  const key = result.ok ? 'notice' : 'error';
  redirect(`/suppliers?${key}=${encodeURIComponent(result.message)}`);
}

function field(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function optionalField(formData: FormData, key: string) {
  return field(formData, key) || null;
}

function supplierPayload(formData: FormData) {
  return {
    categoryId: field(formData, 'categoryId'),
    name: field(formData, 'name'),
    contactPerson: optionalField(formData, 'contactPerson'),
    phone: optionalField(formData, 'phone'),
    email: optionalField(formData, 'email'),
    address: optionalField(formData, 'address'),
    pricePolicy: formData.has('pricePolicy') ? optionalField(formData, 'pricePolicy') : undefined,
    debtNote: formData.has('debtNote') ? optionalField(formData, 'debtNote') : undefined,
    notes: optionalField(formData, 'notes'),
  };
}

async function createCategory(formData: FormData) {
  'use server';
  const result = await apiMutation(
    '/supplier-categories',
    {
      method: 'POST',
      headers: await serverAuthJsonHeaders(),
      body: JSON.stringify({ name: field(formData, 'name') }),
    },
    'Đã tạo loại nhà cung cấp.',
    'Tạo loại nhà cung cấp thất bại',
  );
  redirectWithResult(result);
}

async function updateCategory(formData: FormData) {
  'use server';
  const id = field(formData, 'id');
  if (!id) redirectWithResult({ ok: false, message: 'Cập nhật loại nhà cung cấp thất bại: thiếu ID loại nhà cung cấp.' });
  const result = await apiMutation(
    `/supplier-categories/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: await serverAuthJsonHeaders(),
      body: JSON.stringify({ name: field(formData, 'name') }),
    },
    'Đã cập nhật loại nhà cung cấp.',
    'Cập nhật loại nhà cung cấp thất bại',
  );
  redirectWithResult(result);
}

async function createSupplier(formData: FormData) {
  'use server';
  const result = await apiMutation(
    '/suppliers',
    {
      method: 'POST',
      headers: await serverAuthJsonHeaders(),
      body: JSON.stringify(supplierPayload(formData)),
    },
    'Đã tạo nhà cung cấp.',
    'Tạo nhà cung cấp thất bại',
  );
  redirectWithResult(result);
}

async function updateSupplier(formData: FormData) {
  'use server';
  const id = field(formData, 'id');
  if (!id) redirectWithResult({ ok: false, message: 'Cập nhật nhà cung cấp thất bại: thiếu ID nhà cung cấp.' });
  const result = await apiMutation(
    `/suppliers/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: await serverAuthJsonHeaders(),
      body: JSON.stringify(supplierPayload(formData)),
    },
    'Đã cập nhật nhà cung cấp.',
    'Cập nhật nhà cung cấp thất bại',
  );
  redirectWithResult(result);
}

async function updateSupplierStatus(formData: FormData) {
  'use server';
  const id = field(formData, 'id');
  const name = field(formData, 'name') || 'nhà cung cấp';
  const currentStatus = field(formData, 'currentStatus');
  const status = field(formData, 'status');
  if (!id) redirectWithResult({ ok: false, message: 'Đổi trạng thái nhà cung cấp thất bại: thiếu ID nhà cung cấp.' });
  if (!['ACTIVE', 'INACTIVE'].includes(status)) redirectWithResult({ ok: false, message: 'Đổi trạng thái nhà cung cấp thất bại: trạng thái không hợp lệ.' });
  const action = supplierLifecycleAction(name, currentStatus);
  if (status !== action.nextStatus) redirectWithResult({ ok: false, message: 'Đổi trạng thái nhà cung cấp thất bại: dữ liệu trạng thái đã thay đổi, vui lòng tải lại danh sách.' });
  const result = await apiMutation(
    `/suppliers/${encodeURIComponent(id)}/status`,
    {
      method: 'PATCH',
      headers: await serverAuthJsonHeaders(),
      body: JSON.stringify({ status }),
    },
    action.successText,
    `${action.title} thất bại`,
  );
  redirectWithResult(result.ok ? result : { ...result, message: supplierLifecycleBlockedText(result.message) });
}

async function deleteSupplier(formData: FormData) {
  'use server';
  const id = field(formData, 'id');
  const name = field(formData, 'name') || 'nhà cung cấp';
  if (!id) redirectWithResult({ ok: false, message: 'Xóa nhà cung cấp thất bại: thiếu ID nhà cung cấp.' });
  const result = await apiMutation(
    `/suppliers/${encodeURIComponent(id)}`,
    { method: 'DELETE', headers: await serverAuthHeaders() },
    `Đã xóa ${name}.`,
    `Xóa ${name} thất bại`,
  );
  redirectWithResult(result.ok ? result : { ...result, message: supplierLifecycleBlockedText(result.message) });
}

function singleParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function display(value: string | null | undefined) {
  return value?.trim() || '—';
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function formatMoney(value: number | null | undefined) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(Number(value || 0));
}

function SupplierFinanceSummaryBlock({ summary }: { summary?: SupplierFinanceSummary }) {
  if (!summary) return <span className="supplierDebtNote mutedText">Chưa có phát sinh tài chính.</span>;
  return (
    <div className="supplierFinanceSummary">
      <span><strong>Phải trả:</strong> {formatMoney(summary.summary.payable)}</span>
      <span><strong>Đã trả:</strong> {formatMoney(summary.summary.paid)}</span>
      <span><strong>Còn phải trả:</strong> {formatMoney(summary.summary.balance)}</span>
      <span><strong>Phiếu điều hành:</strong> {summary.vouchers.count} / {formatMoney(summary.vouchers.remainingAmount)}</span>
      <span><strong>Đề nghị thanh toán:</strong> {summary.paymentRequests.count} / {formatMoney(summary.paymentRequests.amount)}</span>
      <div className="supplierFinanceLinks">
        <a href={summary.links.financeDebt}>Công nợ</a>
        <a href={summary.links.financePayments}>Phiếu chi</a>
        <a href={summary.links.operationVouchers}>Phiếu điều hành</a>
        <a href={summary.links.supplierPaymentRequests}>Đề nghị thanh toán</a>
      </div>
    </div>
  );
}

export default async function SuppliersPage({ searchParams }: SuppliersPageProps) {
  const params = searchParams ? await searchParams : {};
  const notice = singleParam(params.notice);
  const error = singleParam(params.error);
  const currentUserResult = await apiGet<PermissionUser | null>('/auth/me', null, 'T\u1ea3i quy\u1ec1n phi\u00ean \u0111\u0103ng nh\u1eadp');
  const currentUser = currentUserResult.data;
  const canViewSuppliers = hasPermission(currentUser, 'supplier.view');
  const canManageSuppliers = hasPermission(currentUser, 'supplier.manage');
  const canViewSupplierFinancialFields = hasPermission(currentUser, 'finance.payment.view');
  const [categoriesResult, allCategoriesResult, suppliersResult] = canViewSuppliers ? await Promise.all([
    apiGet<SupplierCategory[]>('/supplier-categories?includeEmpty=false', [], 'T\u1ea3i danh s\u00e1ch lo\u1ea1i nh\u00e0 cung c\u1ea5p \u0111ang d\u00f9ng'),
    apiGet<SupplierCategory[]>('/supplier-categories', [], 'T\u1ea3i danh s\u00e1ch \u0111\u1ea7y \u0111\u1ee7 lo\u1ea1i nh\u00e0 cung c\u1ea5p'),
    apiGet<Supplier[]>('/suppliers?take=100', [], 'T\u1ea3i danh s\u00e1ch nh\u00e0 cung c\u1ea5p'),
  ]) : [
    { data: [] as SupplierCategory[] },
    { data: [] as SupplierCategory[] },
    { data: [] as Supplier[] },
  ];
  const categories = categoriesResult.data;
  const allCategories = allCategoriesResult.data;
  const suppliers = suppliersResult.data;
  const supplierFinanceSummariesResult = canViewSuppliers && canViewSupplierFinancialFields && suppliers.length
    ? await apiGet<SupplierFinanceSummary[]>(`/suppliers/finance-summaries?ids=${suppliers.map((supplier) => supplier.id).join(',')}`, [], 'Tải tổng hợp tài chính nhà cung cấp')
    : { data: [] as SupplierFinanceSummary[] };
  const supplierFinanceSummaryById = new Map(supplierFinanceSummariesResult.data.map((summary) => [summary.supplierId, summary]));
  const loadErrors = [currentUserResult.error, categoriesResult.error, allCategoriesResult.error, suppliersResult.error, supplierFinanceSummariesResult.error].filter(Boolean);

  return (
    <section className="workspace suppliersPage">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">Dữ liệu nền vận hành</p>
          <h1>Quản lý nhà cung cấp</h1>
        </div>
        <div className="pageHeaderActions">
          <span className="statusPill"><Users size={14} /> Nhân sự vận hành</span>
          <span className="statusPill statusPillNeutral">Dữ liệu nền</span>
        </div>
      </header>

      {notice ? <div className="supplierNotice"><CheckCircle2 size={16} /> {notice}</div> : null}
      {error ? <div className="supplierNotice supplierNoticeError"><AlertTriangle size={16} /> {error}</div> : null}
      {loadErrors.length ? (
        <div className="supplierNotice supplierNoticeError">
          <AlertTriangle size={16} /> {loadErrors.join(' ')}
        </div>
      ) : null}

      <ServerPermissionNotice allowed={canViewSuppliers} label={'xem nh\u00e0 cung c\u1ea5p'} missingPermissions={['supplier.view']} />
      {canViewSuppliers ? (
      <>
      <section className="contentGrid suppliersGrid">
        <div className="panel supplierCategoryPanel">
          <div className="sectionHeader">
            <h2><FolderPlus size={18} /> Loại nhà cung cấp</h2>
            {canManageSuppliers ? <a className="iconTextButton secondaryButton" href={`#${createCategoryModalId}`}><Plus size={14} /> Thêm loại nhà cung cấp</a> : null}
          </div>
          <div className="supplierCategoryList">
            {categories.map((category) => (
              <div className="supplierCategoryCard" key={category.id}>
                <div>
                  <strong>{supplierCategoryLabel(category.name)}</strong>
                  <span>{category._count?.suppliers ?? 0} nhà cung cấp đang gắn</span>
                </div>
                {canManageSuppliers ? <a className="secondaryButton iconOnlyButton" href={`#${editCategoryModalId(category.id)}`} title={`Sửa loại ${supplierCategoryLabel(category.name)}`} aria-label={`Sửa loại ${supplierCategoryLabel(category.name)}`}><Pencil size={14} /></a> : null}
              </div>
            ))}
            {categories.length === 0 ? <div className="tableEmptyState">Chưa có loại nhà cung cấp.</div> : null}
          </div>
        </div>

        <div className="supplierListColumn">
          <div className="panel supplierIntroPanel">
            <div>
              <h2><Building2 size={18} /> Danh sách nhà cung cấp</h2>
              <p className="mutedText">Quản lý thông tin liên hệ, chính sách giá và ghi chú công nợ của từng nhà cung cấp.</p>
            </div>
            {canManageSuppliers ? <a className="iconTextButton" href={`#${createSupplierModalId}`}><Plus size={14} /> Thêm nhà cung cấp</a> : null}
          </div>

          <section className="panel listPanel supplierListPanel">
            <div className="sectionHeader">
              <h2>Danh sách nhà cung cấp</h2>
              <span>{suppliers.length} nhà cung cấp</span>
            </div>
            <div className="supplierTableWrap compactListTableWrap">
              <table className="supplierTable compactListTable">
                <thead>
                  <tr>
                    <th>Nhà cung cấp</th>
                    <th>Loại nhà cung cấp</th>
                    <th>Liên hệ</th>
                    <th>Điện thoại</th>
                    <th>Email</th>
                    <th>Địa chỉ</th>
                    <th>Công nợ / ghi chú</th>
                    <th>Trạng thái</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {suppliers.map((supplier) => (
                    <tr key={supplier.id}>
                      <td>
                        <strong>{supplier.name}</strong>
                        <span className="supplierMeta">Cập nhật: {formatDate(supplier.updatedAt)}</span>
                      </td>
                      <td>{supplierCategoryLabel(supplier.category?.name)}</td>
                      <td>{display(supplier.contactPerson)}</td>
                      <td>{display(supplier.phone)}</td>
                      <td>{display(supplier.email)}</td>
                      <td>{display(supplier.address)}</td>
                      <td>
                        <div className="supplierDebtBlock">
                          {canViewSupplierFinancialFields ? (
                            <>
                              <SupplierFinanceSummaryBlock summary={supplierFinanceSummaryById.get(supplier.id)} />
                              {supplier.debtNote ? <span><strong>Ghi chú công nợ:</strong> {supplier.debtNote}</span> : null}
                              {supplier.pricePolicy ? <span><strong>Chính sách giá:</strong> {supplier.pricePolicy}</span> : null}
                            </>
                          ) : null}
                          {supplier.notes ? <span><strong>Ghi chú:</strong> {supplier.notes}</span> : null}
                          {canViewSupplierFinancialFields && !supplier.debtNote && !supplier.pricePolicy && !supplier.notes ? <span className="supplierDebtNote mutedText">Chưa có ghi chú công nợ.</span> : null}
                          {!canViewSupplierFinancialFields && !supplier.notes ? <span className="supplierDebtNote mutedText">Ghi chú tài chính đang được ẩn.</span> : null}
                        </div>
                      </td>
                      <td><span className="statusPill">{supplierStatusLabel(supplier.status)}</span></td>
                      <td className="actionsCell">
                        <div className="rowActions">
                          {canManageSuppliers ? (
                          <>
                          <a className="secondaryButton iconOnlyButton" href={`#${editSupplierModalId(supplier.id)}`} title="Sửa nhà cung cấp">
                            <Pencil size={14} />
                          </a>
                          {(() => {
                            const action = supplierLifecycleAction(supplier.name, supplier.status);
                            return (
                              <a className="secondaryButton iconOnlyButton" href={`#${lifecycleSupplierModalId(supplier.id)}`} title={action.title} aria-label={action.title}>
                                <CheckCircle2 size={14} />
                              </a>
                            );
                          })()}
                          <a className="dangerButton iconOnlyButton" href={`#${deleteSupplierModalId(supplier.id)}`} title="Xóa nhà cung cấp">
                            <Trash2 size={14} />
                          </a>

                          </>
                          ) : <span className="mutedText">{'Ch\u1ec9 xem'}</span>}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {suppliers.length === 0 ? (
                    <tr>
                      <td colSpan={9}>Chưa có nhà cung cấp. Hãy tạo loại nhà cung cấp và nhà cung cấp đầu tiên.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </section>

      {canManageSuppliers ? (
      <>
      <CategoryModal id={createCategoryModalId} title="Thêm loại nhà cung cấp" action={createCategory} submitLabel="Tạo loại" />
      {categories.map((category) => (
        <CategoryModal
          key={`category-${category.id}`}
          id={editCategoryModalId(category.id)}
          title={`Sửa loại ${supplierCategoryLabel(category.name)}`}
          category={category}
          action={updateCategory}
          submitLabel="Lưu thay đổi"
        />
      ))}
      <SupplierModal
        id={createSupplierModalId}
        title="Thêm nhà cung cấp"
        categories={allCategories}
        action={createSupplier}
        submitLabel="Tạo nhà cung cấp"
        canViewSupplierFinancialFields={canViewSupplierFinancialFields}
      />
      {suppliers.map((supplier) => (
        <SupplierModal
          key={supplier.id}
          id={editSupplierModalId(supplier.id)}
          title={`Sửa ${supplier.name}`}
          categories={allCategories}
          supplier={supplier}
          action={updateSupplier}
          submitLabel="Lưu thay đổi"
          canViewSupplierFinancialFields={canViewSupplierFinancialFields}
        />
      ))}
      {suppliers.map((supplier) => (
        <LifecycleStatusModal key={`lifecycle-${supplier.id}`} supplier={supplier} />
      ))}
      {suppliers.map((supplier) => (
        <DeleteSupplierModal key={`delete-${supplier.id}`} supplier={supplier} />
      ))}
      </>
      ) : null}
      </>
      ) : null}
    </section>
  );
}

function CategoryModal({
  id,
  title,
  category,
  action,
  submitLabel,
}: {
  id: string;
  title: string;
  category?: SupplierCategory;
  action: (formData: FormData) => Promise<void>;
  submitLabel: string;
}) {
  return (
    <div id={id} className="hashModal">
      <a className="hashModalBackdrop" href="/suppliers" aria-label="Đóng modal" />
      <div className="hashModalPanel">
        <div className="hashModalHeader">
          <h2><FolderPlus size={18} /> {title}</h2>
          <a className="secondaryButton iconOnlyButton" href="/suppliers" aria-label="Đóng"><X size={14} /></a>
        </div>
        <form action={action} className="modalFormStack">
          {category ? <input type="hidden" name="id" value={category.id} /> : null}
          <fieldset>
            <legend>Thông tin loại</legend>
            <label>
              Tên loại nhà cung cấp
              <input name="name" defaultValue={category?.name || ''} placeholder="Khách sạn, Vận chuyển, Hướng dẫn viên..." required minLength={2} />
            </label>
          </fieldset>
          <div className="modalActions">
            <a className="secondaryButton" href="/suppliers">Hủy</a>
            <button type="submit"><Save size={14} /> {submitLabel}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SupplierModal({
  id,
  title,
  categories,
  supplier,
  action,
  submitLabel,
  canViewSupplierFinancialFields,
}: {
  id: string;
  title: string;
  categories: SupplierCategory[];
  supplier?: Supplier;
  action: (formData: FormData) => Promise<void>;
  submitLabel: string;
  canViewSupplierFinancialFields: boolean;
}) {
  return (
    <div id={id} className="hashModal">
      <a className="hashModalBackdrop" href="/suppliers" aria-label="Đóng modal" />
      <div className="hashModalPanel hashModalWide">
        <div className="hashModalHeader">
          <h2><Building2 size={18} /> {title}</h2>
          <a className="secondaryButton iconOnlyButton" href="/suppliers" aria-label="Đóng"><X size={14} /></a>
        </div>
        <SupplierForm categories={categories} supplier={supplier} action={action} submitLabel={submitLabel} canViewSupplierFinancialFields={canViewSupplierFinancialFields} />
      </div>
    </div>
  );
}

function SupplierForm({
  categories,
  supplier,
  action,
  canViewSupplierFinancialFields,
  submitLabel,
}: {
  categories: SupplierCategory[];
  supplier?: Supplier;
  action: (formData: FormData) => Promise<void>;
  submitLabel: string;
  canViewSupplierFinancialFields: boolean;
}) {
  const selectedCategoryId = supplier?.category?.id || supplier?.categoryId || '';

  return (
    <form action={action} className="modalFormStack supplierForm">
      {supplier ? <input type="hidden" name="id" value={supplier.id} /> : null}
      <fieldset>
        <legend>Thông tin cơ bản</legend>
        <div className="supplierFieldGrid">
          <label>
            Loại nhà cung cấp
            <select name="categoryId" required defaultValue={selectedCategoryId}>
              <option value="">Chọn loại nhà cung cấp</option>
              {categories.map((category) => (
                <option value={category.id} key={category.id}>{supplierCategoryLabel(category.name)}</option>
              ))}
            </select>
          </label>
          <label>
            Tên nhà cung cấp
            <input name="name" required minLength={2} defaultValue={supplier?.name || ''} />
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend>Liên hệ</legend>
        <div className="supplierFieldGrid">
          <label>
            Người liên hệ
            <input name="contactPerson" defaultValue={supplier?.contactPerson || ''} />
          </label>
          <label>
            Điện thoại
            <input name="phone" inputMode="tel" defaultValue={supplier?.phone || ''} />
          </label>
          <label>
            Email
            <input name="email" type="email" defaultValue={supplier?.email || ''} />
          </label>
          <label>
            Địa chỉ
            <input name="address" defaultValue={supplier?.address || ''} />
          </label>
        </div>
      </fieldset>

      {canViewSupplierFinancialFields ? (
        <>
          <fieldset>
            <legend>Chính sách giá</legend>
            <label>
              Chính sách giá
              <textarea name="pricePolicy" rows={4} defaultValue={supplier?.pricePolicy || ''} placeholder="Điều kiện giá, mùa cao điểm, phụ thu, hạn thanh toán..." />
            </label>
          </fieldset>

          <fieldset>
            <legend>Công nợ</legend>
            <label>
              Ghi chú công nợ
              <textarea name="debtNote" rows={3} defaultValue={supplier?.debtNote || ''} placeholder="Hạn mức, kỳ đối soát, lưu ý thanh toán..." />
            </label>
          </fieldset>
        </>
      ) : (
        <ServerPermissionNotice allowed={false} label="xem ghi chú tài chính nhà cung cấp" missingPermissions={['finance.payment.view']} />
      )}

      <fieldset>
        <legend>Ghi chú</legend>
        <label>
          Ghi chú nội bộ
          <textarea name="notes" rows={3} defaultValue={supplier?.notes || ''} />
        </label>
      </fieldset>

      <div className="modalActions">
        <a className="secondaryButton" href="/suppliers">Hủy</a>
        <button type="submit" disabled={categories.length === 0}><Save size={14} /> {submitLabel}</button>
      </div>
    </form>
  );
}

function DeleteSupplierModal({ supplier }: { supplier: Supplier }) {
  return (
    <div id={deleteSupplierModalId(supplier.id)} className="hashModal">
      <a className="hashModalBackdrop" href="/suppliers" aria-label="Đóng modal" />
      <div className="hashModalPanel">
        <div className="hashModalHeader">
          <h2><AlertTriangle size={18} /> Xóa nhà cung cấp</h2>
          <a className="secondaryButton iconOnlyButton" href="/suppliers" aria-label="Đóng"><X size={14} /></a>
        </div>
        <div className="supplierDeleteWarning">
          <strong>{supplier.name}</strong>
          <p>Nếu nhà cung cấp này đang được dùng trong đơn hàng, điều hành, báo giá, tài chính hoặc yêu cầu thanh toán, hệ thống sẽ chặn xóa và hiển thị rõ nơi đang được tham chiếu.</p>
        </div>
        <form action={deleteSupplier} className="modalActions">
          <input type="hidden" name="id" value={supplier.id} />
          <input type="hidden" name="name" value={supplier.name} />
          <a className="secondaryButton" href="/suppliers">Hủy</a>
          <button type="submit" className="dangerButton"><Trash2 size={14} /> Xóa nhà cung cấp</button>
        </form>
      </div>
    </div>
  );
}

function LifecycleStatusModal({ supplier }: { supplier: Supplier }) {
  const action = supplierLifecycleAction(supplier.name, supplier.status);
  return (
    <div id={lifecycleSupplierModalId(supplier.id)} className="hashModal">
      <a className="hashModalBackdrop" href="/suppliers" aria-label="Đóng modal" />
      <div className="hashModalPanel">
        <div className="hashModalHeader">
          <h2><AlertTriangle size={18} /> {action.title}</h2>
          <a className="secondaryButton iconOnlyButton" href="/suppliers" aria-label="Đóng"><X size={14} /></a>
        </div>
        <div className="supplierDeleteWarning">
          <strong>{supplier.name}</strong>
          <p>{action.confirmText}</p>
        </div>
        <form action={updateSupplierStatus} className="modalActions">
          <input type="hidden" name="id" value={supplier.id} />
          <input type="hidden" name="name" value={supplier.name} />
          <input type="hidden" name="currentStatus" value={supplier.status || ''} />
          <input type="hidden" name="status" value={action.nextStatus} />
          <a className="secondaryButton" href="/suppliers">Hủy</a>
          <button type="submit" className={action.nextStatus === 'ACTIVE' ? 'secondaryButton' : 'dangerButton'}><CheckCircle2 size={14} /> {action.label}</button>
        </form>
      </div>
    </div>
  );
}

import { AlertTriangle, Building2, CheckCircle2, FolderPlus, Pencil, Plus, Save, Trash2, Users, X } from 'lucide-react';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { serverAuthHeaders, serverAuthJsonHeaders } from '../serverAuth';

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

type ApiResult<T> = { data: T; error?: string };
type MutationResult = { ok: boolean; message: string };
type SuppliersPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const apiBase = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/+$/, '');
const createCategoryModalId = 'suppliers-create-category';
const editCategoryModalId = (id: string) => `suppliers-edit-category-${id}`;
const createSupplierModalId = 'suppliers-create-supplier';
const editSupplierModalId = (id: string) => `suppliers-edit-${id}`;
const deleteSupplierModalId = (id: string) => `suppliers-delete-${id}`;

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
    pricePolicy: optionalField(formData, 'pricePolicy'),
    debtNote: optionalField(formData, 'debtNote'),
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
  redirectWithResult(result);
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

export default async function SuppliersPage({ searchParams }: SuppliersPageProps) {
  const params = searchParams ? await searchParams : {};
  const notice = singleParam(params.notice);
  const error = singleParam(params.error);
  const [categoriesResult, suppliersResult] = await Promise.all([
    apiGet<SupplierCategory[]>('/supplier-categories', [], 'Tải danh sách loại nhà cung cấp'),
    apiGet<Supplier[]>('/suppliers', [], 'Tải danh sách nhà cung cấp'),
  ]);
  const categories = categoriesResult.data;
  const suppliers = suppliersResult.data;
  const loadErrors = [categoriesResult.error, suppliersResult.error].filter(Boolean);

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

      <section className="contentGrid suppliersGrid">
        <div className="panel supplierCategoryPanel">
          <div className="sectionHeader">
            <h2><FolderPlus size={18} /> Loại nhà cung cấp</h2>
            <a className="iconTextButton secondaryButton" href={`#${createCategoryModalId}`}><Plus size={14} /> Thêm loại nhà cung cấp</a>
          </div>
          <div className="supplierCategoryList">
            {categories.map((category) => (
              <div className="supplierCategoryCard" key={category.id}>
                <div>
                  <strong>{category.name}</strong>
                  <span>{category._count?.suppliers ?? 0} nhà cung cấp đang gắn</span>
                </div>
                <a className="secondaryButton iconOnlyButton" href={`#${editCategoryModalId(category.id)}`} title={`Sửa loại ${category.name}`} aria-label={`Sửa loại ${category.name}`}><Pencil size={14} /></a>
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
            <a className="iconTextButton" href={`#${createSupplierModalId}`}><Plus size={14} /> Thêm nhà cung cấp</a>
          </div>

          <section className="panel listPanel supplierListPanel">
            <div className="sectionHeader">
              <h2>Danh sách nhà cung cấp</h2>
              <span>{suppliers.length} nhà cung cấp</span>
            </div>
            <div className="supplierTableWrap">
              <table className="supplierTable">
                <thead>
                  <tr>
                    <th>Nhà cung cấp</th>
                    <th>Loại nhà cung cấp</th>
                    <th>Liên hệ</th>
                    <th>Điện thoại</th>
                    <th>Email</th>
                    <th>Địa chỉ</th>
                    <th>Công nợ / ghi chú</th>
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
                      <td>{supplier.category?.name || 'Chưa phân loại'}</td>
                      <td>{display(supplier.contactPerson)}</td>
                      <td>{display(supplier.phone)}</td>
                      <td>{display(supplier.email)}</td>
                      <td>{display(supplier.address)}</td>
                      <td>
                        <div className="supplierDebtBlock">
                          {supplier.debtNote ? <span><strong>Công nợ:</strong> {supplier.debtNote}</span> : null}
                          {supplier.pricePolicy ? <span><strong>Chính sách giá:</strong> {supplier.pricePolicy}</span> : null}
                          {supplier.notes ? <span><strong>Ghi chú:</strong> {supplier.notes}</span> : null}
                          {!supplier.debtNote && !supplier.pricePolicy && !supplier.notes ? <span className="supplierDebtNote mutedText">Chưa có ghi chú công nợ.</span> : null}
                        </div>
                      </td>
                      <td className="actionsCell">
                        <div className="rowActions">
                          <a className="secondaryButton iconOnlyButton" href={`#${editSupplierModalId(supplier.id)}`} title="Sửa nhà cung cấp">
                            <Pencil size={14} />
                          </a>
                          <a className="dangerButton iconOnlyButton" href={`#${deleteSupplierModalId(supplier.id)}`} title="Xóa nhà cung cấp">
                            <Trash2 size={14} />
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {suppliers.length === 0 ? (
                    <tr>
                      <td colSpan={8}>Chưa có nhà cung cấp. Hãy tạo loại nhà cung cấp và nhà cung cấp đầu tiên.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </section>

      <CategoryModal id={createCategoryModalId} title="Thêm loại nhà cung cấp" action={createCategory} submitLabel="Tạo loại" />
      {categories.map((category) => (
        <CategoryModal
          key={`category-${category.id}`}
          id={editCategoryModalId(category.id)}
          title={`Sửa loại ${category.name}`}
          category={category}
          action={updateCategory}
          submitLabel="Lưu thay đổi"
        />
      ))}
      <SupplierModal id={createSupplierModalId} title="Thêm nhà cung cấp" categories={categories} action={createSupplier} submitLabel="Tạo nhà cung cấp" />
      {suppliers.map((supplier) => (
        <SupplierModal
          key={supplier.id}
          id={editSupplierModalId(supplier.id)}
          title={`Sửa ${supplier.name}`}
          categories={categories}
          supplier={supplier}
          action={updateSupplier}
          submitLabel="Lưu thay đổi"
        />
      ))}
      {suppliers.map((supplier) => (
        <DeleteSupplierModal key={`delete-${supplier.id}`} supplier={supplier} />
      ))}
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
}: {
  id: string;
  title: string;
  categories: SupplierCategory[];
  supplier?: Supplier;
  action: (formData: FormData) => Promise<void>;
  submitLabel: string;
}) {
  return (
    <div id={id} className="hashModal">
      <a className="hashModalBackdrop" href="/suppliers" aria-label="Đóng modal" />
      <div className="hashModalPanel hashModalWide">
        <div className="hashModalHeader">
          <h2><Building2 size={18} /> {title}</h2>
          <a className="secondaryButton iconOnlyButton" href="/suppliers" aria-label="Đóng"><X size={14} /></a>
        </div>
        <SupplierForm categories={categories} supplier={supplier} action={action} submitLabel={submitLabel} />
      </div>
    </div>
  );
}

function SupplierForm({
  categories,
  supplier,
  action,
  submitLabel,
}: {
  categories: SupplierCategory[];
  supplier?: Supplier;
  action: (formData: FormData) => Promise<void>;
  submitLabel: string;
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
                <option value={category.id} key={category.id}>{category.name}</option>
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

      <fieldset>
        <legend>Chính sách giá</legend>
        <label>
          Chính sách giá
          <textarea name="pricePolicy" rows={4} defaultValue={supplier?.pricePolicy || ''} placeholder="Điều kiện giá, mùa cao điểm, phụ thu, hạn thanh toán..." />
        </label>
      </fieldset>

      <fieldset>
        <legend>Công nợ / ghi chú</legend>
        <label>
          Ghi chú công nợ
          <textarea name="debtNote" rows={3} defaultValue={supplier?.debtNote || ''} placeholder="Hạn mức, kỳ đối soát, lưu ý thanh toán..." />
        </label>
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

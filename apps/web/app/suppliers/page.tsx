import { Building2, Pencil, Plus, Save, Trash2, Users, X } from 'lucide-react';
import { revalidatePath } from 'next/cache';
import { serverAuthHeaders, serverAuthJsonHeaders } from '../serverAuth';

export const dynamic = 'force-dynamic';

type SupplierCategory = { id: string; name: string; _count?: { suppliers: number } };
type Supplier = {
  id: string; name: string; contactPerson: string | null; phone: string | null; email: string | null; address: string | null;
  category: { id: string; name: string }; pricePolicy: string | null; debtNote: string | null; updatedAt: string;
};

const apiBase = process.env.NEXT_PUBLIC_API_URL || '';

async function apiGet<T>(path: string, fallback: T): Promise<T> {
  try { const response = await fetch(`${apiBase}/api${path}`, { cache: 'no-store', headers: await serverAuthHeaders() }); if (!response.ok) return fallback; return response.json(); }
  catch { return fallback; }
}

async function createCategory(formData: FormData) {
  'use server';
  await fetch(`${apiBase}/api/supplier-categories`, { method: 'POST', headers: await serverAuthJsonHeaders(), body: JSON.stringify({ name: String(formData.get('name') || '') }) });
  revalidatePath('/suppliers');
}

async function createSupplier(formData: FormData) {
  'use server';
  await fetch(`${apiBase}/api/suppliers`, { method: 'POST', headers: await serverAuthJsonHeaders(), body: JSON.stringify({
    categoryId: String(formData.get('categoryId') || ''), name: String(formData.get('name') || ''), contactPerson: String(formData.get('contactPerson') || ''),
    phone: String(formData.get('phone') || ''), email: String(formData.get('email') || ''), address: String(formData.get('address') || ''),
    pricePolicy: String(formData.get('pricePolicy') || ''), debtNote: String(formData.get('debtNote') || ''), notes: String(formData.get('notes') || ''),
  }) });
  revalidatePath('/suppliers');
}

async function updateSupplier(formData: FormData) {
  'use server';
  const id = String(formData.get('id') || '');
  if (!id) return;
  await fetch(`${apiBase}/api/suppliers/${id}`, { method: 'PATCH', headers: await serverAuthJsonHeaders(), body: JSON.stringify({
    categoryId: String(formData.get('categoryId') || ''), name: String(formData.get('name') || ''), contactPerson: String(formData.get('contactPerson') || ''),
    phone: String(formData.get('phone') || ''), email: String(formData.get('email') || ''), address: String(formData.get('address') || ''),
    pricePolicy: String(formData.get('pricePolicy') || ''), debtNote: String(formData.get('debtNote') || ''), notes: String(formData.get('notes') || ''),
  }) });
  revalidatePath('/suppliers');
}

async function deleteSupplier(formData: FormData) {
  'use server';
  const id = String(formData.get('id') || '');
  if (!id) return;
  await fetch(`${apiBase}/api/suppliers/${id}`, { method: 'DELETE', headers: await serverAuthHeaders() });
  revalidatePath('/suppliers');
}

function SupplierForm({ categories, supplier }: { categories: SupplierCategory[]; supplier?: Supplier }) {
  return (
    <form action={supplier ? updateSupplier : createSupplier} className="bookingEditForm">
      {supplier ? <input type="hidden" name="id" value={supplier.id} /> : null}
      <label>Loại NCC<select name="categoryId" defaultValue={supplier?.category.id || ''} required><option value="">Chọn loại</option>{categories.map((category) => (<option value={category.id} key={category.id}>{category.name}</option>))}</select></label>
      <label>Tên NCC<input name="name" defaultValue={supplier?.name || ''} required minLength={2} /></label>
      <label>Người liên hệ<input name="contactPerson" defaultValue={supplier?.contactPerson || ''} /></label>
      <label>Điện thoại<input name="phone" defaultValue={supplier?.phone || ''} /></label>
      <label>Email<input name="email" type="email" defaultValue={supplier?.email || ''} /></label>
      <label>Địa chỉ<input name="address" defaultValue={supplier?.address || ''} /></label>
      <label>Chính sách giá<textarea name="pricePolicy" defaultValue={supplier?.pricePolicy || ''} rows={2} /></label>
      <label>Ghi chú công nợ<textarea name="debtNote" defaultValue={supplier?.debtNote || ''} rows={2} /></label>
      <button type="submit"><Save size={14} /> {supplier ? 'Lưu NCC' : 'Tạo NCC'}</button>
    </form>
  );
}

export default async function SuppliersPage() {
  const [categories, suppliers] = await Promise.all([apiGet<SupplierCategory[]>('/supplier-categories', []), apiGet<Supplier[]>('/suppliers', [])]);
  return (
    <section className="workspace">
      <header className="pageHeader">
        <div><p className="eyebrow">Dữ liệu nền vận hành</p><h1>Quản lý nhà cung cấp</h1></div>
        <div className="pageHeaderActions"><a className="secondaryButton iconTextButton" href="#create-category"><Plus size={16} /> Thêm loại</a><a className="secondaryButton iconTextButton" href="#create-supplier"><Building2 size={16} /> Thêm NCC</a><span className="statusPill"><Users size={14} /> Nhân sự vận hành</span></div>
      </header>

      <section className="panel listPanel">
        <div className="sectionHeader"><h2>Danh sách nhà cung cấp</h2><span>{suppliers.length} NCC</span></div>
        <table><thead><tr><th>Tên NCC</th><th>Loại</th><th>Liên hệ</th><th>Điện thoại</th><th>Email</th><th>Địa chỉ</th><th>Thao tác</th></tr></thead>
          <tbody>{suppliers.map((supplier) => (<tr key={supplier.id}><td><strong>{supplier.name}</strong>{supplier.debtNote ? <><br /><span className="mutedText">{supplier.debtNote}</span></> : null}</td><td>{supplier.category.name}</td><td>{supplier.contactPerson || '—'}</td><td>{supplier.phone || '—'}</td><td>{supplier.email || '—'}</td><td>{supplier.address || '—'}</td><td className="actionsCell"><div className="rowActions"><a className="secondaryButton iconButton" href={`#edit-${supplier.id}`} title="Sửa NCC"><Pencil size={14} /></a><form action={deleteSupplier}><input type="hidden" name="id" value={supplier.id} /><button type="submit" className="dangerButton" title="Xóa NCC"><Trash2 size={14} /></button></form></div></td></tr>))}{suppliers.length === 0 ? (<tr><td colSpan={7} className="tableEmptyState">Chưa có nhà cung cấp.</td></tr>) : null}</tbody>
        </table>
      </section>

      <section className="panel categoryPanel"><h2>Loại nhà cung cấp</h2><div className="chips">{categories.map((category) => (<span key={category.id}>{category.name} ({category._count?.suppliers ?? 0})</span>))}</div></section>

      <section id="create-category" className="hashModal"><a href="#" className="hashModalBackdrop" aria-label="Đóng"></a><div className="hashModalPanel"><div className="hashModalHeader"><h2><Plus size={18} /> Thêm loại NCC</h2><a className="secondaryButton iconButton" href="#" title="Đóng"><X size={16} /></a></div><form action={createCategory} className="formStack"><label>Tên loại<input name="name" placeholder="Hotel, Vehicle, Tour HDV" required minLength={2} /></label><button type="submit">Tạo loại NCC</button></form></div></section>
      <section id="create-supplier" className="hashModal"><a href="#" className="hashModalBackdrop" aria-label="Đóng"></a><div className="hashModalPanel hashModalWide"><div className="hashModalHeader"><h2><Building2 size={18} /> Thêm nhà cung cấp</h2><a className="secondaryButton iconButton" href="#" title="Đóng"><X size={16} /></a></div><SupplierForm categories={categories} /></div></section>
      {suppliers.map((supplier) => (<section id={`edit-${supplier.id}`} className="hashModal" key={`edit-${supplier.id}`}><a href="#" className="hashModalBackdrop" aria-label="Đóng"></a><div className="hashModalPanel hashModalWide"><div className="hashModalHeader"><h2><Pencil size={18} /> Sửa nhà cung cấp</h2><a className="secondaryButton iconButton" href="#" title="Đóng"><X size={16} /></a></div><SupplierForm categories={categories} supplier={supplier} /></div></section>))}
    </section>
  );
}

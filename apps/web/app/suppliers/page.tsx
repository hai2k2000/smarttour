import { Building2, Plus, Users } from 'lucide-react';
import { revalidatePath } from 'next/cache';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

type SupplierCategory = {
  id: string;
  name: string;
  _count?: { suppliers: number };
};

type Supplier = {
  id: string;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  category: { name: string };
  updatedAt: string;
};

const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

async function apiGet<T>(path: string, fallback: T): Promise<T> {
  try {
    const response = await fetch(`${apiBase}/api${path}`, { cache: 'no-store' });
    if (!response.ok) return fallback;
    return response.json();
  } catch {
    return fallback;
  }
}

async function createCategory(formData: FormData) {
  'use server';
  await fetch(`${apiBase}/api/supplier-categories`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: String(formData.get('name') || '') }),
  });
  revalidatePath('/suppliers');
}

async function createSupplier(formData: FormData) {
  'use server';
  await fetch(`${apiBase}/api/suppliers`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      categoryId: String(formData.get('categoryId') || ''),
      name: String(formData.get('name') || ''),
      contactPerson: String(formData.get('contactPerson') || ''),
      phone: String(formData.get('phone') || ''),
      email: String(formData.get('email') || ''),
      address: String(formData.get('address') || ''),
      pricePolicy: String(formData.get('pricePolicy') || ''),
      debtNote: String(formData.get('debtNote') || ''),
      notes: String(formData.get('notes') || ''),
    }),
  });
  revalidatePath('/suppliers');
}

export default async function SuppliersPage() {
  const [categories, suppliers] = await Promise.all([
    apiGet<SupplierCategory[]>('/supplier-categories', []),
    apiGet<Supplier[]>('/suppliers', []),
  ]);

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">SmartTour</div>
        <nav>
          <Link href="/">Dashboard van hanh</Link>
          <Link href="/suppliers" className="active">Nha cung cap</Link>
          <Link href="/tour-programs">Tour mau</Link>
          <a>Booking tour</a>
          <a>Phieu dieu hanh</a>
          <a>Chi phi tour</a>
          <a>Thanh toan NCC</a>
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Operation master data</p>
            <h1>Quan ly nha cung cap</h1>
          </div>
          <div className="user"><Users size={18} /> Operator</div>
        </header>

        <section className="contentGrid suppliersGrid">
          <div className="panel">
            <h2><Plus size={18} /> Them loai NCC</h2>
            <form action={createCategory} className="formStack">
              <label>
                Ten loai
                <input name="name" placeholder="Hotel, Vehicle, Tour Guide" required minLength={2} />
              </label>
              <button type="submit">Tao loai NCC</button>
            </form>
          </div>

          <div className="panel">
            <h2><Building2 size={18} /> Them nha cung cap</h2>
            <form action={createSupplier} className="formGrid">
              <label>
                Loai NCC
                <select name="categoryId" required>
                  <option value="">Chon loai</option>
                  {categories.map((category) => (
                    <option value={category.id} key={category.id}>{category.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Ten NCC
                <input name="name" required minLength={2} />
              </label>
              <label>
                Nguoi lien he
                <input name="contactPerson" />
              </label>
              <label>
                Dien thoai
                <input name="phone" />
              </label>
              <label>
                Email
                <input name="email" type="email" />
              </label>
              <label>
                Dia chi
                <input name="address" />
              </label>
              <label>
                Chinh sach gia
                <textarea name="pricePolicy" rows={3} />
              </label>
              <label>
                Ghi chu cong no
                <textarea name="debtNote" rows={3} />
              </label>
              <button type="submit">Tao NCC</button>
            </form>
          </div>
        </section>

        <section className="panel listPanel">
          <div className="sectionHeader">
            <h2>Danh sach nha cung cap</h2>
            <span>{suppliers.length} NCC</span>
          </div>
          <table>
            <thead>
              <tr>
                <th>Ten NCC</th>
                <th>Loai</th>
                <th>Lien he</th>
                <th>Dien thoai</th>
                <th>Email</th>
                <th>Dia chi</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((supplier) => (
                <tr key={supplier.id}>
                  <td>{supplier.name}</td>
                  <td>{supplier.category.name}</td>
                  <td>{supplier.contactPerson || '-'}</td>
                  <td>{supplier.phone || '-'}</td>
                  <td>{supplier.email || '-'}</td>
                  <td>{supplier.address || '-'}</td>
                </tr>
              ))}
              {suppliers.length === 0 ? (
                <tr><td colSpan={6}>Chua co nha cung cap. Hay tao loai NCC va NCC dau tien.</td></tr>
              ) : null}
            </tbody>
          </table>
        </section>

        <section className="panel categoryPanel">
          <h2>Loai nha cung cap</h2>
          <div className="chips">
            {categories.map((category) => (
              <span key={category.id}>{category.name} ({category._count?.suppliers ?? 0})</span>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}

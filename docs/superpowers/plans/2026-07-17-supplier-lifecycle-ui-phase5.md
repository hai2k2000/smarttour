# Supplier Lifecycle UI Phase 5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add clear supplier lifecycle actions across common, typed, and hotel supplier screens without changing the existing soft-delete/status APIs.

**Architecture:** Keep lifecycle API calls in the existing UI surfaces. Add shared client helpers in `SupplierClientUi.tsx` for action labels and blocked-operation guidance, use typed `/api/suppliers/:type/:id/status` for generic supplier pages, use common `/api/suppliers/:id/status` for hotel and common supplier pages, and keep server-rendered common supplier actions as hash-modal confirmations.

**Tech Stack:** Next.js App Router, React client components, server actions, NestJS supplier endpoints, Prisma-backed supplier status guards, shell/Python source contracts.

---

### Task 1: Add RED Lifecycle UI Source Contract

**Files:**
- Modify: `scripts/test-suppliers-client-contract.sh`
- Test: `scripts/test-suppliers-client-contract.sh`

- [ ] **Step 1: Write the failing contract assertions**

Add these assertions after the existing shared helper assertions:

```python
assert 'supplierLifecycleAction(' in shared, 'shared supplier UI helper must expose lifecycle action labels'
assert 'nextSupplierLifecycleStatus(' in shared, 'shared supplier UI helper must compute activate/deactivate target status'
assert 'supplierLifecycleBlockedText(' in shared, 'shared supplier UI helper must enrich blocked lifecycle errors'
assert 'supplierLifecycleGuidanceLinks' in shared, 'blocked lifecycle errors must guide users to related modules'
assert 'Đơn hàng' in shared and 'Điều hành' in shared and 'Tài chính' in shared and 'Yêu cầu thanh toán' in shared
```

Add these assertions near the generic client checks:

```python
assert 'changeSupplierLifecycleStatus(' in generic, 'generic typed supplier list must expose quick lifecycle status action'
assert '/api/suppliers/${type}/${supplier.id}/status' in generic, 'generic typed lifecycle action must use the typed status endpoint'
assert "method: 'PATCH'" in generic and "body: JSON.stringify({ status: action.nextStatus })" in generic
assert 'supplierLifecycleBlockedText(errorText(error' in generic, 'generic lifecycle block errors must include operational guidance'
assert 'supplierLifecycleAction(row.original.name, row.original.status' in generic, 'generic lifecycle action must confirm with supplier name and current status'
```

Add these assertions near the hotel client checks:

```python
assert 'changeSupplierLifecycleStatus(' in hotel, 'hotel supplier list must expose quick lifecycle status action'
assert '/api/suppliers/${hotel.id}/status' in hotel, 'hotel lifecycle action must use the common status endpoint'
assert 'await loadInventory(inventoryFilters)' in hotel, 'hotel lifecycle action must refresh inventory after status changes'
assert 'supplierLifecycleBlockedText(errorText(error' in hotel, 'hotel lifecycle block errors must include operational guidance'
assert 'supplierLifecycleAction(row.original.name, row.original.status' in hotel, 'hotel lifecycle action must confirm with hotel name and current status'
```

Add these assertions near the common supplier page checks:

```python
assert 'updateSupplierStatus(formData' in supplier_page, 'common supplier page must expose server action for lifecycle status changes'
assert '/suppliers/${encodeURIComponent(id)}/status' in supplier_page, 'common supplier lifecycle action must use common status endpoint'
assert 'LifecycleStatusModal' in supplier_page, 'common supplier lifecycle action must require modal confirmation'
assert 'supplierLifecycleBlockedText(result.message)' in supplier_page, 'common supplier delete/status block errors must include guidance'
assert 'supplierLifecycleAction(supplier.name, supplier.status' in supplier_page, 'common supplier lifecycle action must show supplier-specific action copy'
```

- [ ] **Step 2: Run contract and verify RED**

Run:

```bash
bash scripts/test-suppliers-client-contract.sh
```

Expected: FAIL with an `AssertionError` for missing lifecycle helper/action tokens.

- [ ] **Step 3: Commit the RED contract**

Run:

```bash
git add scripts/test-suppliers-client-contract.sh
git commit -m "test: add supplier lifecycle ui contract"
```

### Task 2: Implement Shared Lifecycle Helpers

**Files:**
- Modify: `apps/web/app/suppliers/SupplierClientUi.tsx`
- Test: `scripts/test-suppliers-client-contract.sh`

- [ ] **Step 1: Add helper exports**

Add this code after `supplierLifecycleStatusOptions`:

```tsx
export const supplierLifecycleGuidanceLinks = [
  { href: '/orders', label: 'Đơn hàng' },
  { href: '/operation', label: 'Điều hành' },
  { href: '/finance/payments', label: 'Tài chính' },
  { href: '/finance/supplier-payment-requests', label: 'Yêu cầu thanh toán' },
] as const;

export function nextSupplierLifecycleStatus(status: string): SupplierLifecycleStatus {
  return status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
}

export function supplierLifecycleAction(name: string, status: string, noun = 'nhà cung cấp') {
  const nextStatus = nextSupplierLifecycleStatus(status);
  const isReactivation = nextStatus === 'ACTIVE';
  const label = isReactivation ? 'Kích hoạt lại' : 'Ngừng hoạt động';
  return {
    nextStatus,
    label,
    title: `${label} ${noun}`,
    busyKey: `${isReactivation ? 'activate' : 'deactivate'}:${name}`,
    confirmText: isReactivation
      ? `${label} "${name}"? ${noun[0].toUpperCase()}${noun.slice(1)} sẽ được mở lại để chọn trong vận hành mới.`
      : `${label} "${name}"? ${noun[0].toUpperCase()}${noun.slice(1)} sẽ không còn được dùng cho lựa chọn mới; giao dịch lịch sử vẫn được giữ và hệ thống sẽ chặn nếu còn tham chiếu vận hành.`,
    successText: isReactivation ? `Đã kích hoạt lại "${name}".` : `Đã ngừng hoạt động "${name}".`,
  };
}

export function supplierLifecycleBlockedText(message: string) {
  const detail = message.trim() || 'Không thực hiện được thao tác lifecycle nhà cung cấp.';
  const modules = supplierLifecycleGuidanceLinks.map((link) => link.label).join(', ');
  return `${detail} Có thể mở các module liên quan (${modules}) để gỡ tham chiếu trước khi thử lại.`;
}
```

- [ ] **Step 2: Run contract and verify partial GREEN**

Run:

```bash
bash scripts/test-suppliers-client-contract.sh
```

Expected: FAIL now moves to missing generic/hotel/common lifecycle actions.

### Task 3: Add Quick Lifecycle Actions To Generic Typed Supplier Lists

**Files:**
- Modify: `apps/web/app/suppliers/[type]/GenericSupplierClient.tsx`
- Test: `scripts/test-suppliers-client-contract.sh`

- [ ] **Step 1: Import lifecycle helpers and icon**

Update imports:

```tsx
import { Ban, FileUp, Pencil, Plus, RefreshCcw, Save, Search, Trash2, X } from 'lucide-react';
```

Add shared helper imports:

```tsx
  supplierLifecycleAction,
  supplierLifecycleBlockedText,
```

- [ ] **Step 2: Add lifecycle status handler**

Add after `deleteSupplier`:

```tsx
  async function changeSupplierLifecycleStatus(supplier: Supplier) {
    const action = supplierLifecycleAction(supplier.name, supplier.status, 'nhà cung cấp');
    if (!window.confirm(action.confirmText)) return;
    setBusyAction(`${action.nextStatus === 'ACTIVE' ? 'activate' : 'deactivate'}:${supplier.id}`);
    setNotice(null);
    try {
      await supplierApi(
        `/api/suppliers/${type}/${supplier.id}/status`,
        { method: 'PATCH', body: JSON.stringify({ status: action.nextStatus }) },
        action.title,
      );
      await load(filters);
      setNotice({ type: 'success', text: action.successText });
    } catch (error) {
      setNotice({ type: 'error', text: supplierLifecycleBlockedText(errorText(error, `${action.title} thất bại.`)) });
    } finally {
      setBusyAction('');
    }
  }
```

- [ ] **Step 3: Render gated row action**

Inside the `actions` cell, create `const action = supplierLifecycleAction(row.original.name, row.original.status, 'nhà cung cấp');` and add a button before delete:

```tsx
            <button type="button" className="secondaryButton iconButton" disabled={!canManage || Boolean(busyAction)} onClick={() => void changeSupplierLifecycleStatus(row.original)} title={action.title} aria-label={action.title}>
              {action.nextStatus === 'ACTIVE' ? <RefreshCcw size={15} /> : <Ban size={15} />}
            </button>
```

- [ ] **Step 4: Run contract and verify partial GREEN**

Run:

```bash
bash scripts/test-suppliers-client-contract.sh
```

Expected: FAIL now moves to missing hotel/common lifecycle actions.

### Task 4: Add Quick Lifecycle Actions To Hotel Supplier List

**Files:**
- Modify: `apps/web/app/suppliers/hotels/HotelSuppliersClient.tsx`
- Test: `scripts/test-suppliers-client-contract.sh`

- [ ] **Step 1: Import lifecycle helpers and icon**

Update imports:

```tsx
import { Ban, BedDouble, CheckCircle2, FileUp, LockKeyhole, Pencil, Plus, RefreshCcw, Save, Search, Settings2, Trash2, Undo2, X } from 'lucide-react';
```

Add shared helper imports:

```tsx
  supplierLifecycleAction,
  supplierLifecycleBlockedText,
```

- [ ] **Step 2: Add hotel lifecycle handler**

Add after `deleteSupplier`:

```tsx
  async function changeSupplierLifecycleStatus(hotel: HotelSupplier) {
    const action = supplierLifecycleAction(hotel.name, hotel.status, 'nhà cung cấp khách sạn');
    if (!window.confirm(action.confirmText)) return;
    setBusyAction(`${action.nextStatus === 'ACTIVE' ? 'activate' : 'deactivate'}:${hotel.id}`);
    setNotice(null);
    try {
      await supplierApi(
        `/api/suppliers/${hotel.id}/status`,
        { method: 'PATCH', body: JSON.stringify({ status: action.nextStatus }) },
        action.title,
      );
      await load(filters);
      await loadInventory(inventoryFilters);
      setNotice({ type: 'success', text: action.successText });
    } catch (error) {
      setNotice({ type: 'error', text: supplierLifecycleBlockedText(errorText(error, `${action.title} thất bại.`)) });
    } finally {
      setBusyAction('');
    }
  }
```

- [ ] **Step 3: Render gated hotel row action**

Inside the `actions` cell, create `const action = supplierLifecycleAction(row.original.name, row.original.status, 'nhà cung cấp khách sạn');` and add a button before delete:

```tsx
            <button type="button" className="secondaryButton iconTextButton compactActionButton" disabled={!canManage || Boolean(busyAction)} onClick={() => void changeSupplierLifecycleStatus(row.original)} title={action.title} aria-label={action.title}>
              {action.nextStatus === 'ACTIVE' ? <RefreshCcw size={15} /> : <Ban size={15} />} {action.label}
            </button>
```

- [ ] **Step 4: Run contract and verify partial GREEN**

Run:

```bash
bash scripts/test-suppliers-client-contract.sh
```

Expected: FAIL now moves to missing common supplier lifecycle status action.

### Task 5: Add Common Supplier Lifecycle Modal And Error Guidance

**Files:**
- Modify: `apps/web/app/suppliers/page.tsx`
- Test: `scripts/test-suppliers-client-contract.sh`
- Test: `scripts/test-supplier-ui-permission-contract.js`

- [ ] **Step 1: Add lifecycle modal ID and status labels**

Add near modal IDs:

```tsx
const lifecycleSupplierModalId = (id: string) => `suppliers-lifecycle-${id}`;
const supplierStatusLabels: Record<string, string> = {
  ACTIVE: 'Đang hoạt động',
  INACTIVE: 'Ngừng hoạt động',
};
```

- [ ] **Step 2: Add common lifecycle helpers**

Add after `supplierCategoryLabel`:

```tsx
const supplierLifecycleGuidanceLinks = ['Đơn hàng', 'Điều hành', 'Tài chính', 'Yêu cầu thanh toán'];

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
  return {
    nextStatus,
    label,
    title: `${label} ${noun}`,
    confirmText: isReactivation
      ? `${noun[0].toUpperCase()}${noun.slice(1)} "${name}" sẽ được mở lại để chọn trong vận hành mới.`
      : `${noun[0].toUpperCase()}${noun.slice(1)} "${name}" sẽ không còn được dùng cho lựa chọn mới; giao dịch lịch sử vẫn được giữ và hệ thống sẽ chặn nếu còn tham chiếu vận hành.`,
    successText: isReactivation ? `Đã kích hoạt lại ${name}.` : `Đã ngừng hoạt động ${name}.`,
  };
}

function supplierLifecycleBlockedText(message: string) {
  return `${message} Có thể mở các module liên quan (${supplierLifecycleGuidanceLinks.join(', ')}) để gỡ tham chiếu trước khi thử lại.`;
}
```

- [ ] **Step 3: Add server action for status**

Add after `updateSupplier`:

```tsx
async function updateSupplierStatus(formData: FormData) {
  'use server';
  const id = field(formData, 'id');
  const name = field(formData, 'name') || 'nhà cung cấp';
  const status = field(formData, 'status');
  if (!id) redirectWithResult({ ok: false, message: 'Đổi trạng thái nhà cung cấp thất bại: thiếu ID nhà cung cấp.' });
  const action = supplierLifecycleAction(name, status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE');
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
```

Update `deleteSupplier` to wrap blocked errors:

```tsx
  redirectWithResult(result.ok ? result : { ...result, message: supplierLifecycleBlockedText(result.message) });
```

- [ ] **Step 4: Render status column, action link, and modal**

Add a `Trạng thái` table header before `Thao tác`, render `supplierStatusLabel(supplier.status)`, and increase empty `colSpan` to `9`.

Inside row actions, add:

```tsx
                          {(() => {
                            const action = supplierLifecycleAction(supplier.name, supplier.status);
                            return (
                              <a className="secondaryButton iconOnlyButton" href={`#${lifecycleSupplierModalId(supplier.id)}`} title={action.title} aria-label={action.title}>
                                <CheckCircle2 size={14} />
                              </a>
                            );
                          })()}
```

Render modals:

```tsx
      {suppliers.map((supplier) => (
        <LifecycleStatusModal key={`lifecycle-${supplier.id}`} supplier={supplier} />
      ))}
```

Add component after `DeleteSupplierModal`:

```tsx
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
          <input type="hidden" name="status" value={action.nextStatus} />
          <a className="secondaryButton" href="/suppliers">Hủy</a>
          <button type="submit" className={action.nextStatus === 'ACTIVE' ? 'secondaryButton' : 'dangerButton'}><CheckCircle2 size={14} /> {action.label}</button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run contracts and verify GREEN**

Run:

```bash
bash scripts/test-suppliers-client-contract.sh
node scripts/test-supplier-ui-permission-contract.js
```

Expected: both commands print their `*_OK` line.

### Task 6: Full Verification, Memory Bank, Deploy

**Files:**
- Modify: `memory-bank/activeContext.md`
- Modify: `memory-bank/progress.md`

- [ ] **Step 1: Run focused verification**

Run:

```bash
bash scripts/test-suppliers-client-contract.sh
node scripts/test-supplier-ui-permission-contract.js
bash scripts/test-suppliers-controller-contract.sh
bash scripts/test-suppliers-common-contract.sh
bash scripts/test-suppliers-hotel-contract.sh
npm run lint --workspace @smarttour/web
```

Expected: all commands exit `0`.

- [ ] **Step 2: Update Memory Bank**

Append a dated Phase 5 note to `memory-bank/activeContext.md` and `memory-bank/progress.md` stating that supplier lifecycle UI now has permission-gated quick status actions, supplier-specific confirmations, blocked-operation guidance, and hotel inventory refresh.

- [ ] **Step 3: Commit implementation**

Run:

```bash
git add apps/web/app/suppliers/SupplierClientUi.tsx apps/web/app/suppliers/[type]/GenericSupplierClient.tsx apps/web/app/suppliers/hotels/HotelSuppliersClient.tsx apps/web/app/suppliers/page.tsx memory-bank/activeContext.md memory-bank/progress.md
git commit -m "feat: add supplier lifecycle ui actions"
```

- [ ] **Step 4: Merge, deploy, and smoke**

Run from `/opt/smarttour` after merging the worktree branch:

```bash
git merge --ff-only fix/supplier-lifecycle-ui-phase5
docker compose build api web
docker compose up -d api web
bash scripts/smoke-suppliers.sh
npm run ops:health
git push origin main
```

Expected: smoke and health commands exit `0`, and `origin/main` contains the Phase 5 commits.


'use client';

import { CheckCircle2, KeyRound, Pencil, Plus, RefreshCcw, ShieldCheck, UserCog, X } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';

import { viPermission, viRoleCode, viStatus } from '../i18n';

type Role = {
  id: string;
  code: string;
  name: string;
  description?: string;
  isSystem: boolean;
  status: string;
  permissions: { id: string; permission: string }[];
  _count?: { users: number };
};

type User = {
  id: string;
  username?: string | null;
  email: string;
  name: string;
  phone?: string | null;
  gender?: string | null;
  dateOfBirth?: string | null;
  address?: string | null;
  identityNo?: string | null;
  maritalStatus?: string | null;
  nationality?: string | null;
  ethnicity?: string | null;
  religion?: string | null;
  taxCode?: string | null;
  rank?: string | null;
  bankAccountNumber?: string | null;
  bankAccountName?: string | null;
  bankName?: string | null;
  status: string;
  branch?: string;
  department?: string;
  dataScope?: 'all' | 'branch' | 'department' | 'none';
  lastLoginAt?: string;
  roles: { code: string; name: string }[];
  permissions: string[];
};

type ActiveModal = 'password' | 'createUser' | 'updateUser' | 'createRole' | 'updateRole' | null;
type AuthState = 'checking' | 'ready' | 'missing' | 'invalid';
type Message = { kind: 'info' | 'success' | 'error'; text: string };
type SecurityAction = 'createUser' | 'updateUser' | 'createRole' | 'updateRole' | 'changePassword';

const commonPermissionGroups = [
  {
    label: 'Quản trị hệ thống',
    permissions: ['*', 'auth.user.manage', 'auth.role.manage', 'file.view', 'file.manage'],
  },
  {
    label: 'Phạm vi dữ liệu',
    permissions: ['data.scope.all', 'data.scope.branch', 'data.scope.department'],
  },
  {
    label: 'Bán hàng và đơn hàng',
    permissions: [
      'booking.view',
      'booking.manage',
      'tour.view',
      'tour.manage',
      'tour.export',
      'order.view',
      'order.manage',
      'order.export',
      'quote.view',
      'quote.manage',
      'quotation.view',
      'quotation.manage',
      'customer.view',
      'customer.manage',
      'commission.view',
      'commission.manage',
      'commission.export',
      'report.view',
      'report.export',
    ],
  },
  {
    label: 'Điều hành và nhà cung cấp',
    permissions: [
      'guide.view',
      'guide.manage',
      'supplier.view',
      'supplier.manage',
      'operation.form.view',
      'operation.form.manage',
      'operation.payment-request.view',
      'operation.payment-request.create',
      'operation.payment-request.approve',
    ],
  },
  {
    label: 'Tài chính',
    permissions: [
      'finance.receipt.view',
      'finance.receipt.create',
      'finance.receipt.update',
      'finance.receipt.delete',
      'finance.receipt.approve',
      'finance.receipt.import',
      'finance.receipt.export',
      'finance.payment.view',
      'finance.payment.create',
      'finance.payment.update',
      'finance.payment.delete',
      'finance.payment.approve',
      'finance.payment.import',
      'finance.payment.export',
      'finance.invoice.view',
      'finance.invoice.create',
      'finance.invoice.update',
      'finance.invoice.delete',
      'finance.invoice.approve',
      'finance.invoice.export',
      'finance.cashflow.view',
      'finance.cashflow.export',
      'finance.debt.view',
      'finance.debt.adjust',
    ],
  },
] as const;

const commonPermissions = commonPermissionGroups.flatMap((group) => group.permissions);
const actionLabels: Record<SecurityAction, { present: string; success: string }> = {
  createUser: { present: 'tạo người dùng', success: 'Đã tạo người dùng.' },
  updateUser: { present: 'cập nhật người dùng', success: 'Đã cập nhật người dùng.' },
  createRole: { present: 'tạo vai trò', success: 'Đã tạo vai trò.' },
  updateRole: { present: 'cập nhật vai trò', success: 'Đã cập nhật vai trò.' },
  changePassword: { present: 'đổi mật khẩu', success: 'Đã đổi mật khẩu. Các phiên đăng nhập khác đã được thu hồi.' },
};
const USER_STATUS_OPTIONS = [
  { value: 'ACTIVE', label: viStatus('ACTIVE') },
  { value: 'INACTIVE', label: viStatus('INACTIVE') },
  { value: 'LOCKED', label: viStatus('LOCKED') },
] as const;
const ROLE_STATUS_OPTIONS = [
  { value: 'ACTIVE', label: viStatus('ACTIVE') },
  { value: 'INACTIVE', label: viStatus('INACTIVE') },
] as const;

export default function SecurityClient() {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [message, setMessage] = useState<Message | null>(null);
  const [authState, setAuthState] = useState<AuthState>('checking');
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<SecurityAction | null>(null);
  const [canManageUsers, setCanManageUsers] = useState(false);
  const [canManageRoles, setCanManageRoles] = useState(false);

  const selectedUser = users.find((user) => user.id === selectedUserId);
  const selectedRole = roles.find((role) => role.id === selectedRoleId);
  const activeRoles = useMemo(() => roles.filter((role) => role.status === 'ACTIVE'), [roles]);
  const permissionCount = useMemo(() => new Set(roles.flatMap((role) => role.permissions.map((item) => item.permission))).size, [roles]);
  const isBusy = loading || busyAction !== null;

  useEffect(() => {
    void load(false);
  }, []);

  async function load(announce = true) {
    setLoading(true);
    if (announce) setMessage({ kind: 'info', text: 'Đang tải dữ liệu bảo mật...' });
    const [userResult, roleResult] = await Promise.allSettled([
      getJson<User[]>('/api/auth/users'),
      getJson<Role[]>('/api/auth/roles'),
    ]);
    const errors: string[] = [];
    let invalidSession = false;

    if (userResult.status === 'fulfilled') {
      const nextUsers = Array.isArray(userResult.value) ? userResult.value : [];
      setUsers(nextUsers);
      setCanManageUsers(true);
      setSelectedUserId((current) => reconcileSelection(current, nextUsers));
    } else {
      setUsers([]);
      setSelectedUserId('');
      setCanManageUsers(false);
      invalidSession ||= isUnauthorized(userResult.reason);
      errors.push(loadError('danh sách người dùng', 'auth.user.manage', userResult.reason));
    }

    if (roleResult.status === 'fulfilled') {
      const nextRoles = Array.isArray(roleResult.value) ? roleResult.value : [];
      setRoles(nextRoles);
      setCanManageRoles(true);
      setSelectedRoleId((current) => reconcileSelection(current, nextRoles));
    } else {
      setRoles([]);
      setSelectedRoleId('');
      setCanManageRoles(false);
      invalidSession ||= isUnauthorized(roleResult.reason);
      errors.push(loadError('danh sách vai trò', 'auth.role.manage', roleResult.reason));
    }

    setAuthState(invalidSession ? 'invalid' : 'ready');
    if (errors.length) {
      setMessage({ kind: 'error', text: errors.join(' ') });
    } else if (announce) {
      setMessage({ kind: 'success', text: 'Đã tải danh sách người dùng, vai trò và quyền.' });
    }
    setLoading(false);
    return errors;
  }

  async function createUser(formData: FormData) {
    return withValidation(async () => {
      const payload = userPayload(formData, roles, true);
      return send('/api/auth/users', 'POST', payload, 'createUser');
    });
  }

  async function updateUser(formData: FormData) {
    return withValidation(async () => {
      if (!selectedUser) throw new Error('Chưa chọn người dùng cần cập nhật.');
      const payload = userPayload(formData, roles, false);
      return send(`/api/auth/users/${selectedUser.id}`, 'PUT', payload, 'updateUser');
    });
  }

  async function createRole(formData: FormData) {
    return withValidation(async () => {
      const payload = rolePayload(formData, true);
      return send('/api/auth/roles', 'POST', payload, 'createRole');
    });
  }

  async function updateRole(formData: FormData) {
    return withValidation(async () => {
      if (!selectedRole) throw new Error('Chưa chọn vai trò cần cập nhật.');
      const payload = rolePayload(formData, false);
      return send(`/api/auth/roles/${selectedRole.id}`, 'PUT', payload, 'updateRole');
    });
  }

  async function changeOwnPassword(formData: FormData) {
    return withValidation(async () => {
      const currentPassword = requiredText(formData, 'currentPassword', 'mật khẩu hiện tại');
      const newPassword = validPassword(requiredText(formData, 'newPassword', 'mật khẩu mới'), 'Mật khẩu mới');
      if (currentPassword === newPassword) throw new Error('Mật khẩu mới phải khác mật khẩu hiện tại.');
      return send('/api/auth/change-password', 'POST', { currentPassword, newPassword }, 'changePassword');
    });
  }

  async function withValidation(action: () => Promise<boolean>) {
    try {
      return await action();
    } catch (error) {
      setMessage({ kind: 'error', text: validationError(error) });
      return false;
    }
  }

  async function send(path: string, method: 'POST' | 'PUT', payload: unknown, action: SecurityAction) {
    setBusyAction(action);
    setMessage({ kind: 'info', text: `Đang ${actionLabels[action].present}...` });
    try {
      const response = await fetch(`${browserApiBase()}${path}`, { method, credentials: 'include', headers: authHeaders(), body: JSON.stringify(payload) });
      const data = await readResponse(response);
      if (!response.ok) throw new ApiError(response.status, apiMessage(data, response.statusText));
      if (action === 'changePassword') {
        updateAuthSession(data);
        setAuthState('ready');
      }
      const reloadErrors = action === 'changePassword' ? [] : await load(false);
      setMessage(reloadErrors.length
        ? { kind: 'error', text: `${actionLabels[action].success} Tuy nhiên, không thể tải lại đầy đủ dữ liệu: ${reloadErrors.join(' ')}` }
        : { kind: 'success', text: actionLabels[action].success });
      return true;
    } catch (error) {
      if (isUnauthorized(error)) setAuthState('invalid');
      setMessage({ kind: 'error', text: `Không thể ${actionLabels[action].present}: ${actionError(error, action)}.` });
      return false;
    } finally {
      setBusyAction(null);
    }
  }

  function openModal(modal: Exclude<ActiveModal, null>, id?: string) {
    setMessage(null);
    if (modal === 'updateUser') setSelectedUserId((current) => id || reconcileSelection(current, users));
    if (modal === 'updateRole') setSelectedRoleId((current) => id || reconcileSelection(current, roles));
    setActiveModal(modal);
  }

  function closeModal() {
    setActiveModal(null);
  }

  return (
    <section className="workspace securityPage">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">Hệ thống</p>
          <h1>Người dùng, vai trò và phân quyền</h1>
        </div>
        <div className="pageHeaderActions">
          {message ? <span className="statusPill statusPillNeutral" role={message.kind === 'error' ? 'alert' : 'status'}>{message.text}</span> : null}
          <button type="button" disabled={!canManageUsers || isBusy} className="secondaryButton iconTextButton" onClick={() => openModal('createUser')}><Plus size={16} /> Tạo người dùng</button>
          <button type="button" disabled={!canManageRoles || isBusy} className="secondaryButton iconTextButton" onClick={() => openModal('createRole')}><ShieldCheck size={16} /> Tạo vai trò</button>
          <button type="button" disabled={authState !== 'ready' || isBusy} className="secondaryButton iconTextButton" onClick={() => openModal('password')}><KeyRound size={16} /> Đổi mật khẩu</button>
          <button type="button" disabled={loading} className="secondaryButton iconTextButton" onClick={() => void load()}><RefreshCcw size={16} /> {loading ? 'Đang tải...' : 'Tải lại'}</button>
        </div>
      </header>

      <section className="metrics securityMetrics">
        <Metric label="Người dùng" value={users.length} />
        <Metric label="Vai trò" value={roles.length} />
        <Metric label="Quyền hệ thống" value={permissionCount} />
        <Metric label="Trạng thái phiên" value={authStateLabel(authState)} />
      </section>

      <section className="panel securityList">
        <div className="sectionHeader">
          <h2>Danh sách người dùng</h2>
          <span>{users.length} người dùng</span>
        </div>
        <div className="fitTableWrap compactListTableWrap">
          <table className="securityTable compactListTable">
            <thead><tr><th>Người dùng</th><th>Liên hệ</th><th>Vai trò</th><th>Phạm vi dữ liệu</th><th>Đăng nhập gần nhất</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>
                    <strong><CellText text={user.name} /></strong>
                    <CellText text={`${user.username || 'Chưa có tên đăng nhập'} · ${user.email}`} />
                  </td>
                  <td><CellText text={userContactSummary(user)} title={userProfileTitle(user)} /></td>
                  <td><CellText text={user.roles.map((role) => viRoleCode(role.code)).join(', ')} fallback="Chưa gán vai trò" /></td>
                  <td><span className="statusPill" title={scopeLabel(user)}>{scopeLabel(user)}</span></td>
                  <td>{date(user.lastLoginAt)}</td>
                  <td><span className="statusPill">{viStatus(user.status)}</span></td>
                  <td><button type="button" disabled={!canManageUsers || isBusy} className="secondaryButton iconTextButton" onClick={() => openModal('updateUser', user.id)}><Pencil size={14} /> Sửa</button></td>
                </tr>
              ))}
              {users.length === 0 ? <tr><td colSpan={7} className="tableEmptyState">Không có người dùng hoặc bạn chưa có quyền xem danh sách.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel securityList">
        <div className="sectionHeader">
          <h2>Vai trò và quyền</h2>
          <span>{roles.length} vai trò</span>
        </div>
        <div className="fitTableWrap compactListTableWrap">
          <table className="securityTable compactListTable">
            <thead><tr><th>Vai trò</th><th>Mô tả</th><th>Người dùng</th><th>Phạm vi dữ liệu</th><th>Quyền</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
            <tbody>
              {roles.map((role) => (
                <tr key={role.id}>
                  <td>
                    <strong><CellText text={viRoleCode(role.code)} /></strong>
                    <CellText text={role.code} />
                  </td>
                  <td><CellText text={role.description || ''} fallback="Chưa có mô tả" /></td>
                  <td>{role._count?.users || 0}</td>
                  <td><span className="statusPill" title={roleScopeLabel(role)}>{roleScopeLabel(role)}</span></td>
                  <td><CellText text={permissionSummary(role)} title={permissionTitle(role)} /></td>
                  <td><span className="statusPill">{viStatus(role.status)}</span></td>
                  <td><button type="button" disabled={!canManageRoles || isBusy} className="secondaryButton iconTextButton" onClick={() => openModal('updateRole', role.id)}><Pencil size={14} /> Sửa</button></td>
                </tr>
              ))}
              {roles.length === 0 ? <tr><td colSpan={7} className="tableEmptyState">Không có vai trò hoặc bạn chưa có quyền xem danh sách.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      {activeModal === 'password' ? <PasswordModal busy={busyAction === 'changePassword'} onClose={closeModal} onSubmit={changeOwnPassword} /> : null}
      {activeModal === 'createUser' ? <UserModal key="create-user" mode="create" roles={activeRoles} busy={busyAction === 'createUser'} onClose={closeModal} onSubmit={createUser} /> : null}
      {activeModal === 'updateUser' && selectedUser ? <UserModal key={selectedUser.id} mode="update" user={selectedUser} users={users} roles={activeRoles} busy={busyAction === 'updateUser'} onSelectUser={setSelectedUserId} onClose={closeModal} onSubmit={updateUser} /> : null}
      {activeModal === 'createRole' ? <RoleModal key="create-role" mode="create" busy={busyAction === 'createRole'} onClose={closeModal} onSubmit={createRole} /> : null}
      {activeModal === 'updateRole' && selectedRole ? <RoleModal key={selectedRole.id} mode="update" role={selectedRole} roles={roles} busy={busyAction === 'updateRole'} onSelectRole={setSelectedRoleId} onClose={closeModal} onSubmit={updateRole} /> : null}
    </section>
  );
}

function SecurityModal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="modalOverlay" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className={`modalPanel${wide ? ' modalPanelWide' : ''}`}>
        <header>
          <h2>{title}</h2>
          <button type="button" className="secondaryButton iconButton" title="Đóng" aria-label="Đóng" onClick={onClose}><X size={16} /></button>
        </header>
        {children}
      </div>
    </div>
  );
}

function PasswordModal({ busy, onClose, onSubmit }: { busy: boolean; onClose: () => void; onSubmit: (formData: FormData) => Promise<boolean> }) {
  return (
    <SecurityModal title="Đổi mật khẩu của tôi" onClose={onClose}>
      <form action={async (formData) => { if (await onSubmit(formData)) onClose(); }} className="modalFormStack">
        <fieldset>
          <legend>Thông tin xác thực</legend>
          <label>Mật khẩu hiện tại<input name="currentPassword" type="password" required autoComplete="current-password" /></label>
          <label>Mật khẩu mới<input name="newPassword" type="password" required minLength={8} autoComplete="new-password" aria-describedby="password-policy" /></label>
          <small id="password-policy">Mật khẩu mới phải có ít nhất 8 ký tự và khác mật khẩu hiện tại.</small>
        </fieldset>
        <ModalActions busy={busy} busyText="Đang đổi..." submitText="Đổi mật khẩu" icon={<KeyRound size={16} />} onClose={onClose} />
      </form>
    </SecurityModal>
  );
}

function UserModal({
  mode,
  user,
  users = [],
  roles,
  busy,
  onSelectUser,
  onClose,
  onSubmit,
}: {
  mode: 'create' | 'update';
  user?: User;
  users?: User[];
  roles: Role[];
  busy: boolean;
  onSelectUser?: (id: string) => void;
  onClose: () => void;
  onSubmit: (formData: FormData) => Promise<boolean>;
}) {
  const creating = mode === 'create';
  return (
    <SecurityModal title={creating ? 'Tạo người dùng' : 'Cập nhật người dùng'} onClose={onClose} wide>
      <form action={async (formData) => { if (await onSubmit(formData)) onClose(); }} className="modalFormStack">
        {!creating ? (
          <fieldset>
            <legend>Người dùng đang chỉnh sửa</legend>
            <label>Chọn người dùng<select value={user?.id || ''} onChange={(event) => onSelectUser?.(event.target.value)}>{users.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.username || item.email}</option>)}</select></label>
          </fieldset>
        ) : null}
        <fieldset>
          <legend>Thông tin đăng nhập</legend>
          <div className="modalFormGrid">
            <label>Tên đăng nhập<input name="username" required defaultValue={user?.username || ''} placeholder="nguyen.van.a" autoComplete="username" /></label>
            <label>Email<input name="email" type="email" required readOnly={!creating} defaultValue={user?.email || ''} placeholder="user@company.com" autoComplete="email" /></label>
            <label>Họ và tên<input name="name" required defaultValue={user?.name || ''} autoComplete="name" /></label>
            <label>{creating ? 'Mật khẩu' : 'Mật khẩu mới'}<input name="password" type="password" required={creating} minLength={8} placeholder={creating ? 'Tối thiểu 8 ký tự' : 'Để trống nếu không đổi'} autoComplete="new-password" /></label>
            {!creating ? <label>Trạng thái<select name="status" defaultValue={user?.status || 'ACTIVE'}>{USER_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label> : null}
          </div>
        </fieldset>
        <fieldset>
          <legend>Hồ sơ nhân sự</legend>
          <div className="modalFormGrid">
            <label>Số điện thoại<input name="phone" defaultValue={user?.phone || ''} inputMode="tel" autoComplete="tel" /></label>
            <label>Giới tính<select name="gender" defaultValue={user?.gender || ''}><option value="">Chưa cập nhật</option><option value="Nam">Nam</option><option value="Nữ">Nữ</option><option value="Khác">Khác</option></select></label>
            <label>Ngày sinh<input name="dateOfBirth" type="date" defaultValue={dateInput(user?.dateOfBirth)} /></label>
            <label>CCCD/CMND<input name="identityNo" defaultValue={user?.identityNo || ''} /></label>
            <label>Hôn nhân<input name="maritalStatus" defaultValue={user?.maritalStatus || ''} /></label>
            <label>Quốc tịch<input name="nationality" defaultValue={user?.nationality || ''} /></label>
            <label>Dân tộc<input name="ethnicity" defaultValue={user?.ethnicity || ''} /></label>
            <label>Tôn giáo<input name="religion" defaultValue={user?.religion || ''} /></label>
            <label>Mã số thuế<input name="taxCode" defaultValue={user?.taxCode || ''} /></label>
            <label>Cấp bậc<input name="rank" defaultValue={user?.rank || ''} /></label>
            <label className="span2">Địa chỉ<input name="address" defaultValue={user?.address || ''} autoComplete="street-address" /></label>
          </div>
        </fieldset>
        <fieldset>
          <legend>Thông tin ngân hàng</legend>
          <div className="modalFormGrid">
            <label>Số tài khoản<input name="bankAccountNumber" defaultValue={user?.bankAccountNumber || ''} inputMode="numeric" /></label>
            <label>Tên tài khoản<input name="bankAccountName" defaultValue={user?.bankAccountName || ''} /></label>
            <label className="span2">Tên ngân hàng<input name="bankName" defaultValue={user?.bankName || ''} /></label>
          </div>
        </fieldset>
        <fieldset>
          <legend>Vai trò và phạm vi dữ liệu</legend>
          <div className="modalFormGrid">
            <label>Chi nhánh<input name="branch" defaultValue={user?.branch || ''} placeholder="Bắt buộc nếu vai trò theo chi nhánh" /></label>
            <label>Phòng ban<input name="department" defaultValue={user?.department || ''} placeholder="Bắt buộc nếu vai trò theo phòng ban" /></label>
            <label className="span2">Vai trò<select name="roleCodes" multiple required size={Math.min(8, Math.max(4, roles.length))} defaultValue={user?.roles.map((role) => role.code) || []}>{roles.map((role) => <option key={role.code} value={role.code}>{viRoleCode(role.code)} · {role.code}</option>)}</select></label>
          </div>
        </fieldset>
        <ModalActions busy={busy} busyText={creating ? 'Đang tạo...' : 'Đang lưu...'} submitText={creating ? 'Tạo người dùng' : 'Lưu người dùng'} icon={creating ? <UserCog size={16} /> : <CheckCircle2 size={16} />} onClose={onClose} />
      </form>
    </SecurityModal>
  );
}

function RoleModal({
  mode,
  role,
  roles = [],
  busy,
  onSelectRole,
  onClose,
  onSubmit,
}: {
  mode: 'create' | 'update';
  role?: Role;
  roles?: Role[];
  busy: boolean;
  onSelectRole?: (id: string) => void;
  onClose: () => void;
  onSubmit: (formData: FormData) => Promise<boolean>;
}) {
  const creating = mode === 'create';
  return (
    <SecurityModal title={creating ? 'Tạo vai trò' : 'Cập nhật vai trò'} onClose={onClose} wide>
      <form action={async (formData) => { if (await onSubmit(formData)) onClose(); }} className="modalFormStack">
        {!creating ? (
          <fieldset>
            <legend>Vai trò đang chỉnh sửa</legend>
            <label>Chọn vai trò<select value={role?.id || ''} onChange={(event) => onSelectRole?.(event.target.value)}>{roles.map((item) => <option key={item.id} value={item.id}>{viRoleCode(item.code)} · {item.code}</option>)}</select></label>
          </fieldset>
        ) : null}
        <fieldset>
          <legend>Thông tin vai trò</legend>
          <div className="modalFormGrid">
            <label>Mã vai trò<input name="code" required={creating} readOnly={!creating} defaultValue={role?.code || ''} placeholder="finance_manager" /></label>
            <label>Tên vai trò<input name="name" required defaultValue={role?.name || ''} /></label>
            {!creating ? <label>Trạng thái<select name="status" defaultValue={role?.status || 'ACTIVE'}>{ROLE_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label> : null}
            <label className="span2">Mô tả<textarea name="description" rows={3} defaultValue={role?.description || ''} /></label>
          </div>
        </fieldset>
        <fieldset>
          <legend>Danh sách quyền</legend>
          <label>Mỗi quyền một dòng<textarea name="permissions" required rows={12} defaultValue={permissionsText(role)} placeholder={commonPermissions.join('\n')} /></label>
          <PermissionReference />
        </fieldset>
        <ModalActions busy={busy} busyText={creating ? 'Đang tạo...' : 'Đang lưu...'} submitText={creating ? 'Tạo vai trò' : 'Lưu vai trò'} icon={creating ? <ShieldCheck size={16} /> : <CheckCircle2 size={16} />} onClose={onClose} />
      </form>
    </SecurityModal>
  );
}

function PermissionReference() {
  return (
    <details>
      <summary>Danh mục quyền tham khảo theo nhóm</summary>
      {commonPermissionGroups.map((group) => (
        <section key={group.label}>
          <h3>{group.label}</h3>
          <div className="permissionChips">{group.permissions.map((permission) => <span key={permission} title={permission}>{viPermission(permission)}</span>)}</div>
        </section>
      ))}
    </details>
  );
}

function ModalActions({ busy, busyText, submitText, icon, onClose }: { busy: boolean; busyText: string; submitText: string; icon: ReactNode; onClose: () => void }) {
  return (
    <div className="modalActions">
      <button type="button" disabled={busy} className="secondaryButton" onClick={onClose}>Hủy</button>
      <button type="submit" disabled={busy}>{icon} {busy ? busyText : submitText}</button>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <article className="metric"><span>{label}</span><strong>{value}</strong></article>;
}

function CellText({ text, fallback = '-', title }: { text: string; fallback?: string; title?: string }) {
  const value = text.trim() || fallback;
  const tooltip = title || value;
  return <span className="cellClamp" title={tooltip}>{value}</span>;
}

function userPayload(formData: FormData, roles: Role[], creating: boolean) {
  const username = validUsername(requiredText(formData, 'username', 'tên đăng nhập'));
  const email = validEmail(requiredText(formData, 'email', 'email'));
  const name = requiredText(formData, 'name', 'họ và tên');
  const password = cleanText(formData.get('password'));
  const branch = cleanText(formData.get('branch'));
  const department = cleanText(formData.get('department'));
  const profile = userProfilePayload(formData);
  const roleCodes = values(formData, 'roleCodes');
  validateRoleCodes(roleCodes, roles);
  validateDataScope(roleCodes, roles, branch, department);
  if (creating && !password) throw new Error('Cần nhập mật khẩu.');
  if (password) validPassword(password, creating ? 'Mật khẩu' : 'Mật khẩu mới');
  const status = creating ? undefined : validStatus(requiredText(formData, 'status', 'trạng thái người dùng'), USER_STATUS_OPTIONS, 'Trạng thái người dùng');
  return {
    username,
    ...(creating ? { email } : {}),
    name,
    ...profile,
    branch,
    department,
    roleCodes,
    ...(status ? { status } : {}),
    ...(password ? { password } : {}),
  };
}

function userProfilePayload(formData: FormData) {
  return {
    phone: cleanText(formData.get('phone')),
    gender: cleanText(formData.get('gender')),
    dateOfBirth: cleanText(formData.get('dateOfBirth')),
    address: cleanText(formData.get('address')),
    identityNo: cleanText(formData.get('identityNo')),
    maritalStatus: cleanText(formData.get('maritalStatus')),
    nationality: cleanText(formData.get('nationality')),
    ethnicity: cleanText(formData.get('ethnicity')),
    religion: cleanText(formData.get('religion')),
    taxCode: cleanText(formData.get('taxCode')),
    rank: cleanText(formData.get('rank')),
    bankAccountNumber: cleanText(formData.get('bankAccountNumber')),
    bankAccountName: cleanText(formData.get('bankAccountName')),
    bankName: cleanText(formData.get('bankName')),
  };
}

function rolePayload(formData: FormData, creating: boolean) {
  const code = creating ? validRoleCode(requiredText(formData, 'code', 'mã vai trò')) : undefined;
  const name = requiredText(formData, 'name', 'tên vai trò');
  const permissions = validatePermissions(splitLines(cleanText(formData.get('permissions'))));
  if (!permissions.length) throw new Error('Vai trò phải có ít nhất một quyền.');
  const status = creating ? undefined : validStatus(requiredText(formData, 'status', 'trạng thái vai trò'), ROLE_STATUS_OPTIONS, 'Trạng thái vai trò');
  return {
    ...(code ? { code } : {}),
    name,
    description: cleanText(formData.get('description')),
    ...(status ? { status } : {}),
    permissions,
  };
}

function validateRoleCodes(roleCodes: string[], roles: Role[]) {
  if (!roleCodes.length) throw new Error('Người dùng phải có ít nhất một vai trò.');
  const available = new Set(roles.filter((role) => role.status === 'ACTIVE').map((role) => role.code));
  const invalid = roleCodes.filter((code) => !available.has(code));
  if (invalid.length) throw new Error(`Vai trò không hợp lệ hoặc đã ngừng hoạt động: ${invalid.join(', ')}.`);
}

function validateDataScope(roleCodes: string[], roles: Role[], branch: string, department: string) {
  const selectedPermissions = new Set(
    roles.filter((role) => roleCodes.includes(role.code)).flatMap((role) => role.permissions.map((item) => item.permission)),
  );
  if (selectedPermissions.has('*') || selectedPermissions.has('data.scope.all')) return;
  if (selectedPermissions.has('data.scope.branch') && !branch) throw new Error('Cần nhập chi nhánh cho vai trò có phạm vi theo chi nhánh.');
  if (selectedPermissions.has('data.scope.department') && !department) throw new Error('Cần nhập phòng ban cho vai trò có phạm vi theo phòng ban.');
}

function userContactSummary(user: User) {
  return [user.phone, user.rank, user.address].map((item) => item?.trim()).filter(Boolean).join(' · ') || 'Chưa cập nhật liên hệ';
}

function userProfileTitle(user: User) {
  return [
    `SĐT: ${user.phone || '-'}`,
    `Giới tính: ${user.gender || '-'}`,
    `Ngày sinh: ${dateOnly(user.dateOfBirth)}`,
    `CCCD/CMND: ${user.identityNo || '-'}`,
    `Hôn nhân: ${user.maritalStatus || '-'}`,
    `Quốc tịch: ${user.nationality || '-'}`,
    `Dân tộc: ${user.ethnicity || '-'}`,
    `Tôn giáo: ${user.religion || '-'}`,
    `Mã số thuế: ${user.taxCode || '-'}`,
    `Cấp bậc: ${user.rank || '-'}`,
    `Địa chỉ: ${user.address || '-'}`,
    `Ngân hàng: ${[user.bankAccountNumber, user.bankAccountName, user.bankName].map((item) => item?.trim()).filter(Boolean).join(' · ') || '-'}`,
  ].join('\n');
}

function scopeLabel(user: User) {
  const permissions = new Set(user.permissions);
  if (permissions.has('*') || permissions.has('data.scope.all') || user.dataScope === 'all') return 'Toàn bộ dữ liệu hệ thống';
  const scopes: string[] = [];
  if (permissions.has('data.scope.branch') || user.dataScope === 'branch') scopes.push(user.branch ? `Theo chi nhánh: ${user.branch}` : 'Thiếu chi nhánh được phân công');
  if (permissions.has('data.scope.department') || user.dataScope === 'department') scopes.push(user.department ? `Theo phòng ban: ${user.department}` : 'Thiếu phòng ban được phân công');
  return scopes.join(' · ') || 'Chưa có phạm vi dữ liệu nghiệp vụ';
}

function roleScopeLabel(role: Role) {
  const permissions = new Set(role.permissions.map((item) => item.permission));
  if (permissions.has('*') || permissions.has('data.scope.all')) return 'Toàn bộ dữ liệu hệ thống';
  const scopes: string[] = [];
  if (permissions.has('data.scope.branch')) scopes.push('Theo chi nhánh người dùng');
  if (permissions.has('data.scope.department')) scopes.push('Theo phòng ban người dùng');
  return scopes.join(' · ') || 'Chưa có phạm vi dữ liệu nghiệp vụ';
}

function authStateLabel(state: AuthState) {
  if (state === 'ready') return 'Phiên hợp lệ';
  if (state === 'missing') return 'Chưa có phiên';
  if (state === 'invalid') return 'Phiên hết hạn';
  return 'Đang kiểm tra phiên';
}

function permissionSummary(role: Role) {
  const permissions = role.permissions.map((item) => item.permission).filter(Boolean);
  if (!permissions.length) return 'Chưa có quyền';
  if (permissions.includes('*')) return 'Toàn quyền hệ thống';
  return `${permissions.length} quyền`;
}

function permissionTitle(role: Role) {
  const permissions = role.permissions.map((item) => item.permission).filter(Boolean).sort();
  return permissions.map((permission) => `${viPermission(permission)} (${permission})`).join('\n') || 'Chưa có quyền';
}

function reconcileSelection<T extends { id: string }>(current: string, rows: T[]) {
  return rows.some((row) => row.id === current) ? current : rows[0]?.id || '';
}

function permissionsText(role?: Role) {
  return role?.permissions.map((item) => item.permission).filter(Boolean).sort().join('\n') || '';
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${browserApiBase()}${path}`, { cache: 'no-store', credentials: 'include', headers: authHeaders() });
  const data = await readResponse(response);
  if (!response.ok) throw new ApiError(response.status, apiMessage(data, response.statusText));
  return data as T;
}

function browserApiBase() {
  const apiBase = (process.env.NEXT_PUBLIC_API_URL || '').trim().replace(/\/+$/, '');
  if (typeof window === 'undefined') return apiBase;
  if (!apiBase || apiBase.includes('smarttour-api-1')) return '';
  return apiBase;
}

function authHeaders() {
  return { Accept: 'application/json', 'Content-Type': 'application/json' };
}

async function readResponse(response: Response) {
  return response.json().catch(() => ({}));
}

function updateAuthSession(data: unknown) {
  if (!data || typeof data !== 'object') return;
  const user = 'user' in data ? data.user : null;
  if (user && typeof user === 'object') {
    window.localStorage.setItem('smarttour.auth.user', JSON.stringify(user));
  }
}

function apiMessage(data: unknown, fallback: string) {
  if (data && typeof data === 'object' && 'message' in data) {
    const message = (data as { message?: unknown }).message;
    if (Array.isArray(message)) return message.map(String).join(', ');
    if (message) return String(message);
  }
  return fallback || 'Lỗi không xác định';
}

function loadError(label: string, permission: string, error: unknown) {
  if (error instanceof ApiError && error.status === 401) return `Không tải được ${label}: phiên đăng nhập không hợp lệ hoặc đã hết hạn.`;
  if (error instanceof ApiError && error.status === 403) return `Không tải được ${label}: tài khoản thiếu quyền ${viPermission(permission)} (${permission}).`;
  return `Không tải được ${label}: ${errorText(error)}.`;
}

function actionError(error: unknown, action?: SecurityAction) {
  if (action === 'changePassword' && error instanceof ApiError && error.status === 401) return 'Mật khẩu hiện tại không đúng hoặc phiên đăng nhập đã hết hạn';
  if (action === 'changePassword' && error instanceof ApiError && error.status === 400) return `Mật khẩu mới chưa đạt chính sách: ${error.message.replace(/[.]$/, '')}`;
  if (error instanceof ApiError && error.status === 401) return 'phiên đăng nhập không hợp lệ hoặc đã hết hạn';
  if (error instanceof ApiError && error.status === 403) return 'tài khoản không có quyền thực hiện thao tác này';
  return errorText(error).replace(/[.]$/, '');
}

function validationError(error: unknown) {
  return `Dữ liệu chưa hợp lệ: ${errorText(error).replace(/[.]$/, '')}.`;
}

function isUnauthorized(error: unknown) {
  return error instanceof ApiError && error.status === 401;
}

class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

function values(formData: FormData, key: string) {
  return [...new Set(formData.getAll(key).map((item) => String(item).trim()).filter(Boolean))];
}

function splitLines(value: string) {
  return [...new Set(value.split(/[\r\n,;]+/).map((item) => item.trim()).filter(Boolean))];
}

function requiredText(formData: FormData, key: string, label: string) {
  const value = cleanText(formData.get(key));
  if (!value) throw new Error(`Cần nhập ${label}.`);
  return value;
}

function cleanText(value: FormDataEntryValue | null) {
  return typeof value === 'string' ? value.trim() : '';
}

function validUsername(value: string) {
  const username = value.toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{2,49}$/.test(username)) throw new Error('Tên đăng nhập phải dài 3-50 ký tự, bắt đầu bằng chữ hoặc số và chỉ gồm chữ thường không dấu, số, dấu chấm, gạch dưới hoặc gạch ngang.');
  return username;
}

function validEmail(value: string) {
  const email = value.toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Email không đúng định dạng.');
  return email;
}

function validPassword(value: string, label: string) {
  if (value.length < 8) throw new Error(`${label} phải có ít nhất 8 ký tự.`);
  if (value.length > 128) throw new Error(`${label} không được vượt quá 128 ký tự.`);
  return value;
}

function validRoleCode(value: string) {
  const code = value.toLowerCase();
  if (!/^[a-z][a-z0-9._-]{2,63}$/.test(code)) throw new Error('Mã vai trò phải dài 3-64 ký tự, bắt đầu bằng chữ thường và chỉ gồm chữ thường, số, dấu chấm, gạch dưới hoặc gạch ngang.');
  return code;
}

function validStatus<T extends readonly { value: string }[]>(value: string, options: T, label: string) {
  const status = value.toUpperCase();
  if (!options.some((option) => option.value === status)) throw new Error(`${label} không hợp lệ: ${status}.`);
  return status;
}

function validatePermissions(permissions: string[]) {
  const invalid = permissions.filter((permission) => permission !== '*' && !/^[a-z][a-z0-9_-]*(?:\.[a-z0-9_*_-]+)+$/.test(permission));
  if (invalid.length) throw new Error(`Quyền không hợp lệ: ${invalid.join(', ')}.`);
  return permissions;
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error || 'Lỗi không xác định');
}

function date(value?: string) {
  return value ? new Date(value).toLocaleString('vi-VN') : 'Chưa đăng nhập';
}

function dateOnly(value?: string | null) {
  if (!value) return '-';
  const isoDate = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoDate) return `${isoDate[3]}/${isoDate[2]}/${isoDate[1]}`;
  return new Date(value).toLocaleDateString('vi-VN');
}

function dateInput(value?: string | null) {
  if (!value) return '';
  const isoDate = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return isoDate ? `${isoDate[1]}-${isoDate[2]}-${isoDate[3]}` : '';
}

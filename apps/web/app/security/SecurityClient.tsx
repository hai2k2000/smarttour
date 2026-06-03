'use client';

import { CheckCircle2, KeyRound, Plus, RefreshCcw, Save, ShieldCheck, UserCog } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { viPermission, viRoleCode, viStatus } from '../i18n';
const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

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
  status: string;
  branch?: string;
  department?: string;
  dataScope?: 'all' | 'branch' | 'department' | 'none';
  lastLoginAt?: string;
  roles: { code: string; name: string }[];
  permissions: string[];
};

const commonQuyền = [
  '*',
  'auth.user.manage',
  'auth.role.manage',
  'data.scope.all',
  'data.scope.branch',
  'data.scope.department',
  'booking.view',
  'booking.manage',
  'tour.view',
  'tour.manage',
  'tour.export',
  'guide.view',
  'guide.manage',
  'supplier.view',
  'supplier.manage',
  'order.view',
  'order.manage',
  'quote.view',
  'quote.manage',
  'quotation.view',
  'quotation.manage',
  'customer.view',
  'customer.manage',
  'commission.view',
  'commission.manage',
  'report.view',
  'report.export',
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
  'operation.form.view',
  'operation.form.manage',
  'operation.payment-request.view',
  'operation.payment-request.create',
  'operation.payment-request.approve',
];

export default function SecurityClient() {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [message, setMessage] = useState('');
  const [tokenReady, setTokenReady] = useState(false);

  const selectedUser = users.find((user) => user.id === selectedUserId);
  const selectedRole = roles.find((role) => role.id === selectedRoleId);
  const roleCodes = useMemo(() => roles.map((role) => role.code), [roles]);

  useEffect(() => {
    setTokenReady(Boolean(authToken()));
    void load();
  }, []);

  async function load() {
    setMessage('');
    const [userData, roleData] = await Promise.all([getJson('/api/auth/users'), getJson('/api/auth/roles')]);
    if (userData.error || roleData.error) {
      setMessage('Can dang nhap tai khoan co quyen auth.user.manage/auth.role.manage');
      return;
    }
    setUsers(Array.isArray(userData) ? userData : []);
    setRoles(Array.isArray(roleData) ? roleData : []);
    setSelectedUserId((current) => current || userData?.[0]?.id || '');
    setSelectedRoleId((current) => current || roleData?.[0]?.id || '');
  }

  async function createUser(formData: FormData) {
    const payload = {
      username: text(formData.get('username')),
      email: text(formData.get('email')),
      name: text(formData.get('name')),
      password: text(formData.get('password')),
      branch: text(formData.get('branch')),
      department: text(formData.get('department')),
      roleCodes: values(formData, 'roleCodes'),
    };
    await post('/api/auth/users', payload);
  }

  async function updateUser(formData: FormData) {
    if (!selectedUser) return;
    const password = text(formData.get('password'));
    await put(`/api/auth/users/${selectedUser.id}`, {
      username: text(formData.get('username')),
      name: text(formData.get('name')) || selectedUser.name,
      status: text(formData.get('status')) || selectedUser.status,
      branch: text(formData.get('branch')),
      department: text(formData.get('department')),
      roleCodes: values(formData, 'roleCodes'),
      ...(password ? { password } : {}),
    });
  }

  async function createRole(formData: FormData) {
    await post('/api/auth/roles', {
      code: text(formData.get('code')),
      name: text(formData.get('name')),
      description: text(formData.get('description')),
      permissions: splitLines(text(formData.get('permissions'))),
    });
  }

  async function updateRole(formData: FormData) {
    if (!selectedRole) return;
    await put(`/api/auth/roles/${selectedRole.id}`, {
      name: text(formData.get('name')) || selectedRole.name,
      description: text(formData.get('description')),
      status: text(formData.get('status')) || selectedRole.status,
      permissions: splitLines(text(formData.get('permissions'))),
    });
  }

  async function changeOwnPassword(formData: FormData) {
    const currentPassword = text(formData.get('currentPassword'));
    const newPassword = text(formData.get('newPassword'));
    if (newPassword.length < 8) {
      setMessage('Mật khẩu mới can it nhat 8 ky tu');
      return;
    }
    await post('/api/auth/change-password', { currentPassword, newPassword });
  }

  async function post(path: string, payload: unknown) {
    await send(path, 'POST', payload);
  }

  async function put(path: string, payload: unknown) {
    await send(path, 'PUT', payload);
  }

  async function send(path: string, method: string, payload: unknown) {
    setMessage('');
    const response = await fetch(`${API_URL}${path}`, { method, headers: authHeaders(), body: JSON.stringify(payload) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(Array.isArray(data.message) ? data.message.join(', ') : data.message || 'Không cập nhật được');
      return;
    }
    setMessage('Đã cập nhật phân quyền');
    await load();
  }

  return (
    <section className="workspace securityPage">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">Hệ thống</p>
          <h1>Người dùng, vai trò và quyền</h1>
        </div>
        <div className="pageHeaderActions">
          {message ? <span className="statusPill statusPillNeutral">{message}</span> : null}
          <button className="secondaryButton iconTextButton" onClick={load}><RefreshCcw size={16} /> Tải lại</button>
        </div>
      </header>

      <section className="metrics securityMetrics">
        <Metric label="Người dùng" value={users.length} />
        <Metric label="Vai trò" value={roles.length} />
        <Metric label="Quyền" value={new Set(roles.flatMap((role) => role.permissions.map((item) => item.permission))).size} />
        <Metric label="Token" value={tokenReady ? 'Sẵn sàng' : 'Chưa có'} />
      </section>

      <section className="contentGrid securityGrid">
        <div className="panel securityFormPanel">
          <h2><KeyRound size={18} /> Đổi mật khẩu của tôi</h2>
          <form action={changeOwnPassword} className="formGrid">
            <label>Mật khẩu hiện tại<input name="currentPassword" type="password" required /></label>
            <label>Mật khẩu mới<input name="newPassword" type="password" required minLength={8} /></label>
            <button type="submit"><KeyRound size={16} /> Đổi mật khẩu</button>
          </form>

          <h2><Plus size={18} /> Tạo user</h2>
          <form action={createUser} className="formGrid">
            <label>Tên đăng nhập<input name="username" required placeholder="admin" /></label>
            <label>Email<input name="email" type="email" required placeholder="user@company.com" /></label>
            <label>Họ tên<input name="name" required /></label>
            <label>Mật khẩu<input name="password" type="password" required minLength={8} /></label>
            <label>Chi nhánh<input name="branch" /></label>
            <label>Phòng ban<input name="department" /></label>
            <label>Vai trò<select name="roleCodes" multiple size={Math.min(6, Math.max(3, roleCodes.length))}>{roleCodes.map((code) => <option key={code} value={code}>{viRoleCode(code)}</option>)}</select></label>
            <button type="submit"><UserCog size={16} /> Tạo user</button>
          </form>

          <h2><Save size={18} /> Cập nhật user</h2>
          <form action={updateUser} className="formGrid">
            <label>User<select value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)}><option value="">Chọn user</option>{users.map((user) => <option key={user.id} value={user.id}>{user.username || user.email}</option>)}</select></label>
            <label>Tên đăng nhập<input name="username" defaultValue={selectedUser?.username || ''} /></label>
            <label>Họ tên<input name="name" defaultValue={selectedUser?.name || ''} /></label>
            <label>Trạng thái<select name="status" defaultValue={selectedUser?.status || 'ACTIVE'}><option value="ACTIVE">Đang hoạt động</option><option value="INACTIVE">Ngừng hoạt động</option><option value="LOCKED">Đã khóa</option></select></label>
            <label>Mật khẩu mới<input name="password" type="password" minLength={8} placeholder="Để trống nếu không đổi" /></label>
            <label>Chi nhánh<input name="branch" defaultValue={selectedUser?.branch || ''} /></label>
            <label>Phòng ban<input name="department" defaultValue={selectedUser?.department || ''} /></label>
            <label>Vai trò<select name="roleCodes" multiple size={Math.min(6, Math.max(3, roleCodes.length))} defaultValue={selectedUser?.roles.map((role) => role.code) || []}>{roleCodes.map((code) => <option key={code} value={code}>{viRoleCode(code)}</option>)}</select></label>
            <button type="submit"><KeyRound size={16} /> Lưu user</button>
          </form>
        </div>

        <section className="panel securityList">
          <div className="sectionHeader"><h2>Danh sach user</h2><span>{users.length} dong</span></div>
          <div className="fitTableWrap">
            <table className="securityTable">
              <thead><tr><th>User</th><th>Email</th><th>Tên</th><th>Role</th><th>Data scope</th><th>Chi nhánh</th><th>Phòng ban</th><th>Login gần nhất</th><th>Trạng thái</th></tr></thead>
              <tbody>{users.map((user) => <tr key={user.id}><td><strong>{user.username || '-'}</strong></td><td>{user.email}</td><td>{user.name}</td><td>{user.roles.map((role) => viRoleCode(role.code)).join(', ') || '-'}</td><td><span className="statusPill">{scopeLabel(user)}</span></td><td>{user.branch || '-'}</td><td>{user.department || '-'}</td><td>{date(user.lastLoginAt)}</td><td><span className="statusPill">{viStatus(user.status)}</span></td></tr>)}</tbody>
            </table>
          </div>
        </section>
      </section>

      <section className="contentGrid securityGrid">
        <div className="panel securityFormPanel">
          <h2><Plus size={18} /> Tạo role</h2>
          <form action={createRole} className="formGrid">
            <label>Code<input name="code" required placeholder="finance_manager" /></label>
            <label>Ten role<input name="name" required /></label>
            <label>Mo ta<textarea name="description" rows={3} /></label>
            <label>Quyền<textarea name="permissions" rows={8} placeholder={commonQuyền.join('\n')} /></label>
            <button type="submit"><ShieldCheck size={16} /> Tạo role</button>
          </form>

          <h2><Save size={18} /> Cap nhat role</h2>
          <form action={updateRole} className="formGrid">
            <label>Role<select value={selectedRoleId} onChange={(event) => setSelectedRoleId(event.target.value)}><option value="">Chọn role</option>{roles.map((role) => <option key={role.id} value={role.id}>{role.code}</option>)}</select></label>
            <label>Ten role<input name="name" defaultValue={selectedRole?.name || ''} /></label>
            <label>Trạng thái<select name="status" defaultValue={selectedRole?.status || 'ACTIVE'}><option>ACTIVE</option><option>INACTIVE</option></select></label>
            <label>Mo ta<textarea name="description" rows={3} defaultValue={selectedRole?.description || ''} /></label>
            <label>Quyền<textarea name="permissions" rows={10} defaultValue={selectedRole?.permissions.map((item) => item.permission).join('\n') || ''} /></label>
            <button type="submit"><CheckCircle2 size={16} /> Lưu role</button>
          </form>
        </div>

        <section className="panel securityList">
          <div className="sectionHeader"><h2>Vai trò & permissions</h2><span>{roles.length} dong</span></div>
          <div className="fitTableWrap">
            <table className="securityTable">
              <thead><tr><th>Role</th><th>Mo ta</th><th>Users</th><th>Data scope</th><th>Quyền</th><th>Trạng thái</th></tr></thead>
              <tbody>{roles.map((role) => <tr key={role.id}><td><strong>{role.code}</strong><span>{role.name}</span></td><td>{role.description || '-'}</td><td>{role._count?.users || 0}</td><td><span className="statusPill">{roleScopeLabel(role)}</span></td><td><div className="permissionChips">{role.permissions.map((item) => <span key={item.id}>{viPermission(item.permission)}</span>)}</div></td><td><span className="statusPill">{viStatus(role.status)}</span></td></tr>)}</tbody>
            </table>
          </div>
        </section>
      </section>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <article className="metric"><span>{label}</span><strong>{value}</strong></article>;
}

function scopeLabel(user: User) {
  if (user.dataScope) return user.dataScope;
  if (user.permissions.includes('*') || user.permissions.includes('data.scope.all')) return 'all';
  if (user.permissions.includes('data.scope.branch')) return 'branch';
  if (user.permissions.includes('data.scope.department')) return 'department';
  return 'none';
}

function roleScopeLabel(role: Role) {
  const permissions = role.permissions.map((item) => item.permission);
  if (permissions.includes('*') || permissions.includes('data.scope.all')) return 'all';
  if (permissions.includes('data.scope.branch')) return 'branch';
  if (permissions.includes('data.scope.department')) return 'department';
  return 'none';
}

async function getJson(path: string) {
  const response = await fetch(`${API_URL}${path}`, { cache: 'no-store', headers: authHeaders() });
  const data = await response.json().catch(() => ({}));
  return response.ok ? data : { ...data, error: true };
}

function authToken() {
  return typeof window !== 'undefined' ? window.localStorage.getItem('smarttour.auth.token') : null;
}

function authHeaders() {
  const token = authToken();
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

function values(formData: FormData, key: string) {
  return formData.getAll(key).map((item) => String(item).trim()).filter(Boolean);
}

function splitLines(value: string) {
  return value.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean);
}

function text(value: FormDataEntryValue | null) {
  return typeof value === 'string' ? value : '';
}

function date(value?: string) {
  return value ? new Date(value).toLocaleString('vi-VN') : '-';
}

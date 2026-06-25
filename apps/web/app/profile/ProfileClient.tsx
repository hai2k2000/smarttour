'use client';

import { AlertCircle, CheckCircle2, KeyRound, Mail, ShieldCheck, UserCircle } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { toStoredAuthUser } from '../usePermissions';

type ProfileUser = {
  id?: string;
  username?: string;
  email?: string;
  name?: string;
  fullName?: string;
  displayName?: string;
  status?: string;
  dataScope?: string;
  branch?: string | null;
  department?: string | null;
  roles?: { code: string; name: string }[];
  permissions?: string[];
};

type Notice = { kind: 'success' | 'error' | 'info'; text: string } | null;

export default function ProfileClient() {
  const [user, setUser] = useState<ProfileUser | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    async function loadProfile() {
      try {
        const nextUser = await getJson<ProfileUser>('/api/auth/me', controller.signal);
        setUser(nextUser);
        updateAuthSession({ user: nextUser });
      } catch (error) {
        setNotice({ kind: 'error', text: apiErrorText(error, 'Không tải được hồ sơ tài khoản.') });
      } finally {
        setLoading(false);
      }
    }
    void loadProfile();
    return () => controller.abort();
  }, []);

  const permissionSummary = useMemo(() => {
    const permissions = user?.permissions || [];
    if (permissions.includes('*')) return 'Toàn quyền hệ thống';
    return `${permissions.length} quyền được gán`;
  }, [user?.permissions]);

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const currentPassword = cleanText(form.get('currentPassword'));
    const newPassword = cleanText(form.get('newPassword'));
    const confirmPassword = cleanText(form.get('confirmPassword'));
    if (!currentPassword) return setNotice({ kind: 'error', text: 'Cần nhập mật khẩu hiện tại.' });
    if (newPassword.length < 8) return setNotice({ kind: 'error', text: 'Mật khẩu mới phải có ít nhất 8 ký tự.' });
    if (currentPassword === newPassword) return setNotice({ kind: 'error', text: 'Mật khẩu mới phải khác mật khẩu hiện tại.' });
    if (newPassword !== confirmPassword) return setNotice({ kind: 'error', text: 'Xác nhận mật khẩu mới chưa khớp.' });

    setBusy(true);
    setNotice({ kind: 'info', text: 'Đang đổi mật khẩu...' });
    try {
      const data = await postJson('/api/auth/change-password', { currentPassword, newPassword });
      updateAuthSession(data);
      event.currentTarget.reset();
      setNotice({ kind: 'success', text: 'Đã đổi mật khẩu. Phiên đăng nhập hiện tại đã được làm mới.' });
      const nextUser = await getJson<ProfileUser>('/api/auth/me');
      setUser(nextUser);
      updateAuthSession({ user: nextUser });
    } catch (error) {
      setNotice({ kind: 'error', text: apiErrorText(error, 'Không đổi được mật khẩu.') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="workspace profilePage">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">Tài khoản</p>
          <h1>Hồ sơ cá nhân</h1>
        </div>
        {notice ? <span className={`statusPill ${notice.kind === 'error' ? 'statusPillDanger' : 'statusPillNeutral'}`} role={notice.kind === 'error' ? 'alert' : 'status'}>{notice.text}</span> : null}
      </header>

      <div className="profileGrid">
        <section className="panel profileIdentityPanel">
          <div className="sectionHeader">
            <h2>Thông tin tài khoản</h2>
            <span>{loading ? 'Đang tải...' : user?.status || 'ACTIVE'}</span>
          </div>
          <div className="profileIdentityCard">
            <span className="profileAvatar"><UserCircle size={34} /></span>
            <div>
              <strong>{displayName(user)}</strong>
              <span><Mail size={14} /> {user?.email || 'Chưa có email'}</span>
              <span><ShieldCheck size={14} /> {permissionSummary}</span>
            </div>
          </div>
          <dl className="profileDetails">
            <div><dt>Tên đăng nhập</dt><dd>{user?.username || '-'}</dd></div>
            <div><dt>Vai trò</dt><dd>{user?.roles?.map((role) => role.name || role.code).join(', ') || '-'}</dd></div>
            <div><dt>Phạm vi dữ liệu</dt><dd>{user?.dataScope || 'Theo quyền'}</dd></div>
            <div><dt>Chi nhánh</dt><dd>{user?.branch || '-'}</dd></div>
            <div><dt>Phòng ban</dt><dd>{user?.department || '-'}</dd></div>
          </dl>
        </section>

        <section className="panel profilePasswordPanel">
          <div className="sectionHeader">
            <h2>Đổi mật khẩu</h2>
            <span>Bảo mật phiên đăng nhập</span>
          </div>
          <form onSubmit={submitPassword} className="profilePasswordForm">
            <label>Mật khẩu hiện tại<input name="currentPassword" type="password" required autoComplete="current-password" /></label>
            <label>Mật khẩu mới<input name="newPassword" type="password" required minLength={8} autoComplete="new-password" /></label>
            <label>Xác nhận mật khẩu mới<input name="confirmPassword" type="password" required minLength={8} autoComplete="new-password" /></label>
            <p><AlertCircle size={14} /> Mật khẩu mới phải có ít nhất 8 ký tự và khác mật khẩu hiện tại.</p>
            <button type="submit" disabled={busy}><KeyRound size={15} /> {busy ? 'Đang đổi...' : 'Đổi mật khẩu'}</button>
            {notice?.kind === 'success' ? <span className="profileSuccess"><CheckCircle2 size={14} /> {notice.text}</span> : null}
          </form>
        </section>
      </div>
    </section>
  );
}

function displayName(user: ProfileUser | null) {
  return user?.name || user?.fullName || user?.displayName || user?.username || 'Người dùng SmartTour';
}

function cleanText(value: FormDataEntryValue | null) {
  return typeof value === 'string' ? value.trim() : '';
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${browserApiBase()}${path}`, { cache: 'no-store', credentials: 'include', headers: { Accept: 'application/json' }, signal });
  const data = await readResponse(response);
  if (!response.ok) throw new Error(apiMessage(data, response.statusText));
  return data as T;
}

async function postJson(path: string, payload: unknown) {
  const response = await fetch(`${browserApiBase()}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await readResponse(response);
  if (!response.ok) throw new Error(apiMessage(data, response.statusText));
  return data;
}

function browserApiBase() {
  const apiBase = (process.env.NEXT_PUBLIC_API_URL || '').trim().replace(/\/+$/, '');
  if (typeof window === 'undefined') return apiBase;
  if (!apiBase || apiBase.includes('smarttour-api-1')) return '';
  return apiBase;
}

async function readResponse(response: Response) {
  return response.json().catch(() => ({}));
}

function apiMessage(data: unknown, fallback: string) {
  if (data && typeof data === 'object' && 'message' in data) {
    const message = (data as { message?: unknown }).message;
    if (Array.isArray(message)) return message.map(String).join(', ');
    if (message) return String(message);
  }
  return fallback || 'Lỗi không xác định';
}

function apiErrorText(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function updateAuthSession(data: unknown) {
  if (!data || typeof data !== 'object') return;
  const user = 'user' in data ? data.user : data;
  if (user && typeof user === 'object') {
    window.localStorage.setItem('smarttour.auth.user', JSON.stringify(toStoredAuthUser(user)));
  }
}

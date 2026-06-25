'use client';

import { useEffect, useState } from 'react';
import { viPermission } from './i18n';

type StoredUser = {
  id?: string;
  username?: string;
  email?: string;
  name?: string;
  fullName?: string;
  displayName?: string;
  status?: string;
  branch?: string | null;
  department?: string | null;
  dataScope?: string;
  permissions?: string[];
  roles?: { code: string; name: string }[];
};

export function toStoredAuthUser(user: StoredUser | null | undefined): StoredUser | null {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    name: user.name,
    fullName: user.fullName,
    displayName: user.displayName,
    status: user.status,
    branch: user.branch,
    department: user.department,
    dataScope: user.dataScope,
    permissions: Array.isArray(user.permissions) ? user.permissions : [],
    roles: Array.isArray(user.roles) ? user.roles.map((role) => ({ code: role.code, name: role.name })) : [],
  };
}

export function usePermissions() {
  const [user, setUser] = useState<StoredUser | null>(null);
  const [permissionsReady, setPermissionsReady] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    async function syncPermissions() {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || '';
      try {
        const response = await fetch(`${apiBase}/api/auth/me`, {
          cache: 'no-store',
          credentials: 'include',
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Không xác định được quyền của phiên đăng nhập');
        const rawUser = await response.json() as StoredUser;
        const nextUser = toStoredAuthUser(rawUser);
        if (!active) return;
        window.localStorage.setItem('smarttour.auth.user', JSON.stringify(toStoredAuthUser(rawUser)));
        setUser(nextUser);
      } catch {
        if (!active || controller.signal.aborted) return;
        window.localStorage.removeItem('smarttour.auth.user');
        setUser(null);
      } finally {
        if (active) setPermissionsReady(true);
      }
    }

    void syncPermissions();
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  function can(permission: string) {
    if (!permissionsReady || !user) return false;
    const permissions = user.permissions || [];
    return permissions.includes('*') || permissions.includes(permission);
  }

  function canAny(permissions: string[]) {
    return permissions.some((permission) => can(permission));
  }

  return { user, can, canAny, isLoggedIn: Boolean(user), permissionsReady };
}

export function PermissionNotice({ allowed, label, missingPermissions = [] }: { allowed: boolean; label: string; missingPermissions?: string[] }) {
  if (allowed) return null;
  const permissions = missingPermissions.filter(Boolean);
  return (
    <section className="panel emptyState">
      <h2>Không có quyền truy cập</h2>
      <p>Tài khoản hiện tại chưa có quyền {label}. Liên hệ quản trị viên để cấp thêm quyền.</p>
      {permissions.length ? <p>Quyền cần bổ sung: {permissions.map((permission) => `${viPermission(permission)} (${permission})`).join(', ')}.</p> : null}
    </section>
  );
}

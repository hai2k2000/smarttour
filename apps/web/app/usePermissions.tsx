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
  permissions?: string[];
  roles?: { code: string; name: string }[];
};

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
        const nextUser = await response.json() as StoredUser;
        if (!active) return;
        window.localStorage.setItem('smarttour.auth.user', JSON.stringify(nextUser));
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

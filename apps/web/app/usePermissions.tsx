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

  useEffect(() => {
    const raw = window.localStorage.getItem('smarttour.auth.user');
    if (!raw) return;
    try {
      setUser(JSON.parse(raw));
    } catch {
      setUser(null);
    }
  }, []);

  function can(permission: string) {
    if (!user) return true;
    const permissions = user.permissions || [];
    return permissions.includes('*') || permissions.includes(permission);
  }

  function canAny(permissions: string[]) {
    return permissions.some((permission) => can(permission));
  }

  return { user, can, canAny, isLoggedIn: Boolean(user) };
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

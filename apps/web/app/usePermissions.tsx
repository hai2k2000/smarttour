'use client';

import { useEffect, useState } from 'react';

type StoredUser = {
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

export function PermissionNotice({ allowed, label }: { allowed: boolean; label: string }) {
  if (allowed) return null;
  return (
    <section className="panel emptyState">
      <h2>Khong co quyen truy cap</h2>
      <p>Tai khoan hien tai chua co quyen {label}. Lien he quan tri vien de cap them permission.</p>
    </section>
  );
}

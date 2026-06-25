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

const AUTH_USER_STORAGE_KEY = 'smarttour.auth.user';
const PERMISSION_CACHE_TTL_MS = 60_000;
let cachedPermissionUser: StoredUser | null | undefined;
let cachedPermissionUserLoadedAt = 0;
let permissionSyncPromise: Promise<StoredUser | null> | null = null;

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

function readStoredAuthUser() {
  if (typeof window === 'undefined') return null;
  const storedUser = window.localStorage.getItem(AUTH_USER_STORAGE_KEY);
  if (!storedUser) return null;
  try {
    return toStoredAuthUser(JSON.parse(storedUser) as StoredUser);
  } catch {
    window.localStorage.removeItem(AUTH_USER_STORAGE_KEY);
    return null;
  }
}

function persistPermissionUser(user: StoredUser | null) {
  const nextUser = toStoredAuthUser(user);
  cachedPermissionUser = nextUser;
  cachedPermissionUserLoadedAt = Date.now();
  if (typeof window !== 'undefined') {
    if (nextUser) window.localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(nextUser));
    else window.localStorage.removeItem(AUTH_USER_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent('smarttour:auth-user-updated'));
  }
  return nextUser;
}

async function syncPermissionUser(force = false) {
  if (!force && cachedPermissionUser !== undefined && Date.now() - cachedPermissionUserLoadedAt < PERMISSION_CACHE_TTL_MS) return cachedPermissionUser;
  if (permissionSyncPromise) return permissionSyncPromise;
  const apiBase = process.env.NEXT_PUBLIC_API_URL || '';
  permissionSyncPromise = fetch(`${apiBase}/api/auth/me`, {
    cache: 'no-store',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  })
    .then(async (response) => {
      if (!response.ok) throw new Error('Unable to load current user permissions');
      return persistPermissionUser(await response.json() as StoredUser);
    })
    .catch(() => persistPermissionUser(null))
    .finally(() => {
      permissionSyncPromise = null;
    });
  return permissionSyncPromise;
}

export function usePermissions() {
  const [user, setUser] = useState<StoredUser | null>(null);
  const [permissionsReady, setPermissionsReady] = useState(false);

  useEffect(() => {
    let active = true;

    function applyUser(nextUser: StoredUser | null) {
      if (!active) return;
      setUser(nextUser);
      setPermissionsReady(true);
    }

    function handleAuthUserUpdated() {
      const nextUser = readStoredAuthUser();
      cachedPermissionUser = nextUser;
      applyUser(nextUser);
    }

    window.addEventListener('smarttour:auth-user-updated', handleAuthUserUpdated);

    const storedUser = cachedPermissionUser !== undefined ? cachedPermissionUser : readStoredAuthUser();
    if (storedUser) {
      cachedPermissionUser = storedUser;
      applyUser(storedUser);
      void syncPermissionUser(true).then(applyUser);
    } else {
      void syncPermissionUser().then(applyUser);
    }

    return () => {
      active = false;
      window.removeEventListener('smarttour:auth-user-updated', handleAuthUserUpdated);
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

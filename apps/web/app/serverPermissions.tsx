import { viPermission } from './i18n';

export type PermissionUser = {
  permissions?: string[] | null;
};

export function hasPermission(user: PermissionUser | null | undefined, permission: string) {
  const permissions = user?.permissions || [];
  return permissions.includes('*') || permissions.includes(permission);
}

export function ServerPermissionNotice({ allowed, label, missingPermissions = [] }: { allowed: boolean; label: string; missingPermissions?: string[] }) {
  if (allowed) return null;
  const permissions = missingPermissions.filter(Boolean);
  return (
    <section className="panel emptyState">
      <h2>Không có quyền truy cập</h2>
      <p>Tài khoản hiện tại chưa có quyền {label}. Liên hệ quản trị viên để cấp thêm quyền.</p>
      {permissions.length ? <p>Quyền cần bổ sung: {permissions.map((item) => `${viPermission(item)} (${item})`).join(', ')}.</p> : null}
    </section>
  );
}

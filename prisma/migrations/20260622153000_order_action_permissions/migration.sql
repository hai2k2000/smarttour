WITH role_permissions(code, permission) AS (
  VALUES
    ('super_admin', 'order.status.update'),
    ('super_admin', 'order.settle'),
    ('super_admin', 'order.unlock'),
    ('super_admin', 'quote.approve'),
    ('super_admin', 'quotation.approve'),
    ('super_admin', 'commission.approve')
)
INSERT INTO "RolePermission" (id, "roleId", permission, "createdAt")
SELECT md5(r.id || ':' || rp.permission), r.id, rp.permission, now()
FROM role_permissions rp
JOIN "Role" r ON r.code = rp.code
ON CONFLICT ("roleId", permission) DO NOTHING;

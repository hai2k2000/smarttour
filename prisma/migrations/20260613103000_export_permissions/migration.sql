WITH role_permissions(code, permission) AS (
  VALUES
    ('super_admin', 'commission.export'),
    ('super_admin', 'order.export'),
    ('accounting', 'commission.export'),
    ('operation', 'order.export'),
    ('sales', 'order.export')
)
INSERT INTO "RolePermission" (id, "roleId", permission, "createdAt")
SELECT md5(r.id || ':' || rp.permission), r.id, rp.permission, now()
FROM role_permissions rp
JOIN "Role" r ON r.code = rp.code
ON CONFLICT ("roleId", permission) DO NOTHING;

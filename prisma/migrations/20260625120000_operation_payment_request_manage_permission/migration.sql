WITH role_permissions(code, permission) AS (
  VALUES
    ('super_admin', 'operation.payment-request.manage'),
    ('operation', 'operation.payment-request.manage')
)
INSERT INTO "RolePermission" (id, "roleId", permission, "createdAt")
SELECT
  concat(role_permissions.code, '_', replace(replace(role_permissions.permission, '.', '_'), '-', '_')),
  role_permissions.code,
  role_permissions.permission,
  now()
FROM role_permissions
ON CONFLICT ("roleId", permission) DO NOTHING;

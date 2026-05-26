-- Expand seeded role permissions for endpoint-level RBAC rollout.

INSERT INTO "RolePermission" ("id", "roleId", "permission")
SELECT md5('role_accounting:' || permission), 'role_accounting', permission
FROM (
  VALUES
    ('finance.receipt.update'),
    ('finance.receipt.delete'),
    ('finance.receipt.import'),
    ('finance.payment.update'),
    ('finance.payment.delete'),
    ('finance.payment.import'),
    ('finance.invoice.update'),
    ('finance.invoice.delete')
) AS p(permission)
ON CONFLICT ("roleId", "permission") DO NOTHING;

INSERT INTO "RolePermission" ("id", "roleId", "permission")
SELECT md5('role_operation:' || permission), 'role_operation', permission
FROM (
  VALUES
    ('booking.manage'),
    ('tour.manage'),
    ('guide.manage'),
    ('order.manage'),
    ('supplier.manage')
) AS p(permission)
ON CONFLICT ("roleId", "permission") DO NOTHING;

INSERT INTO "RolePermission" ("id", "roleId", "permission")
SELECT md5('role_sales:' || permission), 'role_sales', permission
FROM (
  VALUES
    ('booking.manage'),
    ('tour.manage'),
    ('order.manage')
) AS p(permission)
ON CONFLICT ("roleId", "permission") DO NOTHING;

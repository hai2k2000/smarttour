INSERT INTO "RolePermission" (id, "roleId", permission, "createdAt")
SELECT md5(existing."roleId" || ':finance.debt.view'), existing."roleId", 'finance.debt.view', now()
FROM "RolePermission" existing
WHERE existing.permission = 'finance.cashflow.view'
ON CONFLICT ("roleId", permission) DO NOTHING;

-- Auth and RBAC foundation for production access control.

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS "branch" TEXT,
  ADD COLUMN IF NOT EXISTS "department" TEXT,
  ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "Role" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "isSystem" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "UserRole" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "roleId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserRole_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "RolePermission" (
  "id" TEXT NOT NULL,
  "roleId" TEXT NOT NULL,
  "permission" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "UserSession" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "userAgent" TEXT,
  "ipAddress" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Role_code_key" ON "Role"("code");
CREATE INDEX IF NOT EXISTS "Role_status_idx" ON "Role"("status");
CREATE UNIQUE INDEX IF NOT EXISTS "UserRole_userId_roleId_key" ON "UserRole"("userId", "roleId");
CREATE INDEX IF NOT EXISTS "UserRole_roleId_idx" ON "UserRole"("roleId");
CREATE UNIQUE INDEX IF NOT EXISTS "RolePermission_roleId_permission_key" ON "RolePermission"("roleId", "permission");
CREATE INDEX IF NOT EXISTS "RolePermission_permission_idx" ON "RolePermission"("permission");
CREATE UNIQUE INDEX IF NOT EXISTS "UserSession_tokenHash_key" ON "UserSession"("tokenHash");
CREATE INDEX IF NOT EXISTS "UserSession_userId_idx" ON "UserSession"("userId");
CREATE INDEX IF NOT EXISTS "UserSession_expiresAt_idx" ON "UserSession"("expiresAt");
CREATE INDEX IF NOT EXISTS "UserSession_revokedAt_idx" ON "UserSession"("revokedAt");
CREATE INDEX IF NOT EXISTS "User_status_idx" ON "User"("status");
CREATE INDEX IF NOT EXISTS "User_branch_idx" ON "User"("branch");
CREATE INDEX IF NOT EXISTS "User_department_idx" ON "User"("department");
CREATE INDEX IF NOT EXISTS "AuditLog_actorId_idx" ON "AuditLog"("actorId");
CREATE INDEX IF NOT EXISTS "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");
CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'UserRole_userId_fkey'
  ) THEN
    ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'UserRole_roleId_fkey'
  ) THEN
    ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey"
      FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'RolePermission_roleId_fkey'
  ) THEN
    ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey"
      FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'UserSession_userId_fkey'
  ) THEN
    ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AuditLog_actorId_fkey'
  ) THEN
    ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey"
      FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

INSERT INTO "Role" ("id", "code", "name", "description", "isSystem", "status", "updatedAt")
VALUES
  ('role_super_admin', 'super_admin', 'Super Admin', 'Full SmartTour administration access', true, 'ACTIVE', NOW()),
  ('role_accounting', 'accounting', 'Ke toan', 'Finance and accounting workflows', true, 'ACTIVE', NOW()),
  ('role_operation', 'operation', 'Dieu hanh', 'Tour operation workflows', true, 'ACTIVE', NOW()),
  ('role_sales', 'sales', 'Kinh doanh', 'Sales, CRM, quotation, and order workflows', true, 'ACTIVE', NOW())
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "isSystem" = EXCLUDED."isSystem",
  "status" = EXCLUDED."status",
  "updatedAt" = NOW();

INSERT INTO "RolePermission" ("id", "roleId", "permission")
SELECT md5('role_super_admin:' || permission), 'role_super_admin', permission
FROM (
  VALUES
    ('*'),
    ('auth.user.manage'),
    ('auth.role.manage'),
    ('finance.receipt.approve'),
    ('finance.payment.approve'),
    ('finance.invoice.approve'),
    ('operation.form.manage'),
    ('operation.payment-request.approve'),
    ('order.manage'),
    ('supplier.manage'),
    ('customer.manage')
) AS p(permission)
ON CONFLICT ("roleId", "permission") DO NOTHING;

INSERT INTO "RolePermission" ("id", "roleId", "permission")
SELECT md5('role_accounting:' || permission), 'role_accounting', permission
FROM (
  VALUES
    ('finance.receipt.view'),
    ('finance.receipt.create'),
    ('finance.receipt.approve'),
    ('finance.payment.view'),
    ('finance.payment.create'),
    ('finance.payment.approve'),
    ('finance.invoice.view'),
    ('finance.invoice.create'),
    ('finance.invoice.approve'),
    ('finance.cashflow.view'),
    ('operation.payment-request.approve')
) AS p(permission)
ON CONFLICT ("roleId", "permission") DO NOTHING;

INSERT INTO "RolePermission" ("id", "roleId", "permission")
SELECT md5('role_operation:' || permission), 'role_operation', permission
FROM (
  VALUES
    ('operation.form.view'),
    ('operation.form.manage'),
    ('operation.payment-request.view'),
    ('operation.payment-request.create'),
    ('order.view'),
    ('supplier.view')
) AS p(permission)
ON CONFLICT ("roleId", "permission") DO NOTHING;

INSERT INTO "RolePermission" ("id", "roleId", "permission")
SELECT md5('role_sales:' || permission), 'role_sales', permission
FROM (
  VALUES
    ('customer.manage'),
    ('quotation.manage'),
    ('quote.manage'),
    ('order.view')
) AS p(permission)
ON CONFLICT ("roleId", "permission") DO NOTHING;

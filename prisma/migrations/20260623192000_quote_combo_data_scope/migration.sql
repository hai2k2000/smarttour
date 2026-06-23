ALTER TABLE "QuoteCombo" ADD COLUMN "branch" TEXT;
ALTER TABLE "QuoteCombo" ADD COLUMN "department" TEXT;

UPDATE "QuoteCombo" qc
SET
  "branch" = COALESCE(qc."branch", u."branch"),
  "department" = COALESCE(qc."department", u."department")
FROM "User" u
WHERE qc."createdBy" IS NOT NULL
  AND (qc."createdBy" = u."username" OR qc."createdBy" = u."email" OR qc."createdBy" = u."id");

CREATE INDEX "QuoteCombo_branch_idx" ON "QuoteCombo"("branch");
CREATE INDEX "QuoteCombo_department_idx" ON "QuoteCombo"("department");

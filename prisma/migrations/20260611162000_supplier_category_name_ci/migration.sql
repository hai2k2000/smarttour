-- Prevent supplier categories that differ only by casing or surrounding whitespace.
CREATE UNIQUE INDEX "SupplierCategory_name_ci_key"
ON "SupplierCategory" (LOWER(BTRIM("name")));

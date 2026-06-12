#!/usr/bin/env bash
set -euo pipefail

run_test() {
  local label="$1"
  shift
  echo "==> ${label}"
  "$@"
}

run_test "Common supplier contract" bash scripts/test-suppliers-common-contract.sh
run_test "Typed supplier contract" bash scripts/test-suppliers-typed-contract.sh
run_test "Supplier controller contract" bash scripts/test-suppliers-controller-contract.sh
run_test "Supplier file contract" bash scripts/test-suppliers-file-contract.sh
run_test "Supplier service Vietnamese messages" bash scripts/test-suppliers-service-i18n.sh
run_test "File storage rollback flows" bash scripts/test-file-service-error-flows.sh
run_test "Generic supplier API smoke" bash scripts/smoke-suppliers.sh

echo "TEST_SUPPLIERS_GENERIC_OK"

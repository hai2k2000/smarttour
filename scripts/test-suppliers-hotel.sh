#!/usr/bin/env bash
set -euo pipefail

run_test() {
  local label="$1"
  shift
  echo "==> ${label}"
  "$@"
}

run_test "Hotel supplier contract" bash scripts/test-suppliers-hotel-contract.sh
run_test "Hotel supplier DTO validation" bash scripts/test-suppliers-hotel-dto-validation.sh
run_test "Supplier controller contract" bash scripts/test-suppliers-controller-contract.sh
run_test "Supplier file contract" bash scripts/test-suppliers-file-contract.sh
run_test "Supplier service Vietnamese messages" bash scripts/test-suppliers-service-i18n.sh
run_test "File storage rollback flows" bash scripts/test-file-service-error-flows.sh
run_test "Hotel supplier client UI" bash scripts/test-suppliers-hotel-client-ui.sh
run_test "Hotel supplier API smoke" bash scripts/smoke-suppliers.sh

echo "TEST_SUPPLIERS_HOTEL_OK"

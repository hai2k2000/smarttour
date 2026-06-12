#!/usr/bin/env bash
set -euo pipefail

node node_modules/typescript/bin/tsc -p apps/api/tsconfig.json >/dev/null
node scripts/test-suppliers-hotel-dto-validation.js

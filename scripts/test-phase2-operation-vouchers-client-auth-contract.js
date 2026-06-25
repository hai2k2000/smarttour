const fs = require('fs');
const assert = require('assert');

const client = fs.readFileSync('apps/web/app/operation-vouchers/OperationVouchersClient.tsx', 'utf8');
const fetches = [...client.matchAll(/fetch\(`\$\{browserApiBase\(\)\}\/api\/operation-vouchers[\s\S]*?\);/g)].map((match) => match[0]);

assert(fetches.length >= 4, 'Operation Vouchers client should have list/detail/save/payment API calls');
for (const fetchCall of fetches) {
  assert(fetchCall.includes("credentials: 'include'"), `Operation Vouchers fetch must include credentials: ${fetchCall.slice(0, 120)}`);
}

console.log('TEST_PHASE2_OPERATION_VOUCHERS_CLIENT_AUTH_CONTRACT_OK');

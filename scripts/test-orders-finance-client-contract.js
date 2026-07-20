const fs = require('fs');

const financeClient = fs.readFileSync('apps/web/app/finance/FinanceClient.tsx', 'utf8');
const failures = [];

function requireText(source, token, label) {
  if (!source.includes(token)) failures.push(label);
}

requireText(financeClient, "const orderId = searchParams.get('orderId')?.trim() || '';", 'Finance page must read orderId from URL');
requireText(financeClient, "if (orderId) params.set('orderId', orderId);", 'Finance list query must include orderId');
requireText(financeClient, "if (orderId) nextParams.set('orderId', orderId);", 'Finance tab navigation must preserve orderId');

if (failures.length) {
  console.error('FAIL_ORDERS_FINANCE_CLIENT_CONTRACT');
  failures.forEach((failure) => console.error(failure));
  process.exit(1);
}

console.log('TEST_ORDERS_FINANCE_CLIENT_CONTRACT_OK');

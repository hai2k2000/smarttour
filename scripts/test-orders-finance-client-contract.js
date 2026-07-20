const fs = require('fs');

function readSource(path) {
  return fs.existsSync(path) ? fs.readFileSync(path, 'utf8') : '';
}

const financeClient = readSource('apps/web/app/finance/FinanceClient.tsx');
const ordersClient = readSource('apps/web/app/orders/[type]/OrdersClient.tsx');
const panel = readSource('apps/web/app/orders/[type]/OrderFinancePanel.tsx');
const css = readSource('apps/web/app/globals.css');
const failures = [];

function requireText(source, token, label) {
  if (!source.includes(token)) failures.push(label);
}

requireText(financeClient, "const orderId = searchParams.get('orderId')?.trim() || '';", 'Finance page must read orderId from URL');
requireText(financeClient, "if (orderId) params.set('orderId', orderId);", 'Finance list query must include orderId');
requireText(financeClient, "if (orderId) nextParams.set('orderId', orderId);", 'Finance tab navigation must preserve orderId');
requireText(ordersClient, "import OrderFinancePanel, { type OrderFinanceOrder } from './OrderFinancePanel';", 'OrdersClient must compose the finance panel');
requireText(ordersClient, 'const [financeOrder, setFinanceOrder] = useState<OrderFinanceOrder | null>(null);', 'OrdersClient must retain loaded finance context');
requireText(ordersClient, '<OrderFinancePanel order={financeOrder} />', 'OrdersClient must render finance outside the edit form');
requireText(panel, "can('finance.receipt.view')", 'receipt history must be permission gated');
requireText(panel, "can('finance.payment.view')", 'payment history must be permission gated');
requireText(panel, "can('finance.receipt.create')", 'receipt creation must be permission gated');
requireText(panel, "can('finance.payment.create')", 'payment creation must be permission gated');
requireText(panel, '/api/finance/receipts?${params.toString()}', 'panel must load order receipts');
requireText(panel, '/api/finance/payments?${params.toString()}', 'panel must load order payments');
requireText(panel, "orders: [{ orderId: order.id, orderCode: order.systemCode", 'receipt payload must allocate to the order');
requireText(panel, 'supplierId: paymentDraft.supplierId', 'payment payload must submit selected supplier');
requireText(panel, 'orderId: order.id', 'payment payload must link the order');
requireText(panel, "item.status !== 'CANCELLED'", 'supplier choices must exclude cancelled operation items');
requireText(panel, '/finance?tab=receipts&orderId=', 'panel must deep-link receipt history');
requireText(panel, '/finance?tab=payments&orderId=', 'panel must deep-link payment history');
for (const forbidden of ['/approve', '/reject', '/cancel']) {
  if (panel.includes(forbidden)) failures.push(`Orders finance panel must not expose ${forbidden} actions`);
}
requireText(css, '.orderFinancePanel', 'Orders finance panel styles are missing');
requireText(css, '.orderFinanceHistoryGrid', 'Orders finance history grid styles are missing');

if (failures.length) {
  console.error('FAIL_ORDERS_FINANCE_CLIENT_CONTRACT');
  failures.forEach((failure) => console.error(failure));
  process.exit(1);
}

console.log('TEST_ORDERS_FINANCE_CLIENT_CONTRACT_OK');

const fs = require('fs');

const queryDto = fs.readFileSync('apps/api/src/modules/finance/dto/finance-query.dto.ts', 'utf8');
const service = fs.readFileSync('apps/api/src/modules/finance/finance.service.ts', 'utf8');
const orderLinks = fs.readFileSync('apps/api/src/modules/finance/finance-order-links.ts', 'utf8');
const failures = [];

function requireText(source, token, label) {
  if (!source.includes(token)) failures.push(label);
}

requireText(queryDto, 'orderId?: string;', 'FinanceQueryDto must accept orderId');
requireText(service, "...(query.orderId ? { orders: { some: { orderId: query.orderId } } } : {}),", 'receiptWhere must filter by receipt order allocation');
requireText(service, "...(query.orderId ? { orderId: query.orderId } : {}),", 'paymentWhere must filter by direct orderId');
requireText(orderLinks, 'orderOperationItem.findFirst', 'payment link validation must inspect order operation items');
requireText(orderLinks, "status: { not: 'CANCELLED' }", 'cancelled operation items must not authorize supplier payments');
requireText(orderLinks, 'Nhà cung cấp phiếu chi không thuộc dịch vụ điều hành của booking', 'supplier/order mismatch must return an operational error');

if (failures.length) {
  console.error('FAIL_ORDERS_FINANCE_BACKEND_CONTRACT');
  failures.forEach((failure) => console.error(failure));
  process.exit(1);
}

console.log('TEST_ORDERS_FINANCE_BACKEND_CONTRACT_OK');

const fs = require('fs');

const dto = fs.readFileSync('apps/api/src/modules/order-center/dto/order-center-query.dto.ts', 'utf8');
const service = fs.readFileSync('apps/api/src/modules/order-center/order-center.service.ts', 'utf8');
const failures = [];

for (const token of [
  'OrderCostStatus',
  'OrderPaymentStatus',
  '@IsEnum(OrderPaymentStatus)',
  '@IsEnum(OrderCostStatus)',
  '@IsDateString',
]) {
  if (!dto.includes(token)) failures.push(`OrderCenterQueryDto missing ${token}`);
}
for (const field of ['createdFrom', 'createdTo', 'startFrom', 'startTo', 'endFrom', 'endTo', 'paymentFrom', 'paymentTo']) {
  const fieldIndex = dto.indexOf(`${field}?: string`);
  const dateIndex = dto.lastIndexOf('@IsDateString', fieldIndex);
  if (fieldIndex === -1 || dateIndex === -1 || fieldIndex - dateIndex > 180) failures.push(`${field} must use @IsDateString`);
}
if (service.includes('paymentStatus: query.paymentStatus as any')) failures.push('OrderCenterService must not cast paymentStatus as any');
if (service.includes('costStatus: query.costStatus as any')) failures.push('OrderCenterService must not cast costStatus as any');
if (service.includes('new Date(from)') || service.includes('new Date(to)')) failures.push('OrderCenterService dateRange must not construct Invalid Date from raw query values');
if (!service.includes('private queryDate(') || !service.includes('Number.isNaN(date.getTime())')) failures.push('OrderCenterService must reject invalid query dates with BadRequestException');

if (failures.length) {
  console.error('FAIL_ORDER_CENTER_QUERY_CONTRACT');
  for (const failure of failures) console.error(failure);
  process.exit(1);
}

console.log('TEST_ORDER_CENTER_QUERY_CONTRACT_OK');

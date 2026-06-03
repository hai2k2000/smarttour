import { CreateOrderDto } from './dto/order.dto';

type SalesLine = { quantity?: number; serviceCount?: number; unitPrice?: number; vat?: number };
type OperationLine = { quantity?: number; netPrice?: number; vat?: number };

export function salesAmount(item: SalesLine) {
  const base = (item.quantity ?? 1) * (item.serviceCount ?? 1) * (item.unitPrice ?? 0);
  return base * (1 + (item.vat ?? 0) / 100);
}

export function operationAmount(item: OperationLine) {
  const base = (item.quantity ?? 1) * (item.netPrice ?? 0);
  return base * (1 + (item.vat ?? 0) / 100);
}

export function calculateOrderTotals(dto: Partial<CreateOrderDto>) {
  const revenue = (dto.salesItems ?? []).reduce((sum, item) => sum + salesAmount(item), 0);
  const cost = (dto.operationItems ?? []).reduce((sum, item) => sum + operationAmount(item), 0);
  const paidAmount = dto.paidAmount ?? 0;
  const paidCost = dto.paidCost ?? 0;
  return {
    totalRevenue: revenue,
    paidAmount,
    remainingRevenue: Math.max(0, revenue - paidAmount),
    totalCost: cost,
    paidCost,
    remainingCost: Math.max(0, cost - paidCost),
    profit: revenue - cost,
    paymentStatus: revenue <= 0 || paidAmount <= 0 ? 'UNPAID' : paidAmount >= revenue ? 'PAID' : 'PARTIAL',
    costStatus: cost <= 0 || paidCost <= 0 ? 'PENDING' : paidCost >= cost ? 'PAID' : 'PARTIAL',
  };
}

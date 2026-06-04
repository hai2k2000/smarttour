import { OrderCostStatus, OrderPaymentStatus } from '@prisma/client';
import { CreateOrderDto } from './dto/order.dto';

type SalesLine = { quantity?: number; serviceCount?: number; unitPrice?: number; vat?: number };
type OperationLine = { quantity?: number; netPrice?: number; vat?: number };
type PaymentSummary = { paidAmount: number; remainingRevenue: number; paymentStatus: OrderPaymentStatus };
type CostSummary = { paidCost: number; remainingCost: number; costStatus: OrderCostStatus };

export function salesAmount(item: SalesLine) {
  const base = (item.quantity ?? 1) * (item.serviceCount ?? 1) * (item.unitPrice ?? 0);
  return base * (1 + (item.vat ?? 0) / 100);
}

export function operationAmount(item: OperationLine) {
  const base = (item.quantity ?? 1) * (item.netPrice ?? 0);
  return base * (1 + (item.vat ?? 0) / 100);
}

export function calculateRevenue(dto: Pick<Partial<CreateOrderDto>, 'salesItems'>) {
  return (dto.salesItems ?? []).reduce((sum, item) => sum + salesAmount(item), 0);
}

export function calculateCost(dto: Pick<Partial<CreateOrderDto>, 'operationItems'>) {
  return (dto.operationItems ?? []).reduce((sum, item) => sum + operationAmount(item), 0);
}

export function calculatePaymentSummary(totalRevenue: number, paidAmountInput: unknown): PaymentSummary {
  const paidAmount = money(paidAmountInput);
  return {
    paidAmount,
    remainingRevenue: Math.max(0, totalRevenue - paidAmount),
    paymentStatus: paymentStatus(totalRevenue, paidAmount),
  };
}

export function calculateCostSummary(totalCost: number, paidCostInput: unknown): CostSummary {
  const paidCost = money(paidCostInput);
  return {
    paidCost,
    remainingCost: Math.max(0, totalCost - paidCost),
    costStatus: costStatus(totalCost, paidCost),
  };
}

export function calculateOrderTotals(dto: Partial<CreateOrderDto>) {
  const revenue = calculateRevenue(dto);
  const cost = calculateCost(dto);
  const payment = calculatePaymentSummary(revenue, dto.paidAmount);
  const costPayment = calculateCostSummary(cost, dto.paidCost);
  return {
    totalRevenue: revenue,
    paidAmount: payment.paidAmount,
    remainingRevenue: payment.remainingRevenue,
    totalCost: cost,
    paidCost: costPayment.paidCost,
    remainingCost: costPayment.remainingCost,
    profit: revenue - cost,
    paymentStatus: payment.paymentStatus,
    costStatus: costPayment.costStatus,
  };
}

function paymentStatus(totalRevenue: number, paidAmount: number): OrderPaymentStatus {
  if (totalRevenue <= 0 || paidAmount <= 0) return 'UNPAID';
  return paidAmount >= totalRevenue ? 'PAID' : 'PARTIAL';
}

function costStatus(totalCost: number, paidCost: number): OrderCostStatus {
  if (totalCost <= 0 || paidCost <= 0) return 'PENDING';
  return paidCost >= totalCost ? 'PAID' : 'PARTIAL';
}

function money(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

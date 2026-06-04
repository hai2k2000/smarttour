import { OrderCostStatus, OrderPaymentStatus, Prisma } from '@prisma/client';

export async function applyOrderReceipt(tx: Prisma.TransactionClient, orderId: string, amount: number) {
  const order = await tx.order.findUnique({ where: { id: orderId } });
  if (!order) return;

  const paidAmount = Math.max(Number(order.paidAmount) + amount, 0);
  const remainingRevenue = Math.max(Number(order.totalRevenue) - paidAmount, 0);
  await tx.order.update({
    where: { id: orderId },
    data: {
      paidAmount,
      remainingRevenue,
      paymentStatus: remainingRevenue <= 0 ? OrderPaymentStatus.PAID : paidAmount > 0 ? OrderPaymentStatus.PARTIAL : OrderPaymentStatus.UNPAID,
    },
  });
}

export async function applyOrderPayment(tx: Prisma.TransactionClient, orderId: string, amount: number) {
  const order = await tx.order.findUnique({ where: { id: orderId } });
  if (!order) return;

  const paidCost = Math.max(Number(order.paidCost) + amount, 0);
  const remainingCost = Math.max(Number(order.totalCost) - paidCost, 0);
  await tx.order.update({
    where: { id: orderId },
    data: {
      paidCost,
      remainingCost,
      costStatus: remainingCost <= 0 ? OrderCostStatus.PAID : paidCost > 0 ? OrderCostStatus.PARTIAL : OrderCostStatus.PENDING,
    },
  });
}

export async function resolveReceiptCustomer(
  tx: Prisma.TransactionClient,
  receipt: { customerId: string | null; orders: { orderId: string | null }[] },
) {
  if (receipt.customerId) return receipt.customerId;
  const orderId = receipt.orders.find((line) => line.orderId)?.orderId;
  if (!orderId) return null;

  const order = await tx.order.findUnique({ where: { id: orderId }, select: { customerId: true } });
  return order?.customerId || null;
}

export async function resolvePaymentSupplier(
  tx: Prisma.TransactionClient,
  payment: { supplierId: string | null; operationVoucherId: string | null },
) {
  if (payment.supplierId) return payment.supplierId;
  if (!payment.operationVoucherId) return null;

  const voucher = await tx.operationVoucher.findUnique({ where: { id: payment.operationVoucherId }, select: { supplierId: true } });
  return voucher?.supplierId || null;
}

export async function resolveInvoiceCustomer(
  tx: Prisma.TransactionClient,
  invoice: { customerId: string | null; orderId: string | null },
) {
  if (invoice.customerId) return invoice.customerId;
  if (!invoice.orderId) return null;

  const order = await tx.order.findUnique({ where: { id: invoice.orderId }, select: { customerId: true } });
  return order?.customerId || null;
}

export async function resolveInvoiceCustomerScope(
  tx: Prisma.TransactionClient,
  invoice: { customerId: string | null; orderId: string | null; receiptId?: string | null },
) {
  if (invoice.customerId) {
    const customer = await tx.customer.findUnique({ where: { id: invoice.customerId }, select: { id: true, branch: true, department: true } });
    if (customer) return { customerId: customer.id, branch: customer.branch, department: customer.department };
  }
  if (invoice.orderId) {
    const order = await tx.order.findUnique({ where: { id: invoice.orderId }, select: { customerId: true, branch: true, department: true } });
    if (order?.customerId) return { customerId: order.customerId, branch: order.branch, department: order.department };
  }
  if (invoice.receiptId) {
    const receipt = await tx.financeReceipt.findUnique({ where: { id: invoice.receiptId }, select: { customerId: true, branch: true, department: true } });
    if (receipt?.customerId) return { customerId: receipt.customerId, branch: receipt.branch, department: receipt.department };
  }
  return { customerId: null, branch: null, department: null };
}

import { BadRequestException } from '@nestjs/common';
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

export async function assertReceiptOrderLinks(
  tx: Prisma.TransactionClient,
  receipt: { customerId?: string | null; orders?: { orderId?: string | null }[] },
) {
  const orderIds = Array.from(new Set((receipt.orders || []).map((line) => line.orderId).filter((orderId): orderId is string => Boolean(orderId))));
  if (!orderIds.length) return;

  const orders = await tx.order.findMany({ where: { id: { in: orderIds }, deletedAt: null }, select: { id: true, customerId: true } });
  if (orders.length !== orderIds.length) throw new BadRequestException('Receipt contains an invalid order link');
  if (receipt.customerId && orders.some((order) => order.customerId && order.customerId !== receipt.customerId)) {
    throw new BadRequestException('Receipt customer does not match linked order customer');
  }
}

export async function assertPaymentLinks(
  tx: Prisma.TransactionClient,
  payment: { supplierId?: string | null; operationVoucherId?: string | null; orderId?: string | null },
) {
  if (payment.orderId) {
    const order = await tx.order.findFirst({ where: { id: payment.orderId, deletedAt: null }, select: { id: true } });
    if (!order) throw new BadRequestException('Payment contains an invalid order link');
  }
  if (!payment.operationVoucherId) return;

  const voucher = await tx.operationVoucher.findFirst({ where: { id: payment.operationVoucherId, deletedAt: null }, select: { supplierId: true, orderId: true } });
  if (!voucher) throw new BadRequestException('Payment contains an invalid operation voucher link');
  if (payment.supplierId && voucher.supplierId && payment.supplierId !== voucher.supplierId) {
    throw new BadRequestException('Payment supplier does not match operation voucher supplier');
  }
  if (payment.orderId && voucher.orderId && payment.orderId !== voucher.orderId) {
    throw new BadRequestException('Payment order does not match operation voucher order');
  }
}

export async function assertInvoiceLinks(
  tx: Prisma.TransactionClient,
  invoice: { customerId?: string | null; orderId?: string | null; receiptId?: string | null },
) {
  let resolvedCustomerId = invoice.customerId || null;
  if (invoice.orderId) {
    const order = await tx.order.findFirst({ where: { id: invoice.orderId, deletedAt: null }, select: { customerId: true } });
    if (!order) throw new BadRequestException('Invoice contains an invalid order link');
    if (resolvedCustomerId && order.customerId && resolvedCustomerId !== order.customerId) {
      throw new BadRequestException('Invoice customer does not match linked order customer');
    }
    resolvedCustomerId ||= order.customerId;
  }
  if (invoice.receiptId) {
    const receipt = await tx.financeReceipt.findFirst({ where: { id: invoice.receiptId, deletedAt: null }, include: { orders: true } });
    if (!receipt) throw new BadRequestException('Invoice contains an invalid receipt link');
    const receiptCustomerId = await resolveReceiptCustomer(tx, receipt);
    if (resolvedCustomerId && receiptCustomerId && resolvedCustomerId !== receiptCustomerId) {
      throw new BadRequestException('Invoice customer does not match linked receipt customer');
    }
    resolvedCustomerId ||= receiptCustomerId;
  }
}

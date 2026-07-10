import { BadRequestException } from '@nestjs/common';
import { OrderCostStatus, OrderPaymentStatus, Prisma } from '@prisma/client';
import { branchDepartmentScopeWhere, RequestUser } from '../auth/data-scope';

async function lockOrderForFinanceWrite(tx: Prisma.TransactionClient, orderId: string) {
  await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${orderId} AND "deletedAt" IS NULL FOR UPDATE`;
}

export async function applyOrderReceipt(tx: Prisma.TransactionClient, orderId: string, amount: number) {
  await lockOrderForFinanceWrite(tx, orderId);
  const order = await tx.order.findFirst({ where: { id: orderId, deletedAt: null } });
  if (!order) throw new BadRequestException('Không tìm thấy booking liên kết với phiếu thu');

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
  await lockOrderForFinanceWrite(tx, orderId);
  const order = await tx.order.findFirst({ where: { id: orderId, deletedAt: null } });
  if (!order) throw new BadRequestException('Không tìm thấy booking liên kết với phiếu chi');

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
  user?: RequestUser,
) {
  if (receipt.customerId) {
    const customer = await tx.customer.findFirst({
      where: branchDepartmentScopeWhere<Prisma.CustomerWhereInput>({ id: receipt.customerId, mergedIntoId: null }, user),
      select: { id: true },
    });
    if (!customer) throw new BadRequestException('Khách hàng của phiếu thu nằm ngoài phạm vi dữ liệu được phép');
    return customer.id;
  }
  const orderId = receipt.orders.find((line) => line.orderId)?.orderId;
  if (!orderId) return null;

  const order = await tx.order.findFirst({
    where: branchDepartmentScopeWhere<Prisma.OrderWhereInput>({ id: orderId, deletedAt: null }, user),
    select: { customerId: true },
  });
  if (!order) throw new BadRequestException('Booking của phiếu thu nằm ngoài phạm vi dữ liệu được phép');
  return order.customerId || null;
}

export async function resolvePaymentSupplier(
  tx: Prisma.TransactionClient,
  payment: { supplierId: string | null; operationVoucherId: string | null },
) {
  if (payment.supplierId) {
    const supplier = await tx.supplier.findFirst({ where: { id: payment.supplierId, deletedAt: null }, select: { id: true } });
    if (!supplier) throw new BadRequestException('Nhà cung cấp của phiếu chi không hợp lệ');
    return supplier.id;
  }
  if (!payment.operationVoucherId) return null;

  const voucher = await tx.operationVoucher.findFirst({ where: { id: payment.operationVoucherId, deletedAt: null }, select: { supplierId: true } });
  if (!voucher) throw new BadRequestException('Phiếu điều hành của phiếu chi không hợp lệ');
  return voucher.supplierId || null;
}

export async function resolveTourId(
  tx: Prisma.TransactionClient,
  input: {
    tourId?: string | null;
    orderId?: string | null;
    receiptId?: string | null;
    paymentId?: string | null;
    operationVoucherId?: string | null;
    tourCode?: string | null;
    orders?: { orderId?: string | null; tourCode?: string | null }[];
  },
  user?: RequestUser,
) {
  if (input.tourId) {
    const tour = await tx.tour.findFirst({
      where: branchDepartmentScopeWhere<Prisma.TourWhereInput>({ id: input.tourId, deletedAt: null }, user),
      select: { id: true },
    });
    if (!tour) throw new BadRequestException('Liên kết tour không hợp lệ hoặc nằm ngoài phạm vi dữ liệu được phép');
    return tour.id;
  }

  let orderId = input.orderId || input.orders?.find((line) => line.orderId)?.orderId || null;
  if (!orderId && input.operationVoucherId) {
    const voucher = await tx.operationVoucher.findFirst({ where: { id: input.operationVoucherId, deletedAt: null }, select: { orderId: true, tourId: true } });
    if (!voucher) throw new BadRequestException('Liên kết phiếu điều hành không hợp lệ');
    if (voucher.tourId) return resolveTourId(tx, { tourId: voucher.tourId }, user);
    orderId = voucher.orderId || null;
  }
  if (!orderId && input.receiptId) {
    const receipt = await tx.financeReceipt.findFirst({
      where: branchDepartmentScopeWhere<Prisma.FinanceReceiptWhereInput>({ id: input.receiptId, deletedAt: null }, user),
      include: { orders: true },
    });
    if (!receipt) throw new BadRequestException('Liên kết phiếu thu không hợp lệ hoặc nằm ngoài phạm vi dữ liệu được phép');
    if (receipt.tourId) return resolveTourId(tx, { tourId: receipt.tourId }, user);
    orderId = receipt.orders.find((line) => line.orderId)?.orderId || null;
  }
  if (!orderId && input.paymentId) {
    const payment = await tx.financePayment.findFirst({
      where: branchDepartmentScopeWhere<Prisma.FinancePaymentWhereInput>({ id: input.paymentId, deletedAt: null }, user),
      select: { tourId: true, orderId: true },
    });
    if (!payment) throw new BadRequestException('Liên kết phiếu chi không hợp lệ hoặc nằm ngoài phạm vi dữ liệu được phép');
    if (payment.tourId) return resolveTourId(tx, { tourId: payment.tourId }, user);
    orderId = payment.orderId || null;
  }
  const tourCode = input.tourCode || input.orders?.find((line) => line.tourCode)?.tourCode || null;
  if (!orderId && tourCode) {
    const tour = await tx.tour.findFirst({
      where: branchDepartmentScopeWhere<Prisma.TourWhereInput>({ OR: [{ tourCode }, { systemCode: tourCode }], deletedAt: null }, user),
      select: { id: true },
      orderBy: { updatedAt: 'desc' },
    });
    return tour?.id || null;
  }
  if (!orderId) return null;

  const order = await tx.order.findFirst({
    where: branchDepartmentScopeWhere<Prisma.OrderWhereInput>({ id: orderId, deletedAt: null }, user),
    select: { id: true },
  });
  if (!order) throw new BadRequestException('Booking liên kết nằm ngoài phạm vi dữ liệu được phép');
  const tour = await tx.tour.findFirst({
    where: branchDepartmentScopeWhere<Prisma.TourWhereInput>({ orderId: order.id, deletedAt: null }, user),
    select: { id: true },
  });
  return tour?.id || null;
}

export async function resolveInvoiceCustomerScope(
  tx: Prisma.TransactionClient,
  invoice: { customerId: string | null; orderId: string | null; receiptId?: string | null },
  user?: RequestUser,
) {
  if (invoice.customerId) {
    const customer = await tx.customer.findFirst({
      where: branchDepartmentScopeWhere<Prisma.CustomerWhereInput>({ id: invoice.customerId, mergedIntoId: null }, user),
      select: { id: true, branch: true, department: true },
    });
    if (!customer) throw new BadRequestException('Khách hàng của hóa đơn nằm ngoài phạm vi dữ liệu được phép');
    return { customerId: customer.id, branch: customer.branch, department: customer.department };
  }
  if (invoice.orderId) {
    const order = await tx.order.findFirst({
      where: branchDepartmentScopeWhere<Prisma.OrderWhereInput>({ id: invoice.orderId, deletedAt: null }, user),
      select: { customerId: true, branch: true, department: true },
    });
    if (!order) throw new BadRequestException('Booking của hóa đơn nằm ngoài phạm vi dữ liệu được phép');
    if (order.customerId) return { customerId: order.customerId, branch: order.branch, department: order.department };
  }
  if (invoice.receiptId) {
    const receipt = await tx.financeReceipt.findFirst({
      where: branchDepartmentScopeWhere<Prisma.FinanceReceiptWhereInput>({ id: invoice.receiptId, deletedAt: null }, user),
      select: { customerId: true, branch: true, department: true },
    });
    if (!receipt) throw new BadRequestException('Phiếu thu của hóa đơn nằm ngoài phạm vi dữ liệu được phép');
    if (receipt.customerId) return { customerId: receipt.customerId, branch: receipt.branch, department: receipt.department };
  }
  return { customerId: null, branch: null, department: null };
}

export async function assertReceiptOrderLinks(
  tx: Prisma.TransactionClient,
  receipt: { customerId?: string | null; orders?: { orderId?: string | null }[] },
  user?: RequestUser,
) {
  if (receipt.customerId) {
    const customer = await tx.customer.findFirst({
      where: branchDepartmentScopeWhere<Prisma.CustomerWhereInput>({ id: receipt.customerId, mergedIntoId: null }, user),
      select: { id: true },
    });
    if (!customer) throw new BadRequestException('Khách hàng của phiếu thu không hợp lệ hoặc nằm ngoài phạm vi dữ liệu được phép');
  }
  const orderIds = Array.from(new Set((receipt.orders || []).map((line) => line.orderId).filter((orderId): orderId is string => Boolean(orderId))));
  if (!orderIds.length) return;

  const orders = await tx.order.findMany({
    where: branchDepartmentScopeWhere<Prisma.OrderWhereInput>({ id: { in: orderIds }, deletedAt: null }, user),
    select: { id: true, customerId: true },
  });
  if (orders.length !== orderIds.length) throw new BadRequestException('Phiếu thu chứa booking không hợp lệ hoặc ngoài phạm vi dữ liệu được phép');
  if (receipt.customerId && orders.some((order) => order.customerId && order.customerId !== receipt.customerId)) {
    throw new BadRequestException('Khách hàng phiếu thu không khớp khách hàng của booking');
  }
}

export async function assertPaymentLinks(
  tx: Prisma.TransactionClient,
  payment: { supplierId?: string | null; operationVoucherId?: string | null; orderId?: string | null; tourId?: string | null },
  user?: RequestUser,
) {
  if (payment.supplierId) {
    const supplier = await tx.supplier.findFirst({ where: { id: payment.supplierId, deletedAt: null }, select: { id: true } });
    if (!supplier) throw new BadRequestException('Nhà cung cấp của phiếu chi không hợp lệ');
  }
  if (payment.tourId) await resolveTourId(tx, { tourId: payment.tourId }, user);
  if (payment.orderId) {
    const order = await tx.order.findFirst({
      where: branchDepartmentScopeWhere<Prisma.OrderWhereInput>({ id: payment.orderId, deletedAt: null }, user),
      select: { id: true },
    });
    if (!order) throw new BadRequestException('Phiếu chi chứa booking không hợp lệ hoặc ngoài phạm vi dữ liệu được phép');
  }
  if (!payment.operationVoucherId) return;

  const voucher = await tx.operationVoucher.findFirst({ where: { id: payment.operationVoucherId, deletedAt: null }, select: { supplierId: true, orderId: true, tourId: true } });
  if (!voucher) throw new BadRequestException('Phiếu chi chứa phiếu điều hành không hợp lệ');
  if (voucher.orderId) {
    const order = await tx.order.findFirst({
      where: branchDepartmentScopeWhere<Prisma.OrderWhereInput>({ id: voucher.orderId, deletedAt: null }, user),
      select: { id: true },
    });
    if (!order) throw new BadRequestException('Phiếu điều hành liên kết booking ngoài phạm vi dữ liệu được phép');
  } else if (voucher.tourId) {
    await resolveTourId(tx, { tourId: voucher.tourId }, user);
  }
  if (payment.supplierId && voucher.supplierId && payment.supplierId !== voucher.supplierId) {
    throw new BadRequestException('Nhà cung cấp phiếu chi không khớp phiếu điều hành');
  }
  if (payment.orderId && voucher.orderId && payment.orderId !== voucher.orderId) {
    throw new BadRequestException('Booking phiếu chi không khớp phiếu điều hành');
  }
}

export async function assertInvoiceLinks(
  tx: Prisma.TransactionClient,
  invoice: { customerId?: string | null; orderId?: string | null; receiptId?: string | null; tourId?: string | null },
  user?: RequestUser,
) {
  let resolvedCustomerId = invoice.customerId || null;
  if (invoice.customerId) {
    const customer = await tx.customer.findFirst({
      where: branchDepartmentScopeWhere<Prisma.CustomerWhereInput>({ id: invoice.customerId, mergedIntoId: null }, user),
      select: { id: true },
    });
    if (!customer) throw new BadRequestException('Khách hàng hóa đơn không hợp lệ hoặc nằm ngoài phạm vi dữ liệu được phép');
  }
  if (invoice.tourId) await resolveTourId(tx, { tourId: invoice.tourId }, user);
  if (invoice.orderId) {
    const order = await tx.order.findFirst({
      where: branchDepartmentScopeWhere<Prisma.OrderWhereInput>({ id: invoice.orderId, deletedAt: null }, user),
      select: { customerId: true },
    });
    if (!order) throw new BadRequestException('Hóa đơn chứa booking không hợp lệ hoặc ngoài phạm vi dữ liệu được phép');
    if (resolvedCustomerId && order.customerId && resolvedCustomerId !== order.customerId) {
      throw new BadRequestException('Khách hàng hóa đơn không khớp khách hàng của booking');
    }
    resolvedCustomerId ||= order.customerId;
  }
  if (invoice.receiptId) {
    const receipt = await tx.financeReceipt.findFirst({
      where: branchDepartmentScopeWhere<Prisma.FinanceReceiptWhereInput>({ id: invoice.receiptId, deletedAt: null }, user),
      include: { orders: true },
    });
    if (!receipt) throw new BadRequestException('Hóa đơn chứa phiếu thu không hợp lệ hoặc ngoài phạm vi dữ liệu được phép');
    const receiptCustomerId = await resolveReceiptCustomer(tx, receipt, user);
    if (resolvedCustomerId && receiptCustomerId && resolvedCustomerId !== receiptCustomerId) {
      throw new BadRequestException('Khách hàng hóa đơn không khớp khách hàng của phiếu thu');
    }
  }
}

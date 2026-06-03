import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CreateOrderDto } from './dto/order.dto';

export async function withCustomerSnapshot(tx: Prisma.TransactionClient, dto: Partial<CreateOrderDto>) {
  const customerId = text(dto.customerId);
  if (!customerId) return dto;
  const customer = await tx.customer.findUnique({
    where: { id: customerId },
    select: { id: true, fullName: true, phone: true, email: true, address: true, kind: true, type: { select: { name: true } } },
  });
  if (!customer) throw new NotFoundException('Không tìm thấy khách hàng');
  return {
    ...dto,
    customerId,
    customerName: dto.customerName ?? customer.fullName,
    customerPhone: dto.customerPhone ?? customer.phone,
    customerEmail: dto.customerEmail ?? customer.email ?? undefined,
    customerAddress: dto.customerAddress ?? customer.address ?? undefined,
    customerType: dto.customerType ?? customer.type?.name ?? customer.kind,
  };
}

function text(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

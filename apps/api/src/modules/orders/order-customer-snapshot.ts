import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CreateOrderDto } from './dto/order.dto';

@Injectable()
export class OrderCustomerSnapshotService {
  withSnapshot(tx: Prisma.TransactionClient, dto: Partial<CreateOrderDto>) {
    return withCustomerSnapshot(tx, dto);
  }
}

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
    customerName: text(dto.customerName) ?? customer.fullName,
    customerPhone: text(dto.customerPhone) ?? customer.phone,
    customerEmail: text(dto.customerEmail) ?? customer.email ?? undefined,
    customerAddress: text(dto.customerAddress) ?? customer.address ?? undefined,
    customerType: text(dto.customerType) ?? customer.type?.name ?? customer.kind,
  };
}

function text(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

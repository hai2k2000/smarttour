import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

type LinkLine = { id?: string | null; supplierId?: string | null; serviceId?: string | null };
type LinkInput = { salesItems?: LinkLine[]; operationItems?: LinkLine[] };
type LinkCollection = 'salesItems' | 'operationItems';

const LINK_COLLECTIONS: LinkCollection[] = ['salesItems', 'operationItems'];

function text(value?: string | null) {
  return value?.trim() || '';
}

function linkKey(supplierId: string, serviceId: string) {
  return `${supplierId}:${serviceId}`;
}

function rowKey(collection: LinkCollection, id: string) {
  return `${collection}:${id}`;
}

function scopedLinks(input?: LinkInput) {
  return LINK_COLLECTIONS.flatMap((collection) =>
    (input?.[collection] || []).map((line) => ({
      collection,
      id: text(line.id),
      supplierId: text(line.supplierId),
      serviceId: text(line.serviceId),
    })),
  );
}

function existingLinkKeys(current?: LinkInput) {
  return new Map(
    scopedLinks(current)
      .filter((line) => line.id)
      .map((line) => [rowKey(line.collection, line.id), linkKey(line.supplierId, line.serviceId)]),
  );
}

export async function assertHotelOrderSupplierServiceLinks(
  tx: Prisma.TransactionClient,
  type: string,
  input: LinkInput,
  current?: LinkInput,
) {
  const isHotelBooking = type === 'HOTEL_BOOKING';
  if (!isHotelBooking) return;

  const lines = scopedLinks(input).filter((line) => line.supplierId || line.serviceId);
  if (!lines.length) return;

  const existingLinks = existingLinkKeys(current);
  const supplierIds = Array.from(new Set(lines.map((line) => line.supplierId).filter(Boolean)));
  const serviceIds = Array.from(new Set(lines.map((line) => line.serviceId).filter(Boolean)));
  const [suppliers, services] = await Promise.all([
    tx.supplier.findMany({
      where: { id: { in: supplierIds } },
      select: { id: true, status: true, deletedAt: true, hotelProfile: { select: { id: true } } },
    }),
    tx.supplierService.findMany({
      where: { id: { in: serviceIds } },
      select: { id: true, supplierId: true, status: true, deletedAt: true },
    }),
  ]);
  const supplierById = new Map(suppliers.map((supplier) => [supplier.id, supplier]));
  const serviceById = new Map(services.map((service) => [service.id, service]));

  for (const { collection, id, supplierId, serviceId } of lines) {
    if (!supplierId) throw new BadRequestException('Dịch vụ phòng phải có nhà cung cấp khách sạn');
    const supplier = supplierById.get(supplierId);
    if (!supplier) throw new BadRequestException('Nhà cung cấp dịch vụ phòng không tồn tại');
    const isUnchangedHistorical = Boolean(
      id && existingLinks.get(rowKey(collection, id)) === linkKey(supplierId, serviceId),
    );

    if (serviceId) {
      const service = serviceById.get(serviceId);
      if (!service) throw new BadRequestException('Dịch vụ phòng không tồn tại');
      if (service.supplierId !== supplierId) throw new BadRequestException('Dịch vụ phòng không thuộc nhà cung cấp đã chọn');
      if (isUnchangedHistorical) continue;
      if (service.status !== 'ACTIVE' || service.deletedAt) throw new BadRequestException('Dịch vụ phòng đang ngừng hoạt động');
    } else if (isUnchangedHistorical) {
      continue;
    }

    if (supplier.status !== 'ACTIVE' || supplier.deletedAt) throw new BadRequestException('Nhà cung cấp khách sạn đang ngừng hoạt động');
    if (!supplier.hotelProfile) throw new BadRequestException('Nhà cung cấp đã chọn không phải khách sạn');
  }
}

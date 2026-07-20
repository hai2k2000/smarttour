import { PrismaService } from '../../database/prisma.service';

export function listHotelServiceOptions(prisma: PrismaService) {
  return prisma.supplier.findMany({
    where: {
      deletedAt: null,
      status: 'ACTIVE',
      hotelProfile: { isNot: null },
    },
    select: {
      id: true,
      supplierCode: true,
      name: true,
      province: true,
      hotelProfile: { select: { hotelProject: true, classHotel: true } },
      supplierServices: {
        where: { deletedAt: null, status: 'ACTIVE' },
        select: { id: true, sku: true, serviceName: true, netPrice: true, sellingPrice: true, status: true },
        orderBy: [{ serviceName: 'asc' }, { id: 'asc' }],
      },
      allotments: {
        where: { status: 'ACTIVE' },
        select: {
          id: true,
          serviceId: true,
          serviceName: true,
          startDate: true,
          endDate: true,
          dayType: true,
          allotmentQty: true,
          bookedQty: true,
          lockedQty: true,
          cutoffDays: true,
          netCostPerDay: true,
          sellingPricePerDay: true,
          status: true,
        },
        orderBy: [{ startDate: 'asc' }, { serviceName: 'asc' }],
      },
    },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    take: 200,
  });
}

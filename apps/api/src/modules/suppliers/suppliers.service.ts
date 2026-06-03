import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SupplierStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { applyWriteDataScope, branchDepartmentScopeWhere, hasUnrestrictedDataScope, RequestUser, userPermissions } from '../auth/data-scope';
import { CreateSupplierCategoryDto } from './dto/create-supplier-category.dto';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { CreateGenericSupplierDto, UpdateGenericSupplierDto } from './dto/generic-supplier.dto';
import { CreateHotelSupplierDto, LockAllotmentDto, OverrideAllotmentDto, ReleaseAllotmentDto, UpdateHotelSupplierDto } from './dto/hotel-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';

const SUPPLIER_TYPE_LABELS: Record<string, string> = {
  restaurants: 'Restaurant',
  flights: 'Flight',
  'attraction-tickets': 'Attraction Ticket',
  'landtour-suppliers': 'LandTour Supplier',
  water: 'Water',
  transport: 'Transport',
  bus: 'Bus',
  other: 'Other Cost',
  villas: 'Villa',
  passport: 'Passport Visa',
  guides: 'Tour Guide',
  'series-tickets': 'Series Ticket',
};

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  listCategories() {
    return this.prisma.supplierCategory.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { suppliers: true } } },
    });
  }

  async createCategory(dto: CreateSupplierCategoryDto) {
    try {
      return await this.prisma.supplierCategory.create({ data: { name: dto.name.trim() } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Loại nhà cung cấp đã tồn tại');
      }
      throw error;
    }
  }

  listSuppliers(search?: string, categoryId?: string) {
    const where: Prisma.SupplierWhereInput = {
      deletedAt: null,
      ...(categoryId ? { categoryId } : {}),
      ...(search
        ? {
            OR: [
              { supplierCode: { contains: search, mode: 'insensitive' } },
              { name: { contains: search, mode: 'insensitive' } },
              { taxCode: { contains: search, mode: 'insensitive' } },
              { contactPerson: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    return this.prisma.supplier.findMany({
      where,
      include: { category: true },
      orderBy: [{ updatedAt: 'desc' }, { name: 'asc' }],
    });
  }

  async getSupplier(id: string) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id },
      include: {
        category: true,
        hotelProfile: true,
        contacts: true,
        supplierServices: true,
        allotments: true,
        files: true,
        services: true,
        paymentItems: true,
      },
    });
    if (!supplier || supplier.deletedAt) throw new NotFoundException('Không tìm thấy nhà cung cấp');
    return supplier;
  }

  async createSupplier(dto: CreateSupplierDto) {
    await this.ensureCategory(dto.categoryId);
    return this.prisma.supplier.create({
      data: this.toSupplierData(dto) as Prisma.SupplierUncheckedCreateInput,
      include: { category: true },
    });
  }

  async updateSupplier(id: string, dto: UpdateSupplierDto) {
    await this.getSupplier(id);
    if (dto.categoryId) await this.ensureCategory(dto.categoryId);
    return this.prisma.supplier.update({
      where: { id },
      data: this.toSupplierData(dto) as Prisma.SupplierUncheckedUpdateInput,
      include: { category: true },
    });
  }

  async deleteSupplier(id: string) {
    await this.getSupplier(id);
    return this.prisma.supplier.update({ where: { id }, data: { deletedAt: new Date(), status: 'INACTIVE' }, include: { category: true } });
  }

  async updateSupplierStatus(id: string, status: SupplierStatus) {
    await this.getSupplier(id);
    return this.prisma.supplier.update({
      where: { id },
      data: { status },
      include: { category: true, hotelProfile: true },
    });
  }

  async listTypedSuppliers(type: string, query: { search?: string; province?: string; status?: SupplierStatus; market?: string }) {
    const categoryName = this.getTypeLabel(type);
    const where: Prisma.SupplierWhereInput = {
      deletedAt: null,
      category: { name: categoryName },
      ...(query.province ? { province: { contains: query.province, mode: 'insensitive' } } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.market ? { market: { contains: query.market, mode: 'insensitive' } } : {}),
      ...(query.search
        ? {
            OR: [
              { supplierCode: { contains: query.search, mode: 'insensitive' } },
              { name: { contains: query.search, mode: 'insensitive' } },
              { taxCode: { contains: query.search, mode: 'insensitive' } },
              { phone: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    return this.prisma.supplier.findMany({
      where,
      include: this.genericInclude(),
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }, { name: 'asc' }],
    });
  }

  async getTypedSupplier(type: string, id: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, category: { name: this.getTypeLabel(type) } },
      include: this.genericInclude(),
    });
    if (!supplier || supplier.deletedAt) throw new NotFoundException('Không tìm thấy nhà cung cấp');
    return supplier;
  }

  async createTypedSupplier(type: string, dto: CreateGenericSupplierDto) {
    const category = await this.ensureCategoryByName(this.getTypeLabel(type));
    try {
      return await this.prisma.$transaction(async (tx) => {
        const supplier = await tx.supplier.create({
          data: {
            ...this.toSupplierData(dto),
            category: { connect: { id: category.id } },
          } as Prisma.SupplierCreateInput,
        });
        await this.replaceGenericChildren(tx, supplier.id, dto);
        return tx.supplier.findUniqueOrThrow({ where: { id: supplier.id }, include: this.genericInclude() });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Mã nhà cung cấp đã tồn tại');
      }
      throw error;
    }
  }

  async updateTypedSupplier(type: string, id: string, dto: UpdateGenericSupplierDto) {
    await this.getTypedSupplier(type, id);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.supplier.update({
          where: { id },
          data: this.toSupplierData(dto) as Prisma.SupplierUncheckedUpdateInput,
        });
        await this.replaceGenericChildren(tx, id, dto);
        return tx.supplier.findUniqueOrThrow({ where: { id }, include: this.genericInclude() });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Mã nhà cung cấp đã tồn tại');
      }
      throw error;
    }
  }

  async updateTypedSupplierStatus(type: string, id: string, status: SupplierStatus) {
    await this.getTypedSupplier(type, id);
    return this.updateSupplierStatus(id, status);
  }

  async listHotelSuppliers(query: {
    search?: string;
    province?: string;
    hotelProject?: string;
    classHotel?: string;
    status?: SupplierStatus;
    market?: string;
  }) {
    const where: Prisma.SupplierWhereInput = {
      deletedAt: null,
      hotelProfile: {
        is: {
          ...(query.hotelProject ? { hotelProject: { contains: query.hotelProject, mode: 'insensitive' } } : {}),
          ...(query.classHotel ? { classHotel: { contains: query.classHotel, mode: 'insensitive' } } : {}),
          ...(query.market ? { market: { contains: query.market, mode: 'insensitive' } } : {}),
        },
      },
      ...(query.province ? { province: { contains: query.province, mode: 'insensitive' } } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { supplierCode: { contains: query.search, mode: 'insensitive' } },
              { name: { contains: query.search, mode: 'insensitive' } },
              { taxCode: { contains: query.search, mode: 'insensitive' } },
              { phone: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    return this.prisma.supplier.findMany({
      where,
      include: this.hotelInclude(),
      orderBy: [{ updatedAt: 'desc' }, { name: 'asc' }],
    });
  }

  async getHotelSupplier(id: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, hotelProfile: { isNot: null } },
      include: this.hotelInclude(),
    });
    if (!supplier || supplier.deletedAt) throw new NotFoundException('Hotel supplier not found');
    return supplier;
  }

  async createHotelSupplier(dto: CreateHotelSupplierDto) {
    const category = await this.ensureCategoryByName('Hotel');
    try {
      return await this.prisma.$transaction(async (tx) => {
        const supplier = await tx.supplier.create({
          data: {
            ...this.toSupplierData({
              supplierCode: dto.supplierCode,
              name: dto.name,
              taxCode: dto.taxCode,
              phone: dto.phone,
              email: dto.email,
              country: dto.country,
              province: dto.province,
              address: dto.address,
              website: dto.website,
              notes: dto.notes,
              status: dto.status,
            }),
            category: { connect: { id: category.id } },
            hotelProfile: { create: this.toHotelProfileData(dto) },
          } as Prisma.SupplierCreateInput,
        });

        await this.replaceHotelChildren(tx, supplier.id, dto);
        return tx.supplier.findUniqueOrThrow({ where: { id: supplier.id }, include: this.hotelInclude() });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Mã nhà cung cấp đã tồn tại');
      }
      throw error;
    }
  }

  async updateHotelSupplier(id: string, dto: UpdateHotelSupplierDto) {
    await this.getHotelSupplier(id);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.supplier.update({
          where: { id },
          data: {
            ...this.toSupplierData(dto),
            hotelProfile: { update: this.toHotelProfileData(dto) },
          } as Prisma.SupplierUncheckedUpdateInput,
        });

        await this.replaceHotelChildren(tx, id, dto);
        return tx.supplier.findUniqueOrThrow({ where: { id }, include: this.hotelInclude() });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Mã nhà cung cấp đã tồn tại');
      }
      throw error;
    }
  }

  async allotmentDashboard() {
    const allotments = await this.prisma.supplierAllotment.findMany({
      where: { status: 'ACTIVE' },
      include: { supplier: true, allocations: true },
    });
    const totals = allotments.reduce(
      (acc, item) => {
        const allotmentQty = item.allotmentQty || item.quantityLock || 0;
        const lockedQty = item.lockedQty || item.quantityLock || 0;
        const remainingQty = Math.max(0, allotmentQty - item.bookedQty - lockedQty);
        acc.allotmentQty += allotmentQty;
        acc.bookedQty += item.bookedQty;
        acc.lockedQty += lockedQty;
        acc.remainingQty += remainingQty;
        acc.revenue += item.bookedQty * Number(item.sellingPricePerDay || 0);
        return acc;
      },
      { allotmentQty: 0, bookedQty: 0, lockedQty: 0, remainingQty: 0, revenue: 0 },
    );
    return {
      ...totals,
      occupancyRate: totals.allotmentQty ? (totals.bookedQty / totals.allotmentQty) * 100 : 0,
      sellThroughRate: totals.allotmentQty ? ((totals.bookedQty + totals.lockedQty) / totals.allotmentQty) * 100 : 0,
    };
  }

  async listAllotmentInventory(query: { supplierId?: string; startDate?: string; endDate?: string }) {
    const today = new Date();
    const allotments = await this.prisma.supplierAllotment.findMany({
      where: {
        ...(query.supplierId ? { supplierId: query.supplierId } : {}),
        ...(query.startDate || query.endDate
          ? {
              AND: [
                query.endDate ? { OR: [{ startDate: null }, { startDate: { lte: new Date(query.endDate) } }] } : {},
                query.startDate ? { OR: [{ endDate: null }, { endDate: { gte: new Date(query.startDate) } }] } : {},
              ],
            }
          : {}),
      },
      include: { supplier: true, logs: { orderBy: { createdAt: 'desc' }, take: 5 }, allocations: true },
      orderBy: [{ startDate: 'asc' }, { updatedAt: 'desc' }],
    });
    return allotments.map((item) => this.toAllotmentInventory(item, today));
  }

  async overrideAllotment(id: string, dto: OverrideAllotmentDto) {
    const current = await this.prisma.supplierAllotment.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Allotment not found');
    const next = {
      allotmentQty: dto.allotmentQty ?? current.allotmentQty,
      bookedQty: dto.bookedQty ?? current.bookedQty,
      lockedQty: dto.lockedQty ?? current.lockedQty,
      status: dto.status ?? current.status,
    };
    if (next.bookedQty + next.lockedQty > next.allotmentQty && next.status !== 'STOP_SELL') {
      throw new BadRequestException('Booked plus locked quantity cannot exceed allotment quantity');
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.supplierAllotment.update({
        where: { id },
        data: next,
        include: { supplier: true, logs: { orderBy: { createdAt: 'desc' }, take: 5 } },
      });
      await tx.supplierAllotmentLog.create({
        data: {
          allotmentId: id,
          supplierId: current.supplierId,
          action: 'OVERRIDE',
          oldValue: {
            allotmentQty: current.allotmentQty,
            bookedQty: current.bookedQty,
            lockedQty: current.lockedQty,
            status: current.status,
          },
          newValue: next,
          note: this.optionalText(dto.note),
          actor: this.optionalText(dto.actor),
        },
      });
      return this.toAllotmentInventory(updated, new Date());
    });
  }

  async lockAllotment(id: string, dto: LockAllotmentDto, user?: RequestUser) {
    const quantity = dto.quantity ?? 1;
    const current = await this.prisma.supplierAllotment.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Allotment not found');
    if (current.status !== 'ACTIVE') throw new BadRequestException('Allotment is not active');
    await this.ensureAllocationLinks(dto, user);
    if (dto.serviceId && current.serviceId && dto.serviceId !== current.serviceId) {
      throw new BadRequestException('Service does not match allotment');
    }
    const allotmentQty = current.allotmentQty || current.quantityLock || 0;
    if (current.bookedQty + current.lockedQty + quantity > allotmentQty) {
      throw new BadRequestException('Not enough allotment quantity');
    }
    return this.prisma.$transaction(async (tx) => {
      const allocation = await tx.supplierAllotmentAllocation.create({
        data: {
          allotmentId: id,
          supplierId: current.supplierId,
          serviceId: this.optionalText(dto.serviceId) ?? current.serviceId,
          orderId: this.optionalText(dto.orderId),
          bookingId: this.optionalText(dto.bookingId),
          tourId: this.optionalText(dto.tourId),
          quantity,
          status: 'LOCKED',
          lockedAt: new Date(),
          note: this.optionalText(dto.note),
          createdBy: this.optionalText(dto.actor),
        },
      });
      const updated = await tx.supplierAllotment.update({
        where: { id },
        data: { lockedQty: { increment: quantity } },
        include: { supplier: true, logs: { orderBy: { createdAt: 'desc' }, take: 5 }, allocations: true },
      });
      await tx.supplierAllotmentLog.create({
        data: { allotmentId: id, supplierId: current.supplierId, action: 'LOCK', oldValue: { lockedQty: current.lockedQty }, newValue: { allocationId: allocation.id, quantity }, note: this.optionalText(dto.note), actor: this.optionalText(dto.actor) },
      });
      return { allocation, inventory: this.toAllotmentInventory(updated, new Date()) };
    });
  }

  async confirmAllotmentAllocation(id: string, dto: ReleaseAllotmentDto, user?: RequestUser) {
    return this.changeAllotmentAllocation(id, 'CONFIRMED', dto, user);
  }

  async releaseAllotmentAllocation(id: string, dto: ReleaseAllotmentDto, user?: RequestUser) {
    return this.changeAllotmentAllocation(id, 'RELEASED', dto, user);
  }

  private async changeAllotmentAllocation(id: string, nextStatus: 'CONFIRMED' | 'RELEASED', dto: ReleaseAllotmentDto, user?: RequestUser) {
    const allocation = await this.prisma.supplierAllotmentAllocation.findUnique({ where: { id }, include: { allotment: true } });
    if (!allocation) throw new NotFoundException('Allotment allocation not found');
    await this.ensureAllocationScoped(allocation, user);
    if (allocation.status === nextStatus) return allocation;
    if (!['LOCKED', 'CONFIRMED'].includes(allocation.status)) {
      throw new BadRequestException('Allocation cannot be changed from current status');
    }
    if (nextStatus === 'CONFIRMED' && allocation.status !== 'LOCKED') {
      throw new BadRequestException('Only locked allocations can be confirmed');
    }
    return this.prisma.$transaction(async (tx) => {
      const allotmentUpdate =
        nextStatus === 'CONFIRMED'
          ? { lockedQty: { decrement: allocation.quantity }, bookedQty: { increment: allocation.quantity } }
          : allocation.status === 'CONFIRMED'
            ? { bookedQty: { decrement: allocation.quantity } }
            : { lockedQty: { decrement: allocation.quantity } };
      const updatedAllocation = await tx.supplierAllotmentAllocation.update({
        where: { id },
        data: {
          status: nextStatus,
          ...(nextStatus === 'CONFIRMED' ? { confirmedAt: new Date() } : { releasedAt: new Date() }),
          note: this.optionalText(dto.note) ?? allocation.note,
        },
      });
      const updated = await tx.supplierAllotment.update({
        where: { id: allocation.allotmentId },
        data: allotmentUpdate,
        include: { supplier: true, logs: { orderBy: { createdAt: 'desc' }, take: 5 }, allocations: true },
      });
      await tx.supplierAllotmentLog.create({
        data: {
          allotmentId: allocation.allotmentId,
          supplierId: allocation.supplierId,
          action: nextStatus,
          oldValue: { allocationId: id, status: allocation.status },
          newValue: { allocationId: id, status: nextStatus, quantity: allocation.quantity },
          note: this.optionalText(dto.note),
          actor: this.optionalText(dto.actor),
        },
      });
      return { allocation: updatedAllocation, inventory: this.toAllotmentInventory(updated, new Date()) };
    });
  }

  private async ensureAllocationLinks(dto: LockAllotmentDto, user?: RequestUser) {
    if (this.requiresScopedOperationalLink(user) && !dto.orderId && !dto.bookingId && !dto.tourId) {
      throw new BadRequestException('orderId, bookingId or tourId is required for scoped allotment writes');
    }
    if (dto.serviceId) await this.ensureExists('supplierService', dto.serviceId, 'Không tìm thấy dịch vụ nhà cung cấp');
    if (dto.orderId) await this.ensureExists('order', dto.orderId, 'Không tìm thấy đơn hàng', user);
    if (dto.bookingId) await this.ensureExists('booking', dto.bookingId, 'Không tìm thấy booking', user);
    if (dto.tourId) await this.ensureExists('tour', dto.tourId, 'Tour not found', user);
  }

  private async ensureExists(model: 'supplierService' | 'order' | 'booking' | 'tour', id: string, message: string, user?: RequestUser) {
    const row =
      model === 'supplierService'
        ? await this.prisma.supplierService.findUnique({ where: { id }, select: { id: true } })
        : model === 'order'
          ? await this.prisma.order.findFirst({ where: branchDepartmentScopeWhere({ id }, user), select: { id: true } })
          : model === 'booking'
            ? await this.prisma.booking.findFirst({ where: this.bookingScopeWhere({ id }, user), select: { id: true } })
            : await this.prisma.tour.findFirst({ where: branchDepartmentScopeWhere({ id }, user), select: { id: true } });
    if (!row) throw new NotFoundException(message);
  }

  private async ensureAllocationScoped(
    allocation: { orderId: string | null; bookingId: string | null; tourId: string | null },
    user?: RequestUser,
  ) {
    if (!this.requiresScopedOperationalLink(user)) return;
    const [order, booking, tour] = await Promise.all([
      allocation.orderId ? this.prisma.order.findFirst({ where: branchDepartmentScopeWhere({ id: allocation.orderId }, user), select: { id: true } }) : null,
      allocation.bookingId ? this.prisma.booking.findFirst({ where: this.bookingScopeWhere({ id: allocation.bookingId }, user), select: { id: true } }) : null,
      allocation.tourId ? this.prisma.tour.findFirst({ where: branchDepartmentScopeWhere({ id: allocation.tourId }, user), select: { id: true } }) : null,
    ]);
    if (!order && !booking && !tour) throw new NotFoundException('Allotment allocation not found');
  }

  private requiresScopedOperationalLink(user?: RequestUser) {
    if (!user || hasUnrestrictedDataScope(user)) return false;
    applyWriteDataScope({ branch: undefined, department: undefined }, user);
    return true;
  }

  private bookingScopeWhere(where: Prisma.BookingWhereInput, user?: RequestUser): Prisma.BookingWhereInput {
    if (!user || hasUnrestrictedDataScope(user)) return where;
    const permissions = userPermissions(user);
    const OR: Prisma.BookingWhereInput[] = [];
    if (permissions.has('data.scope.branch') && user.branch) OR.push({ customer: { branch: user.branch } }, { order: { branch: user.branch } }, { tour: { branch: user.branch } });
    if (permissions.has('data.scope.department') && user.department) OR.push({ customer: { department: user.department } }, { order: { department: user.department } }, { tour: { department: user.department } });
    if (!OR.length) return { AND: [where, { id: '__no_data_scope__' }] };
    return { AND: [where, { OR }] };
  }

  private async ensureCategory(id: string) {
    const category = await this.prisma.supplierCategory.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('Không tìm thấy loại nhà cung cấp');
  }

  private async ensureCategoryByName(name: string) {
    return this.prisma.supplierCategory.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  private toSupplierData(dto: UpdateSupplierDto & Partial<CreateHotelSupplierDto & CreateGenericSupplierDto>) {
    return {
      ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
      ...(dto.supplierCode !== undefined ? { supplierCode: this.optionalText(dto.supplierCode) } : {}),
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.taxCode !== undefined ? { taxCode: this.optionalText(dto.taxCode) } : {}),
      ...(dto.contactPerson !== undefined ? { contactPerson: this.optionalText(dto.contactPerson) } : {}),
      ...(dto.phone !== undefined ? { phone: this.optionalText(dto.phone) } : {}),
      ...(dto.email !== undefined ? { email: this.optionalText(dto.email) } : {}),
      ...(dto.country !== undefined ? { country: this.optionalText(dto.country) } : {}),
      ...(dto.province !== undefined ? { province: this.optionalText(dto.province) } : {}),
      ...(dto.address !== undefined ? { address: this.optionalText(dto.address) } : {}),
      ...(dto.website !== undefined ? { website: this.optionalText(dto.website) } : {}),
      ...(dto.link !== undefined ? { link: this.optionalText(dto.link) } : {}),
      ...(dto.rating !== undefined ? { rating: this.optionalNumber(dto.rating) } : {}),
      ...(dto.market !== undefined ? { market: this.optionalText(dto.market) } : {}),
      ...(dto.bankAccountName !== undefined ? { bankAccountName: this.optionalText(dto.bankAccountName) } : {}),
      ...(dto.bankAccountNumber !== undefined ? { bankAccountNumber: this.optionalText(dto.bankAccountNumber) } : {}),
      ...(dto.bankName !== undefined ? { bankName: this.optionalText(dto.bankName) } : {}),
      ...(dto.pricePolicy !== undefined ? { pricePolicy: this.optionalText(dto.pricePolicy) } : {}),
      ...(dto.debtNote !== undefined ? { debtNote: this.optionalText(dto.debtNote) } : {}),
      ...(dto.notes !== undefined ? { notes: this.optionalText(dto.notes) } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
    };
  }

  private toHotelProfileData(dto: Partial<CreateHotelSupplierDto>) {
    return {
      ...(dto.builtYear !== undefined ? { builtYear: this.optionalNumber(dto.builtYear) } : {}),
      ...(dto.rating !== undefined ? { rating: this.optionalNumber(dto.rating) } : {}),
      ...(dto.classHotel !== undefined ? { classHotel: dto.classHotel.trim() } : {}),
      ...(dto.hotelProject !== undefined ? { hotelProject: dto.hotelProject.trim() } : {}),
      ...(dto.bankAccountName !== undefined ? { bankAccountName: this.optionalText(dto.bankAccountName) } : {}),
      ...(dto.bankAccountNumber !== undefined ? { bankAccountNumber: this.optionalText(dto.bankAccountNumber) } : {}),
      ...(dto.bankName !== undefined ? { bankName: this.optionalText(dto.bankName) } : {}),
      ...(dto.market !== undefined ? { market: this.optionalText(dto.market) } : {}),
      ...(dto.link !== undefined ? { link: this.optionalText(dto.link) } : {}),
    };
  }

  private async replaceHotelChildren(
    tx: Prisma.TransactionClient,
    supplierId: string,
    dto: Partial<CreateHotelSupplierDto>,
  ) {
    if (dto.contacts) {
      await tx.supplierContact.deleteMany({ where: { supplierId } });
      const contacts = dto.contacts.filter((item) => item.fullName?.trim());
      if (contacts.length) {
        await tx.supplierContact.createMany({
          data: contacts.map((item) => ({
            supplierId,
            fullName: item.fullName.trim(),
            position: this.optionalText(item.position),
            birthday: this.optionalDate(item.birthday),
            phone: this.optionalText(item.phone),
            email: this.optionalText(item.email),
          })),
        });
      }
    }

    if (dto.services) {
      await tx.supplierService.deleteMany({ where: { supplierId } });
      const services = dto.services.filter((item) => item.serviceName?.trim());
      if (services.length) {
        await tx.supplierService.createMany({
          data: services.map((item) => ({
            supplierId,
            sku: this.optionalText(item.sku),
            serviceName: item.serviceName.trim(),
            startDate: this.optionalDate(item.startDate),
            endDate: this.optionalDate(item.endDate),
            dayType: item.dayType ?? 'ALL_DAYS',
            quantity: 1,
            accountingPrice: item.accountingPrice ?? 0,
            netPrice: item.netPrice ?? 0,
            sellingPrice: item.sellingPrice ?? 0,
            description: this.optionalText(item.description),
            note: this.optionalText(item.note),
          })),
        });
      }
    }

    if (dto.allotments) {
      await tx.supplierAllotment.deleteMany({ where: { supplierId } });
      const allotments = dto.allotments.filter((item) => item.serviceName?.trim());
      if (allotments.length) {
        await tx.supplierAllotment.createMany({
          data: allotments.map((item) => ({
            supplierId,
            sku: this.optionalText(item.sku),
            serviceName: item.serviceName.trim(),
            startDate: this.optionalDate(item.startDate),
            endDate: this.optionalDate(item.endDate),
            dayType: item.dayType ?? 'ALL_DAYS',
            allotmentQty: item.allotmentQty ?? item.quantityLock ?? 0,
            bookedQty: item.bookedQty ?? 0,
            lockedQty: item.lockedQty ?? item.quantityLock ?? 0,
            quantityLock: item.quantityLock ?? 0,
            cutoffDays: item.cutoffDays ?? 0,
            netCostPerDay: item.netCostPerDay ?? 0,
            sellingPricePerDay: item.sellingPricePerDay ?? 0,
            status: item.status || 'ACTIVE',
            description: this.optionalText(item.description),
            note: this.optionalText(item.note),
          })),
        });
      }
    }
  }

  private async replaceGenericChildren(
    tx: Prisma.TransactionClient,
    supplierId: string,
    dto: Partial<CreateGenericSupplierDto>,
  ) {
    if (dto.contacts) {
      await tx.supplierContact.deleteMany({ where: { supplierId } });
      const contacts = dto.contacts.filter((item) => item.fullName?.trim());
      if (contacts.length) {
        await tx.supplierContact.createMany({
          data: contacts.map((item) => ({
            supplierId,
            fullName: item.fullName.trim(),
            position: this.optionalText(item.position),
            birthday: this.optionalDate(item.birthday),
            phone: this.optionalText(item.phone),
            email: this.optionalText(item.email),
          })),
        });
      }
    }

    if (dto.services) {
      await tx.supplierService.deleteMany({ where: { supplierId } });
      const services = dto.services.filter((item) => item.serviceName?.trim());
      if (services.length) {
        await tx.supplierService.createMany({
          data: services.map((item) => ({
            supplierId,
            sku: this.optionalText(item.sku),
            serviceName: item.serviceName.trim(),
            quantity: item.quantity ?? 1,
            accountingPrice: item.accountingPrice ?? 0,
            netPrice: item.netPrice ?? 0,
            sellingPrice: item.sellingPrice ?? 0,
            description: this.optionalText(item.description),
            note: this.optionalText(item.note),
            metadata: item.metadata ? (item.metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
          })),
        });
      }
    }
  }

  private hotelInclude() {
    return {
      category: true,
      hotelProfile: true,
      contacts: { orderBy: { createdAt: 'asc' } },
      supplierServices: { orderBy: { createdAt: 'asc' } },
      allotments: { orderBy: { createdAt: 'asc' }, include: { allocations: { orderBy: { createdAt: 'desc' }, take: 10 }, logs: { orderBy: { createdAt: 'desc' }, take: 3 } } },
      files: { orderBy: { createdAt: 'desc' } },
    } satisfies Prisma.SupplierInclude;
  }

  private toAllotmentInventory(
    item: Prisma.SupplierAllotmentGetPayload<{ include: { supplier: true; logs: true } }> & { allocations?: Array<{ status: string; quantity: number }> },
    today: Date,
  ) {
    const allotmentQty = item.allotmentQty || item.quantityLock || 0;
    const lockedQty = item.lockedQty || item.quantityLock || 0;
    const remainingQty = Math.max(0, allotmentQty - item.bookedQty - lockedQty);
    const codLockUntil = new Date(today);
    codLockUntil.setDate(codLockUntil.getDate() + item.cutoffDays);
    const isCodLocked = item.startDate ? item.startDate <= codLockUntil : false;
    const computedStatus = item.status === 'INACTIVE' ? 'INACTIVE' : remainingQty <= 0 ? 'STOP_SELL' : isCodLocked ? 'COD_LOCKED' : item.status;
    return {
      ...item,
      allotmentQty,
      bookedQty: item.bookedQty,
      lockedQty,
      remainingQty,
      occupancyRate: allotmentQty ? (item.bookedQty / allotmentQty) * 100 : 0,
      sellThroughRate: allotmentQty ? ((item.bookedQty + lockedQty) / allotmentQty) * 100 : 0,
      isCodLocked,
      computedStatus,
      revenue: item.bookedQty * Number(item.sellingPricePerDay || 0),
    };
  }

  private genericInclude() {
    return {
      category: true,
      contacts: { orderBy: { createdAt: 'asc' } },
      supplierServices: { orderBy: { createdAt: 'asc' } },
      files: { orderBy: { createdAt: 'desc' } },
    } satisfies Prisma.SupplierInclude;
  }

  private getTypeLabel(type: string) {
    const categoryName = SUPPLIER_TYPE_LABELS[type];
    if (!categoryName) throw new NotFoundException('Không tìm thấy loại nhà cung cấp');
    return categoryName;
  }

  private optionalText(value?: string) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private optionalNumber(value?: number) {
    return value === undefined || Number.isNaN(value) ? null : value;
  }

  private optionalDate(value?: string) {
    return value ? new Date(value) : null;
  }
}

import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SupplierStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { branchDepartmentScopeWhere, hasUnrestrictedDataScope, RequestUser } from '../auth/data-scope';
import { FilesService } from '../files/files.service';
import { containsSearch, normalizeListSearch } from '../list-search';
import { CreateSupplierCategoryDto } from './dto/create-supplier-category.dto';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { CreateGenericSupplierDto, UpdateGenericSupplierDto } from './dto/generic-supplier.dto';
import { CreateHotelSupplierDto, LockAllotmentDto, OverrideAllotmentDto, ReleaseAllotmentDto, UpdateHotelSupplierDto } from './dto/hotel-supplier.dto';
import { SupplierCategoryListQueryDto, SupplierListQueryDto } from './dto/supplier-query.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { SUPPLIER_TYPE_LABELS } from './supplier-types';

const SPECIALIZED_SUPPLIER_CATEGORY_NAMES = new Set(['Hotel', ...Object.values(SUPPLIER_TYPE_LABELS)]);
const SUPPLIER_PHONE_PATTERN = /^(?=(?:\D*\d){6,15}\D*$)[+\d\s().-]+$/;
const SUPPLIER_ERRORS = {
  categoryNotFound: 'Không tìm thấy loại nhà cung cấp',
  categoryExists: 'Loại nhà cung cấp đã tồn tại',
  supplierNotFound: 'Không tìm thấy nhà cung cấp',
  typedSupplierNotFound: 'Không tìm thấy nhà cung cấp thuộc loại đã chọn',
  hotelSupplierNotFound: 'Không tìm thấy nhà cung cấp khách sạn',
  fileNotFound: 'Không tìm thấy file nhà cung cấp',
  codeExists: 'Mã nhà cung cấp đã tồn tại',
  allotmentNotFound: 'Không tìm thấy quỹ phòng',
  allocationNotFound: 'Không tìm thấy phân bổ quỹ phòng',
  unsupportedType: 'Loại nhà cung cấp không được hỗ trợ',
} as const;

type UploadFile = { originalname: string; mimetype: string; size: number; buffer: Buffer };

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService, private readonly filesService: FilesService) {}

  listCategories(query: SupplierCategoryListQueryDto = {}) {
    const searchText = normalizeListSearch(query.search);
    return this.prisma.supplierCategory.findMany({
      where: {
        ...(searchText ? { name: containsSearch(searchText) } : {}),
        ...(query.includeEmpty === false ? { suppliers: { some: { deletedAt: null } } } : {}),
      },
      orderBy: { name: 'asc' },
      include: { _count: { select: { suppliers: { where: { deletedAt: null } } } } },
    });
  }

  async createCategory(dto: CreateSupplierCategoryDto) {
    const name = this.requiredText(dto.name, 'Cần nhập tên loại nhà cung cấp');
    await this.ensureCategoryNameAvailable(name);
    try {
      return await this.prisma.supplierCategory.create({
        data: { name },
        include: { _count: { select: { suppliers: { where: { deletedAt: null } } } } },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(SUPPLIER_ERRORS.categoryExists);
      }
      throw error;
    }
  }

  async updateCategory(id: string, dto: CreateSupplierCategoryDto) {
    const category = await this.prisma.supplierCategory.findUnique({ where: { id }, select: { id: true, name: true } });
    if (!category) throw new NotFoundException(SUPPLIER_ERRORS.categoryNotFound);
    const name = this.requiredText(dto.name, 'Cần nhập tên loại nhà cung cấp');
    if (SPECIALIZED_SUPPLIER_CATEGORY_NAMES.has(category.name) && name !== category.name) {
      throw new BadRequestException('Không thể đổi tên loại nhà cung cấp hệ thống');
    }
    await this.ensureCategoryNameAvailable(name, id);
    try {
      return await this.prisma.supplierCategory.update({
        where: { id },
        data: { name },
        include: { _count: { select: { suppliers: { where: { deletedAt: null } } } } },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(SUPPLIER_ERRORS.categoryExists);
      }
      throw error;
    }
  }

  async deleteCategory(id: string) {
    const category = await this.prisma.supplierCategory.findUnique({
      where: { id },
      include: { _count: { select: { suppliers: true } } },
    });
    if (!category) throw new NotFoundException(SUPPLIER_ERRORS.categoryNotFound);
    if (SPECIALIZED_SUPPLIER_CATEGORY_NAMES.has(category.name)) {
      throw new BadRequestException('Không thể xóa loại nhà cung cấp hệ thống');
    }
    if (category._count.suppliers > 0) {
      throw new ConflictException('Không thể xóa loại nhà cung cấp đang hoặc đã được gắn với nhà cung cấp');
    }
    return this.prisma.supplierCategory.delete({ where: { id } });
  }

  listSuppliers(query: SupplierListQueryDto = {}) {
    const searchText = normalizeListSearch(query.search);
    const contains = searchText ? containsSearch(searchText) : undefined;
    const where: Prisma.SupplierWhereInput = {
      deletedAt: null,
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.province ? { province: containsSearch(query.province) } : {}),
      ...(query.market ? { market: containsSearch(query.market) } : {}),
      ...(contains
        ? {
            OR: [
              { supplierCode: contains },
              { name: contains },
              { taxCode: contains },
              { contactPerson: contains },
              { phone: contains },
              { email: contains },
              { province: contains },
              { market: contains },
            ],
          }
        : {}),
    };

    return this.prisma.supplier.findMany({
      where,
      include: this.supplierListInclude(),
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
        supplierServices: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' } },
        allotments: true,
        files: true,
        services: true,
        paymentItems: true,
      },
    });
    if (!supplier || supplier.deletedAt) throw new NotFoundException(SUPPLIER_ERRORS.supplierNotFound);
    return supplier;
  }

  async createSupplier(dto: CreateSupplierDto) {
    this.validateSupplierPayload(dto);
    await this.ensureCategory(dto.categoryId);
    await this.ensureSupplierCodeAvailable(dto.supplierCode);
    try {
      return await this.prisma.supplier.create({
        data: this.toSupplierData(dto) as Prisma.SupplierUncheckedCreateInput,
        include: this.supplierListInclude(),
      });
    } catch (error) {
      this.rethrowSupplierUniqueConflict(error);
    }
  }

  async updateSupplier(id: string, dto: UpdateSupplierDto) {
    const current = await this.getSupplier(id);
    this.validateSupplierPayload(dto, true);
    if (dto.categoryId) {
      await this.ensureCategory(dto.categoryId);
      if (dto.categoryId !== current.categoryId && this.isSpecializedSupplier(current)) {
        throw new BadRequestException('Không thể đổi loại của nhà cung cấp chuyên biệt tại màn hình nhà cung cấp tổng. Hãy cập nhật trong phân hệ tương ứng.');
      }
    }
    if (dto.supplierCode !== undefined) await this.ensureSupplierCodeAvailable(dto.supplierCode, id);
    try {
      return await this.prisma.supplier.update({
        where: { id },
        data: this.toSupplierData(dto) as Prisma.SupplierUncheckedUpdateInput,
        include: this.supplierListInclude(),
      });
    } catch (error) {
      this.rethrowSupplierUniqueConflict(error);
    }
  }

  async deleteSupplier(id: string) {
    await this.getSupplier(id);
    const usage = await this.supplierUsage(id);
    if (usage.total > 0) {
      throw new ConflictException(`Không thể xóa nhà cung cấp đang được sử dụng (${this.usageSummary(usage)}). Hãy kiểm tra đơn hàng, điều hành, tài chính hoặc yêu cầu thanh toán liên quan trước khi xóa.`);
    }
    return this.prisma.supplier.update({ where: { id }, data: { deletedAt: new Date(), status: 'INACTIVE' }, include: this.supplierListInclude() });
  }

  async addSupplierFile(id: string, file: UploadFile | undefined, actorId?: string) {
    await this.getSupplier(id);
    const uploadedBy = this.requiredText(actorId, 'Không xác định được người tải file');
    const upload = await this.filesService.upload(file, `suppliers/${id}`, uploadedBy);
    try {
      return await this.prisma.supplierFile.create({
        data: {
          supplierId: id,
          fileName: upload.fileName,
          fileUrl: upload.url,
          fileType: upload.mimeType,
          uploadedBy,
        },
      });
    } catch (error) {
      await this.filesService.removeQuietly(upload.objectKey);
      throw error;
    }
  }

  async deleteSupplierFile(id: string, fileId: string) {
    await this.getSupplier(id);
    const file = await this.prisma.supplierFile.findFirst({ where: { id: fileId, supplierId: id } });
    if (!file) throw new NotFoundException(SUPPLIER_ERRORS.fileNotFound);
    const objectKey = this.filesService.objectKeyFromUrl(file.fileUrl);
    if (objectKey) await this.filesService.remove(objectKey);
    return this.prisma.supplierFile.delete({ where: { id: fileId } });
  }

  async updateSupplierStatus(id: string, status: SupplierStatus) {
    await this.getSupplier(id);
    return this.prisma.supplier.update({
      where: { id },
      data: { status },
      include: { ...this.supplierListInclude(), hotelProfile: true },
    });
  }

  async listTypedSuppliers(type: string, query: { search?: string; province?: string; status?: SupplierStatus; market?: string }) {
    const categoryName = this.getTypeLabel(type);
    const searchText = normalizeListSearch(query.search);
    const contains = searchText ? containsSearch(searchText) : undefined;
    const where: Prisma.SupplierWhereInput = {
      deletedAt: null,
      category: { name: categoryName },
      ...(query.province ? { province: { contains: query.province, mode: 'insensitive' } } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.market ? { market: { contains: query.market, mode: 'insensitive' } } : {}),
      ...(contains
        ? {
            OR: [
              { supplierCode: contains },
              { name: contains },
              { taxCode: contains },
              { phone: contains },
              { email: contains },
            ],
          }
        : {}),
    };

    return this.prisma.supplier.findMany({
      where,
      include: this.genericListInclude(),
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }, { name: 'asc' }],
    });
  }

  async getTypedSupplier(type: string, id: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, category: { name: this.getTypeLabel(type) } },
      include: this.genericInclude(),
    });
    if (!supplier || supplier.deletedAt) throw new NotFoundException(SUPPLIER_ERRORS.typedSupplierNotFound);
    return supplier;
  }

  async createTypedSupplier(type: string, dto: CreateGenericSupplierDto) {
    const category = await this.ensureCategoryByName(this.getTypeLabel(type));
    await this.ensureSupplierCodeAvailable(dto.supplierCode);
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
        throw new ConflictException(SUPPLIER_ERRORS.codeExists);
      }
      throw error;
    }
  }

  async updateTypedSupplier(type: string, id: string, dto: UpdateGenericSupplierDto) {
    await this.getTypedSupplier(type, id);
    if (dto.supplierCode !== undefined) await this.ensureSupplierCodeAvailable(dto.supplierCode, id);
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
        throw new ConflictException(SUPPLIER_ERRORS.codeExists);
      }
      throw error;
    }
  }

  async updateTypedSupplierStatus(type: string, id: string, status: SupplierStatus) {
    await this.getTypedSupplier(type, id);
    return this.updateSupplierStatus(id, status);
  }

  async deleteTypedSupplier(type: string, id: string) {
    await this.getTypedSupplier(type, id);
    return this.deleteSupplier(id);
  }

  async listHotelSuppliers(query: {
    search?: string;
    province?: string;
    hotelProject?: string;
    classHotel?: string;
    status?: SupplierStatus;
    market?: string;
  }) {
    const searchText = normalizeListSearch(query.search);
    const contains = searchText ? containsSearch(searchText) : undefined;
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
      ...(contains
        ? {
            OR: [
              { supplierCode: contains },
              { name: contains },
              { taxCode: contains },
              { phone: contains },
              { email: contains },
            ],
          }
        : {}),
    };

    return this.prisma.supplier.findMany({
      where,
      include: this.hotelListInclude(),
      orderBy: [{ updatedAt: 'desc' }, { name: 'asc' }],
    });
  }

  async getHotelSupplier(id: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, hotelProfile: { isNot: null } },
      include: this.hotelInclude(),
    });
    if (!supplier || supplier.deletedAt) throw new NotFoundException(SUPPLIER_ERRORS.hotelSupplierNotFound);
    return supplier;
  }

  async createHotelSupplier(dto: CreateHotelSupplierDto) {
    const category = await this.ensureCategoryByName('Hotel');
    await this.ensureSupplierCodeAvailable(dto.supplierCode);
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
        throw new ConflictException(SUPPLIER_ERRORS.codeExists);
      }
      throw error;
    }
  }

  async updateHotelSupplier(id: string, dto: UpdateHotelSupplierDto) {
    await this.getHotelSupplier(id);
    if (dto.supplierCode !== undefined) await this.ensureSupplierCodeAvailable(dto.supplierCode, id);
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
        throw new ConflictException(SUPPLIER_ERRORS.codeExists);
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
    const startDate = query.startDate ? new Date(query.startDate) : null;
    const endDate = query.endDate ? new Date(query.endDate) : null;
    if (startDate && endDate && startDate > endDate) {
      throw new BadRequestException('Ngày bắt đầu không được sau ngày kết thúc');
    }
    const today = new Date();
    const allotments = await this.prisma.supplierAllotment.findMany({
      where: {
        ...(query.supplierId ? { supplierId: query.supplierId } : {}),
        ...(query.startDate || query.endDate
          ? {
              AND: [
                endDate ? { OR: [{ startDate: null }, { startDate: { lte: endDate } }] } : {},
                startDate ? { OR: [{ endDate: null }, { endDate: { gte: startDate } }] } : {},
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
    if (!current) throw new NotFoundException(SUPPLIER_ERRORS.allotmentNotFound);
    const next = {
      allotmentQty: dto.allotmentQty ?? current.allotmentQty,
      bookedQty: dto.bookedQty ?? current.bookedQty,
      lockedQty: dto.lockedQty ?? current.lockedQty,
      status: dto.status ?? current.status,
    };
    if (next.bookedQty + next.lockedQty > next.allotmentQty && next.status !== 'STOP_SELL') {
      throw new BadRequestException('Số lượng đã đặt cộng số lượng đã khóa không được vượt quá tổng quỹ phòng');
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.supplierAllotment.update({
        where: { id },
        data: next,
        include: { supplier: true, logs: { orderBy: { createdAt: 'desc' }, take: 5 }, allocations: true },
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
    if (!current) throw new NotFoundException(SUPPLIER_ERRORS.allotmentNotFound);
    if (current.status !== 'ACTIVE') throw new BadRequestException('Quỹ phòng chưa ở trạng thái hoạt động');
    await this.ensureAllocationLinks(dto, user);
    if (dto.serviceId && current.serviceId && dto.serviceId !== current.serviceId) {
      throw new BadRequestException('Dịch vụ không khớp với quỹ phòng');
    }
    const allotmentQty = current.allotmentQty || current.quantityLock || 0;
    if (current.bookedQty + current.lockedQty + quantity > allotmentQty) {
      throw new BadRequestException('Số lượng quỹ phòng còn lại không đủ');
    }
    const actor = this.actorFrom(dto.actor, user);
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
          createdBy: actor,
        },
      });
      const updated = await tx.supplierAllotment.update({
        where: { id },
        data: { lockedQty: { increment: quantity } },
        include: { supplier: true, logs: { orderBy: { createdAt: 'desc' }, take: 5 }, allocations: true },
      });
      await tx.supplierAllotmentLog.create({
        data: { allotmentId: id, supplierId: current.supplierId, action: 'LOCK', oldValue: { lockedQty: current.lockedQty }, newValue: { allocationId: allocation.id, quantity }, note: this.optionalText(dto.note), actor },
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
    const allocation = await this.prisma.supplierAllotmentAllocation.findFirst({ where: this.allotmentAllocationScopeWhere({ id }, user), include: { allotment: true } });
    if (!allocation) throw new NotFoundException(SUPPLIER_ERRORS.allocationNotFound);
    if (allocation.status === nextStatus) return allocation;
    if (!['LOCKED', 'CONFIRMED'].includes(allocation.status)) {
      throw new BadRequestException('Không thể thay đổi phân bổ ở trạng thái hiện tại');
    }
    if (nextStatus === 'CONFIRMED' && allocation.status !== 'LOCKED') {
      throw new BadRequestException('Chỉ các phân bổ đã khóa mới được xác nhận');
    }
    const actor = this.actorFrom(dto.actor, user);
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
          actor,
        },
      });
      return { allocation: updatedAllocation, inventory: this.toAllotmentInventory(updated, new Date()) };
    });
  }

  private async ensureAllocationLinks(dto: LockAllotmentDto, user?: RequestUser) {
    if (user && !hasUnrestrictedDataScope(user) && !dto.orderId && !dto.bookingId && !dto.tourId) {
      throw new BadRequestException('Người dùng bị giới hạn phạm vi dữ liệu phải liên kết thao tác giữ chỗ với đơn hàng, booking hoặc tour');
    }
    if (dto.serviceId) await this.ensureExists('supplierService', dto.serviceId, 'Không tìm thấy dịch vụ nhà cung cấp', user);
    if (dto.orderId) await this.ensureExists('order', dto.orderId, 'Không tìm thấy đơn hàng', user);
    if (dto.bookingId) await this.ensureExists('booking', dto.bookingId, 'Không tìm thấy booking', user);
    if (dto.tourId) await this.ensureExists('tour', dto.tourId, 'Không tìm thấy tour', user);
  }

  private async ensureExists(model: 'supplierService' | 'order' | 'booking' | 'tour', id: string, message: string, user?: RequestUser) {
    const row =
      model === 'supplierService'
        ? await this.prisma.supplierService.findUnique({ where: { id }, select: { id: true } })
        : model === 'order'
          ? await this.prisma.order.findFirst({ where: branchDepartmentScopeWhere<Prisma.OrderWhereInput>({ id, deletedAt: null }, user), select: { id: true } })
        : model === 'booking'
            ? await this.prisma.booking.findFirst({ where: this.bookingScopeWhere({ id }, user), select: { id: true } })
            : await this.prisma.tour.findFirst({ where: branchDepartmentScopeWhere<Prisma.TourWhereInput>({ id, deletedAt: null }, user), select: { id: true } });
    if (!row) throw new NotFoundException(message);
  }

  private allotmentAllocationScopeWhere(where: Prisma.SupplierAllotmentAllocationWhereInput, user?: RequestUser): Prisma.SupplierAllotmentAllocationWhereInput {
    if (!user || hasUnrestrictedDataScope(user)) return where;
    return {
      AND: [
        where,
        {
          OR: [
            { order: { is: branchDepartmentScopeWhere<Prisma.OrderWhereInput>({ deletedAt: null }, user) } },
            { booking: { is: this.bookingScopeWhere({}, user) } },
            { tour: { is: branchDepartmentScopeWhere<Prisma.TourWhereInput>({ deletedAt: null }, user) } },
          ],
        },
      ],
    };
  }

  private bookingScopeWhere(where: Prisma.BookingWhereInput, user?: RequestUser): Prisma.BookingWhereInput {
    if (!user || hasUnrestrictedDataScope(user)) return where;
    return {
      AND: [
        where,
        {
          OR: [
            { customer: { is: branchDepartmentScopeWhere<Prisma.CustomerWhereInput>({ mergedIntoId: null }, user) } },
            { order: { is: branchDepartmentScopeWhere<Prisma.OrderWhereInput>({ deletedAt: null }, user) } },
            { tour: { is: branchDepartmentScopeWhere<Prisma.TourWhereInput>({ deletedAt: null }, user) } },
          ],
        },
      ],
    };
  }

  private async ensureCategoryNameAvailable(name: string, excludedId?: string) {
    const normalizedName = this.categoryNameKey(name);
    const categories = await this.prisma.supplierCategory.findMany({
      where: excludedId ? { id: { not: excludedId } } : undefined,
      select: { name: true },
    });
    if (categories.some((category) => this.categoryNameKey(category.name) === normalizedName)) {
      throw new ConflictException(SUPPLIER_ERRORS.categoryExists);
    }
  }

  private categoryNameKey(value: string) {
    return value
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/đ/gi, 'd')
      .toLocaleLowerCase('vi')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private async ensureSupplierCodeAvailable(value?: string | null, excludedId?: string) {
    const supplierCode = this.optionalCode(value);
    if (!supplierCode) return;
    const existing = await this.prisma.supplier.findFirst({
      where: {
        ...(excludedId ? { id: { not: excludedId } } : {}),
        supplierCode: { equals: supplierCode, mode: 'insensitive' },
      },
      select: { id: true },
    });
    if (existing) throw new ConflictException(SUPPLIER_ERRORS.codeExists);
  }

  private async ensureCategory(id: string) {
    if (!this.optionalText(id)) throw new BadRequestException('Cần chọn loại nhà cung cấp');
    const category = await this.prisma.supplierCategory.findUnique({ where: { id } });
    if (!category) throw new NotFoundException(SUPPLIER_ERRORS.categoryNotFound);
    return category;
  }

  private async ensureCategoryByName(name: string) {
    const existing = await this.prisma.supplierCategory.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
    });
    if (existing) return existing;
    try {
      return await this.prisma.supplierCategory.create({ data: { name } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const concurrent = await this.prisma.supplierCategory.findFirst({
          where: { name: { equals: name, mode: 'insensitive' } },
        });
        if (concurrent) return concurrent;
      }
      throw error;
    }
  }

  private toSupplierData(dto: UpdateSupplierDto & Partial<CreateHotelSupplierDto & CreateGenericSupplierDto>) {
    return {
      ...(dto.categoryId !== undefined ? { categoryId: this.requiredText(dto.categoryId, 'Cần chọn loại nhà cung cấp') } : {}),
      ...(dto.supplierCode !== undefined ? { supplierCode: this.optionalCode(dto.supplierCode) } : {}),
      ...(dto.name !== undefined ? { name: this.requiredText(dto.name, 'Tên nhà cung cấp phải có ít nhất 2 ký tự') } : {}),
      ...(dto.taxCode !== undefined ? { taxCode: this.optionalText(dto.taxCode) } : {}),
      ...(dto.contactPerson !== undefined ? { contactPerson: this.optionalText(dto.contactPerson) } : {}),
      ...(dto.phone !== undefined ? { phone: this.optionalText(dto.phone) } : {}),
      ...(dto.email !== undefined ? { email: this.optionalText(dto.email) } : {}),
      ...(dto.country !== undefined ? { country: this.optionalText(dto.country) } : {}),
      ...(dto.province !== undefined ? { province: this.optionalText(dto.province) } : {}),
      ...(dto.address !== undefined ? { address: this.optionalText(dto.address) } : {}),
      ...(dto.website !== undefined ? { website: this.optionalText(dto.website) } : {}),
      ...(dto.link !== undefined ? { link: this.optionalText(dto.link) } : {}),
      ...(dto.rating !== undefined ? { rating: this.optionalNumber(dto.rating, 'Xếp hạng') } : {}),
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
      ...(dto.builtYear !== undefined ? { builtYear: this.optionalNumber(dto.builtYear, 'Năm xây dựng') } : {}),
      ...(dto.rating !== undefined ? { rating: this.optionalNumber(dto.rating, 'Xếp hạng') } : {}),
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
            birthday: this.optionalDate(item.birthday, 'Ngày sinh người liên hệ'),
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
          data: services.map((item) => {
            const { startDate, endDate } = this.optionalDateRange(item.startDate, item.endDate, 'dịch vụ');
            return {
              supplierId,
              sku: this.optionalText(item.sku),
              serviceName: item.serviceName.trim(),
              startDate,
              endDate,
              dayType: item.dayType ?? 'ALL_DAYS',
              quantity: 1,
              accountingPrice: item.accountingPrice ?? 0,
              netPrice: item.netPrice ?? 0,
              sellingPrice: item.sellingPrice ?? 0,
              description: this.optionalText(item.description),
              note: this.optionalText(item.note),
            };
          }),
        });
      }
    }

    if (dto.allotments) {
      await tx.supplierAllotment.deleteMany({ where: { supplierId } });
      const allotments = dto.allotments.filter((item) => item.serviceName?.trim());
      if (allotments.length) {
        await tx.supplierAllotment.createMany({
          data: allotments.map((item) => {
            const { startDate, endDate } = this.optionalDateRange(item.startDate, item.endDate, 'quỹ phòng');
            return {
              supplierId,
              sku: this.optionalText(item.sku),
              serviceName: item.serviceName.trim(),
              startDate,
              endDate,
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
            };
          }),
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
            birthday: this.optionalDate(item.birthday, 'Ngày sinh người liên hệ'),
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
      supplierServices: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' } },
      allotments: { orderBy: { createdAt: 'asc' }, include: { allocations: { orderBy: { createdAt: 'desc' }, take: 10 }, logs: { orderBy: { createdAt: 'desc' }, take: 3 } } },
      files: { orderBy: { createdAt: 'desc' } },
    } satisfies Prisma.SupplierInclude;
  }

  private hotelListInclude() {
    return {
      category: true,
      hotelProfile: true,
      contacts: { orderBy: { createdAt: 'asc' } },
      supplierServices: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' } },
      allotments: { orderBy: { createdAt: 'asc' } },
    } satisfies Prisma.SupplierInclude;
  }

  private toAllotmentInventory(
    item: Prisma.SupplierAllotmentGetPayload<{ include: { supplier: true; logs: true; allocations: true } }>,
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
      supplierServices: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' } },
      files: { orderBy: { createdAt: 'desc' } },
    } satisfies Prisma.SupplierInclude;
  }

  private genericListInclude() {
    return {
      category: true,
      contacts: { orderBy: { createdAt: 'asc' } },
      supplierServices: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' } },
    } satisfies Prisma.SupplierInclude;
  }

  private getTypeLabel(type: string) {
    const categoryName = SUPPLIER_TYPE_LABELS[type as keyof typeof SUPPLIER_TYPE_LABELS];
    if (!categoryName) throw new NotFoundException(SUPPLIER_ERRORS.unsupportedType);
    return categoryName;
  }

  private requiredText(value: string | undefined, message = 'Cần nhập trường bắt buộc') {
    const text = this.optionalText(value);
    if (!text) throw new BadRequestException(message);
    return text;
  }

  private validateSupplierPayload(dto: Partial<CreateSupplierDto>, partial = false) {
    if (!partial || dto.categoryId !== undefined) {
      if (!this.optionalText(dto.categoryId)) throw new BadRequestException('Cần chọn loại nhà cung cấp');
    }

    if (!partial || dto.name !== undefined) {
      const name = this.optionalText(dto.name);
      if (!name || name.length < 2) throw new BadRequestException('Tên nhà cung cấp phải có ít nhất 2 ký tự');
    }

    const phone = this.optionalText(dto.phone);
    if (phone && !SUPPLIER_PHONE_PATTERN.test(phone)) {
      throw new BadRequestException('Số điện thoại nhà cung cấp không hợp lệ');
    }

    if (dto.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dto.email.trim())) {
      throw new BadRequestException('Email nhà cung cấp không hợp lệ');
    }

    const pricePolicy = this.optionalText(dto.pricePolicy);
    if (pricePolicy && pricePolicy.length > 2000) {
      throw new BadRequestException('Chính sách giá không được vượt quá 2.000 ký tự');
    }

    const debtNote = this.optionalText(dto.debtNote);
    if (debtNote && debtNote.length > 2000) {
      throw new BadRequestException('Ghi chú công nợ không được vượt quá 2.000 ký tự');
    }
  }

  private isSpecializedSupplier(supplier: { hotelProfile?: unknown; category?: { name: string } | null }) {
    return Boolean(supplier.hotelProfile || (supplier.category && SPECIALIZED_SUPPLIER_CATEGORY_NAMES.has(supplier.category.name)));
  }

  private supplierListInclude() {
    return {
      category: true,
      supplierServices: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' } },
    } satisfies Prisma.SupplierInclude;
  }

  private async supplierUsage(id: string) {
    const [
      orderSalesItems,
      orderOperationItems,
      operationVouchers,
      financePayments,
      financeCashflowEntries,
      supplierLedgerEntries,
      supplierPaymentItems,
      operationServices,
      quoteComboItems,
      quotationItems,
      tourSuppliers,
      tourServices,
      tourCosts,
      fitBudgetServices,
      fitOperationServices,
      allotmentAllocations,
      supplierServices,
      allotments,
      files,
    ] = await Promise.all([
      this.prisma.orderSalesItem.count({ where: { supplierId: id } }),
      this.prisma.orderOperationItem.count({ where: { supplierId: id } }),
      this.prisma.operationVoucher.count({ where: { supplierId: id, deletedAt: null } }),
      this.prisma.financePayment.count({ where: { supplierId: id, deletedAt: null } }),
      this.prisma.financeCashflowEntry.count({ where: { supplierId: id } }),
      this.prisma.supplierLedgerEntry.count({ where: { supplierId: id } }),
      this.prisma.supplierPaymentItem.count({ where: { supplierId: id } }),
      this.prisma.operationService.count({ where: { supplierId: id } }),
      this.prisma.quoteComboItem.count({ where: { supplierId: id } }),
      this.prisma.quotationItem.count({ where: { supplierId: id } }),
      this.prisma.tourSupplier.count({ where: { supplierId: id } }),
      this.prisma.tourService.count({ where: { supplierId: id } }),
      this.prisma.tourCost.count({ where: { supplierId: id } }),
      this.prisma.fitBudgetService.count({ where: { supplierId: id } }),
      this.prisma.fitOperationService.count({ where: { supplierId: id } }),
      this.prisma.supplierAllotmentAllocation.count({ where: { supplierId: id, status: { in: ['LOCKED', 'CONFIRMED'] } } }),
      this.prisma.supplierService.count({ where: { supplierId: id, deletedAt: null } }),
      this.prisma.supplierAllotment.count({ where: { supplierId: id } }),
      this.prisma.supplierFile.count({ where: { supplierId: id } }),
    ]);
    const usage = {
      orderSalesItems,
      orderOperationItems,
      operationVouchers,
      financePayments,
      financeCashflowEntries,
      supplierLedgerEntries,
      supplierPaymentItems,
      operationServices,
      quoteComboItems,
      quotationItems,
      tourSuppliers,
      tourServices,
      tourCosts,
      fitBudgetServices,
      fitOperationServices,
      allotmentAllocations,
      supplierServices,
      allotments,
      files,
    };

    return { ...usage, total: Object.values(usage).reduce((sum, count) => sum + count, 0) };
  }

  private usageSummary(usage: Awaited<ReturnType<SuppliersService['supplierUsage']>>) {
    const labels: Array<[Exclude<keyof typeof usage, 'total'>, string]> = [
      ['orderSalesItems', 'dịch vụ bán trong đơn'],
      ['orderOperationItems', 'dịch vụ điều hành trong đơn'],
      ['operationVouchers', 'phiếu điều hành'],
      ['financePayments', 'phiếu chi'],
      ['financeCashflowEntries', 'dòng tiền'],
      ['supplierLedgerEntries', 'sổ công nợ nhà cung cấp'],
      ['supplierPaymentItems', 'yêu cầu thanh toán'],
      ['operationServices', 'dịch vụ điều hành'],
      ['quoteComboItems', 'dịch vụ combo'],
      ['quotationItems', 'hạng mục báo giá'],
      ['tourSuppliers', 'nhà cung cấp trong tour'],
      ['tourServices', 'dịch vụ tour'],
      ['tourCosts', 'chi phí tour'],
      ['fitBudgetServices', 'dự toán FIT'],
      ['fitOperationServices', 'điều hành FIT'],
      ['allotmentAllocations', 'phân bổ quỹ phòng đang khóa hoặc đã xác nhận'],
      ['supplierServices', 'dịch vụ nhà cung cấp'],
      ['allotments', 'quỹ phòng'],
      ['files', 'file nhà cung cấp'],
    ];
    return labels
      .filter(([key]) => usage[key] > 0)
      .map(([key, label]) => `${usage[key]} ${label}`)
      .join(', ');
  }

  private actorFrom(dtoActor?: string | null, user?: RequestUser) {
    return this.optionalText(dtoActor) || this.optionalText(user?.id) || this.optionalText(user?.email) || this.optionalText(user?.username) || null;
  }

  private rethrowSupplierUniqueConflict(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException(SUPPLIER_ERRORS.codeExists);
    }
    throw error;
  }

  private optionalCode(value?: string | null) {
    const code = this.optionalText(value);
    return code ? code.toUpperCase() : null;
  }

  private optionalText(value?: string | null) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private optionalNumber(value?: number, fieldName = 'Giá trị số') {
    if (value === undefined) return null;
    if (!Number.isFinite(value)) throw new BadRequestException(`${fieldName} không hợp lệ`);
    return value;
  }

  private optionalDate(value?: string, fieldName = 'Ngày') {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new BadRequestException(`${fieldName} không hợp lệ`);
    return date;
  }

  private optionalDateRange(startValue: string | undefined, endValue: string | undefined, subject: string) {
    const startDate = this.optionalDate(startValue, `Ngày bắt đầu ${subject}`);
    const endDate = this.optionalDate(endValue, `Ngày kết thúc ${subject}`);
    if (startDate && endDate && startDate > endDate) {
      throw new BadRequestException(`Ngày bắt đầu ${subject} không được sau ngày kết thúc ${subject}`);
    }
    return { startDate, endDate };
  }
}

import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateSupplierCategoryDto } from './dto/create-supplier-category.dto';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';

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
        throw new ConflictException('Supplier category already exists');
      }
      throw error;
    }
  }

  listSuppliers(search?: string, categoryId?: string) {
    const where: Prisma.SupplierWhereInput = {
      ...(categoryId ? { categoryId } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
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
      include: { category: true, services: true, paymentItems: true },
    });
    if (!supplier) throw new NotFoundException('Supplier not found');
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
    return this.prisma.supplier.delete({ where: { id } });
  }

  private async ensureCategory(id: string) {
    const category = await this.prisma.supplierCategory.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('Supplier category not found');
  }

  private toSupplierData(dto: UpdateSupplierDto) {
    return {
      ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.contactPerson !== undefined ? { contactPerson: this.optionalText(dto.contactPerson) } : {}),
      ...(dto.phone !== undefined ? { phone: this.optionalText(dto.phone) } : {}),
      ...(dto.email !== undefined ? { email: this.optionalText(dto.email) } : {}),
      ...(dto.address !== undefined ? { address: this.optionalText(dto.address) } : {}),
      ...(dto.pricePolicy !== undefined ? { pricePolicy: this.optionalText(dto.pricePolicy) } : {}),
      ...(dto.debtNote !== undefined ? { debtNote: this.optionalText(dto.debtNote) } : {}),
      ...(dto.notes !== undefined ? { notes: this.optionalText(dto.notes) } : {}),
    };
  }

  private optionalText(value?: string) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }
}

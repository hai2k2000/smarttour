import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { BookingStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { hasUnrestrictedDataScope, RequestUser, userPermissions } from '../auth/data-scope';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';

@Injectable()
export class BookingsService {
  constructor(private readonly prisma: PrismaService) {}

  private listSelect() {
    return {
      id: true,
      code: true,
      tourProgramId: true,
      customerId: true,
      orderId: true,
      tourId: true,
      customerName: true,
      customerPhone: true,
      customerEmail: true,
      paxCount: true,
      startDate: true,
      endDate: true,
      saleOwner: true,
      operatorOwner: true,
      status: true,
      totalSellPrice: true,
      createdAt: true,
      updatedAt: true,
      tourProgram: { select: { id: true, code: true, name: true, route: true, durationDays: true } },
      customer: { select: { id: true, code: true, fullName: true, phone: true, email: true, branch: true, department: true } },
      order: { select: { id: true, systemCode: true, tourCode: true, name: true, status: true, paymentStatus: true, branch: true, department: true } },
      tour: { select: { id: true, systemCode: true, tourCode: true, name: true, status: true, branch: true, department: true } },
      operationForm: { select: { id: true, status: true } },
    } satisfies Prisma.BookingSelect;
  }

  list(search?: string, status?: BookingStatus, tourProgramId?: string, user?: RequestUser) {
    const where: Prisma.BookingWhereInput = {
      ...(status ? { status } : {}),
      ...(tourProgramId ? { tourProgramId } : {}),
      ...(search
        ? {
            OR: [
              { code: { contains: search, mode: 'insensitive' } },
              { customerName: { contains: search, mode: 'insensitive' } },
              { saleOwner: { contains: search, mode: 'insensitive' } },
              { operatorOwner: { contains: search, mode: 'insensitive' } },
              { tourProgram: { name: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    return this.prisma.booking.findMany({
      where: this.scopeWhere(where, user),
      select: this.listSelect(),
      orderBy: [{ startDate: 'asc' }, { code: 'asc' }],
    });
  }

  async detail(id: string, user?: RequestUser) {
    const booking = await this.prisma.booking.findFirst({
      where: this.scopeWhere({ id }, user),
      include: {
        tourProgram: { include: { itineraryDays: { orderBy: { dayNumber: 'asc' } } } },
        customer: true,
        order: true,
        tour: true,
        operationVouchers: true,
        allotmentLocks: true,
        operationForm: { include: { tasks: true, services: true, costs: true } },
      },
    });
    if (!booking) throw new NotFoundException('Không tìm thấy booking');
    return booking;
  }

  async create(dto: CreateBookingDto) {
    await this.ensureTourProgram(dto.tourProgramId);
    await this.ensureBookingLinks(dto);
    this.ensureDateRange(dto.startDate, dto.endDate);
    try {
      return await this.prisma.booking.create({
        data: this.toCreateData(dto),
        include: { tourProgram: true, customer: true, order: true, tour: true, operationForm: true },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Booking code already exists');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateBookingDto, user?: RequestUser) {
    await this.detail(id, user);
    if (dto.tourProgramId) await this.ensureTourProgram(dto.tourProgramId);
    await this.ensureBookingLinks(dto);
    if (dto.startDate || dto.endDate) {
      const current = await this.prisma.booking.findUniqueOrThrow({ where: { id } });
      this.ensureDateRange(dto.startDate ?? current.startDate.toISOString(), dto.endDate ?? current.endDate.toISOString());
    }
    try {
      return await this.prisma.booking.update({
        where: { id },
        data: this.toUpdateData(dto),
        include: { tourProgram: true, customer: true, order: true, tour: true, operationForm: true },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Booking code already exists');
      }
      throw error;
    }
  }

  async remove(id: string, user?: RequestUser) {
    await this.detail(id, user);
    return this.prisma.booking.delete({ where: { id } });
  }

  private scopeWhere(where: Prisma.BookingWhereInput, user?: RequestUser): Prisma.BookingWhereInput {
    if (!user || hasUnrestrictedDataScope(user)) return where;
    const permissions = userPermissions(user);
    const OR: Prisma.BookingWhereInput[] = [];
    if (permissions.has('data.scope.branch') && user.branch) OR.push({ customer: { branch: user.branch } }, { order: { branch: user.branch } }, { tour: { branch: user.branch } });
    if (permissions.has('data.scope.department') && user.department) OR.push({ customer: { department: user.department } }, { order: { department: user.department } }, { tour: { department: user.department } });
    if (!OR.length) return { AND: [where, { id: '__no_data_scope__' }] };
    return { AND: [where, { OR }] };
  }

  private async ensureTourProgram(id: string) {
    const tourProgram = await this.prisma.tourProgram.findUnique({ where: { id } });
    if (!tourProgram) throw new NotFoundException('Tour program not found');
  }

  private async ensureBookingLinks(dto: Partial<CreateBookingDto>) {
    if (dto.customerId) await this.ensureExists('customer', dto.customerId, 'Customer not found');
    if (dto.orderId) await this.ensureExists('order', dto.orderId, 'Không tìm thấy đơn hàng');
    if (dto.tourId) await this.ensureExists('tour', dto.tourId, 'Tour not found');
  }

  private async ensureExists(model: 'customer' | 'order' | 'tour', id: string, message: string) {
    const row =
      model === 'customer'
        ? await this.prisma.customer.findUnique({ where: { id }, select: { id: true } })
        : model === 'order'
          ? await this.prisma.order.findUnique({ where: { id }, select: { id: true } })
          : await this.prisma.tour.findUnique({ where: { id }, select: { id: true } });
    if (!row) throw new NotFoundException(message);
  }

  private ensureDateRange(startDate: string, endDate: string) {
    if (new Date(startDate).getTime() > new Date(endDate).getTime()) {
      throw new BadRequestException('Start date must be before or equal to end date');
    }
  }

  private toCreateData(dto: CreateBookingDto): Prisma.BookingUncheckedCreateInput {
    return {
      code: dto.code.trim().toUpperCase(),
      tourProgramId: dto.tourProgramId,
      customerId: this.optionalText(dto.customerId),
      orderId: this.optionalText(dto.orderId),
      tourId: this.optionalText(dto.tourId),
      customerName: dto.customerName.trim(),
      customerPhone: this.optionalText(dto.customerPhone),
      customerEmail: this.optionalText(dto.customerEmail),
      paxCount: dto.paxCount,
      startDate: new Date(dto.startDate),
      endDate: new Date(dto.endDate),
      saleOwner: this.optionalText(dto.saleOwner),
      operatorOwner: this.optionalText(dto.operatorOwner),
      totalSellPrice: dto.totalSellPrice ?? 0,
    };
  }

  private toUpdateData(dto: UpdateBookingDto): Prisma.BookingUncheckedUpdateInput {
    return {
      ...(dto.code !== undefined ? { code: dto.code.trim().toUpperCase() } : {}),
      ...(dto.tourProgramId !== undefined ? { tourProgramId: dto.tourProgramId } : {}),
      ...(dto.customerId !== undefined ? { customerId: this.optionalText(dto.customerId) } : {}),
      ...(dto.orderId !== undefined ? { orderId: this.optionalText(dto.orderId) } : {}),
      ...(dto.tourId !== undefined ? { tourId: this.optionalText(dto.tourId) } : {}),
      ...(dto.customerName !== undefined ? { customerName: dto.customerName.trim() } : {}),
      ...(dto.customerPhone !== undefined ? { customerPhone: this.optionalText(dto.customerPhone) } : {}),
      ...(dto.customerEmail !== undefined ? { customerEmail: this.optionalText(dto.customerEmail) } : {}),
      ...(dto.paxCount !== undefined ? { paxCount: dto.paxCount } : {}),
      ...(dto.startDate !== undefined ? { startDate: new Date(dto.startDate) } : {}),
      ...(dto.endDate !== undefined ? { endDate: new Date(dto.endDate) } : {}),
      ...(dto.saleOwner !== undefined ? { saleOwner: this.optionalText(dto.saleOwner) } : {}),
      ...(dto.operatorOwner !== undefined ? { operatorOwner: this.optionalText(dto.operatorOwner) } : {}),
      ...(dto.totalSellPrice !== undefined ? { totalSellPrice: dto.totalSellPrice } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
    };
  }

  private optionalText(value?: string) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }
}

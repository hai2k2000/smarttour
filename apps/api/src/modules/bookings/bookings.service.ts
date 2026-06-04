import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { BookingStatus, OperationStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { branchDepartmentScopeWhere, hasUnrestrictedDataScope, RequestUser, userPermissions } from '../auth/data-scope';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';

const BOOKING_STATUS_TRANSITIONS: Record<BookingStatus, ReadonlySet<BookingStatus>> = {
  [BookingStatus.DRAFT]: new Set([BookingStatus.DRAFT, BookingStatus.CONFIRMED, BookingStatus.CANCELLED]),
  [BookingStatus.CONFIRMED]: new Set([BookingStatus.CONFIRMED, BookingStatus.OPERATING, BookingStatus.COMPLETED, BookingStatus.CANCELLED]),
  [BookingStatus.OPERATING]: new Set([BookingStatus.OPERATING, BookingStatus.COMPLETED, BookingStatus.CANCELLED]),
  [BookingStatus.COMPLETED]: new Set([BookingStatus.COMPLETED]),
  [BookingStatus.CANCELLED]: new Set([BookingStatus.CANCELLED]),
};

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

  list(search?: string, status?: string | BookingStatus, tourProgramId?: string, user?: RequestUser) {
    const normalizedStatus = this.bookingStatus(status);
    const where: Prisma.BookingWhereInput = {
      ...(normalizedStatus ? { status: normalizedStatus } : {}),
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

  async create(dto: CreateBookingDto, user?: RequestUser) {
    await this.ensureTourProgram(dto.tourProgramId);
    await this.ensureBookingLinks(dto, user, true);
    this.ensureDateRange(dto.startDate, dto.endDate);
    try {
      return await this.prisma.booking.create({
        data: this.toCreateData(dto),
        include: { tourProgram: true, customer: true, order: true, tour: true, operationForm: true },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Mã booking đã tồn tại');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateBookingDto, user?: RequestUser) {
    const current = await this.detail(id, user);
    if (dto.tourProgramId) await this.ensureTourProgram(dto.tourProgramId);
    await this.ensureBookingLinks(dto, user, false);
    this.ensureOperationFormLinkStable(current, dto);
    if (dto.status !== undefined) this.ensureStatusTransition(current.status, dto.status, current.operationForm?.status);
    if (dto.startDate || dto.endDate) {
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
        throw new ConflictException('Mã booking đã tồn tại');
      }
      throw error;
    }
  }

  async updateStatus(id: string, status: BookingStatus, user?: RequestUser) {
    return this.update(id, { status }, user);
  }

  async remove(id: string, user?: RequestUser) {
    await this.detail(id, user);
    await this.ensureCanDelete(id);
    return this.prisma.booking.delete({ where: { id } });
  }

  private scopeWhere(where: Prisma.BookingWhereInput, user?: RequestUser): Prisma.BookingWhereInput {
    if (!user || hasUnrestrictedDataScope(user)) return where;
    const permissions = userPermissions(user);
    if (this.hasMissingScopeValue(permissions, user)) return { AND: [where, { id: '__no_data_scope__' }] };
    const OR: Prisma.BookingWhereInput[] = [];
    if (permissions.has('data.scope.branch') && user.branch) OR.push({ customer: { branch: user.branch } }, { order: { branch: user.branch } }, { tour: { branch: user.branch } });
    if (permissions.has('data.scope.department') && user.department) OR.push({ customer: { department: user.department } }, { order: { department: user.department } }, { tour: { department: user.department } });
    if (!OR.length) return { AND: [where, { id: '__no_data_scope__' }] };
    return { AND: [where, { OR }] };
  }

  private async ensureTourProgram(id: string) {
    const tourProgram = await this.prisma.tourProgram.findUnique({ where: { id } });
    if (!tourProgram) throw new NotFoundException('Không tìm thấy tour mẫu');
  }

  private async ensureBookingLinks(dto: Partial<CreateBookingDto>, user: RequestUser | undefined, requireScopedLink: boolean) {
    if (this.requiresScopedLink(user) && requireScopedLink && !dto.customerId && !dto.orderId && !dto.tourId) {
      throw new BadRequestException('customerId, orderId or tourId is required for scoped booking writes');
    }
    if (dto.customerId) await this.ensureExists('customer', dto.customerId, 'Không tìm thấy khách hàng', user);
    if (dto.orderId) await this.ensureExists('order', dto.orderId, 'Không tìm thấy đơn hàng', user);
    if (dto.tourId) await this.ensureExists('tour', dto.tourId, 'Không tìm thấy tour vận hành', user);
  }

  private async ensureExists(model: 'customer' | 'order' | 'tour', id: string, message: string, user?: RequestUser) {
    const row =
      model === 'customer'
        ? await this.prisma.customer.findFirst({ where: branchDepartmentScopeWhere({ id }, user), select: { id: true } })
        : model === 'order'
          ? await this.prisma.order.findFirst({ where: branchDepartmentScopeWhere({ id }, user), select: { id: true } })
          : await this.prisma.tour.findFirst({ where: branchDepartmentScopeWhere({ id }, user), select: { id: true } });
    if (!row) throw new NotFoundException(message);
  }

  private requiresScopedLink(user?: RequestUser) {
    if (!user || hasUnrestrictedDataScope(user)) return false;
    return true;
  }

  private hasMissingScopeValue(permissions: Set<string>, user: RequestUser) {
    return (permissions.has('data.scope.branch') && !user.branch) || (permissions.has('data.scope.department') && !user.department);
  }

  private bookingStatus(status?: string | BookingStatus) {
    const value = this.optionalText(status);
    if (!value) return undefined;
    if (Object.values(BookingStatus).includes(value as BookingStatus)) return value as BookingStatus;
    throw new BadRequestException(`Trạng thái booking không hợp lệ: ${value}`);
  }

  private ensureStatusTransition(current: BookingStatus, target: BookingStatus, operationFormStatus?: OperationStatus | null) {
    const allowed = BOOKING_STATUS_TRANSITIONS[current] || new Set<BookingStatus>([current]);
    if (!allowed.has(target)) {
      throw new BadRequestException(`Không thể chuyển booking từ ${current} sang ${target}`);
    }
    if (target === BookingStatus.OPERATING && !operationFormStatus) {
      throw new BadRequestException('Booking cần có phiếu điều hành trước khi chuyển sang trạng thái đang vận hành');
    }
    if (target === BookingStatus.OPERATING && operationFormStatus === OperationStatus.CANCELLED) {
      throw new BadRequestException('Không thể chuyển booking sang đang vận hành khi phiếu điều hành đã hủy');
    }
  }

  private ensureOperationFormLinkStable(
    current: {
      operationForm?: { id: string } | null;
      tourProgramId: string;
      customerId: string | null;
      orderId: string | null;
      tourId: string | null;
    },
    dto: UpdateBookingDto,
  ) {
    if (!current.operationForm) return;
    const blocked: string[] = [];
    if (dto.tourProgramId !== undefined && dto.tourProgramId !== current.tourProgramId) blocked.push('tour mẫu');
    if (dto.customerId !== undefined && this.optionalText(dto.customerId) !== current.customerId) blocked.push('khách hàng liên kết');
    if (dto.orderId !== undefined && this.optionalText(dto.orderId) !== current.orderId) blocked.push('đơn hàng liên kết');
    if (dto.tourId !== undefined && this.optionalText(dto.tourId) !== current.tourId) blocked.push('tour vận hành liên kết');
    if (blocked.length) throw new ConflictException(`Booking đã có phiếu điều hành, không thể đổi ${blocked.join(', ')}`);
  }

  private async ensureCanDelete(id: string) {
    const usage = await this.bookingUsage(id);
    if (!usage.total) return;
    throw new ConflictException(`Không thể xóa booking vì đang có ${this.usageSummary(usage)}.`);
  }

  private async bookingUsage(id: string) {
    const [operationForms, operationVouchers, activeAllotmentLocks] = await Promise.all([
      this.prisma.operationForm.count({ where: { bookingId: id } }),
      this.prisma.operationVoucher.count({ where: { bookingId: id, deletedAt: null } }),
      this.prisma.supplierAllotmentAllocation.count({ where: { bookingId: id, status: { in: ['LOCKED', 'CONFIRMED'] } } }),
    ]);
    const usage = { operationForms, operationVouchers, activeAllotmentLocks };
    return { ...usage, total: Object.values(usage).reduce((sum, count) => sum + count, 0) };
  }

  private usageSummary(usage: Awaited<ReturnType<BookingsService['bookingUsage']>>) {
    const labels: Array<[Exclude<keyof typeof usage, 'total'>, string]> = [
      ['operationForms', 'phiếu điều hành'],
      ['operationVouchers', 'phiếu dịch vụ điều hành'],
      ['activeAllotmentLocks', 'khóa allotment đang hiệu lực'],
    ];
    return labels
      .filter(([key]) => usage[key] > 0)
      .map(([key, label]) => `${usage[key]} ${label}`)
      .join(', ');
  }

  private ensureDateRange(startDate: string, endDate: string) {
    const start = new Date(startDate).getTime();
    const end = new Date(endDate).getTime();
    if (Number.isNaN(start) || Number.isNaN(end)) {
      throw new BadRequestException('Ngày khởi hành hoặc ngày kết thúc không hợp lệ');
    }
    if (start > end) {
      throw new BadRequestException('Ngày khởi hành phải trước hoặc bằng ngày kết thúc');
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

  private optionalText(value?: unknown) {
    const trimmed = typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
    return trimmed ? trimmed : null;
  }
}

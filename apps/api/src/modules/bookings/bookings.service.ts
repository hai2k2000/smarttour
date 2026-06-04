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
const MS_PER_DAY = 24 * 60 * 60 * 1000;

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
    const tourProgram = await this.ensureTourProgram(dto.tourProgramId);
    await this.ensureBookingLinks(dto, user, true);
    this.ensureBookingValues(dto, tourProgram.durationDays);
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
    const tourProgram = dto.tourProgramId ? await this.ensureTourProgram(dto.tourProgramId) : current.tourProgram;
    await this.ensureBookingLinks(dto, user, false);
    this.ensureOperationFormEditAllowed(current, dto);
    if (dto.status !== undefined) this.ensureStatusTransition(current.status, dto.status, current.operationForm?.status);
    this.ensureBookingValues(
      {
        startDate: dto.startDate !== undefined ? dto.startDate : current.startDate,
        endDate: dto.endDate !== undefined ? dto.endDate : current.endDate,
        paxCount: dto.paxCount ?? current.paxCount,
        totalSellPrice: dto.totalSellPrice ?? current.totalSellPrice,
      },
      tourProgram.durationDays,
    );
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
    const tourProgram = await this.prisma.tourProgram.findUnique({
      where: { id },
      select: {
        id: true,
        durationDays: true,
        itineraryDays: { orderBy: { dayNumber: 'asc' }, select: { dayNumber: true } },
      },
    });
    if (!tourProgram) throw new NotFoundException('Không tìm thấy tour mẫu');
    this.ensureTourProgramItineraryComplete(tourProgram);
    return tourProgram;
  }

  private ensureTourProgramItineraryComplete(tourProgram: {
    durationDays: number;
    itineraryDays: Array<{ dayNumber: number }>;
  }) {
    const dayNumbers = new Set(tourProgram.itineraryDays.map((day) => day.dayNumber));
    const missingDays: number[] = [];
    for (let day = 1; day <= tourProgram.durationDays; day += 1) {
      if (!dayNumbers.has(day)) missingDays.push(day);
    }
    const extraDays = [...dayNumbers].filter((day) => day < 1 || day > tourProgram.durationDays);
    if (missingDays.length || extraDays.length || dayNumbers.size !== tourProgram.durationDays) {
      const parts = [
        missingDays.length ? `thiếu ngày ${missingDays.join(', ')}` : '',
        extraDays.length ? `có ngày ngoài thời lượng ${extraDays.join(', ')}` : '',
      ].filter(Boolean);
      throw new BadRequestException(`Tour mẫu chưa đủ lịch trình: ${parts.join('; ')}`);
    }
  }

  private async ensureBookingLinks(dto: Partial<CreateBookingDto>, user: RequestUser | undefined, requireScopedLink: boolean) {
    if (this.requiresScopedLink(user) && requireScopedLink && !dto.customerId && !dto.orderId && !dto.tourId) {
      throw new BadRequestException('Cần liên kết khách hàng, đơn hàng hoặc tour vận hành để tạo booking theo phạm vi dữ liệu');
    }
    if (dto.customerId) await this.ensureExists('customer', dto.customerId, 'Không tìm thấy khách hàng liên kết', user);
    if (dto.orderId) await this.ensureExists('order', dto.orderId, 'Không tìm thấy đơn hàng liên kết', user);
    if (dto.tourId) await this.ensureExists('tour', dto.tourId, 'Không tìm thấy tour vận hành liên kết', user);
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

  private ensureOperationFormEditAllowed(
    current: {
      operationForm?: { id: string } | null;
      code: string;
      tourProgramId: string;
      customerId: string | null;
      orderId: string | null;
      tourId: string | null;
      customerName: string;
      customerPhone: string | null;
      customerEmail: string | null;
      paxCount: number;
      startDate: Date;
      endDate: Date;
      totalSellPrice: unknown;
    },
    dto: UpdateBookingDto,
  ) {
    if (!current.operationForm) return;
    const blocked: string[] = [];
    if (dto.code !== undefined && dto.code.trim().toUpperCase() !== current.code) blocked.push('mã booking');
    if (dto.tourProgramId !== undefined && dto.tourProgramId !== current.tourProgramId) blocked.push('tour mẫu');
    if (dto.customerId !== undefined && this.optionalText(dto.customerId) !== current.customerId) blocked.push('khách hàng liên kết');
    if (dto.orderId !== undefined && this.optionalText(dto.orderId) !== current.orderId) blocked.push('đơn hàng liên kết');
    if (dto.tourId !== undefined && this.optionalText(dto.tourId) !== current.tourId) blocked.push('tour vận hành liên kết');
    if (dto.customerName !== undefined && dto.customerName.trim() !== current.customerName) blocked.push('tên khách/đoàn');
    if (dto.customerPhone !== undefined && this.optionalText(dto.customerPhone) !== current.customerPhone) blocked.push('điện thoại khách');
    if (dto.customerEmail !== undefined && this.optionalText(dto.customerEmail) !== current.customerEmail) blocked.push('email khách');
    if (dto.paxCount !== undefined && dto.paxCount !== current.paxCount) blocked.push('số khách');
    if (dto.startDate !== undefined && this.dateKey(dto.startDate) !== this.dateKey(current.startDate)) blocked.push('ngày khởi hành');
    if (dto.endDate !== undefined && this.dateKey(dto.endDate) !== this.dateKey(current.endDate)) blocked.push('ngày kết thúc');
    if (dto.totalSellPrice !== undefined && this.numberValue(dto.totalSellPrice, 'totalSellPrice') !== this.numberValue(current.totalSellPrice, 'totalSellPrice')) blocked.push('giá bán tổng');
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

  private ensureBookingValues(
    input: { startDate: unknown; endDate: unknown; paxCount?: number; totalSellPrice?: unknown },
    durationDays: number,
  ) {
    const { start, end } = this.ensureDateRange(input.startDate, input.endDate);
    const actualDuration = Math.round((end - start) / MS_PER_DAY) + 1;
    if (durationDays > 0 && actualDuration !== durationDays) {
      throw new BadRequestException(`Khoảng ngày booking phải đúng ${durationDays} ngày theo tour mẫu, hiện đang là ${actualDuration} ngày`);
    }
    if (input.paxCount !== undefined && (!Number.isInteger(input.paxCount) || input.paxCount < 1)) {
      throw new BadRequestException('Số khách phải là số nguyên lớn hơn 0');
    }
    if (input.totalSellPrice !== undefined && this.numberValue(input.totalSellPrice, 'totalSellPrice') < 0) {
      throw new BadRequestException('Giá bán tổng không được âm');
    }
  }

  private ensureDateRange(startDate: unknown, endDate: unknown) {
    const start = this.dateOnlyTime(startDate, 'startDate');
    const end = this.dateOnlyTime(endDate, 'endDate');
    if (start > end) {
      throw new BadRequestException('Ngày khởi hành phải trước hoặc bằng ngày kết thúc');
    }
    return { start, end };
  }

  private dateOnlyTime(value: unknown, field: string) {
    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) throw new BadRequestException(`${this.dateFieldLabel(field)} không hợp lệ`);
      return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
    }

    if (value === null || value === undefined) throw new BadRequestException(`${this.dateFieldLabel(field)} không được để trống`);
    const text = String(value).trim();
    if (!text) throw new BadRequestException(`${this.dateFieldLabel(field)} không được để trống`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      throw new BadRequestException(`${this.dateFieldLabel(field)} phải có định dạng YYYY-MM-DD`);
    }

    const [year, month, day] = text.split('-').map(Number);
    const time = Date.UTC(year, month - 1, day);
    const date = new Date(time);
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
      throw new BadRequestException(`${this.dateFieldLabel(field)} không hợp lệ`);
    }
    return time;
  }

  private dateOnlyDate(value: unknown, field: string) {
    return new Date(this.dateOnlyTime(value, field));
  }

  private dateFieldLabel(field: string) {
    if (field === 'startDate') return 'Ngày khởi hành';
    if (field === 'endDate') return 'Ngày kết thúc';
    return 'Ngày';
  }

  private dateKey(value: unknown) {
    return this.dateOnlyTime(value, 'date');
  }

  private numberValue(value: unknown, field: string) {
    const number = Number(value ?? 0);
    if (!Number.isFinite(number)) throw new BadRequestException(`${field} phải là số hợp lệ`);
    return number;
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
      startDate: this.dateOnlyDate(dto.startDate, 'startDate'),
      endDate: this.dateOnlyDate(dto.endDate, 'endDate'),
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
      ...(dto.startDate !== undefined ? { startDate: this.dateOnlyDate(dto.startDate, 'startDate') } : {}),
      ...(dto.endDate !== undefined ? { endDate: this.dateOnlyDate(dto.endDate, 'endDate') } : {}),
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

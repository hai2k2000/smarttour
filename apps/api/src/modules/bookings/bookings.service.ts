import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { BookingStatus, OperationStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { branchDepartmentScopeWhere, hasUnrestrictedDataScope, RequestUser } from '../auth/data-scope';
import {
  BOOKING_CODE_MAX_LENGTH,
  BOOKING_CODE_PATTERN,
  BOOKING_CUSTOMER_NAME_MAX_LENGTH,
  BOOKING_EMAIL_MAX_LENGTH,
  BOOKING_OWNER_MAX_LENGTH,
  BOOKING_PHONE_MAX_LENGTH,
  BOOKING_PHONE_PATTERN,
  CreateBookingDto,
} from './dto/create-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';
import { bookingScopeWhere } from './booking-scope';

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
      operationForm: { select: { id: true, status: true } },
    } satisfies Prisma.BookingSelect;
  }

  private detailSelect() {
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
      tourProgram: {
        select: {
          id: true,
          code: true,
          name: true,
          route: true,
          durationDays: true,
          itineraryDays: { orderBy: { dayNumber: 'asc' }, select: { id: true, dayNumber: true, title: true } },
        },
      },
      customer: { select: { id: true, code: true, fullName: true, phone: true, email: true, branch: true, department: true } },
      order: { select: { id: true, systemCode: true, tourCode: true, name: true, status: true, paymentStatus: true, branch: true, department: true } },
      tour: { select: { id: true, systemCode: true, tourCode: true, name: true, status: true, branch: true, department: true } },
      operationVouchers: { select: { id: true, voucherCode: true, status: true } },
      allotmentLocks: { select: { id: true, status: true, quantity: true } },
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
      select: this.detailSelect(),
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
    await this.ensureFinalScopedLink(current, dto, user);
    await this.ensureLinkedDataEditAllowed(current, dto);
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
    return bookingScopeWhere(where, user);
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

  private async ensureFinalScopedLink(
    current: { customerId: string | null; orderId: string | null; tourId: string | null },
    dto: Partial<CreateBookingDto>,
    user?: RequestUser,
  ) {
    if (!this.requiresScopedLink(user)) return;
    const customerId = dto.customerId !== undefined ? this.optionalText(dto.customerId) : current.customerId;
    const orderId = dto.orderId !== undefined ? this.optionalText(dto.orderId) : current.orderId;
    const tourId = dto.tourId !== undefined ? this.optionalText(dto.tourId) : current.tourId;
    if (!customerId && !orderId && !tourId) {
      throw new BadRequestException('Booking cần giữ ít nhất một liên kết khách hàng, đơn hàng hoặc tour vận hành theo phạm vi dữ liệu');
    }

    const [customer, order, tour] = await Promise.all([
      customerId ? this.prisma.customer.findFirst({ where: branchDepartmentScopeWhere({ id: customerId }, user), select: { id: true } }) : Promise.resolve(null),
      orderId ? this.prisma.order.findFirst({ where: branchDepartmentScopeWhere({ id: orderId }, user), select: { id: true } }) : Promise.resolve(null),
      tourId ? this.prisma.tour.findFirst({ where: branchDepartmentScopeWhere({ id: tourId }, user), select: { id: true } }) : Promise.resolve(null),
    ]);
    if (!customer && !order && !tour) {
      throw new BadRequestException('Booking phải còn liên kết với dữ liệu thuộc phạm vi của bạn');
    }
  }

  private requiresScopedLink(user?: RequestUser) {
    if (!user || hasUnrestrictedDataScope(user)) return false;
    return true;
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
    if (dto.code !== undefined && this.bookingCode(dto.code) !== current.code) blocked.push('mã booking');
    if (dto.tourProgramId !== undefined && dto.tourProgramId !== current.tourProgramId) blocked.push('tour mẫu');
    if (dto.customerId !== undefined && this.optionalText(dto.customerId) !== current.customerId) blocked.push('khách hàng liên kết');
    if (dto.orderId !== undefined && this.optionalText(dto.orderId) !== current.orderId) blocked.push('đơn hàng liên kết');
    if (dto.tourId !== undefined && this.optionalText(dto.tourId) !== current.tourId) blocked.push('tour vận hành liên kết');
    if (dto.customerName !== undefined && this.requiredText(dto.customerName, 'Tên khách/đoàn', BOOKING_CUSTOMER_NAME_MAX_LENGTH) !== current.customerName) blocked.push('tên khách/đoàn');
    if (dto.customerPhone !== undefined && this.customerPhone(dto.customerPhone) !== current.customerPhone) blocked.push('điện thoại khách');
    if (dto.customerEmail !== undefined && this.customerEmail(dto.customerEmail) !== current.customerEmail) blocked.push('email khách');
    if (dto.paxCount !== undefined && dto.paxCount !== current.paxCount) blocked.push('số khách');
    if (dto.startDate !== undefined && this.dateKey(dto.startDate) !== this.dateKey(current.startDate)) blocked.push('ngày khởi hành');
    if (dto.endDate !== undefined && this.dateKey(dto.endDate) !== this.dateKey(current.endDate)) blocked.push('ngày kết thúc');
    if (dto.totalSellPrice !== undefined && this.numberValue(dto.totalSellPrice, 'Giá bán tổng') !== this.numberValue(current.totalSellPrice, 'Giá bán tổng')) blocked.push('giá bán tổng');
    if (blocked.length) throw new ConflictException(`Booking đã có phiếu điều hành, không thể đổi ${blocked.join(', ')}`);
  }

  private async ensureLinkedDataEditAllowed(
    current: { id: string; tourProgramId: string; customerId: string | null; orderId: string | null; tourId: string | null },
    dto: UpdateBookingDto,
  ) {
    const changed: string[] = [];
    if (dto.tourProgramId !== undefined && dto.tourProgramId !== current.tourProgramId) changed.push('tour mẫu');
    if (dto.customerId !== undefined && this.optionalText(dto.customerId) !== current.customerId) changed.push('khách hàng liên kết');
    if (dto.orderId !== undefined && this.optionalText(dto.orderId) !== current.orderId) changed.push('đơn hàng liên kết');
    if (dto.tourId !== undefined && this.optionalText(dto.tourId) !== current.tourId) changed.push('tour vận hành liên kết');
    if (!changed.length) return;

    const usage = await this.bookingUsage(current.id);
    if (usage.total) {
      throw new ConflictException(`Booking đã phát sinh ${this.usageSummary(usage)}, không thể đổi ${changed.join(', ')}`);
    }
  }

  private async ensureCanDelete(id: string) {
    const usage = await this.bookingUsage(id);
    if (!usage.total) return;
    throw new ConflictException(`Không thể xóa booking vì đang có ${this.usageSummary(usage)}.`);
  }

  private async bookingUsage(id: string) {
    const [booking, operationForms, operationVouchers, allotmentLocks] = await Promise.all([
      this.prisma.booking.findUnique({ where: { id }, select: { orderId: true, tourId: true } }),
      this.prisma.operationForm.count({ where: { bookingId: id } }),
      this.prisma.operationVoucher.count({ where: { bookingId: id } }),
      this.prisma.supplierAllotmentAllocation.count({ where: { bookingId: id } }),
    ]);
    const usage = { linkedOrders: booking?.orderId ? 1 : 0, linkedTours: booking?.tourId ? 1 : 0, operationForms, operationVouchers, allotmentLocks };
    return { ...usage, total: Object.values(usage).reduce((sum, count) => sum + count, 0) };
  }

  private usageSummary(usage: Awaited<ReturnType<BookingsService['bookingUsage']>>) {
    const labels: Array<[Exclude<keyof typeof usage, 'total'>, string]> = [
      ['linkedOrders', 'đơn hàng liên kết'],
      ['linkedTours', 'tour vận hành liên kết'],
      ['operationForms', 'phiếu điều hành'],
      ['operationVouchers', 'phiếu dịch vụ điều hành'],
      ['allotmentLocks', 'khóa allotment'],
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
    if (input.totalSellPrice !== undefined && this.numberValue(input.totalSellPrice, 'Giá bán tổng') < 0) {
      throw new BadRequestException('Giá bán tổng không được âm');
    }
  }

  private ensureDateRange(startDate: unknown, endDate: unknown) {
    const start = this.dateOnlyTime(startDate, 'ng?y b?t ??u');
    const end = this.dateOnlyTime(endDate, 'ng?y k?t th?c');
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
    if (field === 'ng?y b?t ??u') return 'Ngày khởi hành';
    if (field === 'ng?y k?t th?c') return 'Ngày kết thúc';
    return 'Ngày';
  }

  private dateKey(value: unknown) {
    return this.dateOnlyTime(value, 'ng?y');
  }

  private numberValue(value: unknown, field: string) {
    const number = Number(value ?? 0);
    if (!Number.isFinite(number)) throw new BadRequestException(`${field} phải là số hợp lệ`);
    return number;
  }

  private bookingCode(value: unknown) {
    const code = this.requiredText(value, 'Mã booking', BOOKING_CODE_MAX_LENGTH).toUpperCase();
    if (!BOOKING_CODE_PATTERN.test(code)) {
      throw new BadRequestException('Mã booking chỉ được dùng chữ cái không dấu, số, dấu gạch ngang hoặc gạch dưới, không có khoảng trắng');
    }
    return code;
  }

  private customerPhone(value: unknown) {
    const phone = this.optionalLimitedText(value, 'Điện thoại khách', BOOKING_PHONE_MAX_LENGTH);
    if (phone && !BOOKING_PHONE_PATTERN.test(phone)) {
      throw new BadRequestException('Điện thoại khách chỉ được dùng số, khoảng trắng và các ký tự + ( ) . - từ 6 đến 32 ký tự');
    }
    return phone;
  }

  private customerEmail(value: unknown) {
    const email = this.optionalLimitedText(value, 'Email khách', BOOKING_EMAIL_MAX_LENGTH)?.toLowerCase() || null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('Email khách không hợp lệ');
    }
    return email;
  }

  private requiredText(value: unknown, label: string, maxLength: number) {
    const text = typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
    if (!text) throw new BadRequestException(`${label} không được để trống`);
    if (text.length > maxLength) throw new BadRequestException(`${label} không được vượt quá ${maxLength} ký tự`);
    return text;
  }

  private optionalLimitedText(value: unknown, label: string, maxLength: number) {
    const text = this.optionalText(value);
    if (text && text.length > maxLength) throw new BadRequestException(`${label} không được vượt quá ${maxLength} ký tự`);
    return text;
  }

  private toCreateData(dto: CreateBookingDto): Prisma.BookingUncheckedCreateInput {
    return {
      code: this.bookingCode(dto.code),
      tourProgramId: dto.tourProgramId,
      customerId: this.optionalText(dto.customerId),
      orderId: this.optionalText(dto.orderId),
      tourId: this.optionalText(dto.tourId),
      customerName: this.requiredText(dto.customerName, 'Tên khách/đoàn', BOOKING_CUSTOMER_NAME_MAX_LENGTH),
      customerPhone: this.customerPhone(dto.customerPhone),
      customerEmail: this.customerEmail(dto.customerEmail),
      paxCount: dto.paxCount,
      startDate: this.dateOnlyDate(dto.startDate, 'ng?y b?t ??u'),
      endDate: this.dateOnlyDate(dto.endDate, 'ng?y k?t th?c'),
      saleOwner: this.optionalLimitedText(dto.saleOwner, 'Sale phụ trách', BOOKING_OWNER_MAX_LENGTH),
      operatorOwner: this.optionalLimitedText(dto.operatorOwner, 'Điều hành phụ trách', BOOKING_OWNER_MAX_LENGTH),
      totalSellPrice: this.numberValue(dto.totalSellPrice ?? 0, 'Giá bán tổng'),
    };
  }

  private toUpdateData(dto: UpdateBookingDto): Prisma.BookingUncheckedUpdateInput {
    return {
      ...(dto.code !== undefined ? { code: this.bookingCode(dto.code) } : {}),
      ...(dto.tourProgramId !== undefined ? { tourProgramId: dto.tourProgramId } : {}),
      ...(dto.customerId !== undefined ? { customerId: this.optionalText(dto.customerId) } : {}),
      ...(dto.orderId !== undefined ? { orderId: this.optionalText(dto.orderId) } : {}),
      ...(dto.tourId !== undefined ? { tourId: this.optionalText(dto.tourId) } : {}),
      ...(dto.customerName !== undefined ? { customerName: this.requiredText(dto.customerName, 'Tên khách/đoàn', BOOKING_CUSTOMER_NAME_MAX_LENGTH) } : {}),
      ...(dto.customerPhone !== undefined ? { customerPhone: this.customerPhone(dto.customerPhone) } : {}),
      ...(dto.customerEmail !== undefined ? { customerEmail: this.customerEmail(dto.customerEmail) } : {}),
      ...(dto.paxCount !== undefined ? { paxCount: dto.paxCount } : {}),
      ...(dto.startDate !== undefined ? { startDate: this.dateOnlyDate(dto.startDate, 'ng?y b?t ??u') } : {}),
      ...(dto.endDate !== undefined ? { endDate: this.dateOnlyDate(dto.endDate, 'ng?y k?t th?c') } : {}),
      ...(dto.saleOwner !== undefined ? { saleOwner: this.optionalLimitedText(dto.saleOwner, 'Sale phụ trách', BOOKING_OWNER_MAX_LENGTH) } : {}),
      ...(dto.operatorOwner !== undefined ? { operatorOwner: this.optionalLimitedText(dto.operatorOwner, 'Điều hành phụ trách', BOOKING_OWNER_MAX_LENGTH) } : {}),
      ...(dto.totalSellPrice !== undefined ? { totalSellPrice: this.numberValue(dto.totalSellPrice, 'Giá bán tổng') } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
    };
  }

  private optionalText(value?: unknown) {
    const trimmed = typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
    return trimmed ? trimmed : null;
  }
}

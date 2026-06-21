import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { BookingStatus, OperationStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { branchDepartmentScopeWhere, hasUnrestrictedDataScope, RequestUser } from '../auth/data-scope';
import { containsSearch, normalizeListSearch } from '../list-search';
import {
  BOOKING_CODE_MAX_LENGTH,
  BOOKING_DEFAULT_TOTAL_SELL_PRICE,
  BOOKING_CODE_PATTERN,
  BOOKING_CUSTOMER_NAME_MAX_LENGTH,
  BOOKING_CUSTOMER_NAME_MIN_LENGTH,
  BOOKING_EMAIL_MAX_LENGTH,
  BOOKING_EMAIL_PATTERN,
  BOOKING_ID_MAX_LENGTH,
  BOOKING_CREATE_FIELDS,
  BOOKING_OWNER_MAX_LENGTH,
  BOOKING_OWNER_MIN_LENGTH,
  BOOKING_PHONE_MAX_LENGTH,
  BOOKING_PHONE_PATTERN,
  BOOKING_TEXT_PATTERN,
  CreateBookingDto,
} from './dto/create-booking.dto';
import { BOOKING_LIST_DEFAULT_TAKE, BOOKING_LIST_MAX_TAKE } from './dto/list-bookings-query.dto';
import { BOOKING_NON_NULLABLE_UPDATE_FIELDS, BOOKING_UPDATE_FIELDS, UpdateBookingDto } from './dto/update-booking.dto';
import { BOOKING_CODE_CONFLICT_MESSAGE, BOOKING_NOT_FOUND_MESSAGES } from './booking-errors';
import { bookingScopeWhere } from './booking-scope';

const BOOKING_STATUS_TRANSITIONS: Record<BookingStatus, ReadonlySet<BookingStatus>> = {
  [BookingStatus.DRAFT]: new Set([BookingStatus.DRAFT, BookingStatus.CONFIRMED, BookingStatus.CANCELLED]),
  [BookingStatus.CONFIRMED]: new Set([BookingStatus.CONFIRMED, BookingStatus.OPERATING, BookingStatus.CANCELLED]),
  [BookingStatus.OPERATING]: new Set([BookingStatus.OPERATING, BookingStatus.COMPLETED, BookingStatus.CANCELLED]),
  [BookingStatus.COMPLETED]: new Set([BookingStatus.COMPLETED]),
  [BookingStatus.CANCELLED]: new Set([BookingStatus.CANCELLED]),
};
const MS_PER_DAY = 24 * 60 * 60 * 1000;

type BookingReferenceKey = 'tourProgramId' | 'customerId' | 'orderId' | 'tourId';
type BookingLinkedReferenceKey = Exclude<BookingReferenceKey, 'tourProgramId'>;
type BookingReferenceInput = Partial<Record<BookingReferenceKey, unknown>>;
type BookingReferenceModel = 'tourProgram' | 'customer' | 'order' | 'tour';
type BookingReferenceValues = Record<BookingReferenceKey, string | null | undefined>;
type BookingLinkedReferenceValues = Record<BookingLinkedReferenceKey, string | null | undefined>;
type BookingReferenceConfig = { model: BookingReferenceModel; label: string; notFoundMessage: string };
type BookingTourProgramSnapshot = {
  id: string;
  durationDays: number;
  itineraryDays?: Array<{ dayNumber: number }>;
};
type BookingMutationState = {
  id: string;
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
  tourProgram: BookingTourProgramSnapshot;
  operationForm: { id: string; status: OperationStatus } | null;
};

const BOOKING_LINKED_REFERENCE_KEYS = ['customerId', 'orderId', 'tourId'] as const satisfies readonly BookingLinkedReferenceKey[];
const BOOKING_SEARCH_FIELDS = ['code', 'customerName', 'customerPhone', 'customerEmail', 'saleOwner', 'operatorOwner'] as const;
const BOOKING_TOUR_PROGRAM_SEARCH_FIELDS = ['code', 'name', 'route'] as const;

@Injectable()
export class BookingsService {
  constructor(private readonly prisma: PrismaService) {}

  private listSelect() {
    return {
      id: true,
      code: true,
      customerName: true,
      paxCount: true,
      startDate: true,
      endDate: true,
      saleOwner: true,
      operatorOwner: true,
      status: true,
      totalSellPrice: true,
      tourProgram: { select: { id: true, code: true, name: true } },
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
      operationVouchers: { orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, voucherCode: true, status: true } },
      allotmentLocks: { orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, status: true, quantity: true } },
      operationForm: { select: { id: true, status: true } },
    } satisfies Prisma.BookingSelect;
  }

  private mutationSelect() {
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
      tourProgram: { select: { id: true, durationDays: true } },
      operationForm: { select: { id: true, status: true } },
    } satisfies Prisma.BookingSelect;
  }

  list(
    search?: string,
    status?: string | BookingStatus,
    tourProgramId?: string,
    user?: RequestUser,
    take?: string | number,
    skip?: string | number,
  ) {
    const normalizedStatus = this.bookingStatus(status);
    const normalizedSearch = this.searchText(search);
    const normalizedTourProgramId = this.optionalId(tourProgramId, 'Tour mẫu');
    const normalizedTake = this.listTake(take);
    const normalizedSkip = this.listSkip(skip);
    const where: Prisma.BookingWhereInput = {
      deletedAt: null,
      ...(normalizedStatus ? { status: normalizedStatus } : {}),
      ...(normalizedTourProgramId ? { tourProgramId: normalizedTourProgramId } : {}),
      ...(normalizedSearch
        ? { OR: this.searchConditions(normalizedSearch) }
        : {}),
    };

    return this.prisma.booking.findMany({
      where: this.scopeWhere(where, user),
      select: this.listSelect(),
      orderBy: [{ startDate: 'asc' }, { code: 'asc' }],
      take: normalizedTake,
      skip: normalizedSkip,
    });
  }

  async deleteGuard(id: string, user?: RequestUser) {
    const booking = await this.prisma.booking.findFirst({
      where: this.scopeWhere({ id, deletedAt: null }, user),
      select: { id: true },
    });
    if (!booking) throw new NotFoundException(BOOKING_NOT_FOUND_MESSAGES.booking);
    const usage = await this.bookingUsage(booking.id);
    return {
      canDelete: usage.total === 0,
      operationForms: usage.operationForms,
      operationVouchers: usage.operationVouchers,
      allotmentLocks: usage.allotmentLocks,
    };
  }

  async detail(id: string, user?: RequestUser) {
    const booking = await this.prisma.booking.findFirst({
      where: this.scopeWhere({ id, deletedAt: null }, user),
      select: this.detailSelect(),
    });
    if (!booking) throw new NotFoundException(BOOKING_NOT_FOUND_MESSAGES.booking);
    return booking;
  }

  async create(dto: CreateBookingDto, user?: RequestUser) {
    this.ensureAllowedBookingPayload(dto, BOOKING_CREATE_FIELDS, 'tạo');
    const references = await this.resolveBookingReferences(dto, user, { creating: true });
    this.ensureBookingValues(dto, references.tourProgram.durationDays);
    try {
      return await this.prisma.booking.create({
        data: this.toCreateData(dto, references.values),
        select: this.detailSelect(),
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(BOOKING_CODE_CONFLICT_MESSAGE);
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateBookingDto, user?: RequestUser) {
    this.ensureNoStatusInBookingUpdate(dto);
    this.ensureAllowedBookingPayload(dto, BOOKING_UPDATE_FIELDS, 'cập nhật');
    this.ensureNoNullBookingUpdate(dto);
    const current = await this.loadForMutation(id, user);
    this.ensureOperationFormEditAllowed(current, dto);
    const references = await this.resolveBookingReferences(dto, user, { creating: false, current });
    await this.ensureOperationalDataEditAllowed(current, dto, references.values);
    this.ensureBookingValues(
      {
        startDate: dto.startDate !== undefined ? dto.startDate : current.startDate,
        endDate: dto.endDate !== undefined ? dto.endDate : current.endDate,
        paxCount: dto.paxCount ?? current.paxCount,
        totalSellPrice: dto.totalSellPrice ?? current.totalSellPrice,
      },
      references.tourProgram.durationDays,
    );
    try {
      return await this.prisma.booking.update({
        where: { id },
        data: this.toUpdateData(dto, references.values),
        select: this.detailSelect(),
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(BOOKING_CODE_CONFLICT_MESSAGE);
      }
      throw error;
    }
  }

  async updateStatus(id: string, status: string | BookingStatus, user?: RequestUser) {
    const current = await this.loadForMutation(id, user);
    const targetStatus = this.bookingStatus(status, true);
    if (!targetStatus) throw new BadRequestException('Trạng thái booking không được để trống');
    this.ensureStatusTransition(current.status, targetStatus, current.operationForm?.status);
    this.ensureBookingValues(
      {
        startDate: current.startDate,
        endDate: current.endDate,
        paxCount: current.paxCount,
        totalSellPrice: current.totalSellPrice,
      },
      current.tourProgram.durationDays,
    );
    return this.prisma.booking.update({
      where: { id },
      data: { status: targetStatus },
      select: this.detailSelect(),
    });
  }

  async remove(id: string, user?: RequestUser) {
    const booking = await this.loadForMutation(id, user);
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "Booking"
        WHERE "id" = ${booking.id} AND "deletedAt" IS NULL
        FOR UPDATE
      `;
      if (!locked.length) throw new NotFoundException(BOOKING_NOT_FOUND_MESSAGES.booking);
      await this.ensureCanDelete(booking.id, tx);
      const deletedAt = new Date();
      const softDeleted = await tx.booking.update({
        where: { id: booking.id },
        data: { deletedAt },
        select: this.detailSelect(),
      });
      await tx.auditLog.create({
        data: {
          actorId: user?.id,
          action: 'SOFT_DELETE',
          entity: 'Booking',
          entityId: booking.id,
          metadata: {
            code: booking.code,
            status: booking.status,
            deletedAt: deletedAt.toISOString(),
          },
        },
      });
      return softDeleted;
    });
  }

  private scopeWhere(where: Prisma.BookingWhereInput, user?: RequestUser): Prisma.BookingWhereInput {
    return bookingScopeWhere(where, user);
  }

  private async loadForMutation(id: string, user?: RequestUser) {
    const booking = await this.prisma.booking.findFirst({
      where: this.scopeWhere({ id, deletedAt: null }, user),
      select: this.mutationSelect(),
    });
    if (!booking) throw new NotFoundException(BOOKING_NOT_FOUND_MESSAGES.booking);
    return booking;
  }

  private searchText(search?: string) {
    return normalizeListSearch(search);
  }

  private listTake(value?: string | number) {
    if (value === undefined || value === null || value === '') return BOOKING_LIST_DEFAULT_TAKE;
    const take = Number(value);
    if (!Number.isInteger(take) || take < 1 || take > BOOKING_LIST_MAX_TAKE) {
      throw new BadRequestException(`Số booking mỗi trang phải là số nguyên từ 1 đến ${BOOKING_LIST_MAX_TAKE}`);
    }
    return take;
  }

  private listSkip(value?: string | number) {
    if (value === undefined || value === null || value === '') return 0;
    const skip = Number(value);
    if (!Number.isInteger(skip) || skip < 0) {
      throw new BadRequestException('Vị trí bắt đầu danh sách booking phải là số nguyên không âm');
    }
    return skip;
  }

  private searchConditions(search: string): Prisma.BookingWhereInput[] {
    const contains = containsSearch(search);
    return [
      ...BOOKING_SEARCH_FIELDS.map((field) => ({ [field]: contains }) as Prisma.BookingWhereInput),
      ...BOOKING_TOUR_PROGRAM_SEARCH_FIELDS.map((field) => ({ tourProgram: { [field]: contains } }) as Prisma.BookingWhereInput),
    ];
  }

  private async resolveBookingReferences(
    input: BookingReferenceInput,
    user: RequestUser | undefined,
    options: { creating: true; current?: never } | { creating: false; current: BookingMutationState },
  ) {
    const values = this.normalizedBookingReferences(input, options.creating);
    const tourProgram =
      values.tourProgramId !== undefined
        ? await this.ensureTourProgram(values.tourProgramId)
        : options.current?.tourProgram;
    if (!tourProgram) throw new BadRequestException('Tour mẫu không được để trống');

    await this.ensureBookingLinks(values, user);

    const finalLinks = this.finalLinkedReferences(options.creating ? undefined : options.current, values);
    await this.ensureScopedLinkedReferences(finalLinks, user, options.creating);

    return {
      values,
      tourProgram,
    };
  }

  private normalizedBookingReferences(input: BookingReferenceInput, requireTourProgram: boolean): BookingReferenceValues {
    return {
      tourProgramId:
        input.tourProgramId !== undefined || requireTourProgram
          ? this.requiredId(input.tourProgramId, this.referenceConfig('tourProgramId').label)
          : undefined,
      customerId:
        input.customerId !== undefined ? this.optionalId(input.customerId, this.referenceConfig('customerId').label) : undefined,
      orderId:
        input.orderId !== undefined ? this.optionalId(input.orderId, this.referenceConfig('orderId').label) : undefined,
      tourId:
        input.tourId !== undefined ? this.optionalId(input.tourId, this.referenceConfig('tourId').label) : undefined,
    };
  }

  private async ensureTourProgram(id: string | null | undefined): Promise<BookingTourProgramSnapshot> {
    if (!id) throw new BadRequestException('Tour mẫu không được để trống');
    const tourProgram = await this.ensureExists('tourProgramId', id);
    this.ensureTourProgramItineraryComplete(tourProgram);
    return tourProgram;
  }

  private async ensureBookingLinks(values: BookingReferenceValues, user?: RequestUser) {
    await Promise.all(
      BOOKING_LINKED_REFERENCE_KEYS
        .filter((key) => values[key] !== undefined && values[key])
        .map((key) => this.ensureExists(key, values[key] as string, user)),
    );
  }

  private async ensureExists(key: 'tourProgramId', id: string, user?: RequestUser): Promise<BookingTourProgramSnapshot>;
  private async ensureExists(key: BookingLinkedReferenceKey, id: string, user?: RequestUser): Promise<{ id: string }>;
  private async ensureExists(key: BookingReferenceKey, id: string, user?: RequestUser) {
    const config = this.referenceConfig(key);
    const row =
      config.model === 'tourProgram'
        ? await this.prisma.tourProgram.findUnique({
            where: { id },
            select: {
              id: true,
              durationDays: true,
              itineraryDays: { orderBy: { dayNumber: 'asc' }, select: { dayNumber: true } },
            },
          })
        : config.model === 'customer'
          ? await this.prisma.customer.findFirst({ where: branchDepartmentScopeWhere({ id }, user), select: { id: true } })
          : config.model === 'order'
            ? await this.prisma.order.findFirst({ where: branchDepartmentScopeWhere({ id }, user), select: { id: true } })
            : await this.prisma.tour.findFirst({ where: branchDepartmentScopeWhere({ id }, user), select: { id: true } });
    if (!row) throw new NotFoundException(config.notFoundMessage);
    return row;
  }

  private referenceConfig(key: BookingReferenceKey): BookingReferenceConfig {
    const configs: Record<BookingReferenceKey, BookingReferenceConfig> = {
      tourProgramId: { model: 'tourProgram', label: 'Tour mẫu', notFoundMessage: BOOKING_NOT_FOUND_MESSAGES.tourProgram },
      customerId: { model: 'customer', label: 'Khách hàng liên kết', notFoundMessage: BOOKING_NOT_FOUND_MESSAGES.customer },
      orderId: { model: 'order', label: 'Đơn hàng liên kết', notFoundMessage: BOOKING_NOT_FOUND_MESSAGES.order },
      tourId: { model: 'tour', label: 'Tour vận hành liên kết', notFoundMessage: BOOKING_NOT_FOUND_MESSAGES.tour },
    };
    return configs[key];
  }

  private ensureTourProgramItineraryComplete(tourProgram: {
    durationDays: number;
    itineraryDays?: Array<{ dayNumber: number }>;
  }) {
    const itineraryDays = tourProgram.itineraryDays || [];
    const dayNumbers = new Set(itineraryDays.map((day) => day.dayNumber));
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

  private finalLinkedReferences(
    current: { customerId: string | null; orderId: string | null; tourId: string | null } | undefined,
    values: BookingReferenceValues,
  ): BookingLinkedReferenceValues {
    return {
      customerId: values.customerId !== undefined ? values.customerId || null : current?.customerId,
      orderId: values.orderId !== undefined ? values.orderId || null : current?.orderId,
      tourId: values.tourId !== undefined ? values.tourId || null : current?.tourId,
    };
  }

  private async ensureScopedLinkedReferences(links: BookingLinkedReferenceValues, user: RequestUser | undefined, creating: boolean) {
    if (!this.requiresScopedLink(user)) return;
    if (!this.hasAnyLinkedReference(links)) {
      throw new BadRequestException(
        creating
          ? 'Cần liên kết khách hàng, đơn hàng hoặc tour vận hành để tạo booking theo phạm vi dữ liệu'
          : 'Booking cần giữ ít nhất một liên kết khách hàng, đơn hàng hoặc tour vận hành theo phạm vi dữ liệu',
      );
    }

    const scopedMatches = await Promise.all(
      BOOKING_LINKED_REFERENCE_KEYS.map((key) =>
        links[key] ? this.ensureScopedLinkedReferenceExists(key, links[key] as string, user) : Promise.resolve(null),
      ),
    );
    if (!scopedMatches.some(Boolean)) {
      throw new BadRequestException('Booking phải còn liên kết với dữ liệu thuộc phạm vi của bạn');
    }
  }

  private async ensureScopedLinkedReferenceExists(key: BookingLinkedReferenceKey, id: string, user?: RequestUser) {
    return this.ensureExists(key, id, user).catch((error) => {
      if (error instanceof NotFoundException) return null;
      throw error;
    });
  }

  private hasAnyLinkedReference(links: BookingLinkedReferenceValues) {
    return BOOKING_LINKED_REFERENCE_KEYS.some((key) => Boolean(links[key]));
  }

  private requiresScopedLink(user?: RequestUser) {
    if (!user || hasUnrestrictedDataScope(user)) return false;
    return true;
  }

  private ensureNoStatusInBookingUpdate(dto: UpdateBookingDto) {
    if ((dto as Record<string, unknown>).status !== undefined) {
      throw new BadRequestException('Dùng updateStatus hoặc PATCH /api/bookings/:id/status để cập nhật trạng thái booking');
    }
  }

  private ensureAllowedBookingPayload(dto: object, allowedFields: readonly string[], action: 'tạo' | 'cập nhật') {
    const allowed = new Set(allowedFields);
    const payload = dto as Record<string, unknown>;
    const invalidFields = Object.keys(payload).filter((field) => payload[field] !== undefined && !allowed.has(field));
    if (invalidFields.length) {
      throw new BadRequestException(`Trường không thuộc dữ liệu booking được phép ${action}: ${invalidFields.join(', ')}`);
    }
  }

  private ensureNoNullBookingUpdate(dto: UpdateBookingDto) {
    const labels: Record<(typeof BOOKING_NON_NULLABLE_UPDATE_FIELDS)[number], string> = {
      code: 'Mã booking',
      tourProgramId: 'Tour mẫu',
      customerName: 'Tên khách/đoàn',
      paxCount: 'Số khách',
      startDate: 'Ngày khởi hành',
      endDate: 'Ngày kết thúc',
      totalSellPrice: 'Giá bán tổng',
    };
    for (const field of BOOKING_NON_NULLABLE_UPDATE_FIELDS) {
      if (dto[field] === null) throw new BadRequestException(`${labels[field]} không được là null`);
    }
  }

  private ensureOperationFormEditAllowed(current: BookingMutationState, dto: UpdateBookingDto) {
    if (!current.operationForm || !this.hasBookingUpdatePayload(dto)) return;
    throw new ConflictException('Booking đã có phiếu điều hành, không thể chỉnh sửa booking.');
  }

  private hasBookingUpdatePayload(dto: UpdateBookingDto) {
    const payload = dto as Record<string, unknown>;
    return BOOKING_UPDATE_FIELDS.some((field) => payload[field] !== undefined);
  }

  private bookingStatus(status?: string | BookingStatus, required = false) {
    const value = this.optionalText(status);
    if (!value) {
      if (required) throw new BadRequestException('Trạng thái booking không được để trống');
      return undefined;
    }
    const normalized = value.toUpperCase();
    if (Object.values(BookingStatus).includes(normalized as BookingStatus)) return normalized as BookingStatus;
    throw new BadRequestException(`Trạng thái booking không hợp lệ: ${value}`);
  }

  private bookingStatusLabel(status: BookingStatus) {
    const labels: Record<BookingStatus, string> = {
      [BookingStatus.DRAFT]: 'Nháp',
      [BookingStatus.CONFIRMED]: 'Đã xác nhận',
      [BookingStatus.OPERATING]: 'Đang vận hành',
      [BookingStatus.COMPLETED]: 'Hoàn tất',
      [BookingStatus.CANCELLED]: 'Đã hủy',
    };
    return labels[status] || status;
  }

  private ensureStatusTransition(current: BookingStatus, target: BookingStatus, operationFormStatus?: OperationStatus | null) {
    const allowed = BOOKING_STATUS_TRANSITIONS[current] || new Set<BookingStatus>([current]);
    if (!allowed.has(target)) {
      throw new BadRequestException(`Không thể chuyển booking từ ${this.bookingStatusLabel(current)} sang ${this.bookingStatusLabel(target)}`);
    }
    if (target === BookingStatus.OPERATING && !operationFormStatus) {
      throw new BadRequestException('Booking cần có phiếu điều hành trước khi chuyển sang trạng thái đang vận hành');
    }
    if (target === BookingStatus.OPERATING && operationFormStatus === OperationStatus.CANCELLED) {
      throw new BadRequestException('Không thể chuyển booking sang đang vận hành khi phiếu điều hành đã hủy');
    }
  }

  private changedOperationalFieldLabels(
    current: {
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
    references: BookingReferenceValues,
  ) {
    const changed: string[] = [];
    if (dto.code !== undefined && this.bookingCode(dto.code) !== current.code) changed.push('mã booking');
    if (references.tourProgramId !== undefined && references.tourProgramId !== current.tourProgramId) changed.push('tour mẫu');
    if (references.customerId !== undefined && (references.customerId || null) !== current.customerId) changed.push('khách hàng liên kết');
    if (references.orderId !== undefined && (references.orderId || null) !== current.orderId) changed.push('đơn hàng liên kết');
    if (references.tourId !== undefined && (references.tourId || null) !== current.tourId) changed.push('tour vận hành liên kết');
    if (dto.customerName !== undefined && this.customerName(dto.customerName) !== current.customerName) changed.push('tên khách/đoàn');
    if (dto.customerPhone !== undefined && this.customerPhone(dto.customerPhone) !== current.customerPhone) changed.push('điện thoại khách');
    if (dto.customerEmail !== undefined && this.customerEmail(dto.customerEmail) !== current.customerEmail) changed.push('email khách');
    if (dto.paxCount !== undefined && this.paxCountValue(dto.paxCount) !== current.paxCount) changed.push('số khách');
    if (dto.startDate !== undefined && this.dateKey(dto.startDate) !== this.dateKey(current.startDate)) changed.push('ngày khởi hành');
    if (dto.endDate !== undefined && this.dateKey(dto.endDate) !== this.dateKey(current.endDate)) changed.push('ngày kết thúc');
    if (dto.totalSellPrice !== undefined && this.numberValue(dto.totalSellPrice, 'Giá bán tổng') !== this.numberValue(current.totalSellPrice, 'Giá bán tổng')) changed.push('giá bán tổng');
    return changed;
  }

  private async ensureOperationalDataEditAllowed(current: BookingMutationState, dto: UpdateBookingDto, references: BookingReferenceValues) {
    const usage = await this.bookingUsage(current.id);
    if (!usage.total) return;
    const changed = this.changedOperationalFieldLabels(current, dto, references);
    if (changed.length) {
      throw new ConflictException(`Booking đã phát sinh ${this.usageSummary(usage)}, không thể đổi ${changed.join(', ')}`);
    }
  }

  private async ensureCanDelete(id: string, client: Prisma.TransactionClient | PrismaService = this.prisma) {
    const usage = await this.bookingUsage(id, client);
    if (!usage.total) return;
    throw new ConflictException(`Không thể xóa booking vì đang có ${this.usageSummary(usage)}.`);
  }

  private async bookingUsage(id: string, client: Prisma.TransactionClient | PrismaService = this.prisma) {
    const [operationForms, operationVouchers, allotmentLocks] = await Promise.all([
      client.operationForm.count({ where: { bookingId: id } }),
      client.operationVoucher.count({ where: { bookingId: id } }),
      client.supplierAllotmentAllocation.count({ where: { bookingId: id } }),
    ]);
    const usage = { operationForms, operationVouchers, allotmentLocks };
    return { ...usage, total: Object.values(usage).reduce((sum, count) => sum + count, 0) };
  }

  private usageSummary(usage: Awaited<ReturnType<BookingsService['bookingUsage']>>) {
    const labels: Array<[Exclude<keyof typeof usage, 'total'>, string]> = [
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
    input: { startDate: unknown; endDate: unknown; paxCount?: unknown; totalSellPrice?: unknown },
    durationDays: number,
  ) {
    const { start, end } = this.ensureDateRange(input.startDate, input.endDate);
    const actualDuration = Math.round((end - start) / MS_PER_DAY) + 1;
    if (durationDays > 0 && actualDuration !== durationDays) {
      throw new BadRequestException(`Khoảng ngày booking phải đúng ${durationDays} ngày theo tour mẫu, hiện đang là ${actualDuration} ngày`);
    }
    if (input.paxCount !== undefined) this.paxCountValue(input.paxCount);
    if (input.totalSellPrice !== undefined && this.numberValue(input.totalSellPrice, 'Giá bán tổng') < 0) {
      throw new BadRequestException('Giá bán tổng không được âm');
    }
  }

  private ensureDateRange(startDate: unknown, endDate: unknown) {
    const start = this.dateOnlyTime(startDate, 'Ngày khởi hành');
    const end = this.dateOnlyTime(endDate, 'Ngày kết thúc');
    if (start > end) {
      throw new BadRequestException('Ngày khởi hành phải trước hoặc bằng ngày kết thúc');
    }
    return { start, end };
  }

  private dateOnlyTime(value: unknown, field: string) {
    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) throw new BadRequestException(`${field} không hợp lệ`);
      return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
    }

    if (value === null || value === undefined) throw new BadRequestException(`${field} không được để trống`);
    const text = String(value).trim();
    if (!text) throw new BadRequestException(`${field} không được để trống`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      throw new BadRequestException(`${field} phải có định dạng YYYY-MM-DD`);
    }

    const [year, month, day] = text.split('-').map(Number);
    const time = Date.UTC(year, month - 1, day);
    const date = new Date(time);
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
      throw new BadRequestException(`${field} không hợp lệ`);
    }
    return time;
  }

  private dateOnlyDate(value: unknown, field: string) {
    return new Date(this.dateOnlyTime(value, field));
  }

  private dateKey(value: unknown) {
    return this.dateOnlyTime(value, 'Ngày');
  }

  private numberValue(value: unknown, field: string) {
    const number = Number(value ?? 0);
    if (!Number.isFinite(number)) throw new BadRequestException(`${field} phải là số hợp lệ`);
    return number;
  }

  private paxCountValue(value: unknown) {
    const number = Number(value);
    if (!Number.isInteger(number) || number < 1) {
      throw new BadRequestException('Số khách phải là số nguyên lớn hơn 0');
    }
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
      throw new BadRequestException('Điện thoại khách phải có 6-15 chữ số và chỉ được dùng số, khoảng trắng, + ( ) . -');
    }
    return phone;
  }

  private customerEmail(value: unknown) {
    const email = this.optionalLimitedText(value, 'Email khách', BOOKING_EMAIL_MAX_LENGTH)?.toLowerCase() || null;
    if (email && !BOOKING_EMAIL_PATTERN.test(email)) {
      throw new BadRequestException('Email khách không hợp lệ');
    }
    return email;
  }

  private customerName(value: unknown) {
    return this.safeRequiredText(value, 'Tên khách/đoàn', BOOKING_CUSTOMER_NAME_MIN_LENGTH, BOOKING_CUSTOMER_NAME_MAX_LENGTH);
  }

  private ownerName(value: unknown, label: string) {
    return this.safeOptionalText(value, label, BOOKING_OWNER_MIN_LENGTH, BOOKING_OWNER_MAX_LENGTH);
  }

  private safeRequiredText(value: unknown, label: string, minLength: number, maxLength: number) {
    const text = this.requiredText(value, label, maxLength, minLength);
    this.ensureSafeText(text, label);
    return text;
  }

  private safeOptionalText(value: unknown, label: string, minLength: number, maxLength: number) {
    const text = this.optionalLimitedText(value, label, maxLength, minLength);
    if (text) this.ensureSafeText(text, label);
    return text;
  }

  private ensureSafeText(text: string, label: string) {
    if (!BOOKING_TEXT_PATTERN.test(text)) {
      throw new BadRequestException(`${label} không được chứa ký tự điều khiển hoặc dấu < >`);
    }
  }

  private requiredText(value: unknown, label: string, maxLength: number, minLength = 1) {
    const text = typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
    if (!text) throw new BadRequestException(`${label} không được để trống`);
    if (text.length < minLength) throw new BadRequestException(`${label} phải có ít nhất ${minLength} ký tự`);
    if (text.length > maxLength) throw new BadRequestException(`${label} không được vượt quá ${maxLength} ký tự`);
    return text;
  }

  private optionalLimitedText(value: unknown, label: string, maxLength: number, minLength = 0) {
    const text = this.optionalText(value);
    if (text && text.length < minLength) throw new BadRequestException(`${label} phải có ít nhất ${minLength} ký tự`);
    if (text && text.length > maxLength) throw new BadRequestException(`${label} không được vượt quá ${maxLength} ký tự`);
    return text;
  }

  private requiredId(value: unknown, label: string) {
    return this.requiredText(value, label, BOOKING_ID_MAX_LENGTH);
  }

  private optionalId(value: unknown, label: string) {
    return this.optionalLimitedText(value, label, BOOKING_ID_MAX_LENGTH);
  }

  private toCreateData(dto: CreateBookingDto, references: BookingReferenceValues): Prisma.BookingUncheckedCreateInput {
    return {
      code: this.bookingCode(dto.code),
      tourProgramId: references.tourProgramId as string,
      customerId: references.customerId,
      orderId: references.orderId,
      tourId: references.tourId,
      customerName: this.customerName(dto.customerName),
      customerPhone: this.customerPhone(dto.customerPhone),
      customerEmail: this.customerEmail(dto.customerEmail),
      paxCount: this.paxCountValue(dto.paxCount),
      startDate: this.dateOnlyDate(dto.startDate, 'Ngày khởi hành'),
      endDate: this.dateOnlyDate(dto.endDate, 'Ngày kết thúc'),
      saleOwner: this.ownerName(dto.saleOwner, 'Sale phụ trách'),
      operatorOwner: this.ownerName(dto.operatorOwner, 'Điều hành phụ trách'),
      totalSellPrice: this.numberValue(dto.totalSellPrice ?? BOOKING_DEFAULT_TOTAL_SELL_PRICE, 'Giá bán tổng'),
    };
  }

  private toUpdateData(dto: UpdateBookingDto, references: BookingReferenceValues): Prisma.BookingUncheckedUpdateInput {
    return {
      ...(dto.code !== undefined ? { code: this.bookingCode(dto.code) } : {}),
      ...(references.tourProgramId !== undefined ? { tourProgramId: references.tourProgramId as string } : {}),
      ...(references.customerId !== undefined ? { customerId: references.customerId } : {}),
      ...(references.orderId !== undefined ? { orderId: references.orderId } : {}),
      ...(references.tourId !== undefined ? { tourId: references.tourId } : {}),
      ...(dto.customerName !== undefined ? { customerName: this.customerName(dto.customerName) } : {}),
      ...(dto.customerPhone !== undefined ? { customerPhone: this.customerPhone(dto.customerPhone) } : {}),
      ...(dto.customerEmail !== undefined ? { customerEmail: this.customerEmail(dto.customerEmail) } : {}),
      ...(dto.paxCount !== undefined ? { paxCount: this.paxCountValue(dto.paxCount) } : {}),
      ...(dto.startDate !== undefined ? { startDate: this.dateOnlyDate(dto.startDate, 'Ngày khởi hành') } : {}),
      ...(dto.endDate !== undefined ? { endDate: this.dateOnlyDate(dto.endDate, 'Ngày kết thúc') } : {}),
      ...(dto.saleOwner !== undefined ? { saleOwner: this.ownerName(dto.saleOwner, 'Sale phụ trách') } : {}),
      ...(dto.operatorOwner !== undefined ? { operatorOwner: this.ownerName(dto.operatorOwner, 'Điều hành phụ trách') } : {}),
      ...(dto.totalSellPrice !== undefined ? { totalSellPrice: this.numberValue(dto.totalSellPrice, 'Giá bán tổng') } : {}),
    };
  }

  private optionalText(value?: unknown) {
    const trimmed = typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
    return trimmed ? trimmed : null;
  }
}

import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma, TourStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { applyWriteDataScope, branchDepartmentScopeWhere, hasUnrestrictedDataScope, RequestUser } from '../auth/data-scope';
import { FilesService } from '../files/files.service';
import { CreateTourGuideDto, UpdateTourGuideDto } from './dto/tour-guide.dto';

const GUIDE_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
const GUIDE_SCHEDULE_STATUSES = ['AVAILABLE', 'BUSY', 'CONFIRMED', 'OPERATING', 'COMPLETED', 'CANCELLED'] as const;
const VIETNAM_TIMEZONE_OFFSET_MINUTES = 7 * 60;
type ScheduleLinkContext = {
  orders: Map<string, { id: string; status: OrderStatus; startDate: Date | null; endDate: Date | null }>;
  tours: Map<string, { id: string; status: TourStatus; startDate: Date | null; endDate: Date | null }>;
};

@Injectable()
export class TourGuidesService {
  constructor(private readonly prisma: PrismaService, private readonly filesService: FilesService) {}

  list(search?: string, status?: string) {
    const normalizedStatus = status ? this.normalizeGuideStatus(status) : undefined;
    return this.prisma.guideProfile.findMany({
      where: {
        deletedAt: null,
        ...(normalizedStatus ? { status: normalizedStatus } : {}),
        ...(search
          ? {
              OR: [
                { guideCode: { contains: search, mode: 'insensitive' } },
                { fullName: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
                { guideType: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: { _count: { select: { cards: true, documents: true, costServices: true, schedules: true } } },
      orderBy: [{ updatedAt: 'desc' }, { guideCode: 'asc' }],
    });
  }

  async detail(id: string) {
    const guide = await this.prisma.guideProfile.findFirst({ where: { id, deletedAt: null }, include: this.includeAll() });
    if (!guide) throw new NotFoundException('Tour guide not found');
    return guide;
  }

  async addFile(
    guideId: string,
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer } | undefined,
    actorId?: string,
  ) {
    await this.detail(guideId);
    const upload = await this.filesService.upload(file, `tour-guides/${guideId}`, actorId);
    try {
      return await this.prisma.guideFile.create({
        data: {
          guideId,
          fileName: upload.fileName,
          fileUrl: upload.url,
          fileType: upload.mimeType,
          uploadedBy: actorId,
        },
      });
    } catch (error) {
      await this.filesService.removeQuietly(upload.objectKey);
      throw error;
    }
  }

  async deleteFile(guideId: string, fileId: string) {
    await this.detail(guideId);
    const file = await this.prisma.guideFile.findFirst({ where: { id: fileId, guideId } });
    if (!file) throw new NotFoundException('Không tìm thấy file HDV');
    const objectKey = this.filesService.objectKeyFromUrl(file.fileUrl);
    const deleted = await this.prisma.guideFile.delete({ where: { id: file.id } });
    try {
      await this.filesService.removeIfPresent(objectKey);
      return deleted;
    } catch (error) {
      await this.prisma.guideFile.create({
        data: {
          id: deleted.id,
          guideId: deleted.guideId,
          fileName: deleted.fileName,
          fileUrl: deleted.fileUrl,
          fileType: deleted.fileType,
          uploadedBy: deleted.uploadedBy,
          createdAt: deleted.createdAt,
        },
      }).catch(() => undefined);
      throw error;
    }
  }

  async create(dto: CreateTourGuideDto, user?: RequestUser) {
    this.validateGuidePayload(dto);
    this.validateSchedules(dto.schedules ?? []);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.assertUniqueGuide(tx, dto);
        const scheduleContext = await this.validateScheduleLinks(tx, dto.schedules ?? [], user);
        const guide = await tx.guideProfile.create({ data: this.toGuideData(dto) as Prisma.GuideProfileCreateInput });
        await this.replaceChildren(tx, guide.id, dto, scheduleContext);
        return tx.guideProfile.findUniqueOrThrow({ where: { id: guide.id }, include: this.includeAll() });
      });
    } catch (error) {
      this.handleUniqueCodeError(error);
      throw error;
    }
  }

  async update(id: string, dto: UpdateTourGuideDto, user?: RequestUser) {
    await this.detail(id);
    this.validateGuidePayload(dto);
    if (dto.schedules) this.validateSchedules(dto.schedules);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.assertUniqueGuide(tx, dto, id);
        const scheduleContext = await this.validateScheduleLinks(tx, dto.schedules ?? [], user);
        await tx.guideProfile.update({ where: { id }, data: this.toGuideData(dto) as Prisma.GuideProfileUpdateInput });
        await this.replaceChildren(tx, id, dto, scheduleContext);
        return tx.guideProfile.findUniqueOrThrow({ where: { id }, include: this.includeAll() });
      });
    } catch (error) {
      this.handleUniqueCodeError(error);
      throw error;
    }
  }

  async remove(id: string) {
    await this.detail(id);
    return this.prisma.guideProfile.update({ where: { id }, data: { deletedAt: new Date(), status: 'INACTIVE' } });
  }

  private async replaceChildren(tx: Prisma.TransactionClient, guideId: string, dto: Partial<CreateTourGuideDto>, scheduleContext: ScheduleLinkContext) {
    if (dto.cards) {
      const rows = dto.cards
        .filter((item) => this.text(item.cardType))
        .map((item, index) => ({
          guideId,
          cardType: item.cardType.trim(),
          cardNumber: this.text(item.cardNumber),
          issueDate: this.dateOnly(item.issueDate, 'Ngày cấp thẻ HDV'),
          expiredDate: this.dateOnly(item.expiredDate, 'Ngày hết hạn thẻ HDV'),
          issuePlace: this.text(item.issuePlace),
          fileUrl: this.text(item.fileUrl),
          note: this.text(item.note),
          sortOrder: index,
        }));
      await tx.guideCard.deleteMany({ where: { guideId } });
      if (rows.length) await tx.guideCard.createMany({ data: rows });
    }
    if (dto.documents) {
      const rows = dto.documents
        .filter((item) => this.text(item.documentType))
        .map((item, index) => ({
          guideId,
          documentType: item.documentType.trim(),
          documentNo: this.text(item.documentNo),
          country: this.text(item.country),
          issueDate: this.dateOnly(item.issueDate, 'Ngày cấp giấy tờ HDV'),
          expiredDate: this.dateOnly(item.expiredDate, 'Ngày hết hạn giấy tờ HDV'),
          issuePlace: this.text(item.issuePlace),
          fileUrl: this.text(item.fileUrl),
          note: this.text(item.note),
          sortOrder: index,
        }));
      await tx.guideDocument.deleteMany({ where: { guideId } });
      if (rows.length) await tx.guideDocument.createMany({ data: rows });
    }
    if (dto.costServices) {
      const rows = dto.costServices
        .filter((item) => this.text(item.serviceName))
        .map((item, index) => ({
          guideId,
          serviceType: this.text(item.serviceType),
          serviceName: item.serviceName.trim(),
          unit: this.text(item.unit),
          currency: this.text(item.currency) ?? 'VND',
          netPrice: item.netPrice ?? 0,
          sellingPrice: item.sellingPrice ?? 0,
          note: this.text(item.note),
          sortOrder: index,
        }));
      await tx.guideCostService.deleteMany({ where: { guideId } });
      if (rows.length) await tx.guideCostService.createMany({ data: rows });
    }
    if (dto.schedules) {
      const rows = dto.schedules
        .filter((item) => item.startDate && item.endDate)
        .map((item, index) => {
          const orderId = this.text(item.orderId);
          const tourId = this.text(item.tourId);
          return {
            guideId,
            tourId,
            orderId,
            title: this.text(item.title),
            startDate: this.dateTime(item.startDate, 'Ngày bắt đầu lịch điều hành')!,
            endDate: this.dateTime(item.endDate, 'Ngày kết thúc lịch điều hành')!,
            status: this.scheduleStatusForLinks(item.status, orderId, tourId, scheduleContext),
            note: this.text(item.note),
            sortOrder: index,
          };
        });
      await tx.guideSchedule.deleteMany({ where: { guideId } });
      if (rows.length) await tx.guideSchedule.createMany({ data: rows });
    }
  }

  private toGuideData(dto: Partial<CreateTourGuideDto>) {
    return {
      ...(dto.guideCode !== undefined ? { guideCode: dto.guideCode.trim() } : {}),
      ...(dto.fullName !== undefined ? { fullName: dto.fullName.trim() } : {}),
      ...(dto.taxCode !== undefined ? { taxCode: this.text(dto.taxCode) } : {}),
      ...(dto.birthday !== undefined ? { birthday: this.dateOnly(dto.birthday, 'Ngày sinh HDV') } : {}),
      ...(dto.gender !== undefined ? { gender: this.text(dto.gender) } : {}),
      ...(dto.phone !== undefined ? { phone: dto.phone.trim() } : {}),
      ...(dto.email !== undefined ? { email: this.text(dto.email) } : {}),
      ...(dto.address !== undefined ? { address: this.text(dto.address) } : {}),
      ...(dto.provinceId !== undefined ? { provinceId: this.text(dto.provinceId) } : {}),
      ...(dto.bankAccountName !== undefined ? { bankAccountName: this.text(dto.bankAccountName) } : {}),
      ...(dto.bankAccountNumber !== undefined ? { bankAccountNumber: this.text(dto.bankAccountNumber) } : {}),
      ...(dto.bankName !== undefined ? { bankName: this.text(dto.bankName) } : {}),
      ...(dto.link !== undefined ? { link: this.text(dto.link) } : {}),
      ...(dto.description !== undefined ? { description: this.text(dto.description) } : {}),
      ...(dto.guideType !== undefined ? { guideType: this.text(dto.guideType) } : {}),
      ...(dto.languages !== undefined ? { languages: dto.languages.filter(Boolean) } : {}),
      ...(dto.markets !== undefined ? { markets: dto.markets.filter(Boolean) } : {}),
      ...(dto.skills !== undefined ? { skills: dto.skills.filter(Boolean) } : {}),
      ...(dto.frequency !== undefined ? { frequency: this.text(dto.frequency) } : {}),
      ...(dto.avatarUrl !== undefined ? { avatarUrl: this.text(dto.avatarUrl) } : {}),
      ...(dto.comment !== undefined ? { comment: this.text(dto.comment) } : {}),
      ...(dto.status !== undefined ? { status: this.normalizeGuideStatus(dto.status || 'ACTIVE') } : {}),
      ...(dto.createdBy !== undefined ? { createdBy: this.text(dto.createdBy) } : {}),
    };
  }

  private validateGuidePayload(dto: Partial<CreateTourGuideDto>) {
    if (dto.guideCode !== undefined && !this.text(dto.guideCode)) throw new BadRequestException('Mã HDV là bắt buộc');
    if (dto.fullName !== undefined && !this.text(dto.fullName)) throw new BadRequestException('Họ tên HDV là bắt buộc');
    if (dto.phone !== undefined && !this.text(dto.phone)) throw new BadRequestException('Số điện thoại HDV là bắt buộc');
    if (dto.status !== undefined) this.normalizeGuideStatus(dto.status || 'ACTIVE');
  }

  private validateSchedules(schedules: Array<{ startDate?: string; endDate?: string; status?: string; title?: string; tourId?: string; orderId?: string; note?: string }>) {
    const normalized = schedules
      .filter((item) => [item.startDate, item.endDate, item.title, item.tourId, item.orderId, item.note].some((value) => this.text(value)) || Boolean(item.status))
      .map((item) => {
        if (!item.startDate || !item.endDate) throw new BadRequestException('Lịch điều hành phải có ngày bắt đầu và ngày kết thúc');
        return {
          start: this.dateTime(item.startDate, 'Ngày bắt đầu lịch điều hành')!,
          end: this.dateTime(item.endDate, 'Ngày kết thúc lịch điều hành')!,
          status: this.normalizeScheduleStatus(item.status ?? 'BUSY'),
        };
      });
    for (const item of normalized) if (item.end <= item.start) throw new BadRequestException('Ngày kết thúc lịch điều hành phải sau ngày bắt đầu');
    for (let i = 0; i < normalized.length; i += 1) {
      for (let j = i + 1; j < normalized.length; j += 1) {
        if (normalized[i].status === 'CANCELLED' || normalized[j].status === 'CANCELLED') continue;
        if (normalized[i].start < normalized[j].end && normalized[j].start < normalized[i].end) throw new BadRequestException('Lịch điều hành HDV bị trùng thời gian');
      }
    }
  }

  private async validateScheduleLinks(tx: Prisma.TransactionClient, schedules: Array<{ tourId?: string; orderId?: string; startDate?: string; endDate?: string }>, user?: RequestUser): Promise<ScheduleLinkContext> {
    const tourIds = [...new Set(schedules.map((item) => this.text(item.tourId)).filter((id): id is string => Boolean(id)))];
    const orderIds = [...new Set(schedules.map((item) => this.text(item.orderId)).filter((id): id is string => Boolean(id)))];
    if (tourIds.length || orderIds.length) this.assertScopedScheduleWrite(user);
    const context: ScheduleLinkContext = { orders: new Map(), tours: new Map() };
    if (tourIds.length) {
      const tours = await tx.tour.findMany({
        where: branchDepartmentScopeWhere({ id: { in: tourIds } }, user),
        select: { id: true, status: true, startDate: true, endDate: true },
      });
      if (tours.length !== tourIds.length) throw new NotFoundException('Không tìm thấy tour trong lịch điều hành HDV');
      tours.forEach((tour) => context.tours.set(tour.id, tour));
    }
    if (orderIds.length) {
      const orders = await tx.order.findMany({
        where: branchDepartmentScopeWhere({ id: { in: orderIds }, deletedAt: null }, user),
        select: { id: true, status: true, startDate: true, endDate: true },
      });
      if (orders.length !== orderIds.length) throw new NotFoundException('Không tìm thấy đơn hàng trong lịch điều hành HDV');
      orders.forEach((order) => context.orders.set(order.id, order));
    }
    this.validateScheduleRangesAgainstLinks(schedules, context);
    return context;
  }

  private assertScopedScheduleWrite(user?: RequestUser) {
    if (!user || hasUnrestrictedDataScope(user)) return;
    applyWriteDataScope({ branch: undefined, department: undefined }, user);
  }

  private includeAll() {
    return { cards: { orderBy: { sortOrder: 'asc' } }, documents: { orderBy: { sortOrder: 'asc' } }, costServices: { orderBy: { sortOrder: 'asc' } }, files: true, schedules: { include: { tour: true, order: true }, orderBy: { startDate: 'asc' } } } satisfies Prisma.GuideProfileInclude;
  }

  private async assertUniqueGuide(tx: Prisma.TransactionClient, dto: Partial<CreateTourGuideDto>, excludeId?: string) {
    const guideCode = this.text(dto.guideCode);
    const email = this.text(dto.email)?.toLowerCase();
    const phone = this.text(dto.phone);
    const OR: Prisma.GuideProfileWhereInput[] = [];
    if (guideCode) OR.push({ guideCode: { equals: guideCode, mode: 'insensitive' } });
    if (email) OR.push({ email: { equals: email, mode: 'insensitive' } });
    if (phone) OR.push({ phone });
    if (!OR.length) return;
    const conflicts = await tx.guideProfile.findMany({
      where: { deletedAt: null, ...(excludeId ? { id: { not: excludeId } } : {}), OR },
      select: { guideCode: true, email: true, phone: true },
      take: 3,
    });
    if (guideCode && conflicts.some((item) => item.guideCode.toLowerCase() === guideCode.toLowerCase())) throw new ConflictException('Mã HDV đã tồn tại');
    if (email && conflicts.some((item) => item.email?.toLowerCase() === email)) throw new ConflictException('Email HDV đã tồn tại');
    if (phone && conflicts.some((item) => item.phone === phone)) throw new ConflictException('Số điện thoại HDV đã tồn tại');
  }

  private validateScheduleRangesAgainstLinks(schedules: Array<{ tourId?: string; orderId?: string; startDate?: string; endDate?: string }>, context: ScheduleLinkContext) {
    for (const schedule of schedules) {
      if (!schedule.startDate || !schedule.endDate) continue;
      const startDate = this.dateTime(schedule.startDate, 'Ngày bắt đầu lịch điều hành')!;
      const endDate = this.dateTime(schedule.endDate, 'Ngày kết thúc lịch điều hành')!;
      const order = this.text(schedule.orderId) ? context.orders.get(this.text(schedule.orderId)!) : null;
      const tour = this.text(schedule.tourId) ? context.tours.get(this.text(schedule.tourId)!) : null;
      const source = order ?? tour;
      if (!source) continue;
      if (source.startDate && startDate < source.startDate) throw new BadRequestException('Lịch điều hành HDV không được bắt đầu trước ngày khởi hành của tour/đơn hàng liên kết');
      if (source.endDate && endDate > source.endDate) throw new BadRequestException('Lịch điều hành HDV không được kết thúc sau ngày về của tour/đơn hàng liên kết');
    }
  }

  private normalizeGuideStatus(status: string) {
    const normalized = status.toUpperCase();
    if (!(GUIDE_STATUSES as readonly string[]).includes(normalized)) throw new BadRequestException('Trạng thái HDV không hợp lệ');
    return normalized;
  }

  private normalizeScheduleStatus(status: string) {
    const normalized = status.toUpperCase();
    if (!(GUIDE_SCHEDULE_STATUSES as readonly string[]).includes(normalized)) throw new BadRequestException('Trạng thái lịch điều hành HDV không hợp lệ');
    return normalized;
  }

  private scheduleStatusForLinks(status: string | undefined, orderId: string | null, tourId: string | null, context: ScheduleLinkContext) {
    const requested = this.normalizeScheduleStatus(status || 'BUSY');
    const orderStatus = orderId ? context.orders.get(orderId)?.status : null;
    const tourStatus = tourId ? context.tours.get(tourId)?.status : null;
    if (orderStatus === 'CANCELLED' || tourStatus === 'CANCELLED') return 'CANCELLED';
    if (orderStatus === 'COMPLETED' || orderStatus === 'SETTLED' || tourStatus === 'COMPLETED' || tourStatus === 'SETTLED') return 'COMPLETED';
    return requested;
  }

  private handleUniqueCodeError(error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('Mã HDV đã tồn tại');
    }
  }

  private text(value?: string | null) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private dateOnly(value?: string | null, label = 'Ngày') {
    const trimmed = this.text(value);
    if (!trimmed) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const parsed = new Date(`${trimmed}T00:00:00.000Z`);
      if (Number.isNaN(parsed.getTime())) throw new BadRequestException(`${label} không hợp lệ`);
      return parsed;
    }
    return this.dateTime(trimmed, label);
  }

  private dateTime(value?: string | null, label = 'Ngày') {
    if (!value) return null;
    const trimmed = value.trim();
    const localDateTime = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
    const parsed = localDateTime
      ? new Date(Date.UTC(
          Number(localDateTime[1]),
          Number(localDateTime[2]) - 1,
          Number(localDateTime[3]),
          Number(localDateTime[4]),
          Number(localDateTime[5]),
          Number(localDateTime[6] ?? 0),
        ) - VIETNAM_TIMEZONE_OFFSET_MINUTES * 60 * 1000)
      : new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) throw new BadRequestException(`${label} không hợp lệ`);
    return parsed;
  }
}

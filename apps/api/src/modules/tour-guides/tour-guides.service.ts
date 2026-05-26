import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateTourGuideDto, UpdateTourGuideDto } from './dto/tour-guide.dto';

@Injectable()
export class TourGuidesService {
  constructor(private readonly prisma: PrismaService) {}

  list(search?: string, status?: string) {
    return this.prisma.guideProfile.findMany({
      where: {
        deletedAt: null,
        ...(status ? { status } : {}),
        ...(search
          ? {
              OR: [
                { guideCode: { contains: search, mode: 'insensitive' } },
                { fullName: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search, mode: 'insensitive' } },
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

  async create(dto: CreateTourGuideDto) {
    this.validateSchedules(dto.schedules ?? []);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.validateScheduleLinks(tx, dto.schedules ?? []);
        const guide = await tx.guideProfile.create({ data: this.toGuideData(dto) as Prisma.GuideProfileCreateInput });
        await this.replaceChildren(tx, guide.id, dto);
        return tx.guideProfile.findUniqueOrThrow({ where: { id: guide.id }, include: this.includeAll() });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Guide code already exists');
      throw error;
    }
  }

  async update(id: string, dto: UpdateTourGuideDto) {
    await this.detail(id);
    if (dto.schedules) this.validateSchedules(dto.schedules);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.validateScheduleLinks(tx, dto.schedules ?? []);
        await tx.guideProfile.update({ where: { id }, data: this.toGuideData(dto) as Prisma.GuideProfileUpdateInput });
        await this.replaceChildren(tx, id, dto);
        return tx.guideProfile.findUniqueOrThrow({ where: { id }, include: this.includeAll() });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Guide code already exists');
      throw error;
    }
  }

  async remove(id: string) {
    await this.detail(id);
    return this.prisma.guideProfile.update({ where: { id }, data: { deletedAt: new Date(), status: 'INACTIVE' } });
  }

  private async replaceChildren(tx: Prisma.TransactionClient, guideId: string, dto: Partial<CreateTourGuideDto>) {
    if (dto.cards) {
      await tx.guideCard.deleteMany({ where: { guideId } });
      await tx.guideCard.createMany({ data: dto.cards.filter((i) => i.cardType).map((i, index) => ({ guideId, cardType: i.cardType.trim(), cardNumber: this.text(i.cardNumber), issueDate: this.date(i.issueDate), expiredDate: this.date(i.expiredDate), issuePlace: this.text(i.issuePlace), fileUrl: this.text(i.fileUrl), note: this.text(i.note), sortOrder: index })) });
    }
    if (dto.documents) {
      await tx.guideDocument.deleteMany({ where: { guideId } });
      await tx.guideDocument.createMany({ data: dto.documents.filter((i) => i.documentType).map((i, index) => ({ guideId, documentType: i.documentType.trim(), documentNo: this.text(i.documentNo), country: this.text(i.country), issueDate: this.date(i.issueDate), expiredDate: this.date(i.expiredDate), issuePlace: this.text(i.issuePlace), fileUrl: this.text(i.fileUrl), note: this.text(i.note), sortOrder: index })) });
    }
    if (dto.costServices) {
      await tx.guideCostService.deleteMany({ where: { guideId } });
      await tx.guideCostService.createMany({ data: dto.costServices.filter((i) => i.serviceName).map((i, index) => ({ guideId, serviceType: this.text(i.serviceType), serviceName: i.serviceName.trim(), unit: this.text(i.unit), currency: i.currency || 'VND', netPrice: i.netPrice ?? 0, sellingPrice: i.sellingPrice ?? 0, note: this.text(i.note), sortOrder: index })) });
    }
    if (dto.schedules) {
      await tx.guideSchedule.deleteMany({ where: { guideId } });
      await tx.guideSchedule.createMany({ data: dto.schedules.filter((i) => i.startDate && i.endDate).map((i, index) => ({ guideId, tourId: this.text(i.tourId), orderId: this.text(i.orderId), title: this.text(i.title), startDate: new Date(i.startDate), endDate: new Date(i.endDate), status: i.status || 'BUSY', note: this.text(i.note), sortOrder: index })) });
    }
  }

  private toGuideData(dto: Partial<CreateTourGuideDto>) {
    return {
      ...(dto.guideCode !== undefined ? { guideCode: dto.guideCode.trim() } : {}),
      ...(dto.fullName !== undefined ? { fullName: dto.fullName.trim() } : {}),
      ...(dto.taxCode !== undefined ? { taxCode: this.text(dto.taxCode) } : {}),
      ...(dto.birthday !== undefined ? { birthday: this.date(dto.birthday) } : {}),
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
      ...(dto.status !== undefined ? { status: dto.status || 'ACTIVE' } : {}),
      ...(dto.createdBy !== undefined ? { createdBy: this.text(dto.createdBy) } : {}),
    };
  }

  private validateSchedules(schedules: Array<{ startDate?: string; endDate?: string }>) {
    const normalized = schedules.filter((item) => item.startDate && item.endDate).map((item) => ({ start: new Date(item.startDate!), end: new Date(item.endDate!) }));
    for (const item of normalized) if (item.end < item.start) throw new BadRequestException('Schedule end date must be after start date');
    for (let i = 0; i < normalized.length; i += 1) {
      for (let j = i + 1; j < normalized.length; j += 1) {
        if (normalized[i].start <= normalized[j].end && normalized[j].start <= normalized[i].end) throw new BadRequestException('Guide schedule conflict detected');
      }
    }
  }

  private async validateScheduleLinks(tx: Prisma.TransactionClient, schedules: Array<{ tourId?: string; orderId?: string }>) {
    const tourIds = [...new Set(schedules.map((item) => this.text(item.tourId)).filter((id): id is string => Boolean(id)))];
    const orderIds = [...new Set(schedules.map((item) => this.text(item.orderId)).filter((id): id is string => Boolean(id)))];
    if (tourIds.length) {
      const count = await tx.tour.count({ where: { id: { in: tourIds } } });
      if (count !== tourIds.length) throw new NotFoundException('Tour not found in guide schedule');
    }
    if (orderIds.length) {
      const count = await tx.order.count({ where: { id: { in: orderIds } } });
      if (count !== orderIds.length) throw new NotFoundException('Order not found in guide schedule');
    }
  }

  private includeAll() {
    return { cards: { orderBy: { sortOrder: 'asc' } }, documents: { orderBy: { sortOrder: 'asc' } }, costServices: { orderBy: { sortOrder: 'asc' } }, files: true, schedules: { include: { tour: true, order: true }, orderBy: { startDate: 'asc' } } } satisfies Prisma.GuideProfileInclude;
  }

  private text(value?: string | null) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private date(value?: string | null) {
    return value ? new Date(value) : null;
  }
}

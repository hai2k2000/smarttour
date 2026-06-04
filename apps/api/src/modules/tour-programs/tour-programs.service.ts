import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateItineraryDayDto } from './dto/create-itinerary-day.dto';
import { CreateTourProgramDto } from './dto/create-tour-program.dto';
import { UpdateItineraryDayDto } from './dto/update-itinerary-day.dto';
import { UpdateTourProgramDto } from './dto/update-tour-program.dto';

@Injectable()
export class TourProgramsService {
  constructor(private readonly prisma: PrismaService) {}

  private listSelect() {
    return {
      id: true,
      code: true,
      name: true,
      route: true,
      durationDays: true,
      description: true,
      createdAt: true,
      updatedAt: true,
      itineraryDays: { orderBy: { dayNumber: 'asc' as const }, select: { id: true, dayNumber: true, title: true, description: true } },
      _count: { select: { bookings: true } },
    } satisfies Prisma.TourProgramSelect;
  }

  list(search?: string) {
    const where: Prisma.TourProgramWhereInput = search
      ? {
          OR: [
            { code: { contains: search, mode: 'insensitive' } },
            { name: { contains: search, mode: 'insensitive' } },
            { route: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {};

    return this.prisma.tourProgram.findMany({
      where,
      select: this.listSelect(),
      orderBy: [{ updatedAt: 'desc' }, { code: 'asc' }],
    });
  }

  async detail(id: string) {
    const tourProgram = await this.prisma.tourProgram.findUnique({
      where: { id },
      include: {
        itineraryDays: { orderBy: { dayNumber: 'asc' } },
        bookings: { orderBy: { startDate: 'desc' } },
      },
    });
    if (!tourProgram) throw new NotFoundException('Tour program not found');
    return tourProgram;
  }

  async create(dto: CreateTourProgramDto) {
    try {
      return await this.prisma.tourProgram.create({
        data: this.toTourProgramData(dto) as Prisma.TourProgramCreateInput,
        include: { itineraryDays: true },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Tour program code already exists');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateTourProgramDto) {
    await this.detail(id);
    try {
      return await this.prisma.tourProgram.update({
        where: { id },
        data: this.toTourProgramData(dto) as Prisma.TourProgramUpdateInput,
        include: { itineraryDays: { orderBy: { dayNumber: 'asc' } } },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Tour program code already exists');
      }
      throw error;
    }
  }

  async remove(id: string) {
    await this.detail(id);
    return this.prisma.tourProgram.delete({ where: { id } });
  }

  async createItineraryDay(tourProgramId: string, dto: CreateItineraryDayDto) {
    await this.detail(tourProgramId);
    return this.prisma.tourItineraryDay.create({
      data: {
        tourProgramId,
        dayNumber: dto.dayNumber,
        title: dto.title.trim(),
        description: this.optionalText(dto.description),
      },
    });
  }

  async updateItineraryDay(id: string, dto: UpdateItineraryDayDto) {
    await this.ensureItineraryDay(id);
    return this.prisma.tourItineraryDay.update({
      where: { id },
      data: {
        ...(dto.dayNumber !== undefined ? { dayNumber: dto.dayNumber } : {}),
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.description !== undefined ? { description: this.optionalText(dto.description) } : {}),
      },
    });
  }

  async removeItineraryDay(id: string) {
    await this.ensureItineraryDay(id);
    return this.prisma.tourItineraryDay.delete({ where: { id } });
  }

  private async ensureItineraryDay(id: string) {
    const day = await this.prisma.tourItineraryDay.findUnique({ where: { id } });
    if (!day) throw new NotFoundException('Itinerary day not found');
  }

  private toTourProgramData(dto: UpdateTourProgramDto) {
    return {
      ...(dto.code !== undefined ? { code: dto.code.trim().toUpperCase() } : {}),
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.route !== undefined ? { route: this.optionalText(dto.route) } : {}),
      ...(dto.durationDays !== undefined ? { durationDays: dto.durationDays } : {}),
      ...(dto.description !== undefined ? { description: this.optionalText(dto.description) } : {}),
    };
  }

  private optionalText(value?: string) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }
}

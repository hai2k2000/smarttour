import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { containsSearch, normalizeListSearch } from '../list-search';
import {
  CreateItineraryDayDto,
  TOUR_ITINERARY_DESCRIPTION_MAX_LENGTH,
  TOUR_ITINERARY_TITLE_MAX_LENGTH,
} from './dto/create-itinerary-day.dto';
import {
  CreateTourProgramDto,
  TOUR_PROGRAM_CODE_MAX_LENGTH,
  TOUR_PROGRAM_DESCRIPTION_MAX_LENGTH,
  TOUR_PROGRAM_DURATION_DAYS_MAX,
  TOUR_PROGRAM_NAME_MAX_LENGTH,
  TOUR_PROGRAM_ROUTE_MAX_LENGTH,
} from './dto/create-tour-program.dto';
import { UpdateItineraryDayDto } from './dto/update-itinerary-day.dto';
import { UpdateTourProgramDto } from './dto/update-tour-program.dto';

@Injectable()
export class TourProgramsService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly maxCodeLength = TOUR_PROGRAM_CODE_MAX_LENGTH;
  private readonly maxNameLength = TOUR_PROGRAM_NAME_MAX_LENGTH;
  private readonly maxRouteLength = TOUR_PROGRAM_ROUTE_MAX_LENGTH;
  private readonly maxTitleLength = TOUR_ITINERARY_TITLE_MAX_LENGTH;
  private readonly maxDescriptionLength = TOUR_PROGRAM_DESCRIPTION_MAX_LENGTH;
  private readonly maxItineraryDescriptionLength = TOUR_ITINERARY_DESCRIPTION_MAX_LENGTH;
  private readonly maxDurationDays = TOUR_PROGRAM_DURATION_DAYS_MAX;

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
    const searchText = normalizeListSearch(search);
    const contains = searchText ? containsSearch(searchText) : undefined;
    const where: Prisma.TourProgramWhereInput = contains
      ? {
          OR: [
            { code: contains },
            { name: contains },
            { route: contains },
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
        _count: { select: { bookings: true } },
      },
    });
    if (!tourProgram) throw new NotFoundException('Không tìm thấy chương trình tour');
    return tourProgram;
  }

  async create(dto: CreateTourProgramDto) {
    this.validateTourProgramInput(dto);
    try {
      return await this.prisma.tourProgram.create({
        data: this.toTourProgramData(dto) as Prisma.TourProgramCreateInput,
        include: { itineraryDays: true },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Mã chương trình tour đã tồn tại');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateTourProgramDto) {
    const current = await this.detail(id);
    this.validateTourProgramInput(dto);
    if (dto.durationDays !== undefined) {
      this.ensureDurationChangeAllowed(dto.durationDays, current.durationDays, current._count.bookings);
      this.ensureDurationCoversItinerary(dto.durationDays, current.itineraryDays);
    }
    try {
      return await this.prisma.tourProgram.update({
        where: { id },
        data: this.toTourProgramData(dto) as Prisma.TourProgramUpdateInput,
        include: { itineraryDays: { orderBy: { dayNumber: 'asc' } } },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Mã chương trình tour đã tồn tại');
      }
      throw error;
    }
  }

  async remove(id: string) {
    const tourProgram = await this.prisma.tourProgram.findUnique({
      where: { id },
      select: {
        id: true,
        _count: { select: { bookings: true, itineraryDays: true } },
      },
    });
    if (!tourProgram) throw new NotFoundException('Không tìm thấy chương trình tour');
    if (tourProgram._count.bookings > 0) {
      throw new ConflictException(`Không thể xóa chương trình tour vì đang có ${tourProgram._count.bookings} booking liên quan`);
    }
    if (tourProgram._count.itineraryDays > 0) {
      throw new ConflictException(`Không thể xóa chương trình tour vì còn ${tourProgram._count.itineraryDays} ngày hành trình`);
    }
    return this.prisma.tourProgram.delete({ where: { id } });
  }

  async createItineraryDay(tourProgramId: string, dto: CreateItineraryDayDto) {
    const tourProgram = await this.prisma.tourProgram.findUnique({
      where: { id: tourProgramId },
      select: { id: true, durationDays: true },
    });
    if (!tourProgram) throw new NotFoundException('Không tìm thấy chương trình tour');
    this.validateItineraryDayInput(dto);
    this.ensureDayNumberWithinDuration(dto.dayNumber, tourProgram.durationDays);
    await this.ensureUniqueItineraryDay(tourProgramId, dto.dayNumber);
    try {
      return await this.prisma.tourItineraryDay.create({
        data: {
          tourProgramId,
          dayNumber: dto.dayNumber,
          title: dto.title.trim(),
          description: this.optionalText(dto.description),
        },
      });
    } catch (error) {
      if (this.isUniqueError(error)) {
        throw new ConflictException('Số thứ tự ngày hành trình đã tồn tại trong chương trình tour này');
      }
      throw error;
    }
  }

  async updateItineraryDay(id: string, dto: UpdateItineraryDayDto) {
    const current = await this.ensureItineraryDay(id);
    this.validateItineraryDayInput(dto);
    const nextDayNumber = dto.dayNumber ?? current.dayNumber;
    this.ensureDayNumberWithinDuration(nextDayNumber, current.tourProgram.durationDays);
    if (dto.dayNumber !== undefined && dto.dayNumber !== current.dayNumber) {
      await this.ensureUniqueItineraryDay(current.tourProgramId, dto.dayNumber, id);
    }
    try {
      return await this.prisma.tourItineraryDay.update({
        where: { id },
        data: {
          ...(dto.dayNumber !== undefined ? { dayNumber: dto.dayNumber } : {}),
          ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
          ...(dto.description !== undefined ? { description: this.optionalText(dto.description) } : {}),
        },
      });
    } catch (error) {
      if (this.isUniqueError(error)) {
        throw new ConflictException('Số thứ tự ngày hành trình đã tồn tại trong chương trình tour này');
      }
      throw error;
    }
  }

  async removeItineraryDay(id: string) {
    const day = await this.prisma.tourItineraryDay.findUnique({
      where: { id },
      select: { id: true, _count: { select: { services: true } } },
    });
    if (!day) throw new NotFoundException('Không tìm thấy ngày hành trình');
    if (day._count.services > 0) {
      throw new ConflictException(`Không thể xóa ngày hành trình vì đang có ${day._count.services} dịch vụ điều hành liên quan`);
    }
    return this.prisma.tourItineraryDay.delete({ where: { id } });
  }

  private async ensureItineraryDay(id: string) {
    const day = await this.prisma.tourItineraryDay.findUnique({
      where: { id },
      include: { tourProgram: { select: { durationDays: true } } },
    });
    if (!day) throw new NotFoundException('Không tìm thấy ngày hành trình');
    return day;
  }

  private validateTourProgramInput(dto: UpdateTourProgramDto) {
    if (dto.code !== undefined) this.validateRequiredText(dto.code, 'Mã chương trình tour', this.maxCodeLength);
    if (dto.name !== undefined) this.validateRequiredText(dto.name, 'Tên chương trình tour', this.maxNameLength);
    if (dto.route !== undefined) this.validateOptionalText(dto.route, 'Tuyến điểm', this.maxRouteLength);
    if (dto.description !== undefined) {
      this.validateOptionalText(dto.description, 'Mô tả', this.maxDescriptionLength);
    }
    if (dto.durationDays !== undefined) this.validatePositiveInt(dto.durationDays, 'Số ngày', this.maxDurationDays);
  }

  private validateItineraryDayInput(dto: UpdateItineraryDayDto) {
    if (dto.dayNumber !== undefined) this.validatePositiveInt(dto.dayNumber, 'Số thứ tự ngày hành trình');
    if (dto.title !== undefined) this.validateRequiredText(dto.title, 'Tiêu đề ngày hành trình', this.maxTitleLength);
    if (dto.description !== undefined) {
      this.validateOptionalText(dto.description, 'Mô tả ngày hành trình', this.maxItineraryDescriptionLength);
    }
  }

  private validateRequiredText(value: string, label: string, maxLength: number) {
    const trimmed = value.trim();
    if (trimmed.length < 2) throw new BadRequestException(`${label} phải có ít nhất 2 ký tự`);
    if (trimmed.length > maxLength) throw new BadRequestException(`${label} không được vượt quá ${maxLength} ký tự`);
  }

  private validateOptionalText(value: string | undefined, label: string, maxLength: number) {
    const trimmed = value?.trim();
    if (trimmed && trimmed.length > maxLength) throw new BadRequestException(`${label} không được vượt quá ${maxLength} ký tự`);
  }

  private validatePositiveInt(value: number, label: string, max?: number) {
    if (!Number.isInteger(value) || value < 1) throw new BadRequestException(`${label} phải lớn hơn hoặc bằng 1`);
    if (max !== undefined && value > max) throw new BadRequestException(`${label} không được vượt quá ${max}`);
  }

  private ensureDurationCoversItinerary(
    durationDays: number,
    itineraryDays: Array<{ dayNumber: number }>,
  ) {
    const maxExistingDay = itineraryDays.reduce((max, day) => Math.max(max, day.dayNumber), 0);
    if (durationDays < maxExistingDay) {
      throw new BadRequestException('Số ngày chương trình không được nhỏ hơn số ngày hành trình hiện có');
    }
  }

  private ensureDurationChangeAllowed(nextDurationDays: number, currentDurationDays: number, bookingCount: number) {
    if (bookingCount > 0 && nextDurationDays !== currentDurationDays) {
      throw new ConflictException('Không thể thay đổi số ngày chương trình vì tour đã có booking');
    }
  }

  private ensureDayNumberWithinDuration(dayNumber: number, durationDays: number) {
    if (dayNumber > durationDays) {
      throw new BadRequestException('Số thứ tự ngày hành trình không được vượt quá số ngày tour');
    }
  }

  private async ensureUniqueItineraryDay(tourProgramId: string, dayNumber: number, excludeId?: string) {
    const duplicate = await this.prisma.tourItineraryDay.findFirst({
      where: {
        tourProgramId,
        dayNumber,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (duplicate) throw new ConflictException('Số thứ tự ngày hành trình đã tồn tại trong chương trình tour này');
  }

  private isUniqueError(error: unknown) {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
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

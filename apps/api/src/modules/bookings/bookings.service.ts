import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { BookingStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';

@Injectable()
export class BookingsService {
  constructor(private readonly prisma: PrismaService) {}

  list(search?: string, status?: BookingStatus, tourProgramId?: string) {
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
      where,
      include: { tourProgram: true, operationForm: true },
      orderBy: [{ startDate: 'asc' }, { code: 'asc' }],
    });
  }

  async detail(id: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: {
        tourProgram: { include: { itineraryDays: { orderBy: { dayNumber: 'asc' } } } },
        operationForm: { include: { tasks: true, services: true, costs: true } },
      },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    return booking;
  }

  async create(dto: CreateBookingDto) {
    await this.ensureTourProgram(dto.tourProgramId);
    this.ensureDateRange(dto.startDate, dto.endDate);
    try {
      return await this.prisma.booking.create({
        data: this.toCreateData(dto),
        include: { tourProgram: true, operationForm: true },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Booking code already exists');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateBookingDto) {
    await this.detail(id);
    if (dto.tourProgramId) await this.ensureTourProgram(dto.tourProgramId);
    if (dto.startDate || dto.endDate) {
      const current = await this.prisma.booking.findUniqueOrThrow({ where: { id } });
      this.ensureDateRange(dto.startDate ?? current.startDate.toISOString(), dto.endDate ?? current.endDate.toISOString());
    }
    try {
      return await this.prisma.booking.update({
        where: { id },
        data: this.toUpdateData(dto),
        include: { tourProgram: true, operationForm: true },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Booking code already exists');
      }
      throw error;
    }
  }

  async remove(id: string) {
    await this.detail(id);
    return this.prisma.booking.delete({ where: { id } });
  }

  private async ensureTourProgram(id: string) {
    const tourProgram = await this.prisma.tourProgram.findUnique({ where: { id } });
    if (!tourProgram) throw new NotFoundException('Tour program not found');
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
      customerName: dto.customerName.trim(),
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
      ...(dto.customerName !== undefined ? { customerName: dto.customerName.trim() } : {}),
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

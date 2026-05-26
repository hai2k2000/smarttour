import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TourStatus, TourType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateTourDto } from './dto/create-tour.dto';
import { UpdateTourDto } from './dto/update-tour.dto';

const tourInclude = {
  order: true,
  fitTour: true,
  customers: { include: { crmCustomer: true } },
  suppliers: { include: { supplier: true } },
  services: { include: { supplier: true, supplierService: true } },
  revenues: true,
  costs: { include: { supplier: true } },
  operations: true,
  guides: true,
  attachments: true,
  notesList: true,
  terms: true,
  surveys: true,
  payments: true,
  receipts: true,
  expenses: true,
  logs: { orderBy: { createdAt: 'desc' } },
} satisfies Prisma.TourInclude;

@Injectable()
export class ToursService {
  constructor(private readonly prisma: PrismaService) {}

  list(search?: string, type?: TourType, status?: TourStatus) {
    const where: Prisma.TourWhereInput = {
      ...(type ? { type } : {}),
      ...(status ? { status } : {}),
      ...(search
        ? {
            OR: [
              { systemCode: { contains: search, mode: 'insensitive' } },
              { tourCode: { contains: search, mode: 'insensitive' } },
              { name: { contains: search, mode: 'insensitive' } },
              { marketGroup: { contains: search, mode: 'insensitive' } },
              { operatorOwner: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    return this.prisma.tour.findMany({
      where,
      include: {
        order: true,
        fitTour: true,
        _count: {
          select: {
            customers: true,
            services: true,
            revenues: true,
            costs: true,
            attachments: true,
          },
        },
      },
      orderBy: [{ updatedAt: 'desc' }, { systemCode: 'asc' }],
    });
  }

  async detail(id: string) {
    const tour = await this.prisma.tour.findUnique({ where: { id }, include: tourInclude });
    if (!tour) throw new NotFoundException('Tour not found');
    return tour;
  }

  async create(dto: CreateTourDto) {
    await this.ensureOrder(dto.orderId);
    try {
      return await this.prisma.tour.create({
        data: this.toTourData(dto, true) as Prisma.TourCreateInput,
        include: tourInclude,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Tour system code already exists');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateTourDto) {
    await this.detail(id);
    await this.ensureOrder(dto.orderId);
    try {
      return await this.prisma.tour.update({
        where: { id },
        data: this.toTourData(dto, false) as Prisma.TourUpdateInput,
        include: tourInclude,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Tour system code already exists');
      }
      throw error;
    }
  }

  async remove(id: string) {
    await this.detail(id);
    return this.prisma.tour.delete({ where: { id } });
  }

  private toTourData(dto: UpdateTourDto, creating: boolean): Prisma.TourUncheckedCreateInput | Prisma.TourUncheckedUpdateInput {
    return {
      ...(creating ? { type: dto.type, systemCode: this.requiredText(dto.systemCode), tourCode: this.requiredText(dto.tourCode) } : {}),
      ...(dto.type !== undefined ? { type: dto.type } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      ...(dto.paymentStatus !== undefined ? { paymentStatus: dto.paymentStatus } : {}),
      ...(dto.workflowStep !== undefined ? { workflowStep: this.optionalText(dto.workflowStep) } : {}),
      ...(dto.systemCode !== undefined ? { systemCode: dto.systemCode.trim().toUpperCase() } : {}),
      ...(dto.orderId !== undefined ? { orderId: this.optionalText(dto.orderId) } : {}),
      ...(dto.tourCode !== undefined ? { tourCode: dto.tourCode.trim().toUpperCase() } : {}),
      ...(dto.name !== undefined ? { name: this.optionalText(dto.name) } : {}),
      ...(dto.marketGroup !== undefined ? { marketGroup: this.optionalText(dto.marketGroup) } : {}),
      ...(dto.productType !== undefined ? { productType: this.optionalText(dto.productType) } : {}),
      ...(dto.bookingDate !== undefined ? { bookingDate: this.optionalDate(dto.bookingDate) } : {}),
      ...(dto.paymentDueDate !== undefined ? { paymentDueDate: this.optionalDate(dto.paymentDueDate) } : {}),
      ...(dto.startDate !== undefined ? { startDate: this.optionalDate(dto.startDate) } : {}),
      ...(dto.endDate !== undefined ? { endDate: this.optionalDate(dto.endDate) } : {}),
      ...(dto.createdBy !== undefined ? { createdBy: this.optionalText(dto.createdBy) } : {}),
      ...(dto.operatorOwner !== undefined ? { operatorOwner: this.optionalText(dto.operatorOwner) } : {}),
      ...(dto.branch !== undefined ? { branch: this.optionalText(dto.branch) } : {}),
      ...(dto.department !== undefined ? { department: this.optionalText(dto.department) } : {}),
      ...(dto.customerSource !== undefined ? { customerSource: this.optionalText(dto.customerSource) } : {}),
      ...(dto.exchangeRateCode !== undefined ? { exchangeRateCode: this.optionalText(dto.exchangeRateCode) } : {}),
      ...(dto.exchangeRate !== undefined ? { exchangeRate: this.number(dto.exchangeRate) } : {}),
      ...(dto.route !== undefined ? { route: this.optionalText(dto.route) } : {}),
      ...(dto.flightRoute !== undefined ? { flightRoute: this.optionalText(dto.flightRoute) } : {}),
      ...(dto.pickupPoint !== undefined ? { pickupPoint: this.optionalText(dto.pickupPoint) } : {}),
      ...(dto.dropoffPoint !== undefined ? { dropoffPoint: this.optionalText(dto.dropoffPoint) } : {}),
      ...(dto.notes !== undefined ? { notes: this.optionalText(dto.notes) } : {}),
    };
  }

  private async ensureOrder(orderId?: string) {
    const id = this.optionalText(orderId);
    if (!id) return;
    const row = await this.prisma.order.findUnique({ where: { id }, select: { id: true } });
    if (!row) throw new NotFoundException('Order not found');
  }

  private requiredText(value?: string) {
    const text = value?.trim();
    if (!text) throw new BadRequestException('Required tour field missing');
    return text.toUpperCase();
  }

  private optionalText(value?: string) {
    const text = value?.trim();
    return text ? text : null;
  }

  private optionalDate(value?: string) {
    const text = value?.trim();
    return text ? new Date(text) : null;
  }

  private number(value?: number) {
    const parsed = Number(value || 0);
    return Number.isFinite(parsed) ? parsed : 0;
  }
}

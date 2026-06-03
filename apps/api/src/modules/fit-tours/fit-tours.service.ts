import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { FitServiceStatus, FitTourWorkflowStatus, Prisma, TourServiceStatus, TourStatus, TourType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { applyWriteDataScope, branchDepartmentScopeWhere, hasUnrestrictedDataScope, RequestUser } from '../auth/data-scope';
import { CreateFitTourDto } from './dto/create-fit-tour.dto';
import { UpdateFitTourDto } from './dto/update-fit-tour.dto';

type Row = Record<string, unknown>;

const fitTourInclude = {
  tour: { include: { order: true, customers: { include: { crmCustomer: true } } } },
  customer: true,
  order: true,
  commonCosts: { orderBy: { orderNo: 'asc' } },
  hotelCosts: { orderBy: { orderNo: 'asc' } },
  privateCosts: { orderBy: { orderNo: 'asc' } },
  budgetServices: { include: { supplier: true }, orderBy: { serviceType: 'asc' } },
  operationServices: { include: { supplier: true, supplierService: true }, orderBy: { serviceType: 'asc' } },
  guides: { orderBy: { name: 'asc' } },
  handoverItems: { orderBy: { orderNo: 'asc' } },
  surveyQuestions: { orderBy: { orderNo: 'asc' } },
  attachments: { orderBy: { createdAt: 'desc' } },
} satisfies Prisma.FitTourInclude;

const defaultHandoverItems = ['Rooming list', 'Ve may bay', 'Bao hiem du lich', 'Chuong trinh tour', 'Final confirmation'];
const defaultSurveyQuestions = [
  'Chat luong chuong trinh tour',
  'Phuong tien van chuyen',
  'Chat luong do an',
  'Thai do nhan vien tu van',
  'Chat luong khach san',
  'Huong dan vien',
  'Cong tac to chuc',
  'Muc do hai long chung',
];

@Injectable()
export class FitToursService {
  constructor(private readonly prisma: PrismaService) {}

  list(search?: string, status?: string, user?: RequestUser) {
    const workflowStatus = this.toWorkflowStatus(status);
    const where: Prisma.FitTourWhereInput = {
      ...(workflowStatus ? { workflowStatus } : {}),
      ...(search
        ? {
            OR: [
              { quoteCode: { contains: search, mode: 'insensitive' } },
              { tourCode: { contains: search, mode: 'insensitive' } },
              { tourName: { contains: search, mode: 'insensitive' } },
              { customerName: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    return this.prisma.fitTour.findMany({
      where: this.fitTourScopeWhere(where, user),
      include: {
        _count: {
          select: {
            commonCosts: true,
            hotelCosts: true,
            privateCosts: true,
            budgetServices: true,
            operationServices: true,
          },
        },
      },
      orderBy: [{ updatedAt: 'desc' }, { quoteCode: 'asc' }],
    });
  }

  async detail(id: string, user?: RequestUser) {
    const fitTour = await this.prisma.fitTour.findFirst({ where: this.fitTourScopeWhere({ id }, user), include: fitTourInclude });
    if (!fitTour) throw new NotFoundException('FIT tour not found');
    return fitTour;
  }

  async create(dto: CreateFitTourDto, user?: RequestUser) {
    dto = applyWriteDataScope(dto as CreateFitTourDto & { branch?: string | null; department?: string | null }, user) as CreateFitTourDto;
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const fitDto = await this.withCustomerSnapshot(tx, dto);
        await this.ensureOrder(tx, fitDto.orderId);
        const tour = await tx.tour.create({ data: this.toTourCoreData(fitDto, true) as Prisma.TourUncheckedCreateInput });
        const fitTour = await tx.fitTour.create({
          data: {
            ...this.toFitTourData(fitDto, true),
            tour: { connect: { id: tour.id } },
            ...(fitDto.customerId ? { customer: { connect: { id: fitDto.customerId } } } : {}),
            ...(fitDto.orderId ? { order: { connect: { id: fitDto.orderId } } } : {}),
            commonCosts: { create: this.mapCommonCosts(fitDto.commonCosts) },
            hotelCosts: { create: this.mapHotelCosts(fitDto.hotelCosts) },
            privateCosts: { create: this.mapPrivateCosts(fitDto.privateCosts) },
            budgetServices: { create: this.mapBudgetServices(fitDto.budgetServices) },
            operationServices: { create: this.mapOperationServices(fitDto.operationServices) },
            guides: { create: this.mapGuides(fitDto.guides) },
            handoverItems: { create: this.mapHandoverItems(fitDto.handoverItems) },
            surveyQuestions: { create: this.mapSurveyQuestions(fitDto.surveyQuestions) },
            attachments: { create: this.mapAttachments(fitDto.attachments) },
          } as Prisma.FitTourCreateInput,
        });
        await this.replaceTourCoreChildren(tx, tour.id, fitDto);
        return fitTour;
      });
      return this.detail(created.id, user);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('FIT quote code already exists');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateFitTourDto, user?: RequestUser) {
    const current = await this.detail(id, user);
    dto = applyWriteDataScope(dto as UpdateFitTourDto & { branch?: string | null; department?: string | null }, user) as UpdateFitTourDto;
    try {
      await this.prisma.$transaction(async (tx) => {
        const patch = await this.withCustomerSnapshot(tx, dto);
        await this.ensureOrder(tx, patch.orderId);
        const merged = { ...current, ...patch } as unknown as UpdateFitTourDto;
        const tourId = current.tourId || (await tx.tour.create({ data: this.toTourCoreData(merged, true) as Prisma.TourUncheckedCreateInput })).id;
        await tx.fitTour.update({
          where: { id },
          data: {
            ...this.toFitTourData(patch, false),
            ...(current.tourId ? {} : { tour: { connect: { id: tourId } } }),
            ...(patch.customerId !== undefined ? (patch.customerId ? { customer: { connect: { id: patch.customerId } } } : { customer: { disconnect: true } }) : {}),
            ...(patch.orderId !== undefined ? (patch.orderId ? { order: { connect: { id: patch.orderId } } } : { order: { disconnect: true } }) : {}),
          } as Prisma.FitTourUpdateInput,
        });
        await tx.tour.update({ where: { id: tourId }, data: this.toTourCoreData(merged, false) as Prisma.TourUncheckedUpdateInput });
        await this.replaceChildren(tx, id, patch);
        await this.replaceTourCoreChildren(tx, tourId, merged);
      });
      return this.detail(id, user);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('FIT quote code already exists');
      }
      throw error;
    }
  }

  async remove(id: string, user?: RequestUser) {
    const fitTour = await this.detail(id, user);
    return this.prisma.$transaction(async (tx) => {
      const deleted = await tx.fitTour.delete({ where: { id } });
      if (fitTour.tourId) await tx.tour.delete({ where: { id: fitTour.tourId } });
      return deleted;
    });
  }

  async copyBudget(targetTourId: string, sourceTourId?: string, user?: RequestUser) {
    const source = await this.detail(sourceTourId || targetTourId, user);
    await this.detail(targetTourId, user);
    const budgetRows = source.budgetServices.length > 0 ? source.budgetServices : this.pricingRowsToBudget(source);

    await this.prisma.$transaction(async (tx) => {
      await tx.fitBudgetService.deleteMany({ where: { fitTourId: targetTourId } });
      await tx.fitBudgetService.createMany({
        data: budgetRows.map((row) => ({
          fitTourId: targetTourId,
          serviceType: row.serviceType,
          supplierId: row.supplierId || null,
          description: row.description || null,
          quantity: this.number(row.quantity),
          unitPrice: this.number('unitPrice' in row ? row.unitPrice : 0),
          vat: this.number(row.vat),
          amount: this.number(row.amount),
          notes: row.notes || null,
        })),
      });
    });
    return this.detail(targetTourId, user);
  }

  async copyOperation(targetTourId: string, sourceTourId?: string, user?: RequestUser) {
    const source = await this.detail(sourceTourId || targetTourId, user);
    await this.detail(targetTourId, user);
    const rows = source.operationServices.length > 0 ? source.operationServices : source.budgetServices;

    await this.prisma.$transaction(async (tx) => {
      await tx.fitOperationService.deleteMany({ where: { fitTourId: targetTourId } });
      await tx.fitOperationService.createMany({
        data: rows.map((row) => ({
          fitTourId: targetTourId,
          serviceType: row.serviceType,
          supplierId: row.supplierId || null,
          supplierServiceId: 'supplierServiceId' in row ? row.supplierServiceId || null : null,
          bookingCode: 'bookingCode' in row ? row.bookingCode || null : null,
          quantity: this.number(row.quantity),
          confirmedUnitPrice: this.number('confirmedUnitPrice' in row ? row.confirmedUnitPrice : row.unitPrice),
          vat: this.number(row.vat),
          amount: this.number(row.amount),
          status: this.toServiceStatus('status' in row ? row.status : FitServiceStatus.WAITING),
          notes: row.notes || null,
        })),
      });
    });
    return this.detail(targetTourId, user);
  }

  private fitTourScopeWhere(where: Prisma.FitTourWhereInput, user?: RequestUser): Prisma.FitTourWhereInput {
    if (!user || hasUnrestrictedDataScope(user)) return where;
    const scopedTour = branchDepartmentScopeWhere<Prisma.TourWhereInput>({}, user);
    return { AND: [where, { tour: { is: scopedTour } }] };
  }

  private async withCustomerSnapshot(tx: Prisma.TransactionClient, dto: UpdateFitTourDto) {
    const customerId = this.optionalText(dto.customerId);
    if (!customerId) return dto;
    const customer = await tx.customer.findUnique({ where: { id: customerId }, select: { fullName: true, phone: true, email: true } });
    if (!customer) throw new NotFoundException('Customer not found');
    return {
      ...dto,
      customerId,
      customerName: dto.customerName ?? customer.fullName,
      phone: dto.phone ?? customer.phone,
      email: dto.email ?? customer.email ?? undefined,
    };
  }

  private async ensureOrder(tx: Prisma.TransactionClient, orderId?: string) {
    const id = this.optionalText(orderId);
    if (!id) return;
    const order = await tx.order.findUnique({ where: { id }, select: { id: true } });
    if (!order) throw new NotFoundException('Không tìm thấy đơn hàng');
  }

  private async replaceChildren(tx: Prisma.TransactionClient, fitTourId: string, dto: UpdateFitTourDto) {
    if (dto.commonCosts !== undefined) {
      await tx.fitCommonCost.deleteMany({ where: { fitTourId } });
      await tx.fitCommonCost.createMany({ data: this.mapCommonCosts(dto.commonCosts).map((row) => ({ ...row, fitTourId })) });
    }
    if (dto.hotelCosts !== undefined) {
      await tx.fitHotelCost.deleteMany({ where: { fitTourId } });
      await tx.fitHotelCost.createMany({ data: this.mapHotelCosts(dto.hotelCosts).map((row) => ({ ...row, fitTourId })) });
    }
    if (dto.privateCosts !== undefined) {
      await tx.fitPrivateCost.deleteMany({ where: { fitTourId } });
      await tx.fitPrivateCost.createMany({ data: this.mapPrivateCosts(dto.privateCosts).map((row) => ({ ...row, fitTourId })) });
    }
    if (dto.budgetServices !== undefined) {
      await tx.fitBudgetService.deleteMany({ where: { fitTourId } });
      await tx.fitBudgetService.createMany({ data: this.mapBudgetServices(dto.budgetServices).map((row) => ({ ...row, fitTourId })) });
    }
    if (dto.operationServices !== undefined) {
      await tx.fitOperationService.deleteMany({ where: { fitTourId } });
      await tx.fitOperationService.createMany({ data: this.mapOperationServices(dto.operationServices).map((row) => ({ ...row, fitTourId })) });
    }
    if (dto.guides !== undefined) {
      await tx.fitTourGuide.deleteMany({ where: { fitTourId } });
      await tx.fitTourGuide.createMany({ data: this.mapGuides(dto.guides).map((row) => ({ ...row, fitTourId })) });
    }
    if (dto.handoverItems !== undefined) {
      await tx.fitHandoverItem.deleteMany({ where: { fitTourId } });
      await tx.fitHandoverItem.createMany({ data: this.mapHandoverItems(dto.handoverItems).map((row) => ({ ...row, fitTourId })) });
    }
    if (dto.surveyQuestions !== undefined) {
      await tx.fitSurveyQuestion.deleteMany({ where: { fitTourId } });
      await tx.fitSurveyQuestion.createMany({ data: this.mapSurveyQuestions(dto.surveyQuestions).map((row) => ({ ...row, fitTourId })) });
    }
    if (dto.attachments !== undefined) {
      await tx.fitAttachment.deleteMany({ where: { fitTourId } });
      await tx.fitAttachment.createMany({ data: this.mapAttachments(dto.attachments).map((row) => ({ ...row, fitTourId })) });
    }
  }

  private async replaceTourCoreChildren(tx: Prisma.TransactionClient, tourId: string, dto: UpdateFitTourDto) {
    await tx.tourCustomer.deleteMany({ where: { tourId } });
    await tx.tourCustomer.create({
      data: {
        tourId,
        crmCustomerId: this.optionalText(dto.customerId),
        customerType: 'PRIMARY',
        name: this.requiredText(dto.customerName, 'customerName'),
        phone: this.optionalText(dto.phone),
        email: this.optionalText(dto.email),
        isPrimary: true,
        notes: this.optionalText(dto.notes),
      },
    });

    await tx.tourGuide.deleteMany({ where: { tourId } });
    await tx.tourGuide.createMany({ data: this.mapGuides(dto.guides).map((row) => ({ ...row, tourId })) });

    await tx.tourAttachment.deleteMany({ where: { tourId } });
    await tx.tourAttachment.createMany({ data: this.mapAttachments(dto.attachments).map((row) => ({ ...row, tourId, uploadedBy: null })) });

    await tx.tourSurvey.deleteMany({ where: { tourId } });
    await tx.tourSurvey.createMany({ data: this.mapSurveyQuestions(dto.surveyQuestions).map((row) => ({ ...row, tourId })) });

    await tx.tourService.deleteMany({ where: { tourId } });
    await tx.tourService.createMany({ data: this.mapTourServices(dto).map((row) => ({ ...row, tourId })) });
  }

  private toTourCoreData(dto: UpdateFitTourDto, creating: boolean): Prisma.TourUncheckedCreateInput | Prisma.TourUncheckedUpdateInput {
    const workflowStep = dto.workflowStatus || FitTourWorkflowStatus.DRAFT;
    return {
      ...(creating
        ? {
            type: TourType.FIT,
            systemCode: this.requiredText(dto.quoteCode, 'quoteCode').toUpperCase(),
            tourCode: this.requiredText(dto.tourCode, 'tourCode').toUpperCase(),
          }
        : {}),
      type: TourType.FIT,
      status: this.toTourStatus(workflowStep),
      workflowStep,
      ...(dto.quoteCode !== undefined ? { systemCode: dto.quoteCode.trim().toUpperCase() } : {}),
      ...(dto.tourCode !== undefined ? { tourCode: dto.tourCode.trim().toUpperCase() } : {}),
      ...(dto.tourName !== undefined ? { name: this.optionalText(dto.tourName) } : {}),
      ...(dto.marketGroup !== undefined ? { marketGroup: this.optionalText(dto.marketGroup) } : {}),
      ...(dto.tourType !== undefined ? { productType: this.optionalText(dto.tourType) } : {}),
      ...(dto.bookingDate !== undefined ? { bookingDate: this.optionalDate(dto.bookingDate) } : {}),
      ...(dto.startDate !== undefined ? { startDate: this.optionalDate(dto.startDate) } : {}),
      ...(dto.endDate !== undefined ? { endDate: this.optionalDate(dto.endDate) } : {}),
      ...(dto.operatorOwner !== undefined ? { operatorOwner: this.optionalText(dto.operatorOwner) } : {}),
      ...('branch' in dto ? { branch: this.optionalText((dto as Record<string, unknown>).branch) } : {}),
      ...('department' in dto ? { department: this.optionalText((dto as Record<string, unknown>).department) } : {}),
      ...(dto.orderId !== undefined ? { orderId: this.optionalText(dto.orderId) } : {}),
      ...(dto.exchangeRateCode !== undefined ? { exchangeRateCode: this.optionalText(dto.exchangeRateCode) } : {}),
      ...(dto.exchangeRate !== undefined ? { exchangeRate: this.number(dto.exchangeRate) } : {}),
      ...(dto.flightRoute !== undefined ? { flightRoute: this.optionalText(dto.flightRoute) } : {}),
      ...(dto.pickupPoint !== undefined ? { pickupPoint: this.optionalText(dto.pickupPoint) } : {}),
      ...(dto.dropoffPoint !== undefined ? { dropoffPoint: this.optionalText(dto.dropoffPoint) } : {}),
      ...(dto.notes !== undefined ? { notes: this.optionalText(dto.notes) } : {}),
    };
  }

  private mapTourServices(dto: UpdateFitTourDto): Array<Omit<Prisma.TourServiceCreateManyInput, 'tourId'>> {
    const budgetServices = this.mapBudgetServices(dto.budgetServices).map((row) => ({
      serviceType: row.serviceType,
      supplierId: row.supplierId,
      description: row.description,
      quantity: row.quantity,
      unit: null,
      currency: 'VND',
      exchangeRate: 1,
      budgetUnitPrice: row.unitPrice,
      vat: row.vat,
      budgetAmount: row.amount,
      confirmationStatus: TourServiceStatus.WAITING,
      notes: row.notes,
    }));

    const operationServices = this.mapOperationServices(dto.operationServices).map((row) => ({
      serviceType: row.serviceType,
      supplierId: row.supplierId,
      supplierServiceId: row.supplierServiceId,
      description: null,
      quantity: row.quantity,
      unit: null,
      currency: 'VND',
      exchangeRate: 1,
      confirmedUnitPrice: row.confirmedUnitPrice,
      vat: row.vat,
      confirmedAmount: row.amount,
      confirmationStatus: this.toTourServiceStatus(row.status),
      bookingCode: row.bookingCode,
      notes: row.notes,
    }));

    return [...budgetServices, ...operationServices];
  }

  private toFitTourData(dto: UpdateFitTourDto, creating: boolean): Prisma.FitTourUncheckedCreateInput | Prisma.FitTourUncheckedUpdateInput {
    const requiredCreate = creating
      ? {
          quoteCode: this.requiredText(dto.quoteCode, 'quoteCode').toUpperCase(),
          tourCode: this.requiredText(dto.tourCode, 'tourCode').toUpperCase(),
          customerName: this.requiredText(dto.customerName, 'customerName'),
        }
      : {};

    return {
      ...requiredCreate,
      ...(dto.quoteCode !== undefined ? { quoteCode: dto.quoteCode.trim().toUpperCase() } : {}),
      ...(dto.tourCode !== undefined ? { tourCode: dto.tourCode.trim().toUpperCase() } : {}),
      ...(dto.customerName !== undefined ? { customerName: dto.customerName.trim() } : {}),
      ...(dto.tourName !== undefined ? { tourName: this.optionalText(dto.tourName) } : {}),
      ...(dto.marketGroup !== undefined ? { marketGroup: this.optionalText(dto.marketGroup) } : {}),
      ...(dto.bookingDate !== undefined ? { bookingDate: this.optionalDate(dto.bookingDate) } : {}),
      ...(dto.startDate !== undefined ? { startDate: this.optionalDate(dto.startDate) } : {}),
      ...(dto.endDate !== undefined ? { endDate: this.optionalDate(dto.endDate) } : {}),
      ...(dto.phone !== undefined ? { phone: this.optionalText(dto.phone) } : {}),
      ...(dto.email !== undefined ? { email: this.optionalText(dto.email) } : {}),
      ...(dto.notes !== undefined ? { notes: this.optionalText(dto.notes) } : {}),
      ...(dto.adultCount !== undefined ? { adultCount: this.number(dto.adultCount) } : creating ? { adultCount: 1 } : {}),
      ...(dto.childCount !== undefined ? { childCount: this.number(dto.childCount) } : {}),
      ...(dto.infantCount !== undefined ? { infantCount: this.number(dto.infantCount) } : {}),
      ...(dto.sellingPrice !== undefined ? { sellingPrice: this.number(dto.sellingPrice) } : {}),
      ...(dto.commissionPerGuest !== undefined ? { commissionPerGuest: this.number(dto.commissionPerGuest) } : {}),
      ...(dto.workflowStatus !== undefined ? { workflowStatus: dto.workflowStatus } : creating ? { workflowStatus: FitTourWorkflowStatus.DRAFT } : {}),
      ...(dto.allowOverbooking !== undefined ? { allowOverbooking: Boolean(dto.allowOverbooking) } : {}),
      ...this.pickOptionalText(dto as Record<string, unknown>, [
        'flightRoute',
        'tourType',
        'exchangeRateCode',
        'operatorOwner',
        'transportMode',
        'outboundRoute',
        'outboundCarrier',
        'returnRoute',
        'returnCarrier',
        'pickupPoint',
        'dropoffPoint',
        'handoverGuideRequest',
        'surveyDescription',
      ]),
      ...this.pickOptionalNumbers(dto as Record<string, unknown>, [
        'exchangeRate',
        'seatCount',
        'tourPrice',
        'discount',
        'adultPrice',
        'childPrice25',
        'childPrice611',
        'infantPrice',
        'surcharge',
      ]),
      ...this.pickOptionalDates(dto as Record<string, unknown>, ['visaDeadline', 'holdUntil', 'confirmedAt', 'closeAt']),
    };
  }

  private mapCommonCosts(rows?: unknown[]) {
    return this.rows(rows).map((row, index) => {
      const quantity = this.number(row.quantity);
      const times = this.number(row.times || 1);
      const exchangeRate = this.number(row.exchangeRate || 1);
      const unitPrice = this.number(row.unitPrice);
      const vat = this.number(row.vat);
      return {
        orderNo: this.number(row.orderNo || row.stt || index + 1),
        serviceType: this.text(row.serviceType || row.loaiDichVu || 'Dich vu'),
        description: this.optionalText(row.description),
        unit: this.optionalText(row.unit),
        quantity,
        times,
        currency: this.text(row.currency || 'VND'),
        exchangeRate,
        unitPrice,
        vat,
        amount: this.money(row.amount, quantity * times * exchangeRate * unitPrice, vat),
        notes: this.optionalText(row.notes),
      };
    });
  }

  private mapHotelCosts(rows?: unknown[]) {
    return this.rows(rows).map((row, index) => {
      const paxPerRoom = this.number(row.paxPerRoom);
      const times = this.number(row.times || 1);
      const exchangeRate = this.number(row.exchangeRate || 1);
      const unitPrice = this.number(row.unitPrice);
      const vat = this.number(row.vat);
      return {
        orderNo: this.number(row.orderNo || row.stt || index + 1),
        serviceType: this.text(row.serviceType || 'Hotel'),
        description: this.optionalText(row.description),
        unit: this.optionalText(row.unit),
        paxPerRoom,
        times,
        currency: this.text(row.currency || 'VND'),
        exchangeRate,
        unitPrice,
        vat,
        amount: this.money(row.amount, times * exchangeRate * unitPrice, vat),
        notes: this.optionalText(row.notes),
      };
    });
  }

  private mapPrivateCosts(rows?: unknown[]) {
    return this.mapCommonCosts(rows);
  }

  private mapBudgetServices(rows?: unknown[]) {
    return this.rows(rows).map((row) => {
      const quantity = this.number(row.quantity);
      const unitPrice = this.number(row.unitPrice);
      const vat = this.number(row.vat);
      return {
        serviceType: this.text(row.serviceType || 'Dich vu'),
        supplierId: this.optionalText(row.supplierId),
        description: this.optionalText(row.description),
        quantity,
        unitPrice,
        vat,
        amount: this.money(row.amount, quantity * unitPrice, vat),
        notes: this.optionalText(row.notes),
      };
    });
  }

  private mapOperationServices(rows?: unknown[]) {
    return this.rows(rows).map((row) => {
      const quantity = this.number(row.quantity);
      const confirmedUnitPrice = this.number(row.confirmedUnitPrice);
      const vat = this.number(row.vat);
      return {
        serviceType: this.text(row.serviceType || 'Dich vu'),
        supplierId: this.optionalText(row.supplierId),
        supplierServiceId: this.optionalText(row.supplierServiceId || row.serviceId),
        bookingCode: this.optionalText(row.bookingCode),
        quantity,
        confirmedUnitPrice,
        vat,
        amount: this.money(row.amount, quantity * confirmedUnitPrice, vat),
        status: this.toServiceStatus(row.status),
        notes: this.optionalText(row.notes),
      };
    });
  }

  private mapGuides(rows?: unknown[]) {
    return this.rows(rows).map((row) => ({
      guideId: this.optionalText(row.guideId),
      name: this.text(row.name || row.ten || 'Guide'),
      phone: this.optionalText(row.phone),
      guideType: this.optionalText(row.guideType),
      notes: this.optionalText(row.notes),
    }));
  }

  private mapHandoverItems(rows?: unknown[]) {
    const source = rows && rows.length > 0 ? rows : defaultHandoverItems.map((itemName, index) => ({ itemName, quantity: 1, orderNo: index + 1 }));
    return this.rows(source).map((row, index) => ({
      orderNo: this.number(row.orderNo || row.stt || index + 1),
      itemName: this.text(row.itemName || row.name || 'Tai lieu ban giao'),
      quantity: this.number(row.quantity || 1),
      notes: this.optionalText(row.notes),
    }));
  }

  private mapSurveyQuestions(rows?: unknown[]) {
    const source = rows && rows.length > 0 ? rows : defaultSurveyQuestions.map((question, index) => ({ question, orderNo: index + 1 }));
    return this.rows(source).map((row, index) => ({
      orderNo: this.number(row.orderNo || row.stt || index + 1),
      question: this.text(row.question || 'Cau hoi'),
      notes: this.optionalText(row.notes),
    }));
  }

  private mapAttachments(rows?: unknown[]) {
    return this.rows(rows).map((row) => ({
      step: this.optionalText(row.step),
      fileName: this.text(row.fileName || row.name || 'attachment'),
      fileUrl: this.optionalText(row.fileUrl),
      mimeType: this.optionalText(row.mimeType),
      size: row.size === undefined || row.size === null ? null : this.number(row.size),
    }));
  }

  private pricingRowsToBudget(source: Awaited<ReturnType<FitToursService['detail']>>) {
    return [...source.commonCosts, ...source.hotelCosts, ...source.privateCosts].map((row) => ({
      serviceType: row.serviceType,
      supplierId: null,
      description: row.description,
      quantity: 'quantity' in row ? row.quantity : row.paxPerRoom,
      unitPrice: row.unitPrice,
      vat: row.vat,
      amount: row.amount,
      notes: row.notes,
    }));
  }

  private rows(rows?: unknown[]): Row[] {
    return (rows || []).filter((row): row is Row => Boolean(row) && typeof row === 'object');
  }

  private text(value: unknown) {
    return String(value || '').trim();
  }

  private requiredText(value: unknown, field: string) {
    const text = this.text(value);
    if (!text) throw new BadRequestException(`${field} is required`);
    return text;
  }

  private optionalText(value: unknown) {
    const text = this.text(value);
    return text ? text : null;
  }

  private optionalDate(value: unknown) {
    const text = this.text(value);
    return text ? new Date(text) : null;
  }

  private number(value: unknown) {
    const number = Number(value || 0);
    return Number.isFinite(number) ? number : 0;
  }

  private money(explicitAmount: unknown, subtotal: number, vat: number) {
    const amount = this.number(explicitAmount);
    return amount > 0 ? amount : subtotal * (1 + vat / 100);
  }

  private toWorkflowStatus(status?: string) {
    if (!status) return undefined;
    if (!Object.values(FitTourWorkflowStatus).includes(status as FitTourWorkflowStatus)) return undefined;
    return status as FitTourWorkflowStatus;
  }

  private toServiceStatus(status: unknown) {
    const value = this.text(status);
    if (Object.values(FitServiceStatus).includes(value as FitServiceStatus)) return value as FitServiceStatus;
    return FitServiceStatus.WAITING;
  }

  private toTourServiceStatus(status: unknown) {
    const value = this.text(status);
    if (Object.values(TourServiceStatus).includes(value as TourServiceStatus)) return value as TourServiceStatus;
    return TourServiceStatus.WAITING;
  }

  private toTourStatus(workflowStep: unknown) {
    const value = this.text(workflowStep);
    if (value === FitTourWorkflowStatus.COMPLETED) return TourStatus.COMPLETED;
    if (value === FitTourWorkflowStatus.CANCELLED) return TourStatus.CANCELLED;
    if (value === FitTourWorkflowStatus.OPERATION || value === FitTourWorkflowStatus.HANDOVER || value === FitTourWorkflowStatus.SURVEY) return TourStatus.RUNNING;
    return TourStatus.UPCOMING;
  }

  private pickOptionalText(dto: Record<string, unknown>, fields: string[]) {
    return Object.fromEntries(fields.filter((field) => dto[field] !== undefined).map((field) => [field, this.optionalText(dto[field])]));
  }

  private pickOptionalNumbers(dto: Record<string, unknown>, fields: string[]) {
    return Object.fromEntries(fields.filter((field) => dto[field] !== undefined).map((field) => [field, this.number(dto[field])]));
  }

  private pickOptionalDates(dto: Record<string, unknown>, fields: string[]) {
    return Object.fromEntries(fields.filter((field) => dto[field] !== undefined).map((field) => [field, this.optionalDate(dto[field])]));
  }
}

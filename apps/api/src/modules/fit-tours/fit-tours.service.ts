import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { FitServiceStatus, FitTourWorkflowStatus, Prisma, TourServiceStatus, TourStatus, TourType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { applyWriteDataScope, branchDepartmentScopeWhere, hasUnrestrictedDataScope, RequestUser } from '../auth/data-scope';
import { FilesService } from '../files/files.service';
import { containsSearch, normalizeListSearch } from '../list-search';
import { TourCommonChildren, TourCoreService, TourRootConfig } from '../tours/tour-core.service';
import { CreateFitTourDto, FIT_TOUR_DATE_PATTERN, FIT_TOUR_STEP_FIELDS } from './dto/create-fit-tour.dto';
import { UpdateFitTourDto } from './dto/update-fit-tour.dto';
import { FIT_DEFAULT_SURVEY_QUESTIONS } from './fit-tour-defaults';
import { FitTourLegacyCompatService } from './fit-tour-legacy-compat.service';

type Row = Record<string, unknown>;
type FitCostGroupField = 'commonCosts' | 'hotelCosts' | 'privateCosts';
type RootFitCostGroups = Record<FitCostGroupField, Row[]>;
type FitTourStep = keyof typeof FIT_TOUR_STEP_FIELDS;
type FitUpdateOptions = { step?: FitTourStep; confirm?: boolean };
type FitCreateOptions = { allowAttachmentMetadata?: boolean };
type UploadedFitFile = { originalname: string; mimetype: string; size: number; buffer: Buffer };

const fitCostGroupTags: Record<FitCostGroupField, string> = {
  commonCosts: 'FIT_COMMON_COST',
  hotelCosts: 'FIT_HOTEL_COST',
  privateCosts: 'FIT_PRIVATE_COST',
};

const fitTourInclude = {
  tour: {
    include: {
      order: true,
      customers: { include: { crmCustomer: true } },
      services: { include: { supplier: true, supplierService: true }, orderBy: { serviceType: 'asc' } },
      costs: { orderBy: { costType: 'asc' } },
      guides: { orderBy: { name: 'asc' } },
      attachments: { orderBy: { createdAt: 'desc' } },
      surveys: { orderBy: { orderNo: 'asc' } },
    },
  },
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

const fitTourListSelect = {
  id: true,
  tourId: true,
  quoteCode: true,
  tourCode: true,
  tourName: true,
  customerName: true,
  phone: true,
  startDate: true,
  endDate: true,
  adultCount: true,
  childCount: true,
  infantCount: true,
  sellingPrice: true,
  commissionPerGuest: true,
  workflowStatus: true,
  updatedAt: true,
  tour: {
    select: {
      systemCode: true,
      tourCode: true,
      name: true,
      startDate: true,
      endDate: true,
      updatedAt: true,
      customers: {
        where: { isPrimary: true },
        take: 1,
        select: { name: true, phone: true },
      },
      services: {
        select: { budgetAmount: true, budgetUnitPrice: true, confirmedAmount: true, confirmedUnitPrice: true, bookingCode: true },
      },
      costs: { select: { costType: true } },
    },
  },
  _count: {
    select: {
      commonCosts: true,
      hotelCosts: true,
      privateCosts: true,
      budgetServices: true,
      operationServices: true,
    },
  },
} satisfies Prisma.FitTourSelect;

const workflowOrder = [
  FitTourWorkflowStatus.DRAFT,
  FitTourWorkflowStatus.PRICING,
  FitTourWorkflowStatus.TOUR_INFO,
  FitTourWorkflowStatus.BUDGET,
  FitTourWorkflowStatus.OPERATION,
  FitTourWorkflowStatus.HANDOVER,
  FitTourWorkflowStatus.SURVEY,
  FitTourWorkflowStatus.COMPLETED,
] as const;
const terminalWorkflowStatuses = new Set<FitTourWorkflowStatus>([FitTourWorkflowStatus.COMPLETED, FitTourWorkflowStatus.CANCELLED]);

@Injectable()
export class FitToursService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tourCore: TourCoreService,
    private readonly legacyCompat: FitTourLegacyCompatService,
    private readonly filesService: FilesService,
  ) {}

  async list(search?: string, status?: string, user?: RequestUser) {
    const workflowStatus = this.toWorkflowStatus(status);
    const searchText = normalizeListSearch(search);
    const contains = searchText ? containsSearch(searchText) : undefined;
    const where: Prisma.FitTourWhereInput = {
      ...(workflowStatus ? { workflowStatus } : {}),
      ...(contains
        ? {
            OR: [
              { quoteCode: contains },
              { tourCode: contains },
              { tourName: contains },
              { customerName: contains },
              { phone: contains },
              { tour: { is: { systemCode: contains } } },
              { tour: { is: { tourCode: contains } } },
              { tour: { is: { name: contains } } },
              { tour: { is: { customers: { some: { name: contains } } } } },
              { tour: { is: { customers: { some: { phone: contains } } } } },
            ],
          }
        : {}),
    };

    const rows = await this.prisma.fitTour.findMany({
      where: this.fitTourScopeWhere(where, user),
      select: fitTourListSelect,
      orderBy: [{ updatedAt: 'desc' }, { quoteCode: 'asc' }],
    });
    return rows.map((row) => {
      const snapshot = this.withTourRootSnapshot(row) as Row;
      const { tour: _tour, ...listRow } = snapshot;
      return listRow;
    });
  }

  async detail(id: string, user?: RequestUser) {
    const fitTour = await this.prisma.fitTour.findFirst({ where: this.fitTourScopeWhere({ id }, user), include: fitTourInclude });
    if (!fitTour) throw new NotFoundException('Không tìm thấy tour FIT');
    return this.withTourRootSnapshot(fitTour);
  }

  async create(dto: CreateFitTourDto, user?: RequestUser) {
    return this.persistCreate(dto, user);
  }

  async importLegacy(dto: CreateFitTourDto, user?: RequestUser) {
    return this.persistCreate(dto, user, { allowAttachmentMetadata: true });
  }

  private async persistCreate(dto: CreateFitTourDto, user?: RequestUser, options: FitCreateOptions = {}) {
    const scopedDto = applyWriteDataScope(dto as CreateFitTourDto & { branch?: string | null; department?: string | null }, user) as CreateFitTourDto;
    const createDto = options.allowAttachmentMetadata ? scopedDto : this.dropAttachmentPatch(scopedDto) as CreateFitTourDto;
    try {
      const created = await this.prisma.$transaction((tx) => this.createFitTourAggregate(tx, createDto, user));
      return this.detail(created.id, user);
    } catch (error) {
      this.rethrowFitUniqueConflict(error);
      throw error;
    }
  }

  async update(id: string, dto: UpdateFitTourDto, user?: RequestUser) {
    const current = await this.detail(id, user);
    const scopedDto = applyWriteDataScope(dto as UpdateFitTourDto & { branch?: string | null; department?: string | null }, user) as UpdateFitTourDto;
    try {
      await this.prisma.$transaction((tx) => this.updateFitTourAggregate(tx, id, current, scopedDto, user));
      return this.detail(id, user);
    } catch (error) {
      this.rethrowFitUniqueConflict(error);
      throw error;
    }
  }

  async saveStep(id: string, step: string, dto: UpdateFitTourDto, user?: RequestUser) {
    return this.persistStep(id, step, dto, user, false);
  }

  async confirmStep(id: string, step: string, dto: UpdateFitTourDto, user?: RequestUser) {
    return this.persistStep(id, step, dto, user, true);
  }

  async exportCsv(id: string, user?: RequestUser) {
    const fitTour = await this.detail(this.requiredText(id, 'Cần chọn tour FIT để export'), user);
    const tourId = this.requiredTourRootId(fitTour);
    const totalPax = this.numberValue(fitTour.adultCount) + this.numberValue(fitTour.childCount) + this.numberValue(fitTour.infantCount);
    const rows: unknown[][] = [
      ['section', 'field', 'value', 'extra', 'extra2', 'extra3'],
      ['tour', 'tourId', tourId, 'common Tour root', '', ''],
      ['tour', 'fitTourId', fitTour.id, 'FIT extension', '', ''],
      ['tour', 'quoteCode', fitTour.quoteCode, '', '', ''],
      ['tour', 'tourCode', fitTour.tourCode, '', '', ''],
      ['tour', 'tourName', fitTour.tourName, '', '', ''],
      ['tour', 'customerName', fitTour.customerName, '', '', ''],
      ['tour', 'workflowStatus', fitTour.workflowStatus, '', '', ''],
      ['tour', 'startDate', this.exportDate(fitTour.startDate), '', '', ''],
      ['tour', 'endDate', this.exportDate(fitTour.endDate), '', '', ''],
      ['tour', 'totalPax', totalPax, 'adult+child+infant', '', ''],
      ['tour', 'sellingPrice', fitTour.sellingPrice, 'per guest', '', ''],
    ];
    this.appendExportRows(rows, 'pricing.commonCosts', fitTour.commonCosts, (row) => [row.serviceType, row.description, row.amount, row.notes]);
    this.appendExportRows(rows, 'pricing.hotelCosts', fitTour.hotelCosts, (row) => [row.serviceType, row.description, row.amount, row.notes]);
    this.appendExportRows(rows, 'pricing.privateCosts', fitTour.privateCosts, (row) => [row.serviceType, row.description, row.amount, row.notes]);
    this.appendExportRows(rows, 'budget.services', fitTour.budgetServices, (row) => [row.serviceType, row.description, row.amount, row.supplierId]);
    this.appendExportRows(rows, 'operation.services', fitTour.operationServices, (row) => [row.serviceType, row.bookingCode, row.amount, row.status]);
    this.appendExportRows(rows, 'attachments', fitTour.attachments, (row) => [row.step, row.fileName, row.fileUrl, row.uploadedBy]);
    this.appendExportRows(rows, 'survey.questions', fitTour.surveyQuestions, (row) => [row.orderNo, row.question, row.notes, '']);
    return `\uFEFF${rows.map((row) => row.map((cell) => this.csvCell(cell)).join(',')).join('\r\n')}\r\n`;
  }

  async uploadAttachment(id: string, step: string | undefined, file: UploadedFitFile | undefined, user?: RequestUser) {
    const workflowStep = this.toEditableWorkflowStep(this.requiredText(step, 'Cần chọn bước để tải file FIT'));
    const fitTour = await this.detail(id, user);
    const tourId = this.requiredTourRootId(fitTour);
    const actorId = user?.id || this.actor(user);
    const upload = await this.filesService.upload(file, `fit-tours/${id}/${workflowStep}`, actorId);
    const attachment = {
      step: workflowStep,
      fileName: upload.fileName,
      fileUrl: upload.url,
      mimeType: upload.mimeType,
      size: upload.size,
      uploadedBy: actorId,
    };
    try {
      await this.prisma.$transaction(async (tx) => {
        const [tourAttachment] = this.tourCore.mapAttachments([attachment]);
        await this.tourCore.addAttachment(tx, tourId, tourAttachment);
        await this.legacyCompat.addAttachment(tx, id, attachment);
        await this.logFitTourAction(tx, tourId, 'UPLOAD_FIT_ATTACHMENT', user, { fitTourId: id, workflowStep, fileName: upload.fileName, fileUrl: upload.url });
      });
      return this.detail(id, user);
    } catch (error) {
      await this.filesService.removeQuietly(upload.objectKey).catch(() => undefined);
      throw error;
    }
  }

  async removeAttachment(id: string, attachmentId: string, user?: RequestUser) {
    const fitTourId = this.requiredText(id, 'Cần chọn tour FIT');
    const targetAttachmentId = this.requiredText(attachmentId, 'Cần chọn file đính kèm');
    const fitTour = await this.detail(fitTourId, user);
    const tourId = this.requiredTourRootId(fitTour);
    const attachment = await this.findFitAttachment(tourId, fitTourId, targetAttachmentId);
    if (!attachment) throw new NotFoundException('Không tìm thấy file đính kèm của tour FIT');

    await this.prisma.$transaction(async (tx) => {
      if (attachment.commonId) await tx.tourAttachment.deleteMany({ where: { id: attachment.commonId, tourId } });
      await this.legacyCompat.removeAttachment(tx, fitTourId, attachment);
      await this.logFitTourAction(tx, tourId, 'DELETE_FIT_ATTACHMENT', user, { fitTourId, attachmentId: targetAttachmentId, fileName: attachment.fileName, fileUrl: attachment.fileUrl });
    });
    await this.filesService.removeQuietly(this.filesService.objectKeyFromUrl(attachment.fileUrl));
    return this.detail(fitTourId, user);
  }

  async remove(id: string, user?: RequestUser) {
    const fitTour = await this.detail(id, user);
    return this.prisma.$transaction((tx) => this.removeFitTourAggregate(tx, id, fitTour, user));
  }

  async copyBudget(targetTourId: string, sourceTourId?: string, user?: RequestUser) {
    const targetId = this.requiredText(targetTourId, 'Cần chọn tour đích');
    const sourceId = this.requiredText(sourceTourId, 'Cần chọn tour nguồn để sao chép dự toán');
    if (sourceId === targetId) throw new BadRequestException('Tour nguồn dự toán phải khác tour đích');
    const source = await this.detail(sourceId, user);
    const target = await this.detail(targetId, user);
    const budgetRows = this.legacyCompat.toCopiedBudgetRows(source.budgetServices.length > 0 ? source.budgetServices : this.pricingRowsToBudget(source));
    if (!budgetRows.length) throw new BadRequestException('Tour nguồn không có dữ liệu dự toán để sao chép');

    await this.prisma.$transaction((tx) => this.copyFitBudgetAggregate(tx, source, target, budgetRows, user));
    return this.detail(targetId, user);
  }

  async copyOperation(targetTourId: string, sourceTourId?: string, user?: RequestUser) {
    const targetId = this.requiredText(targetTourId, 'Cần chọn tour đích');
    const sourceId = this.optionalText(sourceTourId) || targetId;
    const source = await this.detail(sourceId, user);
    const target = await this.detail(targetId, user);
    const rows = this.legacyCompat.toCopiedOperationRows(source.operationServices.length > 0 ? source.operationServices : source.budgetServices);
    if (!rows.length) throw new BadRequestException('Tour nguồn không có dữ liệu dự toán hoặc điều hành để sao chép');

    await this.prisma.$transaction((tx) => this.copyFitOperationAggregate(tx, source, target, rows, user));
    return this.detail(targetId, user);
  }

  private async persistStep(id: string, step: string, dto: UpdateFitTourDto, user: RequestUser | undefined, confirm: boolean) {
    const workflowStep = this.toEditableWorkflowStep(step);
    const current = await this.detail(id, user);
    const scopedDto = applyWriteDataScope(dto as UpdateFitTourDto & { branch?: string | null; department?: string | null }, user) as UpdateFitTourDto;
    const stepPatch = this.pickStepPatch(workflowStep, scopedDto);
    if (confirm) {
      const nextWorkflow = this.workflowStepForConfirm(current.workflowStatus, workflowStep);
      if (nextWorkflow) stepPatch.workflowStatus = nextWorkflow;
    }
    try {
      await this.prisma.$transaction((tx) => this.updateFitTourAggregate(tx, id, current, stepPatch, user, { step: workflowStep, confirm }));
      return this.detail(id, user);
    } catch (error) {
      this.rethrowFitUniqueConflict(error);
      throw error;
    }
  }

  private async createFitTourAggregate(tx: Prisma.TransactionClient, dto: CreateFitTourDto, user?: RequestUser) {
    const fitDto = await this.prepareCreateFitDto(tx, dto, user);
    const tour = await this.createTourRootFromFit(tx, fitDto, user);
    await this.syncTourCoreFromFit(tx, tour.id, fitDto);
    const fitTour = await this.createLegacyFitDetail(tx, tour.id, fitDto);
    await this.logFitTourAction(tx, tour.id, 'CREATE_FIT_TOUR', user, { fitTourId: fitTour.id });
    return fitTour;
  }

  private async updateFitTourAggregate(
    tx: Prisma.TransactionClient,
    id: string,
    current: Awaited<ReturnType<FitToursService['detail']>>,
    dto: UpdateFitTourDto,
    user?: RequestUser,
    options: FitUpdateOptions = {},
  ) {
    const { patch, merged } = await this.prepareUpdateFitDto(tx, current, dto, user, options);
    const rootDto = current.tourId ? patch : merged;
    const tourId = await this.syncTourRootFromFit(tx, current, rootDto, user);
    await this.syncTourCoreFromFit(tx, tourId, merged, patch);
    await this.updateLegacyFitDetail(tx, id, current, patch, tourId);
    await this.legacyCompat.syncChildren(tx, id, patch, this.totalPax(merged));
    const action = options.step ? (options.confirm ? 'CONFIRM_FIT_STEP' : 'SAVE_FIT_STEP_DRAFT') : 'UPDATE_FIT_TOUR';
    await this.logFitTourAction(tx, tourId, action, user, { fitTourId: id, ...(options.step ? { workflowStep: options.step } : {}) });
  }

  private async removeFitTourAggregate(
    tx: Prisma.TransactionClient,
    id: string,
    fitTour: Awaited<ReturnType<FitToursService['detail']>>,
    user?: RequestUser,
  ) {
    if (fitTour.tourId) {
      await this.ensureRemovable(tx, fitTour.tourId, user);
      await this.tourCore.softDelete(tx, fitTour.tourId, this.actor(user));
    }
    return tx.fitTour.update({ where: { id }, data: { workflowStatus: FitTourWorkflowStatus.CANCELLED } });
  }

  private async ensureRemovable(tx: Prisma.TransactionClient, tourId: string, user?: RequestUser) {
    const tour = await tx.tour.findFirst({
      where: this.tourCore.scopeWhere({ id: tourId }, user),
      select: {
        orderId: true,
        _count: {
          select: {
            bookings: true,
            operationVouchers: true,
            operationForms: true,
            financeReceipts: true,
            financePayments: true,
            financeInvoices: true,
            financeCashflowEntries: true,
            payments: true,
            receipts: true,
            expenses: true,
          },
        },
      },
    });
    if (!tour) throw new NotFoundException('Không tìm thấy tour FIT');
    const hasExternalDependency = Boolean(tour.orderId) || Object.values(tour._count).some((count) => count > 0);
    if (hasExternalDependency) {
      throw new BadRequestException('Không thể xóa tour FIT đã phát sinh đơn hàng, booking, điều hành hoặc chứng từ tài chính');
    }
  }

  private async copyFitBudgetAggregate(
    tx: Prisma.TransactionClient,
    source: Awaited<ReturnType<FitToursService['detail']>>,
    target: Awaited<ReturnType<FitToursService['detail']>>,
    budgetRows: ReturnType<FitTourLegacyCompatService['toCopiedBudgetRows']>,
    user?: RequestUser,
  ) {
    const targetRootId = this.requiredTourRootId(target);
    await this.replaceFitTourServices(tx, targetRootId, { ...target, budgetServices: budgetRows } as unknown as UpdateFitTourDto);
    await this.legacyCompat.replaceBudgetServices(tx, target.id, budgetRows);
    await this.logFitTourAction(tx, targetRootId, 'COPY_FIT_BUDGET', user, { sourceFitTourId: source.id, targetFitTourId: target.id });
  }

  private async copyFitOperationAggregate(
    tx: Prisma.TransactionClient,
    source: Awaited<ReturnType<FitToursService['detail']>>,
    target: Awaited<ReturnType<FitToursService['detail']>>,
    rows: ReturnType<FitTourLegacyCompatService['toCopiedOperationRows']>,
    user?: RequestUser,
  ) {
    const targetRootId = this.requiredTourRootId(target);
    await this.replaceFitTourServices(tx, targetRootId, { ...target, operationServices: rows } as unknown as UpdateFitTourDto);
    await this.legacyCompat.replaceOperationServices(tx, target.id, rows);
    await this.logFitTourAction(tx, targetRootId, 'COPY_FIT_OPERATION', user, { sourceFitTourId: source.id, targetFitTourId: target.id });
  }

  private async prepareCreateFitDto(tx: Prisma.TransactionClient, dto: CreateFitTourDto, user?: RequestUser) {
    const fitDto = await this.withCustomerSnapshot(tx, dto, user);
    this.validateProvidedFields(fitDto, true);
    this.validateFitTourBusinessRules(fitDto, true);
    this.validateChildPatches(fitDto);
    this.validateWorkflowTransition(undefined, fitDto.workflowStatus, true);
    return fitDto;
  }

  private async prepareUpdateFitDto(
    tx: Prisma.TransactionClient,
    current: Awaited<ReturnType<FitToursService['detail']>>,
    dto: UpdateFitTourDto,
    user?: RequestUser,
    options: FitUpdateOptions = {},
  ) {
    const patch = this.dropAttachmentPatch(await this.withCustomerSnapshot(tx, dto, user));
    const merged = { ...current, ...patch } as unknown as UpdateFitTourDto;
    if (options.step) {
      this.validateStepPatch(options.step, patch, merged);
      if (options.confirm) this.validateStepConfirmation(options.step, merged);
    } else {
      this.validateProvidedFields(patch, false);
      this.validateFitTourBusinessRules(merged, false);
    }
    this.validateChildPatches(patch);
    this.validateWorkflowTransition(current.workflowStatus, patch.workflowStatus, false);
    return { patch, merged };
  }

  private dropAttachmentPatch(dto: UpdateFitTourDto): UpdateFitTourDto {
    if (!Object.prototype.hasOwnProperty.call(dto as Row, 'attachments')) return dto;
    const patch = { ...(dto as Row) };
    delete patch.attachments;
    return patch as UpdateFitTourDto;
  }

  private hasAnyChanged(dto: UpdateFitTourDto | undefined, fields: string[]) {
    if (!dto) return true;
    return fields.some((field) => Object.prototype.hasOwnProperty.call(dto as Row, field));
  }

  private createTourRootFromFit(tx: Prisma.TransactionClient, dto: UpdateFitTourDto, user?: RequestUser) {
    return this.tourCore.createRoot(tx, dto as unknown as Row, this.tourConfig(), user);
  }

  private createLegacyFitDetail(tx: Prisma.TransactionClient, tourId: string, dto: UpdateFitTourDto) {
    return tx.fitTour.create({
      data: {
        ...this.toFitTourData(dto, true),
        tour: { connect: { id: tourId } },
        ...(dto.customerId ? { customer: { connect: { id: dto.customerId } } } : {}),
        ...(dto.orderId ? { order: { connect: { id: dto.orderId } } } : {}),
        ...this.legacyCompat.toChildCreateData(dto),
      } as Prisma.FitTourCreateInput,
    });
  }

  private updateLegacyFitDetail(
    tx: Prisma.TransactionClient,
    id: string,
    current: Pick<Awaited<ReturnType<FitToursService['detail']>>, 'tourId'>,
    patch: UpdateFitTourDto,
    tourId: string,
  ) {
    return tx.fitTour.update({
      where: { id },
      data: {
        ...this.toFitTourData(patch, false),
        ...(current.tourId ? {} : { tour: { connect: { id: tourId } } }),
        ...(patch.customerId !== undefined ? (patch.customerId ? { customer: { connect: { id: patch.customerId } } } : { customer: { disconnect: true } }) : {}),
        ...(patch.orderId !== undefined ? (patch.orderId ? { order: { connect: { id: patch.orderId } } } : { order: { disconnect: true } }) : {}),
      } as Prisma.FitTourUpdateInput,
    });
  }

  private async logFitTourAction(tx: Prisma.TransactionClient, tourId: string, action: string, user: RequestUser | undefined, metadata: Row) {
    await this.tourCore.logAction(tx, tourId, action, { user, module: 'fit-tours', metadata });
  }

  private async findFitAttachment(tourId: string, fitTourId: string, attachmentId: string) {
    const common = await this.prisma.tourAttachment.findFirst({ where: { id: attachmentId, tourId } });
    if (common) {
      const legacy = await this.prisma.fitAttachment.findFirst({
        where: { fitTourId, fileName: common.fileName, fileUrl: common.fileUrl, step: common.step },
      });
      return {
        commonId: common.id,
        legacyId: legacy?.id,
        step: common.step,
        fileName: common.fileName,
        fileUrl: common.fileUrl,
      };
    }
    const legacy = await this.prisma.fitAttachment.findFirst({ where: { id: attachmentId, fitTourId } });
    if (!legacy) return null;
    const matchedCommon = await this.prisma.tourAttachment.findFirst({
      where: { tourId, fileName: legacy.fileName, fileUrl: legacy.fileUrl, step: legacy.step },
    });
    return {
      commonId: matchedCommon?.id,
      legacyId: legacy.id,
      step: legacy.step,
      fileName: legacy.fileName,
      fileUrl: legacy.fileUrl,
    };
  }

  private actor(user?: RequestUser) {
    return user?.username || user?.email || user?.id || 'system';
  }

  private pickStepPatch(step: FitTourStep, dto: UpdateFitTourDto): UpdateFitTourDto {
    const patch: Row = {};
    for (const field of FIT_TOUR_STEP_FIELDS[step]) {
      if (field in dto) patch[field] = (dto as Row)[field];
    }
    return patch as UpdateFitTourDto;
  }

  private toEditableWorkflowStep(step: string): FitTourStep {
    const value = this.text(step).toUpperCase();
    if (Object.prototype.hasOwnProperty.call(FIT_TOUR_STEP_FIELDS, value)) return value as FitTourStep;
    throw new BadRequestException('Bước workflow FIT không hợp lệ');
  }

  private workflowStepForConfirm(currentStatus: FitTourWorkflowStatus | null | undefined, step: FitTourStep): FitTourWorkflowStatus | undefined {
    const current = this.toWorkflowStatusStrict(currentStatus) || FitTourWorkflowStatus.DRAFT;
    const currentIndex = workflowOrder.indexOf(current as (typeof workflowOrder)[number]);
    const stepIndex = workflowOrder.indexOf(step as (typeof workflowOrder)[number]);
    if (stepIndex < 0) return undefined;
    if (currentIndex < 0 || stepIndex > currentIndex) return step as FitTourWorkflowStatus;
    return undefined;
  }

  private rethrowFitUniqueConflict(error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('Mã báo giá FIT đã tồn tại');
    }
  }

  private validateProvidedFields(dto: UpdateFitTourDto, creating: boolean) {
    this.validateTextLength(dto.quoteCode, 'Mã báo giá', 2, creating);
    this.validateTextLength(dto.tourCode, 'Mã tour', 2, creating);
    this.validateTextLength(dto.customerName, 'Họ tên khách', 2, creating);
  }

  private validateStepPatch(_step: FitTourStep, patch: UpdateFitTourDto, merged: UpdateFitTourDto) {
    this.validateProvidedFields(patch, false);
    this.validateFitTourBusinessRulesForPatch(patch, merged);
    if (patch.workflowStatus !== undefined) this.toWorkflowStatusStrict(patch.workflowStatus);
  }

  private validateFitTourBusinessRulesForPatch(patch: UpdateFitTourDto, merged: UpdateFitTourDto) {
    const paxFields = ['adultCount', 'childCount', 'infantCount'];
    const numericFields = [
      ...paxFields,
      'sellingPrice',
      'commissionPerGuest',
      'exchangeRate',
      'seatCount',
      'tourPrice',
      'discount',
      'adultPrice',
      'childPrice25',
      'childPrice611',
      'infantPrice',
      'surcharge',
    ];
    for (const field of numericFields) {
      if (Object.prototype.hasOwnProperty.call(patch as Row, field)) this.nonNegativeNumber((patch as Row)[field], field);
    }
    if (paxFields.some((field) => Object.prototype.hasOwnProperty.call(patch as Row, field))) {
      const adultCount = this.nonNegativeInteger(merged.adultCount, 'adultCount');
      const childCount = this.nonNegativeInteger(merged.childCount, 'childCount');
      const infantCount = this.nonNegativeInteger(merged.infantCount, 'infantCount');
      if (adultCount + childCount + infantCount < 1) throw new BadRequestException('Số khách phải lớn hơn 0');
    }

    const dateFields = ['bookingDate', 'startDate', 'endDate', 'visaDeadline', 'holdUntil', 'confirmedAt', 'closeAt'];
    for (const field of dateFields) {
      if (Object.prototype.hasOwnProperty.call(patch as Row, field)) this.optionalDate((patch as Row)[field], field);
    }
    if (Object.prototype.hasOwnProperty.call(patch as Row, 'startDate') || Object.prototype.hasOwnProperty.call(patch as Row, 'endDate')) {
      const startDate = this.optionalDate(merged.startDate, 'startDate');
      const endDate = this.optionalDate(merged.endDate, 'endDate');
      if (startDate && endDate && startDate > endDate) throw new BadRequestException('Ngày về phải sau hoặc bằng ngày khởi đi');
    }
  }

  private validateFitTourBusinessRules(dto: UpdateFitTourDto, creating: boolean) {
    const adultCount = this.nonNegativeInteger(dto.adultCount ?? (creating ? 1 : 0), 'adultCount');
    const childCount = this.nonNegativeInteger(dto.childCount, 'childCount');
    const infantCount = this.nonNegativeInteger(dto.infantCount, 'infantCount');
    if (adultCount + childCount + infantCount < 1) {
      throw new BadRequestException('Số khách phải lớn hơn 0');
    }

    for (const field of [
      'sellingPrice',
      'commissionPerGuest',
      'exchangeRate',
      'seatCount',
      'tourPrice',
      'discount',
      'adultPrice',
      'childPrice25',
      'childPrice611',
      'infantPrice',
      'surcharge',
    ]) {
      if ((dto as Record<string, unknown>)[field] !== undefined) this.nonNegativeNumber((dto as Record<string, unknown>)[field], field);
    }

    const startDate = this.optionalDate(dto.startDate, 'startDate');
    const endDate = this.optionalDate(dto.endDate, 'endDate');
    if (startDate && endDate && startDate > endDate) {
      throw new BadRequestException('Ngày về phải sau hoặc bằng ngày khởi đi');
    }

    if (dto.bookingDate !== undefined) this.optionalDate(dto.bookingDate, 'bookingDate');
    for (const field of ['visaDeadline', 'holdUntil', 'confirmedAt', 'closeAt']) {
      if ((dto as Record<string, unknown>)[field] !== undefined) this.optionalDate((dto as Record<string, unknown>)[field], field);
    }

    if (dto.workflowStatus !== undefined) this.toWorkflowStatusStrict(dto.workflowStatus);
  }

  private validateStepConfirmation(step: FitTourStep, dto: UpdateFitTourDto) {
    if (step !== FitTourWorkflowStatus.PRICING) return;
    this.validateTextLength(dto.quoteCode, 'Mã báo giá', 2, true);
    this.validateTextLength(dto.tourCode, 'Mã tour', 2, true);
    this.validateTextLength(dto.customerName, 'Họ tên khách', 2, true);
    if (!this.optionalDate(dto.startDate, 'startDate')) throw new BadRequestException('Cần nhập ngày khởi đi trước khi xác nhận bước Tính giá');
    if (!this.optionalDate(dto.endDate, 'endDate')) throw new BadRequestException('Cần nhập ngày về trước khi xác nhận bước Tính giá');
    if (this.nonNegativeNumber(dto.sellingPrice, 'sellingPrice') <= 0) {
      throw new BadRequestException('Giá bán / khách phải lớn hơn 0 trước khi xác nhận bước Tính giá');
    }
  }

  private validateChildPatches(dto: UpdateFitTourDto) {
    for (const field of ['commonCosts', 'hotelCosts', 'privateCosts'] as const) {
      this.validateChildRows(dto[field], field, (row, path) => {
        this.validateOptionalText(row.serviceType, `${path}.serviceType`);
        this.validateChildNumbers(row, path, ['orderNo', 'quantity', 'paxPerRoom', 'times', 'exchangeRate', 'unitPrice', 'vat', 'amount']);
        this.validateChildPositiveNumbers(row, path, ['quantity', 'paxPerRoom', 'times', 'exchangeRate']);
      });
    }
    this.validateChildRows(dto.budgetServices, 'budgetServices', (row, path) => {
      this.validateOptionalText(row.serviceType, `${path}.serviceType`);
      this.validateChildNumbers(row, path, ['quantity', 'unitPrice', 'vat', 'amount']);
      this.validateChildPositiveNumbers(row, path, ['quantity']);
    });
    this.validateChildRows(dto.operationServices, 'operationServices', (row, path) => {
      this.validateOptionalText(row.serviceType, `${path}.serviceType`);
      this.validateChildNumbers(row, path, ['quantity', 'confirmedUnitPrice', 'vat', 'amount']);
      this.validateChildPositiveNumbers(row, path, ['quantity']);
      if (row.status !== undefined) this.toFitServiceStatusStrict(row.status, `${path}.status`);
    });
    this.validateChildRows(dto.guides, 'guides', (row, path) => {
      this.requiredText(row.name ?? row.ten, `${path}.name`);
    });
    this.validateChildRows(dto.handoverItems, 'handoverItems', (row, path) => {
      this.requiredText(row.itemName ?? row.name, `${path}.itemName`);
      this.validateChildNumbers(row, path, ['orderNo', 'quantity']);
    });
    this.validateChildRows(dto.surveyQuestions, 'surveyQuestions', (row, path) => {
      this.requiredText(row.question, `${path}.question`);
      this.validateChildNumbers(row, path, ['orderNo']);
    });
    this.validateChildRows(dto.attachments, 'attachments', (row, path) => {
      this.requiredText(row.fileName ?? row.name, `${path}.fileName`);
      if (row.step !== undefined) this.toAttachmentStep(row.step);
      if (row.size !== undefined && row.size !== null) {
        const size = this.nonNegativeInteger(row.size, `${path}.size`);
        if (size === 0) throw new BadRequestException(`${path}.size phải lớn hơn 0`);
      }
    });
  }

  private validateChildRows(value: unknown, field: string, validate: (row: Row, path: string) => void) {
    if (value === undefined) return;
    if (!Array.isArray(value)) throw new BadRequestException(`${field} phải là danh sách`);
    value.forEach((row, index) => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) {
        throw new BadRequestException(`${field}[${index}] phải là một object hợp lệ`);
      }
      validate(row as Row, `${field}[${index}]`);
    });
  }

  private validateChildNumbers(row: Row, path: string, fields: string[]) {
    for (const field of fields) {
      if (row[field] !== undefined && row[field] !== null && row[field] !== '') {
        this.nonNegativeNumber(row[field], `${path}.${field}`);
      }
    }
  }

  private validateChildPositiveNumbers(row: Row, path: string, fields: string[]) {
    for (const field of fields) {
      if (row[field] !== undefined && row[field] !== null && row[field] !== '') {
        const number = this.nonNegativeNumber(row[field], `${path}.${field}`);
        if (number <= 0) throw new BadRequestException(`${path}.${field} phải lớn hơn 0`);
      }
    }
  }

  private validateOptionalText(value: unknown, field: string) {
    if (value !== undefined && !this.text(value)) throw new BadRequestException(`${field} không được để trống`);
  }

  private validateWorkflowTransition(currentStatus: FitTourWorkflowStatus | null | undefined, nextStatus: FitTourWorkflowStatus | undefined, creating: boolean) {
    const next = this.toWorkflowStatusStrict(nextStatus) || FitTourWorkflowStatus.DRAFT;
    if (creating) {
      if (next !== FitTourWorkflowStatus.DRAFT && next !== FitTourWorkflowStatus.PRICING) {
        throw new BadRequestException('Tour FIT mới chỉ có thể tạo ở trạng thái Nháp hoặc Tính giá');
      }
      return;
    }

    if (nextStatus === undefined) return;
    const current = currentStatus || FitTourWorkflowStatus.DRAFT;
    if (terminalWorkflowStatuses.has(current) && next !== current) {
      throw new BadRequestException('Không thể đổi trạng thái của tour FIT đã ở trạng thái cuối');
    }
    if (next === FitTourWorkflowStatus.CANCELLED) return;
    if (next === FitTourWorkflowStatus.COMPLETED && current !== FitTourWorkflowStatus.SURVEY && current !== FitTourWorkflowStatus.COMPLETED) {
      throw new BadRequestException('Chỉ có thể hoàn tất tour FIT sau bước Phiếu đánh giá dịch vụ');
    }

    const currentIndex = workflowOrder.indexOf(current as (typeof workflowOrder)[number]);
    const nextIndex = workflowOrder.indexOf(next as (typeof workflowOrder)[number]);
    if (currentIndex >= 0 && nextIndex >= 0 && nextIndex > currentIndex + 1) {
      throw new BadRequestException('Không được chuyển workflow FIT vượt quá bước kế tiếp');
    }
  }

  private validateTextLength(dtoValue: unknown, label: string, minLength: number, required: boolean) {
    if (dtoValue === undefined && !required) return;
    const text = this.requiredText(dtoValue, label);
    if (text.length < minLength) throw new BadRequestException(`${label} cần ít nhất ${minLength} ký tự`);
  }

  private appendExportRows(rows: unknown[][], section: string, values: unknown, mapper: (row: Row) => unknown[]) {
    if (!Array.isArray(values)) return;
    values.forEach((value, index) => rows.push([section, index + 1, ...mapper(value as Row)]));
  }

  private exportDate(value: unknown) {
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return this.optionalText(value);
  }

  private csvCell(value: unknown) {
    const text = this.csvText(value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  private csvText(value: unknown) {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  private numberValue(value: unknown) {
    const number = Number(value ?? 0);
    return Number.isFinite(number) ? number : 0;
  }

  private fitTourScopeWhere(where: Prisma.FitTourWhereInput, user?: RequestUser): Prisma.FitTourWhereInput {
    if (!user || hasUnrestrictedDataScope(user)) return { AND: [where, { tour: { is: { deletedAt: null } } }] };
    const scopedTour = branchDepartmentScopeWhere<Prisma.TourWhereInput>({ deletedAt: null }, user);
    return { AND: [where, { tour: { is: scopedTour } }] };
  }

  private withTourRootSnapshot<T extends Row>(fitTour: T): T {
    const tour = fitTour.tour as Row | null | undefined;
    if (!tour) return fitTour;
    const customers = Array.isArray(tour.customers) ? (tour.customers as Row[]) : [];
    const primaryCustomer = customers.find((customer) => customer.isPrimary === true) || customers[0];
    const services = Array.isArray(tour.services) ? (tour.services as Row[]) : [];
    const budgetServices = this.rootBudgetServices(services);
    const operationServices = this.rootOperationServices(services);
    const rootCostGroups = this.rootFitCostGroups(Array.isArray(tour.costs) ? (tour.costs as Row[]) : []);
    const guides = this.rootGuides(Array.isArray(tour.guides) ? (tour.guides as Row[]) : []);
    const attachments = this.rootAttachments(Array.isArray(tour.attachments) ? (tour.attachments as Row[]) : []);
    const surveyQuestions = this.rootSurveyQuestions(Array.isArray(tour.surveys) ? (tour.surveys as Row[]) : []);
    return {
      ...fitTour,
      quoteCode: tour.systemCode ?? fitTour.quoteCode,
      tourCode: tour.tourCode ?? fitTour.tourCode,
      tourName: tour.name ?? fitTour.tourName,
      marketGroup: tour.marketGroup ?? fitTour.marketGroup,
      bookingDate: tour.bookingDate ?? fitTour.bookingDate,
      startDate: tour.startDate ?? fitTour.startDate,
      endDate: tour.endDate ?? fitTour.endDate,
      flightRoute: tour.flightRoute ?? fitTour.flightRoute,
      exchangeRateCode: tour.exchangeRateCode ?? fitTour.exchangeRateCode,
      exchangeRate: tour.exchangeRate ?? fitTour.exchangeRate,
      operatorOwner: tour.operatorOwner ?? fitTour.operatorOwner,
      pickupPoint: tour.pickupPoint ?? fitTour.pickupPoint,
      dropoffPoint: tour.dropoffPoint ?? fitTour.dropoffPoint,
      notes: tour.notes ?? fitTour.notes,
      updatedAt: tour.updatedAt ?? fitTour.updatedAt,
      customerName: primaryCustomer?.name ?? fitTour.customerName,
      phone: primaryCustomer?.phone ?? fitTour.phone,
      email: primaryCustomer?.email ?? fitTour.email,
      ...('commonCosts' in fitTour ? { commonCosts: rootCostGroups.commonCosts.length ? rootCostGroups.commonCosts : fitTour.commonCosts } : {}),
      ...('hotelCosts' in fitTour ? { hotelCosts: rootCostGroups.hotelCosts.length ? rootCostGroups.hotelCosts : fitTour.hotelCosts } : {}),
      ...('privateCosts' in fitTour ? { privateCosts: rootCostGroups.privateCosts.length ? rootCostGroups.privateCosts : fitTour.privateCosts } : {}),
      ...('budgetServices' in fitTour ? { budgetServices: budgetServices.length ? budgetServices : fitTour.budgetServices } : {}),
      ...('operationServices' in fitTour ? { operationServices: operationServices.length ? operationServices : fitTour.operationServices } : {}),
      ...('guides' in fitTour ? { guides: guides.length ? guides : fitTour.guides } : {}),
      ...('attachments' in fitTour ? { attachments: attachments.length ? attachments : fitTour.attachments } : {}),
      ...('surveyQuestions' in fitTour ? { surveyQuestions: surveyQuestions.length ? surveyQuestions : fitTour.surveyQuestions } : {}),
      _count: this.withRootChildCounts(fitTour._count, budgetServices, operationServices, rootCostGroups),
    };
  }

  private withRootChildCounts(counts: unknown, budgetServices: Row[], operationServices: Row[], costGroups: RootFitCostGroups) {
    if (!counts || typeof counts !== 'object' || Array.isArray(counts)) return counts;
    return {
      ...(counts as Row),
      ...(costGroups.commonCosts.length ? { commonCosts: costGroups.commonCosts.length } : {}),
      ...(costGroups.hotelCosts.length ? { hotelCosts: costGroups.hotelCosts.length } : {}),
      ...(costGroups.privateCosts.length ? { privateCosts: costGroups.privateCosts.length } : {}),
      ...(budgetServices.length ? { budgetServices: budgetServices.length } : {}),
      ...(operationServices.length ? { operationServices: operationServices.length } : {}),
    };
  }

  private rootFitCostGroups(costs: Row[]): RootFitCostGroups {
    const groups: RootFitCostGroups = { commonCosts: [], hotelCosts: [], privateCosts: [] };
    for (const row of costs) {
      const parsed = this.parseFitCostType(row.costType);
      if (!parsed) continue;
      groups[parsed.group].push(this.rootFitCostRow(row, parsed));
    }
    return groups;
  }

  private rootFitCostRow(row: Row, parsed: { group: FitCostGroupField; serviceType: string }): Row {
    const amount = this.number(row.actualAmount) > 0 ? row.actualAmount : row.expectedAmount;
    const base = {
      id: row.id,
      serviceType: parsed.serviceType,
      description: row.description,
      unit: null,
      times: 1,
      currency: row.currency,
      exchangeRate: row.exchangeRate,
      unitPrice: row.expectedAmount,
      vat: row.vat,
      amount,
      notes: row.notes,
    };
    if (parsed.group === 'hotelCosts') return { ...base, paxPerRoom: 1 };
    return { ...base, quantity: 1 };
  }

  private parseFitCostType(costType: unknown): { group: FitCostGroupField; serviceType: string } | null {
    const text = this.text(costType);
    for (const [group, tag] of Object.entries(fitCostGroupTags) as Array<[FitCostGroupField, string]>) {
      if (text === tag) return { group, serviceType: tag };
      if (text.startsWith(`${tag}:`)) return { group, serviceType: text.slice(tag.length + 1).trim() || tag };
    }
    return null;
  }

  private rootBudgetServices(services: Row[]): Row[] {
    return services
      .filter((row) => this.number(row.budgetAmount) > 0 || this.number(row.budgetUnitPrice) > 0)
      .map((row) => ({
        id: row.id,
        serviceType: row.serviceType,
        supplierId: row.supplierId,
        supplier: row.supplier,
        description: row.description,
        quantity: row.quantity,
        unitPrice: row.budgetUnitPrice,
        vat: row.vat,
        amount: row.budgetAmount,
        notes: row.notes,
      }));
  }

  private rootOperationServices(services: Row[]): Row[] {
    return services
      .filter((row) => this.number(row.confirmedAmount) > 0 || this.number(row.confirmedUnitPrice) > 0 || this.optionalText(row.bookingCode))
      .map((row) => ({
        id: row.id,
        serviceType: row.serviceType,
        supplierId: row.supplierId,
        supplier: row.supplier,
        supplierServiceId: row.supplierServiceId,
        supplierService: row.supplierService,
        description: row.description,
        bookingCode: row.bookingCode,
        quantity: row.quantity,
        confirmedUnitPrice: row.confirmedUnitPrice,
        vat: row.vat,
        amount: row.confirmedAmount,
        status: this.toFitServiceStatus(row.confirmationStatus),
        notes: row.notes,
      }));
  }

  private rootGuides(guides: Row[]): Row[] {
    return guides.map((row) => ({ id: row.id, guideId: row.guideId, name: row.name, phone: row.phone, guideType: row.guideType, notes: row.notes }));
  }

  private rootAttachments(attachments: Row[]): Row[] {
    return attachments.map((row) => ({ id: row.id, step: row.step, fileName: row.fileName, fileUrl: row.fileUrl, mimeType: row.mimeType, size: row.size, uploadedBy: row.uploadedBy, createdAt: row.createdAt }));
  }

  private rootSurveyQuestions(surveys: Row[]): Row[] {
    return surveys.map((row) => ({ id: row.id, orderNo: row.orderNo, question: row.question, notes: row.notes }));
  }

  private toFitServiceStatus(status: unknown) {
    const value = this.text(status);
    if (Object.values(FitServiceStatus).includes(value as FitServiceStatus)) return value as FitServiceStatus;
    return FitServiceStatus.WAITING;
  }

  private async withCustomerSnapshot(tx: Prisma.TransactionClient, dto: UpdateFitTourDto, user?: RequestUser) {
    const customerId = this.optionalText(dto.customerId);
    if (!customerId) return dto;
    const customer = await tx.customer.findFirst({
      where: branchDepartmentScopeWhere<Prisma.CustomerWhereInput>({ id: customerId, mergedIntoId: null }, user),
      select: { fullName: true, phone: true, email: true },
    });
    if (!customer) throw new NotFoundException('Không tìm thấy khách hàng trong phạm vi dữ liệu');
    return {
      ...dto,
      customerId,
      customerName: dto.customerName ?? customer.fullName,
      phone: dto.phone ?? customer.phone,
      email: dto.email ?? customer.email ?? undefined,
    };
  }

  private async syncTourRootFromFit(
    tx: Prisma.TransactionClient,
    current: Pick<Awaited<ReturnType<FitToursService['detail']>>, 'tourId'>,
    dto: UpdateFitTourDto,
    user?: RequestUser,
  ) {
    if (!current.tourId) {
      const tour = await this.tourCore.createRoot(tx, dto as unknown as Row, this.tourConfig(), user);
      return tour.id;
    }
    await this.tourCore.updateRoot(tx, current.tourId, dto as unknown as Row, this.tourConfig(), user);
    return current.tourId;
  }

  private requiredTourRootId(fitTour: Pick<Awaited<ReturnType<FitToursService['detail']>>, 'tourId'>) {
    if (!fitTour.tourId) throw new BadRequestException('Tour FIT chưa liên kết Tour chung');
    return fitTour.tourId;
  }

  private async syncTourCoreFromFit(tx: Prisma.TransactionClient, tourId: string, dto: UpdateFitTourDto, changedDto?: UpdateFitTourDto) {
    const children: TourCommonChildren = {};
    if (this.hasAnyChanged(changedDto, ['customerId', 'customerName', 'phone', 'email', 'notes'])) {
      children.customers = [this.mapTourCustomer(dto)];
    }
    if (this.hasAnyChanged(changedDto, ['guides'])) {
      children.guides = this.tourCore.mapGuides(dto.guides);
    }
    if (this.hasAnyChanged(changedDto, ['attachments'])) {
      children.attachments = this.tourCore.mapAttachments(dto.attachments);
    }
    if (this.hasAnyChanged(changedDto, ['surveyQuestions'])) {
      children.surveys = this.tourCore.mapSurveys(dto.surveyQuestions, FIT_DEFAULT_SURVEY_QUESTIONS);
    }
    if (this.hasAnyChanged(changedDto, ['revenues', 'sellingPrice', 'tourPrice', 'tourName', 'tourCode', 'notes'])) {
      children.revenues = this.mapTourRevenues(dto);
    }
    if (this.hasAnyChanged(changedDto, ['costs', 'commonCosts', 'hotelCosts', 'privateCosts'])) {
      children.costs = this.mapTourCosts(dto);
    }
    if (this.hasAnyChanged(changedDto, ['budgetServices', 'operationServices'])) {
      children.services = this.mapTourServices(dto);
      children.serviceSupplierRole = 'FIT_SERVICE';
    }
    await this.tourCore.replaceCommonChildren(tx, tourId, children);
  }

  private async replaceFitTourServices(tx: Prisma.TransactionClient, tourId: string, dto: UpdateFitTourDto) {
    await this.tourCore.replaceServicesAndSuppliers(tx, tourId, this.mapTourServices(dto), 'FIT_SERVICE');
  }

  private tourConfig(): TourRootConfig {
    return {
      type: TourType.FIT,
      systemCodeField: 'quoteCode',
      tourCodeField: 'tourCode',
      nameField: 'tourName',
      productTypeField: 'tourType',
      workflowField: 'workflowStatus',
      defaultWorkflowStep: FitTourWorkflowStatus.DRAFT,
      statusFromWorkflow: (workflowStep) => this.toTourStatus(workflowStep),
      allowStatusInput: false,
      allowWorkflowStepInput: false,
    };
  }

  private mapTourCustomer(dto: UpdateFitTourDto): Prisma.TourCustomerCreateManyInput {
    return {
      tourId: '',
      crmCustomerId: this.optionalText(dto.customerId),
      customerType: 'CUSTOMER',
      name: this.requiredText(dto.customerName, 'Cần nhập tên khách hàng'),
      phone: this.optionalText(dto.phone),
      email: this.optionalText(dto.email),
      isPrimary: true,
      notes: this.optionalText(dto.notes),
    };
  }

  private mapTourRevenues(dto: UpdateFitTourDto): Prisma.TourRevenueCreateManyInput[] {
    if (dto.revenues !== undefined) return this.tourCore.mapRevenues(dto.revenues);
    const amount = this.number(dto.sellingPrice || dto.tourPrice);
    if (amount <= 0) return [];
    return [
      {
        tourId: '',
        description: this.optionalText(dto.tourName) || this.optionalText(dto.tourCode) || 'FIT revenue',
        quantity: 1,
        unitPrice: amount,
        currency: 'VND',
        exchangeRate: 1,
        vat: 0,
        amount,
        notes: this.optionalText(dto.notes),
      },
    ];
  }

  private mapTourCosts(dto: UpdateFitTourDto): Prisma.TourCostCreateManyInput[] {
    if (dto.costs !== undefined) return this.tourCore.mapCosts(dto.costs, 'FIT_COST');
    const totalPax = this.totalPax(dto);
    const mapRows = (
      rows: Array<{ serviceType: string; description: string | null; amount: number; currency: string; exchangeRate: number; vat: number; notes: string | null }>,
      costType: string,
    ) =>
      rows.map((row) => ({
        tourId: '',
        costType: this.fitCostType(costType, row.serviceType),
        description: row.description,
        expectedAmount: row.amount,
        actualAmount: row.amount,
        currency: row.currency || 'VND',
        exchangeRate: row.exchangeRate || 1,
        vat: row.vat,
        notes: row.notes,
      }));
    return [
      ...mapRows(this.mapCommonCosts(dto.commonCosts), 'FIT_COMMON_COST'),
      ...mapRows(this.mapHotelCosts(dto.hotelCosts, totalPax), 'FIT_HOTEL_COST'),
      ...mapRows(this.mapPrivateCosts(dto.privateCosts), 'FIT_PRIVATE_COST'),
    ];
  }

  private fitCostType(tag: string, serviceType: unknown) {
    const text = this.optionalText(serviceType);
    return text ? `${tag}:${text}` : tag;
  }

  private mapTourServices(dto: UpdateFitTourDto): Prisma.TourServiceCreateManyInput[] {
    const budgetServices = this.mapBudgetServices(dto.budgetServices).map((row) => ({
      tourId: '',
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

    const operationInputRows = this.rows(dto.operationServices);
    const operationServices = this.mapOperationServices(dto.operationServices).map((row, index) => ({
      tourId: '',
      serviceType: row.serviceType,
      supplierId: row.supplierId,
      supplierServiceId: row.supplierServiceId,
      description: this.optionalText(operationInputRows[index]?.description),
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
    return this.legacyCompat.toFitTourData(dto, creating);
  }

  private mapCommonCosts(rows?: unknown[]) {
    return this.legacyCompat.mapCommonCosts(rows);
  }

  private mapHotelCosts(rows?: unknown[], totalPax = 1) {
    return this.legacyCompat.mapHotelCosts(rows, totalPax);
  }

  private mapPrivateCosts(rows?: unknown[]) {
    return this.legacyCompat.mapPrivateCosts(rows);
  }

  private mapBudgetServices(rows?: unknown[]) {
    return this.legacyCompat.mapBudgetServices(rows);
  }

  private mapOperationServices(rows?: unknown[]) {
    return this.legacyCompat.mapOperationServices(rows);
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
    if (!text) throw new BadRequestException(`${field} là bắt buộc`);
    return text;
  }

  private optionalText(value: unknown) {
    const text = this.text(value);
    return text ? text : null;
  }

  private optionalDate(value: unknown, field = 'date') {
    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) throw new BadRequestException(`${field} không hợp lệ`);
      return value;
    }
    const text = this.text(value);
    if (!text) return null;
    if (!FIT_TOUR_DATE_PATTERN.test(text)) throw new BadRequestException(`${field} phải có định dạng YYYY-MM-DD`);
    const [year, month, day] = text.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
      throw new BadRequestException(`${field} không hợp lệ`);
    }
    return date;
  }

  private number(value: unknown) {
    const number = Number(value || 0);
    return Number.isFinite(number) ? number : 0;
  }

  private totalPax(dto: UpdateFitTourDto) {
    return Math.max(1, this.number(dto.adultCount) + this.number(dto.childCount) + this.number(dto.infantCount));
  }

  private nonNegativeNumber(value: unknown, field: string) {
    const number = Number(value ?? 0);
    if (!Number.isFinite(number)) throw new BadRequestException(`${field} phải là số hợp lệ`);
    if (number < 0) throw new BadRequestException(`${field} không được âm`);
    return number;
  }

  private nonNegativeInteger(value: unknown, field: string) {
    const number = this.nonNegativeNumber(value, field);
    if (!Number.isInteger(number)) throw new BadRequestException(`${field} phải là số nguyên`);
    return number;
  }

  private money(explicitAmount: unknown, subtotal: number, vat: number) {
    const hasExplicitAmount = explicitAmount !== undefined && explicitAmount !== null && String(explicitAmount).trim() !== '';
    return hasExplicitAmount ? this.nonNegativeNumber(explicitAmount, 'amount') : subtotal * (1 + vat / 100);
  }

  private toWorkflowStatus(status?: string) {
    const value = this.text(status);
    if (!value) return undefined;
    const normalized = value.toUpperCase();
    if (Object.values(FitTourWorkflowStatus).includes(normalized as FitTourWorkflowStatus)) return normalized as FitTourWorkflowStatus;
    throw new BadRequestException('Trạng thái workflow FIT không hợp lệ');
  }

  private toWorkflowStatusStrict(status: unknown) {
    const value = this.text(status);
    if (!value) return undefined;
    if (Object.values(FitTourWorkflowStatus).includes(value as FitTourWorkflowStatus)) return value as FitTourWorkflowStatus;
    throw new BadRequestException('Trạng thái workflow FIT không hợp lệ');
  }

  private toAttachmentStep(step: unknown) {
    const value = this.text(step);
    if (!value) return null;
    if (Object.values(FitTourWorkflowStatus).includes(value as FitTourWorkflowStatus)) return value;
    throw new BadRequestException('Bước workflow của file đính kèm không hợp lệ');
  }

  private toServiceStatus(status: unknown) {
    const value = this.text(status);
    if (Object.values(FitServiceStatus).includes(value as FitServiceStatus)) return value as FitServiceStatus;
    return FitServiceStatus.WAITING;
  }

  private toFitServiceStatusStrict(status: unknown, field: string) {
    const value = this.text(status);
    if (Object.values(FitServiceStatus).includes(value as FitServiceStatus)) return value as FitServiceStatus;
    throw new BadRequestException(`${field} không thuộc danh sách trạng thái dịch vụ hợp lệ`);
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

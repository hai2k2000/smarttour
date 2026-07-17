import { BadRequestException, ConflictException, ForbiddenException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { Prisma, SupplierDayType, SupplierStatus } from '@prisma/client';
import { csvRows } from '../../common/csv-export';
import { PrismaService } from '../../database/prisma.service';
import { branchDepartmentScopeWhere, hasUnrestrictedDataScope, RequestUser, userPermissions } from '../auth/data-scope';
import { FilesService } from '../files/files.service';
import { containsSearch, InsensitiveContains, normalizeListSearch } from '../list-search';
import { CreateSupplierCategoryDto } from './dto/create-supplier-category.dto';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { CreateGenericSupplierDto, SupplierChildServiceInputDto, SupplierContactInputDto, UpdateGenericSupplierDto, UpdateSupplierChildServiceInputDto, UpdateSupplierContactDto } from './dto/generic-supplier.dto';
import { CreateHotelSupplierDto, LockAllotmentDto, OverrideAllotmentDto, ReleaseAllotmentDto, UpdateHotelSupplierDto } from './dto/hotel-supplier.dto';
import { SupplierImportDto } from './dto/supplier-import.dto';
import { DEFAULT_SUPPLIERS_TAKE, HotelSupplierListQueryDto, SupplierCategoryListQueryDto, SupplierListQueryDto, TypedSupplierListQueryDto } from './dto/supplier-query.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { SUPPLIER_ALLOTMENT_STATUSES, type SupplierAllotmentStatus } from './supplier-allotment-status';
import { SUPPLIER_EXPORT_HEADERS, toSupplierExportCsvRows } from './supplier-export';
import { normalizeSupplierImportRows, supplierImportRows, type SupplierImportError, type SupplierImportFile, type SupplierImportRecord } from './supplier-import';
import { canViewSupplierFinancialFields, maskSupplierFinancialFields } from './supplier-projection';
import { getTypeLabel, isTypedSupplierRoute, SUPPLIER_TYPE_CATEGORY_ALIASES, SUPPLIER_TYPE_LABELS, SUPPLIER_TYPE_METADATA_FIELDS, supplierTypeCategoryNames, TypedSupplierRoute } from './supplier-types';

const supplierCategoryNameKey = (value: string) => value
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/đ/gi, 'd')
  .toLocaleLowerCase('vi')
  .replace(/\s+/g, ' ')
  .trim();
const HOTEL_SUPPLIER_CATEGORY_NAME = 'Khách sạn';
const SPECIALIZED_SUPPLIER_CATEGORY_KEYS = new Set(
  [HOTEL_SUPPLIER_CATEGORY_NAME, 'Hotel', ...Object.values(SUPPLIER_TYPE_LABELS), ...Object.values(SUPPLIER_TYPE_CATEGORY_ALIASES).flat()].map(supplierCategoryNameKey),
);
const SUPPLIER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SUPPLIER_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const SUPPLIER_PHONE_PATTERN = /^(?=(?:\D*\d){6,15}\D*$)[+\d\s().-]+$/;
const SUPPLIER_PHONE_MAX_LENGTH = 30;
const MIN_HOTEL_BUILT_YEAR = 1800;
const MAX_SUPPLIER_RATING = 5;
const MAX_SUPPLIER_MONEY = 999_999_999_999;
const MAX_SUPPLIER_CODE_LENGTH = 80;
const MAX_SUPPLIER_NAME_LENGTH = 180;
const MAX_SUPPLIER_TAX_CODE_LENGTH = 80;
const MAX_SUPPLIER_CONTACT_PERSON_LENGTH = 120;
const MAX_SUPPLIER_COUNTRY_LENGTH = 120;
const MAX_SUPPLIER_PROVINCE_LENGTH = 120;
const MAX_SUPPLIER_ADDRESS_LENGTH = 500;
const MAX_SUPPLIER_URL_LENGTH = 500;
const MAX_SUPPLIER_MARKET_LENGTH = 120;
const MAX_SUPPLIER_BANK_ACCOUNT_NAME_LENGTH = 180;
const MAX_SUPPLIER_BANK_ACCOUNT_NUMBER_LENGTH = 80;
const MAX_SUPPLIER_BANK_NAME_LENGTH = 180;
const MAX_SUPPLIER_NOTES_LENGTH = 2000;
const MAX_SUPPLIER_SERVICE_NAME_LENGTH = 180;
const MAX_SUPPLIER_SERVICE_SKU_LENGTH = 80;
const MAX_SUPPLIER_ALLOTMENT_NAME_LENGTH = 180;
const MAX_SUPPLIER_ALLOTMENT_CUTOFF_DAYS = 365;
const SUPPLIER_STATUS_LABELS: Record<SupplierStatus, string> = {
  [SupplierStatus.ACTIVE]: 'Đang hoạt động',
  [SupplierStatus.INACTIVE]: 'Ngừng hoạt động',
};
const SUPPLIER_STATUS_TRANSITIONS: Record<SupplierStatus, readonly SupplierStatus[]> = {
  [SupplierStatus.ACTIVE]: [SupplierStatus.INACTIVE],
  [SupplierStatus.INACTIVE]: [SupplierStatus.ACTIVE],
};
const SUPPLIER_ERRORS = {
  categoryNotFound: 'Không tìm thấy loại nhà cung cấp',
  categoryExists: 'Loại nhà cung cấp đã tồn tại',
  supplierNotFound: 'Không tìm thấy nhà cung cấp',
  typedSupplierNotFound: 'Không tìm thấy nhà cung cấp thuộc loại đã chọn',
  hotelSupplierNotFound: 'Không tìm thấy nhà cung cấp khách sạn',
  fileNotFound: 'Không tìm thấy file nhà cung cấp',
  codeExists: 'Mã nhà cung cấp đã tồn tại',
  allotmentNotFound: 'Không tìm thấy quỹ phòng',
  allocationNotFound: 'Không tìm thấy phân bổ quỹ phòng',
  unsupportedType: 'Loại nhà cung cấp không được hỗ trợ',
} as const;
const SUPPLIER_SERVICE_ORDER_BY = [
  { createdAt: 'asc' },
  { sku: 'asc' },
  { id: 'asc' },
] satisfies Prisma.SupplierServiceOrderByWithRelationInput[];
type UploadFile = { originalname: string; mimetype: string; size: number; buffer: Buffer };
type SupplierImportPreviewRow = {
  line: number;
  dto: CreateSupplierDto;
  categoryName?: string;
  valid: boolean;
};
const MAX_SUPPLIER_FINANCE_SUMMARY_IDS = 100;

type SupplierFinanceLinks = {
  financeDebt: string;
  financePayments: string;
  operationVouchers: string;
  supplierPaymentRequests: string;
};

type SupplierFinanceMoneyTotals = {
  count: number;
  totalAmount: number;
  paymentAmount: number;
  remainingAmount: number;
};

type SupplierFinanceSummary = {
  supplierId: string;
  summary: { payable: number; paid: number; balance: number; ledgerCount: number };
  payments: SupplierFinanceMoneyTotals & { byStatus: Record<string, SupplierFinanceMoneyTotals> };
  vouchers: { count: number; totalAmount: number; paidAmount: number; remainingAmount: number };
  paymentRequests: { count: number; amount: number };
  links: SupplierFinanceLinks;
  recent?: {
    ledgerEntries: Array<Record<string, unknown>>;
    payments: Array<Record<string, unknown>>;
    operationVouchers: Array<Record<string, unknown>>;
    supplierPaymentRequests: Array<Record<string, unknown>>;
  };
};

@Injectable()
export class SuppliersService {
  // Supplier records are global master data; branch/department scope applies to linked transactions and allotment actions.
  constructor(private readonly prisma: PrismaService, private readonly filesService: FilesService) {}

  listCategories(query: SupplierCategoryListQueryDto = {}) {
    const searchText = normalizeListSearch(query.search);
    return this.prisma.supplierCategory.findMany({
      where: {
        ...(searchText ? { name: containsSearch(searchText) } : {}),
        ...(query.includeEmpty === false ? { suppliers: { some: { deletedAt: null } } } : {}),
      },
      orderBy: { name: 'asc' },
      include: { _count: { select: { suppliers: { where: { deletedAt: null } } } } },
    });
  }

  async createCategory(dto: CreateSupplierCategoryDto) {
    const name = this.requiredLabel(dto.name, 'Cần nhập tên loại nhà cung cấp');
    await this.ensureCategoryNameAvailable(name);
    try {
      return await this.prisma.supplierCategory.create({
        data: { name },
        include: { _count: { select: { suppliers: { where: { deletedAt: null } } } } },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(SUPPLIER_ERRORS.categoryExists);
      }
      throw error;
    }
  }

  async updateCategory(id: string, dto: CreateSupplierCategoryDto) {
    const category = await this.prisma.supplierCategory.findUnique({ where: { id }, select: { id: true, name: true } });
    if (!category) throw new NotFoundException(SUPPLIER_ERRORS.categoryNotFound);
    const name = this.requiredLabel(dto.name, 'Cần nhập tên loại nhà cung cấp');
    if (this.isSpecializedCategoryName(category.name) && this.categoryNameKey(name) !== this.categoryNameKey(category.name)) {
      throw new BadRequestException('Không thể đổi tên loại nhà cung cấp hệ thống');
    }
    await this.ensureCategoryNameAvailable(name, id);
    try {
      return await this.prisma.supplierCategory.update({
        where: { id },
        data: { name },
        include: { _count: { select: { suppliers: { where: { deletedAt: null } } } } },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(SUPPLIER_ERRORS.categoryExists);
      }
      throw error;
    }
  }

  async deleteCategory(id: string) {
    const category = await this.prisma.supplierCategory.findUnique({
      where: { id },
      include: { _count: { select: { suppliers: true } } },
    });
    if (!category) throw new NotFoundException(SUPPLIER_ERRORS.categoryNotFound);
    if (this.isSpecializedCategoryName(category.name)) {
      throw new BadRequestException('Không thể xóa loại nhà cung cấp hệ thống');
    }
    if (category._count.suppliers > 0) {
      throw new ConflictException('Không thể xóa loại nhà cung cấp đang hoặc đã được gắn với nhà cung cấp');
    }
    return this.prisma.supplierCategory.delete({ where: { id } });
  }

  async listSuppliers(query: SupplierListQueryDto = {}, user?: RequestUser) {
    const searchText = normalizeListSearch(query.search);
    const contains = searchText ? containsSearch(searchText) : undefined;
    const province = this.optionalLabel(query.province);
    const market = this.optionalLabel(query.market);
    const where: Prisma.SupplierWhereInput = {
      deletedAt: null,
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(province ? { province: containsSearch(province) } : {}),
      ...(market ? { market: containsSearch(market) } : {}),
      ...(contains
        ? {
            OR: this.supplierSearchConditions(contains, user),
          }
        : {}),
    };

    const suppliers = await this.prisma.supplier.findMany({
      where,
      include: this.supplierListInclude(),
      take: this.listTake(query.take ?? query.limit),
      orderBy: [{ updatedAt: 'desc' }, { name: 'asc' }],
    });
    return maskSupplierFinancialFields(suppliers, user);
  }


  async exportSuppliersCsv(query: SupplierListQueryDto = {}, user?: RequestUser) {
    const rows = await this.listSuppliers(query, user);
    return csvRows(SUPPLIER_EXPORT_HEADERS, toSupplierExportCsvRows(rows, user));
  }

  async exportTypedSuppliersCsv(type: string, query: TypedSupplierListQueryDto = {}, user?: RequestUser) {
    const rows = await this.listTypedSuppliers(type, query, user);
    return csvRows(SUPPLIER_EXPORT_HEADERS, toSupplierExportCsvRows(rows, user));
  }

  async exportHotelSuppliersCsv(query: HotelSupplierListQueryDto = {}, user?: RequestUser) {
    const rows = await this.listHotelSuppliers(query, user);
    return csvRows(SUPPLIER_EXPORT_HEADERS, toSupplierExportCsvRows(rows, user));
  }

  async previewSupplierImport(dto: SupplierImportDto, file?: SupplierImportFile, user?: RequestUser) {
    const rows = supplierImportRows(dto as SupplierImportRecord, file);
    const normalized = normalizeSupplierImportRows(rows, { canWriteFinancialFields: canViewSupplierFinancialFields(user) });
    const errors: SupplierImportError[] = [...normalized.errors];
    const previewRows: SupplierImportPreviewRow[] = [];
    const supplierCodeLines = new Map<string, number>();

    for (const row of normalized.rows) {
      const rowDto = { ...row.dto } as Partial<CreateSupplierDto>;
      let valid = true;

      const categoryField = rowDto.categoryId || row.categoryName ? 'categoryId' : 'categoryName';
      try {
        if (rowDto.categoryId) {
          await this.ensureCategory(rowDto.categoryId);
        } else if (row.categoryName) {
          const category = await this.findCategoryByName(row.categoryName);
          if (!category) throw new NotFoundException(SUPPLIER_ERRORS.categoryNotFound);
          rowDto.categoryId = category.id;
        }
      } catch (error) {
        valid = false;
        this.addSupplierImportError(errors, row.line, categoryField, error);
      }

      try {
        this.validateSupplierPayload(rowDto as CreateSupplierDto);
      } catch (error) {
        valid = false;
        this.addSupplierImportError(errors, row.line, 'payload', error);
      }

      try {
        this.assertCanWriteSupplierFinancialFields(rowDto, user);
      } catch (error) {
        valid = false;
        this.addSupplierImportError(errors, row.line, 'financialFields', error);
      }

      const supplierCodeKey = this.supplierImportCodeKey(rowDto.supplierCode);
      if (supplierCodeKey) {
        const firstLine = supplierCodeLines.get(supplierCodeKey);
        if (firstLine !== undefined) {
          valid = false;
          errors.push({
            line: row.line,
            field: 'supplierCode',
            message: `Mã nhà cung cấp trùng với dòng ${firstLine}`,
          });
        } else {
          supplierCodeLines.set(supplierCodeKey, row.line);
        }
      }

      try {
        await this.ensureSupplierCodeAvailable(rowDto.supplierCode);
      } catch (error) {
        valid = false;
        this.addSupplierImportError(errors, row.line, 'supplierCode', error);
      }

      previewRows.push({
        line: row.line,
        dto: rowDto as CreateSupplierDto,
        categoryName: row.categoryName,
        valid,
      });
    }

    const failedLines = new Set(errors.map((error) => error.line));
    return {
      totalRows: normalized.totalRows,
      validRows: normalized.totalRows - failedLines.size,
      failedRows: failedLines.size,
      errors,
      rows: previewRows,
    };
  }

  async importSuppliers(dto: SupplierImportDto, file?: SupplierImportFile, user?: RequestUser) {
    const preview = await this.previewSupplierImport(dto, file, user);
    if (preview.failedRows > 0) {
      throw new BadRequestException({ message: 'Import nhà cung cấp có lỗi, chưa ghi dữ liệu', ...preview });
    }
    const created = await this.prisma.$transaction(async (tx) => {
      const createdRows = [];
      for (const row of preview.rows) {
        createdRows.push(await tx.supplier.create({
          data: this.toSupplierData(row.dto) as Prisma.SupplierUncheckedCreateInput,
          include: this.supplierListInclude(),
        }));
      }
      return createdRows;
    });
    return { created: created.length, rows: maskSupplierFinancialFields(created, user) };
  }

  private listTake(take?: number) {
    return take ?? DEFAULT_SUPPLIERS_TAKE;
  }

  private supplierSearchConditions(contains: InsensitiveContains, user?: RequestUser): Prisma.SupplierWhereInput[] {
    const conditions: Prisma.SupplierWhereInput[] = [
      { supplierCode: contains },
      { name: contains },
      { contactPerson: contains },
      { phone: contains },
      { email: contains },
      { province: contains },
      { market: contains },
    ];
    if (canViewSupplierFinancialFields(user)) conditions.push({ taxCode: contains });
    return conditions;
  }

  private hotelSupplierSearchConditions(contains: InsensitiveContains, user?: RequestUser): Prisma.SupplierWhereInput[] {
    const conditions: Prisma.SupplierWhereInput[] = [
      ...this.supplierSearchConditions(contains, user),
      { address: contains },
      { website: contains },
      { hotelProfile: { is: { hotelProject: contains } } },
      { hotelProfile: { is: { classHotel: contains } } },
      { hotelProfile: { is: { market: contains } } },
      { hotelProfile: { is: { link: contains } } },
      { contacts: { some: { fullName: contains } } },
      { contacts: { some: { position: contains } } },
      { contacts: { some: { phone: contains } } },
      { contacts: { some: { email: contains } } },
      { supplierServices: { some: { deletedAt: null, serviceName: contains } } },
      { supplierServices: { some: { deletedAt: null, sku: contains } } },
      { supplierServices: { some: { deletedAt: null, description: contains } } },
      { supplierServices: { some: { deletedAt: null, note: contains } } },
      { allotments: { some: { serviceName: contains } } },
      { allotments: { some: { sku: contains } } },
      { allotments: { some: { description: contains } } },
      { allotments: { some: { note: contains } } },
    ];
    if (canViewSupplierFinancialFields(user)) {
      conditions.push(
        { hotelProfile: { is: { bankAccountName: contains } } },
        { hotelProfile: { is: { bankAccountNumber: contains } } },
        { hotelProfile: { is: { bankName: contains } } },
      );
    }
    return conditions;
  }

  async getSupplier(id: string, user?: RequestUser) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id },
      include: {
        category: true,
        hotelProfile: true,
        contacts: true,
        supplierServices: { where: { deletedAt: null }, orderBy: SUPPLIER_SERVICE_ORDER_BY },
        allotments: true,
        files: true,
        services: true,
        paymentItems: true,
      },
    });
    if (!supplier || supplier.deletedAt) throw new NotFoundException(SUPPLIER_ERRORS.supplierNotFound);
    return maskSupplierFinancialFields(supplier, user);
  }

  getSupplierFromRouteKey(routeKey: string, user?: RequestUser) {
    if (!SUPPLIER_ID_PATTERN.test(routeKey)) throw new NotFoundException(SUPPLIER_ERRORS.unsupportedType);
    return this.getSupplier(routeKey, user);
  }

  async listSupplierContacts(id: string, user?: RequestUser) {
    await this.getSupplier(id, user);
    return this.prisma.supplierContact.findMany({
      where: { supplierId: id },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createSupplierContact(supplierId: string, dto: SupplierContactInputDto, user?: RequestUser) {
    return maskSupplierFinancialFields(await this.prisma.$transaction(async (tx) => {
      const locked = await this.lockSupplierForStatusWrite(tx, supplierId);
      const [contact] = this.normalizeSupplierContacts([dto]);
      await tx.supplierContact.create({ data: { supplierId, ...contact } });
      return this.rereadSupplierAfterChildWrite(tx, supplierId, locked.hotelProfileId);
    }), user);
  }

  async updateSupplierContact(supplierId: string, contactId: string, dto: UpdateSupplierContactDto, user?: RequestUser) {
    return maskSupplierFinancialFields(await this.prisma.$transaction(async (tx) => {
      const locked = await this.lockSupplierForStatusWrite(tx, supplierId);
      const current = await tx.supplierContact.findFirst({ where: { id: contactId, supplierId } });
      if (!current) throw new NotFoundException('Không tìm thấy người liên hệ nhà cung cấp');
      const [contact] = this.normalizeSupplierContacts([{
        fullName: this.childValue(dto, 'fullName', current.fullName),
        position: this.childValue(dto, 'position', current.position ?? undefined),
        birthday: this.childValue(dto, 'birthday', this.dateOnlyString(current.birthday)),
        phone: this.childValue(dto, 'phone', current.phone ?? undefined),
        email: this.childValue(dto, 'email', current.email ?? undefined),
      }]);
      await tx.supplierContact.update({ where: { id: contactId }, data: contact });
      return this.rereadSupplierAfterChildWrite(tx, supplierId, locked.hotelProfileId);
    }), user);
  }

  async deleteSupplierContact(supplierId: string, contactId: string, user?: RequestUser) {
    return maskSupplierFinancialFields(await this.prisma.$transaction(async (tx) => {
      const locked = await this.lockSupplierForStatusWrite(tx, supplierId);
      const deleted = await tx.supplierContact.deleteMany({ where: { id: contactId, supplierId } });
      if (deleted.count !== 1) throw new NotFoundException('Không tìm thấy người liên hệ nhà cung cấp');
      return this.rereadSupplierAfterChildWrite(tx, supplierId, locked.hotelProfileId);
    }), user);
  }

  async listSupplierServices(id: string, user?: RequestUser) {
    await this.getSupplier(id, user);
    return this.prisma.supplierService.findMany({
      where: { supplierId: id, deletedAt: null },
      orderBy: SUPPLIER_SERVICE_ORDER_BY,
    });
  }

  async createSupplierService(supplierId: string, dto: SupplierChildServiceInputDto, user?: RequestUser) {
    return maskSupplierFinancialFields(await this.prisma.$transaction(async (tx) => {
      const locked = await this.lockSupplierForStatusWrite(tx, supplierId);
      const service = this.normalizeChildSupplierService(locked, dto);
      await tx.supplierService.create({ data: { supplierId, ...service } });
      return this.rereadSupplierAfterChildWrite(tx, supplierId, locked.hotelProfileId);
    }), user);
  }

  async updateSupplierService(supplierId: string, serviceId: string, dto: UpdateSupplierChildServiceInputDto, user?: RequestUser) {
    return maskSupplierFinancialFields(await this.prisma.$transaction(async (tx) => {
      const locked = await this.lockSupplierForStatusWrite(tx, supplierId);
      const current = await tx.supplierService.findFirst({ where: { id: serviceId, supplierId, deletedAt: null } });
      if (!current) throw new NotFoundException('Không tìm thấy dịch vụ nhà cung cấp');
      if (locked.hotelProfileId) await this.ensureServiceHasNoActiveHotelAllocations(tx, supplierId, serviceId);
      const service = this.normalizeChildSupplierService(locked, this.mergeSupplierServiceRow(dto, current));
      await tx.supplierService.update({ where: { id: serviceId }, data: service });
      return this.rereadSupplierAfterChildWrite(tx, supplierId, locked.hotelProfileId);
    }), user);
  }

  async deleteSupplierService(supplierId: string, serviceId: string, user?: RequestUser) {
    return maskSupplierFinancialFields(await this.prisma.$transaction(async (tx) => {
      const locked = await this.lockSupplierForStatusWrite(tx, supplierId);
      const current = await tx.supplierService.findFirst({ where: { id: serviceId, supplierId, deletedAt: null } });
      if (!current) throw new NotFoundException('Không tìm thấy dịch vụ nhà cung cấp');
      if (locked.hotelProfileId) await this.ensureServiceHasNoActiveHotelAllocations(tx, supplierId, serviceId);
      await tx.supplierService.update({ where: { id: serviceId }, data: { deletedAt: new Date(), status: 'INACTIVE' } });
      return this.rereadSupplierAfterChildWrite(tx, supplierId, locked.hotelProfileId);
    }), user);
  }

  async listSupplierFinanceSummaries(ids: string[] = [], user?: RequestUser): Promise<SupplierFinanceSummary[]> {
    this.assertCanViewSupplierFinance(user);
    const supplierIds = this.supplierFinanceIds(ids);
    if (!supplierIds.length) return [];

    const suppliers = await this.prisma.supplier.findMany({
      where: { id: { in: supplierIds }, deletedAt: null },
      select: { id: true },
    });
    const foundIds = new Set(suppliers.map((supplier) => supplier.id));
    const visibleIds = supplierIds.filter((id) => foundIds.has(id));
    if (!visibleIds.length) return [];

    const ledgerWhere = branchDepartmentScopeWhere<Prisma.SupplierLedgerEntryWhereInput>({ supplierId: { in: visibleIds } }, user);
    const paymentWhere = branchDepartmentScopeWhere<Prisma.FinancePaymentWhereInput>({ supplierId: { in: visibleIds }, deletedAt: null }, user);
    const voucherWhere = this.operationVoucherScopeWhere({ supplierId: { in: visibleIds }, deletedAt: null }, user);
    const requestWhere = this.supplierPaymentRequestScopeWhere({}, user);

    const [ledgerRows, paymentRows, voucherRows, requestRows] = await Promise.all([
      this.prisma.supplierLedgerEntry.groupBy({
        by: ['supplierId'],
        where: ledgerWhere,
        _sum: { creditAmount: true, debitAmount: true },
        _count: { _all: true },
      }),
      this.prisma.financePayment.groupBy({
        by: ['supplierId', 'approvalStatus'],
        where: paymentWhere,
        _sum: { totalAmount: true, paymentAmount: true, remainingAmount: true },
        _count: { _all: true },
      }),
      this.prisma.operationVoucher.groupBy({
        by: ['supplierId'],
        where: voucherWhere,
        _sum: { totalAmount: true, paidAmount: true, remainAmount: true },
        _count: { _all: true },
      }),
      this.prisma.supplierPaymentItem.groupBy({
        by: ['supplierId'],
        where: { supplierId: { in: visibleIds }, request: requestWhere },
        _sum: { amount: true },
        _count: { _all: true },
      }),
    ]);

    const ledgerBySupplier = new Map(ledgerRows.map((row) => [row.supplierId, row]));
    const paymentsBySupplier = this.supplierFinanceRowsBySupplier(paymentRows, (row) => row.supplierId);
    const voucherBySupplier = new Map(voucherRows.filter((row) => row.supplierId).map((row) => [row.supplierId as string, row]));
    const requestBySupplier = new Map(requestRows.map((row) => [row.supplierId, row]));

    return visibleIds.map((supplierId) => this.toSupplierFinanceSummary(
      supplierId,
      ledgerBySupplier.get(supplierId),
      paymentsBySupplier.get(supplierId) || [],
      voucherBySupplier.get(supplierId),
      requestBySupplier.get(supplierId),
    ));
  }

  async supplierFinanceSummary(id: string, user?: RequestUser): Promise<SupplierFinanceSummary> {
    const [summary] = await this.listSupplierFinanceSummaries([id], user);
    if (!summary) throw new NotFoundException(SUPPLIER_ERRORS.supplierNotFound);

    const ledgerWhere = branchDepartmentScopeWhere<Prisma.SupplierLedgerEntryWhereInput>({ supplierId: id }, user);
    const paymentWhere = branchDepartmentScopeWhere<Prisma.FinancePaymentWhereInput>({ supplierId: id, deletedAt: null }, user);
    const voucherWhere = this.operationVoucherScopeWhere({ supplierId: id, deletedAt: null }, user);
    const requestWhere = this.supplierPaymentRequestScopeWhere({ items: { some: { supplierId: id } } }, user);

    const [ledgerEntries, payments, operationVouchers, supplierPaymentRequests] = await Promise.all([
      this.prisma.supplierLedgerEntry.findMany({
        where: ledgerWhere,
        select: {
          id: true,
          sourceType: true,
          entryType: true,
          debitAmount: true,
          creditAmount: true,
          documentCode: true,
          documentDate: true,
          dueDate: true,
          description: true,
          orderId: true,
          tourId: true,
          operationVoucherId: true,
          paymentId: true,
          order: { select: { id: true, systemCode: true, tourCode: true, name: true } },
          tour: { select: { id: true, systemCode: true, tourCode: true, name: true } },
          operationVoucher: { select: { id: true, voucherCode: true, status: true, serviceName: true } },
          payment: { select: { id: true, voucherCode: true, approvalStatus: true, paymentAmount: true, paymentDate: true } },
        },
        orderBy: [{ documentDate: 'desc' }, { createdAt: 'desc' }],
        take: 5,
      }),
      this.prisma.financePayment.findMany({
        where: paymentWhere,
        select: { id: true, voucherCode: true, approvalStatus: true, voucherType: true, totalAmount: true, paymentAmount: true, remainingAmount: true, paymentDate: true, operationVoucherId: true, orderId: true, tourId: true },
        orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }],
        take: 5,
      }),
      this.prisma.operationVoucher.findMany({
        where: voucherWhere,
        select: { id: true, voucherCode: true, serviceType: true, serviceName: true, serviceDate: true, status: true, totalAmount: true, paidAmount: true, remainAmount: true, orderId: true, tourId: true, bookingId: true },
        orderBy: [{ serviceDate: 'desc' }, { createdAt: 'desc' }],
        take: 5,
      }),
      this.prisma.supplierPaymentRequest.findMany({
        where: requestWhere,
        select: {
          id: true,
          code: true,
          status: true,
          financePaymentId: true,
          requestedAt: true,
          financePayment: { select: { id: true, voucherCode: true, approvalStatus: true, paymentAmount: true } },
          items: {
            where: { supplierId: id },
            select: { id: true, amount: true, notes: true, cost: { select: { id: true, costName: true } } },
            take: 5,
          },
        },
        orderBy: [{ requestedAt: 'desc' }, { code: 'desc' }],
        take: 5,
      }),
    ]);

    return {
      ...summary,
      recent: {
        ledgerEntries: ledgerEntries as Array<Record<string, unknown>>,
        payments: payments as Array<Record<string, unknown>>,
        operationVouchers: operationVouchers as Array<Record<string, unknown>>,
        supplierPaymentRequests: supplierPaymentRequests as Array<Record<string, unknown>>,
      },
    };
  }

  private assertCanViewSupplierFinance(user?: RequestUser) {
    if (!canViewSupplierFinancialFields(user)) throw new ForbiddenException('Thiếu quyền xem tài chính nhà cung cấp');
  }

  private supplierFinanceIds(ids: string[]) {
    return Array.from(new Set(ids.map((id) => this.optionalText(id, 'Mã nhà cung cấp')).filter((id): id is string => Boolean(id))))
      .slice(0, MAX_SUPPLIER_FINANCE_SUMMARY_IDS);
  }

  private toSupplierFinanceSummary(
    supplierId: string,
    ledger: { _sum?: { creditAmount?: unknown; debitAmount?: unknown }; _count?: { _all?: number } } | undefined,
    paymentRows: Array<{ approvalStatus?: string | null; _sum?: { totalAmount?: unknown; paymentAmount?: unknown; remainingAmount?: unknown }; _count?: { _all?: number } }>,
    voucher: { _sum?: { totalAmount?: unknown; paidAmount?: unknown; remainAmount?: unknown }; _count?: { _all?: number } } | undefined,
    request: { _sum?: { amount?: unknown }; _count?: { _all?: number } } | undefined,
  ): SupplierFinanceSummary {
    const payable = this.financeAmount(ledger?._sum?.creditAmount);
    const paid = this.financeAmount(ledger?._sum?.debitAmount);
    return {
      supplierId,
      summary: {
        payable,
        paid,
        balance: payable - paid,
        ledgerCount: ledger?._count?._all || 0,
      },
      payments: this.supplierFinancePaymentTotals(paymentRows),
      vouchers: {
        count: voucher?._count?._all || 0,
        totalAmount: this.financeAmount(voucher?._sum?.totalAmount),
        paidAmount: this.financeAmount(voucher?._sum?.paidAmount),
        remainingAmount: this.financeAmount(voucher?._sum?.remainAmount),
      },
      paymentRequests: {
        count: request?._count?._all || 0,
        amount: this.financeAmount(request?._sum?.amount),
      },
      links: this.financeLinksForSupplier(supplierId),
    };
  }

  private supplierFinancePaymentTotals(
    rows: Array<{ approvalStatus?: string | null; _sum?: { totalAmount?: unknown; paymentAmount?: unknown; remainingAmount?: unknown }; _count?: { _all?: number } }>,
  ): SupplierFinanceMoneyTotals & { byStatus: Record<string, SupplierFinanceMoneyTotals> } {
    const byStatus: Record<string, SupplierFinanceMoneyTotals> = {};
    const total: SupplierFinanceMoneyTotals & { byStatus: Record<string, SupplierFinanceMoneyTotals> } = {
      count: 0,
      totalAmount: 0,
      paymentAmount: 0,
      remainingAmount: 0,
      byStatus,
    };
    for (const row of rows) {
      const status = row.approvalStatus || 'UNKNOWN';
      const item = {
        count: row._count?._all || 0,
        totalAmount: this.financeAmount(row._sum?.totalAmount),
        paymentAmount: this.financeAmount(row._sum?.paymentAmount),
        remainingAmount: this.financeAmount(row._sum?.remainingAmount),
      };
      byStatus[status] = item;
      total.count += item.count;
      total.totalAmount += item.totalAmount;
      total.paymentAmount += item.paymentAmount;
      total.remainingAmount += item.remainingAmount;
    }
    return total;
  }

  private supplierFinanceRowsBySupplier<T>(rows: T[], supplierIdOf: (row: T) => string | null | undefined) {
    const grouped = new Map<string, T[]>();
    for (const row of rows) {
      const supplierId = supplierIdOf(row);
      if (!supplierId) continue;
      const current = grouped.get(supplierId) || [];
      current.push(row);
      grouped.set(supplierId, current);
    }
    return grouped;
  }

  private financeLinksForSupplier(supplierId: string): SupplierFinanceLinks {
    const encoded = encodeURIComponent(supplierId);
    return {
      financeDebt: '/finance?tab=debt&supplierId=' + encoded,
      financePayments: '/finance?tab=payments&supplierId=' + encoded,
      operationVouchers: '/operation-vouchers?supplierId=' + encoded,
      supplierPaymentRequests: '/operations?tab=payment-requests&supplierId=' + encoded,
    };
  }

  private operationVoucherScopeWhere(where: Prisma.OperationVoucherWhereInput, user?: RequestUser): Prisma.OperationVoucherWhereInput {
    if (!user || hasUnrestrictedDataScope(user)) return where;
    return {
      AND: [
        where,
        {
          OR: [
            { order: { is: branchDepartmentScopeWhere<Prisma.OrderWhereInput>({ deletedAt: null }, user) } },
            { tour: { is: branchDepartmentScopeWhere<Prisma.TourWhereInput>({ deletedAt: null }, user) } },
            { booking: { is: this.supplierFinanceBookingScopeWhere({}, user) } },
          ],
        },
      ],
    };
  }

  private supplierPaymentRequestScopeWhere(where: Prisma.SupplierPaymentRequestWhereInput, user?: RequestUser): Prisma.SupplierPaymentRequestWhereInput {
    if (!user || hasUnrestrictedDataScope(user)) return where;
    const permissions = userPermissions(user);
    if (this.hasMissingSupplierFinanceReadScopeValue(permissions, user)) return { AND: [where, { id: '__no_data_scope__' }] };
    const financeScope: Prisma.FinancePaymentWhereInput = {};
    const formScopes: Prisma.OperationFormWhereInput[] = [];
    if (permissions.has('data.scope.branch') && user.branch) {
      financeScope.branch = user.branch;
      formScopes.push(this.supplierFinanceOperationFormBranchScope(user.branch));
    }
    if (permissions.has('data.scope.department') && user.department) {
      financeScope.department = user.department;
      formScopes.push(this.supplierFinanceOperationFormDepartmentScope(user.department));
    }
    if (!formScopes.length && !Object.keys(financeScope).length) return { AND: [where, { id: '__no_data_scope__' }] };
    const formScope: Prisma.OperationFormWhereInput = formScopes.length ? { AND: formScopes } : {};
    return {
      AND: [
        where,
        {
          OR: [
            { financePayment: financeScope },
            { items: { some: { cost: { operationForm: formScope } } } },
          ],
        },
      ],
    };
  }

  private supplierFinanceBookingScopeWhere(where: Prisma.BookingWhereInput, user?: RequestUser): Prisma.BookingWhereInput {
    if (!user || hasUnrestrictedDataScope(user)) return where;
    const permissions = userPermissions(user);
    if (this.hasMissingSupplierFinanceReadScopeValue(permissions, user)) return { AND: [where, { id: '__no_data_scope__' }] };
    const AND: Prisma.BookingWhereInput[] = [where];
    if (permissions.has('data.scope.branch') && user.branch) AND.push({ OR: [{ customer: { branch: user.branch } }, { order: { branch: user.branch } }, { tour: { branch: user.branch } }] });
    if (permissions.has('data.scope.department') && user.department) AND.push({ OR: [{ customer: { department: user.department } }, { order: { department: user.department } }, { tour: { department: user.department } }] });
    if (AND.length === 1) return { AND: [where, { id: '__no_data_scope__' }] };
    return { AND };
  }

  private supplierFinanceOperationFormBranchScope(branch: string): Prisma.OperationFormWhereInput {
    return { OR: [{ booking: { customer: { branch } } }, { order: { branch } }, { tour: { branch } }] };
  }

  private supplierFinanceOperationFormDepartmentScope(department: string): Prisma.OperationFormWhereInput {
    return { OR: [{ booking: { customer: { department } } }, { order: { department } }, { tour: { department } }] };
  }

  private hasMissingSupplierFinanceReadScopeValue(permissions: Set<string>, user: RequestUser) {
    return (permissions.has('data.scope.branch') && !user.branch) || (permissions.has('data.scope.department') && !user.department);
  }

  private financeAmount(value: unknown) {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'object' && 'toNumber' in value && typeof (value as { toNumber: () => number }).toNumber === 'function') {
      return (value as { toNumber: () => number }).toNumber();
    }
    const amount = Number(value);
    return Number.isFinite(amount) ? amount : 0;
  }

  async createSupplier(dto: CreateSupplierDto, user?: RequestUser) {
    this.validateSupplierPayload(dto);
    this.assertCanWriteSupplierFinancialFields(dto, user);
    await this.ensureCategory(dto.categoryId);
    await this.ensureSupplierCodeAvailable(dto.supplierCode);
    try {
      return maskSupplierFinancialFields(await this.prisma.supplier.create({
        data: this.toSupplierData(dto) as Prisma.SupplierUncheckedCreateInput,
        include: this.supplierListInclude(),
      }), user);
    } catch (error) {
      this.rethrowSupplierUniqueConflict(error);
    }
  }

  async updateSupplier(id: string, dto: UpdateSupplierDto, user?: RequestUser) {
    const current = await this.getSupplier(id, user);
    this.validateSupplierPayload(dto, true);
    this.assertCanWriteSupplierFinancialFields(dto, user);
    if (dto.categoryId) {
      await this.ensureCategory(dto.categoryId);
      if (dto.categoryId !== current.categoryId && this.isSpecializedSupplier(current)) {
        throw new BadRequestException('Không thể đổi loại của nhà cung cấp chuyên biệt tại màn hình nhà cung cấp tổng. Hãy cập nhật trong phân hệ tương ứng.');
      }
    }
    if (dto.supplierCode !== undefined) await this.ensureSupplierCodeAvailable(dto.supplierCode, id);
    try {
      return maskSupplierFinancialFields(await this.prisma.$transaction(async (tx) => {
        const locked = await this.lockSupplierForStatusWrite(tx, id);
        const statusChange = this.requestedSupplierStatusChange(locked.status, dto.status);
        if (statusChange === SupplierStatus.INACTIVE && locked.hotelProfileId) {
          await this.ensureHotelSupplierCanDeactivate(tx, id);
        }
        return tx.supplier.update({
          where: { id },
          data: this.toSupplierData(dto) as Prisma.SupplierUncheckedUpdateInput,
          include: this.supplierListInclude(),
        });
      }), user);
    } catch (error) {
      this.rethrowSupplierUniqueConflict(error);
    }
  }

  async deleteSupplier(id: string, user?: RequestUser) {
    await this.getSupplier(id, user);
    return maskSupplierFinancialFields(await this.deleteSupplierRecord(id), user);
  }

  async addSupplierFile(id: string, file: UploadFile | undefined, actorId?: string, user?: RequestUser) {
    await this.getSupplier(id, user);
    const uploadedBy = this.requiredText(actorId, 'Không xác định được người tải file');
    const upload = await this.filesService.upload(file, `suppliers/${id}`, uploadedBy);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.lockSupplierForStatusWrite(tx, id);
        return tx.supplierFile.create({
          data: {
            supplierId: id,
            fileName: upload.fileName,
            fileUrl: upload.url,
            fileType: upload.mimeType,
            uploadedBy,
          },
        });
      });
    } catch (error) {
      try {
        await this.filesService.remove(upload.objectKey);
      } catch {
        throw new InternalServerErrorException('Không thể lưu thông tin file và không thể hoàn tác file trên kho lưu trữ');
      }
      throw error;
    }
  }

  async deleteSupplierFile(id: string, fileId: string, user?: RequestUser) {
    await this.getSupplier(id, user);
    const { file, objectKey } = await this.prisma.$transaction(async (tx) => {
      await this.lockSupplierForStatusWrite(tx, id);
      const file = await tx.supplierFile.findFirst({ where: { id: fileId, supplierId: id } });
      if (!file) throw new NotFoundException(SUPPLIER_ERRORS.fileNotFound);
      const objectKey = this.filesService.objectKeyFromUrl(file.fileUrl);
      if (!objectKey) throw new InternalServerErrorException('Không xác định được khóa lưu trữ của file nhà cung cấp');
      const deleted = await tx.supplierFile.deleteMany({ where: { id: fileId, supplierId: id } });
      if (deleted.count !== 1) throw new NotFoundException(SUPPLIER_ERRORS.fileNotFound);
      return { file, objectKey };
    });
    try {
      await this.filesService.removeIfPresent(objectKey);
      return file;
    } catch (error) {
      try {
        await this.prisma.supplierFile.create({
          data: {
            id: file.id,
            supplierId: file.supplierId,
            fileName: file.fileName,
            fileUrl: file.fileUrl,
            fileType: file.fileType,
            uploadedBy: file.uploadedBy,
            createdAt: file.createdAt,
          },
        });
      } catch {
        throw new InternalServerErrorException('Xóa file trên kho lưu trữ thất bại và không thể khôi phục thông tin file nhà cung cấp');
      }
      throw error;
    }
  }

  async updateSupplierStatus(id: string, status: SupplierStatus, user?: RequestUser) {
    const nextStatus = this.toSupplierStatus(status);
    return maskSupplierFinancialFields(await this.prisma.$transaction(async (tx) => {
      const supplier = await this.lockSupplierForStatusWrite(tx, id);
      this.ensureSupplierStatusTransition(supplier.status, nextStatus);
      if (supplier.hotelProfileId && nextStatus === SupplierStatus.INACTIVE) {
        await this.ensureHotelSupplierCanDeactivate(tx, id);
      }
      return tx.supplier.update({
        where: { id },
        data: { status: nextStatus },
        include: { ...this.supplierListInclude(), hotelProfile: true },
      });
    }), user);
  }

  async listTypedSuppliers(type: string, query: TypedSupplierListQueryDto = {}, user?: RequestUser) {
    const typedRoute = this.getTypedRoute(type);
    const categoryNames = supplierTypeCategoryNames(typedRoute);
    const searchText = normalizeListSearch(query.search);
    const contains = searchText ? containsSearch(searchText) : undefined;
    const province = this.optionalLabel(query.province);
    const market = this.optionalLabel(query.market);
    const where: Prisma.SupplierWhereInput = {
      deletedAt: null,
      category: { name: { in: categoryNames, mode: 'insensitive' } },
      ...(province ? { province: { contains: province, mode: 'insensitive' } } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(market ? { market: { contains: market, mode: 'insensitive' } } : {}),
      ...(contains
        ? {
            OR: [
              ...this.supplierSearchConditions(contains, user),
              { contacts: { some: { fullName: contains } } },
              { contacts: { some: { position: contains } } },
              { contacts: { some: { phone: contains } } },
              { contacts: { some: { email: contains } } },
              { supplierServices: { some: { deletedAt: null, serviceName: contains } } },
              { supplierServices: { some: { deletedAt: null, sku: contains } } },
              { supplierServices: { some: { deletedAt: null, description: contains } } },
              { supplierServices: { some: { deletedAt: null, note: contains } } },
            ],
          }
        : {}),
    };

    const suppliers = await this.prisma.supplier.findMany({
      where,
      include: this.genericListInclude(),
      take: this.listTake(query.take ?? query.limit),
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }, { name: 'asc' }],
    });
    return maskSupplierFinancialFields(suppliers, user);
  }

  async getTypedSupplier(type: string, id: string, user?: RequestUser) {
    const typedRoute = this.getTypedRoute(type);
    const supplier = await this.ensureTypedSupplier(typedRoute, id);
    return maskSupplierFinancialFields(supplier, user);
  }

  async createTypedSupplier(type: string, dto: CreateGenericSupplierDto, user?: RequestUser) {
    const typedRoute = this.getTypedRoute(type);
    this.validateSupplierPayload(dto, false, false);
    this.assertCanWriteSupplierFinancialFields(dto, user);
    this.validateSpecializedSupplierIdentity(dto);
    this.validateTypedSupplierPayload(typedRoute, dto);
    const category = await this.ensureCategoryByName(getTypeLabel(typedRoute));
    await this.ensureSupplierCodeAvailable(dto.supplierCode);
    try {
      return maskSupplierFinancialFields(await this.prisma.$transaction(async (tx) => {
        const supplier = await tx.supplier.create({
          data: {
            ...this.toSupplierData(dto),
            category: { connect: { id: category.id } },
          } as Prisma.SupplierCreateInput,
        });
        await this.replaceGenericChildren(tx, supplier.id, dto, typedRoute);
        return tx.supplier.findUniqueOrThrow({ where: { id: supplier.id }, include: this.genericInclude() });
      }), user);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(SUPPLIER_ERRORS.codeExists);
      }
      throw error;
    }
  }

  async updateTypedSupplier(type: string, id: string, dto: UpdateGenericSupplierDto, user?: RequestUser) {
    const typedRoute = this.getTypedRoute(type);
    await this.ensureTypedSupplier(typedRoute, id);
    this.validateSupplierPayload(dto, true, false);
    this.assertCanWriteSupplierFinancialFields(dto, user);
    this.validateSpecializedSupplierIdentity(dto, true);
    this.validateTypedSupplierPayload(typedRoute, dto);
    if (dto.supplierCode !== undefined) await this.ensureSupplierCodeAvailable(dto.supplierCode, id);
    try {
      return maskSupplierFinancialFields(await this.prisma.$transaction(async (tx) => {
        const locked = await this.lockSupplierForStatusWrite(tx, id);
        this.requestedSupplierStatusChange(locked.status, dto.status);
        await tx.supplier.update({
          where: { id },
          data: this.toSupplierData(dto) as Prisma.SupplierUncheckedUpdateInput,
        });
        await this.replaceGenericChildren(tx, id, dto, typedRoute);
        return tx.supplier.findUniqueOrThrow({ where: { id }, include: this.genericInclude() });
      }), user);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(SUPPLIER_ERRORS.codeExists);
      }
      throw error;
    }
  }

  async updateTypedSupplierStatus(type: string, id: string, status: SupplierStatus, user?: RequestUser) {
    const typedRoute = this.getTypedRoute(type);
    await this.ensureTypedSupplier(typedRoute, id);
    const nextStatus = this.toSupplierStatus(status);
    return maskSupplierFinancialFields(await this.prisma.$transaction(async (tx) => {
      const locked = await this.lockSupplierForStatusWrite(tx, id);
      this.ensureSupplierStatusTransition(locked.status, nextStatus);
      return tx.supplier.update({
        where: { id },
        data: { status: nextStatus },
        include: this.genericInclude(),
      });
    }), user);
  }

  async deleteTypedSupplier(type: string, id: string, user?: RequestUser) {
    const typedRoute = this.getTypedRoute(type);
    await this.ensureTypedSupplier(typedRoute, id);
    return maskSupplierFinancialFields(await this.deleteSupplierRecord(id), user);
  }

  async listHotelSuppliers(query: HotelSupplierListQueryDto = {}, user?: RequestUser) {
    const searchText = normalizeListSearch(query.search);
    const contains = searchText ? containsSearch(searchText) : undefined;
    const province = this.optionalLabel(query.province);
    const market = this.optionalLabel(query.market);
    const hotelProject = this.optionalLabel(query.hotelProject);
    const classHotel = this.optionalLabel(query.classHotel);
    const where: Prisma.SupplierWhereInput = {
      deletedAt: null,
      hotelProfile: {
        is: {
          ...(hotelProject ? { hotelProject: { contains: hotelProject, mode: 'insensitive' } } : {}),
          ...(classHotel ? { classHotel: { contains: classHotel, mode: 'insensitive' } } : {}),
          ...(market ? { market: { contains: market, mode: 'insensitive' } } : {}),
        },
      },
      ...(province ? { province: { contains: province, mode: 'insensitive' } } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(contains
        ? {
            OR: this.hotelSupplierSearchConditions(contains, user),
          }
        : {}),
    };

    const suppliers = await this.prisma.supplier.findMany({
      where,
      include: this.hotelListInclude(),
      take: this.listTake(query.take ?? query.limit),
      orderBy: [{ updatedAt: 'desc' }, { name: 'asc' }],
    });
    return maskSupplierFinancialFields(suppliers, user);
  }

  async getHotelSupplier(id: string, user?: RequestUser) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, deletedAt: null, hotelProfile: { isNot: null } },
      include: this.hotelInclude(),
    });
    if (!supplier) throw new NotFoundException(SUPPLIER_ERRORS.hotelSupplierNotFound);
    return maskSupplierFinancialFields(supplier, user);
  }

  async createHotelSupplier(dto: CreateHotelSupplierDto, user?: RequestUser) {
    this.validateSupplierPayload(dto, false, false);
    this.assertCanWriteSupplierFinancialFields(dto, user);
    this.validateSpecializedSupplierIdentity(dto);
    this.validateHotelProfilePayload(dto);
    const category = await this.ensureCategoryByName(HOTEL_SUPPLIER_CATEGORY_NAME);
    await this.ensureSupplierCodeAvailable(dto.supplierCode);
    try {
      return maskSupplierFinancialFields(await this.prisma.$transaction(async (tx) => {
        const supplier = await tx.supplier.create({
          data: {
            ...this.toSupplierData({
              supplierCode: dto.supplierCode,
              name: dto.name,
              taxCode: dto.taxCode,
              phone: dto.phone,
              email: dto.email,
              country: dto.country,
              province: dto.province,
              address: dto.address,
              website: dto.website,
              notes: dto.notes,
              status: dto.status,
            }),
            category: { connect: { id: category.id } },
            hotelProfile: { create: this.toHotelProfileData(dto) },
          } as Prisma.SupplierCreateInput,
        });

        await this.replaceHotelChildren(tx, supplier.id, dto);
        return tx.supplier.findUniqueOrThrow({ where: { id: supplier.id }, include: this.hotelInclude() });
      }), user);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(SUPPLIER_ERRORS.codeExists);
      }
      throw error;
    }
  }

  async updateHotelSupplier(id: string, dto: UpdateHotelSupplierDto, user?: RequestUser) {
    await this.getHotelSupplier(id, user);
    this.validateSupplierPayload(dto, true, false);
    this.assertCanWriteSupplierFinancialFields(dto, user);
    this.validateSpecializedSupplierIdentity(dto, true);
    this.validateHotelProfilePayload(dto, true);
    if (dto.supplierCode !== undefined) await this.ensureSupplierCodeAvailable(dto.supplierCode, id);
    const hotelProfileData = this.toHotelProfileData(dto);
    try {
      return maskSupplierFinancialFields(await this.prisma.$transaction(async (tx) => {
        const locked = await this.lockSupplierForStatusWrite(tx, id);
        const statusChange = this.requestedSupplierStatusChange(locked.status, dto.status);
        if (statusChange === SupplierStatus.INACTIVE && locked.hotelProfileId) {
          await this.ensureHotelSupplierCanDeactivate(tx, id);
        }
        await tx.supplier.update({
          where: { id },
          data: {
            ...this.toSupplierData(dto),
            ...(Object.keys(hotelProfileData).length ? { hotelProfile: { update: hotelProfileData } } : {}),
          } as Prisma.SupplierUncheckedUpdateInput,
        });

        await this.replaceHotelChildren(tx, id, dto);
        return tx.supplier.findUniqueOrThrow({ where: { id }, include: this.hotelInclude() });
      }), user);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(SUPPLIER_ERRORS.codeExists);
      }
      throw error;
    }
  }

  async allotmentDashboard() {
    const today = this.startOfUtcDay(new Date());
    const allotments = await this.prisma.supplierAllotment.findMany({
      where: {
        status: { in: ['ACTIVE', 'STOP_SELL'] },
        supplier: { is: { deletedAt: null, status: 'ACTIVE' } },
        OR: [{ endDate: null }, { endDate: { gte: today } }],
      },
      select: {
        allotmentQty: true,
        bookedQty: true,
        lockedQty: true,
        quantityLock: true,
        cutoffDays: true,
        startDate: true,
        sellingPricePerDay: true,
        status: true,
      },
    });
    const totals = allotments.reduce(
      (acc, item) => {
        const metrics = this.allotmentMetrics(item);
        const codLockUntil = new Date(today);
        codLockUntil.setUTCDate(codLockUntil.getUTCDate() + item.cutoffDays);
        acc.allotmentQty += metrics.allotmentQty;
        acc.bookedQty += metrics.bookedQty;
        acc.lockedQty += metrics.lockedQty;
        const remainingQty = metrics.remainingQty;
        acc.remainingQty += remainingQty;
        acc.revenue += metrics.bookedQty * Number(item.sellingPricePerDay || 0);
        const isSellable = item.status === 'ACTIVE' && remainingQty > 0;
        const isCodLocked = isSellable && Boolean(item.startDate && item.startDate <= codLockUntil);
        const computedStatus = item.status === 'STOP_SELL'
          ? 'STOP_SELL'
          : !isSellable
            ? 'STOP_SELL'
            : isCodLocked
              ? 'COD_LOCKED'
              : 'ACTIVE';
        acc.activeAllotments += computedStatus === 'ACTIVE' ? 1 : 0;
        acc.stopSellAllotments += computedStatus === 'STOP_SELL' ? 1 : 0;
        acc.codLockedAllotments += computedStatus === 'COD_LOCKED' ? 1 : 0;
        return acc;
      },
      { allotmentQty: 0, bookedQty: 0, lockedQty: 0, remainingQty: 0, revenue: 0, activeAllotments: 0, stopSellAllotments: 0, codLockedAllotments: 0 },
    );
    return {
      ...totals,
      allotmentCount: allotments.length,
      occupancyRate: this.percent(totals.bookedQty, totals.allotmentQty),
      sellThroughRate: this.percent(totals.bookedQty + totals.lockedQty, totals.allotmentQty),
    };
  }

  async listAllotmentInventory(query: { supplierId?: string; startDate?: string; endDate?: string }, user?: RequestUser) {
    const startDate = query.startDate ? this.parseDateOnly(query.startDate, 'Ngày bắt đầu') : null;
    const endDate = query.endDate ? this.parseDateOnly(query.endDate, 'Ngày kết thúc') : null;
    if (startDate && endDate && startDate > endDate) {
      throw new BadRequestException('Ngày bắt đầu không được sau ngày kết thúc');
    }
    const today = this.startOfUtcDay(new Date());
    const allotments = await this.prisma.supplierAllotment.findMany({
      where: {
        supplier: { is: { deletedAt: null } },
        ...(query.supplierId ? { supplierId: query.supplierId } : {}),
        ...(startDate || endDate
          ? {
              AND: [
                endDate ? { OR: [{ startDate: null }, { startDate: { lte: endDate } }] } : {},
                startDate ? { OR: [{ endDate: null }, { endDate: { gte: startDate } }] } : {},
              ],
            }
          : {}),
      },
      include: {
        supplier: true,
        logs: { orderBy: { createdAt: 'desc' }, take: 5 },
        allocations: { where: this.allotmentAllocationScopeWhere({}, user), orderBy: { createdAt: 'desc' } },
      },
      orderBy: [{ startDate: 'asc' }, { updatedAt: 'desc' }],
    });
    return allotments.map((item) => this.toAllotmentInventory(item, today));
  }

  async overrideAllotment(id: string, dto: OverrideAllotmentDto, user?: RequestUser) {
    const reason = this.requiredText(dto.note, 'Cần nhập lý do điều chỉnh quỹ phòng');
    const actor = this.requiredText(this.actorFrom(dto.actor, user) || undefined, 'Không xác định được người thực hiện');
    if (!hasUnrestrictedDataScope(user)) {
      throw new ForbiddenException('Thiếu quyền điều chỉnh quỹ phòng ngoài phạm vi dữ liệu');
    }
    if (dto.allotmentQty === undefined && dto.bookedQty === undefined && dto.lockedQty === undefined && dto.status === undefined) {
      throw new BadRequestException('Cần chọn ít nhất một giá trị quỹ phòng để điều chỉnh');
    }
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{
        id: string;
        supplierId: string;
        allotmentQty: number;
        bookedQty: number;
        lockedQty: number;
        status: string;
      }>>(Prisma.sql`
        SELECT id, "supplierId", "allotmentQty", "bookedQty", "lockedQty", status
        FROM "SupplierAllotment"
        WHERE id = ${id}
        FOR UPDATE
      `);
      const current = rows[0];
      if (!current) throw new NotFoundException(SUPPLIER_ERRORS.allotmentNotFound);
      const activeAllocations = await tx.supplierAllotmentAllocation.count({
        where: { allotmentId: id, status: { in: ['LOCKED', 'CONFIRMED'] } },
      });
      if (activeAllocations > 0 && (dto.bookedQty !== undefined || dto.lockedQty !== undefined)) {
        throw new ConflictException('Không thể điều chỉnh trực tiếp số lượng đã bán hoặc đang khóa khi còn phân bổ quỹ phòng hoạt động');
      }
      const nextStatus = dto.status === undefined ? current.status : this.toAllotmentStatus(dto.status);
      if (activeAllocations > 0 && nextStatus === 'INACTIVE') {
        throw new ConflictException('Không thể ngừng quỹ phòng khi còn phân bổ đang khóa hoặc đã xác nhận');
      }
      const next = {
        allotmentQty: dto.allotmentQty ?? current.allotmentQty,
        bookedQty: dto.bookedQty ?? current.bookedQty,
        lockedQty: dto.lockedQty ?? current.lockedQty,
        status: nextStatus,
      };
      const changes = this.allotmentChanges(current, next);
      if (!changes.length) {
        throw new BadRequestException('Không có giá trị quỹ phòng nào thay đổi');
      }
      if (next.bookedQty + next.lockedQty > next.allotmentQty) {
        throw new BadRequestException('Số lượng đã đặt cộng số lượng đã khóa không được vượt quá tổng quỹ phòng');
      }
      const updated = await tx.supplierAllotment.update({
        where: { id },
        data: { ...next, quantityLock: next.lockedQty },
        select: { id: true },
      });
      await tx.supplierAllotmentLog.create({
        data: {
          allotmentId: id,
          supplierId: current.supplierId,
          action: 'OVERRIDE',
          oldValue: { allotmentQty: current.allotmentQty, bookedQty: current.bookedQty, lockedQty: current.lockedQty, status: current.status, changes: changes.map((change) => ({ field: change.field, value: change.oldValue })) },
          newValue: { ...next, changes: changes.map((change) => ({ field: change.field, value: change.newValue })) },
          note: reason,
          actor,
        },
      });
      return this.allotmentInventoryById(tx, updated.id, user);
    });
  }

  async lockAllotment(id: string, dto: LockAllotmentDto, user?: RequestUser) {
    const quantity = dto.quantity ?? 1;
    if (!Number.isInteger(quantity) || quantity <= 0) throw new BadRequestException('Số phòng giữ chỗ phải lớn hơn 0');
    const actor = this.requiredText(this.actorFrom(dto.actor, user) || undefined, 'Không xác định được người thực hiện');
    await this.ensureAllocationLinks(dto, user);
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.supplierAllotment.findUnique({ where: { id } });
      if (!current) throw new NotFoundException(SUPPLIER_ERRORS.allotmentNotFound);
      await this.lockSupplierForAllotmentWrite(tx, current.supplierId);
      if (current.status !== 'ACTIVE') throw new BadRequestException('Quỹ phòng chưa ở trạng thái hoạt động');
      const today = this.startOfUtcDay(new Date());
      if (current.endDate && current.endDate < today) {
        throw new BadRequestException('Quỹ phòng đã hết thời gian áp dụng');
      }
      const codLockUntil = new Date(today);
      codLockUntil.setUTCDate(codLockUntil.getUTCDate() + current.cutoffDays);
      if (current.startDate && current.startDate <= codLockUntil) {
        throw new BadRequestException('Quỹ phòng đã tới hạn chốt và không thể giữ chỗ');
      }
      if (dto.serviceId && current.serviceId && dto.serviceId !== current.serviceId) {
        throw new BadRequestException('Dịch vụ không khớp với quỹ phòng');
      }
      if (dto.serviceId) {
        const service = await tx.supplierService.findFirst({
          where: { id: dto.serviceId, supplierId: current.supplierId, deletedAt: null },
          select: { id: true },
        });
        if (!service) throw new BadRequestException('Dịch vụ giữ chỗ không thuộc nhà cung cấp khách sạn hoặc đã bị xóa');
      }
      const reservedRows = await tx.$queryRaw<Array<{ supplierId: string; bookedQty: number; lockedQty: number }>>(Prisma.sql`
        UPDATE "SupplierAllotment"
        SET "lockedQty" = "lockedQty" + ${quantity},
            "quantityLock" = "lockedQty" + ${quantity},
            "updatedAt" = NOW()
        WHERE id = ${id}
          AND status = 'ACTIVE'
          AND "bookedQty" + "lockedQty" + ${quantity} <= "allotmentQty"
        RETURNING "supplierId", "bookedQty", "lockedQty"
      `);
      const reserved = reservedRows[0];
      if (!reserved) {
        const latest = await tx.supplierAllotment.findUnique({ where: { id }, select: { status: true } });
        if (!latest) throw new NotFoundException(SUPPLIER_ERRORS.allotmentNotFound);
        if (latest.status !== 'ACTIVE') throw new BadRequestException('Quỹ phòng chưa ở trạng thái hoạt động');
        throw new ConflictException('Số lượng quỹ phòng còn lại không đủ');
      }
      const allocation = await tx.supplierAllotmentAllocation.create({
        data: {
          allotmentId: id,
          supplierId: reserved.supplierId,
          serviceId: this.optionalText(dto.serviceId) ?? current.serviceId,
          orderId: this.optionalText(dto.orderId),
          bookingId: this.optionalText(dto.bookingId),
          tourId: this.optionalText(dto.tourId),
          quantity,
          status: 'LOCKED',
          lockedAt: new Date(),
          note: this.optionalText(dto.note),
          createdBy: actor,
        },
      });
      await tx.supplierAllotmentLog.create({
        data: {
          allotmentId: id,
          supplierId: reserved.supplierId,
          action: 'LOCK',
          oldValue: { lockedQty: reserved.lockedQty - quantity },
          newValue: {
            allocationId: allocation.id,
            quantity,
            lockedQty: reserved.lockedQty,
            orderId: allocation.orderId,
            bookingId: allocation.bookingId,
            tourId: allocation.tourId,
          },
          note: this.optionalText(dto.note),
          actor,
        },
      });
      const inventory = await this.allotmentInventoryById(tx, id, user);
      return { allocation, inventory };
    });
  }

  async confirmAllotmentAllocation(id: string, dto: ReleaseAllotmentDto, user?: RequestUser) {
    return this.changeAllotmentAllocation(id, 'CONFIRMED', dto, user);
  }

  async releaseAllotmentAllocation(id: string, dto: ReleaseAllotmentDto, user?: RequestUser) {
    return this.changeAllotmentAllocation(id, 'RELEASED', dto, user);
  }

  private async changeAllotmentAllocation(id: string, nextStatus: 'CONFIRMED' | 'RELEASED', dto: ReleaseAllotmentDto, user?: RequestUser) {
    const scopedAllocation = await this.prisma.supplierAllotmentAllocation.findFirst({
      where: this.allotmentAllocationScopeWhere({ id }, user),
      select: { id: true },
    });
    if (!scopedAllocation) throw new NotFoundException(SUPPLIER_ERRORS.allocationNotFound);
    const reason = nextStatus === 'RELEASED'
      ? this.requiredText(dto.note, 'Cần nhập lý do giải phóng phân bổ quỹ phòng')
      : this.optionalText(dto.note);
    const actor = this.requiredText(this.actorFrom(dto.actor, user) || undefined, 'Không xác định được người thực hiện');

    return this.prisma.$transaction(async (tx) => {
      let previousStatus: 'LOCKED' | 'CONFIRMED' | null = null;
      if (nextStatus === 'CONFIRMED') {
        const transition = await tx.supplierAllotmentAllocation.updateMany({
          where: { id, status: 'LOCKED' },
          data: { status: 'CONFIRMED', confirmedAt: new Date(), note: reason ?? undefined },
        });
        if (transition.count === 1) previousStatus = 'LOCKED';
      } else {
        const lockedTransition = await tx.supplierAllotmentAllocation.updateMany({
          where: { id, status: 'LOCKED' },
          data: { status: 'RELEASED', releasedAt: new Date(), note: reason },
        });
        if (lockedTransition.count === 1) previousStatus = 'LOCKED';
        if (!previousStatus) {
          const confirmedTransition = await tx.supplierAllotmentAllocation.updateMany({
            where: { id, status: 'CONFIRMED' },
            data: { status: 'RELEASED', releasedAt: new Date(), note: reason },
          });
          if (confirmedTransition.count === 1) previousStatus = 'CONFIRMED';
        }
      }

      const allocation = await tx.supplierAllotmentAllocation.findUnique({ where: { id } });
      if (!allocation) throw new NotFoundException(SUPPLIER_ERRORS.allocationNotFound);
      if (!previousStatus) {
        if (allocation.status === nextStatus) {
          const inventory = await this.allotmentInventoryById(tx, allocation.allotmentId, user);
          return { allocation, inventory, idempotent: true };
        }
        if (nextStatus === 'CONFIRMED') throw new ConflictException('Chỉ phân bổ đang khóa mới được xác nhận');
        throw new ConflictException('Không thể giải phóng phân bổ ở trạng thái hiện tại');
      }

      const inventoryUpdate = previousStatus === 'LOCKED' && nextStatus === 'CONFIRMED'
        ? await tx.supplierAllotment.updateMany({
            where: { id: allocation.allotmentId, lockedQty: { gte: allocation.quantity } },
            data: { lockedQty: { decrement: allocation.quantity }, bookedQty: { increment: allocation.quantity } },
          })
        : previousStatus === 'LOCKED'
          ? await tx.supplierAllotment.updateMany({
              where: { id: allocation.allotmentId, lockedQty: { gte: allocation.quantity } },
              data: { lockedQty: { decrement: allocation.quantity } },
            })
          : await tx.supplierAllotment.updateMany({
              where: { id: allocation.allotmentId, bookedQty: { gte: allocation.quantity } },
              data: { bookedQty: { decrement: allocation.quantity } },
            });
      if (inventoryUpdate.count !== 1) {
        throw new ConflictException('Số lượng quỹ phòng không nhất quán với trạng thái phân bổ');
      }
      await tx.$executeRaw`
        UPDATE "SupplierAllotment"
        SET "quantityLock" = "lockedQty"
        WHERE id = ${allocation.allotmentId}
      `;

      await tx.supplierAllotmentLog.create({
        data: {
          allotmentId: allocation.allotmentId,
          supplierId: allocation.supplierId,
          action: nextStatus,
          oldValue: { allocationId: id, status: previousStatus },
          newValue: { allocationId: id, status: nextStatus, quantity: allocation.quantity },
          note: reason,
          actor,
        },
      });
      const inventory = await this.allotmentInventoryById(tx, allocation.allotmentId, user);
      return { allocation, inventory, idempotent: false };
    });
  }

  private async ensureAllocationLinks(dto: LockAllotmentDto, user?: RequestUser) {
    if (user && !hasUnrestrictedDataScope(user) && !dto.orderId && !dto.bookingId && !dto.tourId) {
      throw new BadRequestException('Người dùng bị giới hạn phạm vi dữ liệu phải liên kết thao tác giữ chỗ với đơn hàng, booking hoặc tour');
    }
    if (dto.serviceId) await this.ensureExists('supplierService', dto.serviceId, 'Không tìm thấy dịch vụ nhà cung cấp', user);
    if (dto.orderId) await this.ensureExists('order', dto.orderId, 'Không tìm thấy đơn hàng', user);
    if (dto.bookingId) await this.ensureExists('booking', dto.bookingId, 'Không tìm thấy booking', user);
    if (dto.tourId) await this.ensureExists('tour', dto.tourId, 'Không tìm thấy tour', user);
  }

  private async ensureExists(model: 'supplierService' | 'order' | 'booking' | 'tour', id: string, message: string, user?: RequestUser) {
    const row =
      model === 'supplierService'
        ? await this.prisma.supplierService.findFirst({ where: { id, deletedAt: null }, select: { id: true } })
        : model === 'order'
          ? await this.prisma.order.findFirst({ where: branchDepartmentScopeWhere<Prisma.OrderWhereInput>({ id, deletedAt: null }, user), select: { id: true } })
        : model === 'booking'
            ? await this.prisma.booking.findFirst({ where: this.bookingScopeWhere({ id }, user), select: { id: true } })
            : await this.prisma.tour.findFirst({ where: branchDepartmentScopeWhere<Prisma.TourWhereInput>({ id, deletedAt: null }, user), select: { id: true } });
    if (!row) throw new NotFoundException(message);
  }

  private allotmentAllocationScopeWhere(where: Prisma.SupplierAllotmentAllocationWhereInput, user?: RequestUser): Prisma.SupplierAllotmentAllocationWhereInput {
    if (!user || hasUnrestrictedDataScope(user)) return where;
    return {
      AND: [
        where,
        {
          OR: [
            { order: { is: branchDepartmentScopeWhere<Prisma.OrderWhereInput>({ deletedAt: null }, user) } },
            { booking: { is: this.bookingScopeWhere({}, user) } },
            { tour: { is: branchDepartmentScopeWhere<Prisma.TourWhereInput>({ deletedAt: null }, user) } },
          ],
        },
      ],
    };
  }

  private bookingScopeWhere(where: Prisma.BookingWhereInput, user?: RequestUser): Prisma.BookingWhereInput {
    if (!user || hasUnrestrictedDataScope(user)) return where;
    return {
      AND: [
        where,
        {
          OR: [
            { customer: { is: branchDepartmentScopeWhere<Prisma.CustomerWhereInput>({ mergedIntoId: null }, user) } },
            { order: { is: branchDepartmentScopeWhere<Prisma.OrderWhereInput>({ deletedAt: null }, user) } },
            { tour: { is: branchDepartmentScopeWhere<Prisma.TourWhereInput>({ deletedAt: null }, user) } },
          ],
        },
      ],
    };
  }

  private async ensureCategoryNameAvailable(name: string, excludedId?: string) {
    const normalizedName = this.categoryNameKey(name);
    const categories = await this.prisma.supplierCategory.findMany({
      where: excludedId ? { id: { not: excludedId } } : undefined,
      select: { name: true },
    });
    if (categories.some((category) => this.categoryNameKey(category.name) === normalizedName)) {
      throw new ConflictException(SUPPLIER_ERRORS.categoryExists);
    }
  }

  private categoryNameKey(value: string) {
    return supplierCategoryNameKey(value);
  }

  private async ensureSupplierCodeAvailable(value?: string | null, excludedId?: string) {
    const supplierCode = this.optionalCode(value);
    if (!supplierCode) return;
    const existing = await this.prisma.supplier.findFirst({
      where: {
        ...(excludedId ? { id: { not: excludedId } } : {}),
        supplierCode: { equals: supplierCode, mode: 'insensitive' },
      },
      select: { id: true },
    });
    if (existing) throw new ConflictException(SUPPLIER_ERRORS.codeExists);
  }

  private async ensureCategory(id: string) {
    const categoryId = this.requiredText(id, 'Cần chọn loại nhà cung cấp');
    const category = await this.prisma.supplierCategory.findUnique({ where: { id: categoryId } });
    if (!category) throw new NotFoundException(SUPPLIER_ERRORS.categoryNotFound);
    return category;
  }

  private async ensureCategoryByName(name: string) {
    const categoryName = this.requiredLabel(name, 'Cần cấu hình loại nhà cung cấp');
    const existing = await this.findCategoryByName(categoryName);
    if (existing) return existing;
    try {
      return await this.prisma.supplierCategory.create({ data: { name: categoryName } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const concurrent = await this.findCategoryByName(categoryName);
        if (concurrent) return concurrent;
        throw new ConflictException(SUPPLIER_ERRORS.categoryExists);
      }
      throw error;
    }
  }

  private async findCategoryByName(name: string) {
    const key = this.categoryNameKey(name);
    const categories = await this.prisma.supplierCategory.findMany();
    return categories.find((category) => this.categoryNameKey(category.name) === key) || null;
  }

  private toSupplierData(dto: UpdateSupplierDto & Partial<CreateHotelSupplierDto & CreateGenericSupplierDto>) {
    return {
      ...(dto.categoryId !== undefined ? { categoryId: this.requiredText(dto.categoryId, 'Cần chọn loại nhà cung cấp') } : {}),
      ...(dto.supplierCode !== undefined ? { supplierCode: this.optionalCode(dto.supplierCode, 'Mã nhà cung cấp', MAX_SUPPLIER_CODE_LENGTH) } : {}),
      ...(dto.name !== undefined ? { name: this.requiredBoundedText(dto.name, 'Tên nhà cung cấp', 2, MAX_SUPPLIER_NAME_LENGTH) } : {}),
      ...(dto.taxCode !== undefined ? { taxCode: this.optionalMaxText(dto.taxCode, 'Mã số thuế', MAX_SUPPLIER_TAX_CODE_LENGTH) } : {}),
      ...(dto.contactPerson !== undefined ? { contactPerson: this.optionalMaxText(dto.contactPerson, 'Người liên hệ', MAX_SUPPLIER_CONTACT_PERSON_LENGTH) } : {}),
      ...(dto.phone !== undefined ? { phone: this.optionalPhoneText(dto.phone, 'Số điện thoại nhà cung cấp', 40) } : {}),
      ...(dto.email !== undefined ? { email: this.optionalEmailText(dto.email, 'Email nhà cung cấp') } : {}),
      ...(dto.country !== undefined ? { country: this.optionalMaxLabel(dto.country, 'Quốc gia', MAX_SUPPLIER_COUNTRY_LENGTH) } : {}),
      ...(dto.province !== undefined ? { province: this.optionalMaxLabel(dto.province, 'Tỉnh/thành', MAX_SUPPLIER_PROVINCE_LENGTH) } : {}),
      ...(dto.address !== undefined ? { address: this.optionalMaxText(dto.address, 'Địa chỉ nhà cung cấp', MAX_SUPPLIER_ADDRESS_LENGTH) } : {}),
      ...(dto.website !== undefined ? { website: this.optionalUrlText(dto.website, 'Website nhà cung cấp', MAX_SUPPLIER_URL_LENGTH) } : {}),
      ...(dto.link !== undefined ? { link: this.optionalUrlText(dto.link, 'Liên kết tham khảo', MAX_SUPPLIER_URL_LENGTH) } : {}),
      ...(dto.rating !== undefined ? { rating: this.optionalRating(dto.rating, 'Xếp hạng nhà cung cấp') } : {}),
      ...(dto.market !== undefined ? { market: this.optionalMaxLabel(dto.market, 'Thị trường', MAX_SUPPLIER_MARKET_LENGTH) } : {}),
      ...(dto.bankAccountName !== undefined ? { bankAccountName: this.optionalMaxText(dto.bankAccountName, 'Tên tài khoản ngân hàng', MAX_SUPPLIER_BANK_ACCOUNT_NAME_LENGTH) } : {}),
      ...(dto.bankAccountNumber !== undefined ? { bankAccountNumber: this.optionalMaxText(dto.bankAccountNumber, 'Số tài khoản ngân hàng', MAX_SUPPLIER_BANK_ACCOUNT_NUMBER_LENGTH) } : {}),
      ...(dto.bankName !== undefined ? { bankName: this.optionalMaxText(dto.bankName, 'Tên ngân hàng', MAX_SUPPLIER_BANK_NAME_LENGTH) } : {}),
      ...(dto.pricePolicy !== undefined ? { pricePolicy: this.optionalMaxText(dto.pricePolicy, 'Chính sách giá', MAX_SUPPLIER_NOTES_LENGTH) } : {}),
      ...(dto.debtNote !== undefined ? { debtNote: this.optionalMaxText(dto.debtNote, 'Ghi chú công nợ', MAX_SUPPLIER_NOTES_LENGTH) } : {}),
      ...(dto.notes !== undefined ? { notes: this.optionalMaxText(dto.notes, 'Ghi chú nhà cung cấp', MAX_SUPPLIER_NOTES_LENGTH) } : {}),
      ...(dto.status !== undefined ? { status: this.toSupplierStatus(dto.status) } : {}),
    };
  }

  private assertCanWriteSupplierFinancialFields(dto: Partial<CreateSupplierDto & CreateHotelSupplierDto & CreateGenericSupplierDto>, user?: RequestUser) {
    if (canViewSupplierFinancialFields(user)) return;
    const sensitiveFields = ['taxCode', 'bankAccountName', 'bankAccountNumber', 'bankName', 'pricePolicy', 'debtNote'] as const;
    const submitted = sensitiveFields.filter((field) => Object.prototype.hasOwnProperty.call(dto, field) && (dto as Record<string, unknown>)[field] !== undefined);
    if (submitted.length) throw new ForbiddenException('Thiếu quyền cập nhật thông tin tài chính nhà cung cấp');
  }

  private toHotelProfileData(dto: Partial<CreateHotelSupplierDto>) {
    return {
      ...(dto.builtYear !== undefined ? { builtYear: this.optionalHotelBuiltYear(dto.builtYear) } : {}),
      ...(dto.rating !== undefined ? { rating: this.optionalRating(dto.rating, 'Xếp hạng khách sạn') } : {}),
      ...(dto.classHotel !== undefined ? { classHotel: this.requiredBoundedLabel(dto.classHotel, 'Hạng khách sạn', 2, 80) } : {}),
      ...(dto.hotelProject !== undefined ? { hotelProject: this.requiredBoundedLabel(dto.hotelProject, 'Dòng sản phẩm hoặc dự án khách sạn', 2, 180) } : {}),
      ...(dto.bankAccountName !== undefined ? { bankAccountName: this.optionalMaxText(dto.bankAccountName, 'Tên tài khoản ngân hàng', MAX_SUPPLIER_BANK_ACCOUNT_NAME_LENGTH) } : {}),
      ...(dto.bankAccountNumber !== undefined ? { bankAccountNumber: this.optionalMaxText(dto.bankAccountNumber, 'Số tài khoản ngân hàng', MAX_SUPPLIER_BANK_ACCOUNT_NUMBER_LENGTH) } : {}),
      ...(dto.bankName !== undefined ? { bankName: this.optionalMaxText(dto.bankName, 'Tên ngân hàng', MAX_SUPPLIER_BANK_NAME_LENGTH) } : {}),
      ...(dto.market !== undefined ? { market: this.optionalMaxLabel(dto.market, 'Thị trường', MAX_SUPPLIER_MARKET_LENGTH) } : {}),
      ...(dto.link !== undefined ? { link: this.optionalUrlText(dto.link, 'Liên kết tham khảo', MAX_SUPPLIER_URL_LENGTH) } : {}),
    };
  }

  private async replaceHotelChildren(
    tx: Prisma.TransactionClient,
    supplierId: string,
    dto: Partial<CreateHotelSupplierDto>,
  ) {
    // Hotel update contract: omitted child arrays preserve existing rows; provided arrays are full snapshots.
    const contactsInput = this.optionalArray(dto.contacts, 'Danh sách người liên hệ');
    const servicesInput = this.optionalArray(dto.services, 'Danh sách dịch vụ khách sạn');
    const allotmentsInput = this.optionalArray(dto.allotments, 'Danh sách quỹ phòng');
    const contacts = contactsInput ? this.normalizeSupplierContacts(contactsInput) : undefined;
    const services = servicesInput ? this.normalizeHotelServices(servicesInput) : undefined;
    const allotments = allotmentsInput ? this.normalizeHotelAllotments(allotmentsInput) : undefined;

    if (contacts !== undefined) {
      await tx.supplierContact.deleteMany({ where: { supplierId } });
      if (contacts.length) {
        await tx.supplierContact.createMany({
          data: contacts.map((item) => ({
            supplierId,
            ...item,
          })),
        });
      }
    }

    if (services !== undefined) {
      const activeAllocations = await tx.supplierAllotmentAllocation.count({
        where: { supplierId, status: { in: ['LOCKED', 'CONFIRMED'] } },
      });
      if (activeAllocations > 0) {
        throw new ConflictException('Không thể thay toàn bộ dịch vụ khách sạn khi còn phân bổ quỹ phòng đang khóa hoặc đã xác nhận');
      }
      await tx.supplierAllotment.updateMany({ where: { supplierId, serviceId: { not: null } }, data: { serviceId: null } });
      await tx.supplierService.updateMany({ where: { supplierId, deletedAt: null }, data: { deletedAt: new Date(), status: 'INACTIVE' } });
      if (services.length) {
        await tx.supplierService.createMany({
          data: services.map((item) => ({ supplierId, ...item })),
        });
      }
    }

    if (allotments !== undefined) {
      const activeAllocations = await tx.supplierAllotmentAllocation.count({
        where: { supplierId, status: { in: ['LOCKED', 'CONFIRMED'] } },
      });
      if (activeAllocations > 0) {
        throw new ConflictException('Không thể thay toàn bộ quỹ phòng khi còn phân bổ đang khóa hoặc đã xác nhận');
      }
      await tx.supplierAllotment.deleteMany({ where: { supplierId } });
      if (allotments.length) {
        await tx.supplierAllotment.createMany({
          data: allotments.map((item) => ({ supplierId, ...item })),
        });
      }
    }
  }

  private async lockSupplierForStatusWrite(tx: Prisma.TransactionClient, id: string) {
    const rows = await tx.$queryRaw<Array<{
      id: string;
      status: SupplierStatus;
      deletedAt: Date | null;
      hotelProfileId: string | null;
      categoryName: string | null;
    }>>(Prisma.sql`
      SELECT s.id, s.status, s."deletedAt", h.id AS "hotelProfileId", c.name AS "categoryName"
      FROM "Supplier" s
      LEFT JOIN "HotelSupplier" h ON h."supplierId" = s.id
      LEFT JOIN "SupplierCategory" c ON c.id = s."categoryId"
      WHERE s.id = ${id}
      FOR UPDATE OF s
    `);
    const supplier = rows[0];
    if (!supplier || supplier.deletedAt) throw new NotFoundException(SUPPLIER_ERRORS.supplierNotFound);
    return supplier;
  }

  private async lockSupplierForAllotmentWrite(tx: Prisma.TransactionClient, supplierId: string) {
    const supplier = await this.lockSupplierForStatusWrite(tx, supplierId);
    if (supplier.status !== SupplierStatus.ACTIVE) {
      throw new BadRequestException('Nhà cung cấp khách sạn đang ngừng hoạt động');
    }
    return supplier;
  }

  private async ensureHotelSupplierCanDeactivate(tx: Prisma.TransactionClient, supplierId: string) {
    const activeAllocations = await tx.supplierAllotmentAllocation.count({
      where: { supplierId, status: { in: ['LOCKED', 'CONFIRMED'] } },
    });
    if (activeAllocations > 0) {
      throw new ConflictException('Không thể ngừng nhà cung cấp khách sạn khi còn phân bổ quỹ phòng đang khóa hoặc đã xác nhận');
    }
  }

  private rereadSupplierAfterChildWrite(tx: Prisma.TransactionClient, supplierId: string, hotelProfileId: string | null) {
    return tx.supplier.findUniqueOrThrow({
      where: { id: supplierId },
      include: hotelProfileId ? this.hotelInclude() : this.genericInclude(),
    });
  }

  private normalizeChildSupplierService(
    supplier: { hotelProfileId: string | null; categoryName: string | null },
    dto: SupplierChildServiceInputDto,
  ) {
    if (supplier.hotelProfileId) return this.normalizeHotelServices([dto])[0];
    return this.normalizeGenericServices([dto], this.typedRouteForSupplierCategory(supplier.categoryName))[0];
  }

  private mergeSupplierServiceRow(
    dto: UpdateSupplierChildServiceInputDto,
    current: {
      sku: string | null;
      serviceName: string;
      startDate: Date | null;
      endDate: Date | null;
      dayType: SupplierDayType;
      quantity: number;
      accountingPrice: unknown;
      netPrice: unknown;
      sellingPrice: unknown;
      description: string | null;
      note: string | null;
      metadata: Prisma.JsonValue | null;
    },
  ): SupplierChildServiceInputDto {
    const currentMetadata = current.metadata && typeof current.metadata === 'object' && !Array.isArray(current.metadata)
      ? current.metadata as Record<string, unknown>
      : undefined;
    return {
      sku: this.childValue(dto, 'sku', current.sku ?? undefined),
      serviceName: this.childValue(dto, 'serviceName', current.serviceName),
      startDate: this.childValue(dto, 'startDate', this.dateOnlyString(current.startDate)),
      endDate: this.childValue(dto, 'endDate', this.dateOnlyString(current.endDate)),
      dayType: this.childValue(dto, 'dayType', current.dayType),
      quantity: this.childValue(dto, 'quantity', current.quantity),
      accountingPrice: this.childValue(dto, 'accountingPrice', this.financeAmount(current.accountingPrice)),
      netPrice: this.childValue(dto, 'netPrice', this.financeAmount(current.netPrice)),
      sellingPrice: this.childValue(dto, 'sellingPrice', this.financeAmount(current.sellingPrice)),
      description: this.childValue(dto, 'description', current.description ?? undefined),
      note: this.childValue(dto, 'note', current.note ?? undefined),
      metadata: this.childValue(dto, 'metadata', currentMetadata),
    };
  }

  private childValue<T>(dto: object, key: string, current: T): T {
    return Object.prototype.hasOwnProperty.call(dto, key) ? (dto as Record<string, unknown>)[key] as T : current;
  }

  private dateOnlyString(value?: Date | null) {
    return value ? value.toISOString().slice(0, 10) : undefined;
  }

  private typedRouteForSupplierCategory(categoryName: string | null) {
    if (!categoryName) return null;
    const key = this.categoryNameKey(categoryName);
    return (Object.keys(SUPPLIER_TYPE_LABELS) as TypedSupplierRoute[])
      .find((route) => supplierTypeCategoryNames(route).some((name) => this.categoryNameKey(name) === key)) || null;
  }

  private async ensureServiceHasNoActiveHotelAllocations(tx: Prisma.TransactionClient, supplierId: string, serviceId: string) {
    const activeAllocations = await tx.supplierAllotmentAllocation.count({
      where: { supplierId, serviceId, status: { in: ['LOCKED', 'CONFIRMED'] } },
    });
    if (activeAllocations > 0) {
      throw new ConflictException('Không thể sửa hoặc xóa dịch vụ khách sạn khi còn phân bổ quỹ phòng đang khóa hoặc đã xác nhận');
    }
  }

  private async replaceGenericChildren(
    tx: Prisma.TransactionClient,
    supplierId: string,
    dto: Partial<CreateGenericSupplierDto>,
    type: TypedSupplierRoute,
  ) {
    const contactsInput = this.optionalArray(dto.contacts, 'Danh sách người liên hệ');
    const servicesInput = this.optionalArray(dto.services, 'Danh sách dịch vụ');
    const contacts = contactsInput ? this.normalizeSupplierContacts(contactsInput) : undefined;
    const services = servicesInput ? this.normalizeGenericServices(servicesInput, type) : undefined;

    if (contacts !== undefined) {
      await tx.supplierContact.deleteMany({ where: { supplierId } });
      if (contacts.length) {
        await tx.supplierContact.createMany({
          data: contacts.map((item) => ({
            supplierId,
            ...item,
          })),
        });
      }
    }

    if (services !== undefined) {
      await tx.supplierService.updateMany({ where: { supplierId, deletedAt: null }, data: { deletedAt: new Date(), status: 'INACTIVE' } });
      if (services.length) {
        await tx.supplierService.createMany({
          data: services.map((item) => ({ supplierId, ...item })),
        });
      }
    }
  }

  private normalizeSupplierContacts(
    items: Array<{ fullName?: string; position?: string; birthday?: string; phone?: string; email?: string }>,
  ): Array<Omit<Prisma.SupplierContactCreateManyInput, 'supplierId'>> {
    return items.map((item, index) => {
      const row = `dòng liên hệ ${index + 1}`;
      const fullName = this.requiredText(item.fullName, `Cần nhập họ tên ${row}`);
      if (fullName.length < 2) throw new BadRequestException(`Họ tên ${row} phải có ít nhất 2 ký tự`);
      if (fullName.length > 180) throw new BadRequestException(`Họ tên ${row} không được vượt quá 180 ký tự`);
      return {
        fullName,
        position: this.optionalMaxText(item.position, `Chức vụ ${row}`, 120),
        birthday: this.optionalDate(item.birthday, `Ngày sinh ${row}`),
        phone: this.optionalPhoneText(item.phone, `Số điện thoại ${row}`),
        email: this.optionalEmailText(item.email, `Email ${row}`),
      };
    });
  }

  private normalizeGenericServices(
    items: Array<{
      sku?: string;
      serviceName?: string;
      quantity?: number;
      accountingPrice?: number;
      netPrice?: number;
      sellingPrice?: number;
      startDate?: string;
      endDate?: string;
      dayType?: SupplierDayType;
      description?: string;
      note?: string;
      metadata?: Record<string, unknown>;
    }>,
    type?: TypedSupplierRoute | null,
  ): Array<Omit<Prisma.SupplierServiceCreateManyInput, 'supplierId'>> {
    const services = items.map((item, index) => {
      const row = `dòng dịch vụ ${index + 1}`;
      const { startDate, endDate } = this.optionalDateRange(item.startDate, item.endDate, 'dịch vụ');
      return {
        sku: this.optionalSku(item.sku, `Mã dịch vụ ${row}`),
        serviceName: this.requiredServiceName(item.serviceName, row),
        startDate,
        endDate,
        dayType: this.toDayType(item.dayType, 'dịch vụ'),
        quantity: this.optionalNonNegativeInt(item.quantity, `Số lượng ${row}`) ?? 1,
        accountingPrice: this.optionalMoney(item.accountingPrice, `Giá kế toán ${row}`) ?? 0,
        netPrice: this.optionalMoney(item.netPrice, `Giá thuần ${row}`) ?? 0,
        sellingPrice: this.optionalMoney(item.sellingPrice, `Giá bán ${row}`) ?? 0,
        description: this.optionalMaxText(item.description, `Mô tả ${row}`, 2000),
        note: this.optionalMaxText(item.note, `Ghi chú ${row}`, 2000),
        metadata: item.metadata ? (type ? this.normalizeTypedMetadata(type, item.metadata) : this.normalizeUntypedServiceMetadata(item.metadata)) as Prisma.InputJsonValue : Prisma.JsonNull,
      };
    });
    this.ensureUniqueServiceSkus(services);
    return services;
  }

  private normalizeHotelServices(
    items: Array<{
      sku?: string;
      serviceName?: string;
      startDate?: string;
      endDate?: string;
      dayType?: SupplierDayType;
      accountingPrice?: number;
      netPrice?: number;
      sellingPrice?: number;
      description?: string;
      note?: string;
    }>,
  ): Array<Omit<Prisma.SupplierServiceCreateManyInput, 'supplierId'>> {
    const services = items.map((item, index) => {
      const row = `dòng dịch vụ ${index + 1}`;
      const { startDate, endDate } = this.optionalDateRange(item.startDate, item.endDate, 'dịch vụ');
      return {
        sku: this.optionalSku(item.sku, `Mã dịch vụ ${row}`),
        serviceName: this.requiredServiceName(item.serviceName, row),
        startDate,
        endDate,
        dayType: this.toDayType(item.dayType, 'dịch vụ'),
        quantity: 1,
        accountingPrice: this.optionalMoney(item.accountingPrice, `Giá kế toán ${row}`) ?? 0,
        netPrice: this.optionalMoney(item.netPrice, `Giá thuần ${row}`) ?? 0,
        sellingPrice: this.optionalMoney(item.sellingPrice, `Giá bán ${row}`) ?? 0,
        description: this.optionalMaxText(item.description, `Mô tả ${row}`, 2000),
        note: this.optionalMaxText(item.note, `Ghi chú ${row}`, 2000),
      };
    });
    this.ensureUniqueServiceSkus(services);
    return services;
  }

  private normalizeHotelAllotments(
    items: Array<{
      sku?: string;
      serviceName?: string;
      startDate?: string;
      endDate?: string;
      dayType?: SupplierDayType;
      allotmentQty?: number;
      bookedQty?: number;
      lockedQty?: number;
      quantityLock?: number;
      cutoffDays?: number;
      netCostPerDay?: number;
      sellingPricePerDay?: number;
      status?: string;
      description?: string;
      note?: string;
    }>,
  ): Array<Omit<Prisma.SupplierAllotmentCreateManyInput, 'supplierId'>> {
    const allotments = items.map((item, index) => {
      const row = `dòng quỹ phòng ${index + 1}`;
      const { startDate, endDate } = this.optionalDateRange(item.startDate, item.endDate, 'quỹ phòng');
      const quantityLockInput = this.optionalNonNegativeInt(item.quantityLock, `Số lượng khóa phòng ${row}`);
      const lockedQtyInput = this.optionalNonNegativeInt(item.lockedQty, `Số phòng đang giữ ${row}`);
      if (quantityLockInput !== null && lockedQtyInput !== null && quantityLockInput !== lockedQtyInput) {
        throw new BadRequestException('Số phòng đang giữ và số lượng khóa phòng phải trùng nhau khi gửi cùng lúc');
      }
      const lockedQty = lockedQtyInput ?? quantityLockInput ?? 0;
      const quantityLock = lockedQty;
      const allotmentQty = this.optionalNonNegativeInt(item.allotmentQty, `Tổng quỹ phòng ${row}`) ?? lockedQty;
      const bookedQty = this.optionalNonNegativeInt(item.bookedQty, `Số phòng đã đặt ${row}`) ?? 0;
      if (bookedQty + lockedQty > allotmentQty) {
        throw new BadRequestException('Số lượng đã đặt cộng số lượng đã khóa không được vượt quá tổng quỹ phòng');
      }
      return {
        sku: this.optionalSku(item.sku, `Mã quỹ phòng ${row}`),
        serviceName: this.requiredAllotmentName(item.serviceName, row),
        startDate,
        endDate,
        dayType: this.toDayType(item.dayType, 'quỹ phòng'),
        allotmentQty,
        bookedQty,
        lockedQty,
        quantityLock,
        cutoffDays: this.optionalCutoffDays(item.cutoffDays, `Số ngày chốt quỹ phòng ${row}`) ?? 0,
        netCostPerDay: this.optionalMoney(item.netCostPerDay, `Giá thuần mỗi ngày ${row}`) ?? 0,
        sellingPricePerDay: this.optionalMoney(item.sellingPricePerDay, `Giá bán mỗi ngày ${row}`) ?? 0,
        status: this.toAllotmentStatus(item.status),
        description: this.optionalMaxText(item.description, `Mô tả ${row}`, 2000),
        note: this.optionalMaxText(item.note, `Ghi chú ${row}`, 2000),
      };
    });
    this.ensureNoOverlappingAllotments(allotments);
    return allotments;
  }

  private hotelInclude() {
    return {
      category: true,
      hotelProfile: true,
      contacts: { orderBy: { createdAt: 'asc' } },
      supplierServices: { where: { deletedAt: null }, orderBy: SUPPLIER_SERVICE_ORDER_BY },
      allotments: { orderBy: { createdAt: 'asc' }, include: { allocations: { orderBy: { createdAt: 'desc' }, take: 10 }, logs: { orderBy: { createdAt: 'desc' }, take: 3 } } },
      files: { orderBy: { createdAt: 'desc' } },
    } satisfies Prisma.SupplierInclude;
  }

  private hotelListInclude() {
    return {
      category: true,
      hotelProfile: true,
      contacts: { orderBy: { createdAt: 'asc' } },
      supplierServices: { where: { deletedAt: null }, orderBy: SUPPLIER_SERVICE_ORDER_BY },
      allotments: { orderBy: { createdAt: 'asc' } },
    } satisfies Prisma.SupplierInclude;
  }

  private toAllotmentInventory(
    item: Prisma.SupplierAllotmentGetPayload<{ include: { supplier: true; logs: true; allocations: true } }>,
    today: Date,
  ) {
    const metrics = this.allotmentMetrics(item);
    const codLockUntil = this.startOfUtcDay(today);
    codLockUntil.setUTCDate(codLockUntil.getUTCDate() + item.cutoffDays);
    const isCodLocked = item.startDate ? item.startDate <= codLockUntil : false;
    const computedStatus = item.supplier.status !== SupplierStatus.ACTIVE || item.supplier.deletedAt || item.status === 'INACTIVE'
      ? 'INACTIVE'
      : item.status === 'STOP_SELL'
        ? 'STOP_SELL'
        : metrics.remainingQty <= 0
          ? 'STOP_SELL'
          : isCodLocked
            ? 'COD_LOCKED'
            : item.status;
    const allocationSummary = item.allocations.reduce(
      (summary, allocation) => {
        if (allocation.status === 'LOCKED') summary.locked += allocation.quantity;
        if (allocation.status === 'CONFIRMED') summary.confirmed += allocation.quantity;
        if (allocation.status === 'RELEASED') summary.released += allocation.quantity;
        return summary;
      },
      { locked: 0, confirmed: 0, released: 0 },
    );
    return {
      ...item,
      allotmentQty: metrics.allotmentQty,
      bookedQty: metrics.bookedQty,
      lockedQty: metrics.lockedQty,
      remainingQty: metrics.remainingQty,
      overbookedQty: metrics.overbookedQty,
      occupancyRate: this.percent(metrics.bookedQty, metrics.allotmentQty),
      sellThroughRate: this.percent(metrics.bookedQty + metrics.lockedQty, metrics.allotmentQty),
      isCodLocked,
      computedStatus,
      revenue: metrics.bookedQty * Number(item.sellingPricePerDay || 0),
      allocationSummary,
      activeAllocationCount: item.allocations.filter((allocation) => ['LOCKED', 'CONFIRMED'].includes(allocation.status)).length,
    };
  }

  private allotmentMetrics(item: { allotmentQty: number; quantityLock?: number | null; bookedQty: number; lockedQty?: number | null }) {
    const allotmentQty = item.allotmentQty ?? 0;
    const bookedQty = item.bookedQty || 0;
    const lockedQty = item.lockedQty ?? 0;
    const usedQty = bookedQty + lockedQty;
    return {
      allotmentQty,
      bookedQty,
      lockedQty,
      usedQty,
      remainingQty: Math.max(0, allotmentQty - usedQty),
      overbookedQty: Math.max(0, usedQty - allotmentQty),
    };
  }

  private percent(part: number, total: number) {
    if (!total || total <= 0) return 0;
    return Math.min(100, Math.max(0, (part / total) * 100));
  }

  private allotmentChanges(
    current: { allotmentQty: number; bookedQty: number; lockedQty: number; status: string },
    next: { allotmentQty: number; bookedQty: number; lockedQty: number; status: string },
  ) {
    return (['allotmentQty', 'bookedQty', 'lockedQty', 'status'] as const)
      .filter((field) => current[field] !== next[field])
      .map((field) => ({ field, oldValue: current[field], newValue: next[field] }));
  }

  private async allotmentInventoryById(tx: Prisma.TransactionClient, id: string, user?: RequestUser) {
    const item = await tx.supplierAllotment.findUniqueOrThrow({
      where: { id },
      include: {
        supplier: true,
        logs: { orderBy: { createdAt: 'desc' }, take: 5 },
        allocations: { where: this.allotmentAllocationScopeWhere({}, user), orderBy: { createdAt: 'desc' } },
      },
    });
    return this.toAllotmentInventory(item, new Date());
  }

  private genericInclude() {
    return {
      category: true,
      contacts: { orderBy: { createdAt: 'asc' } },
      supplierServices: { where: { deletedAt: null }, orderBy: SUPPLIER_SERVICE_ORDER_BY },
      files: { orderBy: { createdAt: 'desc' } },
    } satisfies Prisma.SupplierInclude;
  }

  private genericListInclude() {
    return {
      category: true,
      contacts: { orderBy: { createdAt: 'asc' } },
      supplierServices: { where: { deletedAt: null }, orderBy: SUPPLIER_SERVICE_ORDER_BY },
    } satisfies Prisma.SupplierInclude;
  }

  private getTypedRoute(type: string): TypedSupplierRoute {
    if (!isTypedSupplierRoute(type)) throw new NotFoundException(SUPPLIER_ERRORS.unsupportedType);
    return type;
  }

  private async ensureTypedSupplier(type: TypedSupplierRoute, id: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: {
        id,
        deletedAt: null,
        category: { name: { in: supplierTypeCategoryNames(type), mode: 'insensitive' } },
      },
      include: this.genericInclude(),
    });
    if (!supplier) throw new NotFoundException(SUPPLIER_ERRORS.typedSupplierNotFound);
    return supplier;
  }

  private validateTypedSupplierPayload(type: TypedSupplierRoute, dto: Partial<CreateGenericSupplierDto>) {
    const contacts = this.optionalArray(dto.contacts, 'Danh sách người liên hệ');
    const services = this.optionalArray(dto.services, 'Danh sách dịch vụ');
    if (contacts !== undefined) this.normalizeSupplierContacts(contacts);
    if (services !== undefined) this.normalizeGenericServices(services, type);
  }

  private validateSpecializedSupplierIdentity(
    dto: { supplierCode?: unknown; phone?: unknown },
    partial = false,
  ) {
    if (!partial || dto.supplierCode !== undefined) {
      this.requiredBoundedText(dto.supplierCode, 'Mã nhà cung cấp', 2, MAX_SUPPLIER_CODE_LENGTH);
    }
    if (!partial || dto.phone !== undefined) {
      const phone = this.optionalPhoneText(dto.phone, 'Số điện thoại nhà cung cấp', 40);
      if (!phone) throw new BadRequestException('Cần nhập số điện thoại nhà cung cấp');
    }
  }

  private validateHotelProfilePayload(dto: Partial<CreateHotelSupplierDto>, partial = false) {
    if (!partial || dto.classHotel !== undefined) {
      this.requiredBoundedLabel(dto.classHotel, 'Hạng khách sạn', 2, 80);
    }
    if (!partial || dto.hotelProject !== undefined) {
      this.requiredBoundedLabel(dto.hotelProject, 'Dòng sản phẩm hoặc dự án khách sạn', 2, 180);
    }
  }

  private normalizeTypedMetadata(type: TypedSupplierRoute, metadata: Record<string, unknown>) {
    const fields = SUPPLIER_TYPE_METADATA_FIELDS[type];
    return Object.fromEntries(Object.entries(metadata).map(([key, rawValue]) => {
      const fieldType = fields[key];
      if (!fieldType) throw new BadRequestException(`Trường dịch vụ ${key} không hợp lệ với loại nhà cung cấp đã chọn`);
      if (rawValue === '' || rawValue === null || rawValue === undefined) return [key, ''];
      if (fieldType === 'number') {
        const value = typeof rawValue === 'number' ? rawValue : Number(rawValue);
        if (!Number.isFinite(value) || value < 0) throw new BadRequestException(`Trường dịch vụ ${key} phải là số không âm`);
        return [key, value];
      }
      if (typeof rawValue !== 'string') throw new BadRequestException(`Trường dịch vụ ${key} phải là chuỗi ký tự`);
      const value = rawValue.trim();
      if (value.length > 2000) throw new BadRequestException(`Trường dịch vụ ${key} không được vượt quá 2.000 ký tự`);
      if (fieldType === 'date' && !this.isValidDateOnly(value)) {
        throw new BadRequestException(`Trường dịch vụ ${key} phải là ngày hợp lệ`);
      }
      if (fieldType === 'time' && !SUPPLIER_TIME_PATTERN.test(value)) {
        throw new BadRequestException(`Trường dịch vụ ${key} phải là giờ hợp lệ`);
      }
      if (fieldType === 'datetime' && (!this.isValidDatePrefix(value) || Number.isNaN(new Date(value).getTime()))) {
        throw new BadRequestException(`Trường dịch vụ ${key} phải là ngày giờ hợp lệ`);
      }
      if (/email/i.test(key) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        throw new BadRequestException(`Trường dịch vụ ${key} phải là email hợp lệ`);
      }
      if (/phone/i.test(key) && !SUPPLIER_PHONE_PATTERN.test(value)) {
        throw new BadRequestException(`Trường dịch vụ ${key} phải là số điện thoại hợp lệ`);
      }
      return [key, value];
    }));
  }

  private normalizeUntypedServiceMetadata(metadata: Record<string, unknown>) {
    const submittedKeys = Object.entries(metadata)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([key]) => key);
    if (submittedKeys.length) {
      throw new BadRequestException('Metadata dịch vụ chỉ hỗ trợ cho nhà cung cấp chuyên biệt');
    }
    return {};
  }

  private isValidDateOnly(value: string) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return false;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  }

  private isValidDatePrefix(value: string) {
    const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(value.trim());
    if (!match) return true;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  }

  private requiredText(value: string | undefined, message = 'Cần nhập trường bắt buộc') {
    const text = this.optionalText(value);
    if (!text) throw new BadRequestException(message);
    return text;
  }

  private requiredLabel(value: string | undefined, message = 'Cần nhập trường bắt buộc') {
    const text = this.optionalLabel(value);
    if (!text) throw new BadRequestException(message);
    return text;
  }

  private requiredBoundedText(value: unknown, fieldName: string, minLength: number, maxLength: number) {
    const text = this.requiredText(value as string | undefined, `Cần nhập ${fieldName.toLocaleLowerCase('vi')}`);
    if (text.length < minLength) throw new BadRequestException(`${fieldName} phải có ít nhất ${minLength} ký tự`);
    if (text.length > maxLength) throw new BadRequestException(`${fieldName} không được vượt quá ${maxLength} ký tự`);
    return text;
  }

  private requiredBoundedLabel(value: unknown, fieldName: string, minLength: number, maxLength: number) {
    const label = this.optionalLabel(value, fieldName);
    if (!label) throw new BadRequestException(`Cần nhập ${fieldName.toLocaleLowerCase('vi')}`);
    if (label.length < minLength) throw new BadRequestException(`${fieldName} phải có ít nhất ${minLength} ký tự`);
    if (label.length > maxLength) throw new BadRequestException(`${fieldName} không được vượt quá ${maxLength} ký tự`);
    return label;
  }

  private requiredServiceName(value: unknown, row: string) {
    const serviceName = this.requiredText(value as string | undefined, `Cần nhập tên dịch vụ ${row}`);
    if (serviceName.length < 2) throw new BadRequestException(`Tên dịch vụ ${row} phải có ít nhất 2 ký tự`);
    if (serviceName.length > MAX_SUPPLIER_SERVICE_NAME_LENGTH) {
      throw new BadRequestException(`Tên dịch vụ ${row} không được vượt quá ${MAX_SUPPLIER_SERVICE_NAME_LENGTH} ký tự`);
    }
    return serviceName;
  }

  private requiredAllotmentName(value: unknown, row: string) {
    const serviceName = this.requiredText(value as string | undefined, `Cần nhập tên quỹ phòng ${row}`);
    if (serviceName.length < 2) throw new BadRequestException(`Tên quỹ phòng ${row} phải có ít nhất 2 ký tự`);
    if (serviceName.length > MAX_SUPPLIER_ALLOTMENT_NAME_LENGTH) {
      throw new BadRequestException(`Tên quỹ phòng ${row} không được vượt quá ${MAX_SUPPLIER_ALLOTMENT_NAME_LENGTH} ký tự`);
    }
    return serviceName;
  }

  private ensureUniqueServiceSkus(items: Array<{ sku?: string | null }>) {
    const seen = new Set<string>();
    for (const item of items) {
      if (!item.sku) continue;
      const key = item.sku.toUpperCase();
      if (seen.has(key)) throw new BadRequestException('Mã dịch vụ không được trùng trong cùng nhà cung cấp');
      seen.add(key);
    }
  }

  private ensureNoOverlappingAllotments(
    items: Array<{
      sku?: string | null;
      serviceName: string;
      startDate?: Date | null;
      endDate?: Date | null;
      dayType: SupplierDayType;
    }>,
  ) {
    for (let leftIndex = 0; leftIndex < items.length; leftIndex += 1) {
      const left = items[leftIndex];
      const leftKey = left.sku ? `sku:${left.sku.toUpperCase()}` : `name:${this.categoryNameKey(left.serviceName)}`;
      for (let rightIndex = leftIndex + 1; rightIndex < items.length; rightIndex += 1) {
        const right = items[rightIndex];
        const rightKey = right.sku ? `sku:${right.sku.toUpperCase()}` : `name:${this.categoryNameKey(right.serviceName)}`;
        if (leftKey !== rightKey || !this.dayTypesOverlap(left.dayType, right.dayType)) continue;
        const datesOverlap = (!left.endDate || !right.startDate || left.endDate >= right.startDate)
          && (!right.endDate || !left.startDate || right.endDate >= left.startDate);
        if (datesOverlap) {
          throw new BadRequestException(`Khoảng ngày quỹ phòng bị chồng nhau giữa dòng ${leftIndex + 1} và dòng ${rightIndex + 1}`);
        }
      }
    }
  }

  private dayTypesOverlap(left: SupplierDayType, right: SupplierDayType) {
    return left === right || left === SupplierDayType.ALL_DAYS || right === SupplierDayType.ALL_DAYS;
  }

  private validateSupplierPayload(dto: Partial<CreateSupplierDto>, partial = false, requireCategory = true) {
    if (requireCategory && (!partial || dto.categoryId !== undefined)) {
      if (!this.optionalText(dto.categoryId, 'Mã loại nhà cung cấp')) throw new BadRequestException('Cần chọn loại nhà cung cấp');
    }

    if (!partial || dto.name !== undefined) {
      const name = this.optionalText(dto.name, 'Tên nhà cung cấp');
      if (!name || name.length < 2) throw new BadRequestException('Tên nhà cung cấp phải có ít nhất 2 ký tự');
    }

    if (dto.phone !== undefined) this.optionalPhoneText(dto.phone, 'Số điện thoại nhà cung cấp');
    if (dto.email !== undefined) this.optionalEmailText(dto.email, 'Email nhà cung cấp');

    if (dto.website !== undefined) this.optionalUrlText(dto.website, 'Website nhà cung cấp');
    if (dto.link !== undefined) this.optionalUrlText(dto.link, 'Liên kết tham khảo');
    if (dto.rating !== undefined) this.optionalRating(dto.rating, 'Xếp hạng nhà cung cấp');

    const pricePolicy = this.optionalText(dto.pricePolicy, 'Chính sách giá');
    if (pricePolicy && pricePolicy.length > 2000) {
      throw new BadRequestException('Chính sách giá không được vượt quá 2.000 ký tự');
    }

    const debtNote = this.optionalText(dto.debtNote, 'Ghi chú công nợ');
    if (debtNote && debtNote.length > 2000) {
      throw new BadRequestException('Ghi chú công nợ không được vượt quá 2.000 ký tự');
    }

    if (dto.status !== undefined) this.toSupplierStatus(dto.status);
  }

  private isSpecializedSupplier(supplier: { hotelProfile?: unknown; category?: { name: string } | null }) {
    return Boolean(supplier.hotelProfile || (supplier.category && this.isSpecializedCategoryName(supplier.category.name)));
  }

  private isSpecializedCategoryName(name: string) {
    return SPECIALIZED_SUPPLIER_CATEGORY_KEYS.has(this.categoryNameKey(name));
  }

  private supplierListInclude() {
    return {
      category: true,
      supplierServices: { where: { deletedAt: null }, orderBy: SUPPLIER_SERVICE_ORDER_BY },
    } satisfies Prisma.SupplierInclude;
  }

  private async deleteSupplierRecord(id: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockSupplierForStatusWrite(tx, id);
      const usage = await this.supplierUsage(tx, id);
      if (usage.total > 0) {
        throw new ConflictException(`Không thể xóa nhà cung cấp đang được sử dụng (${this.usageSummary(usage)}). Hãy kiểm tra đơn hàng, điều hành, tài chính hoặc yêu cầu thanh toán liên quan trước khi xóa.`);
      }
      return tx.supplier.update({
        where: { id },
        data: { deletedAt: new Date(), status: 'INACTIVE' },
        include: this.supplierListInclude(),
      });
    });
  }

  private async supplierUsage(client: Prisma.TransactionClient | PrismaService, id: string) {
    const [
      orderSalesItems,
      orderOperationItems,
      operationVouchers,
      financePayments,
      financeCashflowEntries,
      supplierLedgerEntries,
      supplierPaymentItems,
      operationServices,
      quoteComboItems,
      quotationItems,
      tourSuppliers,
      tourServices,
      tourCosts,
      fitBudgetServices,
      fitOperationServices,
      allotmentAllocations,
      supplierServices,
      allotments,
      files,
    ] = await Promise.all([
      client.orderSalesItem.count({ where: { supplierId: id } }),
      client.orderOperationItem.count({ where: { supplierId: id } }),
      client.operationVoucher.count({ where: { supplierId: id, deletedAt: null } }),
      client.financePayment.count({ where: { supplierId: id, deletedAt: null } }),
      client.financeCashflowEntry.count({ where: { supplierId: id } }),
      client.supplierLedgerEntry.count({ where: { supplierId: id } }),
      client.supplierPaymentItem.count({ where: { supplierId: id } }),
      client.operationService.count({ where: { supplierId: id } }),
      client.quoteComboItem.count({ where: { supplierId: id } }),
      client.quotationItem.count({ where: { supplierId: id } }),
      client.tourSupplier.count({ where: { supplierId: id } }),
      client.tourService.count({ where: { supplierId: id } }),
      client.tourCost.count({ where: { supplierId: id } }),
      client.fitBudgetService.count({ where: { supplierId: id } }),
      client.fitOperationService.count({ where: { supplierId: id } }),
      client.supplierAllotmentAllocation.count({ where: { supplierId: id, status: { in: ['LOCKED', 'CONFIRMED'] } } }),
      client.supplierService.count({ where: { supplierId: id, deletedAt: null } }),
      client.supplierAllotment.count({ where: { supplierId: id } }),
      client.supplierFile.count({ where: { supplierId: id } }),
    ]);
    const usage = {
      orderSalesItems,
      orderOperationItems,
      operationVouchers,
      financePayments,
      financeCashflowEntries,
      supplierLedgerEntries,
      supplierPaymentItems,
      operationServices,
      quoteComboItems,
      quotationItems,
      tourSuppliers,
      tourServices,
      tourCosts,
      fitBudgetServices,
      fitOperationServices,
      allotmentAllocations,
      supplierServices,
      allotments,
      files,
    };

    return { ...usage, total: Object.values(usage).reduce((sum, count) => sum + count, 0) };
  }

  private usageSummary(usage: Awaited<ReturnType<SuppliersService['supplierUsage']>>) {
    const labels: Array<[Exclude<keyof typeof usage, 'total'>, string]> = [
      ['orderSalesItems', 'dịch vụ bán trong đơn'],
      ['orderOperationItems', 'dịch vụ điều hành trong đơn'],
      ['operationVouchers', 'phiếu điều hành'],
      ['financePayments', 'phiếu chi'],
      ['financeCashflowEntries', 'dòng tiền'],
      ['supplierLedgerEntries', 'sổ công nợ nhà cung cấp'],
      ['supplierPaymentItems', 'yêu cầu thanh toán'],
      ['operationServices', 'dịch vụ điều hành'],
      ['quoteComboItems', 'dịch vụ combo'],
      ['quotationItems', 'hạng mục báo giá'],
      ['tourSuppliers', 'nhà cung cấp trong tour'],
      ['tourServices', 'dịch vụ tour'],
      ['tourCosts', 'chi phí tour'],
      ['fitBudgetServices', 'dự toán FIT'],
      ['fitOperationServices', 'điều hành FIT'],
      ['allotmentAllocations', 'phân bổ quỹ phòng đang khóa hoặc đã xác nhận'],
      ['supplierServices', 'dịch vụ nhà cung cấp'],
      ['allotments', 'quỹ phòng'],
      ['files', 'file nhà cung cấp'],
    ];
    return labels
      .filter(([key]) => usage[key] > 0)
      .map(([key, label]) => `${usage[key]} ${label}`)
      .join(', ');
  }

  private actorFrom(dtoActor?: string | null, user?: RequestUser) {
    return this.optionalText(user?.id) || this.optionalText(user?.email) || this.optionalText(user?.username) || this.optionalText(dtoActor) || null;
  }

  private rethrowSupplierUniqueConflict(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException(SUPPLIER_ERRORS.codeExists);
    }
    throw error;
  }

  private supplierImportCodeKey(value: unknown) {
    const code = typeof value === 'string' ? value.trim() : null;
    return code ? code.toUpperCase() : null;
  }

  private addSupplierImportError(errors: SupplierImportError[], line: number, field: string, error: unknown) {
    errors.push({ line, field, message: this.supplierImportErrorMessage(error) });
  }

  private supplierImportErrorMessage(error: unknown) {
    if (error instanceof Error && error.message) return error.message;
    if (typeof error === 'string') return error;
    return 'Dữ liệu import nhà cung cấp không hợp lệ';
  }

  private toSupplierStatus(value: unknown) {
    if (Object.values(SupplierStatus).includes(value as SupplierStatus)) return value as SupplierStatus;
    throw new BadRequestException('Trạng thái nhà cung cấp không hợp lệ');
  }

  private requestedSupplierStatusChange(current: SupplierStatus, requested: unknown) {
    if (requested === undefined) return null;
    const next = this.toSupplierStatus(requested);
    if (current === next) return null;
    this.ensureSupplierStatusTransition(current, next);
    return next;
  }

  private ensureSupplierStatusTransition(current: SupplierStatus, next: SupplierStatus) {
    if (current === next) {
      throw new BadRequestException(`Nhà cung cấp đã ở trạng thái ${SUPPLIER_STATUS_LABELS[next]}`);
    }
    if (!SUPPLIER_STATUS_TRANSITIONS[current]?.includes(next)) {
      throw new BadRequestException('Chuyển trạng thái nhà cung cấp không hợp lệ');
    }
  }

  private toDayType(value?: unknown, subject = 'dịch vụ') {
    if (value === undefined || value === null || value === '') return SupplierDayType.ALL_DAYS;
    if (Object.values(SupplierDayType).includes(value as SupplierDayType)) return value as SupplierDayType;
    if (subject === 'dịch vụ') throw new BadRequestException('Loại ngày dịch vụ không hợp lệ');
    throw new BadRequestException(`Loại ngày ${subject} không hợp lệ`);
  }

  private toAllotmentStatus(value?: unknown): SupplierAllotmentStatus {
    if (value === undefined || value === null || value === '') return 'ACTIVE';
    if (SUPPLIER_ALLOTMENT_STATUSES.includes(value as SupplierAllotmentStatus)) return value as SupplierAllotmentStatus;
    throw new BadRequestException('Trạng thái quỹ phòng không hợp lệ');
  }

  private optionalArray<T>(value: T[] | undefined | null, fieldName: string) {
    if (value === undefined) return undefined;
    if (!Array.isArray(value)) throw new BadRequestException(`${fieldName} phải là danh sách hợp lệ`);
    return value;
  }

  private optionalCode(value?: unknown, fieldName = 'Mã', maxLength = MAX_SUPPLIER_CODE_LENGTH) {
    const code = this.optionalMaxText(value, fieldName, maxLength);
    return code ? code.toUpperCase() : null;
  }

  private optionalText(value?: unknown, fieldName = 'Giá trị văn bản') {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'string') throw new BadRequestException(`${fieldName} phải là chuỗi ký tự`);
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  private optionalMaxText(value: unknown, fieldName: string, maxLength: number) {
    const text = this.optionalText(value, fieldName);
    if (text && text.length > maxLength) throw new BadRequestException(`${fieldName} không được vượt quá ${maxLength} ký tự`);
    return text;
  }

  private optionalMaxLabel(value: unknown, fieldName: string, maxLength: number) {
    const label = this.optionalLabel(value, fieldName);
    if (label && label.length > maxLength) throw new BadRequestException(`${fieldName} không được vượt quá ${maxLength} ký tự`);
    return label;
  }

  private optionalSku(value: unknown, fieldName: string) {
    const sku = this.optionalMaxText(value, fieldName, MAX_SUPPLIER_SERVICE_SKU_LENGTH);
    return sku ? sku.toUpperCase() : null;
  }

  private optionalPhoneText(value?: unknown, fieldName = 'Số điện thoại', maxLength = SUPPLIER_PHONE_MAX_LENGTH) {
    const phone = this.optionalText(value, fieldName);
    if (phone && phone.length > maxLength) {
      throw new BadRequestException(`${fieldName} không được vượt quá ${maxLength} ký tự`);
    }
    if (phone && !SUPPLIER_PHONE_PATTERN.test(phone)) {
      throw new BadRequestException(`${fieldName} không hợp lệ`);
    }
    return phone;
  }

  private optionalEmailText(value?: unknown, fieldName = 'Email') {
    const email = this.optionalText(value, fieldName);
    if (!email) return null;
    if (email.length > 180) throw new BadRequestException(`${fieldName} không được vượt quá 180 ký tự`);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException(`${fieldName} không hợp lệ`);
    }
    return email;
  }

  private optionalLabel(value?: unknown, fieldName = 'Nhãn') {
    return this.optionalText(value, fieldName)?.replace(/\s+/g, ' ') ?? null;
  }

  private optionalUrlText(value?: unknown, fieldName = 'Liên kết', maxLength = MAX_SUPPLIER_URL_LENGTH) {
    const text = this.optionalText(value, fieldName);
    if (!text) return null;
    if (text.length > maxLength) throw new BadRequestException(`${fieldName} không được vượt quá ${maxLength} ký tự`);
    let url: URL;
    try {
      url = new URL(text);
    } catch {
      throw new BadRequestException(`${fieldName} phải là URL hợp lệ bắt đầu bằng http:// hoặc https://`);
    }
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
      throw new BadRequestException(`${fieldName} phải là URL hợp lệ bắt đầu bằng http:// hoặc https://`);
    }
    return text;
  }

  private optionalNumber(value?: unknown, fieldName = 'Giá trị số') {
    if (value === undefined || value === null || value === '') return null;
    const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.trim()) : Number.NaN;
    if (!Number.isFinite(number)) throw new BadRequestException(`${fieldName} không hợp lệ`);
    return number;
  }

  private optionalRating(value?: unknown, fieldName = 'Xếp hạng') {
    const rating = this.optionalNumber(value, fieldName);
    if (rating === null) return null;
    if (!Number.isInteger(rating)) throw new BadRequestException(`${fieldName} phải là số nguyên`);
    if (rating < 0 || rating > MAX_SUPPLIER_RATING) {
      throw new BadRequestException(`${fieldName} phải nằm trong khoảng 0-${MAX_SUPPLIER_RATING}`);
    }
    return rating;
  }

  private optionalHotelBuiltYear(value?: unknown) {
    const year = this.optionalNonNegativeInt(value, 'Năm xây dựng');
    if (year === null) return null;
    const maxYear = new Date().getFullYear();
    if (year < MIN_HOTEL_BUILT_YEAR || year > maxYear) {
      throw new BadRequestException(`Năm xây dựng phải nằm trong khoảng ${MIN_HOTEL_BUILT_YEAR}-${maxYear}`);
    }
    return year;
  }

  private optionalNonNegativeNumber(value?: unknown, fieldName = 'Giá trị số') {
    const number = this.optionalNumber(value, fieldName);
    if (number !== null && number < 0) throw new BadRequestException(`${fieldName} không được âm`);
    return number;
  }

  private optionalMoney(value?: unknown, fieldName = 'Giá trị tiền') {
    const number = this.optionalNonNegativeNumber(value, fieldName);
    if (number !== null && number > MAX_SUPPLIER_MONEY) {
      throw new BadRequestException(`${fieldName} không được vượt quá 999.999.999.999`);
    }
    return number;
  }

  private optionalNonNegativeInt(value?: unknown, fieldName = 'Giá trị số') {
    const number = this.optionalNonNegativeNumber(value, fieldName);
    if (number !== null && !Number.isInteger(number)) throw new BadRequestException(`${fieldName} phải là số nguyên`);
    return number;
  }

  private optionalCutoffDays(value?: unknown, fieldName = 'Số ngày chốt quỹ phòng') {
    const number = this.optionalNonNegativeInt(value, fieldName);
    if (number !== null && number > MAX_SUPPLIER_ALLOTMENT_CUTOFF_DAYS) {
      throw new BadRequestException(`${fieldName} không được vượt quá ${MAX_SUPPLIER_ALLOTMENT_CUTOFF_DAYS} ngày`);
    }
    return number;
  }

  private startOfUtcDay(value: Date) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }

  private parseDateOnly(value: string, fieldName: string) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) throw new BadRequestException(`${fieldName} phải có định dạng YYYY-MM-DD`);
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    if (date.getUTCFullYear() !== Number(match[1]) || date.getUTCMonth() !== Number(match[2]) - 1 || date.getUTCDate() !== Number(match[3])) {
      throw new BadRequestException(`${fieldName} không hợp lệ`);
    }
    return date;
  }

  private optionalDateOnlyValue(value?: string | null, fieldName = 'Ngày') {
    const text = this.optionalText(value, fieldName);
    return text ? this.parseDateOnly(text, fieldName) : null;
  }

  private optionalDate(value?: string | null, fieldName = 'Ngày') {
    const text = this.optionalText(value, fieldName);
    if (!text) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return this.parseDateOnly(text, fieldName);
    if (!this.isValidDatePrefix(text)) throw new BadRequestException(`${fieldName} kh\u00f4ng h\u1ee3p l\u1ec7`);
    const date = new Date(text);
    if (Number.isNaN(date.getTime())) throw new BadRequestException(`${fieldName} không hợp lệ`);
    return date;
  }

  private optionalDateRange(startValue: string | undefined, endValue: string | undefined, subject: string) {
    const startDate = this.optionalDateOnlyValue(startValue, `Ngày bắt đầu ${subject}`);
    const endDate = this.optionalDateOnlyValue(endValue, `Ngày kết thúc ${subject}`);
    if (startDate && endDate && startDate > endDate) {
      throw new BadRequestException(`Ngày bắt đầu ${subject} không được sau ngày kết thúc ${subject}`);
    }
    return { startDate, endDate };
  }
}

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Order, OrderType, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { branchDepartmentScopeWhere, RequestUser } from '../auth/data-scope';
import { containsSearch, normalizeListSearch } from '../list-search';

type ReportQuery = Record<string, string | undefined>;
type TourFinanceRow = Prisma.TourGetPayload<{
  include: {
    customers: true;
    revenues: true;
    costs: true;
    services: true;
    financeReceipts: true;
    financePayments: true;
  };
}>;
type MetricRow = {
  key: string;
  label: string;
  orderCount: number;
  customerCount: number;
  revenue: number;
  paidAmount: number;
  remainingRevenue: number;
  cost: number;
  paidCost: number;
  remainingCost: number;
  profit: number;
  commission: number;
  marginRate: number;
};
type ReportGroupKey =
  | 'by-created-date'
  | 'by-checkin-date'
  | 'by-checkout-date'
  | 'by-approved-date'
  | 'by-employee'
  | 'by-agency'
  | 'by-branch'
  | 'by-department'
  | 'by-market'
  | 'by-type';
type ExportReportKey = 'revenue' | 'profit' | 'finance' | 'customer-debt' | 'supplier-debt' | 'employees';

const REPORT_GROUPS = new Set<ReportGroupKey>([
  'by-created-date',
  'by-checkin-date',
  'by-checkout-date',
  'by-approved-date',
  'by-employee',
  'by-agency',
  'by-branch',
  'by-department',
  'by-market',
  'by-type',
]);
const EXPORT_REPORTS = new Set<ExportReportKey>(['revenue', 'profit', 'finance', 'customer-debt', 'supplier-debt', 'employees']);

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(query: ReportQuery, user?: RequestUser) {
    const orders = await this.orders(query, user);
    const summary = this.summary(orders);
    const supplierDebt = await this.supplierDebt(query, user);
    return {
      ...summary,
      totalOrders: orders.length,
      totalCustomers: this.uniqueCount(orders.map((order) => order.customerPhone || order.customerEmail || order.customerName || order.id)),
      supplierDebtCount: supplierDebt.rows.length,
      unpaidOrders: orders.filter((order) => Number(order.remainingRevenue) > 0).length,
      unpaidCostOrders: orders.filter((order) => Number(order.remainingCost) > 0).length,
      settledOrders: orders.filter((order) => order.settledAt).length,
      byType: this.groupOrders(orders, 'by-type').rows,
      byMonth: this.groupOrders(orders, 'by-created-date', 'month').rows,
    };
  }

  async businessSummary(query: ReportQuery, user?: RequestUser) {
    const orders = await this.orders(query, user);
    return {
      summary: this.summary(orders),
      revenueByType: this.groupOrders(orders, 'by-type').rows,
      revenueByBranch: this.groupOrders(orders, 'by-branch').rows,
      profitByEmployee: this.groupOrders(orders, 'by-employee').rows,
      recentOrders: orders.slice(0, 100),
    };
  }

  async revenue(groupBy: string, query: ReportQuery, user?: RequestUser) {
    const group = this.normalizeGroup(groupBy);
    const orders = await this.orders({ ...query, dateField: this.dateFieldFromGroup(group, query.dateField) }, user);
    return this.groupOrders(orders, group);
  }

  async profit(query: ReportQuery, user?: RequestUser) {
    const groupBy = this.normalizeGroup(query.groupBy || 'by-employee');
    const result = this.groupOrders(await this.orders({ ...query, dateField: this.dateFieldFromGroup(groupBy, query.dateField) }, user), groupBy);
    return { ...result, rows: result.rows.map((row) => ({ ...row, profitAfterCommission: row.profit - row.commission })) };
  }

  async finance(query: ReportQuery, user?: RequestUser) {
    const tours = await this.tours(query, user);
    const byType = this.groupTours(tours, 'by-type').rows;
    return {
      summary: this.tourFinanceSummary(tours),
      rows: byType,
      byType,
      cashflowByMonth: this.groupTours(tours, 'by-created-date', 'month').rows.map((row) => ({
        period: row.key,
        received: row.paidAmount,
        paid: row.paidCost,
        netCashflow: row.paidAmount - row.paidCost,
      })),
      tours: tours.slice(0, 300),
    };
  }

  async orderHistory(orderId: string, user?: RequestUser) {
    const order = await this.prisma.order.findFirst({
      where: branchDepartmentScopeWhere({ id: orderId, deletedAt: null }, user),
      include: { logs: { orderBy: { createdAt: 'desc' } }, salesItems: true, operationItems: { include: { supplier: true } } },
    });
    if (!order) throw new NotFoundException('Không tìm thấy đơn hàng');
    return order;
  }

  async customerDebt(query: ReportQuery, user?: RequestUser) {
    const entries = await this.prisma.customerLedgerEntry.findMany({
      where: branchDepartmentScopeWhere(this.customerDebtWhere(query), user),
      include: { customer: true, order: true, tour: true, receipt: true, invoice: true },
      orderBy: [{ documentDate: 'desc' }, { createdAt: 'desc' }],
      take: 1000,
    });
    const rows = this.customerDebtRows(entries);
    return {
      summary: this.customerDebtSummary(rows),
      rows,
    };
  }

  async supplierDebt(query: ReportQuery, user?: RequestUser) {
    const entries = await this.prisma.supplierLedgerEntry.findMany({
      where: branchDepartmentScopeWhere(this.supplierDebtWhere(query), user),
      include: { supplier: { include: { category: true } }, order: true, tour: true, operationVoucher: true, payment: true },
      orderBy: [{ documentDate: 'desc' }, { createdAt: 'desc' }],
      take: 1000,
    });
    const rows = this.supplierDebtRows(entries);
    return {
      summary: this.supplierDebtSummary(rows),
      rows,
    };
  }

  async supplierHistory(supplierId: string, query: ReportQuery, user?: RequestUser) {
    return this.prisma.operationVoucher.findMany({
      where: branchDepartmentScopeWhere({ deletedAt: null, supplierId, ...this.dateRange('serviceDate', query.dateFrom, query.dateTo) }, user),
      include: { payments: true },
      orderBy: [{ serviceDate: 'desc' }, { voucherCode: 'asc' }],
      take: 300,
    });
  }

  async employees(query: ReportQuery, user?: RequestUser) {
    return this.employeePerformance(query, user);
  }

  async employeePerformance(query: ReportQuery, user?: RequestUser) {
    const orders = await this.orders(query, user);
    const rows = this.groupOrders(orders, 'by-employee').rows.map((row) => ({
      ...row,
      averageOrderValue: row.orderCount ? row.revenue / row.orderCount : 0,
      profitAfterCommission: row.profit - row.commission,
      commission: row.commission,
      paidRatio: row.revenue ? (row.paidAmount / row.revenue) * 100 : 0,
    }));
    return { summary: this.summary(orders), rows };
  }

  async exportCsv(report: string, query: ReportQuery, user?: RequestUser) {
    const reportKey = this.normalizeExportReport(report);
    if (reportKey === 'customer-debt') return this.toCsv((await this.customerDebt(query, user)).rows);
    if (reportKey === 'supplier-debt') return this.toCsv((await this.supplierDebt(query, user)).rows);
    if (reportKey === 'finance') return this.toCsv((await this.finance(query, user)).rows || []);
    if (reportKey === 'employees') return this.toCsv((await this.employeePerformance(query, user)).rows);
    if (reportKey === 'profit') return this.toCsv((await this.profit(query, user)).rows);
    return this.toCsv((await this.revenue(query.groupBy || 'by-created-date', query, user)).rows);
  }

  private async orders(query: ReportQuery, user?: RequestUser) {
    return this.prisma.order.findMany({
      where: branchDepartmentScopeWhere(this.orderWhere(query), user),
      include: { _count: { select: { members: true, operationItems: true } } },
      orderBy: [{ createdAt: 'desc' }, { systemCode: 'asc' }],
      take: 1000,
    });
  }

  private async tours(query: ReportQuery, user?: RequestUser) {
    return this.prisma.tour.findMany({
      where: branchDepartmentScopeWhere(this.tourWhere(query), user),
      include: {
        customers: true,
        revenues: true,
        costs: true,
        services: true,
        financeReceipts: { where: { deletedAt: null } },
        financePayments: { where: { deletedAt: null } },
      },
      orderBy: [{ createdAt: 'desc' }, { systemCode: 'asc' }],
      take: 1000,
    });
  }

  private orderWhere(query: ReportQuery): Prisma.OrderWhereInput {
    const dateField = this.normalizeDateField(query.dateField);
    const search = normalizeListSearch(query.search);
    const contains = search ? containsSearch(search) : undefined;
    return {
      deletedAt: null,
      ...(query.type ? { type: query.type as OrderType } : {}),
      ...(query.paymentStatus ? { paymentStatus: query.paymentStatus as any } : {}),
      ...(query.costStatus ? { costStatus: query.costStatus as any } : {}),
      ...(query.status ? { status: query.status as any } : {}),
      ...(query.branch ? { branch: { contains: query.branch, mode: 'insensitive' } } : {}),
      ...(query.department ? { department: { contains: query.department, mode: 'insensitive' } } : {}),
      ...(query.marketGroup ? { marketGroup: { contains: query.marketGroup, mode: 'insensitive' } } : {}),
      ...(query.employee
        ? { OR: [{ operatorOwner: { contains: query.employee, mode: 'insensitive' } }, { createdBy: { contains: query.employee, mode: 'insensitive' } }] }
        : {}),
      ...(query.agency ? { agencyName: { contains: query.agency, mode: 'insensitive' } } : {}),
      ...(query.customerType ? { customerType: { contains: query.customerType, mode: 'insensitive' } } : {}),
      ...(query.settled === 'true' ? { settledAt: { not: null } } : {}),
      ...(query.settled === 'false' ? { settledAt: null } : {}),
      ...(contains
        ? {
            OR: [
              { systemCode: contains },
              { tourCode: contains },
              { name: contains },
              { customerName: contains },
              { customerPhone: contains },
              { customerEmail: contains },
            ],
          }
        : {}),
      ...this.dateRange(dateField, query.dateFrom || query.createdFrom, query.dateTo || query.createdTo),
    };
  }

  private tourWhere(query: ReportQuery): Prisma.TourWhereInput {
    const dateField = this.normalizeTourDateField(query.dateField);
    const search = normalizeListSearch(query.search);
    const contains = search ? containsSearch(search) : undefined;
    return {
      deletedAt: null,
      ...(query.tourId ? { id: query.tourId } : {}),
      ...(query.type ? { type: query.type as any } : {}),
      ...(query.paymentStatus ? { paymentStatus: query.paymentStatus as any } : {}),
      ...(query.status ? { status: query.status as any } : {}),
      ...(query.branch ? { branch: { contains: query.branch, mode: 'insensitive' } } : {}),
      ...(query.department ? { department: { contains: query.department, mode: 'insensitive' } } : {}),
      ...(query.marketGroup ? { marketGroup: { contains: query.marketGroup, mode: 'insensitive' } } : {}),
      ...(query.employee
        ? { OR: [{ operatorOwner: { contains: query.employee, mode: 'insensitive' } }, { createdBy: { contains: query.employee, mode: 'insensitive' } }] }
        : {}),
      ...(contains
        ? {
            OR: [
              { systemCode: contains },
              { tourCode: contains },
              { name: contains },
              { customers: { some: { name: contains } } },
            ],
          }
        : {}),
      ...this.dateRange(dateField, query.dateFrom || query.createdFrom, query.dateTo || query.createdTo),
    };
  }

  private customerDebtWhere(query: ReportQuery): Prisma.CustomerLedgerEntryWhereInput {
    const orderWhere = this.orderRelationWhere(query);
    const search = normalizeListSearch(query.search);
    const contains = search ? containsSearch(search) : undefined;
    return {
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.tourId ? { tourId: query.tourId } : {}),
      ...(query.branch ? { branch: { contains: query.branch, mode: 'insensitive' } } : {}),
      ...(query.department ? { department: { contains: query.department, mode: 'insensitive' } } : {}),
      ...(query.employee ? { staff: { contains: query.employee, mode: 'insensitive' } } : {}),
      ...(Object.keys(orderWhere).length ? { order: { is: orderWhere } } : {}),
      ...(contains
        ? {
            OR: [
              { documentCode: contains },
              { description: contains },
              { customer: { is: { code: contains } } },
              { customer: { is: { fullName: contains } } },
              { customer: { is: { phone: contains } } },
              { order: { is: { systemCode: contains } } },
              { tour: { is: { systemCode: contains } } },
              { tour: { is: { tourCode: contains } } },
            ],
          }
        : {}),
      ...this.dateRange('documentDate', query.dateFrom || query.createdFrom || query.from, query.dateTo || query.createdTo || query.to),
    };
  }

  private supplierDebtWhere(query: ReportQuery): Prisma.SupplierLedgerEntryWhereInput {
    const orderWhere = this.orderRelationWhere(query);
    const search = normalizeListSearch(query.search);
    const contains = search ? containsSearch(search) : undefined;
    return {
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(query.tourId ? { tourId: query.tourId } : {}),
      ...(query.branch ? { branch: { contains: query.branch, mode: 'insensitive' } } : {}),
      ...(query.department ? { department: { contains: query.department, mode: 'insensitive' } } : {}),
      ...(query.employee ? { staff: { contains: query.employee, mode: 'insensitive' } } : {}),
      ...(Object.keys(orderWhere).length ? { order: { is: orderWhere } } : {}),
      ...(query.supplier ? { supplier: { is: { name: { contains: query.supplier, mode: 'insensitive' } } } } : {}),
      ...(contains
        ? {
            OR: [
              { documentCode: contains },
              { description: contains },
              { supplier: { is: { supplierCode: contains } } },
              { supplier: { is: { name: contains } } },
              { supplier: { is: { phone: contains } } },
              { order: { is: { systemCode: contains } } },
              { tour: { is: { systemCode: contains } } },
              { tour: { is: { tourCode: contains } } },
              { operationVoucher: { is: { voucherCode: contains } } },
              { operationVoucher: { is: { serviceName: contains } } },
            ],
          }
        : {}),
      ...this.dateRange('documentDate', query.dateFrom || query.createdFrom || query.from, query.dateTo || query.createdTo || query.to),
    };
  }

  private orderRelationWhere(query: ReportQuery): Prisma.OrderWhereInput {
    return {
      ...(query.type ? { type: query.type as OrderType } : {}),
      ...(query.paymentStatus ? { paymentStatus: query.paymentStatus as any } : {}),
      ...(query.costStatus ? { costStatus: query.costStatus as any } : {}),
      ...(query.status ? { status: query.status as any } : {}),
      ...(query.marketGroup ? { marketGroup: { contains: query.marketGroup, mode: 'insensitive' } } : {}),
      ...(query.agency ? { agencyName: { contains: query.agency, mode: 'insensitive' } } : {}),
      ...(query.customerType ? { customerType: { contains: query.customerType, mode: 'insensitive' } } : {}),
      ...(query.settled === 'true' ? { settledAt: { not: null } } : {}),
      ...(query.settled === 'false' ? { settledAt: null } : {}),
    };
  }

  private groupOrders(orders: Order[], groupBy: string, dateMode: 'day' | 'month' = 'day') {
    const rows = new Map<string, MetricRow>();
    orders.forEach((order) => {
      const { key, label } = this.groupKey(order, groupBy, dateMode);
      const current = rows.get(key) || this.emptyRow(key, label);
      current.orderCount += 1;
      current.customerCount += order.customerPhone || order.customerEmail || order.customerName ? 1 : 0;
      current.revenue += Number(order.totalRevenue);
      current.paidAmount += Number(order.paidAmount);
      current.remainingRevenue += Number(order.remainingRevenue);
      current.cost += Number(order.totalCost);
      current.paidCost += Number(order.paidCost);
      current.remainingCost += Number(order.remainingCost);
      current.profit += Number(order.profit);
      current.commission += Number(order.commission);
      current.marginRate = current.revenue ? (current.profit / current.revenue) * 100 : 0;
      rows.set(key, current);
    });
    const list = [...rows.values()].sort((a, b) => b.revenue - a.revenue);
    return { summary: this.summary(orders), rows: list };
  }

  private groupTours(tours: TourFinanceRow[], groupBy: string, dateMode: 'day' | 'month' = 'day') {
    const rows = new Map<string, MetricRow>();
    tours.forEach((tour) => {
      const { key, label } = this.groupTourKey(tour, groupBy, dateMode);
      const current = rows.get(key) || this.emptyRow(key, label);
      const revenue = this.tourRevenue(tour);
      const paidAmount = this.tourPaidAmount(tour);
      const cost = this.tourCost(tour);
      const paidCost = this.tourPaidCost(tour);
      current.orderCount += 1;
      current.customerCount += tour.customers.length ? 1 : 0;
      current.revenue += revenue;
      current.paidAmount += paidAmount;
      current.remainingRevenue += Math.max(revenue - paidAmount, 0);
      current.cost += cost;
      current.paidCost += paidCost;
      current.remainingCost += Math.max(cost - paidCost, 0);
      current.profit += revenue - cost;
      current.marginRate = current.revenue ? (current.profit / current.revenue) * 100 : 0;
      rows.set(key, current);
    });
    const list = [...rows.values()].sort((a, b) => b.revenue - a.revenue);
    return { summary: this.tourFinanceSummary(tours), rows: list };
  }

  private customerDebtRows(entries: any[]) {
    const rows = new Map<string, any>();
    entries.forEach((entry) => {
      const key = entry.customerId;
      const current = rows.get(key) || {
        key,
        customerId: entry.customerId,
        customerCode: entry.customer?.code || '',
        customerName: entry.customer?.fullName || 'Chưa có khách',
        customerPhone: entry.customer?.phone || '',
        label: `${entry.customer?.fullName || 'Chưa có khách'} - ${entry.customer?.code || 'Chưa có mã KH'}`,
        orderIds: new Set<string>(),
        orderCodes: new Set<string>(),
        entryCount: 0,
        orderCount: 0,
        customerCount: 1,
        revenue: 0,
        paidAmount: 0,
        remainingRevenue: 0,
        cost: 0,
        paidCost: 0,
        remainingCost: 0,
        profit: 0,
        commission: 0,
        marginRate: 0,
      };
      current.entryCount += 1;
      current.revenue += Number(entry.debitAmount);
      current.paidAmount += Number(entry.creditAmount);
      current.remainingRevenue = current.revenue - current.paidAmount;
      if (entry.orderId) current.orderIds.add(entry.orderId);
      if (entry.order?.systemCode) current.orderCodes.add(entry.order.systemCode);
      if (entry.tourId) current.orderIds.add(entry.tourId);
      if (entry.tour?.systemCode) current.orderCodes.add(entry.tour.systemCode);
      rows.set(key, current);
    });
    return [...rows.values()]
      .map((row) => {
        const orderCodes = [...row.orderCodes];
        return {
          ...row,
          orderCount: row.orderIds.size || row.entryCount,
          systemCode: orderCodes.join(', '),
          orderCodes,
          orderIds: [...row.orderIds],
          totalRevenue: row.revenue,
          debitTotal: row.revenue,
          creditTotal: row.paidAmount,
          balance: row.remainingRevenue,
        };
      })
      .filter((row) => row.balance !== 0)
      .sort((left, right) => right.balance - left.balance);
  }

  private supplierDebtRows(entries: any[]) {
    const rows = new Map<string, any>();
    entries.forEach((entry) => {
      const key = entry.supplierId;
      const current = rows.get(key) || {
        key,
        supplierId: entry.supplierId,
        supplierCode: entry.supplier?.supplierCode || '',
        supplierName: entry.supplier?.name || 'Chưa gắn NCC',
        supplierType: entry.supplier?.category?.name || entry.operationVoucher?.serviceType || '',
        label: entry.supplier?.name || 'Chưa gắn NCC',
        orderIds: new Set<string>(),
        voucherIds: new Set<string>(),
        voucherCodes: new Set<string>(),
        entryCount: 0,
        voucherCount: 0,
        orderCount: 0,
        customerCount: 0,
        revenue: 0,
        paidAmount: 0,
        remainingRevenue: 0,
        totalPurchase: 0,
        totalCost: 0,
        cost: 0,
        paidCost: 0,
        remainingAmount: 0,
        remainingCost: 0,
        profit: 0,
        commission: 0,
        marginRate: 0,
      };
      current.entryCount += 1;
      current.totalPurchase += Number(entry.creditAmount);
      current.paidAmount += Number(entry.debitAmount);
      current.paidCost = current.paidAmount;
      current.totalCost = current.totalPurchase;
      current.cost = current.totalPurchase;
      current.remainingAmount = current.totalPurchase - current.paidAmount;
      current.remainingCost = current.remainingAmount;
      current.profit = -current.remainingAmount;
      if (entry.orderId) current.orderIds.add(entry.orderId);
      if (entry.tourId) current.orderIds.add(entry.tourId);
      if (entry.operationVoucherId) current.voucherIds.add(entry.operationVoucherId);
      if (entry.operationVoucher?.voucherCode) current.voucherCodes.add(entry.operationVoucher.voucherCode);
      rows.set(key, current);
    });
    return [...rows.values()]
      .map((row) => ({
        ...row,
        orderCount: row.orderIds.size,
        voucherCount: row.voucherIds.size || row.entryCount,
        voucherCodes: [...row.voucherCodes],
        voucherIds: [...row.voucherIds],
        orderIds: [...row.orderIds],
        debitTotal: row.totalPurchase,
        creditTotal: row.paidAmount,
        balance: row.remainingAmount,
      }))
      .filter((row) => row.balance !== 0)
      .sort((left, right) => right.balance - left.balance);
  }

  private customerDebtSummary(rows: any[]) {
    const totalRevenue = this.sum(rows, 'revenue');
    const paidAmount = this.sum(rows, 'paidAmount');
    const remainingRevenue = this.sum(rows, 'remainingRevenue');
    return {
      totalRevenue,
      paidAmount,
      remainingRevenue,
      totalCost: 0,
      paidCost: 0,
      remainingCost: 0,
      profit: 0,
      commission: 0,
      marginRate: 0,
      debit: totalRevenue,
      credit: paidAmount,
      balance: remainingRevenue,
      count: rows.length,
      orderCount: this.sum(rows, 'orderCount'),
      customerCount: rows.length,
    };
  }

  private supplierDebtSummary(rows: any[]) {
    const totalPurchase = this.sum(rows, 'totalPurchase');
    const paidAmount = this.sum(rows, 'paidAmount');
    const remainingAmount = this.sum(rows, 'remainingAmount');
    return {
      supplierCount: rows.length,
      totalPurchase,
      paidAmount,
      remainingAmount,
      totalRevenue: 0,
      remainingRevenue: 0,
      totalCost: totalPurchase,
      paidCost: paidAmount,
      remainingCost: remainingAmount,
      profit: -remainingAmount,
      commission: 0,
      marginRate: 0,
      debit: totalPurchase,
      credit: paidAmount,
      balance: remainingAmount,
      count: rows.length,
      orderCount: this.sum(rows, 'orderCount'),
      voucherCount: this.sum(rows, 'voucherCount'),
    };
  }

  private groupKey(order: Order, groupBy: string, dateMode: 'day' | 'month') {
    if (groupBy === 'by-checkin-date') return this.dateKey(order.startDate, dateMode);
    if (groupBy === 'by-checkout-date') return this.dateKey(order.endDate, dateMode);
    if (groupBy === 'by-approved-date') return this.dateKey(order.settledAt || order.updatedAt, dateMode);
    if (groupBy === 'by-employee') return this.textKey(order.operatorOwner || order.createdBy, 'Chưa gắn nhân viên');
    if (groupBy === 'by-agency') return this.textKey(order.agencyName, 'Khách trực tiếp');
    if (groupBy === 'by-branch') return this.textKey(order.branch, 'Chưa gắn chi nhánh');
    if (groupBy === 'by-department') return this.textKey(order.department, 'Chưa gắn phòng ban');
    if (groupBy === 'by-market') return this.textKey(order.marketGroup, 'Chưa gắn thị trường');
    if (groupBy === 'by-type') return this.textKey(order.type, 'Khác');
    return this.dateKey(order.createdAt, dateMode);
  }

  private groupTourKey(tour: TourFinanceRow, groupBy: string, dateMode: 'day' | 'month') {
    if (groupBy === 'by-checkin-date') return this.dateKey(tour.startDate, dateMode);
    if (groupBy === 'by-checkout-date') return this.dateKey(tour.endDate, dateMode);
    if (groupBy === 'by-approved-date') return this.dateKey(tour.closedAt || tour.updatedAt, dateMode);
    if (groupBy === 'by-employee') return this.textKey(tour.operatorOwner || tour.createdBy, 'Chua gan nhan vien');
    if (groupBy === 'by-agency') return this.textKey('Khach truc tiep', 'Khach truc tiep');
    if (groupBy === 'by-branch') return this.textKey(tour.branch, 'Chua gan chi nhanh');
    if (groupBy === 'by-department') return this.textKey(tour.department, 'Chua gan phong ban');
    if (groupBy === 'by-market') return this.textKey(tour.marketGroup, 'Chua gan thi truong');
    if (groupBy === 'by-type') return this.textKey(tour.type, 'Khac');
    return this.dateKey(tour.createdAt, dateMode);
  }

  private dateFieldFromGroup(groupBy: string, fallback?: string) {
    if (groupBy === 'by-checkin-date') return 'startDate';
    if (groupBy === 'by-checkout-date') return 'endDate';
    if (groupBy === 'by-approved-date') return 'settledAt';
    return fallback || 'createdAt';
  }

  private normalizeDateField(field?: string): 'createdAt' | 'bookingDate' | 'startDate' | 'endDate' | 'paymentDate' | 'settledAt' {
    const allowed = ['createdAt', 'bookingDate', 'startDate', 'endDate', 'paymentDate', 'settledAt'];
    return (allowed.includes(field || '') ? field : 'createdAt') as any;
  }

  private normalizeTourDateField(field?: string): 'createdAt' | 'bookingDate' | 'startDate' | 'endDate' | 'closedAt' {
    const allowed = ['createdAt', 'bookingDate', 'startDate', 'endDate', 'closedAt'];
    return (allowed.includes(field || '') ? field : 'createdAt') as any;
  }

  private dateRange(field: string, from?: string, to?: string) {
    if (!from && !to) return {};
    return { [field]: { ...(from ? { gte: this.startOfDay(from) } : {}), ...(to ? { lte: this.endOfDay(to) } : {}) } };
  }

  private summary(orders: Order[]) {
    const totalRevenue = orders.reduce((sum, order) => sum + Number(order.totalRevenue), 0);
    const paidAmount = orders.reduce((sum, order) => sum + Number(order.paidAmount), 0);
    const remainingRevenue = orders.reduce((sum, order) => sum + Number(order.remainingRevenue), 0);
    const totalCost = orders.reduce((sum, order) => sum + Number(order.totalCost), 0);
    const paidCost = orders.reduce((sum, order) => sum + Number(order.paidCost), 0);
    const remainingCost = orders.reduce((sum, order) => sum + Number(order.remainingCost), 0);
    const profit = orders.reduce((sum, order) => sum + Number(order.profit), 0);
    const commission = orders.reduce((sum, order) => sum + Number(order.commission), 0);
    return {
      totalRevenue,
      paidAmount,
      remainingRevenue,
      totalCost,
      paidCost,
      remainingCost,
      profit,
      commission,
      commissionRevenue: totalRevenue,
      marginRate: totalRevenue ? (profit / totalRevenue) * 100 : 0,
    };
  }

  private tourFinanceSummary(tours: TourFinanceRow[]) {
    const totalRevenue = tours.reduce((sum, tour) => sum + this.tourRevenue(tour), 0);
    const paidAmount = tours.reduce((sum, tour) => sum + this.tourPaidAmount(tour), 0);
    const totalCost = tours.reduce((sum, tour) => sum + this.tourCost(tour), 0);
    const paidCost = tours.reduce((sum, tour) => sum + this.tourPaidCost(tour), 0);
    const remainingRevenue = Math.max(totalRevenue - paidAmount, 0);
    const remainingCost = Math.max(totalCost - paidCost, 0);
    const profit = totalRevenue - totalCost;
    return {
      totalRevenue,
      paidAmount,
      remainingRevenue,
      totalCost,
      paidCost,
      remainingCost,
      profit,
      commission: 0,
      commissionRevenue: totalRevenue,
      marginRate: totalRevenue ? (profit / totalRevenue) * 100 : 0,
    };
  }

  private tourRevenue(tour: TourFinanceRow) {
    const explicit = tour.revenues.reduce((sum, row) => sum + Number(row.amount), 0);
    if (explicit > 0) return explicit;
    return tour.services.reduce((sum, row) => sum + Number(row.salesAmount), 0);
  }

  private tourCost(tour: TourFinanceRow) {
    const explicit = tour.costs.reduce((sum, row) => {
      const actual = Number(row.actualAmount);
      return sum + (actual > 0 ? actual : Number(row.expectedAmount));
    }, 0);
    if (explicit > 0) return explicit;
    return tour.services.reduce((sum, row) => sum + Number(row.confirmedAmount || row.budgetAmount), 0);
  }

  private tourPaidAmount(tour: TourFinanceRow) {
    return tour.financeReceipts
      .filter((row) => row.approvalStatus === 'APPROVED')
      .reduce((sum, row) => sum + Number(row.receiptAmount), 0);
  }

  private tourPaidCost(tour: TourFinanceRow) {
    return tour.financePayments
      .filter((row) => row.approvalStatus === 'APPROVED')
      .reduce((sum, row) => sum + Number(row.paymentAmount), 0);
  }

  private emptyRow(key: string, label: string): MetricRow {
    return { key, label, orderCount: 0, customerCount: 0, revenue: 0, paidAmount: 0, remainingRevenue: 0, cost: 0, paidCost: 0, remainingCost: 0, profit: 0, commission: 0, marginRate: 0 };
  }

  private dateKey(date: Date | null, mode: 'day' | 'month') {
    if (!date) return { key: 'NO_DATE', label: 'Chưa có ngày' };
    const iso = date.toISOString();
    const key = mode === 'month' ? iso.slice(0, 7) : iso.slice(0, 10);
    return { key, label: key };
  }

  private textKey(value: unknown, fallback: string) {
    const label = String(value || '').trim() || fallback;
    return { key: label, label };
  }

  private uniqueCount(values: string[]) {
    return new Set(values.filter(Boolean)).size;
  }

  private sum(rows: any[], field: string) {
    return rows.reduce((total, row) => total + Number(row[field] || 0), 0);
  }

  private normalizeGroup(groupBy: string): ReportGroupKey {
    if (REPORT_GROUPS.has(groupBy as ReportGroupKey)) return groupBy as ReportGroupKey;
    throw new BadRequestException(`Nhóm báo cáo không được hỗ trợ: ${groupBy}`);
  }

  private normalizeExportReport(report: string): ExportReportKey {
    if (EXPORT_REPORTS.has(report as ExportReportKey)) return report as ExportReportKey;
    throw new BadRequestException(`Báo cáo export không được hỗ trợ: ${report}`);
  }

  private startOfDay(value: string) {
    const date = new Date(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) date.setHours(0, 0, 0, 0);
    return date;
  }

  private endOfDay(value: string) {
    const date = new Date(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) date.setHours(23, 59, 59, 999);
    return date;
  }

  private toCsv(rows: any[]) {
    if (!rows.length) return '';
    const headers = Object.keys(rows[0]);
    return [
      headers.join(','),
      ...rows.map((row) => headers.map((header) => this.csv(row[header])).join(',')),
    ].join('\n');
  }

  private csv(value: unknown) {
    if (value instanceof Date) return value.toISOString();
    const text = String(value ?? '');
    return `"${text.replaceAll('"', '""')}"`;
  }
}

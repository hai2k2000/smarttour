import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Order, OrderCostStatus, OrderPaymentStatus, OrderStatus, OrderType, PaymentStatus, Prisma, TourStatus, TourType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { branchDepartmentScopeWhere, RequestUser } from '../auth/data-scope';
import { containsSearch, normalizeListSearch } from '../list-search';
import { ReportQueryDto } from './dto/report-query.dto';

type ReportQuery = ReportQueryDto;
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
type FinanceReceiptReportRow = Prisma.FinanceReceiptGetPayload<{
  include: {
    customer: true;
    orders: true;
  };
}>;
type FinancePaymentReportRow = Prisma.FinancePaymentGetPayload<{
  include: {
    supplier: true;
    order: true;
    tour: true;
    operationVoucher: true;
  };
}>;
type FinanceCashflowReportRow = Prisma.FinanceCashflowEntryGetPayload<{
  include: {
    order: true;
    tour: true;
    customer: true;
    supplier: true;
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
const ORDER_TYPES = new Set<string>(Object.values(OrderType));
const TOUR_TYPES = new Set<string>(Object.values(TourType));
const ORDER_STATUSES = new Set<string>(Object.values(OrderStatus));
const TOUR_STATUSES = new Set<string>(Object.values(TourStatus));
const ORDER_PAYMENT_STATUSES = new Set<string>(Object.values(OrderPaymentStatus));
const TOUR_PAYMENT_STATUSES = new Set<string>(Object.values(PaymentStatus));
const ORDER_COST_STATUSES = new Set<string>(Object.values(OrderCostStatus));
const ORDER_DATE_FIELDS = ['createdAt', 'bookingDate', 'startDate', 'endDate', 'paymentDate', 'settledAt'] as const;
const TOUR_DATE_FIELDS = ['createdAt', 'bookingDate', 'startDate', 'endDate', 'closedAt'] as const;
const FINANCE_DATE_FIELDS = ['createdAt', 'bookingDate', 'startDate', 'endDate', 'paymentDate', 'settledAt', 'documentDate'] as const;
type OrderDateField = typeof ORDER_DATE_FIELDS[number];
type TourDateField = typeof TOUR_DATE_FIELDS[number];
type FinanceDateField = typeof FINANCE_DATE_FIELDS[number];


@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(query: ReportQuery, user?: RequestUser) {
    const [summary, counts, totalCustomers, supplierDebtCount, byType, byMonth] = await Promise.all([
      this.orderSummaryFromDb(query, user),
      this.orderOverviewCountsFromDb(query, user),
      this.orderCustomerCountFromDb(query, user),
      this.supplierDebtCountFromDb(query, user),
      this.orderOverviewByTypeFromDb(query, user),
      this.orderOverviewByMonthFromDb(query, user),
    ]);
    return {
      ...summary,
      ...counts,
      totalCustomers,
      supplierDebtCount,
      byType,
      byMonth,
    };
  }

  async businessSummary(query: ReportQuery, user?: RequestUser) {
    const [orders, summary] = await Promise.all([
      this.orders(query, user),
      this.orderSummaryFromDb(query, user),
    ]);
    return {
      summary,
      revenueByType: this.groupOrders(orders, 'by-type').rows,
      revenueByBranch: this.groupOrders(orders, 'by-branch').rows,
      profitByEmployee: this.groupOrders(orders, 'by-employee').rows,
      recentOrders: orders.slice(0, 100),
    };
  }

  async revenue(groupBy: string, query: ReportQuery, user?: RequestUser) {
    this.assertOrderQuery(query);
    const group = this.normalizeGroup(groupBy);
    const scopedQuery = { ...query, dateField: this.dateFieldFromGroup(group, query.dateField) };
    const [orders, summary] = await Promise.all([
      this.orders(scopedQuery, user),
      this.orderSummaryFromDb(scopedQuery, user),
    ]);
    return { ...this.groupOrders(orders, group), summary };
  }

  async profit(query: ReportQuery, user?: RequestUser) {
    this.assertOrderQuery(query);
    const groupBy = this.normalizeGroup(query.groupBy || 'by-employee');
    const scopedQuery = { ...query, dateField: this.dateFieldFromGroup(groupBy, query.dateField) };
    const [orders, summary] = await Promise.all([
      this.orders(scopedQuery, user),
      this.orderSummaryFromDb(scopedQuery, user),
    ]);
    const result = this.groupOrders(orders, groupBy);
    return { ...result, summary, rows: result.rows.map((row) => ({ ...row, profitAfterCommission: row.profit - row.commission })) };
  }

  async finance(query: ReportQuery, user?: RequestUser) {
    this.assertFinanceQuery(query);
    const orders = await this.orders(this.financeOrderQuery(query), user);
    const [receiptRows, paymentRows, cashflowRows, financeSummary, cashflowByMonth, customerDebtReport, supplierDebtReport] = await Promise.all([
      this.financeReceiptRows(query, user),
      this.financePaymentRows(query, user),
      this.financeCashflowRows(query, user),
      this.financeSummaryFromDb(query, user),
      this.financeCashflowByMonthFromDb(query, user),
      this.customerDebt({ ...query, dateField: 'documentDate' }, user),
      this.supplierDebt({ ...query, dateField: 'documentDate' }, user),
    ]);
    const orderRows = this.financeOrderRows(orders, receiptRows, paymentRows, cashflowRows);
    const orphanReceiptRows = this.orphanReceiptRows(receiptRows);
    const orphanPaymentRows = this.orphanPaymentRows(paymentRows);
    const reconciliationRows = this.financeReconciliationRows(orderRows, orphanReceiptRows, orphanPaymentRows);
    const grouped = this.groupFinanceOrderRows(orderRows, 'by-type');
    const summary = {
      ...grouped.summary,
      totalReceipt: financeSummary.totalReceipt,
      totalPayment: financeSummary.totalPayment,
      netCashflow: financeSummary.netCashflow,
      receiptCount: financeSummary.receiptCount,
      paymentCount: financeSummary.paymentCount,
      customerDebtBalance: Number(customerDebtReport.summary?.balance || customerDebtReport.summary?.remainingRevenue || 0),
      supplierDebtBalance: Number(supplierDebtReport.summary?.balance || supplierDebtReport.summary?.remainingAmount || 0),
      issueCount: reconciliationRows.length,
      orderCount: orderRows.length,
    };
    return {
      summary,
      rows: grouped.rows,
      byType: grouped.rows,
      cashflowByMonth,
      orders: orders.slice(0, 300),
      orderRows,
      receiptRows: receiptRows.map((row) => this.receiptRows(row)),
      paymentRows: paymentRows.map((row) => this.paymentRows(row)),
      customerDebtRows: customerDebtReport.rows,
      supplierDebtRows: supplierDebtReport.rows,
      reconciliationRows,
      orphanReceiptRows,
      orphanPaymentRows,
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
    this.assertDebtQuery(query);
    const where = branchDepartmentScopeWhere(this.customerDebtWhere(query), user);
    const entries = await this.prisma.customerLedgerEntry.findMany({
      where,
      include: { customer: true, order: true, tour: true, receipt: true, invoice: true },
      orderBy: [{ documentDate: 'desc' }, { createdAt: 'desc' }],
      take: 1000,
    });
    const rows = this.customerDebtRows(entries);
    return {
      summary: await this.customerDebtSummaryFromDb(where),
      rows,
    };
  }

  async supplierDebt(query: ReportQuery, user?: RequestUser) {
    this.assertDebtQuery(query);
    const where = branchDepartmentScopeWhere(this.supplierDebtWhere(query), user);
    const entries = await this.prisma.supplierLedgerEntry.findMany({
      where,
      include: { supplier: { include: { category: true } }, order: true, tour: true, operationVoucher: true, payment: true },
      orderBy: [{ documentDate: 'desc' }, { createdAt: 'desc' }],
      take: 1000,
    });
    const rows = this.supplierDebtRows(entries);
    return {
      summary: await this.supplierDebtSummaryFromDb(where),
      rows,
    };
  }

  async supplierHistory(supplierId: string, query: ReportQuery, user?: RequestUser) {
    this.assertSupplierHistoryQuery(query);
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
    const [orders, summary] = await Promise.all([
      this.orders(query, user),
      this.orderSummaryFromDb(query, user),
    ]);
    const rows = this.groupOrders(orders, 'by-employee').rows.map((row) => ({
      ...row,
      averageOrderValue: row.orderCount ? row.revenue / row.orderCount : 0,
      profitAfterCommission: row.profit - row.commission,
      commission: row.commission,
      paidRatio: row.revenue ? (row.paidAmount / row.revenue) * 100 : 0,
    }));
    return { summary, rows };
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
    this.assertOrderQuery(query);
    return this.prisma.order.findMany({
      where: branchDepartmentScopeWhere(this.orderWhere(query), user),
      include: { _count: { select: { members: true, operationItems: true } } },
      orderBy: [{ createdAt: 'desc' }, { systemCode: 'asc' }],
      take: 1000,
    });
  }

  private async orderSummaryFromDb(query: ReportQuery, user?: RequestUser) {
    this.assertOrderQuery(query);
    const total = await this.prisma.order.aggregate({
      where: branchDepartmentScopeWhere(this.orderWhere(query), user),
      _sum: {
        totalRevenue: true,
        paidAmount: true,
        remainingRevenue: true,
        totalCost: true,
        paidCost: true,
        remainingCost: true,
        profit: true,
        commission: true,
      },
    });
    const totalRevenue = Number(total._sum.totalRevenue ?? 0);
    const profit = Number(total._sum.profit ?? 0);
    return {
      totalRevenue,
      paidAmount: Number(total._sum.paidAmount ?? 0),
      remainingRevenue: Number(total._sum.remainingRevenue ?? 0),
      totalCost: Number(total._sum.totalCost ?? 0),
      paidCost: Number(total._sum.paidCost ?? 0),
      remainingCost: Number(total._sum.remainingCost ?? 0),
      profit,
      commission: Number(total._sum.commission ?? 0),
      commissionRevenue: totalRevenue,
      marginRate: totalRevenue ? (profit / totalRevenue) * 100 : 0,
    };
  }

  private async orderOverviewCountsFromDb(query: ReportQuery, user?: RequestUser) {
    this.assertOrderQuery(query);
    const where = branchDepartmentScopeWhere(this.orderWhere(query), user);
    const [totalOrders, unpaidOrders, unpaidCostOrders, settledOrders] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.count({ where: { AND: [where, { remainingRevenue: { gt: 0 } }] } }),
      this.prisma.order.count({ where: { AND: [where, { remainingCost: { gt: 0 } }] } }),
      this.prisma.order.count({ where: { AND: [where, { settledAt: { not: null } }] } }),
    ]);
    return {
      totalOrders,
      unpaidOrders,
      unpaidCostOrders,
      settledOrders,
    };
  }

  private async orderCustomerCountFromDb(query: ReportQuery, user?: RequestUser) {
    this.assertOrderQuery(query);
    const where = branchDepartmentScopeWhere(this.orderWhere(query), user);
    const noPhone: Prisma.OrderWhereInput = { OR: [{ customerPhone: null }, { customerPhone: '' }] };
    const noEmail: Prisma.OrderWhereInput = { OR: [{ customerEmail: null }, { customerEmail: '' }] };
    const noName: Prisma.OrderWhereInput = { OR: [{ customerName: null }, { customerName: '' }] };
    const [phoneRows, emailRows, nameRows, anonymousOrders] = await Promise.all([
      this.prisma.order.groupBy({ by: ['customerPhone'], where: { AND: [where, { customerPhone: { not: null } }] } }),
      this.prisma.order.groupBy({ by: ['customerEmail'], where: { AND: [where, noPhone, { customerEmail: { not: null } }] } }),
      this.prisma.order.groupBy({ by: ['customerName'], where: { AND: [where, noPhone, noEmail, { customerName: { not: null } }] } }),
      this.prisma.order.count({ where: { AND: [where, noPhone, noEmail, noName] } }),
    ]);
    return (
      phoneRows.filter((row) => this.nonEmpty(row.customerPhone)).length +
      emailRows.filter((row) => this.nonEmpty(row.customerEmail)).length +
      nameRows.filter((row) => this.nonEmpty(row.customerName)).length +
      anonymousOrders
    );
  }

  private async supplierDebtCountFromDb(query: ReportQuery, user?: RequestUser) {
    const where = branchDepartmentScopeWhere(this.supplierDebtWhere(query), user);
    const groups = await this.prisma.supplierLedgerEntry.groupBy({
      by: ['supplierId'],
      where,
      _sum: { debitAmount: true, creditAmount: true },
    });
    return groups.filter((row) => Number(row._sum.creditAmount ?? 0) - Number(row._sum.debitAmount ?? 0) !== 0).length;
  }

  private async orderOverviewByTypeFromDb(query: ReportQuery, user?: RequestUser) {
    this.assertOrderQuery(query);
    const groups = await this.prisma.order.groupBy({
      by: ['type'],
      where: branchDepartmentScopeWhere(this.orderWhere(query), user),
      _count: { _all: true },
      _sum: this.orderMetricSums(),
    });
    return groups
      .map((row) => this.orderMetricRow(String(row.type || 'Khác'), String(row.type || 'Khác'), this.groupCount(row), row._sum || {}))
      .sort((left, right) => right.revenue - left.revenue);
  }

  private async orderOverviewByMonthFromDb(query: ReportQuery, user?: RequestUser) {
    this.assertOrderQuery(query);
    const groups = await this.prisma.order.groupBy({
      by: ['createdAt'],
      where: branchDepartmentScopeWhere(this.orderWhere(query), user),
      _count: { _all: true },
      _sum: this.orderMetricSums(),
    });
    const months = new Map<string, MetricRow>();
    for (const row of groups) {
      const key = row.createdAt ? row.createdAt.toISOString().slice(0, 7) : 'NO_DATE';
      const current = months.get(key) || this.emptyRow(key, key);
      const metric = this.orderMetricRow(key, key, this.groupCount(row), row._sum || {});
      current.orderCount += metric.orderCount;
      current.customerCount += metric.customerCount;
      current.revenue += metric.revenue;
      current.paidAmount += metric.paidAmount;
      current.remainingRevenue += metric.remainingRevenue;
      current.cost += metric.cost;
      current.paidCost += metric.paidCost;
      current.remainingCost += metric.remainingCost;
      current.profit += metric.profit;
      current.commission += metric.commission;
      current.marginRate = current.revenue ? (current.profit / current.revenue) * 100 : 0;
      months.set(key, current);
    }
    return [...months.values()].sort((left, right) => right.key.localeCompare(left.key));
  }

  private orderMetricSums(): Prisma.OrderSumAggregateInputType {
    return {
      totalRevenue: true,
      paidAmount: true,
      remainingRevenue: true,
      totalCost: true,
      paidCost: true,
      remainingCost: true,
      profit: true,
      commission: true,
    };
  }

  private groupCount(row: { _count?: true | { _all?: number | null } }) {
    return typeof row._count === 'object' ? Number(row._count._all || 0) : 0;
  }

  private orderMetricRow(key: string, label: string, orderCount: number, sums: {
    totalRevenue?: Prisma.Decimal | number | null;
    paidAmount?: Prisma.Decimal | number | null;
    remainingRevenue?: Prisma.Decimal | number | null;
    totalCost?: Prisma.Decimal | number | null;
    paidCost?: Prisma.Decimal | number | null;
    remainingCost?: Prisma.Decimal | number | null;
    profit?: Prisma.Decimal | number | null;
    commission?: Prisma.Decimal | number | null;
  }): MetricRow {
    const revenue = Number(sums.totalRevenue ?? 0);
    const profit = Number(sums.profit ?? 0);
    return {
      key,
      label,
      orderCount,
      customerCount: orderCount,
      revenue,
      paidAmount: Number(sums.paidAmount ?? 0),
      remainingRevenue: Number(sums.remainingRevenue ?? 0),
      cost: Number(sums.totalCost ?? 0),
      paidCost: Number(sums.paidCost ?? 0),
      remainingCost: Number(sums.remainingCost ?? 0),
      profit,
      commission: Number(sums.commission ?? 0),
      marginRate: revenue ? (profit / revenue) * 100 : 0,
    };
  }

  private async tours(query: ReportQuery, user?: RequestUser) {
    this.assertTourQuery(query);
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

  private financeOrderQuery(query: ReportQuery): ReportQuery {
    if (query.dateField === 'documentDate') {
      const { dateField, ...rest } = query;
      return rest;
    }
    return query;
  }

  private async financeReceiptRows(query: ReportQuery, user?: RequestUser) {
    return this.prisma.financeReceipt.findMany({
      where: this.financeReceiptWhere(query, user),
      include: { customer: true, orders: true },
      orderBy: [{ paymentDate: 'desc' }, { updatedAt: 'desc' }, { receiptCode: 'asc' }],
      take: 300,
    });
  }

  private financeReceiptWhere(query: ReportQuery, user?: RequestUser): Prisma.FinanceReceiptWhereInput {
    const search = normalizeListSearch(query.search);
    const contains = search ? containsSearch(search) : undefined;
    const orderFilter = this.financeOrderRelationFilter(query);
    const searchOr: Prisma.FinanceReceiptWhereInput[] = contains
      ? [
          { receiptCode: contains },
          { receiptName: contains },
          { payerName: contains },
          { payerPhone: contains },
          { payerEmail: contains },
          { reason: contains },
          { partnerName: contains },
          { note: contains },
          { customer: { is: { fullName: contains } } },
          { customer: { is: { phone: contains } } },
          { orders: { some: { orderCode: contains } } },
          { orders: { some: { tourCode: contains } } },
          { orders: { some: { tourName: contains } } },
          { orders: { some: { order: { is: { OR: [{ systemCode: contains }, { tourCode: contains }, { name: contains }] } } } } },
        ]
      : [];
    return branchDepartmentScopeWhere<Prisma.FinanceReceiptWhereInput>({
      deletedAt: null,
      ...(orderFilter ? { orders: { some: { order: { is: orderFilter } } } } : {}),
      ...(query.branch ? { branch: { contains: query.branch, mode: 'insensitive' } } : {}),
      ...(query.department ? { department: { contains: query.department, mode: 'insensitive' } } : {}),
      ...(query.employee ? { assignedStaff: { contains: query.employee, mode: 'insensitive' } } : {}),
      ...(searchOr.length ? { OR: searchOr } : {}),
      ...this.dateRange('paymentDate', query.dateFrom || query.createdFrom || query.from, query.dateTo || query.createdTo || query.to),
    }, user);
  }

  private async financePaymentRows(query: ReportQuery, user?: RequestUser) {
    return this.prisma.financePayment.findMany({
      where: this.financePaymentWhere(query, user),
      include: { supplier: true, order: true, tour: true, operationVoucher: true },
      orderBy: [{ paymentDate: 'desc' }, { updatedAt: 'desc' }, { voucherCode: 'asc' }],
      take: 300,
    });
  }

  private financePaymentWhere(query: ReportQuery, user?: RequestUser): Prisma.FinancePaymentWhereInput {
    const search = normalizeListSearch(query.search);
    const contains = search ? containsSearch(search) : undefined;
    const orderFilter = this.financeOrderRelationFilter(query);
    const searchOr: Prisma.FinancePaymentWhereInput[] = contains
      ? [
          { voucherCode: contains },
          { voucherName: contains },
          { receiverName: contains },
          { receiverPhone: contains },
          { reason: contains },
          { partnerName: contains },
          { note: contains },
          { supplier: { is: { supplierCode: contains } } },
          { supplier: { is: { name: contains } } },
          { order: { is: { systemCode: contains } } },
          { order: { is: { tourCode: contains } } },
          { order: { is: { name: contains } } },
          { tour: { is: { systemCode: contains } } },
          { tour: { is: { tourCode: contains } } },
          { operationVoucher: { is: { voucherCode: contains } } },
          { operationVoucher: { is: { serviceName: contains } } },
        ]
      : [];
    return branchDepartmentScopeWhere<Prisma.FinancePaymentWhereInput>({
      deletedAt: null,
      ...(orderFilter ? { order: { is: orderFilter } } : {}),
      ...(query.branch ? { branch: { contains: query.branch, mode: 'insensitive' } } : {}),
      ...(query.department ? { department: { contains: query.department, mode: 'insensitive' } } : {}),
      ...(query.employee ? { assignedStaff: { contains: query.employee, mode: 'insensitive' } } : {}),
      ...(searchOr.length ? { OR: searchOr } : {}),
      ...this.dateRange('paymentDate', query.dateFrom || query.createdFrom || query.from, query.dateTo || query.createdTo || query.to),
    }, user);
  }

  private async financeCashflowRows(query: ReportQuery, user?: RequestUser) {
    return this.prisma.financeCashflowEntry.findMany({
      where: this.financeCashflowWhere(query, user),
      include: { order: true, tour: true, customer: true, supplier: true },
      orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }],
      take: 1000,
    });
  }

  private financeCashflowWhere(query: ReportQuery, user?: RequestUser): Prisma.FinanceCashflowEntryWhereInput {
    const search = normalizeListSearch(query.search);
    const contains = search ? containsSearch(search) : undefined;
    const orderFilter = this.financeOrderRelationFilter(query);
    const searchOr: Prisma.FinanceCashflowEntryWhereInput[] = contains
      ? [
          { sourceId: contains },
          { note: contains },
          { staff: contains },
          { order: { is: { systemCode: contains } } },
          { order: { is: { tourCode: contains } } },
          { order: { is: { name: contains } } },
          { tour: { is: { systemCode: contains } } },
          { tour: { is: { tourCode: contains } } },
          { customer: { is: { fullName: contains } } },
          { customer: { is: { phone: contains } } },
          { supplier: { is: { supplierCode: contains } } },
          { supplier: { is: { name: contains } } },
        ]
      : [];
    return branchDepartmentScopeWhere<Prisma.FinanceCashflowEntryWhereInput>({
      ...(orderFilter ? { order: { is: orderFilter } } : {}),
      ...(query.branch ? { branch: { contains: query.branch, mode: 'insensitive' } } : {}),
      ...(query.department ? { department: { contains: query.department, mode: 'insensitive' } } : {}),
      ...(query.employee ? { staff: { contains: query.employee, mode: 'insensitive' } } : {}),
      ...(searchOr.length ? { OR: searchOr } : {}),
      ...this.dateRange('paymentDate', query.dateFrom || query.createdFrom || query.from, query.dateTo || query.createdTo || query.to),
    }, user);
  }

  private async financeSummaryFromDb(query: ReportQuery, user?: RequestUser) {
    const [receiptCount, paymentCount, cashflowGroups] = await Promise.all([
      this.prisma.financeReceipt.count({ where: this.financeReceiptWhere(query, user) }),
      this.prisma.financePayment.count({ where: this.financePaymentWhere(query, user) }),
      this.prisma.financeCashflowEntry.groupBy({
        by: ['entryType'],
        where: this.financeCashflowWhere(query, user),
        _sum: { amount: true },
      }),
    ]);
    const totalReceipt = cashflowGroups
      .filter((row) => row.entryType === 'RECEIPT')
      .reduce((sum, row) => sum + Number(row._sum.amount || 0), 0);
    const totalPayment = cashflowGroups
      .filter((row) => row.entryType === 'PAYMENT')
      .reduce((sum, row) => sum + Number(row._sum.amount || 0), 0);
    return { totalReceipt, totalPayment, netCashflow: totalReceipt - totalPayment, receiptCount, paymentCount };
  }

  private async financeCashflowByMonthFromDb(query: ReportQuery, user?: RequestUser) {
    const groups = await this.prisma.financeCashflowEntry.groupBy({
      by: ['paymentDate', 'entryType'],
      where: this.financeCashflowWhere(query, user),
      _sum: { amount: true },
    });
    const months = new Map<string, { period: string; received: number; paid: number; netCashflow: number }>();
    groups.forEach((row) => {
      const period = row.paymentDate ? row.paymentDate.toISOString().slice(0, 7) : 'NO_DATE';
      const current = months.get(period) || { period, received: 0, paid: 0, netCashflow: 0 };
      if (row.entryType === 'RECEIPT') current.received += Number(row._sum.amount || 0);
      if (row.entryType === 'PAYMENT') current.paid += Number(row._sum.amount || 0);
      current.netCashflow = current.received - current.paid;
      months.set(period, current);
    });
    return [...months.values()].sort((left, right) => right.period.localeCompare(left.period));
  }

  private financeOrderRows(orders: Order[], receiptRows: FinanceReceiptReportRow[], paymentRows: FinancePaymentReportRow[], cashflowRows: FinanceCashflowReportRow[]) {
    const receiptsByOrder = new Map<string, { amount: number; count: number }>();
    const paymentsByOrder = new Map<string, { amount: number; count: number }>();
    const receiptCashflowByOrder = new Map<string, { amount: number; count: number }>();
    const paymentCashflowByOrder = new Map<string, { amount: number; count: number }>();

    receiptRows.forEach((receipt) => {
      if (receipt.approvalStatus !== 'APPROVED') return;
      receipt.orders.forEach((line) => {
        if (!line.orderId) return;
        const current = receiptsByOrder.get(line.orderId) || { amount: 0, count: 0 };
        current.amount += Number(line.amount || 0);
        current.count += 1;
        receiptsByOrder.set(line.orderId, current);
      });
    });

    paymentRows.forEach((payment) => {
      if (payment.approvalStatus !== 'APPROVED' || !payment.orderId) return;
      const current = paymentsByOrder.get(payment.orderId) || { amount: 0, count: 0 };
      current.amount += Number(payment.paymentAmount || 0);
      current.count += 1;
      paymentsByOrder.set(payment.orderId, current);
    });

    cashflowRows.forEach((entry) => {
      if (!entry.orderId) return;
      const target = entry.entryType === 'RECEIPT' ? receiptCashflowByOrder : entry.entryType === 'PAYMENT' ? paymentCashflowByOrder : null;
      if (!target) return;
      const current = target.get(entry.orderId) || { amount: 0, count: 0 };
      current.amount += Number(entry.amount || 0);
      current.count += 1;
      target.set(entry.orderId, current);
    });

    return orders.map((order) => {
      const revenue = Number(order.totalRevenue);
      const cost = Number(order.totalCost);
      const profit = Number(order.profit);
      const snapshotPaidAmount = Number(order.paidAmount);
      const snapshotPaidCost = Number(order.paidCost);
      const receiptDoc = receiptsByOrder.get(order.id) || { amount: 0, count: 0 };
      const paymentDoc = paymentsByOrder.get(order.id) || { amount: 0, count: 0 };
      const receiptCashflow = receiptCashflowByOrder.get(order.id) || { amount: 0, count: 0 };
      const paymentCashflow = paymentCashflowByOrder.get(order.id) || { amount: 0, count: 0 };
      const receipt = receiptDoc.count ? receiptDoc : receiptCashflow;
      const payment = paymentDoc.count ? paymentDoc : paymentCashflow;
      const paidAmount = receipt.amount;
      const paidCost = payment.amount;
      const remainingRevenue = Math.max(revenue - paidAmount, 0);
      const remainingCost = Math.max(cost - paidCost, 0);
      const hasReceiptEvidence = receiptDoc.count > 0 || receiptCashflow.count > 0;
      const hasPaymentEvidence = paymentDoc.count > 0 || paymentCashflow.count > 0;
      const isImportSnapshot = this.isTourKitImportSnapshot(order);
      const issues: string[] = [];

      if (remainingRevenue > 0 && (!isImportSnapshot || hasReceiptEvidence)) issues.push('C\u00f2n ph\u1ea3i thu ' + remainingRevenue.toLocaleString('vi-VN') + ' VND');
      if (remainingCost > 0 && (!isImportSnapshot || hasPaymentEvidence)) issues.push('C\u00f2n ph\u1ea3i chi ' + remainingCost.toLocaleString('vi-VN') + ' VND');
      if (!isImportSnapshot && Math.abs(snapshotPaidAmount - receipt.amount) > 1) issues.push('Th\u1ef1c thu \u0111\u01a1n h\u00e0ng l\u1ec7ch phi\u1ebfu thu ' + Math.abs(snapshotPaidAmount - receipt.amount).toLocaleString('vi-VN') + ' VND');
      if (!isImportSnapshot && Math.abs(snapshotPaidCost - payment.amount) > 1) issues.push('Th\u1ef1c chi \u0111\u01a1n h\u00e0ng l\u1ec7ch phi\u1ebfu chi ' + Math.abs(snapshotPaidCost - payment.amount).toLocaleString('vi-VN') + ' VND');

      return {
        key: order.id,
        orderId: order.id,
        label: order.systemCode + ' - ' + order.name,
        systemCode: order.systemCode,
        tourCode: order.tourCode,
        holdCode: order.holdCode,
        name: order.name,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        type: order.type,
        status: order.status,
        paymentStatus: order.paymentStatus,
        costStatus: order.costStatus,
        startDate: order.startDate,
        endDate: order.endDate,
        branch: order.branch,
        department: order.department,
        employee: order.operatorOwner || order.createdBy,
        orderCount: 1,
        customerCount: order.customerName || order.customerPhone ? 1 : 0,
        revenue,
        totalRevenue: revenue,
        paidAmount,
        remainingRevenue,
        cost,
        totalCost: cost,
        paidCost,
        remainingCost,
        profit,
        commission: Number(order.commission),
        marginRate: revenue ? (profit / revenue) * 100 : 0,
        snapshotPaidAmount,
        snapshotPaidCost,
        receiptAmount: receipt.amount,
        receiptCount: receipt.count,
        paymentAmount: payment.amount,
        paymentCount: payment.count,
        financeSource: isImportSnapshot && !hasReceiptEvidence && !hasPaymentEvidence ? 'tourkit_import_snapshot' : 'finance_evidence',
        issueCount: issues.length,
        issues,
      };
    });
  }

  private groupFinanceOrderRows(orderRows: any[], groupBy: string) {
    const rows = new Map<string, MetricRow>();
    orderRows.forEach((order) => {
      const { key, label } = this.groupKey(order, groupBy, 'day');
      const current = rows.get(key) || this.emptyRow(key, label);
      current.orderCount += 1;
      current.customerCount += order.customerName || order.customerPhone ? 1 : 0;
      current.revenue += Number(order.revenue);
      current.paidAmount += Number(order.paidAmount);
      current.remainingRevenue += Number(order.remainingRevenue);
      current.cost += Number(order.cost);
      current.paidCost += Number(order.paidCost);
      current.remainingCost += Number(order.remainingCost);
      current.profit += Number(order.profit);
      current.commission += Number(order.commission);
      current.marginRate = current.revenue ? (current.profit / current.revenue) * 100 : 0;
      rows.set(key, current);
    });
    const list = [...rows.values()].sort((a, b) => b.revenue - a.revenue);
    return { summary: this.metricSummary(list), rows: list };
  }

  private metricSummary(rows: MetricRow[]) {
    return rows.reduce(
      (summary, row) => {
        summary.totalRevenue += row.revenue;
        summary.paidAmount += row.paidAmount;
        summary.remainingRevenue += row.remainingRevenue;
        summary.totalCost += row.cost;
        summary.paidCost += row.paidCost;
        summary.remainingCost += row.remainingCost;
        summary.profit += row.profit;
        summary.commission += row.commission;
        summary.marginRate = summary.totalRevenue ? (summary.profit / summary.totalRevenue) * 100 : 0;
        return summary;
      },
      { totalRevenue: 0, paidAmount: 0, remainingRevenue: 0, totalCost: 0, paidCost: 0, remainingCost: 0, profit: 0, commission: 0, marginRate: 0 },
    );
  }

  private isTourKitImportSnapshot(order: { note?: string | null }) {
    return /TOURKIT_(ORDER|BOOKING)_IMPORT_/i.test(order.note || '') || /TourKit (order|booking) export/i.test(order.note || '');
  }

  private receiptRows(row: FinanceReceiptReportRow) {
    const firstOrder = row.orders[0];
    return {
      key: row.id,
      id: row.id,
      receiptCode: row.receiptCode,
      receiptName: row.receiptName,
      receiptType: row.receiptType,
      payerName: row.payerName || row.customer?.fullName || '',
      payerPhone: row.payerPhone || row.customer?.phone || '',
      paymentDate: row.paymentDate,
      paymentMethod: row.paymentMethod,
      approvalStatus: row.approvalStatus,
      totalAmount: Number(row.totalAmount),
      receiptAmount: Number(row.receiptAmount),
      branch: row.branch,
      assignedStaff: row.assignedStaff,
      orderId: firstOrder?.orderId || null,
      orderCode: firstOrder?.orderCode || '',
      tourCode: firstOrder?.tourCode || '',
      tourName: firstOrder?.tourName || '',
      orderCount: row.orders.filter((line) => line.orderId).length,
    };
  }

  private paymentRows(row: FinancePaymentReportRow) {
    return {
      key: row.id,
      id: row.id,
      voucherCode: row.voucherCode,
      voucherName: row.voucherName,
      voucherType: row.voucherType,
      receiverName: row.receiverName || row.supplier?.name || '',
      receiverPhone: row.receiverPhone || row.supplier?.phone || '',
      supplierName: row.supplier?.name || '',
      supplierCode: row.supplier?.supplierCode || '',
      paymentDate: row.paymentDate,
      paymentMethod: row.paymentMethod,
      approvalStatus: row.approvalStatus,
      totalAmount: Number(row.totalAmount),
      paymentAmount: Number(row.paymentAmount),
      branch: row.branch,
      assignedStaff: row.assignedStaff,
      orderId: row.orderId,
      orderCode: row.order?.systemCode || '',
      tourCode: row.tour?.tourCode || row.order?.tourCode || '',
      tourName: row.tour?.name || row.order?.name || '',
      operationVoucherCode: row.operationVoucher?.voucherCode || '',
    };
  }

  private orphanReceiptRows(rows: FinanceReceiptReportRow[]) {
    return rows
      .filter((row) => !row.orders.some((line) => line.orderId))
      .map((row) => this.receiptRows(row));
  }

  private orphanPaymentRows(rows: FinancePaymentReportRow[]) {
    return rows
      .filter((row) => !row.orderId)
      .map((row) => this.paymentRows(row));
  }

  private financeReconciliationRows(orderRows: any[], orphanReceiptRows: any[], orphanPaymentRows: any[]) {
    const orderIssues = orderRows
      .filter((row) => row.issueCount > 0)
      .map((row) => ({
        key: `ORDER:${row.orderId}`,
        type: 'ORDER',
        severity: row.remainingRevenue > 0 || row.remainingCost > 0 ? 'warning' : 'info',
        code: row.systemCode,
        title: row.name,
        customerName: row.customerName,
        amount: Math.max(row.remainingRevenue, row.remainingCost, Math.abs(row.paidAmount - row.receiptAmount), Math.abs(row.paidCost - row.paymentAmount)),
        issueCount: row.issueCount,
        issues: row.issues,
      }));
    const receiptIssues = orphanReceiptRows.map((row) => ({
      key: `RECEIPT:${row.id}`,
      type: 'ORPHAN_RECEIPT',
      severity: row.approvalStatus === 'APPROVED' ? 'warning' : 'info',
      code: row.receiptCode,
      title: row.receiptName,
      customerName: row.payerName,
      amount: row.receiptAmount,
      issueCount: 1,
      issues: ['Phiếu thu chưa gắn đơn/tour để đối soát doanh thu'],
    }));
    const paymentIssues = orphanPaymentRows.map((row) => ({
      key: `PAYMENT:${row.id}`,
      type: 'ORPHAN_PAYMENT',
      severity: row.approvalStatus === 'APPROVED' ? 'warning' : 'info',
      code: row.voucherCode,
      title: row.voucherName || row.receiverName,
      supplierName: row.supplierName || row.receiverName,
      amount: row.paymentAmount,
      issueCount: 1,
      issues: ['Phiếu chi chưa gắn đơn/tour để đối soát chi phí'],
    }));
    return [...orderIssues, ...receiptIssues, ...paymentIssues].slice(0, 300);
  }

  private cashflowByMonth(rows: FinanceCashflowReportRow[]) {
    const months = new Map<string, { period: string; received: number; paid: number; netCashflow: number }>();
    rows.forEach((row) => {
      const period = row.paymentDate ? row.paymentDate.toISOString().slice(0, 7) : 'NO_DATE';
      const current = months.get(period) || { period, received: 0, paid: 0, netCashflow: 0 };
      if (row.entryType === 'RECEIPT') current.received += Number(row.amount);
      if (row.entryType === 'PAYMENT') current.paid += Number(row.amount);
      current.netCashflow = current.received - current.paid;
      months.set(period, current);
    });
    return [...months.values()].sort((left, right) => right.period.localeCompare(left.period));
  }

  private orderWhere(query: ReportQuery): Prisma.OrderWhereInput {
    const dateField = this.normalizeDateField(query.dateField);
    const search = normalizeListSearch(query.search);
    const contains = search ? containsSearch(search) : undefined;
    const employeeOr: Prisma.OrderWhereInput[] = query.employee
      ? [{ operatorOwner: { contains: query.employee, mode: 'insensitive' } }, { createdBy: { contains: query.employee, mode: 'insensitive' } }]
      : [];
    const searchOr: Prisma.OrderWhereInput[] = contains
      ? [
          { systemCode: contains },
          { tourCode: contains },
          { name: contains },
          { customerName: contains },
          { customerPhone: contains },
          { customerEmail: contains },
        ]
      : [];
    const and: Prisma.OrderWhereInput[] = [];
    if (employeeOr.length) and.push({ OR: employeeOr });
    if (searchOr.length) and.push({ OR: searchOr });
    return {
      deletedAt: null,
      ...(this.orderType(query.type) ? { type: this.orderType(query.type) } : {}),
      ...(this.orderPaymentStatus(query.paymentStatus) ? { paymentStatus: this.orderPaymentStatus(query.paymentStatus) } : {}),
      ...(this.orderCostStatus(query.costStatus) ? { costStatus: this.orderCostStatus(query.costStatus) } : {}),
      ...(this.orderStatus(query.status) ? { status: this.orderStatus(query.status) } : {}),
      ...(query.branch ? { branch: { contains: query.branch, mode: 'insensitive' } } : {}),
      ...(query.department ? { department: { contains: query.department, mode: 'insensitive' } } : {}),
      ...(query.marketGroup ? { marketGroup: { contains: query.marketGroup, mode: 'insensitive' } } : {}),
      ...(query.agency ? { agencyName: { contains: query.agency, mode: 'insensitive' } } : {}),
      ...(query.customerType ? { customerType: { contains: query.customerType, mode: 'insensitive' } } : {}),
      ...(query.settled === 'true' ? { settledAt: { not: null } } : {}),
      ...(query.settled === 'false' ? { settledAt: null } : {}),
      ...(and.length ? { AND: and } : {}),
      ...this.dateRange(dateField, query.dateFrom || query.createdFrom, query.dateTo || query.createdTo),
    };
  }

  private tourWhere(query: ReportQuery): Prisma.TourWhereInput {
    const dateField = this.normalizeTourDateField(query.dateField);
    const search = normalizeListSearch(query.search);
    const contains = search ? containsSearch(search) : undefined;
    const employeeOr: Prisma.TourWhereInput[] = query.employee
      ? [{ operatorOwner: { contains: query.employee, mode: 'insensitive' } }, { createdBy: { contains: query.employee, mode: 'insensitive' } }]
      : [];
    const searchOr: Prisma.TourWhereInput[] = contains
      ? [
          { systemCode: contains },
          { tourCode: contains },
          { name: contains },
          { customers: { some: { name: contains } } },
        ]
      : [];
    const and: Prisma.TourWhereInput[] = [];
    if (employeeOr.length) and.push({ OR: employeeOr });
    if (searchOr.length) and.push({ OR: searchOr });
    return {
      deletedAt: null,
      ...(query.tourId ? { id: query.tourId } : {}),
      ...(this.tourType(query.type) ? { type: this.tourType(query.type) } : {}),
      ...(this.tourPaymentStatus(query.paymentStatus) ? { paymentStatus: this.tourPaymentStatus(query.paymentStatus) } : {}),
      ...(this.tourStatus(query.status) ? { status: this.tourStatus(query.status) } : {}),
      ...(query.branch ? { branch: { contains: query.branch, mode: 'insensitive' } } : {}),
      ...(query.department ? { department: { contains: query.department, mode: 'insensitive' } } : {}),
      ...(query.marketGroup ? { marketGroup: { contains: query.marketGroup, mode: 'insensitive' } } : {}),
      ...(and.length ? { AND: and } : {}),
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
      ...(this.orderType(query.type) ? { type: this.orderType(query.type) } : {}),
      ...(this.orderPaymentStatus(query.paymentStatus) ? { paymentStatus: this.orderPaymentStatus(query.paymentStatus) } : {}),
      ...(this.orderCostStatus(query.costStatus) ? { costStatus: this.orderCostStatus(query.costStatus) } : {}),
      ...(this.orderStatus(query.status) ? { status: this.orderStatus(query.status) } : {}),
      ...(query.marketGroup ? { marketGroup: { contains: query.marketGroup, mode: 'insensitive' } } : {}),
      ...(query.agency ? { agencyName: { contains: query.agency, mode: 'insensitive' } } : {}),
      ...(query.customerType ? { customerType: { contains: query.customerType, mode: 'insensitive' } } : {}),
      ...(query.settled === 'true' ? { settledAt: { not: null } } : {}),
      ...(query.settled === 'false' ? { settledAt: null } : {}),
    };
  }

  private financeOrderRelationFilter(query: ReportQuery): Prisma.OrderWhereInput | null {
    const where = this.orderRelationWhere(query);
    return Object.keys(where).length ? where : null;
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

  private async customerDebtSummaryFromDb(where: Prisma.CustomerLedgerEntryWhereInput) {
    const groups = await this.prisma.customerLedgerEntry.groupBy({
      by: ['customerId'],
      where,
      _sum: { debitAmount: true, creditAmount: true },
    });
    const activeCustomerIds = new Set<string>();
    const summary = groups.reduce(
      (total, row) => {
        const revenue = Number(row._sum.debitAmount ?? 0);
        const paidAmount = Number(row._sum.creditAmount ?? 0);
        const balance = revenue - paidAmount;
        if (balance === 0) return total;
        if (row.customerId) activeCustomerIds.add(row.customerId);
        total.totalRevenue += revenue;
        total.paidAmount += paidAmount;
        total.remainingRevenue += balance;
        return total;
      },
      { totalRevenue: 0, paidAmount: 0, remainingRevenue: 0 },
    );
    const scopedWhere = activeCustomerIds.size ? { AND: [where, { customerId: { in: [...activeCustomerIds] } }] } : { AND: [where, { id: '__NO_ACTIVE_CUSTOMER_DEBT__' }] };
    const [orderIds, tourIds] = await Promise.all([
      this.prisma.customerLedgerEntry.groupBy({ by: ['orderId'], where: { AND: [scopedWhere, { orderId: { not: null } }] } }),
      this.prisma.customerLedgerEntry.groupBy({ by: ['tourId'], where: { AND: [scopedWhere, { tourId: { not: null } }] } }),
    ]);
    const orderKeys = new Set<string>();
    for (const row of orderIds) if (row.orderId) orderKeys.add(row.orderId);
    for (const row of tourIds) if (row.tourId) orderKeys.add(row.tourId);
    return {
      ...summary,
      totalCost: 0,
      paidCost: 0,
      remainingCost: 0,
      profit: 0,
      commission: 0,
      marginRate: 0,
      debit: summary.totalRevenue,
      credit: summary.paidAmount,
      balance: summary.remainingRevenue,
      count: activeCustomerIds.size,
      orderCount: orderKeys.size,
      customerCount: activeCustomerIds.size,
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

  private async supplierDebtSummaryFromDb(where: Prisma.SupplierLedgerEntryWhereInput) {
    const groups = await this.prisma.supplierLedgerEntry.groupBy({
      by: ['supplierId'],
      where,
      _sum: { debitAmount: true, creditAmount: true },
    });
    const activeSupplierIds = new Set<string>();
    const summary = groups.reduce(
      (total, row) => {
        const paidAmount = Number(row._sum.debitAmount ?? 0);
        const totalPurchase = Number(row._sum.creditAmount ?? 0);
        const remainingAmount = totalPurchase - paidAmount;
        if (remainingAmount === 0) return total;
        if (row.supplierId) activeSupplierIds.add(row.supplierId);
        total.totalPurchase += totalPurchase;
        total.paidAmount += paidAmount;
        total.remainingAmount += remainingAmount;
        return total;
      },
      { totalPurchase: 0, paidAmount: 0, remainingAmount: 0 },
    );
    const scopedWhere = activeSupplierIds.size ? { AND: [where, { supplierId: { in: [...activeSupplierIds] } }] } : { AND: [where, { id: '__NO_ACTIVE_SUPPLIER_DEBT__' }] };
    const [orderIds, tourIds, voucherIds] = await Promise.all([
      this.prisma.supplierLedgerEntry.groupBy({ by: ['orderId'], where: { AND: [scopedWhere, { orderId: { not: null } }] } }),
      this.prisma.supplierLedgerEntry.groupBy({ by: ['tourId'], where: { AND: [scopedWhere, { tourId: { not: null } }] } }),
      this.prisma.supplierLedgerEntry.groupBy({ by: ['operationVoucherId'], where: { AND: [scopedWhere, { operationVoucherId: { not: null } }] } }),
    ]);
    const orderKeys = new Set<string>();
    for (const row of orderIds) if (row.orderId) orderKeys.add(row.orderId);
    for (const row of tourIds) if (row.tourId) orderKeys.add(row.tourId);
    return {
      supplierCount: activeSupplierIds.size,
      ...summary,
      totalRevenue: 0,
      remainingRevenue: 0,
      totalCost: summary.totalPurchase,
      paidCost: summary.paidAmount,
      remainingCost: summary.remainingAmount,
      profit: -summary.remainingAmount,
      commission: 0,
      marginRate: 0,
      debit: summary.totalPurchase,
      credit: summary.paidAmount,
      balance: summary.remainingAmount,
      count: activeSupplierIds.size,
      orderCount: orderKeys.size,
      voucherCount: voucherIds.filter((row) => row.operationVoucherId).length,
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

  private orderType(value?: string): OrderType | undefined {
    if (!value) return undefined;
    if (!ORDER_TYPES.has(value)) throw new BadRequestException('type is not valid for Order reports');
    return value as OrderType;
  }

  private tourType(value?: string): TourType | undefined {
    if (!value) return undefined;
    if (!TOUR_TYPES.has(value)) throw new BadRequestException('type is not valid for Tour reports');
    return value as TourType;
  }

  private orderStatus(value?: string): OrderStatus | undefined {
    if (!value) return undefined;
    if (!ORDER_STATUSES.has(value)) throw new BadRequestException('status is not valid for Order reports');
    return value as OrderStatus;
  }

  private tourStatus(value?: string): TourStatus | undefined {
    if (!value) return undefined;
    if (!TOUR_STATUSES.has(value)) throw new BadRequestException('status is not valid for Tour reports');
    return value as TourStatus;
  }

  private orderPaymentStatus(value?: string): OrderPaymentStatus | undefined {
    if (!value) return undefined;
    if (!ORDER_PAYMENT_STATUSES.has(value)) throw new BadRequestException('paymentStatus is not valid for Order reports');
    return value as OrderPaymentStatus;
  }

  private tourPaymentStatus(value?: string): PaymentStatus | undefined {
    if (!value) return undefined;
    if (!TOUR_PAYMENT_STATUSES.has(value)) throw new BadRequestException('paymentStatus is not valid for Tour reports');
    return value as PaymentStatus;
  }

  private orderCostStatus(value?: string): OrderCostStatus | undefined {
    if (!value) return undefined;
    if (!ORDER_COST_STATUSES.has(value)) throw new BadRequestException('costStatus is not valid for Order reports');
    return value as OrderCostStatus;
  }

  private assertOrderQuery(query: ReportQuery) {
    this.orderType(query.type);
    this.orderStatus(query.status);
    this.orderPaymentStatus(query.paymentStatus);
    this.orderCostStatus(query.costStatus);
    this.normalizeDateField(query.dateField);
  }

  private assertTourQuery(query: ReportQuery) {
    this.tourType(query.type);
    this.tourStatus(query.status);
    this.tourPaymentStatus(query.paymentStatus);
    this.normalizeTourDateField(query.dateField);
    if (query.costStatus) throw new BadRequestException('costStatus is not valid for Tour reports');
  }

  private assertFinanceQuery(query: ReportQuery) {
    this.orderType(query.type);
    this.orderStatus(query.status);
    this.orderPaymentStatus(query.paymentStatus);
    this.orderCostStatus(query.costStatus);
    this.normalizeFinanceDateField(query.dateField);
  }

  private assertDebtQuery(query: ReportQuery) {
    this.orderType(query.type);
    this.orderStatus(query.status);
    this.orderPaymentStatus(query.paymentStatus);
    this.orderCostStatus(query.costStatus);
    if (query.dateField && query.dateField !== 'documentDate') throw new BadRequestException('dateField is not valid for debt reports');
  }

  private assertSupplierHistoryQuery(query: ReportQuery) {
    const allowed = new Set(['dateFrom', 'dateTo']);
    const unsupported = Object.entries(query).find(([key, value]) => value !== undefined && !allowed.has(key));
    if (unsupported) throw new BadRequestException(`${unsupported[0]} is not valid for supplier history reports`);
  }

  private dateFieldFromGroup(groupBy: string, fallback?: string) {
    if (groupBy === 'by-checkin-date') return 'startDate';
    if (groupBy === 'by-checkout-date') return 'endDate';
    if (groupBy === 'by-approved-date') return 'settledAt';
    return fallback || 'createdAt';
  }

  private normalizeDateField(field?: string): OrderDateField {
    if (!field) return 'createdAt';
    if (!ORDER_DATE_FIELDS.includes(field as OrderDateField)) throw new BadRequestException('dateField is not valid for Order reports');
    return field as OrderDateField;
  }

  private normalizeTourDateField(field?: string): TourDateField {
    if (!field) return 'createdAt';
    if (!TOUR_DATE_FIELDS.includes(field as TourDateField)) throw new BadRequestException('dateField is not valid for Tour reports');
    return field as TourDateField;
  }

  private normalizeFinanceDateField(field?: string): FinanceDateField {
    if (!field) return 'createdAt';
    if (!FINANCE_DATE_FIELDS.includes(field as FinanceDateField)) throw new BadRequestException('dateField is not valid for finance reports');
    return field as FinanceDateField;
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
      return sum + (this.hasValue(row.actualAmount) ? Number(row.actualAmount) : Number(row.expectedAmount));
    }, 0);
    if (tour.costs.length) return explicit;
    return tour.services.reduce((sum, row) => sum + (this.hasValue(row.confirmedAmount) ? Number(row.confirmedAmount) : Number(row.budgetAmount)), 0);
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

  private hasValue(value: unknown) {
    return value !== undefined && value !== null;
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

  private nonEmpty(value: string | null | undefined) {
    return Boolean(String(value || '').trim());
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
    const date = this.reportDate(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) date.setHours(0, 0, 0, 0);
    return date;
  }

  private endOfDay(value: string) {
    const date = this.reportDate(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) date.setHours(23, 59, 59, 999);
    return date;
  }

  private reportDate(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new BadRequestException('Invalid report date');
    return date;
  }

  private toCsv(rows: any[]) {
    if (!rows.length) return '\uFEFF';
    const headers = Object.keys(rows[0]);
    return `\uFEFF${[
      headers.join(','),
      ...rows.map((row) => headers.map((header) => this.csv(row[header])).join(',')),
    ].join('\r\n')}`;
  }

  private csv(value: unknown) {
    if (value instanceof Date) return value.toISOString();
    const text = String(value ?? '');
    return `"${text.replaceAll('"', '""')}"`;
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { Order, OrderType, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { branchDepartmentScopeWhere, RequestUser } from '../auth/data-scope';

type ReportQuery = Record<string, string | undefined>;
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
    const orders = await this.orders({ ...query, dateField: this.dateFieldFromGroup(groupBy, query.dateField) }, user);
    return this.groupOrders(orders, groupBy);
  }

  async profit(query: ReportQuery, user?: RequestUser) {
    const groupBy = query.groupBy || 'by-employee';
    const result = this.groupOrders(await this.orders(query, user), groupBy);
    return { ...result, rows: result.rows.map((row) => ({ ...row, profitAfterCommission: row.profit - row.commission })) };
  }

  async finance(query: ReportQuery, user?: RequestUser) {
    const orders = await this.orders(query, user);
    return {
      summary: this.summary(orders),
      byType: this.groupOrders(orders, 'by-type').rows,
      cashflowByMonth: this.groupOrders(orders, 'by-created-date', 'month').rows.map((row) => ({
        period: row.key,
        received: row.paidAmount,
        paid: row.paidCost,
        netCashflow: row.paidAmount - row.paidCost,
      })),
      orders: orders.slice(0, 300),
    };
  }

  async orderHistory(orderId: string, user?: RequestUser) {
    const order = await this.prisma.order.findFirst({
      where: branchDepartmentScopeWhere({ id: orderId, deletedAt: null }, user),
      include: { logs: { orderBy: { createdAt: 'desc' } }, salesItems: true, operationItems: { include: { supplier: true } } },
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async customerDebt(query: ReportQuery, user?: RequestUser) {
    const orders = (await this.orders(query, user)).filter((order) => Number(order.remainingRevenue) > 0);
    return {
      summary: this.summary(orders),
      rows: orders.map((order) => ({
        orderId: order.id,
        systemCode: order.systemCode,
        type: order.type,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        customerEmail: order.customerEmail,
        branch: order.branch,
        department: order.department,
        employee: order.operatorOwner || order.createdBy,
        startDate: order.startDate,
        endDate: order.endDate,
        totalRevenue: Number(order.totalRevenue),
        paidAmount: Number(order.paidAmount),
        remainingRevenue: Number(order.remainingRevenue),
        paymentStatus: order.paymentStatus,
      })),
    };
  }

  async supplierDebt(query: ReportQuery, user?: RequestUser) {
    const where: Prisma.OperationVoucherWhereInput = {
      deletedAt: null,
      ...(query.search
        ? {
            OR: [
              { voucherCode: { contains: query.search, mode: 'insensitive' } },
              { supplierName: { contains: query.search, mode: 'insensitive' } },
              { serviceName: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.supplier ? { supplierName: { contains: query.supplier, mode: 'insensitive' } } : {}),
      ...this.dateRange('serviceDate', query.dateFrom || query.createdFrom, query.dateTo || query.createdTo),
    };
    const vouchers = await this.prisma.operationVoucher.findMany({
      where: branchDepartmentScopeWhere(where, user),
      include: { supplier: { include: { category: true } } },
      orderBy: [{ serviceDate: 'desc' }, { voucherCode: 'asc' }],
      take: 1000,
    });
    const rows = new Map<string, any>();
    vouchers.forEach((voucher) => {
      const key = voucher.supplierId || voucher.supplierName || 'UNKNOWN';
      const current = rows.get(key) || {
        supplierId: voucher.supplierId,
        supplierCode: voucher.supplier?.supplierCode || '',
        supplierName: voucher.supplierName || voucher.supplier?.name || 'Chua gan NCC',
        supplierType: voucher.supplier?.category?.name || voucher.serviceType,
        voucherCount: 0,
        totalPurchase: 0,
        paidAmount: 0,
        remainingAmount: 0,
      };
      current.voucherCount += 1;
      current.totalPurchase += Number(voucher.totalAmount);
      current.paidAmount += Number(voucher.paidAmount);
      current.remainingAmount += Number(voucher.remainAmount);
      rows.set(key, current);
    });
    const list = [...rows.values()].filter((row) => row.remainingAmount > 0);
    return {
      summary: {
        supplierCount: list.length,
        totalPurchase: this.sum(list, 'totalPurchase'),
        paidAmount: this.sum(list, 'paidAmount'),
        remainingAmount: this.sum(list, 'remainingAmount'),
      },
      rows: list,
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
      paidRatio: row.revenue ? (row.paidAmount / row.revenue) * 100 : 0,
    }));
    return { summary: this.summary(orders), rows };
  }

  async exportCsv(report: string, query: ReportQuery, user?: RequestUser) {
    if (report === 'customer-debt') return this.toCsv((await this.customerDebt(query, user)).rows);
    if (report === 'supplier-debt') return this.toCsv((await this.supplierDebt(query, user)).rows);
    if (report === 'finance') return this.toCsv((await this.finance(query, user)).orders);
    if (report === 'employees') return this.toCsv((await this.employeePerformance(query, user)).rows);
    if (report === 'profit') return this.toCsv((await this.profit(query, user)).rows);
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

  private orderWhere(query: ReportQuery): Prisma.OrderWhereInput {
    const dateField = this.normalizeDateField(query.dateField);
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
      ...(query.search
        ? {
            OR: [
              { systemCode: { contains: query.search, mode: 'insensitive' } },
              { tourCode: { contains: query.search, mode: 'insensitive' } },
              { name: { contains: query.search, mode: 'insensitive' } },
              { customerName: { contains: query.search, mode: 'insensitive' } },
              { customerPhone: { contains: query.search, mode: 'insensitive' } },
              { customerEmail: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...this.dateRange(dateField, query.dateFrom || query.createdFrom, query.dateTo || query.createdTo),
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

  private groupKey(order: Order, groupBy: string, dateMode: 'day' | 'month') {
    if (groupBy === 'by-checkin-date') return this.dateKey(order.startDate, dateMode);
    if (groupBy === 'by-checkout-date') return this.dateKey(order.endDate, dateMode);
    if (groupBy === 'by-approved-date') return this.dateKey(order.settledAt || order.updatedAt, dateMode);
    if (groupBy === 'by-employee') return this.textKey(order.operatorOwner || order.createdBy, 'Chua gan nhan vien');
    if (groupBy === 'by-agency') return this.textKey(order.agencyName, 'Khach truc tiep');
    if (groupBy === 'by-branch') return this.textKey(order.branch, 'Chua gan chi nhanh');
    if (groupBy === 'by-department') return this.textKey(order.department, 'Chua gan phong ban');
    if (groupBy === 'by-market') return this.textKey(order.marketGroup, 'Chua gan thi truong');
    if (groupBy === 'by-type') return this.textKey(order.type, 'Khac');
    return this.dateKey(order.createdAt, dateMode);
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

  private dateRange(field: string, from?: string, to?: string) {
    if (!from && !to) return {};
    return { [field]: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } };
  }

  private summary(orders: Order[]) {
    const totalRevenue = orders.reduce((sum, order) => sum + Number(order.totalRevenue), 0);
    const paidAmount = orders.reduce((sum, order) => sum + Number(order.paidAmount), 0);
    const totalCost = orders.reduce((sum, order) => sum + Number(order.totalCost), 0);
    const paidCost = orders.reduce((sum, order) => sum + Number(order.paidCost), 0);
    const profit = orders.reduce((sum, order) => sum + Number(order.profit), 0);
    const commission = orders.reduce((sum, order) => sum + Number(order.commission), 0);
    return {
      totalRevenue,
      paidAmount,
      remainingRevenue: totalRevenue - paidAmount,
      totalCost,
      paidCost,
      remainingCost: totalCost - paidCost,
      profit,
      commission,
      commissionRevenue: totalRevenue,
      marginRate: totalRevenue ? (profit / totalRevenue) * 100 : 0,
    };
  }

  private emptyRow(key: string, label: string): MetricRow {
    return { key, label, orderCount: 0, customerCount: 0, revenue: 0, paidAmount: 0, remainingRevenue: 0, cost: 0, paidCost: 0, remainingCost: 0, profit: 0, commission: 0, marginRate: 0 };
  }

  private dateKey(date: Date | null, mode: 'day' | 'month') {
    if (!date) return { key: 'NO_DATE', label: 'Chua co ngay' };
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

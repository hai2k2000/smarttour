import { BadRequestException, Injectable } from '@nestjs/common';
import { OrderCostStatus, OrderPaymentStatus, OrderStatus, OrderType, Prisma } from '@prisma/client';
import { csvRows } from '../../common/csv-export';
import { PrismaService } from '../../database/prisma.service';
import { branchDepartmentScopeWhere, RequestUser } from '../auth/data-scope';
import { containsSearch, normalizeListSearch } from '../list-search';

type OrderDashboard = {
  total: number;
  upcoming: number;
  running: number;
  completed: number;
  cancelled: number;
  unpaid: number;
  unpaidCost: number;
  revenue: number;
  cost: number;
  profit: number;
};

type OrderDashboardAggregateRow = OrderDashboard;

type SimpleOrderDashboardScope = { branch?: string; department?: string };

type OrderCenterQuery = {
  search?: string;
  systemCode?: string;
  tourCode?: string;
  name?: string;
  customerName?: string;
  customerPhone?: string;
  createdFrom?: string;
  createdTo?: string;
  startFrom?: string;
  startTo?: string;
  endFrom?: string;
  endTo?: string;
  paymentFrom?: string;
  paymentTo?: string;
  type?: OrderType;
  status?: OrderStatus;
  paymentStatus?: OrderPaymentStatus;
  costStatus?: OrderCostStatus;
  marketGroup?: string;
  branch?: string;
  department?: string;
  sales?: string;
  operatorOwner?: string;
  supplier?: string;
  commissionStatus?: string;
  customerType?: string;
  compact?: string | boolean;
  take?: string | number;
  limit?: string | number;
};

@Injectable()
export class OrderCenterService {
  constructor(private readonly prisma: PrismaService) {}

  async dashboard(query: OrderCenterQuery, user?: RequestUser) {
    const where = branchDepartmentScopeWhere(this.where(query), user);
    const now = new Date();
    const next30 = new Date(now);
    next30.setDate(next30.getDate() + 30);
    const aggregate = await this.orderDashboardAggregate(where, now, next30);
    if (aggregate) return aggregate;
    const [totalCount, upcomingCount, runningCount, completedCount, cancelledCount, unpaidCount, unpaidCostCount, sums] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.count({ where: this.andWhere(where, { startDate: { gte: now, lte: next30 } }) }),
      this.prisma.order.count({ where: this.andWhere(where, { status: OrderStatus.RUNNING }) }),
      this.prisma.order.count({ where: this.andWhere(where, { status: { in: [OrderStatus.COMPLETED, OrderStatus.SETTLED] } }) }),
      this.prisma.order.count({ where: this.andWhere(where, { status: OrderStatus.CANCELLED }) }),
      this.prisma.order.count({ where: this.andWhere(where, { remainingRevenue: { gt: 0 } }) }),
      this.prisma.order.count({ where: this.andWhere(where, { remainingCost: { gt: 0 } }) }),
      this.prisma.order.aggregate({
        where,
        _sum: { totalRevenue: true, totalCost: true, profit: true },
      }),
    ]);
    return {
      total: totalCount,
      upcoming: upcomingCount,
      running: runningCount,
      completed: completedCount,
      cancelled: cancelledCount,
      unpaid: unpaidCount,
      unpaidCost: unpaidCostCount,
      revenue: Number(sums._sum.totalRevenue ?? 0),
      cost: Number(sums._sum.totalCost ?? 0),
      profit: Number(sums._sum.profit ?? 0),
    };
  }

  private async orderDashboardAggregate(where: Prisma.OrderWhereInput, now: Date, next30: Date): Promise<OrderDashboard | null> {
    const scope = this.simpleOrderDashboardScope(where);
    if (!scope) return null;
    const conditions: Prisma.Sql[] = [Prisma.sql`"deletedAt" IS NULL`];
    if (scope.branch) conditions.push(Prisma.sql`"branch" = ${scope.branch}`);
    if (scope.department) conditions.push(Prisma.sql`"department" = ${scope.department}`);
    const [row] = await this.prisma.$queryRaw<OrderDashboardAggregateRow[]>`
      SELECT
        COUNT(*)::integer AS "total",
        COUNT(*) FILTER (WHERE "startDate" >= ${now} AND "startDate" <= ${next30})::integer AS "upcoming",
        COUNT(*) FILTER (WHERE "status"::text = ${OrderStatus.RUNNING})::integer AS "running",
        COUNT(*) FILTER (WHERE "status"::text IN (${OrderStatus.COMPLETED}, ${OrderStatus.SETTLED}))::integer AS "completed",
        COUNT(*) FILTER (WHERE "status"::text = ${OrderStatus.CANCELLED})::integer AS "cancelled",
        COUNT(*) FILTER (WHERE "remainingRevenue" > 0)::integer AS "unpaid",
        COUNT(*) FILTER (WHERE "remainingCost" > 0)::integer AS "unpaidCost",
        COALESCE(SUM("totalRevenue"), 0)::double precision AS "revenue",
        COALESCE(SUM("totalCost"), 0)::double precision AS "cost",
        COALESCE(SUM("profit"), 0)::double precision AS "profit"
      FROM "Order"
      WHERE ${Prisma.join(conditions, ' AND ')}
    `;
    return this.normalizeOrderDashboard(row);
  }

  private simpleOrderDashboardScope(where: Prisma.OrderWhereInput): SimpleOrderDashboardScope | null {
    if (this.isDeletedOnlyWhere(where)) return {};
    const and = Array.isArray(where.AND) ? where.AND : null;
    if (!and?.length || !this.isDeletedOnlyWhere(and[0] as Prisma.OrderWhereInput)) return null;
    const scope: SimpleOrderDashboardScope = {};
    for (const item of and.slice(1)) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const entry = item as Record<string, unknown>;
      const keys = Object.keys(entry);
      if (keys.length !== 1) return null;
      if (keys[0] === 'branch' && typeof entry.branch === 'string') scope.branch = entry.branch;
      else if (keys[0] === 'department' && typeof entry.department === 'string') scope.department = entry.department;
      else return null;
    }
    return scope;
  }

  private isDeletedOnlyWhere(where: Prisma.OrderWhereInput) {
    return Object.keys(where).length === 1 && where.deletedAt === null;
  }

  private normalizeOrderDashboard(row: OrderDashboardAggregateRow | undefined): OrderDashboard {
    return {
      total: Number(row?.total ?? 0),
      upcoming: Number(row?.upcoming ?? 0),
      running: Number(row?.running ?? 0),
      completed: Number(row?.completed ?? 0),
      cancelled: Number(row?.cancelled ?? 0),
      unpaid: Number(row?.unpaid ?? 0),
      unpaidCost: Number(row?.unpaidCost ?? 0),
      revenue: Number(row?.revenue ?? 0),
      cost: Number(row?.cost ?? 0),
      profit: Number(row?.profit ?? 0),
    };
  }

  async list(query: OrderCenterQuery, user?: RequestUser) {
    const where = branchDepartmentScopeWhere(this.where(query), user);
    const take = this.take(query.take ?? query.limit, 500);
    if (this.isCompact(query.compact)) {
      return this.prisma.order.findMany({
        where,
        select: {
          id: true,
          systemCode: true,
          type: true,
          tourCode: true,
          name: true,
          customerName: true,
          customerPhone: true,
          startDate: true,
          endDate: true,
          status: true,
          paymentStatus: true,
          costStatus: true,
          totalRevenue: true,
          remainingRevenue: true,
          totalCost: true,
          remainingCost: true,
          profit: true,
          branch: true,
          department: true,
          operatorOwner: true,
          createdBy: true,
          marketGroup: true,
          updatedAt: true,
        },
        orderBy: [{ updatedAt: 'desc' }, { systemCode: 'asc' }],
        take,
      });
    }
    return this.prisma.order.findMany({
      where,
      include: {
        _count: { select: { members: true, salesItems: true, operationItems: true } },
        operationItems: {
          select: {
            id: true,
            serviceType: true,
            bookingCode: true,
            serviceDate: true,
            quantity: true,
            netPrice: true,
            amount: true,
            status: true,
            supplier: { select: { id: true, supplierCode: true, name: true } },
          },
          orderBy: { sortOrder: 'asc' },
          take: 5,
        },
      },
      orderBy: [{ updatedAt: 'desc' }, { systemCode: 'asc' }],
      take,
    });
  }

  async exportCsv(query: OrderCenterQuery, user?: RequestUser) {
    const rows = await this.list(query, user);
    const header = [
      'systemCode',
      'type',
      'tourCode',
      'name',
      'customerName',
      'customerPhone',
      'startDate',
      'endDate',
      'status',
      'paymentStatus',
      'costStatus',
      'totalRevenue',
      'paidAmount',
      'remainingRevenue',
      'totalCost',
      'paidCost',
      'remainingCost',
      'profit',
      'branch',
      'department',
      'operatorOwner',
    ];
    return csvRows(header, rows as Array<Record<string, unknown>>);
  }

  private where(query: OrderCenterQuery): Prisma.OrderWhereInput {
    const search = normalizeListSearch(query.search);
    const contains = search ? containsSearch(search) : undefined;
    return {
      deletedAt: null,
      ...(query.type ? { type: query.type } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.paymentStatus ? { paymentStatus: query.paymentStatus } : {}),
      ...(query.costStatus ? { costStatus: query.costStatus } : {}),
      ...(query.systemCode ? { systemCode: { contains: query.systemCode, mode: 'insensitive' } } : {}),
      ...(query.tourCode ? { tourCode: { contains: query.tourCode, mode: 'insensitive' } } : {}),
      ...(query.name ? { name: { contains: query.name, mode: 'insensitive' } } : {}),
      ...(query.customerName ? { customerName: { contains: query.customerName, mode: 'insensitive' } } : {}),
      ...(query.customerPhone ? { customerPhone: { contains: query.customerPhone, mode: 'insensitive' } } : {}),
      ...(query.marketGroup ? { marketGroup: { contains: query.marketGroup, mode: 'insensitive' } } : {}),
      ...(query.branch ? { branch: { contains: query.branch, mode: 'insensitive' } } : {}),
      ...(query.department ? { department: { contains: query.department, mode: 'insensitive' } } : {}),
      ...(query.sales ? { createdBy: { contains: query.sales, mode: 'insensitive' } } : {}),
      ...(query.operatorOwner ? { operatorOwner: { contains: query.operatorOwner, mode: 'insensitive' } } : {}),
      ...(query.commissionStatus ? { commissionStatus: { contains: query.commissionStatus, mode: 'insensitive' } } : {}),
      ...(query.customerType ? { customerType: { contains: query.customerType, mode: 'insensitive' } } : {}),
      ...(query.supplier
        ? { operationItems: { some: { supplier: { name: { contains: query.supplier, mode: 'insensitive' } } } } }
        : {}),
      ...(contains
        ? {
            OR: [
              { systemCode: contains },
              { tourCode: contains },
              { name: contains },
              { customerName: contains },
              { customerPhone: contains },
            ],
          }
        : {}),
      ...this.dateRange('createdAt', query.createdFrom, query.createdTo),
      ...this.dateRange('startDate', query.startFrom, query.startTo),
      ...this.dateRange('endDate', query.endFrom, query.endTo),
      ...this.dateRange('paymentDate', query.paymentFrom, query.paymentTo),
    };
  }

  private dateRange(field: 'createdAt' | 'startDate' | 'endDate' | 'paymentDate', from?: string, to?: string) {
    const gte = this.queryDate(from, `${field}From`);
    const lte = this.queryDate(to, `${field}To`);
    if (!gte && !lte) return {};
    return { [field]: { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) } };
  }

  private queryDate(value: string | undefined, label: string) {
    if (!value) return undefined;
    const datePrefix = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(value);
    if (datePrefix) {
      const year = Number(datePrefix[1]);
      const month = Number(datePrefix[2]);
      const day = Number(datePrefix[3]);
      const utc = new Date(Date.UTC(year, month - 1, day));
      if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) {
        throw new BadRequestException(`${label} không hợp lệ`);
      }
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new BadRequestException(`${label} không hợp lệ`);
    return date;
  }

  private take(value: string | number | undefined, fallback: number) {
    const numeric = Number(value || fallback);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.max(1, Math.min(Math.trunc(numeric), 500));
  }

  private isCompact(value: string | boolean | undefined) {
    return value === true || value === 'true' || value === '1';
  }

  private andWhere(where: Prisma.OrderWhereInput, extra: Prisma.OrderWhereInput): Prisma.OrderWhereInput {
    return { AND: [where, extra] };
  }
}

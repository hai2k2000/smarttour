import { Injectable } from '@nestjs/common';
import { OrderStatus, OrderType, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { branchDepartmentScopeWhere, RequestUser } from '../auth/data-scope';
import { containsSearch, normalizeListSearch } from '../list-search';

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
  paymentStatus?: string;
  costStatus?: string;
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
};

@Injectable()
export class OrderCenterService {
  constructor(private readonly prisma: PrismaService) {}

  async dashboard(query: OrderCenterQuery, user?: RequestUser) {
    const where = branchDepartmentScopeWhere(this.where(query), user);
    const now = new Date();
    const next30 = new Date(now);
    next30.setDate(next30.getDate() + 30);
    const [total, upcoming, running, completed, cancelled, unpaid, unpaidCost, totals] = await Promise.all([
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
      total,
      upcoming,
      running,
      completed,
      cancelled,
      unpaid,
      unpaidCost,
      revenue: Number(totals._sum.totalRevenue ?? 0),
      cost: Number(totals._sum.totalCost ?? 0),
      profit: Number(totals._sum.profit ?? 0),
    };
  }

  async list(query: OrderCenterQuery, user?: RequestUser) {
    const where = branchDepartmentScopeWhere(this.where(query), user);
    const take = this.take(query.take, 500);
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
    return `\uFEFF${[
      header.join(','),
      ...rows.map((order) =>
        header.map((key) => this.csv((order as unknown as Record<string, unknown>)[key])).join(','),
      ),
    ].join('\r\n')}`;
  }

  private where(query: OrderCenterQuery): Prisma.OrderWhereInput {
    const search = normalizeListSearch(query.search);
    const contains = search ? containsSearch(search) : undefined;
    return {
      deletedAt: null,
      ...(query.type ? { type: query.type } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.paymentStatus ? { paymentStatus: query.paymentStatus as any } : {}),
      ...(query.costStatus ? { costStatus: query.costStatus as any } : {}),
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
    if (!from && !to) return {};
    return { [field]: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } };
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

  private csv(value: unknown) {
    if (value instanceof Date) return value.toISOString();
    const text = String(value ?? '');
    return `"${text.replaceAll('"', '""')}"`;
  }
}

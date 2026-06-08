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
};

@Injectable()
export class OrderCenterService {
  constructor(private readonly prisma: PrismaService) {}

  async dashboard(query: OrderCenterQuery, user?: RequestUser) {
    const where = branchDepartmentScopeWhere(this.where(query), user);
    const orders = await this.prisma.order.findMany({ where });
    const now = new Date();
    const next30 = new Date(now);
    next30.setDate(next30.getDate() + 30);
    return orders.reduce(
      (acc, order) => {
        acc.total += 1;
        if (order.startDate && order.startDate >= now && order.startDate <= next30) acc.upcoming += 1;
        if (order.status === 'RUNNING') acc.running += 1;
        if (order.status === 'COMPLETED' || order.status === 'SETTLED') acc.completed += 1;
        if (order.status === 'CANCELLED') acc.cancelled += 1;
        if (Number(order.remainingRevenue) > 0) acc.unpaid += 1;
        if (Number(order.remainingCost) > 0) acc.unpaidCost += 1;
        acc.revenue += Number(order.totalRevenue);
        acc.cost += Number(order.totalCost);
        acc.profit += Number(order.profit);
        return acc;
      },
      { total: 0, upcoming: 0, running: 0, completed: 0, cancelled: 0, unpaid: 0, unpaidCost: 0, revenue: 0, cost: 0, profit: 0 },
    );
  }

  async list(query: OrderCenterQuery, user?: RequestUser) {
    return this.prisma.order.findMany({
      where: branchDepartmentScopeWhere(this.where(query), user),
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
      take: 500,
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
    return [
      header.join(','),
      ...rows.map((order) =>
        header.map((key) => this.csv((order as unknown as Record<string, unknown>)[key])).join(','),
      ),
    ].join('\n');
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

  private csv(value: unknown) {
    if (value instanceof Date) return value.toISOString();
    const text = String(value ?? '');
    return `"${text.replaceAll('"', '""')}"`;
  }
}

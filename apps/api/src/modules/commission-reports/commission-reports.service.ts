import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CommissionPaymentStatus, CommissionRule, CommissionStatus, OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { branchDepartmentScopeWhere, RequestUser } from '../auth/data-scope';
import { containsSearch, normalizeListSearch } from '../list-search';

type AnyRecord = Record<string, unknown>;

@Injectable()
export class CommissionReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private listInclude() {
    return {
      order: { select: { id: true, systemCode: true, tourCode: true, name: true, status: true, startDate: true, endDate: true, branch: true, department: true } },
      logs: { orderBy: { createdAt: 'desc' as const }, take: 1, select: { id: true, action: true, actor: true, newStatus: true, createdAt: true } },
      payments: { orderBy: { paidAt: 'desc' as const }, take: 1, select: { id: true, voucherNo: true, paidAt: true, receiver: true, amount: true } },
    } satisfies Prisma.CommissionEntryInclude;
  }

  async list(query: Record<string, string>, user?: RequestUser) {
    await this.syncFromOrders();
    const where = branchDepartmentScopeWhere(this.where(query), user);
    const [rows, summaryRows] = await Promise.all([
      this.prisma.commissionEntry.findMany({
        where,
        orderBy: this.orderBy(query.sortBy),
        include: this.listInclude(),
        take: this.take(query.take),
      }),
      this.prisma.commissionEntry.findMany({ where }),
    ]);
    return { rows, summary: this.summaryFromRows(summaryRows), grouping: this.groupingFromRows(summaryRows, query.groupBy || 'salesOwner') };
  }

  async summary(query: Record<string, string>, user?: RequestUser) {
    await this.syncFromOrders();
    const rows = await this.prisma.commissionEntry.findMany({ where: branchDepartmentScopeWhere(this.where(query), user) });
    return this.summaryFromRows(rows);
  }

  private summaryFromRows(rows: Array<Prisma.CommissionEntryGetPayload<{}>>) {
    const totalCommission = this.sum(rows, 'commissionAmount');
    const approvedCommission = this.sum(rows.filter((row) => row.status === CommissionStatus.APPROVED), 'commissionAmount');
    const pendingCommission = this.sum(rows.filter((row) => row.status === CommissionStatus.PENDING), 'commissionAmount');
    const paidCommission = this.sum(rows, 'paidAmount');
    const unpaidCommission = Math.max(totalCommission - paidCommission, 0);
    const revenue = this.sum(rows, 'revenue');
    const profit = this.sum(rows, 'profit');
    return {
      totalCommission,
      approvedCommission,
      pendingCommission,
      paidCommission,
      unpaidCommission,
      revenue,
      profit,
      bookingCount: rows.length,
      conversionRate: rows.length ? Math.round((rows.filter((row) => row.status === CommissionStatus.APPROVED).length / rows.length) * 10000) / 100 : 0,
    };
  }

  async grouping(groupBy: string, query: Record<string, string>, user?: RequestUser) {
    await this.syncFromOrders();
    const rows = await this.prisma.commissionEntry.findMany({ where: branchDepartmentScopeWhere(this.where(query), user) });
    return this.groupingFromRows(rows, groupBy);
  }

  private groupingFromRows(rows: Array<Prisma.CommissionEntryGetPayload<{}>>, groupBy: string) {
    const keyFor = (row: (typeof rows)[number]) => {
      if (groupBy === 'department') return row.department || 'Chua co phong ban';
      if (groupBy === 'branch') return row.branch || 'Chua co chi nhanh';
      if (groupBy === 'market') return row.marketGroup || 'Chua co thi truong';
      if (groupBy === 'team') return row.team || row.department || 'Chua co nhom';
      return row.salesOwner || 'Chua gan sales';
    };
    const map = new Map<string, { key: string; revenue: number; profit: number; commission: number; bookingCount: number; paid: number; unpaid: number }>();
    for (const row of rows) {
      const key = keyFor(row);
      const current = map.get(key) || { key, revenue: 0, profit: 0, commission: 0, bookingCount: 0, paid: 0, unpaid: 0 };
      current.revenue += Number(row.revenue);
      current.profit += Number(row.profit);
      current.commission += Number(row.commissionAmount);
      current.paid += Number(row.paidAmount);
      current.unpaid += Number(row.remainingAmount);
      current.bookingCount += 1;
      map.set(key, current);
    }
    return Array.from(map.values()).sort((a, b) => b.commission - a.commission);
  }

  async detail(id: string, user?: RequestUser) {
    const row = await this.prisma.commissionEntry.findFirst({
      where: branchDepartmentScopeWhere({ id }, user),
      include: { order: true, logs: { orderBy: { createdAt: 'desc' } }, payments: { orderBy: { paidAt: 'desc' } } },
    });
    if (!row) throw new NotFoundException('Commission entry not found');
    return row;
  }

  async approve(dto: AnyRecord) {
    const ids = this.ids(dto);
    const actor = this.text(dto.actor) || 'accounting';
    await this.prisma.$transaction(ids.map((id) => this.prisma.commissionEntry.update({
      where: { id },
      data: {
        status: CommissionStatus.APPROVED,
        approvedBy: actor,
        approvedAt: new Date(),
        logs: { create: { action: 'APPROVE', actor, note: this.text(dto.note), newStatus: CommissionStatus.APPROVED } },
      },
    })));
    return { approved: ids.length };
  }

  async reject(dto: AnyRecord) {
    return this.changeStatus(dto, CommissionStatus.REJECTED, 'REJECT');
  }

  async revoke(dto: AnyRecord) {
    return this.changeStatus(dto, CommissionStatus.REVOKED, 'REVOKE');
  }

  async pay(dto: AnyRecord) {
    const ids = this.ids(dto);
    const totalAmount = this.decimal(dto.amount);
    const actor = this.text(dto.actor) || 'accounting';
    const voucherNo = this.text(dto.voucherNo);
    const receiver = this.text(dto.receiver);
    await this.prisma.$transaction(async (tx) => {
      for (const id of ids) {
        const row = await tx.commissionEntry.findUnique({ where: { id } });
        if (!row) throw new NotFoundException('Commission entry not found');
        if (row.status !== CommissionStatus.APPROVED) throw new BadRequestException('Only approved commission can be paid');
        const amount = ids.length === 1 && totalAmount > 0 ? totalAmount : Number(row.remainingAmount);
        const paidAmount = Number(row.paidAmount) + amount;
        const remainingAmount = Math.max(Number(row.commissionAmount) - paidAmount, 0);
        const paymentStatus = remainingAmount <= 0 ? CommissionPaymentStatus.PAID : CommissionPaymentStatus.PARTIAL;
        await tx.commissionEntry.update({
          where: { id },
          data: {
            paidAmount,
            remainingAmount,
            paymentStatus,
            paymentVoucherNo: voucherNo,
            receiver,
            paidAt: new Date(),
            payments: { create: { amount, voucherNo, receiver, note: this.text(dto.note), createdBy: actor } },
            logs: { create: { action: 'PAY', actor, note: this.text(dto.note), newStatus: paymentStatus } },
          },
        });
      }
    });
    return { paid: ids.length };
  }

  async exportCsv(query: Record<string, string>, user?: RequestUser) {
    const { rows } = await this.list({ ...query, take: '1000' }, user);
    return this.toCsv(rows.map((row) => ({
      orderCode: row.orderCode,
      tourCode: row.tourCode,
      customerName: row.customerName,
      salesOwner: row.salesOwner,
      team: row.team,
      department: row.department,
      branch: row.branch,
      milestoneDate: row.milestoneDate?.toISOString().slice(0, 10),
      revenue: row.revenue,
      profit: row.profit,
      ratePercent: row.ratePercent,
      commissionAmount: row.commissionAmount,
      status: row.status,
      paymentStatus: row.paymentStatus,
    })));
  }

  async syncFromOrders() {
    const [orders, rules] = await Promise.all([
      this.prisma.order.findMany({ where: { deletedAt: null, status: { not: OrderStatus.CANCELLED } } }),
      this.prisma.commissionRule.findMany({ where: { isActive: true }, orderBy: { createdAt: 'asc' } }),
    ]);
    let created = 0;
    let updated = 0;
    for (const order of orders) {
      const rule = this.pickRule(rules, order.type, Number(order.totalRevenue));
      const rate = Number(order.commission) > 0 && Number(order.totalRevenue) > 0 ? (Number(order.commission) / Number(order.totalRevenue)) * 100 : Number(rule?.ratePercent ?? 0);
      const basis = rule?.basis || 'REVENUE';
      const baseAmount = basis === 'PROFIT' ? Number(order.profit) : Number(order.totalRevenue);
      const commissionAmount = Number(order.commission) > 0 ? Number(order.commission) : Math.max(baseAmount * rate / 100, 0);
      const milestoneType = rule?.milestoneType || 'CHECK_IN';
      const existing = await this.prisma.commissionEntry.findUnique({ where: { orderId: order.id } });
      const data = {
        orderCode: order.systemCode,
        orderType: order.type,
        tourCode: order.tourCode,
        customerName: order.customerName,
        salesOwner: order.createdBy || order.operatorOwner || order.collaborator,
        team: order.department,
        department: order.department,
        branch: order.branch,
        marketGroup: order.marketGroup,
        milestoneType,
        milestoneDate: this.milestoneDate(order, milestoneType),
        revenue: order.totalRevenue,
        profit: order.profit,
        basis,
        ratePercent: rate,
        commissionAmount,
        remainingAmount: existing ? Math.max(commissionAmount - Number(existing.paidAmount), 0) : commissionAmount,
        formula: `${basis} x ${rate}%`,
      };
      if (existing) {
        await this.prisma.commissionEntry.update({ where: { id: existing.id }, data });
        updated += 1;
      } else {
        await this.prisma.commissionEntry.create({ data: { ...data, orderId: order.id, logs: { create: { action: 'SYNC', note: 'Created from order' } } } });
        created += 1;
      }
    }
    return { created, updated, scanned: orders.length };
  }

  private async changeStatus(dto: AnyRecord, status: CommissionStatus, action: string) {
    const ids = this.ids(dto);
    const actor = this.text(dto.actor) || 'accounting';
    await this.prisma.$transaction(ids.map((id) => this.prisma.commissionEntry.update({
      where: { id },
      data: {
        status,
        rejectedBy: status === CommissionStatus.REJECTED ? actor : undefined,
        rejectedAt: status === CommissionStatus.REJECTED ? new Date() : undefined,
        logs: { create: { action, actor, note: this.text(dto.note), newStatus: status } },
      },
    })));
    return { changed: ids.length, status };
  }

  private where(query: Record<string, string>): Prisma.CommissionEntryWhereInput {
    const where: Prisma.CommissionEntryWhereInput = {};
    const search = normalizeListSearch(query.search);
    const contains = search ? containsSearch(search) : undefined;
    if (query.status) where.status = query.status as CommissionStatus;
    if (query.paymentStatus) where.paymentStatus = query.paymentStatus as CommissionPaymentStatus;
    if (query.employee) where.salesOwner = { contains: query.employee, mode: 'insensitive' };
    if (query.salesOwner) where.salesOwner = { contains: query.salesOwner, mode: 'insensitive' };
    if (query.department) where.department = { contains: query.department, mode: 'insensitive' };
    if (query.branch) where.branch = { contains: query.branch, mode: 'insensitive' };
    if (query.market) where.marketGroup = { contains: query.market, mode: 'insensitive' };
    if (query.productType) where.orderType = query.productType as never;
    if (query.from || query.to) where.milestoneDate = { gte: this.date(query.from), lte: this.date(query.to) };
    if (contains) {
      where.OR = [
        { orderCode: contains },
        { tourCode: contains },
        { customerName: contains },
        { salesOwner: contains },
      ];
    }
    return where;
  }

  private pickRule(rules: CommissionRule[], type: unknown, revenue: number) {
    return rules.find((rule) => rule.productType === type && (rule.minRevenue == null || Number(rule.minRevenue) <= revenue) && (rule.maxRevenue == null || Number(rule.maxRevenue) >= revenue))
      || rules.find((rule) => rule.productType === type)
      || rules.find((rule) => rule.productType == null);
  }

  private milestoneDate(order: { createdDate: Date | null; createdAt: Date; paymentDate: Date | null; startDate: Date | null; endDate: Date | null; settledAt: Date | null }, type: string) {
    if (type === 'CREATED') return order.createdDate || order.createdAt;
    if (type === 'PAYMENT_FULL') return order.paymentDate;
    if (type === 'CHECK_OUT') return order.endDate;
    if (type === 'APPROVED') return order.settledAt;
    return order.startDate;
  }

  private orderBy(sortBy?: string): Prisma.CommissionEntryOrderByWithRelationInput {
    if (sortBy === 'revenue') return { revenue: 'desc' };
    if (sortBy === 'commission') return { commissionAmount: 'desc' };
    if (sortBy === 'employee') return { salesOwner: 'asc' };
    return { milestoneDate: 'desc' };
  }

  private ids(dto: AnyRecord) {
    const ids = Array.isArray(dto.ids) ? dto.ids.map((id) => this.text(id)).filter((id): id is string => !!id) : [];
    const single = this.text(dto.id);
    const result = single ? [single] : ids;
    if (!result.length) throw new BadRequestException('id or ids is required');
    return result;
  }

  private sum<T extends AnyRecord>(rows: T[], field: keyof T) {
    return rows.reduce((total, row) => total + Number(row[field] ?? 0), 0);
  }

  private take(value: unknown) {
    const parsed = typeof value === 'string' ? Number.parseInt(value, 10) : 100;
    return Math.min(Math.max(Number.isFinite(parsed) ? parsed : 100, 1), 1000);
  }

  private date(value: unknown) {
    if (!value || typeof value !== 'string') return undefined;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  private text(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private decimal(value: unknown) {
    const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : 0;
    return Number.isFinite(number) ? number : 0;
  }

  private toCsv(rows: AnyRecord[]) {
    const headers = Object.keys(rows[0] ?? { empty: '' });
    const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    return [headers.join(','), ...rows.map((row) => headers.map((header) => escape(row[header])).join(','))].join('\n');
  }
}

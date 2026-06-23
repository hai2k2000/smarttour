import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CommissionPaymentStatus, CommissionRule, CommissionStatus, OrderStatus, OrderType, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { branchDepartmentScopeWhere, RequestUser } from '../auth/data-scope';
import { containsSearch, normalizeListSearch } from '../list-search';
import type { CommissionReportActionDto, CommissionReportsQueryDto, PayCommissionReportDto } from './dto/commission-report.dto';

type AnyRecord = Record<string, unknown>;
type CommissionReportsQueryInput = Omit<CommissionReportsQueryDto, 'take'> & { take?: number | string };
type CommissionReportActionInput = Pick<CommissionReportActionDto, 'id' | 'ids' | 'note'>;
type PayCommissionReportInput = CommissionReportActionInput & Pick<PayCommissionReportDto, 'amount' | 'voucherNo' | 'receiver'>;

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

  async list(query: CommissionReportsQueryInput, user?: RequestUser) {
    const where = branchDepartmentScopeWhere(this.where(query), user);
    const [rows, summary, grouping] = await Promise.all([
      this.prisma.commissionEntry.findMany({
        where,
        orderBy: this.orderBy(query.sortBy),
        include: this.listInclude(),
        take: this.take(query.take),
      }),
      this.summaryFromDb(where),
      this.groupingFromDb(query.groupBy || 'salesOwner', where),
    ]);
    return { rows, summary, grouping };
  }

  async summary(query: CommissionReportsQueryInput, user?: RequestUser) {
    const where = branchDepartmentScopeWhere(this.where(query), user);
    return this.summaryFromDb(where);
  }

  private async summaryFromDb(where: Prisma.CommissionEntryWhereInput) {
    const [total, approved, pending] = await Promise.all([
      this.prisma.commissionEntry.aggregate({
        where,
        _count: { _all: true },
        _sum: { commissionAmount: true, paidAmount: true, revenue: true, profit: true },
      }),
      this.prisma.commissionEntry.aggregate({
        where: { AND: [where, { status: CommissionStatus.APPROVED }] },
        _count: { _all: true },
        _sum: { commissionAmount: true },
      }),
      this.prisma.commissionEntry.aggregate({
        where: { AND: [where, { status: CommissionStatus.PENDING }] },
        _sum: { commissionAmount: true },
      }),
    ]);
    const totalCommission = Number(total._sum.commissionAmount ?? 0);
    const approvedCommission = Number(approved._sum.commissionAmount ?? 0);
    const pendingCommission = Number(pending._sum.commissionAmount ?? 0);
    const paidCommission = Number(total._sum.paidAmount ?? 0);
    const unpaidCommission = Math.max(totalCommission - paidCommission, 0);
    const bookingCount = total._count._all;
    return {
      totalCommission,
      approvedCommission,
      pendingCommission,
      paidCommission,
      unpaidCommission,
      revenue: Number(total._sum.revenue ?? 0),
      profit: Number(total._sum.profit ?? 0),
      bookingCount,
      conversionRate: bookingCount ? Math.round((approved._count._all / bookingCount) * 10000) / 100 : 0,
    };
  }

  async grouping(groupBy: string, query: CommissionReportsQueryInput, user?: RequestUser) {
    const where = branchDepartmentScopeWhere(this.where(query), user);
    return this.groupingFromDb(groupBy, where);
  }

  private async groupingFromDb(groupBy: string, where: Prisma.CommissionEntryWhereInput) {
    const field = this.groupingField(groupBy);
    const groups = groupBy === 'team'
      ? await this.prisma.commissionEntry.groupBy({
          by: ['team', 'department'],
          where,
          _count: { _all: true },
          _sum: { revenue: true, profit: true, commissionAmount: true, paidAmount: true, remainingAmount: true },
        })
      : await this.prisma.commissionEntry.groupBy({
          by: [field],
          where,
          _count: { _all: true },
          _sum: { revenue: true, profit: true, commissionAmount: true, paidAmount: true, remainingAmount: true },
        });
    const map = new Map<string, { key: string; revenue: number; profit: number; commission: number; bookingCount: number; paid: number; unpaid: number }>();
    for (const row of groups) {
      const key = this.groupingKey(row, groupBy, field);
      const current = map.get(key) || { key, revenue: 0, profit: 0, commission: 0, bookingCount: 0, paid: 0, unpaid: 0 };
      current.revenue += Number(row._sum.revenue ?? 0);
      current.profit += Number(row._sum.profit ?? 0);
      current.commission += Number(row._sum.commissionAmount ?? 0);
      current.paid += Number(row._sum.paidAmount ?? 0);
      current.unpaid += Number(row._sum.remainingAmount ?? 0);
      current.bookingCount += row._count._all;
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

  async approve(dto: CommissionReportActionInput, user?: RequestUser) {
    const ids = this.ids(dto);
    const actor = this.actor(user);
    await this.prisma.$transaction(async (tx) => {
      for (const id of ids) {
        const row = await this.scopedEntryForUpdate(tx, id, user);
        if (row.status !== CommissionStatus.PENDING) throw new BadRequestException('Only pending commission can be approved');
        await tx.commissionEntry.update({
          where: { id },
          data: {
            status: CommissionStatus.APPROVED,
            approvedBy: actor,
            approvedAt: new Date(),
            logs: { create: { action: 'APPROVE', actor, note: this.text(dto.note), oldStatus: row.status, newStatus: CommissionStatus.APPROVED } },
          },
        });
      }
    });
    return { approved: ids.length };
  }

  async reject(dto: CommissionReportActionInput, user?: RequestUser) {
    return this.changeStatus(dto, CommissionStatus.REJECTED, 'REJECT', user);
  }

  async revoke(dto: CommissionReportActionInput, user?: RequestUser) {
    return this.changeStatus(dto, CommissionStatus.REVOKED, 'REVOKE', user);
  }

  async pay(dto: PayCommissionReportInput, user?: RequestUser) {
    const ids = this.ids(dto);
    const requestedAmount = this.paymentAmount(dto.amount);
    if (ids.length > 1 && requestedAmount !== undefined) throw new BadRequestException('amount can only be used with one commission report');
    const actor = this.actor(user);
    const voucherNo = this.text(dto.voucherNo);
    const receiver = this.text(dto.receiver);
    await this.prisma.$transaction(async (tx) => {
      for (const id of ids) {
        const row = await this.scopedEntryForUpdate(tx, id, user);
        if (row.status !== CommissionStatus.APPROVED) throw new BadRequestException('Only approved commission can be paid');
        const remaining = Number(row.remainingAmount);
        const amount = requestedAmount ?? remaining;
        if (amount <= 0) throw new BadRequestException('Payment amount must be greater than 0');
        if (amount > remaining) throw new BadRequestException('Payment amount cannot exceed remaining commission');
        const paidAmount = Number(row.paidAmount) + amount;
        const remainingAmount = remaining - amount;
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

  async exportCsv(query: CommissionReportsQueryInput, user?: RequestUser) {
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

  async syncFromOrders(user?: RequestUser) {
    const [orders, rules] = await Promise.all([
      this.prisma.order.findMany({ where: branchDepartmentScopeWhere({ deletedAt: null, status: { not: OrderStatus.CANCELLED } }, user) }),
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
        if (existing.status !== CommissionStatus.PENDING || existing.paymentStatus !== CommissionPaymentStatus.UNPAID) {
          continue;
        }
        await this.prisma.commissionEntry.update({ where: { id: existing.id }, data });
        updated += 1;
      } else {
        await this.prisma.commissionEntry.create({ data: { ...data, orderId: order.id, logs: { create: { action: 'SYNC', note: 'Created from order' } } } });
        created += 1;
      }
    }
    return { created, updated, scanned: orders.length };
  }

  private async changeStatus(dto: CommissionReportActionInput, status: CommissionStatus, action: string, user?: RequestUser) {
    const ids = this.ids(dto);
    const actor = this.actor(user);
    await this.prisma.$transaction(async (tx) => {
      for (const id of ids) {
        const row = await this.scopedEntryForUpdate(tx, id, user);
        if (status === CommissionStatus.REJECTED && row.status !== CommissionStatus.PENDING) {
          throw new BadRequestException('Only pending commission can be rejected');
        }
        if (status === CommissionStatus.REVOKED && row.status !== CommissionStatus.APPROVED) {
          throw new BadRequestException('Only approved commission can be revoked');
        }
        if (status === CommissionStatus.REVOKED && Number(row.paidAmount) > 0) {
          throw new BadRequestException('Paid commission cannot be revoked');
        }
        await tx.commissionEntry.update({
          where: { id },
          data: {
            status,
            rejectedBy: status === CommissionStatus.REJECTED ? actor : undefined,
            rejectedAt: status === CommissionStatus.REJECTED ? new Date() : undefined,
            logs: { create: { action, actor, note: this.text(dto.note), oldStatus: row.status, newStatus: status } },
          },
        });
      }
    });
    return { changed: ids.length, status };
  }

  private where(query: CommissionReportsQueryInput): Prisma.CommissionEntryWhereInput {
    const where: Prisma.CommissionEntryWhereInput = {};
    const search = normalizeListSearch(query.search);
    const contains = search ? containsSearch(search) : undefined;
    if (query.status) where.status = query.status;
    if (query.paymentStatus) where.paymentStatus = query.paymentStatus;
    if (query.employee) where.salesOwner = { contains: query.employee, mode: 'insensitive' };
    if (query.salesOwner) where.salesOwner = { contains: query.salesOwner, mode: 'insensitive' };
    if (query.department) where.department = { contains: query.department, mode: 'insensitive' };
    if (query.branch) where.branch = { contains: query.branch, mode: 'insensitive' };
    if (query.market) where.marketGroup = { contains: query.market, mode: 'insensitive' };
    if (query.productType) where.orderType = query.productType as OrderType;
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

  private groupingField(groupBy: string): 'department' | 'branch' | 'marketGroup' | 'salesOwner' {
    if (groupBy === 'department') return 'department';
    if (groupBy === 'branch') return 'branch';
    if (groupBy === 'market') return 'marketGroup';
    return 'salesOwner';
  }

  private groupingKey(row: AnyRecord, groupBy: string, field: 'department' | 'branch' | 'marketGroup' | 'salesOwner') {
    if (groupBy === 'department') return String(row.department || 'Chua co phong ban');
    if (groupBy === 'branch') return String(row.branch || 'Chua co chi nhanh');
    if (groupBy === 'market') return String(row.marketGroup || 'Chua co thi truong');
    if (groupBy === 'team') return String(row.team || row.department || 'Chua co nhom');
    return String(row[field] || 'Chua gan sales');
  }

  private ids(dto: CommissionReportActionInput) {
    const ids = Array.isArray(dto.ids) ? dto.ids.map((id) => this.text(id)).filter((id): id is string => !!id) : [];
    const single = this.text(dto.id);
    const result = [...new Set(single ? [single] : ids)].sort();
    if (!result.length) throw new BadRequestException('id or ids is required');
    return result;
  }

  private take(value: unknown) {
    const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number.parseInt(value, 10) : 100;
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

  private paymentAmount(value: unknown) {
    if (value === undefined || value === null || value === '') return undefined;
    const amount = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
    if (!Number.isFinite(amount) || amount <= 0) throw new BadRequestException('Payment amount must be greater than 0');
    return amount;
  }

  private async scopedEntryForUpdate(tx: Prisma.TransactionClient, id: string, user?: RequestUser) {
    await tx.$queryRaw`SELECT "id" FROM "CommissionEntry" WHERE "id" = ${id} FOR UPDATE`;
    const row = await tx.commissionEntry.findFirst({ where: branchDepartmentScopeWhere({ id }, user) });
    if (!row) throw new NotFoundException('Commission entry not found');
    return row;
  }

  private actor(user?: RequestUser) {
    return user?.username || user?.email || user?.id || 'system';
  }

  private toCsv(rows: AnyRecord[]) {
    const headers = Object.keys(rows[0] ?? { empty: '' });
    const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    return `\uFEFF${[headers.join(','), ...rows.map((row) => headers.map((header) => escape(row[header])).join(','))].join('\r\n')}`;
  }
}

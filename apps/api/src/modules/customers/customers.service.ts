import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CustomerStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { applyWriteDataScope, branchDepartmentScopeWhere, RequestUser } from '../auth/data-scope';
import { FilesService } from '../files/files.service';

type AnyRecord = Record<string, unknown>;

const customerInclude = {
  type: true,
  campaign: true,
  tags: { include: { tag: true } },
  contacts: { orderBy: { createdAt: 'asc' as const } },
  careTasks: { orderBy: { scheduledAt: 'desc' as const } },
  comments: { orderBy: { createdAt: 'desc' as const }, take: 5 },
  callLogs: { orderBy: { calledAt: 'desc' as const }, take: 5 },
  opportunities: { orderBy: { createdAt: 'desc' as const } },
  files: { orderBy: { createdAt: 'desc' as const } },
};

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService, private readonly filesService: FilesService) {}

  private listSelect() {
    return {
      id: true,
      code: true,
      fullName: true,
      phone: true,
      email: true,
      kind: true,
      status: true,
      source: true,
      market: true,
      owner: true,
      branch: true,
      department: true,
      latestComment: true,
      createdAt: true,
      updatedAt: true,
      type: { select: { id: true, code: true, name: true } },
      campaign: { select: { id: true, code: true, name: true, isActive: true } },
      tags: { select: { tag: { select: { id: true, name: true, color: true } } } },
      _count: { select: { contacts: true, careTasks: true, comments: true, callLogs: true, opportunities: true } },
    } satisfies Prisma.CustomerSelect;
  }

  async list(query: Record<string, string>, user?: RequestUser) {
    const where = branchDepartmentScopeWhere(this.customerWhere(query), user);
    const [rows, total, dashboard, types, tags, campaigns] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        select: this.listSelect(),
        orderBy: { createdAt: 'desc' },
        take: this.take(query.take),
      }),
      this.prisma.customer.count({ where }),
      this.dashboard(query, user),
      this.types(),
      this.tags(),
      this.campaigns(),
    ]);
    return { rows, total, dashboard, types, tags, campaigns };
  }

  async dashboard(query: Record<string, string>, user?: RequestUser) {
    const where = branchDepartmentScopeWhere(this.customerWhere(query), user);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const [customers, orders] = await Promise.all([
      this.prisma.customer.findMany({ where, select: { id: true, phone: true, email: true, fullName: true, createdAt: true } }),
      this.prisma.order.findMany({ where: { deletedAt: null }, select: { customerId: true, customerPhone: true, customerEmail: true, customerName: true, totalRevenue: true, paidAmount: true } }),
    ]);
    const keys = customers.map((customer) => this.customerKey(customer));
    const orderCounts = new Map<string, number>();
    let totalRevenue = 0;
    let totalDebt = 0;
    for (const order of orders) {
      const key = this.orderKey(order);
      orderCounts.set(key, (orderCounts.get(key) ?? 0) + 1);
      if (keys.includes(key)) {
        const revenue = Number(order.totalRevenue ?? 0);
        const paid = Number(order.paidAmount ?? 0);
        totalRevenue += revenue;
        totalDebt += Math.max(revenue - paid, 0);
      }
    }
    const oneTime = keys.filter((key) => (orderCounts.get(key) ?? 0) === 1).length;
    const repeat = keys.filter((key) => (orderCounts.get(key) ?? 0) > 1).length;
    return {
      totalCustomers: customers.length,
      newToday: customers.filter((customer) => customer.createdAt >= today).length,
      newThisMonth: customers.filter((customer) => customer.createdAt >= monthStart).length,
      oneTimeCustomers: oneTime,
      repeatCustomers: repeat,
      totalRevenue,
      totalDebt,
    };
  }

  types() {
    return this.prisma.customerTypeConfig.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
  }

  createType(dto: AnyRecord) {
    const name = this.required(dto.name, 'name');
    return this.prisma.customerTypeConfig.create({
      data: {
        code: this.text(dto.code) || this.slug(name),
        name,
        description: this.text(dto.description),
        isActive: this.boolean(dto.isActive, true),
        sortOrder: this.int(dto.sortOrder),
      },
    });
  }

  updateType(id: string, dto: AnyRecord) {
    return this.prisma.customerTypeConfig.update({
      where: { id },
      data: {
        ...(dto.code !== undefined ? { code: this.required(dto.code, 'code') } : {}),
        ...(dto.name !== undefined ? { name: this.required(dto.name, 'name') } : {}),
        ...(dto.description !== undefined ? { description: this.text(dto.description) } : {}),
        ...(dto.isActive !== undefined ? { isActive: this.boolean(dto.isActive, true) } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: this.int(dto.sortOrder) } : {}),
      },
    });
  }

  tags() {
    return this.prisma.customerTag.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
  }

  createTag(dto: AnyRecord) {
    return this.prisma.customerTag.create({
      data: { name: this.required(dto.name, 'name'), color: this.text(dto.color), isActive: this.boolean(dto.isActive, true) },
    });
  }

  async bulkTag(dto: AnyRecord) {
    const customerIds = this.stringArray(dto.customerIds);
    const tagIds = this.stringArray(dto.tagIds);
    if (!customerIds.length || !tagIds.length) throw new BadRequestException('customerIds and tagIds are required');
    const data = customerIds.flatMap((customerId) => tagIds.map((tagId) => ({ customerId, tagId })));
    await this.prisma.customerTagMap.createMany({ data, skipDuplicates: true });
    return { affectedCustomers: customerIds.length, tagCount: tagIds.length };
  }

  async bulkUpdate(dto: AnyRecord, user?: RequestUser) {
    const customerIds = this.stringArray(dto.customerIds);
    if (!customerIds.length) throw new BadRequestException('customerIds is required');
    const data: Prisma.CustomerUncheckedUpdateInput = {};
    if (dto.owner !== undefined) data.owner = this.text(dto.owner);
    if (dto.groupName !== undefined) data.groupName = this.text(dto.groupName);
    const scopedDto = applyWriteDataScope({ branch: this.text(dto.branch), department: this.text(dto.department) }, user);
    if (dto.branch !== undefined || scopedDto.branch !== undefined) data.branch = scopedDto.branch;
    if (dto.department !== undefined || scopedDto.department !== undefined) data.department = scopedDto.department;
    if (!Object.keys(data).length && !this.stringArray(dto.tagIds).length) throw new BadRequestException('No bulk update fields provided');
    await this.prisma.$transaction(async (tx) => {
      if (Object.keys(data).length) await tx.customer.updateMany({ where: branchDepartmentScopeWhere({ id: { in: customerIds } }, user), data });
      const tagIds = this.stringArray(dto.tagIds);
      if (tagIds.length) await tx.customerTagMap.createMany({ data: customerIds.flatMap((customerId) => tagIds.map((tagId) => ({ customerId, tagId }))), skipDuplicates: true });
      await tx.customerTimeline.createMany({
        data: customerIds.map((customerId) => ({ customerId, eventType: 'BULK_UPDATE', title: 'Cap nhat hang loat', actor: this.text(dto.actor), content: this.text(dto.note) })),
      });
    });
    return { affectedCustomers: customerIds.length };
  }

  campaigns() {
    return this.prisma.customerCampaign.findMany({ orderBy: { createdAt: 'desc' } });
  }

  createCampaign(dto: AnyRecord) {
    const name = this.required(dto.name, 'name');
    return this.prisma.customerCampaign.create({
      data: {
        code: this.text(dto.code) || this.slug(name),
        name,
        channel: this.text(dto.channel),
        startDate: this.date(dto.startDate),
        endDate: this.date(dto.endDate),
        budget: this.decimal(dto.budget),
        isActive: this.boolean(dto.isActive, true),
        note: this.text(dto.note),
      },
    });
  }

  async detail(id: string, user?: RequestUser) {
    const customer = await this.prisma.customer.findFirst({ where: branchDepartmentScopeWhere({ id }, user), include: customerInclude });
    if (!customer) throw new NotFoundException('Customer not found');
    const [orders, quotes, debts, timeline] = await Promise.all([this.orders(id, user), this.quotes(id, user), this.debts(id, user), this.timeline(id)]);
    return { ...customer, related: { orders: orders.rows, quotes: quotes.rows, debts, timeline: timeline.rows } };
  }

  async addFile(
    id: string,
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer } | undefined,
    actorId?: string,
    user?: RequestUser,
  ) {
    await this.getCustomer(id, user);
    const upload = await this.filesService.upload(file, `customers/${id}`, actorId);
    try {
      return await this.prisma.customerFile.create({
        data: { customerId: id, fileName: upload.fileName, fileUrl: upload.url, fileType: upload.mimeType, uploadedBy: actorId },
      });
    } catch (error) {
      await this.filesService.remove(upload.objectKey).catch(() => undefined);
      throw error;
    }
  }

  async deleteFile(id: string, fileId: string, user?: RequestUser) {
    await this.getCustomer(id, user);
    const file = await this.prisma.customerFile.findFirst({ where: { id: fileId, customerId: id } });
    if (!file) throw new NotFoundException('Customer file not found');
    const objectKey = this.objectKey(file.fileUrl);
    if (objectKey) await this.filesService.remove(objectKey);
    return this.prisma.customerFile.delete({ where: { id: fileId } });
  }

  async create(dto: AnyRecord, user?: RequestUser) {
    dto = applyWriteDataScope(dto, user);
    const phone = this.required(dto.phone, 'phone');
    await this.assertPhoneUnique(phone);
    return this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.create({
        data: {
          ...this.customerData(dto),
          code: this.text(dto.code) || (await this.nextCode(tx)),
          phone,
          contacts: { create: this.contacts(dto.contacts) },
          careTasks: { create: this.careTasks(dto.careTasks) },
          comments: { create: this.comments(dto.comments) },
          callLogs: { create: this.callLogs(dto.callLogs) },
          opportunities: { create: this.opportunitiesInput(dto.opportunities) },
          tags: { create: this.stringArray(dto.tagIds).map((tagId) => ({ tagId })) },
          timeline: { create: [{ eventType: 'CREATE', title: 'Tao khach hang', actor: this.text(dto.createdBy) || this.text(dto.owner) }] },
        } as Prisma.CustomerUncheckedCreateInput,
        include: customerInclude,
      });
      await this.linkExistingData(tx, customer.id, customer.phone, customer.email, customer.fullName);
      return customer;
    });
  }

  async update(id: string, dto: AnyRecord, user?: RequestUser) {
    const existing = await this.prisma.customer.findFirst({ where: branchDepartmentScopeWhere({ id }, user) });
    if (!existing) throw new NotFoundException('Customer not found');
    dto = applyWriteDataScope(dto, user);
    const nextPhone = dto.phone !== undefined ? this.required(dto.phone, 'phone') : existing.phone;
    if (nextPhone !== existing.phone) await this.assertPhoneUnique(nextPhone, id);
    return this.prisma.$transaction(async (tx) => {
      await tx.customerContact.deleteMany({ where: { customerId: id } });
      await tx.customerTagMap.deleteMany({ where: { customerId: id } });
      if (dto.contacts !== undefined) await tx.customerContact.createMany({ data: this.contacts(dto.contacts).map((row) => ({ ...row, customerId: id })) });
      if (dto.tagIds !== undefined) await tx.customerTagMap.createMany({ data: this.stringArray(dto.tagIds).map((tagId) => ({ customerId: id, tagId })), skipDuplicates: true });
      await tx.customerTimeline.create({ data: { customerId: id, eventType: 'UPDATE', title: 'Cap nhat khach hang', actor: this.text(dto.owner) } });
      const customer = await tx.customer.update({ where: { id }, data: { ...this.customerData(dto), phone: nextPhone } as Prisma.CustomerUncheckedUpdateInput, include: customerInclude });
      await this.linkExistingData(tx, customer.id, customer.phone, customer.email, customer.fullName);
      return customer;
    });
  }

  async remove(id: string, user?: RequestUser) {
    const customer = await this.prisma.customer.findFirst({ where: branchDepartmentScopeWhere({ id }, user) });
    if (!customer) throw new NotFoundException('Customer not found');
    const [orderCount, quoteCount] = await Promise.all([
      this.prisma.order.count({ where: { OR: [{ customerId: id }, { customerPhone: customer.phone }] } }),
      this.prisma.quotation.count({ where: { OR: [{ customerId: id }, { customerPhone: customer.phone }] } }),
    ]);
    if (orderCount || quoteCount) throw new BadRequestException('Khong xoa khach hang da phat sinh bao gia hoac don hang');
    await this.prisma.customer.delete({ where: { id } });
    return { deleted: true };
  }

  async merge(targetId: string, dto: AnyRecord) {
    const sourceId = this.required(dto.sourceId, 'sourceId');
    if (sourceId === targetId) throw new BadRequestException('sourceId must be different from target customer');
    const [target, source] = await Promise.all([
      this.prisma.customer.findUnique({ where: { id: targetId } }),
      this.prisma.customer.findUnique({ where: { id: sourceId } }),
    ]);
    if (!target || !source) throw new NotFoundException('Customer not found');
    await this.prisma.$transaction([
      this.prisma.customerContact.updateMany({ where: { customerId: sourceId }, data: { customerId: targetId } }),
      this.prisma.customerCareTask.updateMany({ where: { customerId: sourceId }, data: { customerId: targetId } }),
      this.prisma.customerComment.updateMany({ where: { customerId: sourceId }, data: { customerId: targetId } }),
      this.prisma.customerCallLog.updateMany({ where: { customerId: sourceId }, data: { customerId: targetId } }),
      this.prisma.customerOpportunity.updateMany({ where: { customerId: sourceId }, data: { customerId: targetId } }),
      this.prisma.customerTimeline.create({ data: { customerId: targetId, eventType: 'MERGE', title: `Merge ${source.code}`, content: this.text(dto.note) } }),
      this.prisma.customer.update({ where: { id: sourceId }, data: { status: CustomerStatus.MERGED, mergedIntoId: targetId, owner: this.text(dto.transferOwner) || source.owner } }),
      this.prisma.order.updateMany({ where: { customerId: sourceId }, data: { customerId: targetId } }),
      this.prisma.quotation.updateMany({ where: { customerId: sourceId }, data: { customerId: targetId } }),
      this.prisma.tourQuote.updateMany({ where: { customerId: sourceId }, data: { customerId: targetId } }),
    ]);
    return this.detail(targetId);
  }

  async transferOwner(id: string, dto: AnyRecord) {
    const owner = this.required(dto.owner, 'owner');
    await this.prisma.customer.update({ where: { id }, data: { owner } });
    await this.prisma.customerTimeline.create({ data: { customerId: id, eventType: 'TRANSFER_OWNER', title: 'Chuyen nhan vien phu trach', content: this.text(dto.reason), actor: this.text(dto.actor) } });
    return this.detail(id);
  }

  async addComment(id: string, dto: AnyRecord, user?: RequestUser) {
    await this.getCustomer(id, user);
    const comment = await this.prisma.customerComment.create({ data: { ...this.comments([dto])[0], customerId: id } });
    await this.prisma.customer.update({ where: { id }, data: { latestComment: comment.content } });
    await this.prisma.customerTimeline.create({ data: { customerId: id, eventType: 'COMMENT', title: 'Them binh luan', content: comment.content, actor: comment.createdBy } });
    return this.detail(id);
  }

  async addCareTask(id: string, dto: AnyRecord, user?: RequestUser) {
    await this.getCustomer(id, user);
    const task = await this.prisma.customerCareTask.create({ data: { ...this.careTasks([dto])[0], customerId: id } });
    await this.prisma.customerTimeline.create({ data: { customerId: id, eventType: 'CARE', title: `CSKH ${task.channel}`, content: task.note, actor: task.owner } });
    return this.detail(id);
  }

  async addCallLog(id: string, dto: AnyRecord, user?: RequestUser) {
    await this.getCustomer(id, user);
    const call = await this.prisma.customerCallLog.create({ data: { ...this.callLogs([dto])[0], customerId: id } });
    await this.prisma.customerTimeline.create({ data: { customerId: id, eventType: 'CALL', title: 'Ghi nhan cuoc goi', content: call.note, actor: call.caller } });
    return this.detail(id);
  }

  async addOpportunity(id: string, dto: AnyRecord, user?: RequestUser) {
    await this.getCustomer(id, user);
    const opportunity = await this.prisma.customerOpportunity.create({ data: { ...this.opportunitiesInput([dto])[0], customerId: id } });
    await this.prisma.customerTimeline.create({ data: { customerId: id, eventType: 'OPPORTUNITY', title: opportunity.title, content: opportunity.note, actor: opportunity.owner } });
    return this.detail(id);
  }

  async updateCareTask(id: string, taskId: string, dto: AnyRecord, user?: RequestUser) {
    await this.getCustomer(id, user);
    const task = await this.prisma.customerCareTask.update({
      where: { id: taskId },
      data: {
        ...(dto.status !== undefined ? { status: this.text(dto.status) || 'PENDING' } : {}),
        ...(dto.result !== undefined ? { result: this.text(dto.result) } : {}),
        ...(dto.completedAt !== undefined ? { completedAt: this.date(dto.completedAt) } : {}),
        ...(dto.note !== undefined ? { note: this.text(dto.note) } : {}),
      },
    });
    await this.prisma.customerTimeline.create({ data: { customerId: id, eventType: 'CARE_UPDATE', title: `Cap nhat CSKH ${task.status}`, content: task.result || task.note, actor: task.owner } });
    return this.detail(id);
  }

  async orders(id: string, user?: RequestUser) {
    const customer = await this.getCustomer(id, user);
    const rows = await this.prisma.order.findMany({
      where: branchDepartmentScopeWhere({ deletedAt: null, OR: [{ customerId: id }, { customerPhone: customer.phone }, { customerEmail: customer.email ?? undefined }, { customerName: customer.fullName }] }, user),
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return { rows };
  }

  async quotes(id: string, user?: RequestUser) {
    const customer = await this.getCustomer(id, user);
    const [quotations, tourQuotes] = await Promise.all([
      this.prisma.quotation.findMany({ where: { OR: [{ customerId: id }, { customerPhone: customer.phone }, { customerEmail: customer.email ?? undefined }, { customerName: customer.fullName }] }, orderBy: { createdAt: 'desc' }, take: 100 }),
      this.prisma.tourQuote.findMany({ where: { OR: [{ customerId: id }, { customerPhone: customer.phone }, { customerEmail: customer.email ?? undefined }, { customerName: customer.fullName }] }, orderBy: { createdAt: 'desc' }, take: 100 }),
    ]);
    return { rows: [...quotations.map((row) => ({ ...row, source: 'quotation' })), ...tourQuotes.map((row) => ({ ...row, source: 'tour-quote' }))] };
  }

  async debts(id: string, user?: RequestUser) {
    const { rows } = await this.orders(id, user);
    const totalRevenue = rows.reduce((sum, order) => sum + Number(order.totalRevenue ?? 0), 0);
    const paidAmount = rows.reduce((sum, order) => sum + Number(order.paidAmount ?? 0), 0);
    return { totalRevenue, paidAmount, receivableDebt: Math.max(totalRevenue - paidAmount, 0), rows };
  }

  timeline(id: string) {
    return this.prisma.customerTimeline.findMany({ where: { customerId: id }, orderBy: { createdAt: 'desc' }, take: 100 }).then((rows) => ({ rows }));
  }

  careHistory(id: string) {
    return this.prisma.customerCareTask.findMany({ where: { customerId: id }, orderBy: { scheduledAt: 'desc' }, take: 100 }).then((rows) => ({ rows }));
  }

  opportunities(id: string) {
    return this.prisma.customerOpportunity.findMany({ where: { customerId: id }, orderBy: { createdAt: 'desc' } }).then((rows) => ({ rows }));
  }

  async importRows(dto: AnyRecord) {
    const rows = Array.isArray(dto.rows) ? dto.rows.filter((row): row is AnyRecord => !!row && typeof row === 'object') : [];
    let created = 0;
    const errors: string[] = [];
    for (const row of rows) {
      try {
        await this.create(row);
        created += 1;
      } catch (error) {
        errors.push(`${this.text(row.phone) || this.text(row.fullName) || 'row'}: ${error instanceof Error ? error.message : 'failed'}`);
      }
    }
    return { created, failed: errors.length, errors };
  }

  async exportCsv(query: Record<string, string>, user?: RequestUser) {
    const { rows } = await this.list({ ...query, take: '1000' }, user);
    return this.toCsv(rows.map((row) => ({
      code: row.code,
      fullName: row.fullName,
      phone: row.phone,
      email: row.email,
      type: row.type?.name,
      source: row.source,
      market: row.market,
      owner: row.owner,
      branch: row.branch,
      department: row.department,
      tags: row.tags.map((tag) => tag.tag.name).join('; '),
    })));
  }

  private customerWhere(query: Record<string, string>): Prisma.CustomerWhereInput {
    const where: Prisma.CustomerWhereInput = { status: query.status === 'MERGED' ? CustomerStatus.MERGED : { not: CustomerStatus.MERGED } };
    if (query.search) {
      where.OR = [
        { fullName: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
        { companyName: { contains: query.search, mode: 'insensitive' } },
        { code: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    for (const field of ['branch', 'department', 'owner', 'market', 'province', 'gender', 'source', 'groupName', 'createdBy', 'collaborator'] as const) {
      if (query[field]) where[field] = { contains: query[field], mode: 'insensitive' };
    }
    if (query.typeId) where.typeId = query.typeId;
    if (query.campaignId) where.campaignId = query.campaignId;
    if (query.tagId) where.tags = { some: { tagId: query.tagId } };
    if (query.createdFrom || query.createdTo) where.createdAt = { gte: this.date(query.createdFrom), lte: this.date(query.createdTo) };
    return where;
  }

  private customerData(dto: AnyRecord): AnyRecord {
    return {
      status: this.status(dto.status),
      typeId: this.text(dto.typeId),
      kind: this.text(dto.kind) || 'INDIVIDUAL',
      fullName: this.required(dto.fullName, 'fullName'),
      gender: this.text(dto.gender),
      dateOfBirth: this.date(dto.dateOfBirth),
      email: this.text(dto.email),
      facebookUrl: this.text(dto.facebookUrl),
      zaloUrl: this.text(dto.zaloUrl),
      address: this.text(dto.address),
      province: this.text(dto.province),
      country: this.text(dto.country),
      taxCode: this.text(dto.taxCode),
      companyName: this.text(dto.companyName),
      tradingName: this.text(dto.tradingName),
      website: this.text(dto.website),
      companyAddress: this.text(dto.companyAddress),
      source: this.text(dto.source),
      market: this.text(dto.market),
      groupName: this.text(dto.groupName),
      campaignId: this.text(dto.campaignId),
      createdBy: this.text(dto.createdBy),
      owner: this.text(dto.owner),
      branch: this.text(dto.branch),
      department: this.text(dto.department),
      agencyType: this.text(dto.agencyType),
      collaborator: this.text(dto.collaborator),
      latestComment: this.text(dto.latestComment),
    };
  }

  private async assertPhoneUnique(phone: string, excludeId?: string) {
    const [customer, order, quotation, quote, tourCustomer] = await Promise.all([
      this.prisma.customer.findFirst({ where: { phone, ...(excludeId ? { id: { not: excludeId } } : {}) } }),
      this.prisma.order.findFirst({ where: { customerPhone: phone } }),
      this.prisma.quotation.findFirst({ where: { customerPhone: phone } }),
      this.prisma.tourQuote.findFirst({ where: { customerPhone: phone } }),
      this.prisma.tourCustomer.findFirst({ where: { phone } }),
    ]);
    if (customer || order || quotation || quote || tourCustomer) throw new BadRequestException('So dien thoai da ton tai trong CRM, lead/bao gia/don hang hoac du lieu khach cu');
  }

  private async linkExistingData(tx: Prisma.TransactionClient, customerId: string, phone: string, email: string | null, fullName: string) {
    const ors = [{ customerPhone: phone }, ...(email ? [{ customerEmail: email }] : []), { customerName: fullName }];
    await Promise.all([
      tx.order.updateMany({ where: { customerId: null, OR: ors }, data: { customerId } }),
      tx.quotation.updateMany({ where: { customerId: null, OR: ors }, data: { customerId } }),
      tx.tourQuote.updateMany({ where: { customerId: null, OR: ors }, data: { customerId } }),
    ]);
  }

  private async getCustomer(id: string, user?: RequestUser) {
    const customer = await this.prisma.customer.findFirst({ where: branchDepartmentScopeWhere({ id }, user) });
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }

  private contacts(value: unknown): Prisma.CustomerContactCreateWithoutCustomerInput[] {
    return this.array(value).map((row) => ({ fullName: this.required(row.fullName, 'contact.fullName'), position: this.text(row.position), phone: this.text(row.phone), email: this.text(row.email), note: this.text(row.note), isPrimary: this.boolean(row.isPrimary, false) }));
  }

  private careTasks(value: unknown): Prisma.CustomerCareTaskCreateWithoutCustomerInput[] {
    return this.array(value).map((row) => ({ channel: this.text(row.channel) || 'PHONE', status: this.text(row.status) || 'PENDING', result: this.text(row.result), scheduledAt: this.date(row.scheduledAt), completedAt: this.date(row.completedAt), owner: this.text(row.owner), note: this.text(row.note) }));
  }

  private comments(value: unknown): Prisma.CustomerCommentCreateWithoutCustomerInput[] {
    return this.array(value).map((row) => ({ content: this.required(row.content, 'comment.content'), fileName: this.text(row.fileName), fileUrl: this.text(row.fileUrl), mentions: this.stringArray(row.mentions), createdBy: this.text(row.createdBy) }));
  }

  private callLogs(value: unknown): Prisma.CustomerCallLogCreateWithoutCustomerInput[] {
    return this.array(value).map((row) => ({ caller: this.text(row.caller), calledAt: this.date(row.calledAt) ?? new Date(), durationSec: this.int(row.durationSec), note: this.text(row.note), externalRef: this.text(row.externalRef) }));
  }

  private opportunitiesInput(value: unknown): Prisma.CustomerOpportunityCreateWithoutCustomerInput[] {
    return this.array(value).map((row) => {
      const valueAmount = this.decimal(row.value);
      const probability = this.decimal(row.probability);
      return { title: this.required(row.title, 'opportunity.title'), stage: this.text(row.stage) || 'NEW', value: valueAmount, probability, expectedRevenue: Number(valueAmount) * Number(probability) / 100, expectedCloseAt: this.date(row.expectedCloseAt), owner: this.text(row.owner), note: this.text(row.note) };
    });
  }

  private async nextCode(tx: Prisma.TransactionClient) {
    const count = await tx.customer.count();
    return `CUS-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(count + 1).padStart(4, '0')}`;
  }

  private customerKey(customer: { id?: string | null; phone?: string | null; email?: string | null; fullName?: string | null }) {
    return customer.id || customer.phone || customer.email || customer.fullName || '';
  }

  private orderKey(order: { customerId?: string | null; customerPhone?: string | null; customerEmail?: string | null; customerName?: string | null }) {
    return order.customerId || order.customerPhone || order.customerEmail || order.customerName || '';
  }

  private array(value: unknown): AnyRecord[] {
    return Array.isArray(value) ? value.filter((row): row is AnyRecord => !!row && typeof row === 'object' && !Array.isArray(row)) : [];
  }

  private stringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.map((item) => this.text(item)).filter((item): item is string => !!item);
  }

  private required(value: unknown, field: string) {
    const text = this.text(value);
    if (!text) throw new BadRequestException(`${field} is required`);
    return text;
  }

  private text(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private date(value: unknown) {
    if (!value || typeof value !== 'string') return undefined;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  private decimal(value: unknown) {
    const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : 0;
    return Number.isFinite(number) ? number : 0;
  }

  private int(value: unknown) {
    const number = typeof value === 'number' ? value : typeof value === 'string' ? Number.parseInt(value, 10) : 0;
    return Number.isFinite(number) ? Math.trunc(number) : 0;
  }

  private boolean(value: unknown, fallback: boolean) {
    return typeof value === 'boolean' ? value : fallback;
  }

  private status(value: unknown) {
    return value === CustomerStatus.INACTIVE || value === CustomerStatus.MERGED ? value : CustomerStatus.ACTIVE;
  }

  private take(value: unknown) {
    return Math.min(Math.max(this.int(value) || 50, 1), 1000);
  }

  private objectKey(fileUrl?: string | null) {
    return fileUrl ? new URL(fileUrl, 'http://smarttour.local').searchParams.get('key') : null;
  }

  private slug(value: string) {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').toUpperCase();
  }

  private toCsv(rows: AnyRecord[]) {
    const headers = Object.keys(rows[0] ?? { empty: '' });
    const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    return [headers.join(','), ...rows.map((row) => headers.map((header) => escape(row[header])).join(','))].join('\n');
  }
}

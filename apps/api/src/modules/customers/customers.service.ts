import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CustomerStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { applyWriteDataScope, branchDepartmentScopeWhere, hasUnrestrictedDataScope, RequestUser } from '../auth/data-scope';
import { FilesService } from '../files/files.service';
import { containsSearch, normalizeListSearch } from '../list-search';

type AnyRecord = Record<string, unknown>;

const customerInclude = {
  type: true,
  campaign: true,
  tags: { include: { tag: true } },
  contacts: { orderBy: { createdAt: 'asc' as const } },
  careTasks: { orderBy: { scheduledAt: 'desc' as const }, take: 20 },
  comments: { orderBy: { createdAt: 'desc' as const }, take: 5 },
  callLogs: { orderBy: { calledAt: 'desc' as const }, take: 5 },
  opportunities: { orderBy: { createdAt: 'desc' as const }, take: 20 },
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
        take: this.take(query.take ?? query.limit),
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
    const [customers, totalCustomers, newToday, newThisMonth] = await Promise.all([
      this.prisma.customer.findMany({ where, select: { id: true, phone: true, email: true, fullName: true } }),
      this.prisma.customer.count({ where }),
      this.prisma.customer.count({ where: { AND: [where, { createdAt: { gte: today } }] } }),
      this.prisma.customer.count({ where: { AND: [where, { createdAt: { gte: monthStart } }] } }),
    ]);
    const customerKeyMap = new Map<string, string>();
    const customerIds: string[] = [];
    const phones: string[] = [];
    const emails: string[] = [];
    const names: string[] = [];
    for (const customer of customers) {
      customerIds.push(customer.id);
      if (customer.phone) phones.push(customer.phone);
      if (customer.email) emails.push(customer.email);
      if (customer.fullName) names.push(customer.fullName);
      for (const key of this.customerKeys(customer)) customerKeyMap.set(key, customer.id);
    }
    const orders = customerKeyMap.size
      ? await this.prisma.order.findMany({
          where: branchDepartmentScopeWhere({
            deletedAt: null,
            OR: this.customerMatchConditions(customerIds, phones, emails, names),
          }, user),
          select: { customerId: true, customerPhone: true, customerEmail: true, customerName: true, totalRevenue: true, paidAmount: true },
        })
      : [];
    const orderCounts = new Map<string, number>();
    let totalRevenue = 0;
    let totalDebt = 0;
    for (const order of orders) {
      const matchedCustomerIds = new Set(this.orderKeys(order).map((key) => customerKeyMap.get(key)).filter((id): id is string => !!id));
      if (matchedCustomerIds.size) {
        const revenue = Number(order.totalRevenue ?? 0);
        const paid = Number(order.paidAmount ?? 0);
        totalRevenue += revenue;
        totalDebt += Math.max(revenue - paid, 0);
      }
      for (const customerId of matchedCustomerIds) orderCounts.set(customerId, (orderCounts.get(customerId) ?? 0) + 1);
    }
    const oneTime = customers.filter((customer) => (orderCounts.get(customer.id) ?? 0) === 1).length;
    const repeat = customers.filter((customer) => (orderCounts.get(customer.id) ?? 0) > 1).length;
    return {
      totalCustomers,
      newToday,
      newThisMonth,
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

  async bulkTag(dto: AnyRecord, user?: RequestUser) {
    const customerIds = this.stringArray(dto.customerIds);
    const tagIds = this.stringArray(dto.tagIds);
    if (!customerIds.length || !tagIds.length) throw new BadRequestException('customerIds and tagIds are required');
    const scopedCustomerIds = await this.scopedCustomerIds(customerIds, user);
    await this.assertTagsExist(tagIds);
    const data = scopedCustomerIds.flatMap((customerId) => tagIds.map((tagId) => ({ customerId, tagId })));
    await this.prisma.customerTagMap.createMany({ data, skipDuplicates: true });
    return { affectedCustomers: scopedCustomerIds.length, tagCount: tagIds.length };
  }

  async bulkUpdate(dto: AnyRecord, user?: RequestUser) {
    const customerIds = this.stringArray(dto.customerIds);
    if (!customerIds.length) throw new BadRequestException('customerIds is required');
    const data: Prisma.CustomerUncheckedUpdateInput = {};
    if (dto.owner !== undefined) data.owner = this.text(dto.owner);
    if (dto.groupName !== undefined) data.groupName = this.text(dto.groupName);
    if (dto.branch !== undefined) data.branch = applyWriteDataScope({ branch: this.text(dto.branch) }, user).branch;
    if (dto.department !== undefined) data.department = applyWriteDataScope({ department: this.text(dto.department) }, user).department;
    const tagIds = this.stringArray(dto.tagIds);
    if (!Object.keys(data).length && !tagIds.length) throw new BadRequestException('No bulk update fields provided');
    const scopedCustomerIds = await this.scopedCustomerIds(customerIds, user);
    if (tagIds.length) await this.assertTagsExist(tagIds);
    const actor = this.actorName(user);
    const note = this.text(dto.note);
    await this.prisma.$transaction(async (tx) => {
      if (Object.keys(data).length) await tx.customer.updateMany({ where: { id: { in: scopedCustomerIds } }, data });
      if (tagIds.length) await tx.customerTagMap.createMany({ data: scopedCustomerIds.flatMap((customerId) => tagIds.map((tagId) => ({ customerId, tagId }))), skipDuplicates: true });
      await tx.customerTimeline.createMany({
        data: scopedCustomerIds.map((customerId) => ({ customerId, eventType: 'BULK_UPDATE', title: 'Cap nhat hang loat', actor, content: note })),
      });
    });
    return { affectedCustomers: scopedCustomerIds.length };
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
    const [orders, quotes, debts, timeline] = await Promise.all([this.orders(id, user), this.quotes(id, user), this.debts(id, user), this.timeline(id, user)]);
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
      await this.filesService.removeQuietly(upload.objectKey);
      throw error;
    }
  }

  async deleteFile(id: string, fileId: string, user?: RequestUser) {
    await this.getCustomer(id, user);
    const file = await this.prisma.customerFile.findFirst({ where: { id: fileId, customerId: id } });
    if (!file) throw new NotFoundException('Customer file not found');
    const objectKey = this.filesService.objectKeyFromUrl(file.fileUrl);
    const deleted = await this.prisma.customerFile.delete({ where: { id: fileId } });
    try {
      await this.filesService.removeIfPresent(objectKey);
      return deleted;
    } catch (error) {
      await this.restoreDeletedFileMetadata(deleted);
      throw error;
    }
  }

  async create(dto: AnyRecord, user?: RequestUser) {
    dto = applyWriteDataScope(dto, user);
    const actor = this.actorName(user);
    const phone = this.required(dto.phone, 'phone');
    await this.assertPhoneUnique(phone);
    await this.assertCustomerReferences(dto);
    return this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.create({
        data: {
          ...this.customerData(dto),
          createdBy: actor,
          code: this.text(dto.code) || (await this.nextCode(tx)),
          phone,
          contacts: { create: this.contacts(dto.contacts) },
          careTasks: { create: this.careTasks(dto.careTasks) },
          comments: { create: this.comments(dto.comments, actor) },
          callLogs: { create: this.callLogs(dto.callLogs) },
          opportunities: { create: this.opportunitiesInput(dto.opportunities) },
          tags: { create: this.stringArray(dto.tagIds).map((tagId) => ({ tagId })) },
          timeline: { create: [{ eventType: 'CREATE', title: 'Tao khach hang', actor }] },
        } as Prisma.CustomerUncheckedCreateInput,
        include: customerInclude,
      });
      await this.linkExistingData(tx, customer.id, customer.phone, customer.email, customer.fullName);
      return customer;
    });
  }

  async update(id: string, dto: AnyRecord, user?: RequestUser) {
    const actor = this.actorName(user);
    const existing = await this.prisma.customer.findFirst({ where: branchDepartmentScopeWhere({ id }, user) });
    if (!existing) throw new NotFoundException('Customer not found');
    dto = applyWriteDataScope(dto, user);
    this.assertNestedReplaceAllowed(dto);
    const nextPhone = dto.phone !== undefined ? this.required(dto.phone, 'phone') : existing.phone;
    if (nextPhone !== existing.phone) await this.assertPhoneUnique(nextPhone, id);
    await this.assertCustomerReferences(dto);
    return this.prisma.$transaction(async (tx) => {
      if (dto.contacts !== undefined) {
        await tx.customerContact.deleteMany({ where: { customerId: id } });
        await tx.customerContact.createMany({ data: this.contacts(dto.contacts).map((row) => ({ ...row, customerId: id })) });
      }
      if (dto.tagIds !== undefined) {
        await tx.customerTagMap.deleteMany({ where: { customerId: id } });
        await tx.customerTagMap.createMany({ data: this.stringArray(dto.tagIds).map((tagId) => ({ customerId: id, tagId })), skipDuplicates: true });
      }
      if (dto.careTasks !== undefined) {
        await tx.customerCareTask.deleteMany({ where: { customerId: id } });
        await tx.customerCareTask.createMany({ data: this.careTasks(dto.careTasks).map((row) => ({ ...row, customerId: id })) });
      }
      if (dto.comments !== undefined) {
        await tx.customerComment.deleteMany({ where: { customerId: id } });
        await tx.customerComment.createMany({ data: this.comments(dto.comments, actor).map((row) => ({ ...row, customerId: id })) });
      }
      if (dto.callLogs !== undefined) {
        await tx.customerCallLog.deleteMany({ where: { customerId: id } });
        await tx.customerCallLog.createMany({ data: this.callLogs(dto.callLogs).map((row) => ({ ...row, customerId: id })) });
      }
      if (dto.opportunities !== undefined) {
        await tx.customerOpportunity.deleteMany({ where: { customerId: id } });
        await tx.customerOpportunity.createMany({ data: this.opportunitiesInput(dto.opportunities).map((row) => ({ ...row, customerId: id })) });
      }
      await tx.customerTimeline.create({ data: { customerId: id, eventType: 'UPDATE', title: 'Cap nhat khach hang', actor, content: this.text(dto.note) } });
      const customer = await tx.customer.update({ where: { id }, data: { ...this.customerUpdateData(dto), phone: nextPhone } as Prisma.CustomerUncheckedUpdateInput, include: customerInclude });
      await this.linkExistingData(tx, customer.id, customer.phone, customer.email, customer.fullName);
      return customer;
    });
  }

  async remove(id: string, user?: RequestUser) {
    const customer = await this.prisma.customer.findFirst({ where: branchDepartmentScopeWhere({ id }, user) });
    if (!customer) throw new NotFoundException('Customer not found');
    const customerWhere = this.customerRelationWhere(customer);
    const [orderCount, quotationCount, tourQuoteCount, bookingCount, tourCustomerCount, fitTourCount, ledgerCount, receiptCount, invoiceCount] = await Promise.all([
      this.prisma.order.count({ where: customerWhere.order }),
      this.prisma.quotation.count({ where: customerWhere.quotation }),
      this.prisma.tourQuote.count({ where: customerWhere.tourQuote }),
      this.prisma.booking.count({ where: customerWhere.booking }),
      this.prisma.tourCustomer.count({ where: customerWhere.tourCustomer }),
      this.prisma.fitTour.count({ where: customerWhere.fitTour }),
      this.prisma.customerLedgerEntry.count({ where: { customerId: id } }),
      this.prisma.financeReceipt.count({ where: { customerId: id, deletedAt: null } }),
      this.prisma.financeInvoice.count({ where: { customerId: id, deletedAt: null } }),
    ]);
    if (orderCount || quotationCount || tourQuoteCount || bookingCount || tourCustomerCount || fitTourCount || ledgerCount || receiptCount || invoiceCount) throw new BadRequestException('Khong xoa khach hang da phat sinh bao gia, don hang, booking, tour, cong no hoac chung tu tai chinh');
    await this.prisma.customer.delete({ where: { id } });
    return { deleted: true };
  }

  async merge(targetId: string, dto: AnyRecord, user?: RequestUser) {
    const sourceId = this.required(dto.sourceId, 'sourceId');
    if (sourceId === targetId) throw new BadRequestException('sourceId must be different from target customer');
    const [target, source] = await Promise.all([
      this.prisma.customer.findFirst({ where: branchDepartmentScopeWhere({ id: targetId }, user) }),
      this.prisma.customer.findFirst({ where: branchDepartmentScopeWhere({ id: sourceId }, user) }),
    ]);
    if (!target || !source) throw new NotFoundException('Customer not found');
    const actor = this.actorName(user);
    await this.prisma.$transaction(async (tx) => {
      await tx.customerContact.updateMany({ where: { customerId: sourceId }, data: { customerId: targetId } });
      await tx.customerCareTask.updateMany({ where: { customerId: sourceId }, data: { customerId: targetId } });
      await tx.customerComment.updateMany({ where: { customerId: sourceId }, data: { customerId: targetId } });
      await tx.customerCallLog.updateMany({ where: { customerId: sourceId }, data: { customerId: targetId } });
      await tx.customerOpportunity.updateMany({ where: { customerId: sourceId }, data: { customerId: targetId } });
      await tx.customerFile.updateMany({ where: { customerId: sourceId }, data: { customerId: targetId } });
      await tx.customerTagMap.createMany({ data: (await tx.customerTagMap.findMany({ where: { customerId: sourceId }, select: { tagId: true } })).map((row) => ({ customerId: targetId, tagId: row.tagId })), skipDuplicates: true });
      await tx.customerTagMap.deleteMany({ where: { customerId: sourceId } });
      await tx.customerTimeline.updateMany({ where: { customerId: sourceId }, data: { customerId: targetId } });
      await tx.customerTimeline.create({ data: { customerId: targetId, eventType: 'MERGE', title: `Merge ${source.code}`, content: this.text(dto.note), actor } });
      await tx.customer.update({ where: { id: sourceId }, data: { status: CustomerStatus.MERGED, mergedIntoId: targetId, owner: this.text(dto.transferOwner) || source.owner } });
      await tx.order.updateMany({ where: { customerId: sourceId }, data: { customerId: targetId } });
      await tx.booking.updateMany({ where: { customerId: sourceId }, data: { customerId: targetId } });
      await tx.quotation.updateMany({ where: { customerId: sourceId }, data: { customerId: targetId } });
      await tx.tourQuote.updateMany({ where: { customerId: sourceId }, data: { customerId: targetId } });
      await tx.tourCustomer.updateMany({ where: { crmCustomerId: sourceId }, data: { crmCustomerId: targetId } });
      await tx.fitTour.updateMany({ where: { customerId: sourceId }, data: { customerId: targetId } });
      await tx.financeReceipt.updateMany({ where: { customerId: sourceId }, data: { customerId: targetId } });
      await tx.financeInvoice.updateMany({ where: { customerId: sourceId }, data: { customerId: targetId } });
      await tx.financeCashflowEntry.updateMany({ where: { customerId: sourceId }, data: { customerId: targetId } });
      await tx.customerLedgerEntry.updateMany({ where: { customerId: sourceId }, data: { customerId: targetId } });
    });
    return this.detail(targetId, user);
  }

  async transferOwner(id: string, dto: AnyRecord, user?: RequestUser) {
    await this.getCustomer(id, user);
    const owner = this.required(dto.owner, 'owner');
    const actor = this.actorName(user);
    await this.prisma.$transaction(async (tx) => {
      await tx.customer.update({ where: { id }, data: { owner } });
      await tx.customerTimeline.create({ data: { customerId: id, eventType: 'TRANSFER_OWNER', title: 'Chuyen nhan vien phu trach', content: this.text(dto.reason) || this.text(dto.note), actor, metadata: { owner } } });
    });
    return this.detail(id, user);
  }

  async addComment(id: string, dto: AnyRecord, user?: RequestUser) {
    await this.getCustomer(id, user);
    const actor = this.actorName(user);
    const comment = await this.prisma.customerComment.create({ data: { ...this.comments([dto], actor)[0], customerId: id } });
    await this.prisma.customer.update({ where: { id }, data: { latestComment: comment.content } });
    await this.prisma.customerTimeline.create({ data: { customerId: id, eventType: 'COMMENT', title: 'Them binh luan', content: comment.content, actor } });
    return this.detail(id, user);
  }

  async addCareTask(id: string, dto: AnyRecord, user?: RequestUser) {
    await this.getCustomer(id, user);
    const task = await this.prisma.customerCareTask.create({ data: { ...this.careTasks([dto])[0], customerId: id } });
    await this.prisma.customerTimeline.create({ data: { customerId: id, eventType: 'CARE', title: `CSKH ${task.channel}`, content: task.note, actor: this.actorName(user) } });
    return this.detail(id, user);
  }

  async addCallLog(id: string, dto: AnyRecord, user?: RequestUser) {
    await this.getCustomer(id, user);
    const call = await this.prisma.customerCallLog.create({ data: { ...this.callLogs([dto])[0], customerId: id } });
    await this.prisma.customerTimeline.create({ data: { customerId: id, eventType: 'CALL', title: 'Ghi nhan cuoc goi', content: call.note, actor: this.actorName(user) } });
    return this.detail(id, user);
  }

  async addOpportunity(id: string, dto: AnyRecord, user?: RequestUser) {
    await this.getCustomer(id, user);
    const opportunity = await this.prisma.customerOpportunity.create({ data: { ...this.opportunitiesInput([dto])[0], customerId: id } });
    await this.prisma.customerTimeline.create({ data: { customerId: id, eventType: 'OPPORTUNITY', title: opportunity.title, content: opportunity.note, actor: this.actorName(user) } });
    return this.detail(id, user);
  }

  async updateCareTask(id: string, taskId: string, dto: AnyRecord, user?: RequestUser) {
    await this.getCustomer(id, user);
    const existing = await this.prisma.customerCareTask.findFirst({ where: { id: taskId, customerId: id } });
    if (!existing) throw new NotFoundException('Care task not found');
    const task = await this.prisma.customerCareTask.update({
      where: { id: taskId },
      data: {
        ...(dto.status !== undefined ? { status: this.text(dto.status) || 'PENDING' } : {}),
        ...(dto.result !== undefined ? { result: this.text(dto.result) } : {}),
        ...(dto.completedAt !== undefined ? { completedAt: this.date(dto.completedAt) } : {}),
        ...(dto.note !== undefined ? { note: this.text(dto.note) } : {}),
      },
    });
    await this.prisma.customerTimeline.create({ data: { customerId: id, eventType: 'CARE_UPDATE', title: `Cap nhat CSKH ${task.status}`, content: task.result || task.note, actor: this.actorName(user) } });
    return this.detail(id, user);
  }

  async orders(id: string, user?: RequestUser) {
    const customer = await this.getCustomer(id, user);
    const rows = await this.prisma.order.findMany({
      where: branchDepartmentScopeWhere({ deletedAt: null, OR: this.customerOrderOr(customer) }, user),
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return { rows };
  }

  async quotes(id: string, user?: RequestUser) {
    const customer = await this.getCustomer(id, user);
    const [quotations, tourQuotes] = await Promise.all([
      this.prisma.quotation.findMany({ where: branchDepartmentScopeWhere({ OR: this.customerQuotationOr(customer) }, user), orderBy: { createdAt: 'desc' }, take: 100 }),
      this.prisma.tourQuote.findMany({ where: this.tourQuoteScopeWhere({ OR: this.customerTourQuoteOr(customer) }, user), orderBy: { createdAt: 'desc' }, take: 100 }),
    ]);
    return { rows: [...quotations.map((row) => ({ ...row, source: 'quotation' })), ...tourQuotes.map((row) => ({ ...row, source: 'tour-quote' }))] };
  }

  async debts(id: string, user?: RequestUser) {
    const customer = await this.getCustomer(id, user);
    const [{ rows }, summary] = await Promise.all([
      this.orders(id, user),
      this.customerDebtSummaryFromDb(customer, user),
    ]);
    return { ...summary, rows };
  }

  async timeline(id: string, user?: RequestUser, query: Record<string, string> = {}) {
    await this.getCustomer(id, user);
    const take = this.take(query.take ?? query.limit ?? '100');
    const skip = this.skip(query.skip);
    const [rows, total] = await Promise.all([
      this.prisma.customerTimeline.findMany({ where: { customerId: id }, orderBy: { createdAt: 'desc' }, take, skip }),
      this.prisma.customerTimeline.count({ where: { customerId: id } }),
    ]);
    return { rows, pagination: { take, skip, total } };
  }

  async careHistory(id: string, user?: RequestUser, query: Record<string, string> = {}) {
    await this.getCustomer(id, user);
    const take = this.take(query.take ?? query.limit ?? '100');
    const skip = this.skip(query.skip);
    const [rows, total] = await Promise.all([
      this.prisma.customerCareTask.findMany({ where: { customerId: id }, orderBy: { scheduledAt: 'desc' }, take, skip }),
      this.prisma.customerCareTask.count({ where: { customerId: id } }),
    ]);
    return { rows, pagination: { take, skip, total } };
  }

  async opportunities(id: string, user?: RequestUser, query: Record<string, string> = {}) {
    await this.getCustomer(id, user);
    const take = this.take(query.take ?? query.limit ?? '100');
    const skip = this.skip(query.skip);
    const [rows, total] = await Promise.all([
      this.prisma.customerOpportunity.findMany({ where: { customerId: id }, orderBy: { createdAt: 'desc' }, take, skip }),
      this.prisma.customerOpportunity.count({ where: { customerId: id } }),
    ]);
    return { rows, pagination: { take, skip, total } };
  }

  async importRows(dto: AnyRecord, user?: RequestUser) {
    if (!Array.isArray(dto.rows)) throw new BadRequestException('rows must be an array');
    let created = 0;
    const errors: Array<{ row: number; key: string; message: string }> = [];
    for (const [index, row] of dto.rows.entries()) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) {
        errors.push({ row: index + 1, key: `row-${index + 1}`, message: 'Row must be an object' });
        continue;
      }
      const record = row as AnyRecord;
      try {
        await this.create(record, user);
        created += 1;
      } catch (error) {
        errors.push({
          row: index + 1,
          key: this.text(record.phone) || this.text(record.fullName) || `row-${index + 1}`,
          message: error instanceof Error ? error.message : 'failed',
        });
      }
    }
    return { created, failed: errors.length, errors };
  }

  async exportCsv(query: Record<string, string>, user?: RequestUser) {
    const where = branchDepartmentScopeWhere(this.customerWhere(query), user);
    const rows = await this.prisma.customer.findMany({
      where,
      select: this.listSelect(),
      orderBy: { createdAt: 'desc' },
      take: this.take(query.take ?? query.limit ?? '1000'),
    });
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
    })), ['code', 'fullName', 'phone', 'email', 'type', 'source', 'market', 'owner', 'branch', 'department', 'tags']);
  }

  private customerWhere(query: Record<string, string>): Prisma.CustomerWhereInput {
    const where: Prisma.CustomerWhereInput = {};
    const search = normalizeListSearch(query.search);
    const contains = search ? containsSearch(search) : undefined;
    const requestedStatus = this.text(query.status);
    if (requestedStatus && requestedStatus !== 'ALL') {
      if (!Object.values(CustomerStatus).includes(requestedStatus as CustomerStatus)) throw new BadRequestException('Invalid customer status filter');
      where.status = requestedStatus as CustomerStatus;
    } else if (!requestedStatus) {
      where.status = { not: CustomerStatus.MERGED };
    }
    if (contains) {
      where.OR = [
        { fullName: contains },
        { phone: contains },
        { email: contains },
        { companyName: contains },
        { code: contains },
      ];
    }
    for (const field of ['branch', 'department', 'owner', 'market', 'province', 'gender', 'source', 'groupName', 'createdBy', 'collaborator', 'agencyType', 'companyName', 'taxCode', 'email', 'phone'] as const) {
      if (query[field]) where[field] = { contains: query[field], mode: 'insensitive' };
    }
    if (query.kind) where.kind = query.kind;
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
      createdBy: null,
      owner: this.text(dto.owner),
      branch: this.text(dto.branch),
      department: this.text(dto.department),
      agencyType: this.text(dto.agencyType),
      collaborator: this.text(dto.collaborator),
      latestComment: this.text(dto.latestComment),
    };
  }

  private customerUpdateData(dto: AnyRecord): AnyRecord {
    const data: AnyRecord = {};
    const setters: Record<string, () => unknown> = {
      status: () => this.status(dto.status),
      typeId: () => this.text(dto.typeId),
      kind: () => this.text(dto.kind) || 'INDIVIDUAL',
      fullName: () => this.required(dto.fullName, 'fullName'),
      gender: () => this.text(dto.gender),
      dateOfBirth: () => this.date(dto.dateOfBirth),
      email: () => this.text(dto.email),
      facebookUrl: () => this.text(dto.facebookUrl),
      zaloUrl: () => this.text(dto.zaloUrl),
      address: () => this.text(dto.address),
      province: () => this.text(dto.province),
      country: () => this.text(dto.country),
      taxCode: () => this.text(dto.taxCode),
      companyName: () => this.text(dto.companyName),
      tradingName: () => this.text(dto.tradingName),
      website: () => this.text(dto.website),
      companyAddress: () => this.text(dto.companyAddress),
      source: () => this.text(dto.source),
      market: () => this.text(dto.market),
      groupName: () => this.text(dto.groupName),
      campaignId: () => this.text(dto.campaignId),
      owner: () => this.text(dto.owner),
      branch: () => this.text(dto.branch),
      department: () => this.text(dto.department),
      agencyType: () => this.text(dto.agencyType),
      collaborator: () => this.text(dto.collaborator),
      latestComment: () => this.text(dto.latestComment),
    };
    for (const [field, setter] of Object.entries(setters)) {
      if (dto[field] !== undefined) data[field] = setter();
    }
    return data;
  }

  private assertNestedReplaceAllowed(dto: AnyRecord) {
    const nestedFields = ['contacts', 'tagIds', 'careTasks', 'comments', 'callLogs', 'opportunities'];
    const wantsNestedReplacement = nestedFields.some((field) => dto[field] !== undefined);
    if (wantsNestedReplacement && dto.replaceNestedCollections !== true) {
      throw new BadRequestException('replaceNestedCollections must be true to replace customer nested collections');
    }
  }

  private async assertCustomerReferences(dto: AnyRecord) {
    const typeId = this.text(dto.typeId);
    const campaignId = this.text(dto.campaignId);
    const tagIds = this.stringArray(dto.tagIds);
    const [type, campaign] = await Promise.all([
      typeId ? this.prisma.customerTypeConfig.findFirst({ where: { id: typeId, isActive: true }, select: { id: true } }) : null,
      campaignId ? this.prisma.customerCampaign.findUnique({ where: { id: campaignId }, select: { id: true } }) : null,
    ]);
    if (typeId && !type) throw new BadRequestException('Customer type not found or inactive');
    if (campaignId && !campaign) throw new BadRequestException('Customer campaign not found');
    if (tagIds.length) await this.assertTagsExist(tagIds);
  }

  private async assertTagsExist(tagIds: string[]) {
    const uniqueTagIds = Array.from(new Set(tagIds));
    const count = await this.prisma.customerTag.count({ where: { id: { in: uniqueTagIds }, isActive: true } });
    if (count !== uniqueTagIds.length) throw new BadRequestException('One or more customer tags were not found or inactive');
  }

  private async scopedCustomerIds(customerIds: string[], user?: RequestUser) {
    const uniqueCustomerIds = Array.from(new Set(customerIds));
    const rows = await this.prisma.customer.findMany({
      where: branchDepartmentScopeWhere({ id: { in: uniqueCustomerIds } }, user),
      select: { id: true },
    });
    if (rows.length !== uniqueCustomerIds.length) throw new BadRequestException('Cannot update customers outside your data scope');
    return rows.map((row) => row.id);
  }

  private async restoreDeletedFileMetadata(file: { id: string; customerId: string; fileName: string; fileUrl: string; fileType: string | null; uploadedBy: string | null; createdAt: Date }) {
    try {
      await this.prisma.customerFile.create({
        data: {
          id: file.id,
          customerId: file.customerId,
          fileName: file.fileName,
          fileUrl: file.fileUrl,
          fileType: file.fileType,
          uploadedBy: file.uploadedBy,
          createdAt: file.createdAt,
        },
      });
    } catch {
      throw new BadRequestException('Xoa object storage that bai va khong khoi phuc duoc metadata file');
    }
  }

  private customerRelationWhere(customer: { id: string; phone?: string | null; email?: string | null; fullName?: string | null }) {
    return {
      order: { OR: this.customerOrderOr(customer) } satisfies Prisma.OrderWhereInput,
      quotation: { OR: this.customerQuotationOr(customer) } satisfies Prisma.QuotationWhereInput,
      tourQuote: { OR: this.customerTourQuoteOr(customer) } satisfies Prisma.TourQuoteWhereInput,
      booking: { OR: this.customerBookingOr(customer) } satisfies Prisma.BookingWhereInput,
      tourCustomer: { OR: this.customerTourCustomerOr(customer) } satisfies Prisma.TourCustomerWhereInput,
      fitTour: { OR: this.customerFitTourOr(customer) } satisfies Prisma.FitTourWhereInput,
    };
  }

  private customerOrderOr(customer: { id: string; phone?: string | null; email?: string | null; fullName?: string | null }): Prisma.OrderWhereInput[] {
    return [
      { customerId: customer.id },
      ...(customer.phone ? [{ customerPhone: customer.phone }] : []),
      ...(customer.email ? [{ customerEmail: customer.email }] : []),
      ...(customer.fullName ? [{ customerName: customer.fullName }] : []),
    ];
  }

  private customerQuotationOr(customer: { id: string; phone?: string | null; email?: string | null; fullName?: string | null }): Prisma.QuotationWhereInput[] {
    return [
      { customerId: customer.id },
      ...(customer.phone ? [{ customerPhone: customer.phone }] : []),
      ...(customer.email ? [{ customerEmail: customer.email }] : []),
      ...(customer.fullName ? [{ customerName: customer.fullName }] : []),
    ];
  }

  private customerTourQuoteOr(customer: { id: string; phone?: string | null; email?: string | null; fullName?: string | null }): Prisma.TourQuoteWhereInput[] {
    return [
      { customerId: customer.id },
      ...(customer.phone ? [{ customerPhone: customer.phone }] : []),
      ...(customer.email ? [{ customerEmail: customer.email }] : []),
      ...(customer.fullName ? [{ customerName: customer.fullName }] : []),
    ];
  }

  private tourQuoteScopeWhere(where: Prisma.TourQuoteWhereInput, user?: RequestUser): Prisma.TourQuoteWhereInput {
    if (!user || hasUnrestrictedDataScope(user)) return where;
    return {
      AND: [
        where,
        { customer: { is: branchDepartmentScopeWhere<Prisma.CustomerWhereInput>({ mergedIntoId: null }, user) } },
      ],
    };
  }

  private customerBookingOr(customer: { id: string; phone?: string | null; email?: string | null; fullName?: string | null }): Prisma.BookingWhereInput[] {
    return [
      { customerId: customer.id },
      ...(customer.phone ? [{ customerPhone: customer.phone }] : []),
      ...(customer.email ? [{ customerEmail: customer.email }] : []),
      ...(customer.fullName ? [{ customerName: customer.fullName }] : []),
    ];
  }

  private customerTourCustomerOr(customer: { id: string; phone?: string | null; email?: string | null; fullName?: string | null }): Prisma.TourCustomerWhereInput[] {
    return [
      { crmCustomerId: customer.id },
      ...(customer.phone ? [{ phone: customer.phone }] : []),
      ...(customer.email ? [{ email: customer.email }] : []),
      ...(customer.fullName ? [{ name: customer.fullName }] : []),
    ];
  }

  private customerFitTourOr(customer: { id: string; phone?: string | null; email?: string | null; fullName?: string | null }): Prisma.FitTourWhereInput[] {
    return [
      { customerId: customer.id },
      ...(customer.phone ? [{ phone: customer.phone }] : []),
      ...(customer.email ? [{ email: customer.email }] : []),
      ...(customer.fullName ? [{ customerName: customer.fullName }] : []),
    ];
  }

  private customerMatchConditions(customerIds: string[], phones: string[], emails: string[], names: string[]): Prisma.OrderWhereInput[] {
    return [
      ...(customerIds.length ? [{ customerId: { in: customerIds } }] : []),
      ...(phones.length ? [{ customerPhone: { in: phones } }] : []),
      ...(emails.length ? [{ customerEmail: { in: emails } }] : []),
      ...(names.length ? [{ customerName: { in: names } }] : []),
    ];
  }

  private async assertPhoneUnique(phone: string, excludeId?: string) {
    const [customer, order, quotation, quote, booking, tourCustomer, fitTour, receipt, invoice] = await Promise.all([
      this.prisma.customer.findFirst({ where: { phone, ...(excludeId ? { id: { not: excludeId } } : {}) } }),
      this.prisma.order.findFirst({ where: { customerPhone: phone, AND: this.linkedCustomerIdAnd(excludeId) } }),
      this.prisma.quotation.findFirst({ where: { customerPhone: phone, AND: this.linkedCustomerIdAnd(excludeId) } }),
      this.prisma.tourQuote.findFirst({ where: { customerPhone: phone, AND: this.linkedCustomerIdAnd(excludeId) } }),
      this.prisma.booking.findFirst({ where: { customerPhone: phone, AND: this.linkedCustomerIdAnd(excludeId) } }),
      this.prisma.tourCustomer.findFirst({ where: { phone, AND: this.linkedCrmCustomerIdAnd(excludeId) } }),
      this.prisma.fitTour.findFirst({ where: { phone, AND: this.linkedCustomerIdAnd(excludeId) } }),
      this.prisma.financeReceipt.findFirst({ where: { payerPhone: phone, AND: this.linkedCustomerIdAnd(excludeId) } }),
      this.prisma.financeInvoice.findFirst({ where: { customerPhone: phone, AND: this.linkedCustomerIdAnd(excludeId) } }),
    ]);
    if (customer || order || quotation || quote || booking || tourCustomer || fitTour || receipt || invoice) throw new BadRequestException('So dien thoai da ton tai trong CRM hoac da duoc gan voi du lieu nghiep vu cua khach hang khac');
  }

  private async linkExistingData(tx: Prisma.TransactionClient, customerId: string, phone: string, email: string | null, fullName: string) {
    const customerOr = [{ customerPhone: phone }, ...(email ? [{ customerEmail: email }] : []), { customerName: fullName }];
    const tourCustomerOr = [{ phone }, ...(email ? [{ email }] : []), { name: fullName }];
    const fitTourOr = [{ phone }, ...(email ? [{ email }] : []), { customerName: fullName }];
    const receiptOr = [{ payerPhone: phone }, ...(email ? [{ payerEmail: email }] : []), { payerName: fullName }];
    await Promise.all([
      tx.order.updateMany({ where: { customerId: null, OR: customerOr }, data: { customerId } }),
      tx.quotation.updateMany({ where: { customerId: null, OR: customerOr }, data: { customerId } }),
      tx.tourQuote.updateMany({ where: { customerId: null, OR: customerOr }, data: { customerId } }),
      tx.booking.updateMany({ where: { customerId: null, OR: customerOr }, data: { customerId } }),
      tx.tourCustomer.updateMany({ where: { crmCustomerId: null, OR: tourCustomerOr }, data: { crmCustomerId: customerId } }),
      tx.fitTour.updateMany({ where: { customerId: null, OR: fitTourOr }, data: { customerId } }),
      tx.financeReceipt.updateMany({ where: { customerId: null, OR: receiptOr }, data: { customerId } }),
      tx.financeInvoice.updateMany({ where: { customerId: null, OR: customerOr }, data: { customerId } }),
    ]);
  }

  private async getCustomer(id: string, user?: RequestUser) {
    const customer = await this.prisma.customer.findFirst({ where: branchDepartmentScopeWhere({ id }, user) });
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }

  private async customerDebtSummaryFromDb(customer: { id: string; phone?: string | null; email?: string | null; fullName?: string | null }, user?: RequestUser) {
    const total = await this.prisma.order.aggregate({
      where: branchDepartmentScopeWhere({ deletedAt: null, OR: this.customerOrderOr(customer) }, user),
      _sum: { totalRevenue: true, paidAmount: true },
    });
    const totalRevenue = Number(total._sum.totalRevenue ?? 0);
    const paidAmount = Number(total._sum.paidAmount ?? 0);
    return { totalRevenue, paidAmount, receivableDebt: Math.max(totalRevenue - paidAmount, 0) };
  }

  private contacts(value: unknown): Prisma.CustomerContactCreateWithoutCustomerInput[] {
    return this.array(value).map((row) => ({ fullName: this.required(row.fullName, 'contact.fullName'), position: this.text(row.position), phone: this.text(row.phone), email: this.text(row.email), note: this.text(row.note), isPrimary: this.boolean(row.isPrimary, false) }));
  }

  private careTasks(value: unknown): Prisma.CustomerCareTaskCreateWithoutCustomerInput[] {
    return this.array(value).map((row) => ({ channel: this.text(row.channel) || 'PHONE', status: this.text(row.status) || 'PENDING', result: this.text(row.result), scheduledAt: this.date(row.scheduledAt), completedAt: this.date(row.completedAt), owner: this.text(row.owner), note: this.text(row.note) }));
  }

  private comments(value: unknown, actor?: string): Prisma.CustomerCommentCreateWithoutCustomerInput[] {
    return this.array(value).map((row) => ({ content: this.required(row.content, 'comment.content'), fileName: this.text(row.fileName), fileUrl: this.text(row.fileUrl), mentions: this.stringArray(row.mentions), createdBy: actor }));
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

  private customerKeys(customer: { id?: string | null; phone?: string | null; email?: string | null; fullName?: string | null }) {
    return [
      this.matchKey('id', customer.id),
      this.matchKey('phone', customer.phone),
      this.matchKey('email', customer.email),
      this.matchKey('name', customer.fullName),
    ].filter((key): key is string => !!key);
  }

  private orderKeys(order: { customerId?: string | null; customerPhone?: string | null; customerEmail?: string | null; customerName?: string | null }) {
    return [
      this.matchKey('id', order.customerId),
      this.matchKey('phone', order.customerPhone),
      this.matchKey('email', order.customerEmail),
      this.matchKey('name', order.customerName),
    ].filter((key): key is string => !!key);
  }

  private matchKey(prefix: string, value?: string | null) {
    const text = value?.trim();
    return text ? `${prefix}:${prefix === 'id' || prefix === 'phone' ? text : text.toLowerCase()}` : undefined;
  }

  private linkedCustomerIdAnd(excludeId?: string) {
    return excludeId ? [{ customerId: { not: null } }, { customerId: { not: excludeId } }] : [{ customerId: { not: null } }];
  }

  private linkedCrmCustomerIdAnd(excludeId?: string) {
    return excludeId ? [{ crmCustomerId: { not: null } }, { crmCustomerId: { not: excludeId } }] : [{ crmCustomerId: { not: null } }];
  }

  private actorName(user?: RequestUser) {
    return user?.name || user?.username || user?.email || user?.id;
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
    if (value === undefined || value === null || value === '') return undefined;
    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) throw new BadRequestException('Date is invalid');
      return value;
    }
    if (typeof value !== 'string') throw new BadRequestException('Date must be a string');
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new BadRequestException(`Date is invalid: ${value}`);
    return date;
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

  private skip(value: unknown) {
    return Math.max(this.int(value), 0);
  }

  private slug(value: string) {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').toUpperCase();
  }

  private toCsv(rows: AnyRecord[], headers: string[]) {
    const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    return `\uFEFF${[headers.join(','), ...rows.map((row) => headers.map((header) => escape(row[header])).join(','))].join('\r\n')}`;
  }
}

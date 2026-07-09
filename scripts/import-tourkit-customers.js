#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const SOURCE_LABEL = 'TourKit customer export 16/06/2026';
const IMPORT_MARKER = 'TOURKIT_CUSTOMER_IMPORT_2026_06_16';
const CODE_PREFIX = 'TKCUS-20260616';

function arg(name) {
  const prefix = `${name}=`;
  const found = process.argv.find((item) => item.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function nullableText(value) {
  const valueText = text(value);
  return valueText || null;
}

function key(value) {
  return text(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase();
}

function rowValue(row, label) {
  const wanted = key(label);
  const entry = Object.entries(row).find(([header]) => key(header) === wanted);
  return entry ? entry[1] : undefined;
}

function digits(value) {
  return text(value).replace(/\D+/g, '');
}

function numberValue(value) {
  if (value === null || value === undefined || value === '') return 0;
  const parsed = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value) {
  return new Intl.NumberFormat('vi-VN').format(numberValue(value));
}

function utcNoonDate(year, month, day, source) {
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error(`Invalid TourKit customer date: ${source}`);
  }
  return date;
}

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(), 12));
  }
  const valueText = text(value);
  if (!valueText) return null;
  const dmy = valueText.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) {
    const [, day, month, year] = dmy;
    return utcNoonDate(Number(year), Number(month), Number(day), valueText);
  }
  const ymd = valueText.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (ymd) {
    const [, year, month, day] = ymd;
    return utcNoonDate(Number(year), Number(month), Number(day), valueText);
  }
  const parsed = new Date(valueText);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function slug(value) {
  const base = key(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'tourkit-customer-type';
}

function kindFor(value) {
  return /doanh nghiep|cong ty|business/.test(key(value)) ? 'BUSINESS' : 'INDIVIDUAL';
}

function splitTags(value) {
  return text(value)
    .split(/[;,\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeRows(payload) {
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  return rows
    .map((row, index) => {
      const fullName = text(rowValue(row, 'Họ và tên'));
      const phone = digits(rowValue(row, 'Điện thoại'));
      const rawKind = text(rowValue(row, 'Phân loại'));
      const typeName = nullableText(rowValue(row, 'Loại khách hàng'));
      const createdAt = parseDate(rowValue(row, 'Ngày tạo'));
      const dateOfBirth = parseDate(rowValue(row, 'Ngày sinh'));
      const latestCareDate = parseDate(rowValue(row, 'Ngày CS gần nhất'));
      const purchaseCount = numberValue(rowValue(row, 'Số Lần mua Tour'));
      const revenue = numberValue(rowValue(row, 'Doanh thu'));
      return {
        index: index + 1,
        code: `${CODE_PREFIX}-${String(index + 1).padStart(4, '0')}`,
        fullName,
        phone,
        email: nullableText(rowValue(row, 'Email')),
        gender: nullableText(rowValue(row, 'Giới tính')),
        dateOfBirth,
        address: nullableText(rowValue(row, 'Địa chỉ')),
        province: nullableText(rowValue(row, 'Tỉnh thành')),
        country: 'Việt Nam',
        note: nullableText(rowValue(row, 'Nhu cầu/Ghi chú')),
        latestCareDate,
        latestCare: nullableText(rowValue(row, 'CS mới nhất')),
        purchaseCount,
        revenue,
        source: nullableText(rowValue(row, 'Nguồn khách hàng')),
        facebookUrl: nullableText(rowValue(row, 'Link Facebook')),
        typeName,
        owner: nullableText(rowValue(row, 'Nhân viên phụ trách')),
        createdAt,
        createdBy: nullableText(rowValue(row, 'Người tạo')),
        rawKind,
        kind: kindFor(rawKind),
        collaborator: nullableText(rowValue(row, 'CTV')),
        market: nullableText(rowValue(row, 'Thị trường')),
        tagNames: splitTags(rowValue(row, 'Thẻ')),
        raw: row,
      };
    })
    .filter((row) => row.fullName && row.phone);
}

function latestComment(row) {
  return [
    row.note ? `Ghi chú: ${row.note}` : null,
    row.latestCare ? `CS mới nhất: ${row.latestCare}` : null,
    `Số lần mua TourKit: ${row.purchaseCount}`,
    `Doanh thu TourKit: ${money(row.revenue)} VND`,
    `Nguồn: ${SOURCE_LABEL}`,
    `Import marker: ${IMPORT_MARKER}`,
  ].filter(Boolean).join('\n');
}

function customerData(row, typeId) {
  return {
    code: row.code,
    status: 'ACTIVE',
    typeId,
    kind: row.kind,
    fullName: row.fullName,
    gender: row.gender,
    dateOfBirth: row.dateOfBirth,
    phone: row.phone,
    email: row.email,
    facebookUrl: row.facebookUrl,
    address: row.address,
    province: row.province,
    country: row.country,
    source: row.source,
    market: row.market,
    groupName: row.typeName,
    companyName: row.kind === 'BUSINESS' ? row.fullName : null,
    createdBy: row.createdBy || IMPORT_MARKER,
    owner: row.owner,
    collaborator: row.collaborator,
    latestComment: latestComment(row),
    createdAt: row.createdAt || new Date(),
  };
}

function careTask(row) {
  if (!row.latestCareDate && !row.latestCare) return null;
  return {
    channel: 'NOTE',
    status: 'DONE',
    result: row.latestCare,
    completedAt: row.latestCareDate || row.createdAt || new Date(),
    scheduledAt: row.latestCareDate || row.createdAt || new Date(),
    owner: row.owner,
    note: [
      row.latestCare || 'Chăm sóc gần nhất từ TourKit',
      `Import marker: ${IMPORT_MARKER}`,
    ].join('\n'),
  };
}

function timeline(row, eventType) {
  return {
    eventType,
    title: eventType === 'TOURKIT_IMPORT_CREATE' ? 'Import khách hàng TourKit' : 'Cập nhật import khách hàng TourKit',
    content: latestComment(row),
    actor: row.createdBy || IMPORT_MARKER,
    createdAt: row.createdAt || new Date(),
    metadata: {
      source: SOURCE_LABEL,
      marker: IMPORT_MARKER,
      row: row.index,
      purchaseCount: row.purchaseCount,
      revenue: row.revenue,
      originalType: row.typeName,
      originalKind: row.rawKind,
    },
  };
}

async function main() {
  const file = arg('--file') || process.argv[2];
  const dryRun = process.argv.includes('--dry-run');
  if (!file) throw new Error('Cần truyền --file=/path/to/tourkit-customers.json');
  const payload = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
  const rows = normalizeRows(payload);
  const duplicatePhones = rows.map((row) => row.phone).filter((phone, index, all) => all.indexOf(phone) !== index);
  if (duplicatePhones.length) throw new Error(`Số điện thoại bị trùng trong file: ${Array.from(new Set(duplicatePhones)).join(', ')}`);
  const typeNames = Array.from(new Set(rows.map((row) => row.typeName).filter(Boolean))).sort((left, right) => left.localeCompare(right, 'vi'));
  const tagNames = Array.from(new Set(rows.flatMap((row) => row.tagNames))).sort((left, right) => left.localeCompare(right, 'vi'));
  const importPhones = rows.map((row) => row.phone);
  const obsoleteCustomers = await prisma.customer.findMany({
    where: { phone: { notIn: importPhones } },
    select: { id: true, code: true, fullName: true, phone: true },
  });
  console.log(JSON.stringify({
    sourceFile: payload.sourceFile,
    rowCount: rows.length,
    typeNames,
    tagNames,
    obsoleteCustomerCount: obsoleteCustomers.length,
    obsoleteCustomerSample: obsoleteCustomers.slice(0, 10),
    dryRun,
  }, null, 2));
  if (dryRun) return;

  const result = await prisma.$transaction(async (tx) => {
    const typeIds = new Map();
    for (const [index, name] of typeNames.entries()) {
      const code = slug(name);
      const type = await tx.customerTypeConfig.upsert({
        where: { code },
        update: { name, isActive: true, sortOrder: index + 1 },
        create: { code, name, isActive: true, sortOrder: index + 1, description: SOURCE_LABEL },
      });
      typeIds.set(name, type.id);
    }

    const tagIds = new Map();
    for (const name of tagNames) {
      const tag = await tx.customerTag.upsert({
        where: { name },
        update: { isActive: true },
        create: { name, color: '#2f8f8f', isActive: true },
      });
      tagIds.set(name, tag.id);
    }

    const obsoleteIds = obsoleteCustomers.map((customer) => customer.id);
    if (obsoleteIds.length) {
      await Promise.all([
        tx.order.updateMany({ where: { customerId: { in: obsoleteIds } }, data: { customerId: null } }),
        tx.booking.updateMany({ where: { customerId: { in: obsoleteIds } }, data: { customerId: null } }),
        tx.quotation.updateMany({ where: { customerId: { in: obsoleteIds } }, data: { customerId: null } }),
        tx.tourQuote.updateMany({ where: { customerId: { in: obsoleteIds } }, data: { customerId: null } }),
        tx.tourCustomer.updateMany({ where: { crmCustomerId: { in: obsoleteIds } }, data: { crmCustomerId: null } }),
        tx.fitTour.updateMany({ where: { customerId: { in: obsoleteIds } }, data: { customerId: null } }),
        tx.financeReceipt.updateMany({ where: { customerId: { in: obsoleteIds } }, data: { customerId: null } }),
        tx.financeInvoice.updateMany({ where: { customerId: { in: obsoleteIds } }, data: { customerId: null } }),
        tx.financeCashflowEntry.updateMany({ where: { customerId: { in: obsoleteIds } }, data: { customerId: null } }),
      ]);
      await tx.customer.deleteMany({ where: { id: { in: obsoleteIds } } });
    }

    let created = 0;
    let updated = 0;
    for (const row of rows) {
      const typeId = row.typeName ? typeIds.get(row.typeName) || null : null;
      const existing = await tx.customer.findUnique({ where: { phone: row.phone }, select: { id: true } });
      const data = customerData(row, typeId);
      let customer;
      if (existing) {
        await tx.customerTagMap.deleteMany({ where: { customerId: existing.id } });
        await tx.customerTimeline.deleteMany({ where: { customerId: existing.id, eventType: { in: ['TOURKIT_IMPORT_CREATE', 'TOURKIT_IMPORT_UPDATE'] } } });
        await tx.customerCareTask.deleteMany({ where: { customerId: existing.id, note: { contains: IMPORT_MARKER } } });
        customer = await tx.customer.update({ where: { id: existing.id }, data });
        await tx.customerTimeline.create({ data: { ...timeline(row, 'TOURKIT_IMPORT_UPDATE'), customerId: customer.id } });
        updated += 1;
      } else {
        customer = await tx.customer.create({
          data: {
            ...data,
            timeline: { create: [timeline(row, 'TOURKIT_IMPORT_CREATE')] },
          },
        });
        created += 1;
      }
      const care = careTask(row);
      if (care) await tx.customerCareTask.create({ data: { ...care, customerId: customer.id } });
      const customerTagIds = row.tagNames.map((name) => tagIds.get(name)).filter(Boolean);
      if (customerTagIds.length) {
        await tx.customerTagMap.createMany({
          data: customerTagIds.map((tagId) => ({ customerId: customer.id, tagId })),
          skipDuplicates: true,
        });
      }
    }
    return { deletedObsolete: obsoleteIds.length, created, updated };
  }, { timeout: 60_000 });

  const [activeCount, totalCount, byOwner, byType] = await Promise.all([
    prisma.customer.count({ where: { status: 'ACTIVE' } }),
    prisma.customer.count(),
    prisma.customer.groupBy({ by: ['owner'], _count: { _all: true }, orderBy: { owner: 'asc' } }),
    prisma.customerTypeConfig.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { customers: true } } },
    }),
  ]);
  console.log(JSON.stringify({
    ...result,
    totalCount,
    activeCount,
    byOwner: byOwner.map((row) => ({ owner: row.owner, count: row._count._all })),
    byType: byType.map((row) => ({ name: row.name, count: row._count.customers })).filter((row) => row.count > 0),
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

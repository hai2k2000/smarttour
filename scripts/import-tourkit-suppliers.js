#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const SOURCE_LABEL = 'TourKit NCC export 16/06/2026 09:56:52';
const IMPORT_MARKER = 'TOURKIT_NCC_IMPORT_2026_06_16';
const HOTEL_CATEGORY = 'Khách sạn';

const TYPE_CATEGORY_MAP = new Map([
  ['khach san', HOTEL_CATEGORY],
  ['nha xe', 'Nhà xe'],
  ['landtour', 'Landtour'],
  ['nha hang', 'Nhà hàng'],
  ['tour guide', 'Hướng dẫn viên'],
  ['chi phi khac', 'Chi phí khác'],
  ['ve tham quan', 'Vé tham quan'],
  ['van chuyen', 'Vận chuyển'],
  ['ve may bay', 'Vé máy bay'],
  ['nuoc suoi', 'Nước uống'],
  ['nuoc uong', 'Nước uống'],
]);

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

function numberValue(value) {
  if (value === null || value === undefined || value === '') return 0;
  const parsed = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
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

function categoryFor(rawType) {
  const normalized = key(rawType);
  return TYPE_CATEGORY_MAP.get(normalized) || text(rawType) || 'Chi phí khác';
}

function statusFor(value) {
  return /ngung|khong|inactive/i.test(key(value)) ? 'INACTIVE' : 'ACTIVE';
}

function inferProvince(row) {
  const haystack = `${row.code} ${row.name} ${row.phone}`.toLowerCase();
  if (/đà nẵng|da nang|0236/.test(haystack)) return 'Đà Nẵng';
  if (/hội an|hoi an|0235/.test(haystack)) return 'Quảng Nam';
  if (/quy nhơn|quy nhon|0256/.test(haystack)) return 'Bình Định';
  if (/phú quốc|phu quoc/.test(haystack)) return 'Kiên Giang';
  if (/huế|hue|0234/.test(haystack)) return 'Thừa Thiên Huế';
  if (/nha trang|khánh hòa|khanh hoa|0258/.test(haystack)) return 'Khánh Hòa';
  if (/đà lạt|da lat|lâm đồng|lam dong|0263/.test(haystack)) return 'Lâm Đồng';
  if (/hà nội|ha noi|tràng an|trang an|ninh bình|ninh binh|024/.test(haystack)) return 'Hà Nội';
  if (/hồ chí minh|ho chi minh|sài gòn|sai gon|028/.test(haystack)) return 'TP. Hồ Chí Minh';
  return null;
}

function starRating(row) {
  const match = `${row.code} ${row.name}`.match(/([1-5])\s*\*/);
  return match ? Number(match[1]) : null;
}

function hotelClass(row) {
  const rating = starRating(row);
  return rating ? `${rating} sao` : 'Chưa phân hạng';
}

function money(value) {
  return new Intl.NumberFormat('vi-VN').format(numberValue(value));
}

function normalizeRows(payload) {
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  return rows
    .map((row, index) => {
      const supplierCode = text(rowValue(row, 'Mã NCC'));
      const name = text(rowValue(row, 'Tên NCC'));
      const rawType = text(rowValue(row, 'Loại NCC'));
      const item = {
        index: index + 1,
        supplierCode,
        name,
        phone: nullableText(rowValue(row, 'Số điện thoại')),
        email: nullableText(rowValue(row, 'Email')),
        rawType,
        categoryName: categoryFor(rawType),
        quantity: numberValue(rowValue(row, 'Số lượng')),
        totalPurchase: numberValue(rowValue(row, 'Tổng mua')),
        paid: numberValue(rowValue(row, 'Đã trả')),
        collected: numberValue(rowValue(row, 'Thu hộ')),
        debt: numberValue(rowValue(row, 'Còn nợ')),
        balance: numberValue(rowValue(row, 'Số dư')),
        status: statusFor(rowValue(row, 'Tình trạng')),
      };
      item.province = inferProvince(item);
      return item;
    })
    .filter((row) => row.supplierCode && row.name);
}

function supplierNotes(row) {
  return [
    `Nguồn: ${SOURCE_LABEL}`,
    `Loại NCC gốc: ${row.rawType || '-'}`,
    `Số lượng TourKit: ${row.quantity}`,
    `Tổng mua TourKit: ${money(row.totalPurchase)} VND`,
    `Đã trả TourKit: ${money(row.paid)} VND`,
    `Thu hộ TourKit: ${money(row.collected)} VND`,
    `Còn nợ TourKit: ${money(row.debt)} VND`,
    `Số dư TourKit: ${money(row.balance)} VND`,
    `Import marker: ${IMPORT_MARKER}`,
  ].join('\n');
}

function supplierData(row, categoryId) {
  return {
    categoryId,
    supplierCode: row.supplierCode,
    name: row.name,
    phone: row.phone,
    email: row.email,
    country: 'Việt Nam',
    province: row.province,
    market: 'TourKit',
    pricePolicy: `Tổng mua TourKit: ${money(row.totalPurchase)} VND; số lượng: ${row.quantity}`,
    debtNote: `Đã trả: ${money(row.paid)} VND; còn nợ: ${money(row.debt)} VND; số dư: ${money(row.balance)} VND`,
    notes: supplierNotes(row),
    status: row.status,
    createdBy: IMPORT_MARKER,
    deletedAt: null,
  };
}

async function main() {
  const file = arg('--file') || process.argv[2];
  const dryRun = process.argv.includes('--dry-run');
  if (!file) throw new Error('Cần truyền --file=/path/to/tourkit-suppliers.json');
  const payload = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
  const rows = normalizeRows(payload);
  const duplicateCodes = rows.map((row) => row.supplierCode).filter((code, index, all) => all.indexOf(code) !== index);
  if (duplicateCodes.length) throw new Error(`Mã NCC bị trùng trong file: ${Array.from(new Set(duplicateCodes)).join(', ')}`);
  const categoryNames = Array.from(new Set(rows.map((row) => row.categoryName))).sort((left, right) => left.localeCompare(right, 'vi'));
  console.log(JSON.stringify({
    sourceFile: payload.sourceFile,
    rowCount: rows.length,
    categoryNames,
    dryRun,
  }, null, 2));
  if (dryRun) return;

  const result = await prisma.$transaction(async (tx) => {
    const now = new Date();
    const categories = new Map();
    for (const name of categoryNames) {
      const category = await tx.supplierCategory.upsert({
        where: { name },
        update: {},
        create: { name },
      });
      categories.set(name, category.id);
    }
    const hotelCategory = await tx.supplierCategory.upsert({
      where: { name: HOTEL_CATEGORY },
      update: {},
      create: { name: HOTEL_CATEGORY },
    });
    categories.set(HOTEL_CATEGORY, hotelCategory.id);

    const importCodes = rows.map((row) => row.supplierCode);
    const demoSuppliers = await tx.supplier.findMany({
      where: {
        deletedAt: null,
        OR: [
          { supplierCode: null },
          { supplierCode: { notIn: importCodes } },
        ],
      },
      select: { id: true },
    });
    const demoSupplierIds = demoSuppliers.map((supplier) => supplier.id);
    if (demoSupplierIds.length) {
      await tx.supplierService.updateMany({
        where: { supplierId: { in: demoSupplierIds }, deletedAt: null },
        data: { deletedAt: now, status: 'INACTIVE' },
      });
      await tx.supplier.updateMany({
        where: { id: { in: demoSupplierIds } },
        data: { deletedAt: now, status: 'INACTIVE' },
      });
    }

    let created = 0;
    let updated = 0;
    let hotelProfiles = 0;
    for (const row of rows) {
      const categoryId = categories.get(row.categoryName) || categories.get('Chi phí khác');
      const existing = await tx.supplier.findUnique({ where: { supplierCode: row.supplierCode }, select: { id: true } });
      const data = supplierData(row, categoryId);
      const supplier = existing
        ? await tx.supplier.update({ where: { id: existing.id }, data })
        : await tx.supplier.create({ data });
      if (existing) updated += 1;
      else created += 1;

      if (row.categoryName === HOTEL_CATEGORY) {
        await tx.hotelSupplier.upsert({
          where: { supplierId: supplier.id },
          update: {
            classHotel: hotelClass(row),
            hotelProject: 'TourKit Import',
            rating: starRating(row),
            market: 'TourKit',
          },
          create: {
            supplierId: supplier.id,
            classHotel: hotelClass(row),
            hotelProject: 'TourKit Import',
            rating: starRating(row),
            market: 'TourKit',
          },
        });
        hotelProfiles += 1;
      }
    }

    const demoCategories = await tx.supplierCategory.findMany({
      where: { name: { in: ['Demo Hotel', 'Hotel', 'Land Tour', 'Smoke Category'] } },
      include: { _count: { select: { suppliers: true } } },
    });
    for (const category of demoCategories) {
      if (category._count.suppliers === 0) {
        await tx.supplierCategory.delete({ where: { id: category.id } });
      }
    }

    return { softDeleted: demoSupplierIds.length, created, updated, hotelProfiles };
  }, { timeout: 60_000 });

  const activeCount = await prisma.supplier.count({ where: { deletedAt: null } });
  const activeByCategory = await prisma.supplierCategory.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { suppliers: { where: { deletedAt: null } } } } },
  });
  console.log(JSON.stringify({
    ...result,
    activeCount,
    activeByCategory: activeByCategory
      .map((category) => ({ name: category.name, count: category._count.suppliers }))
      .filter((category) => category.count > 0),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});

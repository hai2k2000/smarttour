#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const SOURCE_LABEL = 'TourKit HDV export 17/06/2026 12:04';
const IMPORT_MARKER = 'TOURKIT_HDV_IMPORT_2026_06_17';
const TOURKIT_COST_SERVICE_NAME = 'Chi phí hướng dẫn viên TourKit';
const DEFAULT_LANGUAGE = 'Tiếng Việt';
const DEFAULT_MARKET = 'Nội địa';
const DEFAULT_SKILL = 'Hướng dẫn tour';

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

function numberValue(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const raw = String(value).trim().replace(/\s/g, '');
  if (!raw) return 0;
  const normalized = /^\d{1,3}(\.\d{3})+(,\d+)?$/.test(raw)
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw.replace(/,/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value) {
  return new Intl.NumberFormat('vi-VN').format(numberValue(value));
}

function statusFor(value) {
  const normalized = key(value);
  return /tam dung|ngung|khong hoat dong|inactive|disabled|lock/.test(normalized) ? 'INACTIVE' : 'ACTIVE';
}

function sanitizeGuideCode(value, index) {
  const compact = text(value).replace(/\s+/g, '_').replace(/[^A-Za-z0-9_-]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
  return compact || `HDV_${index + 1}`;
}

function normalizedPhone(value) {
  const raw = text(value);
  if (!raw) return '';
  const compact = raw.replace(/[^\d+().\-\s]/g, '').replace(/\s+/g, ' ').trim();
  const digits = compact.replace(/\D/g, '');
  if (digits.length < 6 || /^0{1,5}$/.test(digits) || /^0+$/.test(digits)) return '';
  return compact.replace(/\s+/g, '');
}

function numericHash(value) {
  let hash = 0;
  const input = text(value) || 'HDV';
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return String(hash % 100000000).padStart(8, '0');
}

function placeholderPhone(row, usedPhones) {
  const base = `0000${numericHash(`${row.guideCode}:${row.index}`)}`;
  let candidate = base;
  let suffix = 1;
  while (usedPhones.has(candidate)) {
    const suffixText = String(suffix).padStart(2, '0');
    candidate = `${base.slice(0, Math.max(6, 32 - suffixText.length))}${suffixText}`;
    suffix += 1;
  }
  return candidate;
}

function normalizeRows(payload) {
  const rows = Array.isArray(payload.records) ? payload.records : Array.isArray(payload.rows) ? payload.rows : [];
  return rows
    .map((row, index) => {
      const guideCode = sanitizeGuideCode(rowValue(row, 'Mã NCC'), index);
      const fullName = text(rowValue(row, 'Tên NCC'));
      return {
        index,
        stt: numberValue(rowValue(row, 'STT')) || index + 1,
        guideCode,
        fullName,
        rawPhone: text(rowValue(row, 'Số điện thoại')),
        normalizedPhone: normalizedPhone(rowValue(row, 'Số điện thoại')),
        email: nullableText(rowValue(row, 'Email')),
        classHotel: nullableText(rowValue(row, 'ClassHotel')),
        projectName: nullableText(rowValue(row, 'Tên dự án')),
        quantity: numberValue(rowValue(row, 'Số lượng')),
        sold: numberValue(rowValue(row, 'Đã bán')),
        remaining: numberValue(rowValue(row, 'Còn lại')),
        totalPurchase: numberValue(rowValue(row, 'Tổng mua')),
        paid: numberValue(rowValue(row, 'Đã trả')),
        debt: numberValue(rowValue(row, 'Còn nợ')),
        rawStatus: text(rowValue(row, 'Tình trạng')),
        status: statusFor(rowValue(row, 'Tình trạng')),
      };
    })
    .filter((row) => row.guideCode && row.fullName);
}

function assertUniqueCodes(rows) {
  const seen = new Set();
  const duplicates = new Set();
  for (const row of rows) {
    const codeKey = row.guideCode.toLowerCase();
    if (seen.has(codeKey)) duplicates.add(row.guideCode);
    seen.add(codeKey);
  }
  if (duplicates.size) throw new Error(`Mã hướng dẫn viên bị trùng trong file: ${Array.from(duplicates).join(', ')}`);
}

function planPhones(rows, existingGuides) {
  const existingByCode = new Map(existingGuides.map((guide) => [guide.guideCode.toLowerCase(), guide]));
  const existingPhoneOwner = new Map();
  for (const guide of existingGuides) {
    if (guide.phone) existingPhoneOwner.set(guide.phone, guide.guideCode.toLowerCase());
  }
  const usedPhones = new Set(existingGuides.map((guide) => guide.phone).filter(Boolean));
  const assignedIncomingPhones = new Set();
  const planned = new Map();
  for (const row of rows) {
    const codeKey = row.guideCode.toLowerCase();
    const existing = existingByCode.get(codeKey);
    const owner = row.normalizedPhone ? existingPhoneOwner.get(row.normalizedPhone) : undefined;
    const canKeepPhone = Boolean(
      row.normalizedPhone
      && (!owner || owner === codeKey)
      && !assignedIncomingPhones.has(row.normalizedPhone)
    );
    if (canKeepPhone) {
      planned.set(row.guideCode, { phone: row.normalizedPhone, replaced: row.normalizedPhone !== row.rawPhone });
      assignedIncomingPhones.add(row.normalizedPhone);
      usedPhones.add(row.normalizedPhone);
      continue;
    }
    if (existing?.phone && !assignedIncomingPhones.has(existing.phone)) {
      planned.set(row.guideCode, { phone: existing.phone, replaced: !row.normalizedPhone || existing.phone !== row.normalizedPhone });
      assignedIncomingPhones.add(existing.phone);
      usedPhones.add(existing.phone);
      continue;
    }
    const phone = placeholderPhone(row, usedPhones);
    planned.set(row.guideCode, { phone, replaced: true });
    usedPhones.add(phone);
  }
  return planned;
}

function guideComment(row, phonePlan) {
  return [
    `Nguồn: ${SOURCE_LABEL}`,
    `Mã NCC TourKit: ${row.guideCode}`,
    `Số điện thoại gốc TourKit: ${row.rawPhone || '-'}`,
    phonePlan.replaced ? `Số điện thoại lưu trong SmartTour: ${phonePlan.phone}` : null,
    `ClassHotel TourKit: ${row.classHotel || '-'}`,
    `Tên dự án TourKit: ${row.projectName || '-'}`,
    `Số lượng TourKit: ${row.quantity}`,
    `Đã bán TourKit: ${row.sold}`,
    `Còn lại TourKit: ${row.remaining}`,
    `Tổng mua TourKit: ${money(row.totalPurchase)} VND`,
    `Đã trả TourKit: ${money(row.paid)} VND`,
    `Còn nợ TourKit: ${money(row.debt)} VND`,
    `Tình trạng gốc TourKit: ${row.rawStatus || '-'}`,
    `Import marker: ${IMPORT_MARKER}`,
  ].filter(Boolean).join('\n');
}

function costNote(row) {
  return [
    `Nguồn: ${SOURCE_LABEL}`,
    `Số lượng TourKit: ${row.quantity}`,
    `Đã bán TourKit: ${row.sold}`,
    `Còn lại TourKit: ${row.remaining}`,
    `Đã trả TourKit: ${money(row.paid)} VND`,
    `Còn nợ TourKit: ${money(row.debt)} VND`,
    `Import marker: ${IMPORT_MARKER}`,
  ].join('\n');
}

function guideData(row, phonePlan, existing) {
  return {
    guideCode: row.guideCode,
    fullName: row.fullName,
    phone: phonePlan.phone,
    email: row.email,
    description: row.projectName,
    guideType: 'Local',
    languages: existing?.languages?.length ? existing.languages : [DEFAULT_LANGUAGE],
    markets: existing?.markets?.length ? existing.markets : [DEFAULT_MARKET],
    skills: existing?.skills?.length ? existing.skills : [DEFAULT_SKILL],
    comment: guideComment(row, phonePlan),
    status: row.status,
    createdBy: IMPORT_MARKER,
    deletedAt: null,
  };
}

async function main() {
  const file = arg('--file') || process.argv[2];
  const dryRun = process.argv.includes('--dry-run');
  if (!file) throw new Error('Cần truyền --file=/path/to/tourkit-guides.json');

  const payload = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
  const rows = normalizeRows(payload);
  assertUniqueCodes(rows);

  const existingGuides = await prisma.guideProfile.findMany({
    where: { deletedAt: null },
    select: { id: true, guideCode: true, phone: true, languages: true, markets: true, skills: true },
  });
  const existingByCode = new Map(existingGuides.map((guide) => [guide.guideCode.toLowerCase(), guide]));
  const phonePlans = planPhones(rows, existingGuides);
  const replacedPhones = rows
    .map((row) => ({ guideCode: row.guideCode, rawPhone: row.rawPhone, phone: phonePlans.get(row.guideCode).phone }))
    .filter((row) => row.rawPhone !== row.phone);
  const statusCounts = rows.reduce((counts, row) => {
    counts[row.status] = (counts[row.status] || 0) + 1;
    return counts;
  }, {});

  console.log(JSON.stringify({
    sourceFile: payload.sourceFile,
    sheet: payload.sheet,
    rowCount: rows.length,
    dryRun,
    statusCounts,
    replacedPhones,
  }, null, 2));
  if (dryRun) return;

  const result = await prisma.$transaction(async (tx) => {
    let created = 0;
    let updated = 0;
    let costServices = 0;
    for (const row of rows) {
      const existing = existingByCode.get(row.guideCode.toLowerCase());
      const data = guideData(row, phonePlans.get(row.guideCode), existing);
      const guide = existing
        ? await tx.guideProfile.update({ where: { id: existing.id }, data })
        : await tx.guideProfile.create({ data });
      if (existing) updated += 1;
      else created += 1;

      await tx.guideCostService.deleteMany({
        where: {
          guideId: guide.id,
          serviceType: 'TourKit',
          serviceName: TOURKIT_COST_SERVICE_NAME,
        },
      });
      await tx.guideCostService.create({
        data: {
          guideId: guide.id,
          serviceType: 'TourKit',
          serviceName: TOURKIT_COST_SERVICE_NAME,
          unit: 'tour',
          currency: 'VND',
          netPrice: row.totalPurchase,
          sellingPrice: row.totalPurchase,
          note: costNote(row),
          sortOrder: 0,
        },
      });
      costServices += 1;
    }
    return { created, updated, costServices };
  }, { timeout: 60_000 });

  const activeGuideCount = await prisma.guideProfile.count({ where: { deletedAt: null } });
  const importedGuideCount = await prisma.guideProfile.count({
    where: {
      deletedAt: null,
      guideCode: { in: rows.map((row) => row.guideCode) },
    },
  });
  console.log(JSON.stringify({ ...result, activeGuideCount, importedGuideCount }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});

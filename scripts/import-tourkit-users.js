#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { pbkdf2Sync, randomBytes } = require('crypto');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const SOURCE_LABEL = 'TourKit user export 16/06/2026';
const IMPORT_MARKER = 'TOURKIT_USER_IMPORT_2026_06_16';
const DEFAULT_BRANCH = 'Chi Nhánh Tổng';
const GENERATED_EMAIL_DOMAIN = 'tourkit.local';

const ROLE_BY_DEPARTMENT = new Map([
  ['bod', 'super_admin'],
  ['coo', 'operation'],
  ['dieu hanh', 'operation'],
  ['ke toan', 'accounting'],
  ['nhan vien kinh doanh', 'sales'],
  ['marketing', 'sales'],
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

function parseDate(value) {
  const valueText = text(value);
  if (!valueText) return null;
  const dmy = valueText.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) {
    const [, day, month, year] = dmy;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12));
  }
  const ymd = valueText.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (ymd) {
    const [, year, month, day] = ymd;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12));
  }
  const parsed = new Date(valueText);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function normalizeUsername(value, index) {
  const username = text(value).toLowerCase();
  if (!username) throw new Error(`Dòng ${index}: thiếu tên tài khoản`);
  if (!/^[a-z0-9][a-z0-9._-]{2,49}$/.test(username)) {
    throw new Error(`Dòng ${index}: tên tài khoản không hợp lệ: ${username}`);
  }
  return username;
}

function normalizeEmail(value, index) {
  const email = text(value).toLowerCase();
  if (!email) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(`Dòng ${index}: email không hợp lệ: ${email}`);
  return email;
}

function roleForDepartment(department) {
  return ROLE_BY_DEPARTMENT.get(key(department)) || 'sales';
}

function generatedEmail(username) {
  return `${username}@${GENERATED_EMAIL_DOMAIN}`;
}

function normalizeRows(payload) {
  const rows = Array.isArray(payload.records) ? payload.records : Array.isArray(payload.rows) ? payload.rows : [];
  return rows.map((row, index) => {
    const line = index + 1;
    const username = normalizeUsername(rowValue(row, 'Tên Tài khoản'), line);
    const name = text(rowValue(row, 'Họ tên'));
    if (!name) throw new Error(`Dòng ${line}: thiếu họ tên`);
    const department = nullableText(rowValue(row, 'Phòng ban'));
    const roleCode = roleForDepartment(department);
    return {
      index: line,
      username,
      email: normalizeEmail(rowValue(row, 'Email'), line),
      name,
      gender: nullableText(rowValue(row, 'Giới tính')),
      department,
      phone: text(rowValue(row, 'Số điện thoại')).replace(/\D+/g, '') || null,
      createdAt: parseDate(rowValue(row, 'Ngày tạo')),
      dateOfBirth: parseDate(rowValue(row, 'Ngày sinh')),
      address: nullableText(rowValue(row, 'Địa chỉ')),
      identityNo: nullableText(rowValue(row, 'CCCD/CMND')),
      maritalStatus: nullableText(rowValue(row, 'Hôn nhân')),
      nationality: nullableText(rowValue(row, 'Quốc tịch')),
      ethnicity: nullableText(rowValue(row, 'Dân tộc')),
      religion: nullableText(rowValue(row, 'Tôn giáo')),
      taxCode: nullableText(rowValue(row, 'Mã số thuế')),
      rank: nullableText(rowValue(row, 'Cấp bậc')),
      bankAccountNumber: nullableText(rowValue(row, 'STK')),
      bankAccountName: nullableText(rowValue(row, 'Tên Tk')),
      bankName: nullableText(rowValue(row, 'Tên ngân hàng')),
      branch: DEFAULT_BRANCH,
      roleCode,
      raw: row,
    };
  });
}

function assertNoDuplicates(rows) {
  const seenUsernames = new Map();
  const seenEmails = new Map();
  for (const row of rows) {
    if (seenUsernames.has(row.username)) throw new Error(`Tên tài khoản bị trùng: ${row.username}`);
    seenUsernames.set(row.username, row.index);
    if (row.email) {
      if (seenEmails.has(row.email)) throw new Error(`Email bị trùng trong file: ${row.email}`);
      seenEmails.set(row.email, row.index);
    }
  }
}

function hashPassword(password) {
  const salt = randomBytes(16).toString('base64url');
  const iterations = 310000;
  const hash = pbkdf2Sync(password, salt, iterations, 32, 'sha256').toString('base64url');
  return `pbkdf2$${iterations}$${salt}$${hash}`;
}

function randomPassword() {
  return `ST-${randomBytes(18).toString('base64url')}`;
}

function userData(row, email, passwordHash) {
  return {
    username: row.username,
    email,
    name: row.name,
    phone: row.phone,
    gender: row.gender,
    dateOfBirth: row.dateOfBirth,
    address: row.address,
    identityNo: row.identityNo,
    maritalStatus: row.maritalStatus,
    nationality: row.nationality,
    ethnicity: row.ethnicity,
    religion: row.religion,
    taxCode: row.taxCode,
    rank: row.rank,
    bankAccountNumber: row.bankAccountNumber,
    bankAccountName: row.bankAccountName,
    bankName: row.bankName,
    status: 'ACTIVE',
    branch: row.branch,
    department: row.department,
    passwordHash,
    createdAt: row.createdAt || new Date(),
  };
}

function csvValue(value) {
  const valueText = String(value ?? '');
  return /[",\n]/.test(valueText) ? `"${valueText.replace(/"/g, '""')}"` : valueText;
}

function writeCredentials(file, credentials) {
  if (!file || !credentials.length) return null;
  const lines = [
    ['username', 'email', 'name', 'roleCode', 'temporaryPassword', 'note'].map(csvValue).join(','),
    ...credentials.map((row) => [row.username, row.email, row.name, row.roleCode, row.password, row.note].map(csvValue).join(',')),
  ];
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${lines.join('\n')}\n`, { encoding: 'utf8', mode: 0o600 });
  fs.chmodSync(file, 0o600);
  return file;
}

async function main() {
  const file = arg('--file') || process.argv[2];
  const credentialsFile = arg('--credentials');
  const dryRun = process.argv.includes('--dry-run');
  if (!file) throw new Error('Cần truyền --file=/path/to/tourkit-users.json');

  const payload = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8').replace(/^\uFEFF/, ''));
  const rows = normalizeRows(payload);
  assertNoDuplicates(rows);

  const importUsernames = rows.map((row) => row.username);
  const requiredRoles = Array.from(new Set(rows.map((row) => row.roleCode))).sort();
  const [roles, currentUsers, obsoleteUsers, smokeRoles] = await Promise.all([
    prisma.role.findMany({ where: { code: { in: requiredRoles }, status: 'ACTIVE' }, select: { id: true, code: true } }),
    prisma.user.findMany({ select: { id: true, username: true, email: true, name: true, passwordHash: true } }),
    prisma.user.findMany({
      where: { OR: [{ username: null }, { username: { notIn: importUsernames } }] },
      select: { id: true, username: true, email: true, name: true },
      orderBy: [{ username: 'asc' }, { email: 'asc' }],
    }),
    prisma.role.findMany({
      where: { isSystem: false, code: { startsWith: 'ops-ui-smoke_' } },
      select: { id: true, code: true },
      orderBy: { code: 'asc' },
    }),
  ]);

  const roleMap = new Map(roles.map((role) => [role.code, role.id]));
  const missingRoles = requiredRoles.filter((code) => !roleMap.has(code));
  if (missingRoles.length) throw new Error(`Thiếu vai trò active: ${missingRoles.join(', ')}`);

  const currentByUsername = new Map(currentUsers.filter((user) => user.username).map((user) => [user.username, user]));
  const planned = rows.map((row) => {
    const existing = currentByUsername.get(row.username);
    return {
      username: row.username,
      name: row.name,
      email: row.email || existing?.email || generatedEmail(row.username),
      roleCode: row.roleCode,
      action: existing ? 'update' : 'create',
      keepsPassword: Boolean(existing),
    };
  });

  console.log(JSON.stringify({
    source: payload.source || payload.sourceFile || file,
    rowCount: rows.length,
    requiredRoles,
    roleAssignments: rows.reduce((acc, row) => ({ ...acc, [row.roleCode]: (acc[row.roleCode] || 0) + 1 }), {}),
    planned,
    obsoleteUsers,
    smokeRoles,
    credentialsFile: credentialsFile || null,
    dryRun,
  }, null, 2));
  if (dryRun) return;

  const credentials = [];
  const result = await prisma.$transaction(async (tx) => {
    const actor = await tx.user.findUnique({ where: { username: 'admin' }, select: { id: true } });
    const obsoleteIds = obsoleteUsers.map((user) => user.id);
    const smokeRoleIds = smokeRoles.map((role) => role.id);
    if (obsoleteIds.length) await tx.user.deleteMany({ where: { id: { in: obsoleteIds } } });
    if (smokeRoleIds.length) await tx.role.deleteMany({ where: { id: { in: smokeRoleIds } } });

    let created = 0;
    let updated = 0;
    for (const row of rows) {
      const existing = await tx.user.findUnique({ where: { username: row.username }, select: { id: true, email: true, passwordHash: true } });
      const email = row.email || existing?.email || generatedEmail(row.username);
      const temporaryPassword = existing ? null : randomPassword();
      const passwordHash = existing?.passwordHash || hashPassword(temporaryPassword);
      const data = userData(row, email, passwordHash);
      let user;
      if (existing) {
        user = await tx.user.update({ where: { id: existing.id }, data });
        await tx.userRole.deleteMany({ where: { userId: existing.id } });
        updated += 1;
      } else {
        user = await tx.user.create({ data });
        created += 1;
      }
      await tx.userRole.createMany({
        data: [{ userId: user.id, roleId: roleMap.get(row.roleCode) }],
        skipDuplicates: true,
      });
      if (temporaryPassword) {
        credentials.push({
          username: row.username,
          email,
          name: row.name,
          roleCode: row.roleCode,
          password: temporaryPassword,
          note: 'Mật khẩu tạm thời sinh khi import TourKit',
        });
      }
    }

    await tx.auditLog.create({
      data: {
        actorId: actor?.id,
        action: 'IMPORT',
        entity: 'User',
        metadata: {
          marker: IMPORT_MARKER,
          source: SOURCE_LABEL,
          rowCount: rows.length,
          created,
          updated,
          deletedObsolete: obsoleteIds.length,
          deletedSmokeRoles: smokeRoleIds.length,
          roleAssignments: rows.reduce((acc, row) => ({ ...acc, [row.roleCode]: (acc[row.roleCode] || 0) + 1 }), {}),
        },
      },
    });

    return { created, updated, deletedObsolete: obsoleteIds.length, deletedSmokeRoles: smokeRoleIds.length };
  }, { timeout: 60_000 });

  const writtenCredentialsFile = writeCredentials(credentialsFile, credentials);
  const [activeCount, totalCount, byRole] = await Promise.all([
    prisma.user.count({ where: { status: 'ACTIVE' } }),
    prisma.user.count(),
    prisma.role.findMany({
      where: { code: { in: requiredRoles } },
      select: { code: true, _count: { select: { users: true } } },
      orderBy: { code: 'asc' },
    }),
  ]);
  console.log(JSON.stringify({
    ...result,
    activeCount,
    totalCount,
    generatedCredentialCount: credentials.length,
    credentialsFile: writtenCredentialsFile,
    byRole: byRole.map((role) => ({ code: role.code, users: role._count.users })),
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

#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');

const SECURE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function loadDotEnv(file = path.join(process.cwd(), '.env')) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[match[1]] = value;
  }
}

function prismaModule() {
  try {
    return require('@prisma/client');
  } catch (error) {
    if (process.env.NODE_PATH) {
      for (const base of process.env.NODE_PATH.split(path.delimiter)) {
        try {
          return require(path.join(base, '@prisma/client'));
        } catch {
          // Try the next NODE_PATH entry.
        }
      }
    }
    throw error;
  }
}

function ensureDatabaseUrl() {
  if (process.env.DATABASE_URL) return;
  if (!process.env.POSTGRES_PASSWORD) return;
  const host = process.env.SMARTLINK_DB_HOST || process.env.POSTGRES_HOST || '127.0.0.1';
  const port = process.env.SMARTLINK_DB_PORT || process.env.POSTGRES_PORT || '5433';
  const user = process.env.POSTGRES_USER || 'smarttour';
  const db = process.env.POSTGRES_DB || 'smarttour';
  process.env.DATABASE_URL = `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(process.env.POSTGRES_PASSWORD)}@${host}:${port}/${db}?schema=public`;
}

function parseArgs(argv) {
  const args = { mode: 'audit', output: undefined, publicBaseUrl: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--mode') args.mode = argv[++index];
    else if (arg.startsWith('--mode=')) args.mode = arg.slice('--mode='.length);
    else if (arg === '--output') args.output = argv[++index];
    else if (arg.startsWith('--output=')) args.output = arg.slice('--output='.length);
    else if (arg === '--site-url' || arg === '--public-base-url') args.publicBaseUrl = argv[++index];
    else if (arg.startsWith('--site-url=')) args.publicBaseUrl = arg.slice('--site-url='.length);
    else if (arg.startsWith('--public-base-url=')) args.publicBaseUrl = arg.slice('--public-base-url='.length);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!['audit', 'guard', 'backfill'].includes(args.mode)) throw new Error(`Unsupported mode: ${args.mode}`);
  return args;
}

function publicBaseUrl(value) {
  return String(
    value
    || process.env.SMARTTOUR_PUBLIC_BASE_URL
    || process.env.SITE_URL
    || (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/api\/?$/, '')
    || 'https://aitour.io.vn',
  ).replace(/\/+$/, '');
}

function publicUrl(base, token) {
  return token ? `${base}/api/quotations/public/${encodeURIComponent(token)}` : null;
}

function isSecureSmartLinkToken(token) {
  return typeof token === 'string' && SECURE_TOKEN_PATTERN.test(token);
}

function rowPayload(row, base) {
  return {
    id: row.id,
    quoteCode: row.quoteCode,
    customerName: row.customerName || null,
    customerEmail: row.customerEmail || null,
    customerPhone: row.customerPhone || null,
    status: row.status,
    branch: row.branch || null,
    department: row.department || null,
    oldToken: row.smartLinkToken || null,
    oldPublicUrl: publicUrl(base, row.smartLinkToken),
    updatedAt: row.updatedAt,
  };
}

async function auditSmartLinks(prisma, options = {}) {
  const base = publicBaseUrl(options.publicBaseUrl);
  const rows = await prisma.quotation.findMany({
    where: {
      OR: [
        { smartLinkEnabled: true },
        { smartLinkToken: { not: null } },
      ],
    },
    select: {
      id: true,
      quoteCode: true,
      customerName: true,
      customerEmail: true,
      customerPhone: true,
      status: true,
      branch: true,
      department: true,
      smartLinkEnabled: true,
      smartLinkToken: true,
      updatedAt: true,
    },
    orderBy: [{ updatedAt: 'desc' }, { quoteCode: 'asc' }],
  });

  const active = rows.filter((row) => row.smartLinkEnabled);
  const activeLegacy = active.filter((row) => !isSecureSmartLinkToken(row.smartLinkToken)).map((row) => rowPayload(row, base));
  const inactiveLegacy = rows
    .filter((row) => !row.smartLinkEnabled && row.smartLinkToken && !isSecureSmartLinkToken(row.smartLinkToken))
    .map((row) => rowPayload(row, base));

  return {
    generatedAt: new Date().toISOString(),
    publicBaseUrl: base,
    activeLegacy,
    inactiveLegacy,
    activeSecureCount: active.filter((row) => isSecureSmartLinkToken(row.smartLinkToken)).length,
    activeTotal: active.length,
  };
}

function newToken() {
  return randomBytes(32).toString('base64url');
}

async function rotateOne(prisma, row, base) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const current = await prisma.quotation.findUnique({
      where: { id: row.id },
      select: { id: true, quoteCode: true, smartLinkEnabled: true, smartLinkToken: true },
    });
    if (!current || !current.smartLinkEnabled || isSecureSmartLinkToken(current.smartLinkToken)) return null;
    const token = newToken();
    try {
      await prisma.quotation.update({ where: { id: row.id }, data: { smartLinkToken: token } });
      return {
        ...row,
        newToken: token,
        newPublicUrl: publicUrl(base, token),
      };
    } catch (error) {
      if (error?.code !== 'P2002') throw error;
    }
  }
  throw new Error(`Unable to generate unique SmartLink token for quotation ${row.quoteCode}`);
}

async function backfillSmartLinks(prisma, options = {}) {
  const before = await auditSmartLinks(prisma, options);
  const rotated = [];
  for (const row of before.activeLegacy) {
    const result = await rotateOne(prisma, row, before.publicBaseUrl);
    if (result) rotated.push(result);
  }
  const after = await auditSmartLinks(prisma, options);
  return {
    generatedAt: new Date().toISOString(),
    publicBaseUrl: before.publicBaseUrl,
    rotated,
    before,
    after,
  };
}

function writeReport(report, output) {
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (!output) {
    process.stdout.write(json);
    return;
  }
  fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
  fs.writeFileSync(output, json);
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  loadDotEnv(process.env.ENV_FILE || path.join(process.cwd(), '.env'));
  ensureDatabaseUrl();
  const { PrismaClient } = prismaModule();
  const prisma = new PrismaClient();
  await prisma.$connect();
  try {
    if (args.mode === 'backfill') {
      const report = await backfillSmartLinks(prisma, { publicBaseUrl: args.publicBaseUrl });
      writeReport(report, args.output);
      if (report.after.activeLegacy.length) {
        console.error(`SMARTLINK_LEGACY_ACTIVE remaining=${report.after.activeLegacy.length}`);
        process.exitCode = 1;
        return;
      }
      console.log(`SMARTLINK_LEGACY_BACKFILL_OK rotated=${report.rotated.length}`);
      if (args.output) console.log(`SMARTLINK_LEGACY_REPORT ${args.output}`);
      return;
    }

    const report = await auditSmartLinks(prisma, { publicBaseUrl: args.publicBaseUrl });
    if (args.output) writeReport(report, args.output);
    if (args.mode === 'guard' && report.activeLegacy.length) {
      console.error(`SMARTLINK_LEGACY_ACTIVE count=${report.activeLegacy.length}`);
      console.error(report.activeLegacy.map((row) => `${row.quoteCode}:${row.oldToken || '<missing-token>'}`).join('\n'));
      process.exitCode = 1;
      return;
    }
    console.log(`SMARTLINK_LEGACY_AUDIT_OK activeLegacy=${report.activeLegacy.length} inactiveLegacy=${report.inactiveLegacy.length} activeSecure=${report.activeSecureCount}`);
    if (args.output) console.log(`SMARTLINK_LEGACY_REPORT ${args.output}`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  SECURE_TOKEN_PATTERN,
  auditSmartLinks,
  backfillSmartLinks,
  isSecureSmartLinkToken,
  main,
};

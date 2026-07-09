const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const appRoot = path.join(repoRoot, 'apps/web/app');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '.next' ? [] : walk(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

function isClientComponent(source) {
  const trimmed = source.replace(/^\uFEFF/, '').trimStart();
  return trimmed.startsWith("'use client'") || trimmed.startsWith('"use client"');
}

function lineOf(source, index) {
  return source.slice(0, index).split('\n').length;
}

function fetchCall(source, fetchIndex) {
  const openIndex = source.indexOf('(', fetchIndex);
  if (openIndex === -1) return source.slice(fetchIndex);
  let depth = 0;
  let quote = '';
  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    const previous = source[index - 1];
    if (quote) {
      if (char === quote && previous !== '\\') quote = '';
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      continue;
    }
    if (char === '(') depth += 1;
    if (char === ')') {
      depth -= 1;
      if (depth === 0) return source.slice(fetchIndex, index + 1);
    }
  }
  return source.slice(fetchIndex);
}

const failures = [];

for (const file of walk(appRoot)) {
  const source = fs.readFileSync(file, 'utf8');
  if (!isClientComponent(source)) continue;
  const relative = path.relative(repoRoot, file).replaceAll(path.sep, '/');
  const matches = source.matchAll(/\bfetch\s*\(/g);
  for (const match of matches) {
    const call = fetchCall(source, match.index);
    if (!/credentials\s*:/.test(call)) failures.push(`${relative}:${lineOf(source, match.index)} raw browser fetch must set credentials explicitly`);
  }
}

if (failures.length) {
  throw new Error(`Browser auth fetch contract failed:\n${failures.join('\n')}`);
}

console.log('TEST_BROWSER_AUTH_FETCH_CONTRACT_OK');

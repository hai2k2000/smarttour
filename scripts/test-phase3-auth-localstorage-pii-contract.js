const fs = require('fs');
const assert = require('assert');

const files = [
  'apps/web/app/usePermissions.tsx',
  'apps/web/app/login/LoginClient.tsx',
  'apps/web/app/profile/ProfileClient.tsx',
  'apps/web/app/security/SecurityClient.tsx',
];

const sensitiveFields = [
  'phone',
  'dateOfBirth',
  'address',
  'identityNo',
  'taxCode',
  'bankAccountNumber',
  'bankAccountName',
  'bankName',
  'maritalStatus',
  'nationality',
  'ethnicity',
  'religion',
];

const permissionsFile = fs.readFileSync('apps/web/app/usePermissions.tsx', 'utf8');
assert(/export function toStoredAuthUser/.test(permissionsFile), 'usePermissions.tsx must export toStoredAuthUser sanitizer');
for (const field of sensitiveFields) {
  assert(!new RegExp(`\\b${field}\\??:`).test(permissionsFile), `Stored auth user type must not include sensitive field ${field}`);
  assert(!new RegExp(`\\b${field}\\s*:`).test(permissionsFile), `toStoredAuthUser must not persist sensitive field ${field}`);
}

for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  const writes = [...source.matchAll(/localStorage\.setItem\('smarttour\.auth\.user',\s*JSON\.stringify\(([^)]*)\)\)/g)];
  for (const write of writes) {
    assert(write[1].includes('toStoredAuthUser'), `${file} must sanitize auth user before localStorage write`);
  }
}

console.log('TEST_PHASE3_AUTH_LOCALSTORAGE_PII_CONTRACT_OK');

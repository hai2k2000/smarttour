const fs = require('fs');

const controller = fs.readFileSync('apps/api/src/modules/auth/auth.controller.ts', 'utf8');
const dtoPath = 'apps/api/src/modules/auth/dto/auth.dto.ts';
const failures = [];

if (!fs.existsSync(dtoPath)) {
  failures.push('auth DTO file is missing');
} else {
  const dto = fs.readFileSync(dtoPath, 'utf8');
  for (const name of [
    'BootstrapAuthDto',
    'LoginAuthDto',
    'ChangePasswordDto',
    'CreateAuthUserDto',
    'UpdateAuthUserDto',
    'CreateAuthRoleDto',
    'UpdateAuthRoleDto',
  ]) {
    if (!dto.includes(`export class ${name}`)) failures.push(`missing DTO class ${name}`);
  }
  for (const token of [
    'IsEmail',
    'IsIn',
    'IsOptional',
    'IsString',
    'MaxLength',
    'MinLength',
    'ArrayNotEmpty',
    'IsArray',
    "['ACTIVE', 'INACTIVE', 'LOCKED']",
    "['ACTIVE', 'INACTIVE']",
  ]) {
    if (!dto.includes(token)) failures.push(`auth DTO validation missing ${token}`);
  }
}

if (!controller.includes("from './dto/auth.dto'")) failures.push('AuthController must import auth DTO classes');
for (const [method, dtoName] of [
  ['bootstrap', 'BootstrapAuthDto'],
  ['login', 'LoginAuthDto'],
  ['changePassword', 'ChangePasswordDto'],
  ['createUser', 'CreateAuthUserDto'],
  ['updateUser', 'UpdateAuthUserDto'],
  ['createRole', 'CreateAuthRoleDto'],
  ['updateRole', 'UpdateAuthRoleDto'],
]) {
  if (!controller.includes(`@Body() dto: ${dtoName}`)) failures.push(`${method} must use ${dtoName}`);
}
if (controller.includes('@Body() dto: Record<string, unknown>')) {
  failures.push('AuthController must not use Record<string, unknown> request bodies');
}

if (failures.length) {
  console.error('FAIL_AUTH_DTO_CONTRACT');
  for (const failure of failures) console.error(failure);
  process.exit(1);
}

console.log('TEST_AUTH_DTO_CONTRACT_OK');

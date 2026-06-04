import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { pbkdf2Sync, randomBytes, timingSafeEqual } from 'crypto';
import { smartTourEnvironment } from '../../config/runtime-env';
import { PrismaService } from '../../database/prisma.service';
import { AuthSessionService } from './auth-session.service';

type AnyRecord = Record<string, unknown>;
type SessionRequest = { headers?: Record<string, string | string[] | undefined>; ip?: string };
type PermissionUser = {
  roles?: Array<{
    role?: {
      status?: string;
      permissions?: Array<{ permission: string }>;
    };
  }>;
};

const DEFAULT_PERMISSIONS = ['*'] as const;
const USER_STATUSES = new Set(['ACTIVE', 'INACTIVE', 'LOCKED']);
const ROLE_STATUSES = new Set(['ACTIVE', 'INACTIVE']);

const SAFE_USER_SELECT = {
  id: true,
  username: true,
  email: true,
  name: true,
  status: true,
  branch: true,
  department: true,
  lastLoginAt: true,
  roles: {
    where: { role: { status: 'ACTIVE' } },
    select: {
      role: {
        select: {
          id: true,
          code: true,
          name: true,
          permissions: { select: { permission: true } },
        },
      },
    },
  },
} satisfies Prisma.UserSelect;

const LOGIN_USER_SELECT = {
  id: true,
  status: true,
  passwordHash: true,
} satisfies Prisma.UserSelect;

const ROLE_MANAGEMENT_SELECT = {
  id: true,
  code: true,
  name: true,
  description: true,
  isSystem: true,
  status: true,
  permissions: {
    select: { id: true, permission: true },
    orderBy: { permission: 'asc' },
  },
  _count: { select: { users: true } },
} satisfies Prisma.RoleSelect;

const ROLE_ASSIGNMENT_SELECT = {
  id: true,
  code: true,
  permissions: { select: { permission: true } },
} satisfies Prisma.RoleSelect;

type SafeUserRow = Prisma.UserGetPayload<{ select: typeof SAFE_USER_SELECT }>;
type RoleAssignment = Prisma.RoleGetPayload<{ select: typeof ROLE_ASSIGNMENT_SELECT }>;

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService, private readonly sessions: AuthSessionService) {}

  async bootstrap(dto: AnyRecord, request?: SessionRequest) {
    this.assertBootstrapEnvironment(dto);
    const email = this.normalizeEmail(dto.email);
    const password = this.requiredSecret(dto.password, 'Cần nhập mật khẩu');
    const name = this.requiredText(dto.name, 'Cần nhập họ tên');
    this.assertPasswordPolicy(password);

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          if ((await tx.user.count()) > 0) throw new UnauthorizedException('Bootstrap đã bị khóa vì hệ thống đã có người dùng');
          const username = await this.resolveUsername(tx, email, dto.username);
          const role = await tx.role.upsert({
            where: { code: 'super_admin' },
            create: {
              id: 'role_super_admin',
              code: 'super_admin',
              name: 'Quản trị hệ thống',
              description: 'Toàn quyền quản trị SmartTour',
              isSystem: true,
              permissions: { create: DEFAULT_PERMISSIONS.map((permission) => ({ permission })) },
            },
            update: {
              name: 'Quản trị hệ thống',
              description: 'Toàn quyền quản trị SmartTour',
              isSystem: true,
              status: 'ACTIVE',
              permissions: {
                deleteMany: {},
                create: DEFAULT_PERMISSIONS.map((permission) => ({ permission })),
              },
            },
          });
          const user = await tx.user.create({
            data: {
              email,
              username,
              name,
              passwordHash: this.hashPassword(password),
              roles: { create: { roleId: role.id } },
            },
            select: SAFE_USER_SELECT,
          });
          await this.audit(tx, user.id, 'BOOTSTRAP', 'User', user.id, {
            environment: smartTourEnvironment(),
            email,
            username,
            roleCodes: ['super_admin'],
          });
          return this.sessionResponse(tx, user.id, request);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      this.handleUniqueConflict(error);
    }
  }

  async login(dto: AnyRecord, request?: SessionRequest) {
    const identifier = this.requiredText(dto.username ?? dto.email, 'Cần nhập tên đăng nhập').toLowerCase();
    const password = this.requiredSecret(dto.password, 'Cần nhập mật khẩu');
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ username: identifier }, { email: identifier }] },
      select: LOGIN_USER_SELECT,
    });
    if (!user) throw new NotFoundException('Không tìm thấy tài khoản');
    if (user.status === 'LOCKED') throw new ForbiddenException('Tài khoản đã bị khóa');
    if (user.status === 'INACTIVE') throw new ForbiddenException('Tài khoản đã ngừng hoạt động');
    if (user.status !== 'ACTIVE') throw new ForbiddenException(`Tài khoản không thể đăng nhập ở trạng thái ${user.status}`);
    if (!this.verifyPassword(password, user.passwordHash)) throw new UnauthorizedException('Mật khẩu không đúng');

    return this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
      await this.audit(tx, user.id, 'LOGIN', 'User', user.id, {});
      return this.sessionResponse(tx, user.id, request);
    });
  }

  async logout(token?: string, actorId?: string) {
    if (!token || !actorId) throw new UnauthorizedException('Thiếu thông tin phiên đăng nhập');
    const session = await this.validateToken(token);
    if (session.user.id !== actorId) throw new UnauthorizedException('Phiên đăng nhập không thuộc người dùng hiện tại');
    await this.prisma.$transaction(async (tx) => {
      await this.sessions.revokeToken(token, tx);
      await this.audit(tx, actorId, 'LOGOUT', 'User', actorId, {});
    });
    return { ok: true };
  }

  async me(token?: string) {
    const session = await this.validateToken(token);
    return this.safeUser(session.user);
  }

  async changePassword(userId: string | undefined, dto: AnyRecord, token?: string, request?: SessionRequest) {
    if (!userId || !token) throw new UnauthorizedException('Thiếu thông tin phiên đăng nhập');
    const session = await this.validateToken(token);
    if (session.user.id !== userId) throw new UnauthorizedException('Phiên đăng nhập không thuộc người dùng hiện tại');
    const currentPassword = this.requiredSecret(dto.currentPassword, 'Cần nhập mật khẩu hiện tại');
    const newPassword = this.requiredSecret(dto.newPassword, 'Cần nhập mật khẩu mới');
    this.assertPasswordPolicy(newPassword);
    if (currentPassword === newPassword) throw new BadRequestException('Mật khẩu mới phải khác mật khẩu hiện tại');

    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: LOGIN_USER_SELECT });
    if (!user || user.status !== 'ACTIVE') throw new UnauthorizedException('Người dùng không hợp lệ');
    if (!this.verifyPassword(currentPassword, user.passwordHash)) throw new UnauthorizedException('Mật khẩu hiện tại không đúng');

    return this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { passwordHash: this.hashPassword(newPassword) } });
      await this.sessions.revokeUserSessions(userId, tx);
      await this.audit(tx, userId, 'CHANGE_PASSWORD', 'User', userId, { sessionsRevoked: 'all' });
      return this.sessionResponse(tx, userId, request);
    });
  }

  async validateToken(token?: string | null) {
    return this.sessions.validateToken(token, { user: { select: SAFE_USER_SELECT } });
  }

  hasPermissions(user: PermissionUser, required: string[]) {
    if (!required.length) return true;
    const permissions = new Set(
      user.roles
        ?.filter((userRole) => !userRole.role?.status || userRole.role.status === 'ACTIVE')
        .flatMap((userRole) => userRole.role?.permissions?.map((row) => row.permission) || []) || [],
    );
    return permissions.has('*') || required.every((permission) => permissions.has(permission));
  }

  async listUsers() {
    const rows = await this.prisma.user.findMany({
      select: SAFE_USER_SELECT,
      orderBy: [{ updatedAt: 'desc' }, { username: 'asc' }, { email: 'asc' }],
    });
    return rows.map((row) => this.safeUser(row));
  }

  async createUser(dto: AnyRecord, actorId?: string) {
    const email = this.normalizeEmail(dto.email);
    const password = this.requiredSecret(dto.password, 'Cần nhập mật khẩu');
    const name = this.requiredText(dto.name, 'Cần nhập họ tên');
    const branch = this.text(dto.branch);
    const department = this.text(dto.department);
    const roleCodes = this.requiredRoleCodes(dto.roleCodes);
    this.assertPasswordPolicy(password);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const roles = await this.resolveActiveRoles(tx, roleCodes);
        this.assertRoleScope(roles, branch, department);
        const username = await this.resolveUsername(tx, email, dto.username);
        const user = await tx.user.create({
          data: {
            email,
            username,
            name,
            passwordHash: this.hashPassword(password),
            branch,
            department,
            roles: { create: roles.map((role) => ({ roleId: role.id })) },
          },
          select: SAFE_USER_SELECT,
        });
        await this.audit(tx, actorId, 'CREATE', 'User', user.id, {
          email,
          username,
          name,
          status: 'ACTIVE',
          branch,
          department,
          roleCodes,
        });
        return this.safeUser(user);
      });
    } catch (error) {
      this.handleUniqueConflict(error);
    }
  }

  async updateUser(id: string, dto: AnyRecord, actorId?: string) {
    const current = await this.prisma.user.findUnique({ where: { id }, select: SAFE_USER_SELECT });
    if (!current) throw new NotFoundException('Không tìm thấy người dùng');

    const roleCodes = dto.roleCodes === undefined ? undefined : this.requiredRoleCodes(dto.roleCodes);
    const nextPassword = dto.password === undefined ? undefined : this.requiredSecret(dto.password, 'Cần nhập mật khẩu');
    const nextStatus = dto.status === undefined ? undefined : this.normalizeStatus(dto.status, USER_STATUSES, 'trạng thái người dùng');
    const nextName = dto.name === undefined ? undefined : this.requiredText(dto.name, 'Cần nhập họ tên');
    const nextBranch = dto.branch === undefined ? current.branch : this.text(dto.branch);
    const nextDepartment = dto.department === undefined ? current.department : this.text(dto.department);
    if (nextPassword) this.assertPasswordPolicy(nextPassword);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const roles = roleCodes ? await this.resolveActiveRoles(tx, roleCodes) : current.roles.map((row) => row.role);
        this.assertRoleScope(roles, nextBranch, nextDepartment);

        let nextUsername: string | undefined;
        if (dto.username !== undefined) {
          nextUsername = this.optionalUsername(dto.username) || undefined;
          if (!nextUsername) throw new BadRequestException('Cần nhập tên đăng nhập');
          await this.assertUsernameAvailable(tx, nextUsername, id);
        }

        if (roleCodes) {
          await tx.userRole.deleteMany({ where: { userId: id } });
          await tx.userRole.createMany({ data: roles.map((role) => ({ userId: id, roleId: role.id })) });
        }

        const user = await tx.user.update({
          where: { id },
          data: {
            ...(nextUsername !== undefined ? { username: nextUsername } : {}),
            ...(nextName !== undefined ? { name: nextName } : {}),
            ...(nextStatus !== undefined ? { status: nextStatus } : {}),
            ...(dto.branch !== undefined ? { branch: nextBranch } : {}),
            ...(dto.department !== undefined ? { department: nextDepartment } : {}),
            ...(nextPassword ? { passwordHash: this.hashPassword(nextPassword) } : {}),
          },
          select: SAFE_USER_SELECT,
        });

        if (nextPassword || (nextStatus !== undefined && nextStatus !== 'ACTIVE')) {
          await this.sessions.revokeUserSessions(id, tx);
        }
        await this.audit(tx, actorId, 'UPDATE', 'User', id, {
          changedFields: this.changedFields(dto, ['username', 'name', 'status', 'branch', 'department', 'password', 'roleCodes']),
          oldStatus: current.status,
          newStatus: user.status,
          roleCodes: roleCodes || current.roles.map((row) => row.role.code),
          sessionsRevoked: Boolean(nextPassword || (nextStatus !== undefined && nextStatus !== 'ACTIVE')),
        });
        return this.safeUser(user);
      });
    } catch (error) {
      this.handleUniqueConflict(error);
    }
  }

  async listRoles() {
    return this.prisma.role.findMany({
      select: ROLE_MANAGEMENT_SELECT,
      orderBy: [{ isSystem: 'desc' }, { code: 'asc' }],
    });
  }

  async createRole(dto: AnyRecord, actorId?: string) {
    const code = this.normalizeRoleCode(dto.code);
    const name = this.requiredText(dto.name, 'Cần nhập tên vai trò');
    const description = this.text(dto.description);
    const permissions = this.requiredPermissions(dto.permissions);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const role = await tx.role.create({
          data: {
            code,
            name,
            description,
            permissions: { create: permissions.map((permission) => ({ permission })) },
          },
          select: ROLE_MANAGEMENT_SELECT,
        });
        await this.audit(tx, actorId, 'CREATE', 'Role', role.id, { code, name, permissions });
        return role;
      });
    } catch (error) {
      this.handleUniqueConflict(error);
    }
  }

  async updateRole(id: string, dto: AnyRecord, actorId?: string) {
    const current = await this.prisma.role.findUnique({ where: { id }, select: ROLE_MANAGEMENT_SELECT });
    if (!current) throw new NotFoundException('Không tìm thấy vai trò');
    const permissions = dto.permissions === undefined ? undefined : this.requiredPermissions(dto.permissions);
    const nextName = dto.name === undefined ? undefined : this.requiredText(dto.name, 'Cần nhập tên vai trò');
    const nextStatus = dto.status === undefined ? undefined : this.normalizeStatus(dto.status, ROLE_STATUSES, 'trạng thái vai trò');
    if (current.isSystem && nextStatus === 'INACTIVE') throw new BadRequestException('Không thể ngừng hoạt động vai trò hệ thống');
    if (current.code === 'super_admin' && permissions && !permissions.includes('*')) {
      throw new BadRequestException('Vai trò super_admin phải giữ quyền toàn hệ thống (*)');
    }

    return this.prisma.$transaction(async (tx) => {
      if (permissions) {
        await tx.rolePermission.deleteMany({ where: { roleId: id } });
        await tx.rolePermission.createMany({ data: permissions.map((permission) => ({ roleId: id, permission })) });
      }
      const role = await tx.role.update({
        where: { id },
        data: {
          ...(nextName !== undefined ? { name: nextName } : {}),
          ...(dto.description !== undefined ? { description: this.text(dto.description) } : {}),
          ...(nextStatus !== undefined ? { status: nextStatus } : {}),
        },
        select: ROLE_MANAGEMENT_SELECT,
      });
      await this.audit(tx, actorId, 'UPDATE', 'Role', id, {
        code: current.code,
        changedFields: this.changedFields(dto, ['name', 'description', 'status', 'permissions']),
        oldStatus: current.status,
        newStatus: role.status,
        permissions: permissions || current.permissions.map((permission) => permission.permission),
      });
      return role;
    });
  }

  private async sessionResponse(tx: Prisma.TransactionClient, userId: string, request?: SessionRequest) {
    const { token, expiresAt } = await this.sessions.issueSession(tx, userId, request);
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: SAFE_USER_SELECT });
    return { token, tokenType: 'Bearer', expiresAt, user: this.safeUser(user) };
  }

  private assertBootstrapEnvironment(dto: AnyRecord) {
    const environment = smartTourEnvironment();
    const configuredKey = this.text(process.env.SMARTTOUR_BOOTSTRAP_KEY);
    const providedKey = this.text(dto.bootstrapKey);
    if ((environment === 'production' || environment === 'staging') && !configuredKey) {
      throw new UnauthorizedException(`Bootstrap chưa được cấu hình an toàn cho môi trường ${environment}`);
    }
    if (configuredKey && (!providedKey || !this.secureEqual(providedKey, configuredKey))) {
      throw new UnauthorizedException('Bootstrap key không hợp lệ');
    }
  }

  private assertPasswordPolicy(password: string) {
    if (password.length < 8) throw new BadRequestException('Mật khẩu phải có ít nhất 8 ký tự');
    if (password.length > 128) throw new BadRequestException('Mật khẩu không được vượt quá 128 ký tự');
  }

  private hashPassword(password: string) {
    const salt = randomBytes(16).toString('base64url');
    const iterations = 310000;
    const hash = pbkdf2Sync(password, salt, iterations, 32, 'sha256').toString('base64url');
    return `pbkdf2$${iterations}$${salt}$${hash}`;
  }

  private verifyPassword(password: string, stored: string) {
    const [scheme, iterations, salt, hash] = stored.split('$');
    if (scheme !== 'pbkdf2' || !iterations || !salt || !hash) return false;
    const candidate = pbkdf2Sync(password, salt, Number(iterations), 32, 'sha256');
    const expected = Buffer.from(hash, 'base64url');
    return expected.length === candidate.length && timingSafeEqual(expected, candidate);
  }

  private safeUser(user: SafeUserRow) {
    const roles = user.roles.map((row) => ({ code: row.role.code, name: row.role.name }));
    const permissions = Array.from(new Set(user.roles.flatMap((row) => row.role.permissions.map((permission) => permission.permission)))).sort();
    const dataScope = permissions.includes('*') || permissions.includes('data.scope.all')
      ? 'all'
      : permissions.includes('data.scope.branch')
        ? 'branch'
        : permissions.includes('data.scope.department')
          ? 'department'
          : 'none';
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      name: user.name,
      status: user.status,
      branch: user.branch,
      department: user.department,
      dataScope,
      lastLoginAt: user.lastLoginAt,
      roles,
      permissions,
    };
  }

  private async resolveActiveRoles(tx: Prisma.TransactionClient, roleCodes: string[]) {
    const roles = await tx.role.findMany({
      where: { code: { in: roleCodes }, status: 'ACTIVE' },
      select: ROLE_ASSIGNMENT_SELECT,
    });
    if (roles.length !== roleCodes.length) {
      const found = new Set(roles.map((role) => role.code));
      const invalid = roleCodes.filter((code) => !found.has(code));
      throw new BadRequestException(`Vai trò không tồn tại hoặc đã ngừng hoạt động: ${invalid.join(', ')}`);
    }
    return roles;
  }

  private assertRoleScope(roles: RoleAssignment[], branch: string | null, department: string | null) {
    const permissions = new Set(roles.flatMap((role) => role.permissions.map((permission) => permission.permission)));
    if (permissions.has('*') || permissions.has('data.scope.all')) return;
    if (permissions.has('data.scope.branch') && !branch) throw new BadRequestException('Cần nhập chi nhánh cho vai trò có phạm vi theo chi nhánh');
    if (permissions.has('data.scope.department') && !department) throw new BadRequestException('Cần nhập phòng ban cho vai trò có phạm vi theo phòng ban');
  }

  private async resolveUsername(tx: Prisma.TransactionClient, email: string, value: unknown) {
    const requested = this.optionalUsername(value);
    if (requested) {
      await this.assertUsernameAvailable(tx, requested);
      return requested;
    }
    const base = this.usernameFromEmail(email);
    for (let index = 1; index <= 1000; index += 1) {
      const suffix = index === 1 ? '' : `-${index}`;
      const candidate = `${base.slice(0, 50 - suffix.length)}${suffix}`;
      const exists = await tx.user.findUnique({ where: { username: candidate }, select: { id: true } });
      if (!exists) return candidate;
    }
    throw new ConflictException('Không thể tạo tên đăng nhập duy nhất');
  }

  private async assertUsernameAvailable(tx: Prisma.TransactionClient, username: string, excludeUserId?: string) {
    const existing = await tx.user.findFirst({
      where: { username, ...(excludeUserId ? { id: { not: excludeUserId } } : {}) },
      select: { id: true },
    });
    if (existing) throw new ConflictException('Tên đăng nhập đã tồn tại');
  }

  private optionalUsername(value: unknown) {
    const text = this.text(value);
    if (!text) return null;
    const username = text.toLowerCase();
    if (!/^[a-z0-9][a-z0-9._-]{2,49}$/.test(username)) {
      throw new BadRequestException('Tên đăng nhập phải dài 3-50 ký tự, bắt đầu bằng chữ hoặc số và chỉ gồm chữ thường không dấu, số, dấu chấm, gạch dưới hoặc gạch ngang');
    }
    return username;
  }

  private usernameFromEmail(email: string) {
    const local = email.split('@')[0].toLowerCase().replace(/[^a-z0-9._-]/g, '').replace(/^[._-]+/, '');
    const candidate = local.length >= 3 ? local : `user-${local || 'account'}`;
    return candidate.slice(0, 50);
  }

  private normalizeEmail(value: unknown) {
    const email = this.requiredText(value, 'Cần nhập email').toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException('Email không đúng định dạng');
    return email;
  }

  private normalizeRoleCode(value: unknown) {
    const code = this.requiredText(value, 'Cần nhập mã vai trò').toLowerCase();
    if (!/^[a-z][a-z0-9._-]{2,63}$/.test(code)) {
      throw new BadRequestException('Mã vai trò phải dài 3-64 ký tự, bắt đầu bằng chữ thường và chỉ gồm chữ thường, số, dấu chấm, gạch dưới hoặc gạch ngang');
    }
    return code;
  }

  private normalizeStatus(value: unknown, allowed: Set<string>, label: string) {
    const status = this.requiredText(value, `Cần nhập ${label}`).toUpperCase();
    if (!allowed.has(status)) throw new BadRequestException(`${label} không hợp lệ: ${status}`);
    return status;
  }

  private requiredPermissions(value: unknown) {
    const permissions = this.requiredStringArray(value, 'Vai trò phải có ít nhất một quyền');
    const invalid = permissions.filter((permission) => permission !== '*' && !/^[a-z][a-z0-9_-]*(?:\.[a-z0-9_*_-]+)+$/.test(permission));
    if (invalid.length) throw new BadRequestException(`Quyền không hợp lệ: ${invalid.join(', ')}`);
    return permissions;
  }

  private requiredRoleCodes(value: unknown) {
    const roleCodes = this.requiredStringArray(value, 'Người dùng phải có ít nhất một vai trò').map((code) => this.normalizeRoleCode(code));
    return Array.from(new Set(roleCodes));
  }

  private requiredStringArray(value: unknown, message: string) {
    const rows = this.stringArray(value);
    if (!rows.length) throw new BadRequestException(message);
    return rows;
  }

  private stringArray(value: unknown) {
    return Array.isArray(value) ? Array.from(new Set(value.map((item) => String(item).trim()).filter(Boolean))) : [];
  }

  private changedFields(dto: AnyRecord, allowed: string[]) {
    return allowed.filter((field) => dto[field] !== undefined);
  }

  private secureEqual(left: string, right: string) {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
  }

  private text(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private requiredText(value: unknown, message: string) {
    const text = this.text(value);
    if (!text) throw new BadRequestException(message);
    return text;
  }

  private requiredSecret(value: unknown, message: string) {
    if (typeof value !== 'string' || !value.trim()) throw new BadRequestException(message);
    return value;
  }

  private handleUniqueConflict(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const target = Array.isArray(error.meta?.target) ? error.meta.target.join(', ') : String(error.meta?.target || 'dữ liệu');
      throw new ConflictException(`Giá trị đã tồn tại: ${target}`);
    }
    throw error;
  }

  private async audit(tx: Prisma.TransactionClient, actorId: string | undefined, action: string, entity: string, entityId?: string, metadata?: unknown) {
    await tx.auditLog.create({
      data: {
        actorId,
        action,
        entity,
        entityId,
        metadata: metadata === undefined ? undefined : (metadata as Prisma.InputJsonValue),
      },
    });
  }
}

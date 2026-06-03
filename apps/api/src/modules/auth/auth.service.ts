import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, pbkdf2Sync, randomBytes, timingSafeEqual } from 'crypto';
import { PrismaService } from '../../database/prisma.service';

type AnyRecord = Record<string, unknown>;

const DEFAULT_PERMISSIONS = [
  '*',
  'auth.user.manage',
  'auth.role.manage',
  'data.scope.all',
  'finance.receipt.approve',
  'finance.payment.approve',
  'finance.invoice.approve',
  'operation.form.manage',
  'operation.payment-request.approve',
  'order.manage',
  'supplier.manage',
  'customer.manage',
  'file.manage',
];

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async bootstrap(dto: AnyRecord, request?: { headers?: Record<string, string | string[] | undefined>; ip?: string }) {
    const userCount = await this.prisma.user.count();
    const bootstrapKey = process.env.SMARTTOUR_BOOTSTRAP_KEY;
    if (userCount > 0 && (!bootstrapKey || this.text(dto.bootstrapKey) !== bootstrapKey)) {
      throw new UnauthorizedException('Bootstrap đã bị khóa');
    }
    const email = this.requiredText(dto.email, 'Cần nhập email').toLowerCase();
    const username = this.optionalUsername(dto.username) || this.usernameFromEmail(email);
    const password = this.requiredText(dto.password, 'Cần nhập mật khẩu');
    const name = this.requiredText(dto.name, 'Cần nhập họ tên');
    this.assertPasswordPolicy(password);
    return this.prisma.$transaction(async (tx) => {
      const role = await tx.role.upsert({
        where: { code: 'super_admin' },
        create: {
          id: 'role_super_admin',
          code: 'super_admin',
          name: 'Super Admin',
          description: 'Toàn quyền quản trị SmartTour',
          isSystem: true,
          permissions: { create: DEFAULT_PERMISSIONS.map((permission) => ({ permission })) },
        },
        update: { status: 'ACTIVE' },
      });
      const user = await tx.user.upsert({
        where: { email },
        create: {
          email,
          username,
          name,
          passwordHash: this.hashPassword(password),
          roles: { create: { roleId: role.id } },
        },
        update: {
          username,
          name,
          passwordHash: this.hashPassword(password),
          status: 'ACTIVE',
          roles: { connectOrCreate: { where: { userId_roleId: { userId: await this.userIdByEmail(tx, email), roleId: role.id } }, create: { roleId: role.id } } },
        },
        include: this.userInclude(),
      });
      await this.audit(tx, user.id, 'BOOTSTRAP', 'User', user.id, { email });
      return this.issueSession(tx, user.id, request);
    });
  }

  async login(dto: AnyRecord, request?: { headers?: Record<string, string | string[] | undefined>; ip?: string }) {
    const identifier = this.requiredText(dto.username ?? dto.email, 'Cần nhập tên đăng nhập').toLowerCase();
    const password = this.requiredText(dto.password, 'Cần nhập mật khẩu');
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ username: identifier }, { email: identifier }] },
      include: this.userInclude(),
    });
    if (!user || user.status !== 'ACTIVE' || !this.verifyPassword(password, user.passwordHash)) throw new UnauthorizedException('Tên đăng nhập hoặc mật khẩu không đúng');
    return this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
      await this.audit(tx, user.id, 'LOGIN', 'User', user.id, {});
      return this.issueSession(tx, user.id, request);
    });
  }

  async logout(token?: string, actorId?: string) {
    if (!token) return { ok: true };
    await this.prisma.userSession.updateMany({ where: { tokenHash: this.tokenHash(token), revokedAt: null }, data: { revokedAt: new Date() } });
    if (actorId) await this.prisma.auditLog.create({ data: { actorId, action: 'LOGOUT', entity: 'User', entityId: actorId } });
    return { ok: true };
  }

  async me(token?: string) {
    const session = await this.validateToken(token);
    return this.safeUser(session.user);
  }

  async changePassword(userId: string | undefined, dto: AnyRecord, token?: string) {
    if (!userId) throw new UnauthorizedException('Thiếu thông tin người dùng');
    const currentPassword = this.requiredText(dto.currentPassword, 'Cần nhập mật khẩu hiện tại');
    const newPassword = this.requiredText(dto.newPassword, 'Cần nhập mật khẩu mới');
    this.assertPasswordPolicy(newPassword);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !this.verifyPassword(currentPassword, user.passwordHash)) throw new UnauthorizedException('Mật khẩu hiện tại không đúng');
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { passwordHash: this.hashPassword(newPassword) } });
      if (token) await tx.userSession.updateMany({ where: { userId, tokenHash: { not: this.tokenHash(token) }, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit(tx, userId, 'CHANGE_PASSWORD', 'User', userId, {});
    });
    return { ok: true };
  }

  private assertPasswordPolicy(password: string) {
    if (password.length < 8) throw new BadRequestException('Mật khẩu phải có ít nhất 8 ký tự');
  }

  async validateToken(token?: string | null) {
    if (!token) throw new UnauthorizedException('Thiếu token đăng nhập');
    const session = await this.prisma.userSession.findFirst({
      where: { tokenHash: this.tokenHash(token), revokedAt: null, expiresAt: { gt: new Date() } },
      include: { user: { include: this.userInclude() } },
    });
    if (!session || session.user.status !== 'ACTIVE') throw new UnauthorizedException('Phiên đăng nhập không hợp lệ');
    return session;
  }

  hasPermissions(user: { roles?: Array<{ role?: { permissions?: Array<{ permission: string }> } }> }, required: string[]) {
    const permissions = new Set(user.roles?.flatMap((userRole) => userRole.role?.permissions?.map((row) => row.permission) || []) || []);
    return permissions.has('*') || required.every((permission) => permissions.has(permission));
  }

  async listUsers() {
    const rows = await this.prisma.user.findMany({ include: this.userInclude(), orderBy: [{ updatedAt: 'desc' }, { username: 'asc' }, { email: 'asc' }] });
    return rows.map((row) => this.safeUser(row));
  }

  async createUser(dto: AnyRecord) {
    const email = this.requiredText(dto.email, 'Cần nhập email').toLowerCase();
    const username = this.optionalUsername(dto.username) || this.usernameFromEmail(email);
    const password = this.requiredText(dto.password, 'Cần nhập mật khẩu');
    this.assertPasswordPolicy(password);
    const roleCodes = this.stringArray(dto.roleCodes);
    return this.prisma.$transaction(async (tx) => {
      const roles = roleCodes.length ? await tx.role.findMany({ where: { code: { in: roleCodes }, status: 'ACTIVE' } }) : [];
      if (roleCodes.length !== roles.length) throw new NotFoundException('Không tìm thấy vai trò');
      const user = await tx.user.create({
        data: {
          email,
          username,
          name: this.requiredText(dto.name, 'Cần nhập họ tên'),
          passwordHash: this.hashPassword(password),
          branch: this.text(dto.branch),
          department: this.text(dto.department),
          roles: { create: roles.map((role) => ({ roleId: role.id })) },
        },
        include: this.userInclude(),
      });
      await this.audit(tx, undefined, 'CREATE', 'User', user.id, { email, roleCodes });
      return this.safeUser(user);
    });
  }

  async updateUser(id: string, dto: AnyRecord) {
    const current = await this.prisma.user.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Không tìm thấy người dùng');
    const roleCodes = dto.roleCodes === undefined ? undefined : this.stringArray(dto.roleCodes);
    const nextPassword = dto.password ? this.requiredText(dto.password, 'Cần nhập mật khẩu') : undefined;
    if (nextPassword) this.assertPasswordPolicy(nextPassword);
    return this.prisma.$transaction(async (tx) => {
      if (roleCodes) {
        const roles = await tx.role.findMany({ where: { code: { in: roleCodes }, status: 'ACTIVE' } });
        if (roleCodes.length !== roles.length) throw new NotFoundException('Không tìm thấy vai trò');
        await tx.userRole.deleteMany({ where: { userId: id } });
        if (roles.length) await tx.userRole.createMany({ data: roles.map((role) => ({ userId: id, roleId: role.id })) });
      }
      const user = await tx.user.update({
        where: { id },
        data: {
          ...(dto.username !== undefined ? { username: this.optionalUsername(dto.username) } : {}),
          ...(dto.name !== undefined ? { name: this.requiredText(dto.name, 'Cần nhập họ tên') } : {}),
          ...(dto.status !== undefined ? { status: this.requiredText(dto.status, 'Cần nhập trạng thái') } : {}),
          ...(dto.branch !== undefined ? { branch: this.text(dto.branch) } : {}),
          ...(dto.department !== undefined ? { department: this.text(dto.department) } : {}),
          ...(nextPassword ? { passwordHash: this.hashPassword(nextPassword) } : {}),
        },
        include: this.userInclude(),
      });
      await this.audit(tx, undefined, 'UPDATE', 'User', id, { roleCodes });
      return this.safeUser(user);
    });
  }

  async listRoles() {
    return this.prisma.role.findMany({ include: { permissions: { orderBy: { permission: 'asc' } }, _count: { select: { users: true } } }, orderBy: [{ isSystem: 'desc' }, { code: 'asc' }] });
  }

  async createRole(dto: AnyRecord) {
    const permissions = this.stringArray(dto.permissions);
    return this.prisma.role.create({
      data: {
        code: this.requiredText(dto.code, 'Cần nhập mã'),
        name: this.requiredText(dto.name, 'Cần nhập họ tên'),
        description: this.text(dto.description),
        permissions: { create: permissions.map((permission) => ({ permission })) },
      },
      include: { permissions: true },
    });
  }

  async updateRole(id: string, dto: AnyRecord) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundException('Không tìm thấy vai trò');
    const permissions = dto.permissions === undefined ? undefined : this.stringArray(dto.permissions);
    return this.prisma.$transaction(async (tx) => {
      if (permissions) {
        await tx.rolePermission.deleteMany({ where: { roleId: id } });
        if (permissions.length) await tx.rolePermission.createMany({ data: permissions.map((permission) => ({ roleId: id, permission })) });
      }
      return tx.role.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: this.requiredText(dto.name, 'Cần nhập họ tên') } : {}),
          ...(dto.description !== undefined ? { description: this.text(dto.description) } : {}),
          ...(dto.status !== undefined ? { status: this.requiredText(dto.status, 'Cần nhập trạng thái') } : {}),
        },
        include: { permissions: true },
      });
    });
  }

  private async issueSession(tx: Prisma.TransactionClient, userId: string, request?: { headers?: Record<string, string | string[] | undefined>; ip?: string }) {
    const token = `${randomBytes(32).toString('base64url')}.${randomBytes(32).toString('base64url')}`;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + Number(process.env.SMARTTOUR_SESSION_DAYS || 14));
    await tx.userSession.create({
      data: {
        userId,
        tokenHash: this.tokenHash(token),
        expiresAt,
        userAgent: this.header(request, 'user-agent'),
        ipAddress: request?.ip,
      },
    });
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, include: this.userInclude() });
    return { token, expiresAt, user: this.safeUser(user) };
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

  private tokenHash(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private userInclude() {
    return { roles: { include: { role: { include: { permissions: true } } } } } satisfies Prisma.UserInclude;
  }

  private safeUser(user: Prisma.UserGetPayload<{ include: ReturnType<AuthService['userInclude']> }>) {
    const roles = user.roles.map((row) => ({ code: row.role.code, name: row.role.name }));
    const permissions = Array.from(new Set(user.roles.flatMap((row) => row.role.permissions.map((permission) => permission.permission)))).sort();
    const dataScope = permissions.includes('*') || permissions.includes('data.scope.all') ? 'all' : permissions.includes('data.scope.branch') ? 'branch' : permissions.includes('data.scope.department') ? 'department' : 'none';
    return { id: user.id, username: user.username, email: user.email, name: user.name, status: user.status, branch: user.branch, department: user.department, dataScope, lastLoginAt: user.lastLoginAt, roles, permissions };
  }

  private optionalUsername(value: unknown) {
    const text = this.text(value);
    if (!text) return null;
    return text.toLowerCase().replace(/[^a-z0-9._-]/g, '');
  }

  private usernameFromEmail(email: string) {
    return email.split('@')[0].toLowerCase().replace(/[^a-z0-9._-]/g, '');
  }

  private async userIdByEmail(tx: Prisma.TransactionClient, email: string) {
    const user = await tx.user.findUnique({ where: { email }, select: { id: true } });
    return user?.id || '__new_user__';
  }

  private async audit(tx: Prisma.TransactionClient, actorId: string | undefined, action: string, entity: string, entityId: string, metadata?: unknown) {
    await tx.auditLog.create({ data: { actorId, action, entity, entityId, metadata: metadata === undefined ? undefined : (metadata as Prisma.InputJsonValue) } });
  }

  private header(request: { headers?: Record<string, string | string[] | undefined> } | undefined, name: string) {
    const value = request?.headers?.[name];
    return Array.isArray(value) ? value.join(', ') : value;
  }

  private stringArray(value: unknown) {
    return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
  }

  private text(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private requiredText(value: unknown, message: string) {
    const text = this.text(value);
    if (!text) throw new BadRequestException(message);
    return text;
  }
}

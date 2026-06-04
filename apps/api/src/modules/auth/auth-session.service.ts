import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../database/prisma.service';

type SessionRequest = { headers?: Record<string, string | string[] | undefined>; ip?: string };

@Injectable()
export class AuthSessionService {
  constructor(private readonly prisma: PrismaService) {}

  async issueSession(tx: Prisma.TransactionClient, userId: string, request?: SessionRequest) {
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
    return { token, expiresAt };
  }

  async validateToken(token?: string | null, include?: Prisma.UserSessionInclude) {
    if (!token) throw new UnauthorizedException('Thiếu token đăng nhập');
    const session = await this.prisma.userSession.findFirst({
      where: { tokenHash: this.tokenHash(token), revokedAt: null, expiresAt: { gt: new Date() } },
      include,
    });
    const row = session as any;
    if (!row || (row.user && row.user.status !== 'ACTIVE')) {
      throw new UnauthorizedException('Phiên đăng nhập không hợp lệ');
    }
    return row;
  }

  async revokeToken(token?: string, tx?: Prisma.TransactionClient) {
    if (!token) return;
    const client = tx || this.prisma;
    await client.userSession.updateMany({ where: { tokenHash: this.tokenHash(token), revokedAt: null }, data: { revokedAt: new Date() } });
  }

  async revokeOtherUserSessions(userId: string, token?: string, tx?: Prisma.TransactionClient) {
    if (!token) return this.revokeUserSessions(userId, tx);
    const client = tx || this.prisma;
    await client.userSession.updateMany({
      where: { userId, tokenHash: { not: this.tokenHash(token) }, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeUserSessions(userId: string, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    await client.userSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  tokenHash(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private header(request: SessionRequest | undefined, name: string) {
    const value = request?.headers?.[name];
    return Array.isArray(value) ? value.join(', ') : value;
  }
}

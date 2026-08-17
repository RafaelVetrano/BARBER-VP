import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { TokenAudience as PrismaTokenAudience, type AuthSession } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import { CONFIG, type AppConfig } from '../../config/configuration';
import { PrismaService } from '../../prisma/prisma.service';
import { hashSecret, randomSecret, secretMatches } from '../crypto/secret-hash';
import { parseTtlSeconds } from './access-token.service';

export interface IssueSessionInput {
  audience: PrismaTokenAudience;
  userId?: string;
  clientId?: string;
  tenantId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  /** Continua a mesma família numa rotação; ausente = login novo. */
  familyId?: string;
}

export interface IssuedSession {
  session: AuthSession;
  /** Valor que vai no cookie httpOnly: `<id>.<segredo>`. */
  refreshToken: string;
  expiresAt: Date;
}

export type RefreshOutcome =
  | { ok: true; session: AuthSession }
  | { ok: false; reason: 'malformed' | 'not-found' | 'expired' | 'reused' };

/**
 * Ciclo de vida das sessões de refresh.
 *
 * O refresh é opaco (`<sessionId>.<segredo>`) e só o HMAC do segredo é
 * persistido. Cada uso ROTACIONA: a linha atual é revogada com
 * `revokedReason='rotated'` e aponta `replacedById` para a nova.
 *
 * Reuso ⇒ comprometimento. Se um refresh já revogado voltar, o token vazou (ou
 * o legítimo e o ladrão estão alternando), então a família inteira cai e as
 * duas partes precisam logar de novo. É a recomendação do RFC 6819 §5.2.2.3.
 */
@Injectable()
export class SessionService {
  private readonly ttlSeconds: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {
    this.logger.setContext(SessionService.name);
    this.ttlSeconds = parseTtlSeconds(config.jwt.refreshTtl);
  }

  get refreshTtlSeconds(): number {
    return this.ttlSeconds;
  }

  async issue(input: IssueSessionInput): Promise<IssuedSession> {
    const secret = randomSecret();
    const expiresAt = new Date(Date.now() + this.ttlSeconds * 1_000);

    const session = await this.prisma.authSession.create({
      data: {
        audience: input.audience,
        userId: input.userId ?? null,
        clientId: input.clientId ?? null,
        tenantId: input.tenantId ?? null,
        refreshHash: this.hash(secret),
        familyId: input.familyId ?? randomUUID(),
        expiresAt,
        ip: input.ip ?? null,
        userAgent: input.userAgent?.slice(0, 512) ?? null,
      },
    });

    return { session, refreshToken: `${session.id}.${secret}`, expiresAt };
  }

  /**
   * Valida o refresh recebido. NÃO rotaciona — quem chama decide o que emitir a
   * seguir (o seletor de contexto, por exemplo, emite com outro tenant).
   */
  async validate(refreshToken: string, audience: PrismaTokenAudience): Promise<RefreshOutcome> {
    const separator = refreshToken.indexOf('.');
    if (separator <= 0) {
      return { ok: false, reason: 'malformed' };
    }

    const sessionId = refreshToken.slice(0, separator);
    const secret = refreshToken.slice(separator + 1);

    const session = await this.prisma.authSession.findFirst({
      where: { id: sessionId, audience },
    });

    if (!session || !secretMatches(secret, session.refreshHash, this.pepper)) {
      return { ok: false, reason: 'not-found' };
    }

    if (session.revokedAt) {
      // Token já rotacionado reaparecendo: derruba a família inteira.
      await this.revokeFamily(session.familyId, 'reuse');
      this.logger.warn(
        { familyId: session.familyId, sessionId: session.id },
        'refresh token reutilizado — família revogada',
      );
      return { ok: false, reason: 'reused' };
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      return { ok: false, reason: 'expired' };
    }

    return { ok: true, session };
  }

  /** Revoga a sessão atual e emite a próxima da mesma família, em transação. */
  async rotate(
    current: AuthSession,
    overrides: { tenantId?: string | null; ip?: string | null; userAgent?: string | null } = {},
  ): Promise<IssuedSession> {
    const secret = randomSecret();
    const expiresAt = new Date(Date.now() + this.ttlSeconds * 1_000);

    const session = await this.prisma.$transaction(async (tx) => {
      const next = await tx.authSession.create({
        data: {
          audience: current.audience,
          userId: current.userId,
          clientId: current.clientId,
          tenantId: overrides.tenantId !== undefined ? overrides.tenantId : current.tenantId,
          refreshHash: this.hash(secret),
          familyId: current.familyId,
          expiresAt,
          ip: overrides.ip ?? current.ip,
          userAgent: overrides.userAgent?.slice(0, 512) ?? current.userAgent,
        },
      });

      await tx.authSession.update({
        where: { id: current.id },
        data: { revokedAt: new Date(), revokedReason: 'rotated', replacedById: next.id },
      });

      return next;
    });

    return { session, refreshToken: `${session.id}.${secret}`, expiresAt };
  }

  async revoke(sessionId: string, reason: string): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  async revokeFamily(familyId: string, reason: string): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  /** Usado na troca de senha: toda sessão viva do dono cai, menos a atual. */
  async revokeAllForUser(userId: string, reason: string, exceptSessionId?: string): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: { userId, revokedAt: null, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  async revokeAllForClient(clientId: string, reason: string, exceptSessionId?: string): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: {
        clientId,
        revokedAt: null,
        ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
      },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  /** Confirma que a sessão do access token continua viva (logout tem efeito imediato). */
  async isActive(sessionId: string): Promise<boolean> {
    const session = await this.prisma.authSession.findFirst({
      where: { id: sessionId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true },
    });
    return session !== null;
  }

  async touch(sessionId: string): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: { id: sessionId },
      data: { lastUsedAt: new Date() },
    });
  }

  private get pepper(): string {
    return this.config.jwt.refreshSecret;
  }

  private hash(secret: string): string {
    return hashSecret(secret, this.pepper);
  }
}

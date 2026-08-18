import { Inject, Injectable } from '@nestjs/common';
import {
  MembershipRole,
  TenantStatus,
  TokenAudience as PrismaTokenAudience,
  type Prisma,
} from '@prisma/client';
import {
  DEFAULT_BUSINESS_HOURS,
  ErrorCode,
  Role,
  TokenAudience,
  initialsFromName,
  maskEmailForDisplay,
  normalizeMobilePhone,
  type AuthMembership,
  type AuthUser,
  type EmailCheckResult,
  type EstablishmentSession,
} from '@barbervp/types';
import { PinoLogger } from 'nestjs-pino';
import { CONFIG, type AppConfig } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { ApiException } from '../common/errors/api.exception';
import { AuditAction, AuditService, clientIp } from '../audit/audit.service';
import { MAIL_ADAPTER, type MailAdapter } from '../adapters/mail/mail.adapter';
import { SlugService } from '../tenants/slug.service';
import { PasswordService } from './crypto/password.service';
import { hashSecret, randomSecret, secretMatches } from './crypto/secret-hash';
import { AccessTokenService } from './tokens/access-token.service';
import { SessionService } from './tokens/session.service';
import type {
  ChangePasswordDto,
  LinkClientAccountDto,
  LoginEstablishmentDto,
  RegisterEstablishmentDto,
} from './dto/establishment-auth.dto';
import type { RequestContext } from '../common/types/request-context';
import type { AuthPrincipal } from '../common/types/request-context';

/** Par emitido: o access vai no corpo, o refresh no cookie httpOnly. */
export interface IssuedAuth {
  session: EstablishmentSession;
  refreshToken: string;
  refreshExpiresAt: Date;
}

const USER_WITH_MEMBERSHIPS = {
  id: true,
  name: true,
  email: true,
  phone: true,
  passwordHash: true,
  active: true,
  isSuperAdmin: true,
  client: { select: { id: true } },
  memberships: {
    where: { active: true, tenant: { deletedAt: null } },
    select: {
      role: true,
      tenant: {
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          settings: { select: { onboardingStep: true, onboardingDoneAt: true } },
        },
      },
    },
  },
} satisfies Prisma.UserSelect;

type UserWithMemberships = Prisma.UserGetPayload<{ select: typeof USER_WITH_MEMBERSHIPS }>;

@Injectable()
export class EstablishmentAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly accessTokens: AccessTokenService,
    private readonly sessions: SessionService,
    private readonly slugs: SlugService,
    private readonly audit: AuditService,
    private readonly logger: PinoLogger,
    @Inject(CONFIG) private readonly config: AppConfig,
    @Inject(MAIL_ADAPTER) private readonly mail: MailAdapter,
  ) {
    this.logger.setContext(EstablishmentAuthService.name);
  }

  // ── Cadastro ──────────────────────────────────────────────────────────────

  /**
   * Os três estados do campo de e-mail do Cadastro Estabelecimento.
   *
   * Sim, isto revela se um e-mail tem conta — mas a própria tela do protótipo
   * depende disso para oferecer o vínculo, e o cadastro revelaria o mesmo no
   * submit. A mitigação é o rate limit da rota, não esconder o que a UI mostra.
   */
  async checkEmail(email: string): Promise<EmailCheckResult> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (user) {
      return { status: 'establishment' };
    }

    const client = await this.prisma.client.findFirst({
      where: { email, deletedAt: null, passwordHash: { not: null } },
      select: { name: true, email: true, userId: true },
    });

    // Cliente que JÁ virou dono não oferece vínculo de novo — cai no fluxo
    // normal, que vai bater na unicidade de e-mail do `User`.
    if (client?.email && !client.userId) {
      return {
        status: 'client',
        account: {
          name: client.name,
          emailMasked: maskEmailForDisplay(client.email),
          initials: initialsFromName(client.name),
        },
      };
    }

    return { status: 'available' };
  }

  /**
   * Registro de barbearia: `User` + `Tenant` (TRIAL) + `Membership` OWNER +
   * `TenantSettings` + horários padrão + o `Barber` do próprio dono, tudo em
   * UMA transação (regra 4). Ou nasce inteiro, ou não nasce.
   */
  async register(dto: RegisterEstablishmentDto, request: RequestContext): Promise<IssuedAuth> {
    if (!dto.acceptTerms) {
      throw ApiException.badRequest('É preciso aceitar os termos de uso.');
    }

    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });
    if (existing) {
      throw ApiException.conflict(
        'Ops! Já existe um cadastro com este e-mail.',
        ErrorCode.EMAIL_IN_USE,
      );
    }

    const phone = normalizeMobilePhone(dto.phone);
    const passwordHash = await this.passwords.hash(dto.password);

    const { userId, tenantId } = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { name: dto.name, email: dto.email, phone, passwordHash },
        select: { id: true, name: true },
      });

      const tenant = await this.provisionTenant(tx, {
        shopName: dto.shopName,
        ownerUserId: user.id,
        ownerName: user.name,
        ownerPhone: phone,
        ownerEmail: dto.email,
      });

      return { userId: user.id, tenantId: tenant.id };
    });

    await this.audit.record(
      {
        action: AuditAction.TENANT_CREATED,
        entity: 'Tenant',
        entityId: tenantId,
        tenantId,
        actorUserId: userId,
        metadata: { shopName: dto.shopName, source: 'signup' },
      },
      request,
    );

    return this.issueForUser(userId, tenantId, request);
  }

  /**
   * "Que bom te ver de novo!" — o e-mail já é conta de cliente. Confirmada a
   * senha atual, o MESMO ser humano ganha um login de estabelecimento com o
   * mesmo hash, e `Client.userId` amarra as duas pontas: os agendamentos dele
   * como cliente continuam intactos.
   */
  async linkClientAccount(dto: LinkClientAccountDto, request: RequestContext): Promise<IssuedAuth> {
    if (!dto.acceptTerms) {
      throw ApiException.badRequest('É preciso aceitar os termos de uso.');
    }

    const client = await this.prisma.client.findFirst({
      where: { email: dto.email, deletedAt: null },
      select: { id: true, name: true, phone: true, passwordHash: true, userId: true },
    });

    if (!client?.passwordHash || client.userId) {
      await this.passwords.burn(dto.password);
      throw ApiException.unauthenticated('Não encontramos uma conta de cliente com este e-mail.');
    }

    if (!(await this.passwords.verify(client.passwordHash, dto.password))) {
      throw ApiException.unauthenticated(
        'Senha incorreta. Tente novamente ou recupere sua senha.',
        ErrorCode.INVALID_CREDENTIALS,
      );
    }

    const conflicting = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });
    if (conflicting) {
      throw ApiException.conflict(
        'Ops! Já existe um cadastro com este e-mail.',
        ErrorCode.EMAIL_IN_USE,
      );
    }

    const { userId, tenantId } = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: client.name,
          email: dto.email,
          phone: client.phone,
          // Mesma senha dos dois lados: é a mesma conta, com dois perfis.
          passwordHash: client.passwordHash!,
        },
        select: { id: true, name: true },
      });

      await tx.client.update({ where: { id: client.id }, data: { userId: user.id } });

      const tenant = await this.provisionTenant(tx, {
        shopName: dto.shopName,
        ownerUserId: user.id,
        ownerName: user.name,
        ownerPhone: client.phone,
        ownerEmail: dto.email,
      });

      return { userId: user.id, tenantId: tenant.id };
    });

    await this.audit.record(
      {
        action: AuditAction.TENANT_LINKED,
        entity: 'Tenant',
        entityId: tenantId,
        tenantId,
        actorUserId: userId,
        actorClientId: client.id,
        metadata: { shopName: dto.shopName, clientId: client.id },
      },
      request,
    );

    return this.issueForUser(userId, tenantId, request);
  }

  // ── Sessão ────────────────────────────────────────────────────────────────

  /**
   * Emite sessão para um `User` já criado por outro fluxo — hoje só o aceite
   * de convite de equipe (fase 06), que precisa do MESMO par access/refresh
   * que login e registro emitem, sem duplicar a lógica de `roles`/claims.
   */
  issueSessionForUser(userId: string, tenantId: string, request: RequestContext): Promise<IssuedAuth> {
    return this.issueForUser(userId, tenantId, request);
  }

  async login(dto: LoginEstablishmentDto, request: RequestContext): Promise<IssuedAuth> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: USER_WITH_MEMBERSHIPS,
    });

    if (!user) {
      // Queima o mesmo tempo do argon2 real: sem isso, o tempo de resposta
      // denuncia quais e-mails existem.
      await this.passwords.burn(dto.password);
      throw this.invalidCredentials();
    }

    if (!(await this.passwords.verify(user.passwordHash, dto.password))) {
      await this.audit.record(
        {
          action: AuditAction.LOGIN_FAILED,
          entity: 'User',
          entityId: user.id,
          actorUserId: user.id,
          metadata: { reason: 'wrong-password' },
        },
        request,
      );
      throw this.invalidCredentials();
    }

    if (!user.active) {
      throw ApiException.forbidden(
        'Esta conta está desativada. Fale com o dono da barbearia.',
        ErrorCode.ACCOUNT_DISABLED,
      );
    }

    const activeTenantId = this.pickTenant(user, dto.tenantId);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    await this.audit.record(
      {
        action: AuditAction.LOGIN,
        entity: 'User',
        entityId: user.id,
        tenantId: activeTenantId,
        actorUserId: user.id,
        metadata: { audience: TokenAudience.ESTABLISHMENT },
      },
      request,
    );

    return this.issueForUser(user.id, activeTenantId, request);
  }

  async refresh(refreshToken: string | null, request: RequestContext): Promise<IssuedAuth> {
    if (!refreshToken) {
      throw ApiException.unauthenticated('Sessão não encontrada.');
    }

    const outcome = await this.sessions.validate(refreshToken, PrismaTokenAudience.ESTABLISHMENT);
    if (!outcome.ok) {
      if (outcome.reason === 'reused') {
        await this.audit.record(
          {
            action: AuditAction.SESSION_REUSE_DETECTED,
            entity: 'AuthSession',
            metadata: { audience: TokenAudience.ESTABLISHMENT },
          },
          request,
        );
      }
      throw ApiException.unauthenticated('Sessão expirada. Entre novamente.');
    }

    const rotated = await this.sessions.rotate(outcome.session, {
      ip: clientIp(request),
      userAgent: request.headers['user-agent'] ?? null,
    });

    return this.buildResponse(outcome.session.userId!, rotated.session.tenantId, rotated);
  }

  /**
   * Seletor de contexto: um `User` com `Membership` em N barbearias troca de
   * barbearia emitindo um par NOVO. O tenant só muda dentro do token — nunca
   * porque alguém mandou `tenantId` no corpo de uma rota de negócio.
   */
  async switchContext(
    principal: AuthPrincipal,
    tenantId: string,
    refreshToken: string | null,
    request: RequestContext,
  ): Promise<IssuedAuth> {
    const membership = await this.prisma.membership.findFirst({
      where: { userId: principal.id, tenantId, active: true, tenant: { deletedAt: null } },
      select: { id: true, tenant: { select: { status: true } } },
    });

    if (!membership && !principal.isSuperAdmin) {
      throw ApiException.tenantMismatch();
    }
    if (membership?.tenant.status === TenantStatus.SUSPENDED && !principal.isSuperAdmin) {
      throw ApiException.tenantSuspended();
    }

    // A troca de contexto rotaciona o refresh junto: a sessão inteira passa a
    // valer para a nova barbearia, e o token antigo morre.
    let issued: Awaited<ReturnType<SessionService['rotate']>>;
    if (refreshToken) {
      const outcome = await this.sessions.validate(refreshToken, PrismaTokenAudience.ESTABLISHMENT);
      if (!outcome.ok) {
        throw ApiException.unauthenticated('Sessão expirada. Entre novamente.');
      }
      issued = await this.sessions.rotate(outcome.session, { tenantId });
    } else {
      await this.sessions.revoke(principal.sessionId, 'context-switch');
      issued = await this.sessions.issue({
        audience: PrismaTokenAudience.ESTABLISHMENT,
        userId: principal.id,
        tenantId,
        ip: clientIp(request),
        userAgent: request.headers['user-agent'] ?? null,
      });
    }

    await this.audit.record(
      {
        action: AuditAction.TENANT_CONTEXT_SWITCHED,
        entity: 'Tenant',
        entityId: tenantId,
        tenantId,
        actorUserId: principal.id,
      },
      request,
    );

    return this.buildResponse(principal.id, tenantId, issued);
  }

  async logout(
    principal: AuthPrincipal | undefined,
    refreshToken: string | null,
    request: RequestContext,
  ): Promise<void> {
    if (refreshToken) {
      const outcome = await this.sessions.validate(refreshToken, PrismaTokenAudience.ESTABLISHMENT);
      if (outcome.ok) {
        await this.sessions.revoke(outcome.session.id, 'logout');
      }
    }
    if (principal) {
      await this.sessions.revoke(principal.sessionId, 'logout');
      await this.audit.record(
        {
          action: AuditAction.LOGOUT,
          entity: 'User',
          entityId: principal.id,
          tenantId: principal.activeTenantId,
          actorUserId: principal.id,
        },
        request,
      );
    }
  }

  async me(principal: AuthPrincipal): Promise<EstablishmentSession['user'] & { memberships: AuthMembership[] }> {
    const user = await this.prisma.user.findUnique({
      where: { id: principal.id },
      select: USER_WITH_MEMBERSHIPS,
    });
    if (!user) {
      throw ApiException.unauthenticated();
    }
    return { ...toAuthUser(user), memberships: toMemberships(user) };
  }

  // ── Senha ─────────────────────────────────────────────────────────────────

  async changePassword(
    principal: AuthPrincipal,
    dto: ChangePasswordDto,
    request: RequestContext,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: principal.id },
      select: { id: true, passwordHash: true, client: { select: { id: true } } },
    });
    if (!user) {
      throw ApiException.unauthenticated();
    }

    if (!(await this.passwords.verify(user.passwordHash, dto.currentPassword))) {
      throw ApiException.unauthenticated('Senha atual incorreta.', ErrorCode.INVALID_CREDENTIALS);
    }

    const passwordHash = await this.passwords.hash(dto.newPassword);
    await this.applyNewPassword(user.id, user.client?.id ?? null, passwordHash);

    // Trocar a senha derruba as outras sessões — a atual sobrevive para o dono
    // não ser deslogado do próprio navegador ao trocar.
    await this.sessions.revokeAllForUser(user.id, 'password-change', principal.sessionId);
    if (user.client) {
      await this.sessions.revokeAllForClient(user.client.id, 'password-change');
    }

    await this.audit.record(
      {
        action: AuditAction.PASSWORD_CHANGED,
        entity: 'User',
        entityId: user.id,
        tenantId: principal.activeTenantId,
        actorUserId: user.id,
        metadata: { linkedClient: Boolean(user.client) },
      },
      request,
    );
  }

  /**
   * Recuperação por e-mail. A resposta é sempre a mesma, exista o e-mail ou
   * não — o endpoint não é um oráculo de contas.
   */
  async forgotPassword(email: string, request: RequestContext): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, email: true, active: true },
    });

    if (!user?.active) {
      this.logger.info({ email: maskEmailForDisplay(email) }, 'recuperação pedida para e-mail sem conta');
      return;
    }

    const secret = randomSecret();
    const ttlMs = this.config.auth.passwordResetTtlMinutes * 60_000;

    const token = await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashSecret(secret, this.config.jwt.refreshSecret),
        expiresAt: new Date(Date.now() + ttlMs),
        ip: clientIp(request),
      },
      select: { id: true },
    });

    const link = `${this.config.urls.site}/recuperar-senha?token=${token.id}.${secret}`;

    await this.mail.send({
      to: user.email,
      subject: 'Recuperação de senha · BarberVP',
      body:
        `Olá, ${user.name.split(' ')[0]}.\n\n` +
        `Recebemos um pedido para redefinir a senha do seu painel BarberVP.\n` +
        `Use o link abaixo — ele vale por ${this.config.auth.passwordResetTtlMinutes} minutos:\n\n` +
        `${link}\n\n` +
        `Se não foi você, ignore este e-mail: sua senha continua a mesma.`,
      payload: { kind: 'password-reset', userId: user.id },
    });

    await this.audit.record(
      {
        action: AuditAction.PASSWORD_RESET_REQUESTED,
        entity: 'User',
        entityId: user.id,
        actorUserId: user.id,
      },
      request,
    );
  }

  async resetPassword(token: string, password: string, request: RequestContext): Promise<void> {
    const separator = token.indexOf('.');
    if (separator <= 0) {
      throw ApiException.badRequest('Link de recuperação inválido.');
    }

    const record = await this.prisma.passwordResetToken.findFirst({
      where: { id: token.slice(0, separator), consumedAt: null },
      select: {
        id: true,
        tokenHash: true,
        expiresAt: true,
        userId: true,
        user: { select: { client: { select: { id: true } } } },
      },
    });

    if (
      !record ||
      record.expiresAt.getTime() <= Date.now() ||
      !secretMatches(token.slice(separator + 1), record.tokenHash, this.config.jwt.refreshSecret)
    ) {
      throw ApiException.badRequest('Link de recuperação inválido ou expirado.');
    }

    const passwordHash = await this.passwords.hash(password);

    await this.prisma.$transaction(async (tx) => {
      await tx.passwordResetToken.update({
        where: { id: record.id },
        data: { consumedAt: new Date() },
      });
      // Qualquer outro link pendente do mesmo usuário morre junto.
      await tx.passwordResetToken.updateMany({
        where: { userId: record.userId, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      await tx.user.update({ where: { id: record.userId }, data: { passwordHash } });
      if (record.user.client) {
        await tx.client.update({
          where: { id: record.user.client.id },
          data: { passwordHash },
        });
      }
    });

    // Recuperação (ao contrário da troca voluntária) derruba TUDO: quem pediu
    // pode estar recuperando justamente de um acesso indevido.
    await this.sessions.revokeAllForUser(record.userId, 'password-reset');
    if (record.user.client) {
      await this.sessions.revokeAllForClient(record.user.client.id, 'password-reset');
    }

    await this.audit.record(
      {
        action: AuditAction.PASSWORD_RESET_COMPLETED,
        entity: 'User',
        entityId: record.userId,
        actorUserId: record.userId,
      },
      request,
    );
  }

  // ── Internos ──────────────────────────────────────────────────────────────

  /**
   * Cria tenant + membership + settings + horários + barbeiro do dono.
   * Sempre dentro de uma transação recebida por parâmetro.
   */
  private async provisionTenant(
    tx: Prisma.TransactionClient,
    input: {
      shopName: string;
      ownerUserId: string;
      ownerName: string;
      ownerPhone: string | null;
      ownerEmail: string;
    },
  ): Promise<{ id: string; slug: string }> {
    const slug = await this.slugs.generateUnique(input.shopName, tx);

    const tenant = await tx.tenant.create({
      data: {
        slug,
        name: input.shopName,
        // Trial sem plano contratado: durante o teste tudo é permitido, e é a
        // fase 07/08 que amarra `planId` na contratação.
        status: TenantStatus.TRIAL,
        email: input.ownerEmail,
        phone: input.ownerPhone,
        memberships: {
          create: { userId: input.ownerUserId, role: MembershipRole.OWNER },
        },
        settings: {
          create: { whatsapp: input.ownerPhone },
        },
        businessHours: {
          createMany: {
            data: DEFAULT_BUSINESS_HOURS.map((hour) => ({ ...hour })),
          },
        },
        // O dono já entra como profissional — é a linha fixa "Você" do passo 5.
        barbers: {
          create: {
            userId: input.ownerUserId,
            name: input.ownerName,
            phone: input.ownerPhone,
            email: input.ownerEmail,
            sortOrder: 0,
          },
        },
      },
      select: { id: true, slug: true },
    });

    return tenant;
  }

  /** Login novo: sessão nova (família nova), token novo. */
  private async issueForUser(
    userId: string,
    tenantId: string | null,
    request: RequestContext,
  ): Promise<IssuedAuth> {
    const issued = await this.sessions.issue({
      audience: PrismaTokenAudience.ESTABLISHMENT,
      userId,
      tenantId,
      ip: clientIp(request),
      userAgent: request.headers['user-agent'] ?? null,
    });

    return this.buildResponse(userId, tenantId, issued);
  }

  private async buildResponse(
    userId: string,
    tenantId: string | null,
    issued: { session: { id: string }; refreshToken: string; expiresAt: Date },
  ): Promise<IssuedAuth> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: USER_WITH_MEMBERSHIPS,
    });
    if (!user) {
      throw ApiException.unauthenticated();
    }

    const memberships = toMemberships(user);
    const activeTenantId =
      tenantId && memberships.some((membership) => membership.tenantId === tenantId)
        ? tenantId
        : user.isSuperAdmin
          ? tenantId
          : null;

    const roles: Role[] = activeTenantId
      ? memberships
          .filter((membership) => membership.tenantId === activeTenantId)
          .map((membership) => membership.role)
      : [];
    if (user.isSuperAdmin) {
      roles.push(Role.SUPER_ADMIN);
    }

    const accessToken = this.accessTokens.sign({
      subjectId: user.id,
      audience: TokenAudience.ESTABLISHMENT,
      tenantId: activeTenantId,
      roles,
      isSuperAdmin: user.isSuperAdmin,
      sessionId: issued.session.id,
    });

    return {
      session: {
        accessToken,
        expiresIn: this.accessTokens.expiresInSeconds,
        user: toAuthUser(user),
        memberships,
        activeTenantId,
      },
      refreshToken: issued.refreshToken,
      refreshExpiresAt: issued.expiresAt,
    };
  }

  /** Senha nova nos dois perfis quando a conta é compartilhada com um `Client`. */
  private async applyNewPassword(
    userId: string,
    clientId: string | null,
    passwordHash: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { passwordHash } });
      if (clientId) {
        await tx.client.update({ where: { id: clientId }, data: { passwordHash } });
      }
    });
  }

  /**
   * Barbearia a abrir no login. Com um vínculo só, entra direto; com vários,
   * respeita o `tenantId` pedido e, na falta dele, devolve `null` para a app
   * mostrar o seletor de contexto.
   */
  /**
   * Suspensão bloqueia login NAQUELE tenant (fase 08 — `Tenant.status =
   * SUSPENDED` pelo super admin): pedido explícito de um tenant suspenso, ou
   * o único tenant do usuário estar suspenso, vira 403 `TENANT_SUSPENDED`
   * aqui mesmo — antes de emitir qualquer token, não depois. `SUPER_ADMIN`
   * atravessa (é ele quem administra a suspensão).
   */
  private pickTenant(user: UserWithMemberships, requested?: string): string | null {
    const ids = user.memberships.map((membership) => membership.tenant.id);

    if (requested) {
      if (!ids.includes(requested) && !user.isSuperAdmin) {
        throw ApiException.tenantMismatch();
      }
      const membership = user.memberships.find((item) => item.tenant.id === requested);
      if (membership?.tenant.status === TenantStatus.SUSPENDED && !user.isSuperAdmin) {
        throw ApiException.tenantSuspended();
      }
      return requested;
    }

    if (ids.length !== 1) {
      return null;
    }
    if (user.memberships[0]!.tenant.status === TenantStatus.SUSPENDED) {
      throw ApiException.tenantSuspended();
    }
    return ids[0]!;
  }

  private invalidCredentials(): ApiException {
    return ApiException.unauthenticated('E-mail ou senha incorretos.', ErrorCode.INVALID_CREDENTIALS);
  }
}

function toAuthUser(user: UserWithMemberships): AuthUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    isSuperAdmin: user.isSuperAdmin,
    hasClientAccount: user.client !== null,
  };
}

function toMemberships(user: UserWithMemberships): AuthMembership[] {
  return user.memberships.map((membership) => ({
    tenantId: membership.tenant.id,
    tenantName: membership.tenant.name,
    tenantSlug: membership.tenant.slug,
    tenantStatus: membership.tenant.status,
    role: membership.role as Role,
    onboardingDone: membership.tenant.settings?.onboardingDoneAt !== null &&
      membership.tenant.settings?.onboardingDoneAt !== undefined,
    onboardingStep: membership.tenant.settings?.onboardingStep ?? 0,
  }));
}

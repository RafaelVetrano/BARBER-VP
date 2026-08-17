import { Injectable } from '@nestjs/common';
import {
  OtpChannel,
  OtpPurpose,
  Prisma,
  TokenAudience as PrismaTokenAudience,
  type Client,
} from '@prisma/client';
import {
  CURRENT_TERMS_VERSION,
  ErrorCode,
  Role,
  TokenAudience,
  isEmail,
  normalizeMobilePhone,
  type AuthClient,
  type ClientSession,
  type ExportedClientData,
  type OtpChallenge,
} from '@barbervp/types';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../prisma/prisma.service';
import { ApiException } from '../common/errors/api.exception';
import { AuditAction, AuditService, clientIp } from '../audit/audit.service';
import { PasswordService } from './crypto/password.service';
import { AccessTokenService } from './tokens/access-token.service';
import { SessionService } from './tokens/session.service';
import { OtpService } from './otp/otp.service';
import type {
  ChangeClientPasswordDto,
  ClientForgotPasswordDto,
  ClientLoginDto,
  ClientRegisterDto,
  ClientResetPasswordDto,
  ConfirmPhoneChangeDto,
  DeleteClientAccountDto,
  RequestPhoneChangeDto,
  UpdateClientProfileDto,
} from './dto/client-auth.dto';
import type { AuthPrincipal, RequestContext } from '../common/types/request-context';

/** Payload guardado no desafio de troca de telefone até o código bater. */
interface PendingPhoneChange {
  clientId: string;
  phone: string;
}

export interface IssuedClientAuth {
  session: ClientSession;
  refreshToken: string;
  refreshExpiresAt: Date;
}

/** Cadastro pendente guardado em `OtpCode.payload` até o código ser confirmado. */
interface PendingSignup {
  name: string;
  phone: string;
  email: string;
  passwordHash: string;
  marketingOptIn: boolean;
}

/**
 * Auth do cliente final (`ClienteAuth.dc.html`) — o fluxo mais completo do
 * bundle: login por telefone OU e-mail, registro com OTP, reenvio com cooldown
 * e recuperação de senha reusando o mesmo desafio.
 *
 * A conta do cliente é GLOBAL na plataforma (o `Client` não tem `tenantId`); o
 * vínculo com cada barbearia é o `ClientProfile`, criado no primeiro
 * agendamento (fase 04). Por isso nada aqui resolve tenant.
 *
 * Um detalhe importante do registro: a conta **só nasce depois do OTP**. Até
 * lá, o cadastro vive em `OtpCode.payload`. Assim, quem digita o telefone de
 * outra pessoa não consegue ocupar aquele número — o telefone é a identidade,
 * e ocupá-lo sem prová-lo seria um vetor de bloqueio de conta alheia.
 */
@Injectable()
export class ClientAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly accessTokens: AccessTokenService,
    private readonly sessions: SessionService,
    private readonly otp: OtpService,
    private readonly audit: AuditService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ClientAuthService.name);
  }

  // ── Login ─────────────────────────────────────────────────────────────────

  async login(dto: ClientLoginDto, request: RequestContext): Promise<IssuedClientAuth> {
    const client = await this.findByIdentifier(dto.identifier);

    if (!client?.passwordHash) {
      await this.passwords.burn(dto.password);
      throw this.invalidCredentials();
    }

    if (!(await this.passwords.verify(client.passwordHash, dto.password))) {
      throw this.invalidCredentials();
    }

    if (!client.phoneVerifiedAt) {
      throw ApiException.forbidden(
        'Confirme seu telefone para acessar sua conta.',
        ErrorCode.ACCOUNT_NOT_VERIFIED,
      );
    }

    await this.prisma.client.update({
      where: { id: client.id },
      data: { lastLoginAt: new Date() },
    });

    await this.audit.record(
      {
        action: AuditAction.LOGIN,
        entity: 'Client',
        entityId: client.id,
        actorClientId: client.id,
        metadata: { audience: TokenAudience.CLIENT },
      },
      request,
    );

    return this.issue(client, request);
  }

  // ── Registro + OTP ────────────────────────────────────────────────────────

  async register(dto: ClientRegisterDto, request: RequestContext): Promise<OtpChallenge> {
    if (dto.email !== dto.confirmEmail) {
      throw ApiException.badRequest('Os e-mails não coincidem.');
    }
    if (dto.password !== dto.confirmPassword) {
      throw ApiException.badRequest('As senhas não coincidem.');
    }
    if (!dto.acceptTerms) {
      throw ApiException.badRequest('É preciso aceitar os termos de uso.');
    }

    const phone = normalizeMobilePhone(dto.phone)!;

    const existingByPhone = await this.prisma.client.findFirst({
      where: { phone, deletedAt: null },
      select: { id: true, phoneVerifiedAt: true },
    });
    if (existingByPhone?.phoneVerifiedAt) {
      throw ApiException.conflict('Este telefone já possui conta.', ErrorCode.PHONE_IN_USE);
    }

    const existingByEmail = await this.prisma.client.findFirst({
      where: { email: dto.email, deletedAt: null },
      select: { id: true },
    });
    if (existingByEmail && existingByEmail.id !== existingByPhone?.id) {
      throw ApiException.conflict('Este e-mail já possui conta.', ErrorCode.EMAIL_IN_USE);
    }

    const payload: PendingSignup = {
      name: `${dto.firstName} ${dto.lastName}`.trim(),
      phone,
      email: dto.email,
      passwordHash: await this.passwords.hash(dto.password),
      marketingOptIn: dto.marketingOptIn ?? false,
    };

    return this.otp.createChallenge({
      purpose: OtpPurpose.CLIENT_SIGNUP,
      destination: phone,
      channel: OtpChannel.WHATSAPP,
      clientId: existingByPhone?.id ?? null,
      payload: { ...payload },
      ip: clientIp(request),
      recipientName: dto.firstName,
    });
  }

  resendOtp(challengeId: string, channel?: 'WHATSAPP' | 'SMS' | 'EMAIL'): Promise<OtpChallenge> {
    return this.otp.resend(challengeId, channel ? OtpChannel[channel] : undefined);
  }

  requestVoiceCall(challengeId: string): Promise<OtpChallenge> {
    return this.otp.requestVoiceCall(challengeId);
  }

  /**
   * Verifica o código. No registro, é aqui que a conta finalmente nasce e a
   * sessão é emitida; na recuperação, devolve o token de troca de senha.
   */
  async verifyOtp(
    challengeId: string,
    code: string,
    request: RequestContext,
  ): Promise<
    | { kind: 'session'; auth: IssuedClientAuth }
    | { kind: 'password-reset'; resetToken: string; expiresInSeconds: number }
  > {
    const verified = await this.otp.verify(challengeId, code);

    if (verified.challenge.purpose === OtpPurpose.CLIENT_PASSWORD_RESET) {
      return {
        kind: 'password-reset' as const,
        resetToken: verified.exchangeToken!,
        expiresInSeconds: verified.exchangeExpiresInSeconds!,
      };
    }

    const payload = verified.challenge.payload as unknown as PendingSignup | null;
    if (!payload?.phone) {
      throw ApiException.badRequest('Cadastro não encontrado. Recomece o processo.');
    }

    const client = await this.prisma.client.upsert({
      where: { phone: payload.phone },
      // Telefone livre: conta nova, já verificada.
      create: {
        phone: payload.phone,
        name: payload.name,
        email: payload.email,
        passwordHash: payload.passwordHash,
        phoneVerifiedAt: new Date(),
        consentAt: new Date(),
        consentVersion: CURRENT_TERMS_VERSION,
        marketingOptIn: payload.marketingOptIn,
        lastLoginAt: new Date(),
      },
      // Cadastro anterior não verificado (ou criado como convidado na fase 04):
      // assume os dados novos em vez de duplicar o cliente.
      update: {
        name: payload.name,
        email: payload.email,
        passwordHash: payload.passwordHash,
        phoneVerifiedAt: new Date(),
        consentAt: new Date(),
        consentVersion: CURRENT_TERMS_VERSION,
        marketingOptIn: payload.marketingOptIn,
        lastLoginAt: new Date(),
        deletedAt: null,
      },
    });

    await this.audit.record(
      {
        action: AuditAction.CLIENT_REGISTERED,
        entity: 'Client',
        entityId: client.id,
        actorClientId: client.id,
        metadata: { marketingOptIn: payload.marketingOptIn },
      },
      request,
    );

    return { kind: 'session' as const, auth: await this.issue(client, request) };
  }

  // ── Recuperação de senha ──────────────────────────────────────────────────

  /**
   * Abre o desafio de recuperação. Como no login, a resposta não revela se a
   * conta existe: sem conta, devolvemos um desafio "de fachada" que nunca
   * verifica — a tela segue igual e o atacante não aprende nada.
   */
  async forgotPassword(
    dto: ClientForgotPasswordDto,
    request: RequestContext,
  ): Promise<OtpChallenge> {
    const client = await this.findByIdentifier(dto.identifier);
    const byEmail = isEmail(dto.identifier);

    if (!client) {
      const destination = byEmail
        ? dto.identifier.trim().toLowerCase()
        : (normalizeMobilePhone(dto.identifier) ?? dto.identifier.replace(/\D/g, ''));

      return this.otp.createDecoyChallenge({
        purpose: OtpPurpose.CLIENT_PASSWORD_RESET,
        destination,
        channel: byEmail ? OtpChannel.EMAIL : OtpChannel.WHATSAPP,
      });
    }

    const destination = byEmail && client.email ? client.email : client.phone;

    return this.otp.createChallenge({
      purpose: OtpPurpose.CLIENT_PASSWORD_RESET,
      destination,
      channel: byEmail && client.email ? OtpChannel.EMAIL : OtpChannel.WHATSAPP,
      clientId: client.id,
      ip: clientIp(request),
      recipientName: client.name,
    });
  }

  async resetPassword(dto: ClientResetPasswordDto, request: RequestContext): Promise<void> {
    if (dto.password !== dto.confirmPassword) {
      throw ApiException.badRequest('As senhas não coincidem.');
    }

    const challenge = await this.otp.consumeExchangeToken(dto.resetToken);
    if (!challenge.clientId) {
      throw ApiException.badRequest('Token de recuperação inválido.');
    }

    const client = await this.prisma.client.findFirst({
      where: { id: challenge.clientId, deletedAt: null },
      select: { id: true, userId: true },
    });
    if (!client) {
      throw ApiException.badRequest('Conta não encontrada.');
    }

    const passwordHash = await this.passwords.hash(dto.password);

    await this.prisma.$transaction(async (tx) => {
      await tx.client.update({
        where: { id: client.id },
        // Quem recupera pelo telefone prova a posse dele: aproveita e confirma.
        data: { passwordHash, phoneVerifiedAt: new Date() },
      });
      // Conta vinculada (o dono que também é cliente) muda a senha nos dois.
      if (client.userId) {
        await tx.user.update({ where: { id: client.userId }, data: { passwordHash } });
      }
    });

    await this.sessions.revokeAllForClient(client.id, 'password-reset');
    if (client.userId) {
      await this.sessions.revokeAllForUser(client.userId, 'password-reset');
    }

    await this.audit.record(
      {
        action: AuditAction.PASSWORD_RESET_COMPLETED,
        entity: 'Client',
        entityId: client.id,
        actorClientId: client.id,
        metadata: { linkedUser: Boolean(client.userId) },
      },
      request,
    );
  }

  // ── Sessão ────────────────────────────────────────────────────────────────

  async refresh(refreshToken: string | null, request: RequestContext): Promise<IssuedClientAuth> {
    if (!refreshToken) {
      throw ApiException.unauthenticated('Sessão não encontrada.');
    }

    const outcome = await this.sessions.validate(refreshToken, PrismaTokenAudience.CLIENT);
    if (!outcome.ok) {
      if (outcome.reason === 'reused') {
        await this.audit.record(
          {
            action: AuditAction.SESSION_REUSE_DETECTED,
            entity: 'AuthSession',
            metadata: { audience: TokenAudience.CLIENT },
          },
          request,
        );
      }
      throw ApiException.unauthenticated('Sessão expirada. Entre novamente.');
    }

    const client = await this.prisma.client.findFirst({
      where: { id: outcome.session.clientId!, deletedAt: null },
    });
    if (!client) {
      throw ApiException.unauthenticated();
    }

    const rotated = await this.sessions.rotate(outcome.session, {
      ip: clientIp(request),
      userAgent: request.headers['user-agent'] ?? null,
    });

    return this.buildResponse(client, rotated);
  }

  async logout(
    principal: AuthPrincipal | undefined,
    refreshToken: string | null,
    request: RequestContext,
  ): Promise<void> {
    if (refreshToken) {
      const outcome = await this.sessions.validate(refreshToken, PrismaTokenAudience.CLIENT);
      if (outcome.ok) {
        await this.sessions.revoke(outcome.session.id, 'logout');
      }
    }
    if (principal) {
      await this.sessions.revoke(principal.sessionId, 'logout');
      await this.audit.record(
        {
          action: AuditAction.LOGOUT,
          entity: 'Client',
          entityId: principal.id,
          actorClientId: principal.id,
        },
        request,
      );
    }
  }

  async me(principal: AuthPrincipal): Promise<AuthClient> {
    const client = await this.prisma.client.findFirst({
      where: { id: principal.id, deletedAt: null },
    });
    if (!client) {
      throw ApiException.unauthenticated();
    }
    return toAuthClient(client);
  }

  // ── "Meus dados" (fase 05) ───────────────────────────────────────────────

  /** Nome, e-mail e preferências de notificação — a troca de telefone é à parte. */
  async updateProfile(
    principal: AuthPrincipal,
    dto: UpdateClientProfileDto,
    request: RequestContext,
  ): Promise<AuthClient> {
    const client = await this.loadActive(principal.id);

    if (dto.email && dto.email !== client.email) {
      const taken = await this.prisma.client.findFirst({
        where: { email: dto.email, deletedAt: null, id: { not: client.id } },
        select: { id: true },
      });
      if (taken) {
        throw ApiException.conflict('Este e-mail já está em uso.', ErrorCode.EMAIL_IN_USE);
      }
    }

    const updated = await this.prisma.client.update({
      where: { id: client.id },
      data: {
        name: dto.name?.trim(),
        email: dto.email,
        notifyWhatsapp: dto.notifyWhatsapp,
        notifyEmail: dto.notifyEmail,
      },
    });

    await this.audit.record(
      {
        action: AuditAction.CLIENT_PROFILE_UPDATED,
        entity: 'Client',
        entityId: client.id,
        actorClientId: client.id,
        metadata: { fields: Object.keys(dto) },
      },
      request,
    );

    return toAuthClient(updated);
  }

  /**
   * Início da troca de telefone. O telefone É a identidade do cliente
   * (`Client.phone @unique`, chave de login), então trocá-lo sem prová-lo
   * ocuparia — ou perderia — o número de outra pessoa; a troca reusa o mesmo
   * desafio de 6 dígitos do registro.
   */
  async requestPhoneChange(
    principal: AuthPrincipal,
    dto: RequestPhoneChangeDto,
    request: RequestContext,
  ): Promise<OtpChallenge> {
    const client = await this.loadActive(principal.id);
    const phone = normalizeMobilePhone(dto.phone)!;

    if (phone === client.phone) {
      throw ApiException.badRequest('Este já é o seu telefone atual.');
    }

    const taken = await this.prisma.client.findFirst({
      where: { phone, deletedAt: null },
      select: { id: true, phoneVerifiedAt: true },
    });
    if (taken?.phoneVerifiedAt) {
      throw ApiException.conflict('Este telefone já possui conta.', ErrorCode.PHONE_IN_USE);
    }

    const payload: PendingPhoneChange = { clientId: client.id, phone };

    const challenge = await this.otp.createChallenge({
      purpose: OtpPurpose.CLIENT_PHONE_CHANGE,
      destination: phone,
      channel: OtpChannel.WHATSAPP,
      clientId: client.id,
      payload: { ...payload } as unknown as Prisma.InputJsonValue,
      ip: clientIp(request),
      recipientName: client.name,
    });

    await this.audit.record(
      {
        action: AuditAction.CLIENT_PHONE_CHANGE_REQUESTED,
        entity: 'Client',
        entityId: client.id,
        actorClientId: client.id,
      },
      request,
    );

    return challenge;
  }

  /** Segunda metade: o código bateu, o telefone muda de verdade. */
  async confirmPhoneChange(
    principal: AuthPrincipal,
    dto: ConfirmPhoneChangeDto,
    request: RequestContext,
  ): Promise<AuthClient> {
    const verified = await this.otp.verify(dto.challengeId, dto.code);

    if (verified.challenge.purpose !== OtpPurpose.CLIENT_PHONE_CHANGE) {
      throw ApiException.badRequest('Este código não pertence a uma troca de telefone.');
    }

    const payload = verified.challenge.payload as unknown as PendingPhoneChange | null;
    if (!payload || payload.clientId !== principal.id) {
      throw ApiException.badRequest('Esta troca de telefone não pertence à sua conta.');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const client = await tx.client.update({
        where: { id: payload.clientId },
        data: { phone: payload.phone, phoneVerifiedAt: new Date() },
      });

      // `ClientProfile.phone` é desnormalizado (dívida da fase 01/03) — toda
      // barbearia onde o cliente já tem perfil precisa ver o número novo, senão
      // a busca `(tenantId, phone)` do dashboard aponta para um telefone morto.
      await tx.clientProfile.updateMany({
        where: { clientId: payload.clientId },
        data: { phone: payload.phone },
      });

      return client;
    });

    await this.audit.record(
      {
        action: AuditAction.CLIENT_PHONE_CHANGED,
        entity: 'Client',
        entityId: updated.id,
        actorClientId: updated.id,
      },
      request,
    );

    return toAuthClient(updated);
  }

  /** Troca de senha logado — a atual prova quem está pedindo. */
  async changePassword(
    principal: AuthPrincipal,
    dto: ChangeClientPasswordDto,
    request: RequestContext,
  ): Promise<void> {
    if (dto.newPassword !== dto.confirmNewPassword) {
      throw ApiException.badRequest('As senhas não coincidem.');
    }

    const client = await this.loadActive(principal.id);
    if (!client.passwordHash || !(await this.passwords.verify(client.passwordHash, dto.currentPassword))) {
      throw ApiException.unauthenticated('Senha atual incorreta.', ErrorCode.INVALID_CREDENTIALS);
    }

    const passwordHash = await this.passwords.hash(dto.newPassword);

    await this.prisma.$transaction(async (tx) => {
      await tx.client.update({ where: { id: client.id }, data: { passwordHash } });
      if (client.userId) {
        await tx.user.update({ where: { id: client.userId }, data: { passwordHash } });
      }
    });

    // Derruba as demais sessões — mantém a atual, como no painel do
    // estabelecimento (`EstablishmentAuthService.changePassword`).
    await this.sessions.revokeAllForClient(client.id, 'password-change', principal.sessionId);
    if (client.userId) {
      await this.sessions.revokeAllForUser(client.userId, 'password-change');
    }

    await this.audit.record(
      {
        action: AuditAction.CLIENT_PASSWORD_CHANGED,
        entity: 'Client',
        entityId: client.id,
        actorClientId: client.id,
      },
      request,
    );
  }

  // ── LGPD (regra 6 do SPEC) ────────────────────────────────────────────────

  /**
   * Exportação em JSON (LGPD art. 18 IV/V — portabilidade). O `Client` é
   * global, então a exportação cobre TODAS as barbearias onde o cliente tem
   * histórico — é o próprio titular pedindo os próprios dados, não uma consulta
   * cross-tenant de terceiro: a regra 3 protege contra vazamento entre
   * clientes, não contra o cliente ver a si mesmo.
   */
  async exportData(principal: AuthPrincipal, request: RequestContext): Promise<ExportedClientData> {
    const client = await this.loadActive(principal.id);

    const [appointments, subscriptions, reviews] = await Promise.all([
      this.prisma.appointment.findMany({
        where: { clientId: client.id },
        orderBy: { startsAt: 'desc' },
        select: {
          bookingCode: true,
          status: true,
          startsAt: true,
          priceCents: true,
          tenant: { select: { name: true } },
          services: { select: { service: { select: { name: true } } } },
        },
      }),
      this.prisma.clientSubscription.findMany({
        where: { clientId: client.id },
        orderBy: { startedAt: 'desc' },
        select: {
          status: true,
          startedAt: true,
          canceledAt: true,
          tenant: { select: { name: true } },
          plan: { select: { name: true } },
        },
      }),
      this.prisma.review.findMany({
        where: { clientId: client.id },
        orderBy: { createdAt: 'desc' },
        select: {
          rating: true,
          comment: true,
          createdAt: true,
          tenant: { select: { name: true } },
        },
      }),
    ]);

    await this.audit.record(
      {
        action: AuditAction.CLIENT_DATA_EXPORTED,
        entity: 'Client',
        entityId: client.id,
        actorClientId: client.id,
      },
      request,
    );

    return {
      exportedAt: new Date().toISOString(),
      profile: {
        id: client.id,
        name: client.name,
        phone: client.phone,
        email: client.email,
        birthDate: client.birthDate?.toISOString() ?? null,
        createdAt: client.createdAt.toISOString(),
        consentAt: client.consentAt?.toISOString() ?? null,
        consentVersion: client.consentVersion,
        marketingOptIn: client.marketingOptIn,
        notifyWhatsapp: client.notifyWhatsapp,
        notifyEmail: client.notifyEmail,
      },
      appointments: appointments.map((appointment) => ({
        tenantName: appointment.tenant.name,
        bookingCode: appointment.bookingCode,
        status: appointment.status,
        startsAt: appointment.startsAt.toISOString(),
        services: appointment.services.map((line) => line.service.name),
        totalPriceCents: appointment.priceCents,
      })),
      subscriptions: subscriptions.map((subscription) => ({
        tenantName: subscription.tenant.name,
        planName: subscription.plan.name,
        status: subscription.status,
        startedAt: subscription.startedAt.toISOString(),
        canceledAt: subscription.canceledAt?.toISOString() ?? null,
      })),
      reviews: reviews.map((review) => ({
        tenantName: review.tenant.name,
        rating: review.rating,
        comment: review.comment,
        createdAt: review.createdAt.toISOString(),
      })),
    };
  }

  /**
   * "Excluir minha conta" — anonimiza em vez de apagar. `Order`/`Payment`
   * históricos continuam intactos e apontando para o MESMO `Client.id` (é o
   * que preserva a integridade financeira do lado da barbearia); só o que
   * identifica a pessoa é substituído. O telefone vira um placeholder único
   * porque `Client.phone` é `@unique` — não dá para deixar vazio.
   */
  async requestDeletion(
    principal: AuthPrincipal,
    dto: DeleteClientAccountDto,
    request: RequestContext,
  ): Promise<void> {
    if (!dto.confirm) {
      throw ApiException.badRequest('Confirme que entende que a exclusão é irreversível.');
    }

    const client = await this.loadActive(principal.id);

    await this.prisma.client.update({
      where: { id: client.id },
      data: {
        name: 'Cliente removido',
        phone: `deleted-${client.id}`,
        email: null,
        passwordHash: null,
        birthDate: null,
        marketingOptIn: false,
        notifyWhatsapp: false,
        notifyEmail: false,
        deletedAt: new Date(),
        // A conta de estabelecimento vinculada (se houver) não é excluída — LGPD
        // aqui é do CLIENTE, e desligar o login do dono seria efeito colateral
        // indevido de um pedido que ele nem fez por aquele lado. Só o vínculo
        // solta, para o `User` não seguir apontado por um `Client` anonimizado.
        userId: null,
      },
    });

    await this.sessions.revokeAllForClient(client.id, 'account-deleted');

    await this.audit.record(
      {
        action: AuditAction.CLIENT_ACCOUNT_DELETED,
        entity: 'Client',
        entityId: client.id,
        actorClientId: client.id,
      },
      request,
    );
  }

  // ── Internos ──────────────────────────────────────────────────────────────

  private async loadActive(clientId: string): Promise<Client> {
    const client = await this.prisma.client.findFirst({ where: { id: clientId, deletedAt: null } });
    if (!client) {
      throw ApiException.unauthenticated();
    }
    return client;
  }

  /** Resolve o campo único "Telefone ou e-mail" do protótipo. */
  private async findByIdentifier(identifier: string): Promise<Client | null> {
    const trimmed = identifier.trim();

    if (isEmail(trimmed)) {
      return this.prisma.client.findFirst({
        where: { email: trimmed.toLowerCase(), deletedAt: null },
      });
    }

    const phone = normalizeMobilePhone(trimmed);
    if (!phone) {
      return null;
    }
    return this.prisma.client.findFirst({ where: { phone, deletedAt: null } });
  }

  private async issue(client: Client, request: RequestContext): Promise<IssuedClientAuth> {
    const issued = await this.sessions.issue({
      audience: PrismaTokenAudience.CLIENT,
      clientId: client.id,
      ip: clientIp(request),
      userAgent: request.headers['user-agent'] ?? null,
    });
    return this.buildResponse(client, issued);
  }

  private buildResponse(
    client: Client,
    issued: { session: { id: string }; refreshToken: string; expiresAt: Date },
  ): IssuedClientAuth {
    const accessToken = this.accessTokens.sign({
      subjectId: client.id,
      audience: TokenAudience.CLIENT,
      // A conta do cliente é global: nenhum tenant vai no token.
      tenantId: null,
      roles: [Role.CLIENT],
      isSuperAdmin: false,
      sessionId: issued.session.id,
    });

    return {
      session: {
        accessToken,
        expiresIn: this.accessTokens.expiresInSeconds,
        client: toAuthClient(client),
      },
      refreshToken: issued.refreshToken,
      refreshExpiresAt: issued.expiresAt,
    };
  }

  private invalidCredentials(): ApiException {
    return ApiException.unauthenticated(
      'Telefone/e-mail ou senha incorretos',
      ErrorCode.INVALID_CREDENTIALS,
    );
  }
}

function toAuthClient(client: Client): AuthClient {
  return {
    id: client.id,
    name: client.name,
    phone: client.phone,
    email: client.email,
    phoneVerified: client.phoneVerifiedAt !== null,
    marketingOptIn: client.marketingOptIn,
    notifyWhatsapp: client.notifyWhatsapp,
    notifyEmail: client.notifyEmail,
  };
}

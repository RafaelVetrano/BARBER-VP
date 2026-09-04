import { Inject, Injectable } from '@nestjs/common';
import { MembershipRole, SubscriptionStatus, TenantStatus } from '@prisma/client';
import {
  ACCOUNT_DELETION_CONFIRM_WORD,
  ACCOUNT_DELETION_GRACE_DAYS,
  ROLE_BADGE_LABEL,
  normalizePhone,
  type ExportedUserData,
  type MyProfile,
  type ScheduledDeletion,
} from '@barbervp/types';
import { PrismaService } from '../prisma/prisma.service';
import { ApiException } from '../common/errors/api.exception';
import { AuditAction, AuditService } from '../audit/audit.service';
import { MAIL_ADAPTER, type MailAdapter } from '../adapters/mail/mail.adapter';
import { PAYMENT_ADAPTER, type PaymentAdapter } from '../adapters/payment/payment.adapter';
import { STORAGE_ADAPTER, type StorageAdapter } from '../adapters/storage/storage.adapter';
import type { RequestContext } from '../common/types/request-context';
import type { UpdateMyProfileDto } from './dto/my-profile.dto';

/** Mesmo formato do upload de Minha Página — o multer entrega isto. */
export interface UploadedImageFile {
  mimetype: string;
  buffer: Buffer;
  size: number;
}

const DAY_MS = 24 * 60 * 60 * 1_000;

/** Teto da trilha devolvida na exportação — LGPD pede os dados, não um dump. */
const EXPORT_ACTIVITY_LIMIT = 500;

/**
 * "Meu perfil" — a PESSOA logada, não a barbearia.
 *
 * A separação importa em cada método: o que se edita aqui mora em `User`
 * (global, sem `tenantId`), e o tenant entra só para resolver o PAPEL, que é
 * quem decide o que a tela mostra e o que o endpoint aceita. Por isso todo
 * método carrega o papel antes de agir — `assertRole` é a barreira real, e o
 * `can*` do payload é só o espelho dela (regra 3).
 */
@Injectable()
export class MyProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(MAIL_ADAPTER) private readonly mail: MailAdapter,
    @Inject(PAYMENT_ADAPTER) private readonly payments: PaymentAdapter,
    @Inject(STORAGE_ADAPTER) private readonly storage: StorageAdapter,
  ) {}

  // ── Leitura ───────────────────────────────────────────────────────────────

  async get(userId: string, tenantId: string): Promise<MyProfile> {
    const { user, membership, tenant, barber } = await this.load(userId, tenantId);
    const role = membership.role;

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      // O barbeiro entra no produto pelo convite da Equipe, e o telefone dele
      // fica em `Barber.phone` — `User.phone` só nasce preenchido em quem se
      // cadastrou pelo site. Sem esta queda, o profissional abriria a tela com
      // o campo VAZIO enquanto a aba Equipe mostra o número dele: parece dado
      // perdido, e salvar assim apagaria o contato de verdade.
      phone: user.phone ?? barber?.phone ?? null,
      avatarUrl: user.avatarUrl,
      role,
      roleLabel: ROLE_BADGE_LABEL[role],
      tenantName: tenant.name,
      // O nome do barbeiro é o da ficha da Equipe, e quem a mantém é a
      // administração da barbearia (`DashboardFuncionario.dc.html` l.798).
      // Deixá-lo editar aqui faria a agenda e a comissão mudarem de dono pelas
      // costas do gerente.
      canEditName: role !== MembershipRole.BARBER,
      canUploadAvatar: role !== MembershipRole.BARBER,
      canDeleteAccount: role === MembershipRole.OWNER,
      scheduledDeletion: toScheduledDeletion(tenant.purgeAt),
    };
  }

  // ── Dados pessoais ────────────────────────────────────────────────────────

  /**
   * Salva nome, e-mail e WhatsApp.
   *
   * Quando quem edita é um barbeiro, o e-mail e o telefone vão TAMBÉM para a
   * ficha dele na Equipe: é de lá que o protótipo do funcionário lê os dois
   * campos (`teamData.email`/`whatsapp`), e é `Barber.phone` que o WhatsApp da
   * barbearia usa para falar com o profissional. Gravar só em `User` deixaria
   * a tela dizendo uma coisa e a barbearia mandando mensagem para outra.
   */
  async update(
    userId: string,
    tenantId: string,
    dto: UpdateMyProfileDto,
    request: RequestContext,
  ): Promise<MyProfile> {
    const { user, membership } = await this.load(userId, tenantId);

    if (dto.name !== undefined && dto.name !== user.name && membership.role === MembershipRole.BARBER) {
      throw ApiException.forbidden(
        'Seu nome é mantido pela administração da barbearia. Fale com o dono para alterá-lo.',
      );
    }

    let phone = user.phone;
    if (dto.phone !== undefined) {
      if (dto.phone === null) {
        phone = null;
      } else {
        const normalized = normalizePhone(dto.phone);
        if (!normalized) {
          throw ApiException.badRequest('WhatsApp inválido. Use DDD + número.');
        }
        phone = normalized;
      }
    }

    const email = dto.email ?? user.email;
    if (email !== user.email) {
      // `User.email` é `@unique` e é a credencial de login: deixar o Prisma
      // estourar aqui viraria 500 e, pior, o P2002 não diz nada ao formulário.
      const taken = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
      if (taken && taken.id !== user.id) {
        throw ApiException.conflict('Este e-mail já está em uso.', 'EMAIL_IN_USE');
      }
    }

    const name = dto.name ?? user.name;

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { name, email, phone } });

      // Só as fichas DESTE usuário, em qualquer barbearia onde ele atenda: o
      // contato é da pessoa, e ela é a mesma nas duas casas.
      await tx.barber.updateMany({
        where: { userId: user.id, deletedAt: null },
        data: { email, phone },
      });
    });

    await this.audit.record(
      {
        action: AuditAction.USER_PROFILE_UPDATED,
        entity: 'User',
        entityId: user.id,
        tenantId,
        actorUserId: user.id,
        metadata: {
          nameChanged: name !== user.name,
          emailChanged: email !== user.email,
          phoneChanged: phone !== user.phone,
        },
      },
      request,
    );

    return this.get(userId, tenantId);
  }

  // ── Foto ──────────────────────────────────────────────────────────────────

  async uploadAvatar(
    userId: string,
    tenantId: string,
    file: UploadedImageFile | undefined,
    request: RequestContext,
  ): Promise<MyProfile> {
    const { user } = await this.assertCanUploadAvatar(userId, tenantId);
    if (!file) {
      throw ApiException.badRequest('Nenhum arquivo enviado.');
    }

    const stored = await this.storage.put({
      // A foto é da PESSOA, mas o storage é particionado por barbearia — a
      // pasta do tenant ativo é o lugar honesto para ela: é a barbearia de
      // onde o upload partiu, e nenhuma outra passa a enxergar o arquivo por
      // isso (a URL é pública de qualquer jeito, como o logo).
      tenantId,
      folder: 'perfil',
      mimeType: file.mimetype,
      buffer: file.buffer,
    });

    // Grava a nova ANTES de apagar a antiga: falhando o banco, o registro
    // segue apontando para um arquivo que existe.
    await this.prisma.user.update({ where: { id: user.id }, data: { avatarUrl: stored.url } });
    await this.discardStored(user.avatarUrl);

    await this.audit.record(
      {
        action: AuditAction.USER_AVATAR_UPDATED,
        entity: 'User',
        entityId: user.id,
        tenantId,
        actorUserId: user.id,
      },
      request,
    );

    return this.get(userId, tenantId);
  }

  async removeAvatar(userId: string, tenantId: string, request: RequestContext): Promise<MyProfile> {
    const { user } = await this.assertCanUploadAvatar(userId, tenantId);

    await this.prisma.user.update({ where: { id: user.id }, data: { avatarUrl: null } });
    await this.discardStored(user.avatarUrl);

    await this.audit.record(
      {
        action: AuditAction.USER_AVATAR_UPDATED,
        entity: 'User',
        entityId: user.id,
        tenantId,
        actorUserId: user.id,
        metadata: { removed: true },
      },
      request,
    );

    return this.get(userId, tenantId);
  }

  // ── LGPD ──────────────────────────────────────────────────────────────────

  /**
   * "Baixar meus dados" (l.2802). O protótipo prometia um e-mail "em até 48h";
   * aqui o arquivo sai na hora — não há nada a processar em lote, e mandar a
   * pessoa esperar dois dias por uma consulta de meio segundo é fricção sem
   * contrapartida.
   */
  async exportData(
    userId: string,
    tenantId: string,
    request: RequestContext,
  ): Promise<ExportedUserData> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        createdAt: true,
        lastLoginAt: true,
        emailVerifiedAt: true,
        client: { select: { id: true } },
        memberships: {
          where: { tenant: { deletedAt: null } },
          orderBy: { createdAt: 'asc' },
          select: {
            role: true,
            createdAt: true,
            tenant: { select: { name: true, slug: true } },
          },
        },
        barbers: {
          where: { deletedAt: null },
          select: {
            name: true,
            specialty: true,
            email: true,
            phone: true,
            hiredAt: true,
            active: true,
            tenant: { select: { name: true } },
          },
        },
      },
    });
    if (!user) {
      throw ApiException.unauthenticated();
    }

    const [sessions, activity] = await Promise.all([
      this.prisma.authSession.findMany({
        where: { userId, revokedAt: null },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true, expiresAt: true, lastUsedAt: true, userAgent: true, ip: true },
      }),
      this.prisma.auditLog.findMany({
        where: { actorUserId: userId },
        orderBy: { createdAt: 'desc' },
        take: EXPORT_ACTIVITY_LIMIT,
        select: { action: true, entity: true, createdAt: true, ip: true },
      }),
    ]);

    await this.audit.record(
      {
        action: AuditAction.USER_DATA_EXPORTED,
        entity: 'User',
        entityId: userId,
        tenantId,
        actorUserId: userId,
      },
      request,
    );

    return {
      exportedAt: new Date().toISOString(),
      profile: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        createdAt: user.createdAt.toISOString(),
        lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
        emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
        hasClientAccount: user.client !== null,
      },
      memberships: user.memberships.map((membership) => ({
        tenantName: membership.tenant.name,
        tenantSlug: membership.tenant.slug,
        role: membership.role,
        since: membership.createdAt.toISOString(),
      })),
      barberProfiles: user.barbers.map((barber) => ({
        tenantName: barber.tenant.name,
        name: barber.name,
        specialty: barber.specialty,
        email: barber.email,
        phone: barber.phone,
        hiredAt: barber.hiredAt?.toISOString() ?? null,
        active: barber.active,
      })),
      sessions: sessions.map((session) => ({
        createdAt: session.createdAt.toISOString(),
        expiresAt: session.expiresAt.toISOString(),
        lastUsedAt: session.lastUsedAt.toISOString(),
        userAgent: session.userAgent,
        ip: session.ip,
      })),
      activity: activity.map((entry) => ({
        action: entry.action,
        entity: entry.entity,
        createdAt: entry.createdAt.toISOString(),
        ip: entry.ip,
      })),
    };
  }

  /**
   * "Solicitar exclusão dos meus dados" (`DashboardFuncionario.dc.html` l.840).
   *
   * Quem não é dono não apaga a barbearia — o pedido vai para quem de fato
   * controla o tratamento desses dados, que é o dono. O modal do protótipo diz
   * exatamente isso ("Sua solicitação será enviada ao administrador"), e aqui
   * ela vira e-mail de verdade + trilha de auditoria, não um toast.
   */
  async requestDataDeletion(
    userId: string,
    tenantId: string,
    request: RequestContext,
  ): Promise<void> {
    const { user, membership, tenant } = await this.load(userId, tenantId);

    if (membership.role === MembershipRole.OWNER) {
      throw ApiException.badRequest(
        'Você é o dono desta barbearia — use "Excluir minha conta" para encerrar a conta.',
      );
    }

    const owners = await this.prisma.membership.findMany({
      where: { tenantId, role: MembershipRole.OWNER, active: true },
      select: { user: { select: { email: true, name: true } } },
    });

    for (const owner of owners) {
      await this.mail.send({
        tenantId,
        to: owner.user.email,
        subject: `Pedido de exclusão de dados — ${user.name}`,
        body:
          `${user.name} (${ROLE_BADGE_LABEL[membership.role]} em ${tenant.name}) solicitou a ` +
          'exclusão dos dados pessoais dele, pela tela "Meu perfil".\n\n' +
          'Como responsável pelo tratamento dos dados da barbearia, cabe a você atender ao ' +
          'pedido. Dados vinculados a obrigações legais (comissões, registros fiscais) podem ' +
          'ser mantidos pelo prazo exigido por lei.\n\n' +
          `Contato: ${user.email}`,
        payload: { requesterUserId: user.id, role: membership.role },
      });
    }

    await this.audit.record(
      {
        action: AuditAction.USER_DATA_DELETION_REQUESTED,
        entity: 'User',
        entityId: user.id,
        tenantId,
        actorUserId: user.id,
        metadata: { role: membership.role, ownersNotified: owners.length },
      },
      request,
    );
  }

  // ── Exclusão da conta (dono) ──────────────────────────────────────────────

  /**
   * "Excluir minha conta" (l.2811 + `modalExcluirConta` l.3511).
   *
   * NÃO apaga nada agora. O modal promete 30 dias para reativar, e a única
   * forma de cumprir isso é agendar: `purgeAt` marca o dia da faxina, o status
   * vira `CANCELED` e a assinatura é cancelada no gateway — o dono para de ser
   * cobrado imediatamente, como o texto diz, mas continua entrando no painel e
   * pode desistir até o último dia.
   *
   * `deletedAt` fica de fora de propósito: ele é o "já era" que o login e o
   * `TenantGuard` filtram, e marcá-lo aqui trancaria o dono para fora
   * justamente na janela em que ele deveria poder voltar atrás.
   */
  async requestAccountDeletion(
    userId: string,
    tenantId: string,
    confirm: string,
    request: RequestContext,
  ): Promise<MyProfile> {
    const { user, tenant } = await this.assertOwner(userId, tenantId);

    if (confirm !== ACCOUNT_DELETION_CONFIRM_WORD) {
      throw ApiException.badRequest(`Digite ${ACCOUNT_DELETION_CONFIRM_WORD} para confirmar.`);
    }
    if (tenant.purgeAt) {
      throw ApiException.conflict(
        'A exclusão desta conta já está agendada.',
        'DELETION_ALREADY_SCHEDULED',
      );
    }

    const now = new Date();
    const purgeAt = new Date(now.getTime() + ACCOUNT_DELETION_GRACE_DAYS * DAY_MS);

    const subscription = await this.prisma.tenantSubscription.findFirst({
      where: { tenantId, status: { not: SubscriptionStatus.CANCELED } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, externalId: true },
    });

    // Cancelar no gateway ANTES do banco: a próxima cobrança é o que mais dói
    // se algo falhar no meio, e o `cancelCharge` do driver é idempotente.
    if (subscription?.externalId) {
      await this.payments.cancelCharge(subscription.externalId);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.tenant.update({
        where: { id: tenantId },
        data: { status: TenantStatus.CANCELED, purgeAt },
      });
      if (subscription) {
        await tx.tenantSubscription.update({
          where: { id: subscription.id },
          data: { status: SubscriptionStatus.CANCELED, canceledAt: now },
        });
      }
    });

    await this.mail.send({
      tenantId,
      to: user.email,
      subject: `Exclusão de ${tenant.name} agendada`,
      body:
        `Recebemos o pedido de exclusão de ${tenant.name}.\n\n` +
        `Os dados serão apagados definitivamente em ${purgeAt.toLocaleDateString('pt-BR')} ` +
        `(${ACCOUNT_DELETION_GRACE_DAYS} dias). Até lá você continua entrando normalmente e ` +
        'pode desistir em "Meu perfil".\n\n' +
        'Sua assinatura já foi cancelada — não haverá novas cobranças.',
      payload: { purgeAt: purgeAt.toISOString() },
    });

    await this.audit.record(
      {
        action: AuditAction.ACCOUNT_DELETION_REQUESTED,
        entity: 'Tenant',
        entityId: tenantId,
        tenantId,
        actorUserId: user.id,
        metadata: { purgeAt: purgeAt.toISOString(), subscriptionId: subscription?.id ?? null },
      },
      request,
    );

    return this.get(userId, tenantId);
  }

  /** Desistir dentro da janela. A assinatura NÃO volta sozinha — ver nota abaixo. */
  async cancelAccountDeletion(
    userId: string,
    tenantId: string,
    request: RequestContext,
  ): Promise<MyProfile> {
    const { user, tenant } = await this.assertOwner(userId, tenantId);

    if (!tenant.purgeAt) {
      throw ApiException.conflict(
        'Não há exclusão agendada para esta conta.',
        'DELETION_NOT_SCHEDULED',
      );
    }

    // Volta a `TRIAL`, e não a `ACTIVE`: a assinatura foi cancelada no gateway
    // e não se ressuscita uma cobrança recorrente por conta própria. O dono
    // reativa escolhendo um plano em Configurações → Plano e cobrança, que é o
    // caminho que já cria a assinatura pelo `PAYMENT_ADAPTER`.
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { status: TenantStatus.TRIAL, purgeAt: null },
    });

    await this.audit.record(
      {
        action: AuditAction.ACCOUNT_DELETION_CANCELED,
        entity: 'Tenant',
        entityId: tenantId,
        tenantId,
        actorUserId: user.id,
      },
      request,
    );

    return this.get(userId, tenantId);
  }

  // ── Internos ──────────────────────────────────────────────────────────────

  private async load(userId: string, tenantId: string) {
    const [user, membership, tenant, barber] = await Promise.all([
      this.prisma.user.findFirst({
        where: { id: userId, active: true },
        select: { id: true, name: true, email: true, phone: true, avatarUrl: true },
      }),
      this.prisma.membership.findFirst({
        where: { userId, tenantId, active: true },
        select: { role: true },
      }),
      this.prisma.tenant.findFirst({
        where: { id: tenantId, deletedAt: null },
        select: { id: true, name: true, purgeAt: true },
      }),
      // A ficha DESTE usuário nesta barbearia, quando ele atende. Serve só de
      // origem do contato quando o `User` ainda não tem telefone próprio.
      this.prisma.barber.findFirst({
        where: { userId, tenantId, deletedAt: null },
        select: { phone: true },
      }),
    ]);

    if (!user) {
      throw ApiException.unauthenticated();
    }
    // Sem membership não há papel, e sem papel não há tela: é o caso do super
    // admin impersonando, que não tem perfil PRÓPRIO nesta barbearia.
    if (!membership || !tenant) {
      throw ApiException.forbidden('Você não tem perfil nesta barbearia.');
    }

    return { user, membership, tenant, barber };
  }

  private async assertCanUploadAvatar(userId: string, tenantId: string) {
    const loaded = await this.load(userId, tenantId);
    if (loaded.membership.role === MembershipRole.BARBER) {
      throw ApiException.forbidden(
        'Sua foto é mantida pela administração da barbearia, na aba Equipe.',
      );
    }
    return loaded;
  }

  private async assertOwner(userId: string, tenantId: string) {
    const loaded = await this.load(userId, tenantId);
    if (loaded.membership.role !== MembershipRole.OWNER) {
      throw ApiException.forbidden('Só o dono da barbearia pode excluir a conta.');
    }
    return loaded;
  }

  private async discardStored(url: string | null | undefined): Promise<void> {
    if (!url) return;
    const key = this.storage.keyFromUrl(url);
    if (key) {
      await this.storage.remove(key);
    }
  }
}

/** `purgeAt` → o que a tela precisa mostrar no bloco "ATENÇÃO". */
export function toScheduledDeletion(
  purgeAt: Date | null,
  now: Date = new Date(),
): ScheduledDeletion | null {
  if (!purgeAt) return null;
  return {
    purgeAt: purgeAt.toISOString(),
    daysLeft: Math.max(0, Math.ceil((purgeAt.getTime() - now.getTime()) / DAY_MS)),
  };
}

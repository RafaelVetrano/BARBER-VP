import { Inject, Injectable } from '@nestjs/common';
import { StaffInviteStatus } from '@prisma/client';
import { normalizeMobilePhone, type StaffInviteListItem, type StaffInvitePreview } from '@barbervp/types';
import { CONFIG, type AppConfig } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { ApiException } from '../common/errors/api.exception';
import { AuditAction, AuditService } from '../audit/audit.service';
import { MAIL_ADAPTER, type MailAdapter } from '../adapters/mail/mail.adapter';
import { hashSecret, randomSecret, secretMatches } from '../auth/crypto/secret-hash';
import { PasswordService } from '../auth/crypto/password.service';
import { EstablishmentAuthService, type IssuedAuth } from '../auth/establishment-auth.service';
import type { AuthPrincipal, RequestContext } from '../common/types/request-context';
import { PlanLimitsService } from './plan-limits.service';
import type { AcceptStaffInviteDto, CreateStaffInviteDto } from './dto/team.dto';

/** Convite vale 7 dias — depois disso, o dono manda um novo (`resend`). */
const INVITE_TTL_DAYS = 7;

/**
 * Convite de funcionário (`CadastroFuncionario.dc.html`).
 *
 * Mesmo padrão de token opaco do `PasswordResetToken` (id + segredo, hash
 * HMAC com o pepper do refresh) — o segredo nunca é gravado em claro, e a
 * validação é tempo-constante.
 */
@Injectable()
export class InvitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly planLimits: PlanLimitsService,
    private readonly passwords: PasswordService,
    private readonly establishmentAuth: EstablishmentAuthService,
    @Inject(CONFIG) private readonly config: AppConfig,
    @Inject(MAIL_ADAPTER) private readonly mail: MailAdapter,
  ) {}

  async list(tenantId: string): Promise<StaffInviteListItem[]> {
    const rows = await this.prisma.staffInvite.findMany({
      where: { tenantId },
      include: { invitedBy: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toItem);
  }

  async create(
    tenantId: string,
    dto: CreateStaffInviteDto,
    principal: AuthPrincipal,
    request: RequestContext,
  ): Promise<StaffInviteListItem> {
    await this.planLimits.assertCanAddBarber(tenantId);
    await this.assertServicesBelongToTenant(tenantId, dto.serviceIds);

    const email = dto.email.trim().toLowerCase();

    const [existingUser, pendingInvite, tenant] = await Promise.all([
      this.prisma.user.findUnique({
        where: { email },
        select: { memberships: { where: { tenantId }, select: { id: true } } },
      }),
      this.prisma.staffInvite.findFirst({
        where: { tenantId, email, status: StaffInviteStatus.PENDING },
        select: { id: true },
      }),
      this.prisma.tenant.findFirst({ where: { id: tenantId }, select: { name: true } }),
    ]);

    if (existingUser && existingUser.memberships.length > 0) {
      throw ApiException.conflict('Este e-mail já faz parte da equipe.');
    }
    if (pendingInvite) {
      throw ApiException.conflict('Já existe um convite pendente para este e-mail.');
    }

    const secret = randomSecret();
    const created = await this.prisma.staffInvite.create({
      data: {
        tenantId,
        email,
        phone: dto.phone ? normalizeMobilePhone(dto.phone) : null,
        name: dto.name.trim(),
        serviceIds: dto.serviceIds,
        workDays: dto.workDays,
        tokenHash: hashSecret(secret, this.config.jwt.refreshSecret),
        expiresAt: this.expiresAt(),
        invitedByUserId: principal.id,
      },
      include: { invitedBy: { select: { name: true } } },
    });

    await this.sendInviteMail(created.id, secret, dto.name, email, tenant?.name ?? 'BarberVP', tenantId);

    await this.audit.record(
      {
        action: AuditAction.STAFF_INVITED,
        entity: 'StaffInvite',
        entityId: created.id,
        tenantId,
        actorUserId: principal.id,
        metadata: { email },
      },
      request,
    );

    return toItem(created);
  }

  async resend(
    tenantId: string,
    id: string,
    principal: AuthPrincipal,
    request: RequestContext,
  ): Promise<StaffInviteListItem> {
    const invite = await this.loadPending(tenantId, id);
    const tenant = await this.prisma.tenant.findFirst({ where: { id: tenantId }, select: { name: true } });

    const secret = randomSecret();
    const updated = await this.prisma.staffInvite.update({
      where: { id: invite.id },
      data: { tokenHash: hashSecret(secret, this.config.jwt.refreshSecret), expiresAt: this.expiresAt() },
      include: { invitedBy: { select: { name: true } } },
    });

    await this.sendInviteMail(
      updated.id,
      secret,
      updated.name,
      updated.email,
      tenant?.name ?? 'BarberVP',
      tenantId,
    );

    await this.audit.record(
      {
        action: AuditAction.STAFF_INVITE_RESENT,
        entity: 'StaffInvite',
        entityId: updated.id,
        tenantId,
        actorUserId: principal.id,
      },
      request,
    );

    return toItem(updated);
  }

  async revoke(
    tenantId: string,
    id: string,
    principal: AuthPrincipal,
    request: RequestContext,
  ): Promise<StaffInviteListItem> {
    const invite = await this.loadPending(tenantId, id);

    const updated = await this.prisma.staffInvite.update({
      where: { id: invite.id },
      data: { status: StaffInviteStatus.REVOKED, revokedAt: new Date() },
      include: { invitedBy: { select: { name: true } } },
    });

    await this.audit.record(
      {
        action: AuditAction.STAFF_INVITE_REVOKED,
        entity: 'StaffInvite',
        entityId: updated.id,
        tenantId,
        actorUserId: principal.id,
      },
      request,
    );

    return toItem(updated);
  }

  // ── Fluxo público (sem tenant/sessão resolvidos) ────────────────────────

  async preview(token: string): Promise<StaffInvitePreview> {
    const { id, secret } = this.splitToken(token);

    const invite = await this.prisma.staffInvite.findUnique({
      where: { id },
      include: { tenant: { select: { name: true } } },
    });

    if (!invite) {
      throw ApiException.notFound('Convite não encontrado.');
    }

    const services = await this.prisma.service.findMany({
      where: { id: { in: invite.serviceIds } },
      select: { name: true },
    });

    const expired = invite.expiresAt.getTime() <= Date.now();
    const tokenOk = secretMatches(secret, invite.tokenHash, this.config.jwt.refreshSecret);
    const valid = tokenOk && invite.status === StaffInviteStatus.PENDING && !expired;

    return {
      tenantName: invite.tenant.name,
      name: invite.name,
      email: invite.email,
      serviceNames: services.map((service) => service.name),
      workDays: invite.workDays,
      expiresAt: invite.expiresAt.toISOString(),
      valid,
      invalidReason: valid
        ? null
        : invite.status === StaffInviteStatus.ACCEPTED
          ? 'ACCEPTED'
          : invite.status === StaffInviteStatus.REVOKED
            ? 'REVOKED'
            : 'EXPIRED',
    };
  }

  /**
   * Aceita o convite: `User` (se ainda não existir) + `Membership` BARBER +
   * `Barber` + `WorkSchedule` dos dias pré-definidos + `BarberService` dos
   * serviços pré-marcados, tudo em uma transação — mesma regra 4 do registro
   * de estabelecimento.
   */
  async accept(dto: AcceptStaffInviteDto, request: RequestContext): Promise<IssuedAuth> {
    const { id, secret } = this.splitToken(dto.token);

    const invite = await this.prisma.staffInvite.findUnique({ where: { id } });
    const expired = invite ? invite.expiresAt.getTime() <= Date.now() : true;

    if (
      !invite ||
      expired ||
      invite.status !== StaffInviteStatus.PENDING ||
      !secretMatches(secret, invite.tokenHash, this.config.jwt.refreshSecret)
    ) {
      throw ApiException.badRequest('Convite inválido ou expirado.');
    }

    const passwordHash = await this.passwords.hash(dto.password);

    const userId = await this.prisma.$transaction(async (tx) => {
      let user = await tx.user.findUnique({ where: { email: invite.email }, select: { id: true } });

      if (user) {
        const already = await tx.membership.findFirst({
          where: { userId: user.id, tenantId: invite.tenantId },
          select: { id: true },
        });
        if (already) {
          throw ApiException.conflict('Você já faz parte desta equipe.');
        }
        // Conta de estabelecimento já existe (dono de outra barbearia, por
        // exemplo) — a senha dela continua valendo; o convite não a substitui.
      } else {
        user = await tx.user.create({
          data: { name: invite.name, email: invite.email, phone: invite.phone, passwordHash },
          select: { id: true },
        });
      }

      await tx.membership.create({ data: { userId: user.id, tenantId: invite.tenantId, role: invite.role } });

      const barberCount = await tx.barber.count({ where: { tenantId: invite.tenantId, deletedAt: null } });
      const barber = await tx.barber.create({
        data: {
          tenantId: invite.tenantId,
          userId: user.id,
          name: invite.name,
          phone: invite.phone,
          email: invite.email,
          sortOrder: barberCount,
          barberServices:
            invite.serviceIds.length > 0
              ? { create: invite.serviceIds.map((serviceId) => ({ tenantId: invite.tenantId, serviceId })) }
              : undefined,
        },
        select: { id: true },
      });

      const hours = await tx.tenantBusinessHour.findMany({ where: { tenantId: invite.tenantId } });
      const hourByWeekday = new Map(hours.map((hour) => [hour.weekday, hour]));
      const workDays = new Set(invite.workDays);

      await tx.workSchedule.createMany({
        data: Array.from({ length: 7 }, (_, weekday) => {
          const hour = hourByWeekday.get(weekday);
          const isDayOff = !workDays.has(weekday) || !hour || hour.closed;
          const startTime = hour?.opensAt ?? 540;
          return {
            tenantId: invite.tenantId,
            barberId: barber.id,
            weekday,
            startTime,
            endTime: isDayOff ? startTime + 1 : (hour?.closesAt ?? 1200),
            isDayOff,
          };
        }),
      });

      await tx.staffInvite.update({
        where: { id: invite.id },
        data: { status: StaffInviteStatus.ACCEPTED, acceptedAt: new Date(), barberId: barber.id },
      });

      return user.id;
    });

    await this.audit.record(
      {
        action: AuditAction.STAFF_INVITE_ACCEPTED,
        entity: 'StaffInvite',
        entityId: invite.id,
        tenantId: invite.tenantId,
        actorUserId: userId,
      },
      request,
    );

    return this.establishmentAuth.issueSessionForUser(userId, invite.tenantId, request);
  }

  // ── Internos ──────────────────────────────────────────────────────────────

  private async loadPending(tenantId: string, id: string) {
    const invite = await this.prisma.staffInvite.findFirst({
      where: { id, tenantId, status: StaffInviteStatus.PENDING },
    });
    if (!invite) {
      throw ApiException.notFound('Convite não encontrado ou já resolvido.');
    }
    return invite;
  }

  private async assertServicesBelongToTenant(tenantId: string, serviceIds: string[]): Promise<void> {
    if (serviceIds.length === 0) {
      return;
    }
    const count = await this.prisma.service.count({
      where: { id: { in: serviceIds }, tenantId, deletedAt: null },
    });
    if (count !== serviceIds.length) {
      throw ApiException.badRequest('Um dos serviços selecionados não pertence a esta barbearia.');
    }
  }

  private expiresAt(): Date {
    return new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000);
  }

  private splitToken(token: string): { id: string; secret: string } {
    const separator = token.indexOf('.');
    if (separator <= 0) {
      throw ApiException.badRequest('Convite inválido.');
    }
    return { id: token.slice(0, separator), secret: token.slice(separator + 1) };
  }

  private async sendInviteMail(
    inviteId: string,
    secret: string,
    name: string,
    email: string,
    tenantName: string,
    tenantId: string,
  ): Promise<void> {
    const link = `${this.config.urls.dashboard}/aceitar-convite?token=${inviteId}.${secret}`;
    await this.mail.send({
      tenantId,
      to: email,
      subject: `Convite para a equipe · ${tenantName}`,
      body:
        `Olá, ${name.split(' ')[0]}.\n\n` +
        `${tenantName} te convidou para atender pela plataforma BarberVP.\n` +
        `Crie sua senha para começar — o link vale por ${INVITE_TTL_DAYS} dias:\n\n` +
        `${link}\n\n` +
        `Se não reconhece este convite, pode ignorar este e-mail.`,
      payload: { kind: 'staff-invite', inviteId },
    });
  }
}

function toItem(row: {
  id: string;
  email: string;
  phone: string | null;
  name: string;
  role: string;
  serviceIds: string[];
  workDays: number[];
  status: string;
  expiresAt: Date;
  createdAt: Date;
  invitedBy: { name: string };
}): StaffInviteListItem {
  return {
    id: row.id,
    email: row.email,
    phone: row.phone,
    name: row.name,
    role: row.role as StaffInviteListItem['role'],
    serviceIds: row.serviceIds,
    workDays: row.workDays,
    status: row.status as StaffInviteListItem['status'],
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    invitedByName: row.invitedBy.name,
  };
}

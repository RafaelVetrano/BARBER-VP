import { Inject, Injectable } from '@nestjs/common';
import { Prisma, StaffInviteStatus } from '@prisma/client';
import {
  normalizeMobilePhone,
  type StaffInviteLink,
  type StaffInviteListItem,
  type StaffInvitePreview,
  type WorkScheduleDay,
} from '@barbervp/types';
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

    const schedule = dto.schedule ?? null;
    // Com `schedule`, os dias trabalhados são os que não são folga — deixar o
    // dono mandar `workDays` junto abriria espaço para as duas listas
    // discordarem, e a tela de aceite mostra a segunda.
    const workDays = schedule
      ? schedule.filter((day) => !day.isDayOff).map((day) => day.weekday)
      : (dto.workDays ?? []);

    const secret = randomSecret();
    const created = await this.prisma.staffInvite.create({
      data: {
        tenantId,
        email,
        phone: normalizeInvitePhone(dto.phone),
        name: dto.name.trim(),
        serviceIds: dto.serviceIds,
        workDays,
        schedule: (schedule as Prisma.InputJsonValue | null) ?? Prisma.DbNull,
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

  /**
   * "Gerar link de cadastro" (protótipo l.2145, onde estava
   * "Simular cadastro concluído").
   *
   * O token vive em hash — não há como devolver o que foi enviado por e-mail.
   * Este método REEMITE: o link novo passa a valer e o antigo morre na hora,
   * exatamente como no reenvio, só que sem disparar e-mail. Serve para o dono
   * que está com o barbeiro do lado e conclui o cadastro ali mesmo.
   */
  async issueLink(
    tenantId: string,
    id: string,
    principal: AuthPrincipal,
    request: RequestContext,
  ): Promise<StaffInviteLink> {
    const invite = await this.loadPending(tenantId, id);

    const secret = randomSecret();
    const updated = await this.prisma.staffInvite.update({
      where: { id: invite.id },
      data: { tokenHash: hashSecret(secret, this.config.jwt.refreshSecret), expiresAt: this.expiresAt() },
      select: { id: true, expiresAt: true },
    });

    await this.audit.record(
      {
        action: AuditAction.STAFF_INVITE_LINK_ISSUED,
        entity: 'StaffInvite',
        entityId: updated.id,
        tenantId,
        actorUserId: principal.id,
      },
      request,
    );

    return {
      url: this.inviteLink(updated.id, secret),
      expiresAt: updated.expiresAt.toISOString(),
    };
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
      // O teto do plano é reconferido AQUI, e não só na emissão do convite:
      // entre um e outro o dono pode ter feito downgrade, reativado alguém ou
      // aceito outro convite. Dentro da transação, para que dois aceites
      // simultâneos não passem os dois pela mesma vaga.
      await this.planLimits.assertCanAcceptInvite(tx, invite.tenantId);

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
        // `User.phone` é `@unique` desde o agente 32, e `invite.phone` já nasce
        // normalizado (`normalizeInvitePhone`, na emissão do convite). Se o
        // número já for de outro login, o convidado entra SEM telefone no
        // `User` e repõe em "Meu perfil" — a mesma escolha do vínculo
        // cliente→dono: recusar o aceite por um dado que o convidado não
        // digitou custaria a vaga na equipe. O `Barber` abaixo continua com o
        // número: a unicidade é do login, não da ficha do profissional.
        const phoneTaken = invite.phone
          ? await tx.user.findUnique({ where: { phone: invite.phone }, select: { id: true } })
          : null;

        user = await tx.user.create({
          data: {
            name: invite.name,
            email: invite.email,
            phone: phoneTaken ? null : invite.phone,
            passwordHash,
          },
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

      await tx.workSchedule.createMany({
        data: (await this.scheduleForInvite(tx, invite)).map((day) => ({
          tenantId: invite.tenantId,
          barberId: barber.id,
          ...day,
        })),
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

  /**
   * A escala com que o barbeiro nasce.
   *
   * Preferência para a semana montada no modal (`schedule`), que traz almoço e
   * horários dia a dia. Sem ela — convites emitidos antes desta auditoria —
   * cai no horário de funcionamento da barbearia filtrado por `workDays`, que
   * era o comportamento anterior.
   */
  private async scheduleForInvite(
    tx: Prisma.TransactionClient,
    invite: { tenantId: string; workDays: number[]; schedule: Prisma.JsonValue },
  ): Promise<
    Array<{
      weekday: number;
      startTime: number;
      endTime: number;
      lunchStart: number | null;
      lunchEnd: number | null;
      isDayOff: boolean;
    }>
  > {
    const stored = Array.isArray(invite.schedule)
      ? (invite.schedule as unknown as WorkScheduleDay[])
      : null;

    if (stored && stored.length > 0) {
      const byWeekday = new Map(stored.map((day) => [day.weekday, day]));
      return Array.from({ length: 7 }, (_, weekday) => {
        const day = byWeekday.get(weekday);
        const isDayOff = day?.isDayOff ?? true;
        const startTime = day?.startTime ?? 540;
        return {
          weekday,
          startTime,
          endTime: isDayOff ? startTime + 1 : (day?.endTime ?? 1200),
          lunchStart: isDayOff ? null : (day?.lunchStart ?? null),
          lunchEnd: isDayOff ? null : (day?.lunchEnd ?? null),
          isDayOff,
        };
      });
    }

    const hours = await tx.tenantBusinessHour.findMany({ where: { tenantId: invite.tenantId } });
    const hourByWeekday = new Map(hours.map((hour) => [hour.weekday, hour]));
    const workDays = new Set(invite.workDays);

    return Array.from({ length: 7 }, (_, weekday) => {
      const hour = hourByWeekday.get(weekday);
      const isDayOff = !workDays.has(weekday) || !hour || hour.closed;
      const startTime = hour?.opensAt ?? 540;
      return {
        weekday,
        startTime,
        endTime: isDayOff ? startTime + 1 : (hour?.closesAt ?? 1200),
        lunchStart: null,
        lunchEnd: null,
        isDayOff,
      };
    });
  }

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

  private inviteLink(inviteId: string, secret: string): string {
    return `${this.config.urls.dashboard}/aceitar-convite?token=${inviteId}.${secret}`;
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
    const link = this.inviteLink(inviteId, secret);
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

/** Mesma regra do cadastro de barbeiro: número quebrado recusa, vazio passa. */
function normalizeInvitePhone(input: string | null | undefined): string | null {
  if (!input || input.trim() === '') {
    return null;
  }
  const normalized = normalizeMobilePhone(input);
  if (!normalized) {
    throw ApiException.badRequest('WhatsApp inválido. Use DDD + 9 dígitos.');
  }
  return normalized;
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

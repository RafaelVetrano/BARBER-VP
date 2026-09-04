import { Injectable } from '@nestjs/common';
import { MembershipRole, Prisma, TenantStatus } from '@prisma/client';
import type {
  AdminTenantDetail,
  AdminTenantListItem,
  AdminTenantListQuery,
  AdminTenantListResponse,
  ChangeTenantPlanDto as ChangeTenantPlanContract,
  ImpersonateResultDto,
} from '@barbervp/types';
import { PrismaService } from '../../prisma/prisma.service';
import { ApiException } from '../../common/errors/api.exception';
import { AuditAction, AuditService } from '../../audit/audit.service';
import type { RequestContext } from '../../common/types/request-context';
import { pageWindow, toPaginated } from '../../common/dto/pagination.dto';
import { EstablishmentAuthService } from '../../auth/establishment-auth.service';
import { PlanLimitsService } from '../../team/plan-limits.service';

function monthStart(date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}
function nextMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
}

@Injectable()
export class AdminTenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly establishmentAuth: EstablishmentAuthService,
    private readonly planLimits: PlanLimitsService,
  ) {}

  /**
   * Lista com uso agregado (nº de barbeiros ativos, agendamentos no mês) —
   * DUAS queries de `groupBy` além da paginação principal, nunca uma consulta
   * de uso por linha (é o "não N+1" que o enunciado pede, mesmo não sendo
   * relatório).
   */
  async list(query: AdminTenantListQuery): Promise<AdminTenantListResponse> {
    const window = pageWindow(query.page, query.perPage);
    const where: Prisma.TenantWhereInput = {
      deletedAt: null,
      ...(query.status ? { status: query.status as TenantStatus } : {}),
      ...(query.planId ? { planId: query.planId } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { slug: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.tenant.findMany({
        where,
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          createdAt: true,
          purgeAt: true,
          plan: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: window.skip,
        take: window.take,
      }),
      this.prisma.tenant.count({ where }),
    ]);

    const tenantIds = rows.map((row) => row.id);
    const from = monthStart();
    const to = nextMonth(from);

    const [barberCounts, appointmentCounts, impersonations] = await Promise.all([
      this.prisma.barber.groupBy({
        by: ['tenantId'],
        where: { tenantId: { in: tenantIds }, active: true },
        _count: true,
      }),
      this.prisma.appointment.groupBy({
        by: ['tenantId'],
        where: { tenantId: { in: tenantIds }, startsAt: { gte: from, lt: to } },
        _count: true,
      }),
      // Uma consulta para a página inteira, não uma por linha.
      this.prisma.authSession.findMany({
        where: {
          tenantId: { in: tenantIds },
          impersonatedBy: { not: null },
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        select: { tenantId: true },
        distinct: ['tenantId'],
      }),
    ]);
    const barberMap = new Map(barberCounts.map((row) => [row.tenantId, row._count]));
    const apptMap = new Map(appointmentCounts.map((row) => [row.tenantId, row._count]));
    const impersonated = new Set(
      impersonations.map((row) => row.tenantId).filter((id): id is string => id !== null),
    );

    const items: AdminTenantListItem[] = rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      status: row.status,
      planName: row.plan?.name ?? null,
      barberCount: barberMap.get(row.id) ?? 0,
      appointmentsThisMonth: apptMap.get(row.id) ?? 0,
      createdAt: row.createdAt.toISOString(),
      purgeAt: row.purgeAt?.toISOString() ?? null,
      impersonationActive: impersonated.has(row.id),
    }));

    return toPaginated(items, total, window);
  }

  async detail(id: string): Promise<AdminTenantDetail> {
    const from = monthStart();
    const to = nextMonth(from);

    const tenant = await this.prisma.tenant.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        document: true,
        email: true,
        phone: true,
        createdAt: true,
        purgeAt: true,
        plan: { select: { id: true, name: true, priceCents: true } },
        subscriptions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { status: true, currentPeriodEnd: true, failedAttempts: true },
        },
        memberships: {
          where: { active: true },
          select: { role: true, user: { select: { id: true, name: true, email: true, active: true } } },
        },
      },
    });
    if (!tenant) {
      throw ApiException.notFound('Tenant não encontrado.');
    }

    const [barberCount, clientCount, appointmentsThisMonth, revenue, impersonations] =
      await Promise.all([
        this.prisma.barber.count({ where: { tenantId: id, active: true } }),
        this.prisma.clientProfile.count({ where: { tenantId: id, deletedAt: null } }),
        this.prisma.appointment.count({ where: { tenantId: id, startsAt: { gte: from, lt: to } } }),
        this.prisma.order.aggregate({
          where: { tenantId: id, status: 'CLOSED', closedAt: { gte: from, lt: to } },
          _sum: { totalCents: true },
        }),
        this.prisma.authSession.count({
          where: {
            tenantId: id,
            impersonatedBy: { not: null },
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
        }),
      ]);

    const subscription = tenant.subscriptions[0];

    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      status: tenant.status,
      document: tenant.document,
      email: tenant.email,
      phone: tenant.phone,
      createdAt: tenant.createdAt.toISOString(),
      plan: tenant.plan,
      subscription: subscription
        ? {
            status: subscription.status,
            currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
            failedAttempts: subscription.failedAttempts,
          }
        : null,
      metrics: {
        barberCount,
        clientCount,
        appointmentsThisMonth,
        revenueThisMonthCents: revenue._sum.totalCents ?? 0,
      },
      memberships: tenant.memberships.map((membership) => ({
        userId: membership.user.id,
        name: membership.user.name,
        email: membership.user.email,
        role: membership.role,
        active: membership.user.active,
      })),
      purgeAt: tenant.purgeAt?.toISOString() ?? null,
      impersonationActive: impersonations > 0,
    };
  }

  async suspend(id: string, actorUserId: string, request: RequestContext): Promise<void> {
    const tenant = await this.prisma.tenant.findFirst({ where: { id, deletedAt: null }, select: { id: true, status: true } });
    if (!tenant) {
      throw ApiException.notFound('Tenant não encontrado.');
    }
    await this.prisma.tenant.update({ where: { id }, data: { status: TenantStatus.SUSPENDED } });
    await this.audit.record(
      { action: AuditAction.ADMIN_TENANT_SUSPENDED, entity: 'Tenant', entityId: id, tenantId: id, actorUserId },
      request,
    );
  }

  async reactivate(id: string, actorUserId: string, request: RequestContext): Promise<void> {
    const tenant = await this.prisma.tenant.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
    if (!tenant) {
      throw ApiException.notFound('Tenant não encontrado.');
    }
    await this.prisma.tenant.update({ where: { id }, data: { status: TenantStatus.ACTIVE } });
    await this.audit.record(
      { action: AuditAction.ADMIN_TENANT_REACTIVATED, entity: 'Tenant', entityId: id, tenantId: id, actorUserId },
      request,
    );
  }

  async changePlan(
    id: string,
    dto: ChangeTenantPlanContract,
    actorUserId: string,
    request: RequestContext,
  ): Promise<void> {
    const [tenant, plan] = await Promise.all([
      this.prisma.tenant.findFirst({ where: { id, deletedAt: null }, select: { id: true } }),
      this.prisma.saasPlan.findFirst({ where: { id: dto.planId }, select: { id: true, maxBarbers: true } }),
    ]);
    if (!tenant) {
      throw ApiException.notFound('Tenant não encontrado.');
    }
    if (!plan) {
      throw ApiException.notFound('Plano não encontrado.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.tenant.update({ where: { id }, data: { planId: dto.planId } });
      // Mesma regra da troca feita pelo dono (`SettingsService.changePlan`):
      // o teto de barbeiros do plano novo é aplicado na hora, marcando os
      // excedentes como "Inativo pelo plano". Sem isto, um downgrade feito
      // pelo super admin deixaria a barbearia acima do teto sem nenhum sinal.
      await this.planLimits.applyPlanLimit(tx, id, plan.maxBarbers);

      const subscription = await tx.tenantSubscription.findFirst({ where: { tenantId: id }, orderBy: { createdAt: 'desc' } });
      if (subscription) {
        await tx.tenantSubscription.update({ where: { id: subscription.id }, data: { planId: dto.planId } });
      }
    });

    await this.audit.record(
      {
        action: AuditAction.ADMIN_TENANT_PLAN_CHANGED,
        entity: 'Tenant',
        entityId: id,
        tenantId: id,
        actorUserId,
        metadata: { planId: dto.planId },
      },
      request,
    );
  }

  /**
   * Impersonar o `OWNER` do tenant — a ação mais sensível deste módulo.
   *
   * Reusa `EstablishmentAuthService.issueSessionForUser` (o MESMO caminho do
   * aceite de convite de equipe, fase 06): o token resultante tem `sub` =
   * o id do PRÓPRIO OWNER, não do super admin, então RBAC e toda a API
   * enxergam exatamente a sessão que o dono teria. A diferença de propósito:
   * aqui o refresh NUNCA é exposto ao cliente (nem cookie, nem corpo) — só o
   * access token curto (TTL global de `JWT_ACCESS_TTL`, ~15min) vai para o
   * front do admin, que repassa por fragmento de URL para o dashboard. Sem
   * refresh, a sessão impersonada expira sozinha e não há como renová-la.
   */
  async impersonate(id: string, actorUserId: string, request: RequestContext): Promise<ImpersonateResultDto> {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, slug: true, status: true },
    });
    if (!tenant) {
      throw ApiException.notFound('Tenant não encontrado.');
    }
    if (tenant.status === TenantStatus.SUSPENDED) {
      throw ApiException.conflict('Tenant suspenso — reative antes de impersonar.', 'TENANT_SUSPENDED');
    }

    const owner = await this.prisma.membership.findFirst({
      where: { tenantId: id, role: MembershipRole.OWNER, active: true, user: { active: true } },
      select: { user: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    if (!owner) {
      throw ApiException.notFound('Este tenant não tem um OWNER ativo para impersonar.');
    }

    // `actorUserId` vai junto: é ele que MARCA a sessão como impersonação e
    // torna possível encerrá-la à força depois (`revokeImpersonations`).
    const issued = await this.establishmentAuth.issueSessionForUser(
      owner.user.id,
      id,
      request,
      actorUserId,
    );

    // Auditoria pesada de propósito: quem (super admin), o quê (impersonação),
    // sobre quem (o OWNER alvo) e onde (tenant) — tudo numa entrada só, e o
    // `AuditService.record` já grava IP/user-agent de toda entrada.
    await this.audit.record(
      {
        action: AuditAction.ADMIN_TENANT_IMPERSONATED,
        entity: 'Tenant',
        entityId: id,
        tenantId: id,
        actorUserId,
        metadata: { targetOwnerUserId: owner.user.id, targetOwnerName: owner.user.name },
      },
      request,
    );

    return {
      accessToken: issued.session.accessToken,
      expiresIn: issued.session.expiresIn,
      tenantId: id,
      tenantSlug: tenant.slug,
      ownerName: owner.user.name,
    };
  }

  /**
   * KILL-SWITCH DA IMPERSONAÇÃO.
   *
   * Até o agente 29 não havia como encerrar uma impersonação em curso: ou o
   * próprio super admin clicava "sair" no banner, ou se esperava o token de
   * 900s expirar. Se a aba fosse fechada com a sessão viva — ou se a máquina
   * do super admin ficasse aberta na mesa — a sessão do OWNER seguia de pé sem
   * ninguém para encerrá-la.
   *
   * Revoga a `AuthSession` de impersonação, e não o login normal do OWNER: o
   * filtro é `impersonatedBy != null`. A revogação vale NA HORA, inclusive
   * para o access token já emitido — o `JwtAuthGuard` confere
   * `sessions.isActive(claims.sid)` a cada requisição.
   */
  async revokeImpersonations(
    id: string,
    actorUserId: string,
    request: RequestContext,
  ): Promise<{ revoked: number }> {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!tenant) {
      throw ApiException.notFound('Tenant não encontrado.');
    }

    const sessions = await this.prisma.authSession.findMany({
      where: { tenantId: id, impersonatedBy: { not: null }, revokedAt: null },
      select: { id: true, userId: true, impersonatedBy: true },
    });
    if (sessions.length === 0) {
      throw ApiException.conflict(
        'Não há impersonação em curso neste tenant.',
        'IMPERSONATION_NOT_ACTIVE',
      );
    }

    await this.prisma.authSession.updateMany({
      where: { id: { in: sessions.map((session) => session.id) } },
      data: { revokedAt: new Date(), revokedReason: 'impersonation-revoked' },
    });

    await this.audit.record(
      {
        action: AuditAction.ADMIN_IMPERSONATION_REVOKED,
        entity: 'Tenant',
        entityId: id,
        tenantId: id,
        actorUserId,
        metadata: {
          sessionIds: sessions.map((session) => session.id),
          impersonatedBy: sessions.map((session) => session.impersonatedBy),
        },
      },
      request,
    );

    return { revoked: sessions.length };
  }

  /**
   * Desfaz uma exclusão de conta AGENDADA (`Tenant.purgeAt`).
   *
   * O dono pode desistir sozinho entrando pelo próprio login (agente 27), mas
   * `/admin/tenants` filtra por `deletedAt` — que no agendamento é NULO —, então
   * a barbearia continuava na lista sem nenhum controle para limpar o `purgeAt`.
   * **Se o dono perdesse o acesso ao login dentro dos 30 dias, ninguém
   * desfazia e a `MaintenanceService` apagava.**
   *
   * Volta para `TRIAL`, e não para `ACTIVE`, pela mesma razão do caminho do
   * dono: a assinatura foi cancelada no gateway na hora do pedido e não se
   * ressuscita uma cobrança recorrente por conta própria.
   */
  async cancelScheduledDeletion(
    id: string,
    actorUserId: string,
    request: RequestContext,
  ): Promise<{ canceled: true }> {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, purgeAt: true },
    });
    if (!tenant) {
      throw ApiException.notFound('Tenant não encontrado.');
    }
    if (!tenant.purgeAt) {
      throw ApiException.conflict(
        'Não há exclusão agendada para esta conta.',
        'DELETION_NOT_SCHEDULED',
      );
    }

    await this.prisma.tenant.update({
      where: { id },
      data: { status: TenantStatus.TRIAL, purgeAt: null },
    });

    await this.audit.record(
      {
        action: AuditAction.ADMIN_TENANT_DELETION_CANCELED,
        entity: 'Tenant',
        entityId: id,
        tenantId: id,
        actorUserId,
        metadata: { purgeAt: tenant.purgeAt.toISOString() },
      },
      request,
    );

    return { canceled: true };
  }
}

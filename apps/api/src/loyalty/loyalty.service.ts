import { Inject, Injectable } from '@nestjs/common';
import { RaffleStatus, SubscriptionStatus } from '@prisma/client';
import type {
  ClientPlanAdminItem,
  CreateRaffleDto as CreateRaffleContract,
  LoyaltyClientBalance,
  LoyaltyProgramConfig,
  RaffleItem,
  SubscriberItem,
  UpdateLoyaltyProgramDto as UpdateLoyaltyProgramContract,
  UpsertClientPlanDto as UpsertClientPlanContract,
} from '@barbervp/types';
import { PrismaService } from '../prisma/prisma.service';
import { ApiException } from '../common/errors/api.exception';
import { AuditAction, AuditService } from '../audit/audit.service';
import type { RequestContext } from '../common/types/request-context';
import {
  NOTIFICATION_ADAPTER,
  type NotificationAdapter,
} from '../adapters/notification/notification.adapter';

const MAX_RAFFLE_NOTIFICATIONS = 100;

@Injectable()
export class LoyaltyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(NOTIFICATION_ADAPTER) private readonly notifications: NotificationAdapter,
  ) {}

  // ── Programa de pontos ───────────────────────────────────────────────────

  async programConfig(tenantId: string): Promise<LoyaltyProgramConfig> {
    const program = await this.prisma.loyaltyProgram.findUnique({ where: { tenantId } });
    return {
      active: program?.active ?? false,
      gastoPorPonto: program?.gastoPorPonto ?? 100,
      pontosParaDesconto: program?.pontosParaDesconto ?? 100,
      valorDesconto: program?.valorDesconto ?? 1_000,
      expiracaoMeses: program?.expiracaoMeses ?? null,
    };
  }

  async updateProgram(
    tenantId: string,
    dto: UpdateLoyaltyProgramContract,
    actorUserId: string,
    request: RequestContext,
  ): Promise<LoyaltyProgramConfig> {
    const program = await this.prisma.loyaltyProgram.upsert({
      where: { tenantId },
      update: {
        active: dto.active,
        gastoPorPonto: dto.gastoPorPonto,
        pontosParaDesconto: dto.pontosParaDesconto,
        valorDesconto: dto.valorDesconto,
        expiracaoMeses: dto.expiracaoMeses,
      },
      create: {
        tenantId,
        active: dto.active ?? false,
        gastoPorPonto: dto.gastoPorPonto ?? 100,
        pontosParaDesconto: dto.pontosParaDesconto ?? 100,
        valorDesconto: dto.valorDesconto ?? 1_000,
        expiracaoMeses: dto.expiracaoMeses ?? null,
      },
    });

    await this.audit.record(
      { action: AuditAction.LOYALTY_PROGRAM_UPDATED, entity: 'LoyaltyProgram', entityId: program.id, tenantId, actorUserId },
      request,
    );

    return {
      active: program.active,
      gastoPorPonto: program.gastoPorPonto,
      pontosParaDesconto: program.pontosParaDesconto,
      valorDesconto: program.valorDesconto,
      expiracaoMeses: program.expiracaoMeses,
    };
  }

  async clientBalances(tenantId: string): Promise<LoyaltyClientBalance[]> {
    const grouped = await this.prisma.loyaltyPoints.groupBy({
      by: ['clientId'],
      where: { tenantId },
      _sum: { points: true },
      orderBy: { _sum: { points: 'desc' } },
      take: 200,
    });

    const clientIds = grouped.map((row) => row.clientId);
    if (clientIds.length === 0) {
      return [];
    }

    const [clients, lastEarned, lastRedeemed] = await Promise.all([
      this.prisma.client.findMany({ where: { id: { in: clientIds } }, select: { id: true, name: true } }),
      this.prisma.loyaltyPoints.groupBy({
        by: ['clientId'],
        where: { tenantId, clientId: { in: clientIds }, kind: 'EARN' },
        _max: { createdAt: true },
      }),
      this.prisma.loyaltyPoints.groupBy({
        by: ['clientId'],
        where: { tenantId, clientId: { in: clientIds }, kind: 'REDEEM' },
        _max: { createdAt: true },
      }),
    ]);

    const nameOf = new Map(clients.map((client) => [client.id, client.name]));
    const earnedMap = new Map(lastEarned.map((row) => [row.clientId, row._max.createdAt]));
    const redeemedMap = new Map(lastRedeemed.map((row) => [row.clientId, row._max.createdAt]));

    return grouped.map((row) => ({
      clientId: row.clientId,
      name: nameOf.get(row.clientId) ?? 'Cliente',
      balance: row._sum.points ?? 0,
      lastEarnedAt: earnedMap.get(row.clientId)?.toISOString() ?? null,
      lastRedeemedAt: redeemedMap.get(row.clientId)?.toISOString() ?? null,
    }));
  }

  // ── Sorteios ─────────────────────────────────────────────────────────────

  async listRaffles(tenantId: string): Promise<RaffleItem[]> {
    const raffles = await this.prisma.loyaltyRaffle.findMany({
      where: { tenantId },
      include: { entries: true, winner: { select: { name: true } } },
      orderBy: { startsAt: 'desc' },
    });

    return raffles.map((raffle) => ({
      id: raffle.id,
      name: raffle.name,
      description: raffle.description,
      prize: raffle.prize,
      status: raffle.status,
      pointsPerEntry: raffle.pointsPerEntry,
      startsAt: raffle.startsAt.toISOString(),
      endsAt: raffle.endsAt.toISOString(),
      participants: raffle.entries.length,
      winnerClientId: raffle.winnerClientId,
      winnerName: raffle.winner?.name ?? null,
      drawnAt: raffle.drawnAt?.toISOString() ?? null,
    }));
  }

  async createRaffle(
    tenantId: string,
    dto: CreateRaffleContract,
    actorUserId: string,
    request: RequestContext,
  ): Promise<RaffleItem> {
    const raffle = await this.prisma.loyaltyRaffle.create({
      data: {
        tenantId,
        name: dto.name,
        description: dto.description ?? null,
        prize: dto.prize,
        status: RaffleStatus.ACTIVE,
        pointsPerEntry: dto.pointsPerEntry ?? 10,
        startsAt: new Date(),
        endsAt: new Date(dto.endsAt),
      },
    });

    await this.audit.record(
      { action: AuditAction.RAFFLE_CREATED, entity: 'LoyaltyRaffle', entityId: raffle.id, tenantId, actorUserId },
      request,
    );

    if (dto.notifyWhatsapp ?? true) {
      await this.announceRaffle(tenantId, raffle.name, raffle.prize);
    }

    return {
      id: raffle.id,
      name: raffle.name,
      description: raffle.description,
      prize: raffle.prize,
      status: raffle.status,
      pointsPerEntry: raffle.pointsPerEntry,
      startsAt: raffle.startsAt.toISOString(),
      endsAt: raffle.endsAt.toISOString(),
      participants: 0,
      winnerClientId: null,
      winnerName: null,
      drawnAt: null,
    };
  }

  /** Aviso de novo sorteio via WhatsApp — para clientes com histórico de pontos (participantes prováveis). */
  private async announceRaffle(tenantId: string, raffleName: string, prize: string): Promise<void> {
    const participants = await this.prisma.loyaltyPoints.groupBy({
      by: ['clientId'],
      where: { tenantId },
      orderBy: { clientId: 'asc' },
      take: MAX_RAFFLE_NOTIFICATIONS,
    });
    if (participants.length === 0) {
      return;
    }
    const clients = await this.prisma.client.findMany({
      where: { id: { in: participants.map((p) => p.clientId) }, notifyWhatsapp: true },
      select: { name: true, phone: true },
    });

    await Promise.all(
      clients.map((client) =>
        this.notifications.send({
          tenantId,
          recipient: client.phone,
          templateKey: 'raffle_announcement',
          body: `🎉 ${client.name.split(' ')[0]}, participe do sorteio "${raffleName}"! Prêmio: ${prize}. A cada visita você ganha cupons.`,
        }),
      ),
    );
  }

  async drawRaffle(tenantId: string, id: string, actorUserId: string, request: RequestContext): Promise<RaffleItem> {
    const raffle = await this.prisma.loyaltyRaffle.findFirst({
      where: { id, tenantId },
      include: { entries: true },
    });
    if (!raffle) {
      throw ApiException.notFound('Sorteio não encontrado.');
    }
    if (raffle.status !== RaffleStatus.ACTIVE) {
      throw ApiException.conflict('Este sorteio já foi encerrado.', 'RAFFLE_NOT_ACTIVE');
    }
    if (raffle.entries.length === 0) {
      throw ApiException.badRequest('Não há participantes para sortear.');
    }

    // Sorteio ponderado — cada cupom (`entries`) é uma chance.
    const pool = raffle.entries.flatMap((entry) => Array<string>(entry.entries).fill(entry.clientId));
    const winnerClientId = pool[Math.floor(Math.random() * pool.length)]!;

    const updated = await this.prisma.loyaltyRaffle.update({
      where: { id },
      data: { status: RaffleStatus.FINISHED, winnerClientId, drawnAt: new Date() },
      include: { entries: true, winner: { select: { name: true } } },
    });

    await this.audit.record(
      {
        action: AuditAction.RAFFLE_DRAWN,
        entity: 'LoyaltyRaffle',
        entityId: id,
        tenantId,
        actorUserId,
        metadata: { winnerClientId },
      },
      request,
    );

    return {
      id: updated.id,
      name: updated.name,
      description: updated.description,
      prize: updated.prize,
      status: updated.status,
      pointsPerEntry: updated.pointsPerEntry,
      startsAt: updated.startsAt.toISOString(),
      endsAt: updated.endsAt.toISOString(),
      participants: updated.entries.length,
      winnerClientId: updated.winnerClientId,
      winnerName: updated.winner?.name ?? null,
      drawnAt: updated.drawnAt?.toISOString() ?? null,
    };
  }

  // ── Planos de assinatura (lado da barbearia) ────────────────────────────

  async listPlans(tenantId: string): Promise<ClientPlanAdminItem[]> {
    const plans = await this.prisma.clientPlan.findMany({
      where: { tenantId, deletedAt: null },
      include: {
        items: { include: { service: { select: { name: true } } } },
        _count: { select: { subscriptions: { where: { status: { not: SubscriptionStatus.CANCELED } } } } },
      },
      orderBy: { sortOrder: 'asc' },
    });

    return plans.map((plan) => ({
      id: plan.id,
      name: plan.name,
      description: plan.description,
      priceCents: plan.priceCents,
      billingDay: plan.billingDay,
      isPopular: plan.isPopular,
      active: plan.active,
      items: plan.items.map((item) => ({
        serviceId: item.serviceId,
        serviceName: item.service.name,
        quota: item.quota,
      })),
      subscriberCount: plan._count.subscriptions,
    }));
  }

  async upsertPlan(
    tenantId: string,
    id: string | undefined,
    dto: UpsertClientPlanContract,
    actorUserId: string,
    request: RequestContext,
  ): Promise<ClientPlanAdminItem> {
    if (id) {
      const existing = await this.prisma.clientPlan.findFirst({ where: { id, tenantId }, select: { id: true } });
      if (!existing) {
        throw ApiException.notFound('Plano não encontrado.');
      }
    }

    const serviceIds = dto.items.map((item) => item.serviceId);
    const count = await this.prisma.service.count({ where: { id: { in: serviceIds }, tenantId } });
    if (count !== new Set(serviceIds).size) {
      throw ApiException.badRequest('Um ou mais serviços não pertencem a esta barbearia.');
    }

    const saved = await this.prisma.$transaction(async (tx) => {
      const plan = id
        ? await tx.clientPlan.update({
            where: { id },
            data: {
              name: dto.name,
              description: dto.description ?? null,
              priceCents: dto.priceCents,
              billingDay: dto.billingDay ?? 5,
              isPopular: dto.isPopular ?? false,
              items: { deleteMany: {} },
            },
          })
        : await tx.clientPlan.create({
            data: {
              tenantId,
              name: dto.name,
              description: dto.description ?? null,
              priceCents: dto.priceCents,
              billingDay: dto.billingDay ?? 5,
              isPopular: dto.isPopular ?? false,
            },
          });

      await tx.clientPlanItem.createMany({
        data: dto.items.map((item) => ({
          tenantId,
          planId: plan.id,
          serviceId: item.serviceId,
          quota: item.quota,
        })),
      });

      return plan;
    });

    await this.audit.record(
      { action: AuditAction.CLIENT_PLAN_UPSERTED, entity: 'ClientPlan', entityId: saved.id, tenantId, actorUserId },
      request,
    );

    const [full] = await this.listPlans(tenantId).then((plans) => plans.filter((plan) => plan.id === saved.id));
    return full!;
  }

  async archivePlan(tenantId: string, id: string, actorUserId: string, request: RequestContext): Promise<void> {
    const existing = await this.prisma.clientPlan.findFirst({ where: { id, tenantId }, select: { id: true } });
    if (!existing) {
      throw ApiException.notFound('Plano não encontrado.');
    }
    await this.prisma.clientPlan.update({ where: { id }, data: { active: false } });

    await this.audit.record(
      { action: AuditAction.CLIENT_PLAN_ARCHIVED, entity: 'ClientPlan', entityId: id, tenantId, actorUserId },
      request,
    );
  }

  async subscribers(tenantId: string): Promise<SubscriberItem[]> {
    const subs = await this.prisma.clientSubscription.findMany({
      where: { tenantId, status: { not: SubscriptionStatus.CANCELED } },
      include: {
        client: { select: { name: true } },
        plan: { select: { name: true } },
        usages: { include: { service: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return subs.map((sub) => ({
      subscriptionId: sub.id,
      clientId: sub.clientId,
      clientName: sub.client.name,
      planName: sub.plan.name,
      status: sub.status,
      usages: sub.usages.map((usage) => ({
        serviceName: usage.service.name,
        used: usage.used,
        quota: usage.quota,
      })),
      nextChargeAt: sub.nextChargeAt?.toISOString() ?? null,
    }));
  }
}

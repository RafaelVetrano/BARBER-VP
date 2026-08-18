import { Injectable } from '@nestjs/common';
import { CommissionEntryStatus, Prisma } from '@prisma/client';
import type {
  ClosePeriodDto as ClosePeriodContract,
  CommissionBarberSummary,
  CommissionPeriodResponse,
  CommissionRuleItem,
  CreateValeDto as CreateValeContract,
  UpsertCommissionRuleDto as UpsertCommissionRuleContract,
  ValeItem,
} from '@barbervp/types';
import { PrismaService } from '../prisma/prisma.service';
import { ApiException } from '../common/errors/api.exception';
import { AuditAction, AuditService } from '../audit/audit.service';
import type { RequestContext } from '../common/types/request-context';
import type { StaffScope } from '../staff-agenda/staff-scope.service';
import { pickTierPercent } from './commission-calc.service';

@Injectable()
export class CommissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── Regras ───────────────────────────────────────────────────────────────

  async listRules(tenantId: string): Promise<CommissionRuleItem[]> {
    const rules = await this.prisma.commissionRule.findMany({
      where: { tenantId },
      include: { tiers: { orderBy: { sortOrder: 'asc' } }, barbers: { select: { id: true } } },
      orderBy: { name: 'asc' },
    });
    return rules.map(toRuleItem);
  }

  async upsertRule(
    tenantId: string,
    id: string | undefined,
    dto: UpsertCommissionRuleContract,
    actorUserId: string,
    request: RequestContext,
  ): Promise<CommissionRuleItem> {
    const barberIds = dto.barberIds ?? [];
    if (barberIds.length > 0) {
      const count = await this.prisma.barber.count({ where: { id: { in: barberIds }, tenantId } });
      if (count !== barberIds.length) {
        throw ApiException.badRequest('Um ou mais barbeiros não pertencem a esta barbearia.');
      }
    }

    if (id) {
      const existing = await this.prisma.commissionRule.findFirst({ where: { id, tenantId }, select: { id: true } });
      if (!existing) {
        throw ApiException.notFound('Regra de comissão não encontrada.');
      }
    }

    const rule = await this.prisma.$transaction(async (tx) => {
      const saved = id
        ? await tx.commissionRule.update({
            where: { id },
            data: {
              name: dto.name,
              type: dto.type,
              percentBps: dto.type === 'FIXED' ? (dto.percentBps ?? 0) : null,
              tiers: { deleteMany: {} },
            },
          })
        : await tx.commissionRule.create({
            data: {
              tenantId,
              name: dto.name,
              type: dto.type,
              percentBps: dto.type === 'FIXED' ? (dto.percentBps ?? 0) : null,
            },
          });

      if (dto.type === 'TIERED' && dto.tiers && dto.tiers.length > 0) {
        await tx.commissionTier.createMany({
          data: dto.tiers.map((tier, index) => ({
            tenantId,
            ruleId: saved.id,
            upToCents: tier.upToCents,
            percentBps: tier.percentBps,
            sortOrder: index,
          })),
        });
      }

      await tx.barber.updateMany({
        where: { tenantId, commissionRuleId: saved.id },
        data: { commissionRuleId: null },
      });
      if (barberIds.length > 0) {
        await tx.barber.updateMany({
          where: { tenantId, id: { in: barberIds } },
          data: { commissionRuleId: saved.id },
        });
      }

      return saved;
    });

    await this.audit.record(
      {
        action: AuditAction.COMMISSION_RULE_UPSERTED,
        entity: 'CommissionRule',
        entityId: rule.id,
        tenantId,
        actorUserId,
      },
      request,
    );

    const full = await this.prisma.commissionRule.findUniqueOrThrow({
      where: { id: rule.id },
      include: { tiers: { orderBy: { sortOrder: 'asc' } }, barbers: { select: { id: true } } },
    });
    return toRuleItem(full);
  }

  // ── Extrato do período ──────────────────────────────────────────────────

  async period(tenantId: string, month: string, scope: StaffScope): Promise<CommissionPeriodResponse> {
    const referenceMonth = parseMonth(month);

    const barbers = await this.prisma.barber.findMany({
      where: {
        tenantId,
        active: true,
        ...(scope.forcedBarberId ? { id: scope.forcedBarberId } : {}),
      },
      select: {
        id: true,
        name: true,
        commissionRule: { select: { name: true } },
      },
      orderBy: { name: 'asc' },
    });

    const summaries: CommissionBarberSummary[] = [];
    // O período só está fechado quando TODO barbeiro com lançamento está
    // fechado. Com `some`, um barbeiro fechado marcaria o mês inteiro como
    // fechado e o botão "Fechar período" sumiria da tela — deixando os demais
    // travados em PENDING para sempre.
    let allClosed = true;
    let anyEntry = false;

    for (const barber of barbers) {
      const entries = await this.prisma.commissionEntry.findMany({
        where: { tenantId, barberId: barber.id, referenceMonth },
        include: {
          order: { select: { closedAt: true, client: { select: { name: true } }, guestName: true } },
          orderItem: { select: { description: true } },
        },
        orderBy: { createdAt: 'asc' },
      });

      const produtos = await this.prisma.orderItem.aggregate({
        where: {
          tenantId,
          barberId: barber.id,
          kind: 'PRODUCT',
          order: { status: 'CLOSED', closedAt: { gte: referenceMonth, lt: nextMonth(referenceMonth) } },
        },
        _sum: { totalCents: true },
      });

      const vales = await this.prisma.vale.aggregate({
        where: { tenantId, barberId: barber.id, referenceMonth, settledAt: null },
        _sum: { amountCents: true },
      });

      const faturadoServicosCents = entries.reduce((sum, entry) => sum + entry.baseCents, 0);
      const comissaoCents = entries.reduce((sum, entry) => sum + entry.amountCents, 0);
      const valeCents = vales._sum.amountCents ?? 0;
      const closed = entries.length > 0 && entries.every((entry) => entry.status === CommissionEntryStatus.PAID);
      if (entries.length > 0) {
        anyEntry = true;
        allClosed = allClosed && closed;
      }

      summaries.push({
        barberId: barber.id,
        barberName: barber.name,
        ruleName: barber.commissionRule?.name ?? null,
        faturadoServicosCents,
        faturadoProdutosCents: produtos._sum.totalCents ?? 0,
        valeCents,
        comissaoCents,
        totalCents: Math.max(0, comissaoCents - valeCents),
        atendimentos: entries.length,
        status: closed ? 'PAID' : 'PENDING',
        extrato: entries.map((entry) => ({
          date: entry.createdAt.toISOString(),
          clientName: entry.order?.client?.name ?? entry.order?.guestName ?? 'Cliente avulso',
          serviceName: entry.orderItem?.description ?? '—',
          amountCents: entry.baseCents,
        })),
      });
    }

    return {
      month,
      closed: anyEntry ? allClosed : false,
      barbers: summaries,
    };
  }

  /** "Fechar período" — recalcula a taxa definitiva pelo faturamento TOTAL do mês e trava (`status: PAID`). */
  async closePeriod(
    tenantId: string,
    dto: ClosePeriodContract,
    actorUserId: string,
    request: RequestContext,
  ): Promise<CommissionPeriodResponse> {
    const referenceMonth = parseMonth(dto.month);

    const barbers = await this.prisma.barber.findMany({
      where: { tenantId, active: true },
      select: {
        id: true,
        commissionRule: {
          select: {
            type: true,
            percentBps: true,
            tiers: { select: { upToCents: true, percentBps: true, sortOrder: true } },
          },
        },
      },
    });

    await this.prisma.$transaction(async (tx) => {
      for (const barber of barbers) {
        const entries = await tx.commissionEntry.findMany({
          where: { tenantId, barberId: barber.id, referenceMonth, status: CommissionEntryStatus.PENDING },
        });
        if (entries.length === 0) {
          continue;
        }

        const totalBaseCents = entries.reduce((sum, entry) => sum + entry.baseCents, 0);
        const finalPercentBps = barber.commissionRule
          ? pickTierPercent(barber.commissionRule, totalBaseCents)
          : 0;

        for (const entry of entries) {
          await tx.commissionEntry.update({
            where: { id: entry.id },
            data: {
              percentBps: finalPercentBps,
              amountCents: Math.round((entry.baseCents * finalPercentBps) / 10_000),
              status: CommissionEntryStatus.PAID,
              paidAt: new Date(),
            },
          });
        }

        await tx.vale.updateMany({
          where: { tenantId, barberId: barber.id, referenceMonth, settledAt: null },
          data: { settledAt: new Date() },
        });
      }
    });

    await this.audit.record(
      {
        action: AuditAction.COMMISSION_PERIOD_CLOSED,
        entity: 'CommissionEntry',
        tenantId,
        actorUserId,
        metadata: { month: dto.month },
      },
      request,
    );

    return this.period(tenantId, dto.month, { forcedBarberId: null });
  }

  // ── Vales ────────────────────────────────────────────────────────────────

  async listVales(tenantId: string, scope: StaffScope): Promise<ValeItem[]> {
    const vales = await this.prisma.vale.findMany({
      where: { tenantId, ...(scope.forcedBarberId ? { barberId: scope.forcedBarberId } : {}) },
      include: { barber: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return vales.map((vale) => ({
      id: vale.id,
      barberId: vale.barberId,
      barberName: vale.barber.name,
      amountCents: vale.amountCents,
      referenceMonth: vale.referenceMonth.toISOString().slice(0, 7),
      description: vale.description,
      settled: vale.settledAt !== null,
    }));
  }

  async createVale(
    tenantId: string,
    dto: CreateValeContract,
    actorUserId: string,
    request: RequestContext,
  ): Promise<ValeItem> {
    const barber = await this.prisma.barber.findFirst({
      where: { id: dto.barberId, tenantId },
      select: { id: true, name: true },
    });
    if (!barber) {
      throw ApiException.notFound('Barbeiro não encontrado.');
    }

    const date = new Date(`${dto.date}T00:00:00.000Z`);
    const referenceMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));

    const vale = await this.prisma.vale.create({
      data: {
        tenantId,
        barberId: dto.barberId,
        amountCents: dto.amountCents,
        referenceMonth,
        description: dto.description ?? null,
      },
    });

    await this.audit.record(
      {
        action: AuditAction.VALE_CREATED,
        entity: 'Vale',
        entityId: vale.id,
        tenantId,
        actorUserId,
        metadata: { barberId: dto.barberId, amountCents: dto.amountCents },
      },
      request,
    );

    return {
      id: vale.id,
      barberId: vale.barberId,
      barberName: barber.name,
      amountCents: vale.amountCents,
      referenceMonth: vale.referenceMonth.toISOString().slice(0, 7),
      description: vale.description,
      settled: false,
    };
  }
}

function parseMonth(month: string): Date {
  const [year, mm] = month.split('-').map(Number);
  if (!year || !mm || mm < 1 || mm > 12) {
    throw ApiException.badRequest('Mês inválido — use o formato YYYY-MM.');
  }
  return new Date(Date.UTC(year, mm - 1, 1));
}

function nextMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
}

type RuleRow = Prisma.CommissionRuleGetPayload<{
  include: { tiers: true; barbers: { select: { id: true } } };
}>;

function toRuleItem(rule: RuleRow): CommissionRuleItem {
  return {
    id: rule.id,
    name: rule.name,
    type: rule.type,
    percentBps: rule.percentBps,
    tiers: rule.tiers
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((tier) => ({ upToCents: tier.upToCents, percentBps: tier.percentBps })),
    active: rule.active,
    barberIds: rule.barbers.map((barber) => barber.id),
  };
}
